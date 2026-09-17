/**
 * Client-side port of core/metrics.py. The Python module is the reference
 * implementation; metrics.test.ts checks this file reproduces
 * public/data/reference.json to 1e-6.
 */

export type Row = Record<string, number | string | null> & { code: string };

export interface Indicator {
  col: string;
  label: string;
  higher_is_better: boolean;
  log: boolean;
  source: string;
}

export interface Assumptions {
  target_occupancy_pct: number;
  guests_per_room: number;
  days: number;
  multiplier: number;
}

export type Weights = Record<string, number>;

const num = (r: Row, c: string) => r[c] as number;
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

// ------------------------------------------------------------ concentration
export function lorenz(values: number[]): { x: number[]; y: number[] } {
  const v = [...values].sort((a, b) => a - b);
  const total = sum(v);
  const y = [0];
  v.forEach((d, i) => y.push(y[i] + d / total));
  return { x: y.map((_, i) => i / v.length), y };
}

export function gini(values: number[], weights?: number[]): number {
  if (!weights) {
    const v = [...values].sort((a, b) => a - b);
    const n = v.length;
    return sum(v.map((d, i) => (2 * (i + 1) - n - 1) * d)) / (n * sum(v));
  }
  const idx = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const v = idx.map((i) => values[i]);
  const w = idx.map((i) => weights[i]);
  const W = sum(w);
  const Y = sum(v.map((d, i) => d * w[i]));
  let cw = 0, cy = 0, acc = 0;
  v.forEach((d, i) => {
    const cw1 = cw + w[i] / W;
    const cy1 = cy + (d * w[i]) / Y;
    acc += (cw1 - cw) * (cy1 + cy);
    cw = cw1;
    cy = cy1;
  });
  return 1 - acc;
}

export function hhiNormalised(values: number[]): number {
  const t = sum(values), n = values.length;
  return (sum(values.map((v) => (v / t) ** 2)) - 1 / n) / (1 - 1 / n);
}

export function hoover(values: number[], reference: number[]): number {
  const a = sum(values), b = sum(reference);
  return 0.5 * sum(values.map((v, i) => Math.abs(v / a - reference[i] / b)));
}

export function concentration(rows: Row[], col = "visitors_k") {
  const v = rows.map((r) => num(r, col));
  const pop = rows.map((r) => num(r, "population_k"));
  const top3 = [...v].sort((a, b) => b - a).slice(0, 3);
  return {
    gini: gini(v),
    gini_per_capita: gini(v.map((d, i) => d / pop[i]), pop),
    hhi: hhiNormalised(v),
    hoover_vs_population: hoover(v, pop),
    top3_share: sum(top3) / sum(v),
  };
}

// ------------------------------------------------------------ composite indices
const prep = (x: number, ind: Indicator) => {
  const t = ind.log ? Math.log1p(Math.max(x, 0)) : x;
  return ind.higher_is_better ? t : -t;
};

export function available(rows: Row[], inds: Indicator[]): Indicator[] {
  return inds.filter((i) => rows.every((r) => typeof r[i.col] === "number" && Number.isFinite(r[i.col] as number)));
}

export function minmax(rows: Row[], ind: Indicator): number[] {
  const x = rows.map((r) => prep(num(r, ind.col), ind));
  const lo = Math.min(...x), hi = Math.max(...x);
  return x.map((d) => (hi > lo ? ((d - lo) / (hi - lo)) * 100 : 50));
}

export function composite(rows: Row[], inds: Indicator[], weights?: Weights) {
  const used = available(rows, inds);
  const scores = used.map((i) => minmax(rows, i));
  let w = used.map((i) => (weights ? Math.max(weights[i.col] ?? 0, 0) : 1));
  if (sum(w) === 0) w = used.map(() => 1);
  const W = sum(w);
  const total = rows.map((_, r) => sum(scores.map((s, k) => (s[r] * w[k]) / W)));
  return { total, used, scores, weights: w.map((d) => d / W) };
}

export interface GapRow {
  code: string;
  potential: number;
  actual: number;
  gap: number;
  gap_rank: number;
  parts: Record<string, number>;
}

export function gapTable(rows: Row[], potential: Indicator[], actual: Indicator[], wp?: Weights, wa?: Weights): GapRow[] {
  const p = composite(rows, potential, wp);
  const a = composite(rows, actual, wa);
  const gaps = rows.map((_, i) => p.total[i] - a.total[i]);
  return rows.map((r, i) => ({
    code: r.code,
    potential: p.total[i],
    actual: a.total[i],
    gap: gaps[i],
    gap_rank: 1 + gaps.filter((g) => g > gaps[i]).length,
    parts: Object.fromEntries([
      ...p.used.map((ind, k) => [ind.col, p.scores[k][i]] as const),
      ...a.used.map((ind, k) => [ind.col, a.scores[k][i]] as const),
    ]),
  }));
}

/** Small seeded PRNG so the sensitivity panel is reproducible. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gammaInt(k: number, rnd: () => number) {
  let s = 0;
  for (let i = 0; i < k; i++) s -= Math.log(1 - rnd());
  return s;
}
const ranksDesc = (g: number[]) => g.map((v) => 1 + g.filter((o) => o > v).length);

function spearman(a: number[], b: number[]) {
  const n = a.length, ma = sum(a) / n, mb = sum(b) / n;
  const cov = sum(a.map((d, i) => (d - ma) * (b[i] - mb)));
  return cov / Math.sqrt(sum(a.map((d) => (d - ma) ** 2)) * sum(b.map((d) => (d - mb) ** 2)));
}

/** Monte Carlo over Dirichlet(alpha) weights: rank intervals + Spearman vs equal weights. */
export function gapSensitivity(rows: Row[], potential: Indicator[], actual: Indicator[], n = 600, alpha = 4, seed = 7) {
  const rnd = mulberry32(seed);
  const P = available(rows, potential).map((i) => minmax(rows, i));
  const A = available(rows, actual).map((i) => minmax(rows, i));
  const mix = (S: number[][], w: number[]) => rows.map((_, r) => sum(S.map((s, k) => s[r] * w[k])));
  const eq = (S: number[][]) => S.map(() => 1 / S.length);
  const base = mix(P, eq(P)).map((d, i) => d - mix(A, eq(A))[i]);
  const baseRank = ranksDesc(base);
  const draws: number[][] = [], rhos: number[] = [];
  const dirichlet = (k: number) => {
    const g = Array.from({ length: k }, () => gammaInt(alpha, rnd));
    const t = sum(g);
    return g.map((d) => d / t);
  };
  for (let s = 0; s < n; s++) {
    const p = mix(P, dirichlet(P.length)), a = mix(A, dirichlet(A.length));
    const rk = ranksDesc(p.map((d, i) => d - a[i]));
    draws.push(rk);
    rhos.push(spearman(baseRank, rk));
  }
  const q = (arr: number[], p: number) => [...arr].sort((x, y) => x - y)[Math.min(arr.length - 1, Math.floor(p * arr.length))];
  return {
    spearmanMedian: q(rhos, 0.5),
    spearmanP05: q(rhos, 0.05),
    states: rows.map((r, i) => {
      const col = draws.map((d) => d[i]);
      return { code: r.code, rank: baseRank[i], p05: q(col, 0.05), median: q(col, 0.5), p95: q(col, 0.95),
               top5: col.filter((d) => d <= 5).length / n };
    }),
  };
}

// ------------------------------------------------------------ bottleneck finder
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function robustZ(rows: Row[], ind: Indicator): number[] {
  const x = rows.map((r) => prep(num(r, ind.col), ind));
  const med = median(x);
  let mad = median(x.map((d) => Math.abs(d - med))) * 1.4826;
  if (mad === 0) {
    const m = sum(x) / x.length;
    mad = Math.sqrt(sum(x.map((d) => (d - m) ** 2)) / x.length) || 1;
  }
  return x.map((d) => Math.max(-3, Math.min(3, (d - med) / mad)));
}

export interface PillarRow {
  code: string;
  scores: Record<string, number>;
  z: Record<string, Record<string, number>>;
  bottleneck: string;
  bottleneck_score: number;
}

export function bottlenecks(rows: Row[], pillars: Record<string, Indicator[]>): PillarRow[] {
  const out: PillarRow[] = rows.map((r) => ({ code: r.code, scores: {}, z: {}, bottleneck: "", bottleneck_score: 0 }));
  for (const [pillar, inds] of Object.entries(pillars)) {
    const used = available(rows, inds);
    const zs = used.map((i) => robustZ(rows, i));
    rows.forEach((_, r) => {
      const mean = sum(zs.map((z) => z[r])) / zs.length;
      out[r].scores[pillar] = Math.max(0, Math.min(100, 50 + (mean * 50) / 3));
      out[r].z[pillar] = Object.fromEntries(used.map((ind, k) => [ind.col, zs[k][r]]));
    });
  }
  for (const o of out) {
    const [name, score] = Object.entries(o.scores).reduce((m, e) => (e[1] < m[1] ? e : m));
    o.bottleneck = name;
    o.bottleneck_score = score;
  }
  return out;
}

// ------------------------------------------------------------ capacity + simulator
export interface CapacityRow {
  code: string;
  spare_room_nights: number;
  room_nights_per_visitor: number;
  max_extra_visitors_k: number;
}

export function capacity(rows: Row[], a: Assumptions): CapacityRow[] {
  return rows.map((r) => {
    const headroom = Math.max(a.target_occupancy_pct - num(r, "occupancy_pct"), 0) / 100;
    const spare = num(r, "rooms") * a.days * headroom;
    const per = (num(r, "overnight_share") * num(r, "paid_accommodation_share") * num(r, "avg_length_of_stay")) / a.guests_per_room;
    return { code: r.code, spare_room_nights: spare, room_nights_per_visitor: per, max_extra_visitors_k: spare / per / 1e3 };
  });
}

export interface Scenario {
  origin: string;
  destinations: Record<string, number>;
  share_pct: number;
}

export function simulate(rows: Row[], sc: Scenario, a: Assumptions) {
  const by = Object.fromEntries(rows.map((r) => [r.code, r]));
  const cap = Object.fromEntries(capacity(rows, a).map((c) => [c.code, c]));
  const o = by[sc.origin];
  const requested = (num(o, "visitors_k") * sc.share_pct) / 100;
  const tot = sum(Object.values(sc.destinations)) || 1;
  const dests = Object.entries(sc.destinations).map(([code, w]) => {
    const d = by[code];
    const want = (requested * w) / tot;
    const limit = cap[code].max_extra_visitors_k;
    const moved = Math.min(want, limit);
    const rn = moved * 1e3 * cap[code].room_nights_per_visitor;
    return {
      code, requested_k: want, moved_k: moved, capped: want > limit + 1e-9, capacity_limit_k: limit,
      receipts_gained_rm_m: (moved * num(d, "spend_per_visitor_rm")) / 1e3,
      room_nights_needed: rn, spare_room_nights: cap[code].spare_room_nights,
      occupancy_before_pct: num(d, "occupancy_pct"),
      occupancy_after_pct: num(d, "occupancy_pct") + (rn / (num(d, "rooms") * a.days)) * 100,
    };
  });
  const moved = sum(dests.map((d) => d.moved_k));
  const gained = sum(dests.map((d) => d.receipts_gained_rm_m));
  const lost = (moved * num(o, "spend_per_visitor_rm")) / 1e3;
  const after: Row[] = rows.map((r) => {
    const dest = dests.find((d) => d.code === r.code);
    const dv = (r.code === sc.origin ? -moved : 0) + (dest ? dest.moved_k : 0);
    const dr = (r.code === sc.origin ? -lost : 0) + (dest ? dest.receipts_gained_rm_m : 0);
    return { ...r, visitors_k: num(r, "visitors_k") + dv, receipts_rm_m: num(r, "receipts_rm_m") + dr };
  });
  const totalAfter = sum(after.map((r) => num(r, "visitors_k")));
  for (const r of after) {
    r.visitor_share_pct = (num(r, "visitors_k") / totalAfter) * 100;
    r.visitors_per_resident = num(r, "visitors_k") / num(r, "population_k");
    r.visitors_per_km2 = (num(r, "visitors_k") * 1e3) / num(r, "area_km2");
  }
  const oRn = moved * 1e3 * cap[sc.origin].room_nights_per_visitor;
  const oAfter = after.find((r) => r.code === sc.origin)!;
  return {
    requested_k: requested, moved_k: moved, capacity_binds: dests.some((d) => d.capped), destinations: dests,
    receipts_gained_rm_m: gained, receipts_lost_rm_m: lost, net_national_rm_m: gained - lost,
    economic_impact_gained_rm_m: gained * a.multiplier,
    origin: {
      visitors_before_k: num(o, "visitors_k"), visitors_after_k: num(oAfter, "visitors_k"),
      per_resident_before: num(o, "visitors_per_resident"), per_resident_after: num(oAfter, "visitors_per_resident"),
      room_nights_freed: oRn, occupancy_before_pct: num(o, "occupancy_pct"),
      occupancy_after_pct: num(o, "occupancy_pct") - (oRn / (num(o, "rooms") * a.days)) * 100,
    },
    concentration_before: concentration(rows), concentration_after: concentration(after),
    receipts_gini_before: gini(rows.map((r) => num(r, "receipts_rm_m"))),
    receipts_gini_after: gini(after.map((r) => num(r, "receipts_rm_m"))),
    after,
  };
}
