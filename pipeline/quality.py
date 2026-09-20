"""Data-quality methods for the official tables. Each one returns how much it looked at and what it found,
so the Pipeline page can show real counts, and `run()` raises if a rule that must hold is broken.

    python -m pipeline.quality
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from pipeline.states import CODES

ROOT = Path(__file__).resolve().parents[1]
CLEAN, RAW = ROOT / "data" / "clean", ROOT / "data" / "raw"
load = lambda name: pd.read_parquet(CLEAN / f"{name}.parquet")  # noqa: E731

# value must sit inside [lo, hi]; None = no limit
RANGES = {
    "visitors_state_year": {"visitors_k": (0, None)},
    "population_state": {"population_k": (0, None)},
    "accommodation_year": {"occupancy_pct": (0, 100), "rooms": (0, None), "hotels": (0, None), "hotel_guests_total": (0, None)},
    "accommodation_quarter": {"occupancy_pct": (0, 100)},
    "socioeconomic_state": {"piped_water": (0, 100), "sanitation": (0, 100), "electricity": (0, 100), "poverty_absolute": (0, 100), "income_median": (0, None)},
    "state_key_stats": {"spend_per_visitor_rm": (0, None), "avg_length_of_stay": (0, 30)},
    "state_panel": {"overnight_share": (0, 1), "paid_accommodation_share": (0, 1), "out_of_state_share_pct": (0, 100), "origin_diversity": (0, 1),
                    "foreign_guest_share_pct": (0, 100), "basic_amenities_pct": (0, 100), "visitor_share_pct": (0, 100)},
}


def ranges() -> dict:
    """Range rules: a percentage above 100 or a negative count is a parsing mistake, not a fact."""
    checked, bad = 0, []
    for table, cols in RANGES.items():
        df = load(table)
        for col, (lo, hi) in cols.items():
            v = df[col].dropna()
            checked += len(v)
            wrong = v[(v < lo) if lo is not None else False] if hi is None else v[(v < lo) | (v > hi)]
            bad += [f"{table}.{col}={x}" for x in wrong.head(3)]
    return {"checked": checked, "problems": len(bad), "examples": bad[:5]}


def completeness() -> dict:
    """Every year must have exactly the 16 states, once each: a missing or doubled state would bend every share."""
    v, p = load("visitors_state_year"), load("state_panel")
    cells, gaps = 0, []
    for name, df in (("visitors_state_year", v), ("state_panel", p)):
        for year, g in df.groupby("year"):
            cells += len(CODES)
            if sorted(g.code) != sorted(CODES):
                gaps.append(f"{name} {year}")
    return {"checked": cells, "problems": len(gaps), "examples": gaps[:5]}


def reconcile() -> dict:
    """Totals we add up ourselves must equal the totals the agencies publish."""
    checks, failed = 0, []
    v, nat = load("visitors_state_year"), load("national_key_stats").set_index("year")
    for year, g in v.groupby("year"):                      # 16 states = DOSM's national visitors
        if year in nat.index and pd.notna(nat.at[year, "visitors_k"]):
            checks += 1
            if abs(g.visitors_k.sum() / nat.at[year, "visitors_k"] - 1) > 0.0005:
                failed.append(f"visitors {year}")
    d = load("state_detail").dropna(subset=["tourists_k", "excursionists_k"])
    sk = load("state_key_stats").set_index(["code", "year"])
    for r in d.itertuples():                               # tourists + day-trippers = visitors
        if (r.code, r.year) in sk.index and pd.notna(sk.at[(r.code, r.year), "visitors_k"]):
            checks += 1
            if abs((r.tourists_k + r.excursionists_k) / sk.at[(r.code, r.year), "visitors_k"] - 1) > 0.005:
                failed.append(f"visitor types {r.code} {r.year}")
    acc = load("accommodation_year")
    for year, g in acc.groupby("year"):                    # 16 states' rooms = Tourism Malaysia's "All States"
        total = g.loc[g.code == "MYS", "rooms"]
        states = g.loc[g.code.isin(CODES), "rooms"]
        if len(total) and pd.notna(total.iloc[0]) and states.notna().all() and len(states) == len(CODES):
            checks += 1
            if abs(states.sum() / total.iloc[0] - 1) > 0.005:
                failed.append(f"rooms {year}")
    return {"checked": checks, "problems": len(failed), "examples": failed[:5]}


def outliers(limit: float = 3.5) -> dict:
    """Outlier scan on year-on-year change in visitors (robust z-score: distance from the median change,
    in units of the typical spread). Flagged values are NOT changed - they are official - but each one is
    looked at. A flag outside the pandemic years would mean a parsing error."""
    v = load("visitors_state_year").sort_values(["code", "year"])
    v["change"] = v.groupby("code").visitors_k.pct_change()
    x = v.dropna(subset=["change"])
    med = x.change.median()
    spread = (x.change - med).abs().median() * 1.4826
    flagged = x[((x.change - med) / spread).abs() > limit]
    explained = flagged[flagged.year.between(2020, 2022)]   # collapse and rebound of travel
    return {"checked": int(len(x)), "flagged": int(len(flagged)), "explained": int(len(explained)),
            "problems": int(len(flagged) - len(explained)), "years": sorted(int(y) for y in flagged.year.unique())}


def editions() -> dict:
    """The 2024 and 2025 DOSM editions overlap. Where both give the same state and year, do they agree?"""
    from pipeline import transform_structured as T
    rows = []
    for fname in ["tourism_domestic_2025.xlsx", "tourism_domestic_2024.xlsx"]:
        g = T._grid(T.RAW / "dosm" / fname, "9")
        hdr = next(i for i, r in enumerate(g) if len(T._year_cols(r)) >= 5)
        for r in g[hdr + 1:]:
            code = T.to_code(r[0])
            for j, y in (T._year_cols(g[hdr]).items() if code else ()):
                if (val := T._num(r[j])) is not None:
                    rows.append((code, y, val, fname))
    both = pd.DataFrame(rows, columns=["code", "year", "v", "f"]).pivot_table(index=["code", "year"], columns="f", values="v").dropna()
    differ = both[(both.iloc[:, 0] - both.iloc[:, 1]).abs() > 1e-6]
    return {"checked": int(len(both)), "differ": int(len(differ))}


def run() -> dict:
    out = {"ranges": ranges(), "completeness": completeness(), "reconcile": reconcile(), "outliers": outliers(), "editions": editions()}
    broken = {k: v for k, v in out.items() if v.get("problems")}
    assert not broken, f"data-quality rules broken: {broken}"
    return out


if __name__ == "__main__":
    for k, v in run().items():
        print(f"{k:14s} {v}")
