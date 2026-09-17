"""Data checks on the clean structured tables (run after pipeline.transform_structured)."""
from pathlib import Path

import pandas as pd
import pytest

from pipeline.states import CODES

CLEAN = Path(__file__).resolve().parents[1] / "data" / "clean"


def load(name: str) -> pd.DataFrame:
    return pd.read_parquet(CLEAN / f"{name}.parquet")


STATE_TABLES = ["visitors_state_year", "state_key_stats", "state_detail", "population_state"]


@pytest.mark.parametrize("name", STATE_TABLES)
def test_exactly_the_16_states_every_year(name):
    df = load(name)
    for year, g in df.groupby("year"):
        assert sorted(g["code"]) == sorted(CODES), f"{name} {year}"


@pytest.mark.parametrize("name", STATE_TABLES + ["od_tourists", "national_key_stats", "foreign_arrivals_soe"])
def test_no_negative_numbers(name):
    num = load(name).select_dtypes("number")
    assert (num.fillna(0) >= 0).all().all()


def test_state_visitors_recompute_to_published_national_total():
    """DOSM's national 'domestic visitors' is the sum of state visits. The sheet's own
    total row is misaligned by one column, so we compare against Table 1 instead."""
    v = load("visitors_state_year").groupby("year")["visitors_k"].sum()
    nat = load("national_key_stats").set_index("year")["visitors_k"]
    for y in nat.index:
        assert v[y] == pytest.approx(nat[y], rel=5e-4), y


def test_state_workbooks_agree_with_national_table9():
    a = load("state_key_stats").set_index(["code", "year"])["visitors_k"]
    b = load("visitors_state_year").set_index(["code", "year"])["visitors_k"]
    j = pd.concat([a, b], axis=1, keys=["state_file", "national_file"]).dropna()
    assert len(j) >= 16 * 6
    assert ((j.state_file - j.national_file).abs() / j.national_file < 0.005).all()


def test_od_matrix_columns_sum_to_published_tourists():
    od = load("od_tourists")
    assert od.groupby("year").size().eq(256).all()
    nat = load("national_key_stats").set_index("year")["tourists_k"].dropna()
    tot = od.groupby("year")["tourists_k"].sum()
    for y in nat.index:
        assert tot[y] == pytest.approx(nat[y], rel=1e-3), y
    # 2023 destination totals must match each state workbook's tourist count
    d23 = od[od.year == 2023].groupby("dest")["tourists_k"].sum()
    det = load("state_detail").query("year == 2023").set_index("code")["tourists_k"]
    assert ((d23 - det).abs() / det < 0.01).all()


def test_visitor_type_split_adds_up():
    d = load("state_detail")
    k = load("state_key_stats").set_index(["code", "year"])["visitors_k"]
    s = d.set_index(["code", "year"])[["excursionists_k", "tourists_k"]].sum(axis=1)
    assert ((s - k.loc[s.index]).abs() / k.loc[s.index] < 0.005).all()
    r = d.set_index(["code", "year"])[["sameday_receipts_rm_m", "overnight_receipts_rm_m"]].sum(axis=1)
    rec = load("state_key_stats").set_index(["code", "year"])["receipts_rm_m"]
    assert ((r - rec.loc[r.index]).abs() / rec.loc[r.index] < 0.005).all()


def test_derived_ratios_match_published():
    k = load("state_key_stats").dropna()
    implied = k.receipts_rm_m * 1e6 / (k.visitors_k * 1e3)
    assert ((implied - k.spend_per_visitor_rm).abs() / k.spend_per_visitor_rm < 0.01).all()


def test_plausible_ranges():
    k = load("state_key_stats")
    assert k.avg_length_of_stay.between(1, 6).all()
    assert k.spend_per_visitor_rm.between(100, 1500).all()
    d = load("state_detail").query("year == 2023")
    assert d.rooms_napic.between(500, 100_000).all()
    assert d.hotels_napic.between(5, 1000).all()
    share_cols = [c for c in d.columns if c.endswith("_pct")]
    assert d[share_cols].fillna(0).apply(lambda s: s.between(0, 100)).all().all()
    assert (d[["mode_air_pct", "mode_water_pct", "mode_land_pct"]].sum(axis=1).between(99, 101)).all()
    p = load("population_state").query("year == 2023")
    assert 30_000 < p.population_k.sum() < 36_000


def test_boundaries_cover_all_states():
    import json
    gj = json.loads((CLEAN / "states.geojson").read_text(encoding="utf8"))
    assert sorted(f["id"] for f in gj["features"]) == sorted(CODES)
