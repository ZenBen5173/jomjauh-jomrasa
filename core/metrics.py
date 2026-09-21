"""Core metrics: concentration, Potential / Actual / Gap, bottleneck pillars,
capacity limit and the visitor simulator.

Everything here is pure pandas/numpy on the one-row-per-state panel built by
pipeline.build_panel, so the dashboard and the tests share one implementation.

Method references (see docs/prior_work.md):
  * Gini / Lorenz for tourism concentration - Fernandez-Morales et al. (2016)
  * composite index construction, min-max normalisation, equal weights,
    Monte Carlo weight sensitivity - OECD/JRC Handbook (2008), WEF TTDI
  * tourism intensity / density / Defert function - Eurostat, McElroy & de Albuquerque
  * robust z-scores (median / MAD) for the bottleneck pillars
  * output multiplier range 1.20-1.82, mean 1.42 - Mazumder et al. (2009), Malaysia I-O
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

# ------------------------------------------------------------------ concentration
def lorenz(values) -> tuple[np.ndarray, np.ndarray]:
    """Cumulative share of units (x) vs cumulative share of the total (y), ascending."""
    v = np.sort(np.asarray(values, dtype=float))
    y = np.concatenate([[0.0], np.cumsum(v) / v.sum()])
    x = np.linspace(0.0, 1.0, len(v) + 1)
    return x, y


def gini(values, weights=None) -> float:
    """Gini coefficient. With weights (e.g. population) the units are per-capita
    values and the result is the population-weighted Gini."""
    v = np.asarray(values, dtype=float)
    if weights is None:
        v = np.sort(v)
        n = len(v)
        return float((2 * np.arange(1, n + 1) - n - 1).dot(v) / (n * v.sum()))
    w = np.asarray(weights, dtype=float)
    order = np.argsort(v)
    v, w = v[order], w[order]
    cw = np.cumsum(w) / w.sum()
    cy = np.cumsum(v * w) / (v * w).sum()
    cw0, cy0 = np.concatenate([[0], cw[:-1]]), np.concatenate([[0], cy[:-1]])
    return float(1 - np.sum((cw - cw0) * (cy + cy0)))


def hhi_normalised(values) -> float:
    """Herfindahl-Hirschman index rescaled to 0 (even) .. 1 (all in one state)."""
    s = np.asarray(values, dtype=float)
    s = s / s.sum()
    n = len(s)
    return float(((s ** 2).sum() - 1 / n) / (1 - 1 / n))


def hoover(values, reference) -> float:
    """Share of visits that would have to move for visits to be proportional to
    `reference` (e.g. population)."""
    a = np.asarray(values, dtype=float) / np.sum(values)
    b = np.asarray(reference, dtype=float) / np.sum(reference)
    return float(0.5 * np.abs(a - b).sum())


def concentration(panel: pd.DataFrame, col: str = "visitors_k") -> dict:
    return {
        "gini": gini(panel[col]),
        "gini_per_capita": gini(panel[col] / panel["population_k"], panel["population_k"]),
        "hhi": hhi_normalised(panel[col]),
        "hoover_vs_population": hoover(panel[col], panel["population_k"]),
        "top3_share": float(panel[col].nlargest(3).sum() / panel[col].sum()),
    }


# ------------------------------------------------------------------ composite indices
@dataclass(frozen=True)
class Indicator:
    col: str
    label: str
    higher_is_better: bool = True
    log: bool = False           # log-transform right-skewed counts before scaling
    source: str = ""


POTENTIAL = [
    Indicator("rooms", "Accommodation supply (rooms)", log=True, source="Tourism Malaysia PAS"),
    Indicator("spare_occupancy_pct", "Spare capacity (100 - occupancy %)", source="Tourism Malaysia PAS"),
    Indicator("spend_per_visitor_rm", "Spend per visitor (RM)", source="DOSM DTS by state"),
    Indicator("avg_length_of_stay", "Average length of stay (nights)", source="DOSM DTS by state"),
    Indicator("basic_amenities_pct", "Household basic amenities access (%)", source="DOSM HIES / data.gov.my"),
    Indicator("attractions_n", "Attractions, nature & heritage sites (OSM)", log=True, source="OpenStreetMap"),
    Indicator("experience_score", "JomRasa Experience Score", source="JomRasa"),
]
ACTUAL = [
    Indicator("visitor_share_pct", "Share of national domestic visitors", log=True, source="DOSM DTS"),
    Indicator("visitors_per_resident", "Visitors per resident (intensity)", log=True, source="DOSM DTS + population"),
    Indicator("visitors_per_km2", "Visitors per km2 (density)", log=True, source="DOSM DTS + area"),
]
PILLARS = {
    "Access": [
        Indicator("market_access", "Population within reach (distance-decayed)", log=True, source="DOSM population + coordinates"),
        Indicator("airports_100km", "Airports with IATA code within 100 km", source="OpenStreetMap"),
        Indicator("rail_stations_n", "Intercity / commuter rail stations", log=True, source="OpenStreetMap"),
        Indicator("access_sentiment", "Traveller sentiment: access & transport", source="JomRasa"),
    ],
    "Awareness": [
        Indicator("out_of_state_share_pct", "Tourists from other states (%)", source="DOSM DTS Table 10"),
        Indicator("origin_diversity", "Diversity of origin states (1 - HHI)", source="DOSM DTS Table 10"),
        Indicator("foreign_guest_share_pct", "Foreign share of hotel guests (%)", source="Tourism Malaysia PAS"),
        Indicator("mentions_n", "Online travel mentions collected", log=True, source="JomRasa"),
    ],
    "Amenities": [
        Indicator("rooms_per_1000_tourists", "Rooms per 1,000 overnight tourists", log=True, source="Tourism Malaysia PAS + DOSM"),
        Indicator("rooms_per_1000_residents", "Rooms per 1,000 residents (Defert-type)", log=True, source="Tourism Malaysia PAS + DOSM"),
        Indicator("basic_amenities_pct", "Household basic amenities access (%)", source="DOSM HIES"),
        Indicator("amenity_sentiment", "Traveller sentiment: accommodation, food, cleanliness", source="JomRasa"),
    ],
}


def _prep(s: pd.Series, ind: Indicator) -> pd.Series:
    x = s.astype(float)
    if ind.log:
        x = np.log1p(x.clip(lower=0))
    return x if ind.higher_is_better else -x


def minmax(s: pd.Series, ind: Indicator, winsor: float = 0.0) -> pd.Series:
    """0-100 min-max score. Optional winsorising at the given tail quantile."""
    x = _prep(s, ind)
    if winsor:
        x = x.clip(x.quantile(winsor), x.quantile(1 - winsor))
    rng = x.max() - x.min()
    return (x - x.min()) / rng * 100 if rng > 0 else pd.Series(50.0, index=s.index)


def available(panel: pd.DataFrame, indicators: list[Indicator]) -> list[Indicator]:
    """Indicators whose column exists with no gaps (JomRasa columns appear later)."""
    return [i for i in indicators if i.col in panel and panel[i.col].notna().all()]


def composite(panel: pd.DataFrame, indicators: list[Indicator], weights: dict[str, float] | None = None,
              geometric: bool = False) -> tuple[pd.Series, pd.DataFrame]:
    inds = available(panel, indicators)
    scores = pd.DataFrame({i.col: minmax(panel[i.col], i) for i in inds}, index=panel.index)
    w = np.array([1.0 if weights is None else max(weights.get(i.col, 0.0), 0.0) for i in inds])
    if w.sum() == 0:
        w = np.ones(len(inds))
    w = w / w.sum()
    if geometric:
        total = np.exp((np.log(scores.clip(lower=1.0)) * w).sum(axis=1))
    else:
        total = (scores * w).sum(axis=1)
    return total, scores


def gap_table(panel: pd.DataFrame, weights_potential: dict | None = None,
              weights_actual: dict | None = None) -> pd.DataFrame:
    """Potential, Actual and Gap (= Potential - Actual) per state, indexed like panel."""
    pot, pot_parts = composite(panel, POTENTIAL, weights_potential)
    act, act_parts = composite(panel, ACTUAL, weights_actual)
    out = pd.DataFrame({"potential": pot, "actual": act})
    out["gap"] = out["potential"] - out["actual"]
    out["gap_rank"] = out["gap"].rank(ascending=False, method="min").astype(int)
    return out.join(pot_parts.add_prefix("p_")).join(act_parts.add_prefix("a_"))


def gap_sensitivity(panel: pd.DataFrame, n: int = 1000, seed: int = 7, alpha: float = 4.0) -> pd.DataFrame:
    """Monte Carlo over Dirichlet-random weights (both indices) plus the rank stability
    against the equal-weight baseline (Spearman rho). alpha = 4 centres the draws on equal
    weights while still letting any indicator carry roughly 0.3x to 2.5x its equal share;
    alpha = 1 is the uniform-simplex stress test."""
    rng = np.random.default_rng(seed)
    p_inds, a_inds = available(panel, POTENTIAL), available(panel, ACTUAL)
    P = np.column_stack([minmax(panel[i.col], i) for i in p_inds])
    A = np.column_stack([minmax(panel[i.col], i) for i in a_inds])
    base = P.mean(axis=1) - A.mean(axis=1)
    base_rank = pd.Series(base).rank(ascending=False).to_numpy()
    wp = rng.dirichlet(np.full(P.shape[1], alpha), n)
    wa = rng.dirichlet(np.full(A.shape[1], alpha), n)
    gaps = wp @ P.T - wa @ A.T                                   # n x states
    ranks = (-gaps).argsort(axis=1).argsort(axis=1) + 1
    rho = [np.corrcoef(base_rank, r)[0, 1] for r in ranks]
    out = pd.DataFrame({
        "gap_equal_weights": base, "rank_equal_weights": base_rank.astype(int),
        "rank_median": np.median(ranks, axis=0), "rank_p05": np.percentile(ranks, 5, axis=0),
        "rank_p95": np.percentile(ranks, 95, axis=0), "top5_frequency": (ranks <= 5).mean(axis=0),
    }, index=panel.index)
    out.attrs["spearman_median"] = float(np.median(rho))
    out.attrs["spearman_p05"] = float(np.percentile(rho, 5))
    # leave-one-indicator-out
    loo = {}
    for k, ind in enumerate(p_inds):
        keep = [j for j in range(P.shape[1]) if j != k]
        r = pd.Series(P[:, keep].mean(axis=1) - A.mean(axis=1)).rank(ascending=False).to_numpy()
        loo[ind.label] = float(np.corrcoef(base_rank, r)[0, 1])
    out.attrs["leave_one_out_spearman"] = loo
    return out


# ------------------------------------------------------------------ bottleneck diagnoser
def robust_z(s: pd.Series, ind: Indicator) -> pd.Series:
    """(x - median) / (1.4826 * MAD): distance from the national median in robust SDs."""
    x = _prep(s, ind)
    med = x.median()
    mad = (x - med).abs().median() * 1.4826
    if mad == 0:
        mad = x.std(ddof=0) or 1.0
    return ((x - med) / mad).clip(-3, 3)


def bottlenecks(panel: pd.DataFrame) -> pd.DataFrame:
    """Pillar scores (0-100, 50 = national median) and the weakest pillar per state."""
    out = pd.DataFrame(index=panel.index)
    for pillar, inds in PILLARS.items():
        z = pd.DataFrame({i.col: robust_z(panel[i.col], i) for i in available(panel, inds)})
        out[pillar] = (50 + z.mean(axis=1) * 50 / 3).clip(0, 100)
        for c in z:
            out[f"z_{pillar}_{c}"] = z[c]
    pillars = list(PILLARS)
    out["bottleneck"] = out[pillars].idxmin(axis=1)
    out["bottleneck_score"] = out[pillars].min(axis=1)
    return out


# ------------------------------------------------------------------ capacity + simulator
@dataclass
class Assumptions:
    target_occupancy_pct: float = 75.0   # ceiling the destination's hotels may run at
    guests_per_room: float = 2.0         # persons sharing one room
    days: int = 365
    multiplier: float = 1.0              # 1.0 = off. Mazumder et al. (2009): 1.20-1.82, mean 1.42


def capacity(panel: pd.DataFrame, a: Assumptions = Assumptions()) -> pd.DataFrame:
    """Capacity Limit. Spare room-nights = rooms x days x (target - current occupancy).
    Only overnight visitors in paid accommodation need rooms, so one extra *visitor* needs
    overnight_share x paid_accommodation_share x length_of_stay / guests_per_room room-nights."""
    out = pd.DataFrame(index=panel.index)
    headroom = (a.target_occupancy_pct - panel["occupancy_pct"]).clip(lower=0) / 100
    out["spare_room_nights"] = panel["rooms"] * a.days * headroom
    out["room_nights_per_visitor"] = (panel["overnight_share"] * panel["paid_accommodation_share"]
                                      * panel["avg_length_of_stay"] / a.guests_per_room)
    out["max_extra_visitors_k"] = out["spare_room_nights"] / out["room_nights_per_visitor"] / 1e3
    return out


@dataclass
class Scenario:
    origin: str                      # state losing visitors (index label of panel)
    destinations: dict[str, float]   # destination -> share of the moved visitors (sums to 1)
    share_pct: float                 # % of the origin's visitors to redirect
    assumptions: Assumptions = field(default_factory=Assumptions)


def allocate(requested: float, weights: dict[str, float], limits: dict[str, float]) -> dict[str, float]:
    """Split `requested` across destinations by weight. A destination that hits its Capacity
    Limit keeps its limit and the overflow is re-offered to the others (water-filling), so
    visitors are only left unmoved when every destination is full."""
    moved = {d: 0.0 for d in weights}
    open_ = {d for d, w in weights.items() if w > 0 and limits[d] > 0}
    left = requested
    while left > 1e-9 and open_:
        wsum = sum(weights[d] for d in open_)
        share = {d: left * weights[d] / wsum for d in open_}
        full = {d for d in open_ if moved[d] + share[d] >= limits[d] - 1e-12}
        if not full:
            for d in open_:
                moved[d] += share[d]
            break
        for d in full:
            left -= limits[d] - moved[d]
            moved[d] = limits[d]
        open_ -= full
    return moved


def simulate(panel: pd.DataFrame, sc: Scenario) -> dict:
    """What-if rebalancing. Redirected visitors are assumed to behave like the destination's
    current average visitor (spend, overnight share, length of stay)."""
    a = sc.assumptions
    cap = capacity(panel, a)
    requested = panel.at[sc.origin, "visitors_k"] * sc.share_pct / 100
    alloc = allocate(requested, sc.destinations, {d: float(cap.at[d, "max_extra_visitors_k"]) for d in sc.destinations})
    tot = sum(sc.destinations.values()) or 1.0
    rows, moved_total = [], 0.0
    for dest, w in sc.destinations.items():
        want = requested * w / tot
        limit = float(cap.at[dest, "max_extra_visitors_k"])
        moved = alloc[dest]
        moved_total += moved
        rn_needed = moved * 1e3 * cap.at[dest, "room_nights_per_visitor"]
        rows.append({
            "dest": dest, "requested_k": want, "moved_k": moved, "capped": bool(want > 0 and moved >= limit - 1e-9),
            "capacity_limit_k": limit,
            "receipts_gained_rm_m": moved * panel.at[dest, "spend_per_visitor_rm"] / 1e3,
            "room_nights_needed": rn_needed, "spare_room_nights": float(cap.at[dest, "spare_room_nights"]),
            "occupancy_before_pct": float(panel.at[dest, "occupancy_pct"]),
            "occupancy_after_pct": float(panel.at[dest, "occupancy_pct"]
                                         + rn_needed / (panel.at[dest, "rooms"] * a.days) * 100),
        })
    dests = pd.DataFrame(rows).set_index("dest")

    after = panel.copy()
    after.loc[sc.origin, "visitors_k"] -= moved_total
    for d in dests.index:
        after.loc[d, "visitors_k"] += dests.at[d, "moved_k"]
    lost = moved_total * panel.at[sc.origin, "spend_per_visitor_rm"] / 1e3
    gained = float(dests["receipts_gained_rm_m"].sum())
    after["receipts_rm_m"] = panel["receipts_rm_m"]
    after.loc[sc.origin, "receipts_rm_m"] -= lost
    for d in dests.index:
        after.loc[d, "receipts_rm_m"] += dests.at[d, "receipts_gained_rm_m"]
    for df in (after,):
        df["visitor_share_pct"] = df["visitors_k"] / df["visitors_k"].sum() * 100
        df["visitors_per_resident"] = df["visitors_k"] / df["population_k"]
        df["visitors_per_km2"] = df["visitors_k"] * 1e3 / df["area_km2"]

    o_rn = moved_total * 1e3 * cap.at[sc.origin, "room_nights_per_visitor"]
    return {
        "requested_k": requested, "moved_k": moved_total, "capacity_binds": bool(moved_total < requested - 1e-6),
        "destinations": dests,
        "receipts_gained_rm_m": gained, "receipts_lost_rm_m": lost, "net_national_rm_m": gained - lost,
        "multiplier": a.multiplier,
        "economic_impact_gained_rm_m": gained * a.multiplier,
        "origin": {
            "visitors_before_k": float(panel.at[sc.origin, "visitors_k"]),
            "visitors_after_k": float(after.at[sc.origin, "visitors_k"]),
            "per_resident_before": float(panel.at[sc.origin, "visitors_per_resident"]),
            "per_resident_after": float(after.at[sc.origin, "visitors_per_resident"]),
            "room_nights_freed": float(o_rn),
            "occupancy_before_pct": float(panel.at[sc.origin, "occupancy_pct"]),
            "occupancy_after_pct": float(panel.at[sc.origin, "occupancy_pct"]
                                         - o_rn / (panel.at[sc.origin, "rooms"] * a.days) * 100),
        },
        "concentration_before": concentration(panel),
        "concentration_after": concentration(after),
        "receipts_gini_before": gini(panel["receipts_rm_m"]),
        "receipts_gini_after": gini(after["receipts_rm_m"]),
        "panel_after": after,
    }
