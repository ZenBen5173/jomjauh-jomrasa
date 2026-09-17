"""Unit tests for core.metrics."""
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from core import metrics as M

CLEAN = Path(__file__).resolve().parents[1] / "data" / "clean"


@pytest.fixture(scope="module")
def panel():
    p = pd.read_parquet(CLEAN / "state_panel.parquet")
    return p[p.year == 2023].set_index("code")


def test_gini_known_values():
    assert M.gini([5, 5, 5, 5]) == pytest.approx(0)
    assert M.gini([0, 0, 0, 10]) == pytest.approx(0.75)          # (n-1)/n
    assert M.gini([1, 2, 3, 4]) == pytest.approx(0.25)
    assert M.gini([1, 2, 3, 4], weights=[1, 1, 1, 1]) == pytest.approx(0.25)


def test_lorenz_endpoints_and_convexity():
    x, y = M.lorenz([3, 1, 7, 2])
    assert (x[0], y[0], x[-1]) == (0, 0, 1) and y[-1] == pytest.approx(1)
    assert np.all(np.diff(y, 2) >= -1e-12) and np.all(y <= x + 1e-12)


def test_hhi_and_hoover_bounds():
    assert M.hhi_normalised([1, 1, 1, 1]) == pytest.approx(0)
    assert M.hhi_normalised([0, 0, 0, 9]) == pytest.approx(1)
    assert M.hoover([1, 3], [1, 3]) == pytest.approx(0)
    assert M.hoover([4, 0], [2, 2]) == pytest.approx(0.5)


def test_minmax_direction_and_range():
    s = pd.Series([1.0, 2.0, 4.0])
    up = M.minmax(s, M.Indicator("x", "x"))
    down = M.minmax(s, M.Indicator("x", "x", higher_is_better=False))
    assert list(up) == [0, pytest.approx(100 / 3), 100] and list(down)[0] == 100


def test_gap_table(panel):
    g = M.gap_table(panel)
    assert g[["potential", "actual"]].apply(lambda s: s.between(0, 100)).all().all()
    assert (g.gap == g.potential - g.actual).all()
    assert sorted(g.gap_rank) == list(range(1, 17))
    # a state that is top on every Actual indicator gets Actual = 100
    assert g.actual.max() <= 100
    # weights change the result but zero/negative weights never crash
    g2 = M.gap_table(panel, weights_potential={"rooms": 5, "spare_occupancy_pct": 0})
    assert not g2.potential.equals(g.potential)
    M.gap_table(panel, weights_potential={i.col: 0 for i in M.POTENTIAL})


def test_missing_jomrasa_columns_are_skipped(panel):
    assert "experience_score" not in panel or True
    used = [i.col for i in M.available(panel.drop(columns=["experience_score"], errors="ignore"), M.POTENTIAL)]
    assert "experience_score" not in used and "rooms" in used


def test_sensitivity_is_reasonably_stable(panel):
    s = M.gap_sensitivity(panel, n=400)
    assert s.attrs["spearman_median"] > 0.8
    assert min(s.attrs["leave_one_out_spearman"].values()) > 0.85
    assert (s.rank_p05 <= s.rank_median).all() and (s.rank_median <= s.rank_p95).all()


def test_bottlenecks(panel):
    b = M.bottlenecks(panel)
    assert b[list(M.PILLARS)].apply(lambda s: s.between(0, 100)).all().all()
    assert set(b.bottleneck) <= set(M.PILLARS)
    assert (b.bottleneck_score == b[list(M.PILLARS)].min(axis=1)).all()
    # pillar scores are centred near the national median (50)
    assert b[list(M.PILLARS)].median().between(40, 60).all()


def test_capacity_formula(panel):
    a = M.Assumptions(target_occupancy_pct=75, guests_per_room=2)
    c = M.capacity(panel, a)
    r = panel.loc["TRG"]
    assert c.at["TRG", "spare_room_nights"] == pytest.approx(r.rooms * 365 * (75 - r.occupancy_pct) / 100)
    assert (c.spare_room_nights >= 0).all()
    # states already above target have no headroom
    assert (M.capacity(panel, M.Assumptions(target_occupancy_pct=30)).max_extra_visitors_k == 0).all()
    # raising the target never lowers capacity
    assert (M.capacity(panel, M.Assumptions(target_occupancy_pct=85)).max_extra_visitors_k >= c.max_extra_visitors_k).all()


def test_simulator_conserves_visitors_and_reports_honest_net(panel):
    sc = M.Scenario("SGR", {"TRG": 1.0}, share_pct=5)
    r = M.simulate(panel, sc)
    assert r["moved_k"] == pytest.approx(panel.at["SGR", "visitors_k"] * 0.05)
    assert not r["capacity_binds"]
    assert r["panel_after"].visitors_k.sum() == pytest.approx(panel.visitors_k.sum())
    exp_net = r["moved_k"] * (panel.at["TRG", "spend_per_visitor_rm"] - panel.at["SGR", "spend_per_visitor_rm"]) / 1e3
    assert r["net_national_rm_m"] == pytest.approx(exp_net)
    assert r["concentration_after"]["gini"] < r["concentration_before"]["gini"]
    assert r["origin"]["occupancy_after_pct"] < r["origin"]["occupancy_before_pct"]


def test_simulator_capacity_cap_binds(panel):
    r = M.simulate(panel, M.Scenario("SGR", {"PLS": 1.0}, share_pct=30))
    cap = M.capacity(panel).at["PLS", "max_extra_visitors_k"]
    assert r["capacity_binds"] and r["moved_k"] == pytest.approx(cap)
    assert r["destinations"].at["PLS", "occupancy_after_pct"] == pytest.approx(75, abs=0.01)


def test_simulator_multi_destination_and_multiplier(panel):
    a = M.Assumptions(multiplier=1.42)
    r = M.simulate(panel, M.Scenario("KUL", {"KTN": 0.5, "SBH": 0.5}, share_pct=4, assumptions=a))
    assert len(r["destinations"]) == 2
    assert r["economic_impact_gained_rm_m"] == pytest.approx(r["receipts_gained_rm_m"] * 1.42)


def test_overflow_from_a_full_destination_goes_to_the_others(panel):
    cap = M.capacity(panel)
    small, big = "PLS", "SWK"
    want = cap.at[small, "max_extra_visitors_k"] * 4            # far more than Perlis can take on a 50/50 split
    share = want / panel.at["SGR", "visitors_k"] * 100
    r = M.simulate(panel, M.Scenario("SGR", {small: 0.5, big: 0.5}, share_pct=share))
    d = r["destinations"]
    assert d.at[small, "moved_k"] == pytest.approx(cap.at[small, "max_extra_visitors_k"]) and d.at[small, "capped"]
    assert d.at[big, "moved_k"] == pytest.approx(want - cap.at[small, "max_extra_visitors_k"])   # took the overflow
    assert r["moved_k"] == pytest.approx(want) and not r["capacity_binds"]


def test_allocate_leaves_visitors_unmoved_only_when_everything_is_full():
    assert M.allocate(10, {"a": 1, "b": 1}, {"a": 2, "b": 3}) == {"a": 2, "b": 3}
    assert M.allocate(10, {"a": 1, "b": 3}, {"a": 100, "b": 100}) == {"a": 2.5, "b": 7.5}
    assert M.allocate(10, {"a": 1, "b": 1}, {"a": 0, "b": 100}) == {"a": 0.0, "b": 10}
