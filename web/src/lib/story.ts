/** The numbers behind the four-step story on the dashboard. Shared by the story cards and the guide, so they can never disagree. */
import { type Assumptions, type CapacityRow, type GapRow, type PillarRow, type Row, simulate } from "./metrics";

const TERRITORIES = ["KUL", "LBN", "PJY"];
export const PILLARS = ["Access", "Awareness", "Amenities"] as const;

export function storyFacts(rows: Row[], gap: GapRow[], pillars: PillarRow[], capacity: CapacityRow[], assumptions: Assumptions) {
  const total = rows.reduce((a, r) => a + (r.visitors_k as number), 0);
  const byVisits = [...rows].sort((a, b) => (b.visitors_k as number) - (a.visitors_k as number));
  const ranked = [...gap].sort((a, b) => b.gap - a.gap);
  const untapped = ranked.slice(0, 5).map((g) => g.code);
  const held = pillars.filter((p) => p.bottleneck_score < 50);
  // the payoff example: a tenth of the busiest state's trips, shared by the three most under-visited full states
  const dests = ranked.filter((g) => !TERRITORIES.includes(g.code)).slice(0, 3).map((g) => g.code);
  const origin = byVisits[0].code;
  const sim = simulate(rows, { origin, destinations: Object.fromEntries(dests.map((d) => [d, 1])), share_pct: 10 }, assumptions);
  return {
    total, untapped, held, dests, origin, sim,
    top3: byVisits.slice(0, 3).map((r) => r.code),
    top3Share: byVisits.slice(0, 3).reduce((a, r) => a + (r.visitors_k as number), 0) / total,
    room: capacity.filter((c) => untapped.includes(c.code)).reduce((a, c) => a + c.max_extra_visitors_k, 0),
    shares: byVisits.map((r) => ({ code: r.code, share: (r.visitors_k as number) / total })),
    groups: PILLARS.map((k) => ({ k, n: held.filter((p) => p.bottleneck === k).length })),
    giniChangePct: (sim.concentration_after.gini / sim.concentration_before.gini - 1) * 100,
  };
}
export type StoryFacts = ReturnType<typeof storyFacts>;
