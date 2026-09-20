"""Audit: replay the pipeline on the raw files and COUNT what every cleaning step did.

Nothing here changes data. The cleaning functions are run again with counters attached, so the numbers
on the website's Pipeline page (duplicates removed, blanks kept empty, rows filtered, posts dropped...)
are measured from the real files, not written by hand.

    python -m pipeline.audit        # -> web/public/data/pipeline_audit.json
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

import pandas as pd

from pipeline import transform_structured as T
from pipeline.text import prepare as TP

ROOT = Path(__file__).resolve().parents[1]
RAW, CLEAN, WEB = ROOT / "data" / "raw", ROOT / "data" / "clean", ROOT / "web" / "public" / "data"
DASHES = {"", "-", "–", "n.a", "n.a.", ".."}


# ---------------------------------------------------------------- official spreadsheets and tables
def structured() -> dict:
    cells = Counter()
    spellings: dict[str, set[str]] = {}
    dupes: list[dict] = []
    num, to_code, drop = T._num, T.to_code, pd.DataFrame.drop_duplicates

    def counting_num(v):
        out = num(v)
        if isinstance(v, str):
            cells["text_to_number" if out is not None else ("dash_to_empty" if v.strip() in DASHES else "label")] += 1
        elif isinstance(v, (int, float)):
            cells["already_number"] += 1
        return out

    def counting_code(v):
        code = to_code(v)
        if code and isinstance(v, str):
            spellings.setdefault(code, set()).add(T._txt(v))
        return code

    def counting_drop(self, subset=None, **kw):
        out = drop(self, subset, **kw)
        dupes.append({"key": subset if isinstance(subset, list) else [subset], "before": len(self), "after": len(out)})
        return out

    T._num, T.to_code, pd.DataFrame.drop_duplicates = counting_num, counting_code, counting_drop
    try:
        built = {
            "visitors_state_year": T.visitors_by_state(), "od_tourists": T.od_matrix(), "national_key_stats": T.national_key_stats(),
            "state_key_stats": T.state_key_stats(), "state_detail": T.state_detail(),
            "top_places_dosm": pd.concat([T.top_destinations_2025(), T.state_top_places_2023()], ignore_index=True),
        }
        # the other agencies spell the states their own way: run their loaders too so those spellings are counted
        T.population(), T.socioeconomic(), T.foreign_arrivals_soe(), T.boundaries(), T.accommodation_year(), T.accommodation_quarter()
    finally:
        T._num, T.to_code, pd.DataFrame.drop_duplicates = num, to_code, drop

    # row filters: raw rows in the downloaded table -> rows kept in the clean table
    filters = []
    for label, raw_files, clean in [
        ("Population", ["datagovmy/population_state.parquet"], "population_state"),
        ("Income, poverty, amenities, GDP", [f"datagovmy/{x}.parquet" for x in ("hh_income_state", "hh_poverty_state", "hh_access_amenities", "gdp_state_real_supply")], "socioeconomic_state"),
        ("Hotels, full year", [f"tourism_malaysia/dashboard_{x}_cumulative_public.csv" for x in ("aor", "hg", "room")], "accommodation_year"),
        ("Hotels, by quarter", [f"tourism_malaysia/dashboard_{x}_quarter_public.csv" for x in ("aor", "hg")], "accommodation_quarter"),
    ]:
        raw_rows = sum(len(pd.read_parquet(RAW / f) if f.endswith(".parquet") else pd.read_csv(RAW / f)) for f in raw_files)
        filters.append({"label": label, "raw": int(raw_rows), "kept": int(len(pd.read_parquet(CLEAN / f"{clean}.parquet")))})

    osm = pd.read_parquet(CLEAN / "osm_points.parquet")
    osm_raw = sum(len(json.loads((RAW / "osm" / f"{layer}.json").read_text(encoding="utf8"))["elements"]) for layer in osm.layer.unique())
    osm_kept = len(osm)

    v = built["visitors_state_year"]
    latest = int(v.year.max())
    national = pd.read_parquet(CLEAN / "national_key_stats.parquet")
    nat = float(national.loc[national.year == latest, "visitors_k"].iloc[0])
    return {
        "cells": {"read": int(sum(cells.values()) - cells["label"]), "text_to_number": cells["text_to_number"], "dash_to_empty": cells["dash_to_empty"], "already_number": cells["already_number"]},
        "spellings": {"variants": int(sum(len(s) for s in spellings.values())), "codes": len(spellings),
                      "examples": sorted(spellings.get("PNG", set()))[:5]},
        "duplicates": [{**d, "removed": d["before"] - d["after"]} for d in dupes if d["before"] != d["after"]],
        "duplicates_removed": int(sum(d["before"] - d["after"] for d in dupes)),
        "filters": filters,
        "osm": {"raw": int(osm_raw), "kept": int(osm_kept)},
        "reconcile": {"year": latest, "states_sum_k": round(float(v[v.year == latest].visitors_k.sum()), 1), "national_k": round(nat, 1)},
    }


# ---------------------------------------------------------------- travel text funnel
def text() -> dict:
    c = Counter()
    rows = []
    for f in sorted((TP.RAW / "exa").glob("*.json")):
        d = json.loads(f.read_text(encoding="utf8"))
        c["searches"] += 1
        for res in d["response"].get("results", []):
            c["pages"] += 1
            if TP._BLOCKED.search(res.get("url") or ""):
                c["pages_blocked"] += 1
                continue
            article = res.get("text") or ""
            for rx, key in ((TP._URL, "links"), (TP._EMAIL, "emails"), (TP._HANDLE, "usernames"), (TP._PHONE, "phones")):
                c[key] += len(rx.findall(article))
            paras = [TP.scrub(p) for p in re.split(r"\n{1,}", article)]
            c["paragraphs"] += len(paras)
            c["paragraphs_junk"] += sum(1 for p in paras if len(p) < 40 or TP._BOILER.search(p) or p.startswith(("#", "|", "![")))
            made = TP.passages(article)
            c["passages"] += len(made)
            c["passages_over_cap"] += max(len(made) - 6, 0)
            rows += [p for p in made[:6]]
    for f in sorted((TP.RAW / "youtube_commentThreads").glob("*.json")):
        d = json.loads(f.read_text(encoding="utf8"))
        for it in d["response"].get("items", []):
            sn = it["snippet"]["topLevelComment"]["snippet"]
            raw = sn.get("textDisplay") or sn.get("textOriginal") or ""
            c["comments"] += 1
            for rx, key in ((TP._URL, "links"), (TP._EMAIL, "emails"), (TP._HANDLE, "usernames"), (TP._PHONE, "phones")):
                c[key] += len(rx.findall(raw))
            t = TP.scrub(raw)[:TP.MAX_CHARS]
            if len(t) >= TP.MIN_CHARS:
                rows.append(t)
            else:
                c["comments_short"] += 1
    before = len(rows)
    after = len({TP._norm_key(t) for t in rows})

    from pipeline.text.score import tagged
    tg = tagged()
    first = int(tg["tagger_travel"].sum()) if "tagger_travel" in tg else int(tg.is_travel_experience.sum())
    kept = tg[tg.is_travel_experience]
    return {
        "searches": c["searches"], "pages": c["pages"], "pages_blocked": c["pages_blocked"], "comments": c["comments"],
        "paragraphs": c["paragraphs"], "paragraphs_junk": c["paragraphs_junk"], "passages_over_cap": c["passages_over_cap"],
        "comments_short": c["comments_short"],
        "scrubbed": {"links": c["links"], "emails": c["emails"], "usernames": c["usernames"], "phones": c["phones"]},
        "funnel": [
            {"label": "Passages and comments", "n": before},
            {"label": "After removing duplicates", "n": after, "removed": before - after, "why": "duplicates"},
            {"label": "Tagged by the AI", "n": int(len(tg)), "removed": after - int(len(tg)), "why": "could not be tagged"},
            {"label": "AI says: a real trip", "n": first, "removed": int(len(tg)) - first, "why": "not a trip (ads, news, chatter)"},
            {"label": "Yes on the second ask too", "n": int(len(kept)), "removed": first - int(len(kept)), "why": "failed the second ask"},
        ],
        "by_state": {k: int(n) for k, n in kept.code.value_counts().items()},
        "by_language": {k: int(n) for k, n in kept.language.value_counts().items()},
    }


# ---------------------------------------------------------------- the joined table
def panel() -> dict:
    p = pd.read_parquet(CLEAN / "state_panel.parquet")
    cols = [c for c in p.columns if c not in ("code", "state", "label", "region", "year")]
    carried = {"spend_year": ["spend_per_visitor_rm", "spend_per_trip_rm", "avg_length_of_stay", "receipts_rm_m", "receipts_per_resident_rm"],
               "amenities_year": ["basic_amenities_pct"], "od_year": ["out_of_state_share_pct", "origin_diversity"]}
    grid, cell_map = [], []
    for year, g in p.sort_values(["year", "code"]).groupby("year"):
        row = {"year": int(year), "filled": 0, "carried": 0, "empty": 0}
        for _, r in g.iterrows():
            old = {c for k, cs in carried.items() if k in r and r[k] != year for c in cs}
            kinds = ["empty" if pd.isna(r[col]) else "carried" if col in old else "filled" for col in cols]
            for k in kinds:
                row[k] += 1
            cell_map.append({"year": int(year), "code": r["code"], "cells": "".join(k[0] for k in kinds)})   # f / c / e per column
        grid.append(row)
    return {"rows": int(len(p)), "columns": int(p.shape[1]), "value_columns": len(cols), "states": int(p.code.nunique()), "years": grid,
            "column_names": cols, "map": cell_map,
            "cells": int(len(p) * len(cols)), "empty": int(sum(g["empty"] for g in grid)), "carried": int(sum(g["carried"] for g in grid))}


def guide() -> dict:
    raw = pd.read_parquet(CLEAN / "guide_places_raw.parquet")
    g = json.loads((WEB / "guide.json").read_text(encoding="utf8"))["destinations"]
    places = [x for d in g for x in d["places"]]
    return {"listings": int(len(raw)), "had_coordinates": int(raw.lat.notna().sum()), "placed": len(places),
            "from_wikivoyage": sum(1 for x in places if x.get("source") != "osm"), "from_map": sum(1 for x in places if x.get("source") == "osm"),
            "street_level": sum(1 for x in places if x.get("approx"))}


def main() -> None:
    out = {"structured": structured(), "text": text(), "panel": panel(), "guide": guide(),
           "published_files": len([f for f in WEB.glob("*.json") if f.name != "pipeline_audit.json"])}
    (WEB / "pipeline_audit.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf8")
    s, t = out["structured"], out["text"]
    print("cells", s["cells"], "| spellings", s["spellings"]["variants"], "->", s["spellings"]["codes"], "| dupes", s["duplicates_removed"])
    print("reconcile", s["reconcile"], "| osm", s["osm"])
    print("text", [(f["label"], f["n"]) for f in t["funnel"]], t["scrubbed"])
    print("panel", {k: v for k, v in out["panel"].items() if k not in ("years", "map", "column_names")}, "| guide", out["guide"])


if __name__ == "__main__":
    main()
