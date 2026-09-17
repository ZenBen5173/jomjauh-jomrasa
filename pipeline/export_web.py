"""Load step for the dashboard: write the JSON files web/ reads.

The web app recomputes every metric client-side (weights, year and simulator are
interactive), using the indicator definitions exported here so Python and
TypeScript cannot drift. `reference.json` holds Python results that the web test
suite must reproduce.
"""
from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

import numpy as np
import pandas as pd

from core import metrics as M

ROOT = Path(__file__).resolve().parents[1]
RAW, CLEAN = ROOT / "data" / "raw", ROOT / "data" / "clean"
OUT = ROOT / "web" / "public" / "data"
YEARS = [2023, 2024, 2025]
DEFAULT_YEAR = 2025


def _load(name: str) -> pd.DataFrame:
    return pd.read_parquet(CLEAN / f"{name}.parquet")


def _clean(o):
    """NaN/inf -> None, numpy -> python, round floats (smaller files, stable diffs)."""
    if isinstance(o, dict):
        return {str(k): _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple, np.ndarray)):
        return [_clean(v) for v in o]
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (float, np.floating)):
        return None if not np.isfinite(o) else round(float(o), 6)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    return o


def _write(name: str, obj) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(_clean(obj), ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    print(f"  {name:22s} {(OUT / name).stat().st_size / 1024:8.1f} KB")


def _round_coords(x, nd=3):
    if isinstance(x, list):
        if x and isinstance(x[0], (int, float)):
            return [round(x[0], nd), round(x[1], nd)]
        out, prev = [], None
        for v in (_round_coords(i, nd) for i in x):
            if v != prev:          # drop consecutive duplicate vertices created by rounding
                out.append(v)
            prev = v
        return out
    return x


def reference(panel_all: pd.DataFrame) -> dict:
    ref = {}
    for y in YEARS:
        p = panel_all[panel_all.year == y].set_index("code")
        g, b, c = M.gap_table(p), M.bottlenecks(p), M.capacity(p)
        ref[str(y)] = {
            "concentration": M.concentration(p), "receipts_gini": M.gini(p.receipts_rm_m),
            "lorenz_y": M.lorenz(p.visitors_k)[1],
            "gap": g[["potential", "actual", "gap", "gap_rank"]].to_dict("index"),
            "pillars": b[list(M.PILLARS) + ["bottleneck"]].to_dict("index"),
            "capacity": c.to_dict("index"),
        }
    p = panel_all[panel_all.year == DEFAULT_YEAR].set_index("code")
    sims = []
    for origin, dests, share, mult in [("SGR", {"TRG": 1.0}, 5, 1.0), ("SGR", {"PLS": 1.0}, 30, 1.0),
                                       ("KUL", {"KTN": 0.5, "SBH": 0.5}, 4, 1.42)]:
        r = M.simulate(p, M.Scenario(origin, dests, share, M.Assumptions(multiplier=mult)))
        sims.append({"origin": origin, "destinations": dests, "share_pct": share, "multiplier": mult,
                     "moved_k": r["moved_k"], "capacity_binds": r["capacity_binds"],
                     "receipts_gained_rm_m": r["receipts_gained_rm_m"], "receipts_lost_rm_m": r["receipts_lost_rm_m"],
                     "net_national_rm_m": r["net_national_rm_m"],
                     "gini_after": r["concentration_after"]["gini"],
                     "origin_occupancy_after_pct": r["origin"]["occupancy_after_pct"],
                     "dest_occupancy_after_pct": r["destinations"]["occupancy_after_pct"].to_dict()})
    ref["simulations"] = sims
    return ref


def main() -> None:
    panel = _load("state_panel")
    panel = panel[panel.year.isin(YEARS)]
    _write("panel.json", {"default_year": DEFAULT_YEAR, "years": YEARS,
                          "rows": {str(y): panel[panel.year == y].to_dict("records") for y in YEARS}})

    v = _load("visitors_state_year")
    ks = _load("state_key_stats")
    _write("trend.json", {
        "visitors": {c: g.set_index("year")["visitors_k"].to_dict() for c, g in v.groupby("code")},
        "receipts": {c: g.set_index("year")["receipts_rm_m"].to_dict() for c, g in ks.groupby("code")},
        "spend_per_visitor": {c: g.set_index("year")["spend_per_visitor_rm"].to_dict() for c, g in ks.groupby("code")},
        "national": _load("national_key_stats").to_dict("records"),
        "gini_by_year": {int(y): M.gini(g.visitors_k) for y, g in v.groupby("year")},
    })

    od = _load("od_tourists")
    _write("od.json", {str(y): g[["origin", "dest", "tourists_k"]].to_dict("records") for y, g in od.groupby("year")})

    q = _load("accommodation_quarter")
    q = q[~q.code.isin(["LGK"])]
    _write("quarterly.json", {c: g[["year", "quarter", "occupancy_pct", "hotel_guests_domestic", "hotel_guests_foreign"]]
                              .to_dict("records") for c, g in q.groupby("code")})

    gj = json.loads((CLEAN / "states.geojson").read_text(encoding="utf8"))
    for f in gj["features"]:
        geom = f["geometry"]
        coords = _round_coords(geom["coordinates"])
        # d3-geo uses spherical winding (exterior rings clockwise) - the reverse of RFC 7946
        polys = coords if geom["type"] == "MultiPolygon" else [coords]
        polys = [[ring[::-1] for ring in poly] for poly in polys]
        geom["coordinates"] = polys if geom["type"] == "MultiPolygon" else polys[0]
    _write("states_geo.json", gj)

    pts = _load("osm_points")
    named = pts[pts.name.notna() & pts.layer.isin(["attractions", "nature", "heritage", "airports"])]
    _write("places_osm.json", named[["code", "layer", "kind", "name", "lat", "lon"]].round(4).to_dict("records"))
    _write("places_dosm.json", _load("top_places_dosm").to_dict("records"))

    manifest = json.loads((RAW / "_manifest.json").read_text())
    tm = json.loads((RAW / "tourism_malaysia" / "_access.json").read_text())
    osm_date = json.loads((RAW / "osm" / "airports.json").read_text(encoding="utf8"))["_accessed"]
    _write("meta.json", {
        "indicators": {"potential": [asdict(i) for i in M.POTENTIAL], "actual": [asdict(i) for i in M.ACTUAL],
                       "pillars": {k: [asdict(i) for i in v] for k, v in M.PILLARS.items()}},
        "assumptions_default": asdict(M.Assumptions()),
        "files": manifest, "tourism_malaysia": tm, "osm_accessed": osm_date,
    })
    _write("reference.json", reference(_load("state_panel")))


if __name__ == "__main__":
    main()
