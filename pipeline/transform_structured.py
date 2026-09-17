"""Transform: parse DOSM / data.gov.my raw files into clean Parquet tables.

DOSM tourism sheets are print-formatted (bilingual merged headers, footnotes,
misaligned total rows). Rules used throughout:
  * rows are located by label text, never by fixed row number;
  * state rows are recognised via pipeline.states.to_code;
  * the sheet's own total row is never read - totals are recomputed.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

import openpyxl
import pandas as pd

from pipeline.states import CODES, STATES, to_code

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
CLEAN = ROOT / "data" / "clean"


# ---------------------------------------------------------------- helpers
@lru_cache(maxsize=None)
def _workbook(path: Path) -> dict[str, list[list]]:
    """Open each workbook once (state files take seconds to open) and keep every sheet."""
    # read_only + max_col: some DOSM sheets claim 16k columns and take minutes otherwise
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    out = {}
    for ws in wb.worksheets:
        grid = [list(r) for r in ws.iter_rows(values_only=True, max_col=45, max_row=120)]
        width = max((len(r) for r in grid), default=0)
        out[ws.title] = [r + [None] * (width - len(r)) for r in grid]
    wb.close()
    return out


def _grid(path: Path, sheet: str) -> list[list]:
    return _workbook(path)[sheet]


def _num(v) -> float | None:
    """DOSM stores some numbers as text ('14274', '-', '2,506')."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(",", "").replace("\xa0", "")
    if s in {"", "-", "–", "n.a", "n.a.", ".."}:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _txt(v) -> str:
    return re.sub(r"\s+", " ", str(v).replace("\xa0", " ")).strip() if v is not None else ""


def _find_row(grid, pattern: str, col: int | None = None, start: int = 0) -> int:
    rx = re.compile(pattern, re.I)
    for i in range(start, len(grid)):
        cells = grid[i] if col is None else [grid[i][col] if col < len(grid[i]) else None]
        if any(c is not None and rx.search(_txt(c)) for c in cells):
            return i
    raise LookupError(f"row matching {pattern!r} not found")


def _year_cols(row) -> dict[int, int]:
    out = {}
    for j, v in enumerate(row):
        n = _num(v)
        if n and 2000 <= n <= 2100 and float(n).is_integer():
            out[j] = int(n)
    return out


# ---------------------------------------------------------------- national workbooks
def visitors_by_state() -> pd.DataFrame:
    """Table 9 of the 2025 (2018-2025) and 2024 (2017-2024) national workbooks."""
    frames = []
    for fname in ["tourism_domestic_2025.xlsx", "tourism_domestic_2024.xlsx"]:
        g = _grid(RAW / "dosm" / fname, "9")
        hdr = next(i for i, r in enumerate(g) if len(_year_cols(r)) >= 5)
        years = _year_cols(g[hdr])
        for r in g[hdr + 1:]:
            code = to_code(r[0])
            if not code:
                continue
            for j, y in years.items():
                v = _num(r[j])
                if v is not None:
                    frames.append({"code": code, "year": y, "visitors_k": v, "src": fname})
    df = pd.DataFrame(frames)
    # prefer the newest publication where years overlap (revised figures)
    df = df.sort_values("src", ascending=False).drop_duplicates(["code", "year"])
    return df.drop(columns="src").sort_values(["code", "year"]).reset_index(drop=True)


def od_matrix() -> pd.DataFrame:
    """Table 10: tourists (overnight visitors) by state of origin x state visited."""
    rows = []
    sources = [
        (RAW / "dosm" / "tourism_domestic_2025.xlsx", "10", 2025),
        (RAW / "dosm" / "tourism_domestic_2024.xlsx", "10", 2024),
        (RAW / "dosm" / "state" / "tourism_domestic_2023_johor.xlsx", "Jadual 10", 2023),
    ]
    for path, sheet, year in sources:
        g = _grid(path, sheet)
        hdr = next(i for i, r in enumerate(g) if sum(to_code(c) is not None for c in r) >= 10)
        dest_cols = {j: to_code(c) for j, c in enumerate(g[hdr]) if to_code(c)}
        for r in g[hdr + 1:]:
            label_col = next((j for j, c in enumerate(r[:4]) if to_code(c)), None)
            if label_col is None:
                continue
            origin = to_code(r[label_col])
            vals = {d: _num(r[j]) for j, d in dest_cols.items()}
            if sum(v is not None for v in vals.values()) < 10:
                continue  # stray scratch cells below the table
            for d, v in vals.items():
                rows.append({"year": year, "origin": origin, "dest": d, "tourists_k": v or 0.0})
    df = pd.DataFrame(rows).drop_duplicates(["year", "origin", "dest"])
    return df.sort_values(["year", "origin", "dest"]).reset_index(drop=True)


def national_key_stats() -> pd.DataFrame:
    g = _grid(RAW / "dosm" / "tourism_domestic_2025.xlsx", "1")
    hdr = next(i for i, r in enumerate(g) if len(_year_cols(r)) >= 5)
    years = _year_cols(g[hdr])
    want = {
        "expenditure_total_rm_m": r"^Perbelanjaan Pelancongan",
        "expenditure_visitors_rm_m": r"^Pelawat Domestik \(RM",
        "visitors_k": r"^Pelawat Domestik \(.000\)",
        "trips_k": r"^Perjalanan Pelancongan \(.000\)",
        "avg_length_of_stay": r"^Purata Bilangan Hari Menginap",
        "spend_per_trip_rm": r"^Purata Perbelanjaan per Perjalanan",
    }
    out = {y: {"year": y} for y in years.values()}
    for key, pat in want.items():
        i = _find_row(g, pat, col=0)
        for j, y in years.items():
            out[y][key] = _num(g[i][j])
    g2 = _grid(RAW / "dosm" / "tourism_domestic_2025.xlsx", "2 & 3")
    hdr2 = _find_row(g2, r"^Jenis Pelawat")
    ycols = _year_cols(g2[hdr2])  # year label sits over the % column; ('000) total is +1
    for label, key in [(r"Pelawat Harian", "excursionists_k"), (r"Pelancong/ Tourists", "tourists_k")]:
        i = _find_row(g2, label, start=hdr2)
        for j, y in ycols.items():
            out[y][key] = _num(g2[i][j + 1])
    return pd.DataFrame(out.values()).sort_values("year").reset_index(drop=True)


def top_destinations_2025() -> pd.DataFrame:
    rows = []
    for sheet, kind in [("8A", "destination"), ("8B", "district")]:
        g = _grid(RAW / "dosm" / "tourism_domestic_2025.xlsx", sheet)
        for r in g:
            for j, c in enumerate(r):
                if c is None:
                    continue
                parts = [p for p in (_txt(x) for x in str(c).split("\n")) if p]
                if len(parts) == 1 and to_code(parts[0]) and j + 1 < len(r) and r[j + 1]:
                    names = [p for p in (_txt(x) for x in str(r[j + 1]).split("\n")) if p]
                    for k, n in enumerate(names, 1):
                        rows.append({"code": to_code(parts[0]), "year": 2025, "kind": kind,
                                     "rank": k, "name": re.sub(r"^\d+\.\s*", "", n)})
    return pd.DataFrame(rows).drop_duplicates(["code", "kind", "rank"])


# ---------------------------------------------------------------- per-state workbooks
def _state_file(slug: str) -> Path:
    return RAW / "dosm" / "state" / f"tourism_domestic_2023_{slug}.xlsx"


def state_key_stats() -> pd.DataFrame:
    """Jadual 1 of each state workbook: 2017-2023 receipts, visitors, trips, spend, LOS."""
    want = {
        "receipts_rm_m": r"^Jumlah Terimaan",
        "visitors_k": r"^Pelawat Domestik",
        "trips_k": r"^Perjalanan Pelancongan Domestik",
        "spend_per_visitor_rm": r"^Purata Terimaan per Kapita",
        "spend_per_trip_rm": r"^Purata Terimaan per Perjalanan",
        "avg_length_of_stay": r"^Purata Bilangan Hari Menginap",
    }
    rows = []
    for code, slug in zip(STATES["code"], STATES["dosm_slug"]):
        g = _grid(_state_file(slug), "Jadual 1")
        hdr = next(i for i, r in enumerate(g) if len(_year_cols(r)) >= 5)
        years = _year_cols(g[hdr])
        rec = {y: {"code": code, "year": y} for y in years.values()}
        for key, pat in want.items():
            i = _find_row(g, pat, col=0)
            for j, y in years.items():
                rec[y][key] = _num(g[i][j])
        rows += rec.values()
    return pd.DataFrame(rows).sort_values(["code", "year"]).reset_index(drop=True)


def _two_year_value(g, pattern: str, start: int, offset: int) -> dict[int, float | None]:
    """For '2022 | 2023' blocks: the year label sits over the first sub-column."""
    hdr = next(i for i in range(start, len(g)) if len(_year_cols(g[i])) == 2)
    ycols = _year_cols(g[hdr])
    i = _find_row(g, pattern, col=0, start=hdr)
    return {y: _num(g[i][j + offset]) for j, y in ycols.items()}


def state_detail() -> pd.DataFrame:
    """2022 & 2023 detail per state: visitor type, receipts split, nights, hotels, modes."""
    rows = []
    for code, slug in zip(STATES["code"], STATES["dosm_slug"]):
        p = _state_file(slug)
        rec = {y: {"code": code, "year": y} for y in (2022, 2023)}

        g = _grid(p, "Jadual 2 & 3")
        t2 = _find_row(g, r"^Jadual 2")
        for key, pat in [("excursionists_k", r"^Pelawat Harian"), ("tourists_k", r"^Pelancong")]:
            for y, v in _two_year_value(g, pat, t2, 1).items():
                rec[y][key] = v
        t3 = _find_row(g, r"^Jadual 3")
        for key, pat in [("sameday_trips_k", r"^Perjalanan Harian"), ("overnight_trips_k", r"^Perjalanan Bermalam")]:
            for y, v in _two_year_value(g, pat, t3, 1).items():
                rec[y][key] = v

        g = _grid(p, "Jadual 4-6")
        t4 = _find_row(g, r"^Jadual 4")
        for key, pat in [("sameday_receipts_rm_m", r"^Terimaan Harian"), ("overnight_receipts_rm_m", r"^Terimaan Bermalam")]:
            for y, v in _two_year_value(g, pat, t4, 1).items():
                rec[y][key] = v
        for key, pat in [("spend_per_sameday_trip_rm", r"^Purata Terimaan Harian"), ("spend_per_overnight_trip_rm", r"^Purata Terimaan Bermalam")]:
            for y, v in _two_year_value(g, pat, t4, 1).items():
                rec[y][key] = v
        t6 = _find_row(g, r"^Jadual 6")
        for y, v in _two_year_value(g, r"^Bilangan Malam", t6, 0).items():
            rec[y]["nights_k"] = v

        g = _grid(p, "Jadual 11 & 12")
        t11 = _find_row(g, r"^Jadual 11")
        hdr = next(i for i in range(t11, len(g)) if len(_year_cols(g[i])) == 2)
        ycols = _year_cols(g[hdr])  # visitors column is the year column itself
        for key, pat in [("mode_air_pct", r"^Udara"), ("mode_water_pct", r"^Air/"), ("mode_land_pct", r"^Darat"),
                         ("mode_private_vehicle_pct", r"^Kenderaan persendirian"), ("mode_bus_pct", r"^Bas"),
                         ("mode_train_pct", r"^Kereta api")]:
            try:
                i = _find_row(g, pat, col=0, start=hdr)
            except LookupError:
                continue
            for j, y in ycols.items():
                rec[y][key] = _num(g[i][j]) or 0.0
        t12 = _find_row(g, r"^Jadual 12")
        hdr = next(i for i in range(t12, len(g)) if len(_year_cols(g[i])) == 2)
        ycols = _year_cols(g[hdr])
        for key, pat in [("stay_relatives_pct", r"^Rumah saudara"), ("stay_hotel_pct", r"^Hotel"),
                         ("stay_chalet_pct", r"^Chalet"), ("stay_apartment_pct", r"^Apartmen"),
                         ("stay_homestay_pct", r"^Inap desa"), ("stay_resthouse_pct", r"^Rumah rehat")]:
            try:
                i = _find_row(g, pat, col=0, start=hdr)
            except LookupError:
                continue
            for j, y in ycols.items():
                rec[y][key] = _num(g[i][j]) or 0.0

        # Jadual 14 & 15 (NAPIC hotel stock) is 2023 only
        g = _grid(p, "Jadual 14 & 15")
        t14 = _find_row(g, r"^Jadual 14")
        tot = _find_row(g, r"^Jumlah", col=0, start=t14)
        nums = [n for n in (_num(c) for c in g[tot]) if n is not None]
        rec[2023]["hotels_napic"], rec[2023]["rooms_napic"] = nums[0], nums[1]
        t15 = _find_row(g, r"^Jadual 15")
        for key, pat in [("rooms_city", r"^Bandar"), ("rooms_beach", r"^Pantai"), ("rooms_hill", r"^Gunung")]:
            try:
                i = _find_row(g, pat, col=0, start=t15)
                n = [x for x in (_num(c) for c in g[i][1:]) if x is not None]
                rec[2023][key] = n[1] if len(n) > 1 else 0.0
            except LookupError:
                rec[2023][key] = 0.0
        rows += rec.values()
    return pd.DataFrame(rows).sort_values(["code", "year"]).reset_index(drop=True)


def state_top_places_2023() -> pd.DataFrame:
    rows = []
    for code, slug in zip(STATES["code"], STATES["dosm_slug"]):
        g = _grid(_state_file(slug), "Jadual 9")
        hdr = next((i for i, r in enumerate(g) if len([c for c in r if _num(c) in (2022.0, 2023.0)]) >= 2), None)
        if hdr is None:
            continue
        cols = [j for j, c in enumerate(g[hdr]) if _num(c) == 2023.0]
        k = 0
        for r in g[hdr + 1:]:
            if cols[0] < len(r) and r[cols[0]] and not re.match(r"^(Nota|Note|Sumber|Source)", _txt(r[cols[0]])):
                k += 1
                rows.append({"code": code, "year": 2023, "kind": "destination", "rank": k, "name": _txt(r[cols[0]])})
            if k == 5:
                break
    return pd.DataFrame(rows)


# ---------------------------------------------------------------- data.gov.my
def _dgm(name: str) -> pd.DataFrame:
    df = pd.read_parquet(RAW / "datagovmy" / f"{name}.parquet")
    df["year"] = pd.to_datetime(df["date"]).dt.year
    if "state" in df:
        df["code"] = df["state"].map(to_code)
    return df


def population() -> pd.DataFrame:
    df = _dgm("population_state")
    df = df[(df.sex == "both") & (df.age == "overall") & (df.ethnicity == "overall") & df.code.notna()]
    df = df[df.year >= 2015]  # the three federal territories are not separately reported in early years
    df = df[["code", "year", "population"]].rename(columns={"population": "population_k"})
    return df.sort_values(["code", "year"]).reset_index(drop=True)


def socioeconomic() -> pd.DataFrame:
    inc = _dgm("hh_income_state").dropna(subset=["code"])[["code", "year", "income_mean", "income_median"]]
    pov = _dgm("hh_poverty_state").dropna(subset=["code"])[["code", "year", "poverty_absolute", "poverty_relative"]]
    am = _dgm("hh_access_amenities").dropna(subset=["code"])
    # state-level rows have district == state name in some vintages; otherwise average districts
    am = am.groupby(["code", "year"], as_index=False)[["piped_water", "sanitation", "electricity"]].mean()
    gdp = _dgm("gdp_state_real_supply")
    gdp = gdp[(gdp.series == "abs") & (gdp.sector == "p0") & gdp.code.notna()][["code", "year", "value"]]
    gdp = gdp.rename(columns={"value": "gdp_real_rm_m"})
    df = inc.merge(pov, on=["code", "year"], how="outer").merge(am, on=["code", "year"], how="outer")
    df = df.merge(gdp, on=["code", "year"], how="outer")
    return df[df.year >= 2016].sort_values(["code", "year"]).reset_index(drop=True)


def foreign_arrivals_soe() -> pd.DataFrame:
    """Foreign arrivals by state of entry (context only: entry point, not destination)."""
    df = _dgm("arrivals_soe")
    df["code"] = df["soe"].map(to_code)
    df = df[(df.country == "ALL") & df.code.notna()] if (df.country == "ALL").any() else df[df.code.notna()]
    return df.groupby(["code", "year"], as_index=False)["arrivals"].sum()


def boundaries() -> dict:
    gj = json.loads((RAW / "geo" / "geoBoundaries-MYS-ADM1_simplified.geojson").read_text(encoding="utf8"))
    for f in gj["features"]:
        code = to_code(f["properties"].get("shapeName"))
        f["properties"] = {"code": code, "state": f["properties"].get("shapeName")}
        f["id"] = code
    return gj


# ---------------------------------------------------------------- Tourism Malaysia (Power BI)
def _tm(name: str) -> pd.DataFrame:
    tm = RAW / "tourism_malaysia"
    df = pd.read_csv(tm / f"{name}.csv")
    ref = pd.read_csv(tm / "ref_states.csv").set_index("id")["name"]
    df["area"] = df["state_id"].map(ref)
    df["code"] = df["area"].map(to_code)
    df.loc[df["area"] == "Langkawi", "code"] = "LGK"   # reported separately from Kedah
    df.loc[df["area"] == "All States", "code"] = "MYS"
    return df[df["code"].notna()].drop(columns=["state_id", "date"])


def accommodation_year() -> pd.DataFrame:
    """Full-year paid-accommodation figures. quarter_cumulative == 5 is Jan-Dec."""
    aor = _tm("dashboard_aor_cumulative_public").query("quarter_cumulative == 5")
    hg = _tm("dashboard_hg_cumulative_public").query("quarter_cumulative == 5")
    rooms = _tm("dashboard_room_cumulative_public").dropna(subset=["total_room"])
    df = aor[["code", "year", "aor_cumulative"]].rename(columns={"aor_cumulative": "occupancy_pct"})
    df = df.merge(hg[["code", "year", "domestic_hotel_guest", "foreigner_hotel_guest", "overall_hotel_guest"]],
                  on=["code", "year"], how="outer")
    df = df.merge(rooms[["code", "year", "total_hotel", "total_room"]], on=["code", "year"], how="outer")
    df = df.rename(columns={"domestic_hotel_guest": "hotel_guests_domestic", "foreigner_hotel_guest": "hotel_guests_foreign",
                            "overall_hotel_guest": "hotel_guests_total", "total_hotel": "hotels", "total_room": "rooms"})
    return df.sort_values(["code", "year"]).reset_index(drop=True)


def accommodation_quarter() -> pd.DataFrame:
    aor = _tm("dashboard_aor_quarter_public").rename(columns={"quarter_quarterly": "quarter", "aor_quarter": "occupancy_pct"})
    hg = _tm("dashboard_hg_quarter_public").rename(columns={
        "quarter_quarterly": "quarter", "domestic_hotel_guest": "hotel_guests_domestic",
        "foreigner_hotel_guest": "hotel_guests_foreign", "overall_hotel_guest": "hotel_guests_total"})
    df = aor[["code", "year", "quarter", "occupancy_pct"]].merge(
        hg[["code", "year", "quarter", "hotel_guests_domestic", "hotel_guests_foreign", "hotel_guests_total"]],
        on=["code", "year", "quarter"], how="outer")
    return df.sort_values(["code", "year", "quarter"]).reset_index(drop=True)


# ---------------------------------------------------------------- main
def main() -> None:
    CLEAN.mkdir(parents=True, exist_ok=True)
    tables = {
        "states": STATES,
        "visitors_state_year": visitors_by_state(),
        "od_tourists": od_matrix(),
        "national_key_stats": national_key_stats(),
        "state_key_stats": state_key_stats(),
        "state_detail": state_detail(),
        "top_places_dosm": pd.concat([top_destinations_2025(), state_top_places_2023()], ignore_index=True),
        "population_state": population(),
        "socioeconomic_state": socioeconomic(),
        "foreign_arrivals_soe": foreign_arrivals_soe(),
        "accommodation_year": accommodation_year(),
        "accommodation_quarter": accommodation_quarter(),
    }
    for name, df in tables.items():
        df.to_parquet(CLEAN / f"{name}.parquet", index=False)
        print(f"  {name:24s} {df.shape}")
    gj = boundaries()
    missing = set(CODES) - {f["id"] for f in gj["features"]}
    assert not missing, f"boundaries missing {missing}"
    (CLEAN / "states.geojson").write_text(json.dumps(gj), encoding="utf8")
    print(f"  states.geojson           {len(gj['features'])} features")


if __name__ == "__main__":
    main()
