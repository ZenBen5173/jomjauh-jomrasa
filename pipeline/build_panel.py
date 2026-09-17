"""Build the analysis panel: one row per state per year, every derived measure.

Year alignment (stated on the methodology page):
  * visitors, tourists (Table 10), occupancy, rooms, hotel guests: the panel year itself;
  * spend per visitor, length of stay, paid-accommodation share: latest DOSM state
    publication not after the panel year (2023 for 2024/2025) - `spend_year` records it.
    Receipts for later years are therefore visitors x carried-forward spend per visitor;
  * household amenities / income / poverty: nearest HIES survey year not after the panel year;
  * OSM features: current extract.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

from pipeline.states import CODES, STATES

ROOT = Path(__file__).resolve().parents[1]
RAW, CLEAN = ROOT / "data" / "raw", ROOT / "data" / "clean"
YEARS = [2021, 2022, 2023, 2024, 2025]


def _load(name: str) -> pd.DataFrame:
    return pd.read_parquet(CLEAN / f"{name}.parquet")


# ---------------------------------------------------------------- OSM
def osm_points() -> pd.DataFrame:
    gj = json.loads((CLEAN / "states.geojson").read_text(encoding="utf8"))
    polys = [shape(f["geometry"]) for f in gj["features"]]
    codes = [f["id"] for f in gj["features"]]
    tree = STRtree(polys)
    rows = []
    for path in sorted((RAW / "osm").glob("*.json")):
        layer = path.stem
        for el in json.loads(path.read_text(encoding="utf8"))["elements"]:
            lat = el.get("lat") or el.get("center", {}).get("lat")
            lon = el.get("lon") or el.get("center", {}).get("lon")
            if lat is None:
                continue
            t = el.get("tags", {})
            pt = Point(lon, lat)
            hit = [i for i in tree.query(pt) if polys[i].contains(pt)]
            # islands / simplified coastlines: fall back to the nearest state within ~25 km
            i = hit[0] if hit else int(tree.nearest(pt))
            if not hit and polys[i].distance(pt) > 0.25:
                continue
            kind = (t.get("tourism") or t.get("natural") or t.get("waterway") or t.get("historic")
                    or t.get("boundary") or t.get("leisure") or t.get("aeroway") or t.get("railway"))
            rows.append({"code": codes[i], "layer": layer, "kind": kind,
                         "name": t.get("name:en") or t.get("name"), "iata": t.get("iata"),
                         "lat": lat, "lon": lon, "osm_id": f"{el['type'][0]}{el['id']}"})
    return pd.DataFrame(rows).drop_duplicates("osm_id")


def _haversine(lat1, lon1, lat2, lon2):
    p = np.pi / 180
    a = (np.sin((lat2 - lat1) * p / 2) ** 2
         + np.cos(lat1 * p) * np.cos(lat2 * p) * np.sin((lon2 - lon1) * p / 2) ** 2)
    return 6371 * 2 * np.arcsin(np.sqrt(a))


def osm_state_features(pts: pd.DataFrame) -> pd.DataFrame:
    st = STATES.set_index("code")
    cnt = pts.groupby(["code", "layer"]).size().unstack(fill_value=0).reindex(CODES, fill_value=0)
    out = pd.DataFrame(index=CODES)
    out["attractions_n"] = cnt[["attractions", "nature", "heritage"]].sum(axis=1)
    out["osm_attractions"], out["osm_nature"], out["osm_heritage"] = cnt["attractions"], cnt["nature"], cnt["heritage"]
    out["rail_stations_n"] = cnt["rail"]
    air = pts[pts.layer == "airports"]
    # airports within 100 km of the state capital: handles enclaves (KL, Putrajaya) served by KLIA/Subang
    out["airports_100km"] = [int((_haversine(st.at[c, "lat"], st.at[c, "lon"], air.lat.values, air.lon.values) <= 100).sum())
                             for c in CODES]
    return out


# ---------------------------------------------------------------- panel
def _latest_not_after(df: pd.DataFrame, year: int, cols: list[str]) -> pd.DataFrame:
    d = df[df.year <= year].dropna(subset=cols).sort_values("year").groupby("code").tail(1)
    return d.set_index("code")[cols + ["year"]]


def build(year: int, osm: pd.DataFrame) -> pd.DataFrame:
    st = STATES.set_index("code")
    p = st[["state", "label", "region", "area_km2", "lat", "lon"]].copy()
    p["year"] = year

    p["visitors_k"] = _load("visitors_state_year").query("year == @year").set_index("code")["visitors_k"]
    p["population_k"] = _load("population_state").query("year == @year").set_index("code")["population_k"]

    ks = _latest_not_after(_load("state_key_stats"), year, ["spend_per_visitor_rm", "spend_per_trip_rm", "avg_length_of_stay"])
    p[["spend_per_visitor_rm", "spend_per_trip_rm", "avg_length_of_stay"]] = ks.drop(columns="year")
    p["spend_year"] = ks["year"]
    p["receipts_rm_m"] = p["visitors_k"] * p["spend_per_visitor_rm"] / 1e3

    det = _latest_not_after(_load("state_detail"), year, ["stay_relatives_pct", "tourists_k", "excursionists_k"])
    p["paid_accommodation_share"] = 1 - det["stay_relatives_pct"] / 100
    det_modes = _latest_not_after(_load("state_detail"), year, ["mode_air_pct", "mode_private_vehicle_pct"])
    p["mode_air_pct"], p["mode_private_vehicle_pct"] = det_modes["mode_air_pct"], det_modes["mode_private_vehicle_pct"]

    # overnight tourists by destination & origin mix: DOSM Table 10 (2023-2025), else state detail
    od = _load("od_tourists")
    od_y = od[od.year == (year if year in set(od.year) else od.year.min())]
    dest_tot = od_y.groupby("dest")["tourists_k"].sum()
    p["tourists_k"] = dest_tot if year in set(od.year) else det["tourists_k"]
    p["overnight_share"] = (p["tourists_k"] / p["visitors_k"]).clip(0, 1)
    own = od_y[od_y.origin == od_y.dest].set_index("dest")["tourists_k"]
    p["out_of_state_share_pct"] = (1 - own / dest_tot) * 100
    ext = od_y[od_y.origin != od_y.dest].copy()
    ext["s"] = ext["tourists_k"] / ext.groupby("dest")["tourists_k"].transform("sum")
    p["origin_diversity"] = 1 - ext.groupby("dest")["s"].apply(lambda s: (s ** 2).sum())
    p["od_year"] = int(od_y.year.iloc[0])

    acc = _load("accommodation_year").query("year == @year").set_index("code")
    p["rooms"], p["hotels"], p["occupancy_pct"] = acc["rooms"], acc["hotels"], acc["occupancy_pct"]
    p["hotel_guests_total"], p["hotel_guests_foreign"] = acc["hotel_guests_total"], acc["hotel_guests_foreign"]
    p["foreign_guest_share_pct"] = acc["hotel_guests_foreign"] / acc["hotel_guests_total"] * 100
    p["spare_occupancy_pct"] = 100 - p["occupancy_pct"]

    se = _load("socioeconomic_state")
    am = _latest_not_after(se, year, ["piped_water", "sanitation", "electricity"])
    p["basic_amenities_pct"] = am[["piped_water", "sanitation", "electricity"]].mean(axis=1)
    p["amenities_year"] = am["year"]
    inc = _latest_not_after(se, year, ["income_median", "poverty_absolute"])
    p["income_median_rm"], p["poverty_absolute_pct"] = inc["income_median"], inc["poverty_absolute"]
    gdp = _latest_not_after(se, year, ["gdp_real_rm_m"])
    p["gdp_per_capita_rm"] = gdp["gdp_real_rm_m"] * 1e6 / (p["population_k"] * 1e3)

    p = p.join(osm)

    # JomRasa columns join in once the text pipeline has run; the metrics skip them until then
    jr = CLEAN / "jomrasa_state.parquet"
    if jr.exists():
        cols = ["experience_score", "access_sentiment", "amenity_sentiment", "mentions_n"]
        p = p.join(pd.read_parquet(jr).set_index("code")[cols])

    # derived intensity measures
    p["visitor_share_pct"] = p["visitors_k"] / p["visitors_k"].sum() * 100
    p["visitors_per_resident"] = p["visitors_k"] / p["population_k"]
    p["visitors_per_km2"] = p["visitors_k"] * 1e3 / p["area_km2"]
    p["receipts_per_resident_rm"] = p["receipts_rm_m"] * 1e3 / p["population_k"]
    p["rooms_per_1000_tourists"] = p["rooms"] / p["tourists_k"]
    p["rooms_per_1000_residents"] = p["rooms"] / p["population_k"]
    p["attractions_per_1000km2"] = p["attractions_n"] / p["area_km2"] * 1e3

    # Hansen-type market access: population of the *other* states, decayed by distance (beta = 1)
    lat, lon, pop = p["lat"].to_numpy(), p["lon"].to_numpy(), p["population_k"].to_numpy()
    d = _haversine(lat[:, None], lon[:, None], lat[None, :], lon[None, :])
    np.fill_diagonal(d, np.inf)
    p["market_access"] = (pop[None, :] / np.maximum(d, 25)).sum(axis=1)  # floor 25 km for adjacent enclaves
    return p.reset_index()


def main() -> None:
    pts = osm_points()
    pts.to_parquet(CLEAN / "osm_points.parquet", index=False)
    print(f"  osm_points               {pts.shape}  unassigned dropped")
    osm = osm_state_features(pts)
    panel = pd.concat([build(y, osm) for y in YEARS], ignore_index=True)
    panel.to_parquet(CLEAN / "state_panel.parquet", index=False)
    print(f"  state_panel              {panel.shape}")
    assert not panel[panel.year >= 2023].drop(columns=[]).isna().any().any(), \
        panel[panel.year >= 2023].isna().sum().loc[lambda s: s > 0]


if __name__ == "__main__":
    main()
