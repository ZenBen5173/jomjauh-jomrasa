import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type GuideCtx, explain } from "./guide";
import { bottlenecks, capacity, concentration, gapTable, type Row } from "./metrics";
import { storyFacts } from "./story";

const load = (f: string) => JSON.parse(readFileSync(join(__dirname, "../../public/data", f), "utf8"));
const panel = load("panel.json"), meta = load("meta.json");
const year: number = panel.default_year;
const rows: Row[] = panel.rows[year];
const gap = gapTable(rows, meta.indicators.potential, meta.indicators.actual);
const pillars = bottlenecks(rows, meta.indicators.pillars), assumptions = meta.assumptions_default;
const cap = capacity(rows, assumptions);
const ctx: GuideCtx = { rows, gap, pillars, capacity: cap, assumptions, concentration: concentration(rows), year, facts: storyFacts(rows, gap, pillars, cap, assumptions) };

const KEYS = [
  "problem", "opportunity", "obstacle", "payoff", "stat:visits", "stat:spending", "stat:gini", "ranking", "weights", "reading", "year", "travellers",
  "chart:lorenz", "chart:gini", "chart:feel", ...["gap", "visitors", "occupancy", "spend", "feel", "bottleneck"].map((m) => `metric:${m}`),
  ...rows.flatMap((r) => [`state:${r.code}`, ...["visited", "offer", "pillars", "room", "feel", "profile", "simulate"].map((p) => `panel:${p}:${r.code}`)]),
];

describe("the guide's lines", () => {
  it("has something to say for every zone on the dashboard, with no unfilled blanks", () => {
    for (const k of KEYS) {
      const s = explain(k, ctx);
      expect(s, k).not.toBeNull();
      expect(s!.text, k).not.toMatch(/undefined|NaN|null|\$\{/);
      expect(s!.text.length, k).toBeLessThan(420);
    }
  });
  it("stays silent for zones it does not know", () => {
    expect(explain("nonsense", ctx)).toBeNull();
    expect(explain("state:XXX", ctx)).toBeNull();
  });
  it("quotes the same numbers the story cards show", () => {
    const top3 = [...rows].sort((a, b) => (b.visitors_k as number) - (a.visitors_k as number)).slice(0, 3).reduce((s, r) => s + (r.visitors_k as number), 0);
    const total = rows.reduce((s, r) => s + (r.visitors_k as number), 0);
    expect(explain("problem", ctx)!.text).toContain(`${((top3 / total) * 100).toFixed(0)}%`);
    expect(explain("obstacle", ctx)!.text).toContain(`${pillars.filter((p) => p.bottleneck_score < 50).length} of 16`);
  });
  it("colours each line by the stage it belongs to", () => {
    expect(explain("problem", ctx)!.stage).toBe("problem");
    expect(explain("metric:bottleneck", ctx)!.stage).toBe("obstacle");
    expect(explain("payoff", ctx)!.stage).toBe("payoff");
    const best = [...gap].sort((a, b) => b.gap - a.gap)[0], worst = [...gap].sort((a, b) => a.gap - b.gap)[0];
    expect(explain(`state:${best.code}`, ctx)!.stage).toBe("opportunity");
    expect(explain(`state:${worst.code}`, ctx)!.stage).toBe("problem");
  });
});
