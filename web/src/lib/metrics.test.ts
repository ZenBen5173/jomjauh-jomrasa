import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as M from "./metrics";

const load = (f: string) => JSON.parse(readFileSync(join(__dirname, "../../public/data", f), "utf8"));
const panel = load("panel.json");
const meta = load("meta.json");
const ref = load("reference.json");
const { potential, actual, pillars } = meta.indicators;
const A: M.Assumptions = meta.assumptions_default;
// inputs are exported rounded to 6 dp, so compare with a relative tolerance
const near = (got: number, want: number) => expect(Math.abs(got - want)).toBeLessThanOrEqual(1e-5 * Math.max(1, Math.abs(want)));

describe("TypeScript metrics reproduce the Python reference", () => {
  for (const year of panel.years as number[]) {
    const rows: M.Row[] = panel.rows[year];
    const r = ref[year];

    it(`${year} concentration + lorenz`, () => {
      const c = M.concentration(rows);
      for (const k of Object.keys(r.concentration)) near(c[k as keyof typeof c], r.concentration[k]);
      near(M.gini(rows.map((d) => d.receipts_rm_m as number)), r.receipts_gini);
      M.lorenz(rows.map((d) => d.visitors_k as number)).y.forEach((y, i) => expect(y).toBeCloseTo(r.lorenz_y[i], 6));
    });

    it(`${year} gap table`, () => {
      for (const g of M.gapTable(rows, potential, actual)) {
        near(g.potential, r.gap[g.code].potential);
        near(g.actual, r.gap[g.code].actual);
        expect(g.gap_rank).toBe(r.gap[g.code].gap_rank);
      }
    });

    it(`${year} bottlenecks`, () => {
      for (const b of M.bottlenecks(rows, pillars)) {
        for (const p of Object.keys(pillars)) near(b.scores[p], r.pillars[b.code][p]);
        expect(b.bottleneck).toBe(r.pillars[b.code].bottleneck);
      }
    });

    it(`${year} capacity`, () => {
      for (const c of M.capacity(rows, A)) {
        near(c.spare_room_nights, r.capacity[c.code].spare_room_nights);
        near(c.max_extra_visitors_k, r.capacity[c.code].max_extra_visitors_k);
      }
    });
  }

  it("simulator scenarios", () => {
    const rows: M.Row[] = panel.rows[panel.default_year];
    for (const s of ref.simulations) {
      const out = M.simulate(rows, { origin: s.origin, destinations: s.destinations, share_pct: s.share_pct },
                             { ...A, multiplier: s.multiplier });
      near(out.moved_k, s.moved_k);
      expect(out.capacity_binds).toBe(s.capacity_binds);
      near(out.receipts_gained_rm_m, s.receipts_gained_rm_m);
      near(out.net_national_rm_m, s.net_national_rm_m);
      near(out.concentration_after.gini, s.gini_after);
      near(out.origin.occupancy_after_pct, s.origin_occupancy_after_pct);
      for (const d of out.destinations) near(d.occupancy_after_pct, s.dest_occupancy_after_pct[d.code]);
    }
  });

  it("sensitivity is stable and deterministic", () => {
    const rows: M.Row[] = panel.rows[panel.default_year];
    const a = M.gapSensitivity(rows, potential, actual, 300);
    const b = M.gapSensitivity(rows, potential, actual, 300);
    expect(a.spearmanMedian).toBeGreaterThan(0.8);
    expect(a).toEqual(b);
  });
});
