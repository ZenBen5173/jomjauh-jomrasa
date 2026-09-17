import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JR, TOPIC_LABEL } from "./jomrasa";
import { gapTable, type Row } from "./metrics";
import { EXAMPLES, parseLocal, recommend } from "./planner";

const load = (f: string) => JSON.parse(readFileSync(join(__dirname, "../../public/data", f), "utf8"));
const panel = load("panel.json"), meta = load("meta.json");
const rows: Row[] = panel.rows[panel.default_year];
const gap = gapTable(rows, meta.indicators.potential, meta.indicators.actual);
const labels = Object.fromEntries(rows.map((r) => [r.code, r.label as string]));

describe("keyword fallback parser", () => {
  it("reads English, Malay and Mandarin requests", () => {
    const en = parseLocal("nice scenery, few crowds, not too expensive, sunrise or sunset, nature vibe");
    expect(en.topics.scenery_nature).toBe(1); expect(en.budget).toBe("low"); expect(en.quiet).toBe(1);
    const ms = parseLocal("nak makan sedap, tempat tenang, bajet murah");
    expect(ms.topics.food).toBe(1); expect(ms.budget).toBe("low"); expect(ms.emotions).toContain("calm");
    const zh = parseLocal("想去人少的地方，看文化古迹，吃地道美食");
    expect(zh.topics.culture_heritage).toBe(1); expect(zh.topics.food).toBe(1); expect(zh.quiet).toBe(1);
  });
  it("never returns an empty preference set", () => {
    expect(Object.keys(parseLocal("surprise me").topics).length).toBeGreaterThan(0);
  });
});

describe.skipIf(!JR.ready)("recommendations", () => {
  it("every example returns 16 ranked states with reasons, and varied winners", () => {
    const winners = new Set<string>();
    for (const e of EXAMPLES) {
      const recs = recommend(e.prefs, rows, gap, labels, TOPIC_LABEL);
      expect(recs).toHaveLength(16);
      expect(recs[0].score).toBeGreaterThanOrEqual(recs[15].score);
      expect(recs[0].reasons.length).toBeGreaterThanOrEqual(3);
      recs.forEach((r) => expect(Number.isFinite(r.score)).toBe(true));
      winners.add(recs[0].code);
    }
    expect(winners.size).toBeGreaterThanOrEqual(3);
  });
  it("a Borneo request is answered with a Borneo state", () => {
    const top = recommend(EXAMPLES[3].prefs, rows, gap, labels, TOPIC_LABEL)[0];
    expect(["SBH", "SWK", "LBN"]).toContain(top.code);
  });
  it("a typed Borneo request keeps every top-3 result in Borneo (keyword fallback path)", () => {
    const prefs = parseLocal("family trip with kids, seafood, clean hotel, safe, island in Borneo");
    expect(prefs.region).toBe("Borneo");
    recommend(prefs, rows, gap, labels, TOPIC_LABEL).slice(0, 3).forEach((r) => expect(["SBH", "SWK", "LBN"]).toContain(r.code));
  });
  it("wanting quiet ranks the busiest state lower than not caring", () => {
    const base = EXAMPLES[0].prefs;
    const rank = (quiet: number) => recommend({ ...base, quiet }, rows, gap, labels, TOPIC_LABEL).findIndex((r) => r.code === "KUL");
    expect(rank(1)).toBeGreaterThanOrEqual(rank(0));
  });
});
