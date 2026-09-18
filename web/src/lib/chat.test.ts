import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EMPTY_PREFS, findState, langOf, namedPlace, respond, understandLocally } from "./chat";
import { JR } from "./jomrasa";
import { gapTable, type Row } from "./metrics";

const load = (f: string) => JSON.parse(readFileSync(join(__dirname, "../../public/data", f), "utf8"));
const panel = load("panel.json"), meta = load("meta.json");
const rows: Row[] = panel.rows[panel.default_year];
const gap = gapTable(rows, meta.indicators.potential, meta.indicators.actual);

describe("keyword understanding (the no-network fallback)", () => {
  it("recognises places travellers name and maps them to states", () => {
    expect(findState("is Langkawi worth it")).toBe("KDH");
    expect(findState("food in Ipoh")).toBe("PRK");
    expect(findState("想去沙巴")).toBe("SBH");
    expect(findState("somewhere quiet")).toBeNull();
    expect(findState("Sandakan trip")).toBe("SBH");
  });
  it("separates asking about a place from describing a trip", () => {
    expect(understandLocally("Tell me about Terengganu", EMPTY_PREFS)).toMatchObject({ intent: "about_state", state: "TRG" });
    expect(understandLocally("what about food in Penang", EMPTY_PREFS)).toMatchObject({ intent: "about_state", state: "PNG", topic: "food" });
    expect(understandLocally("quiet beach, good seafood, cheap", EMPTY_PREFS).intent).toBe("recommend");
    expect(understandLocally("hello", EMPTY_PREFS).intent).toBe("other");
  });
  it("a follow-up refines instead of starting over", () => {
    const first = understandLocally("quiet beach with good seafood", EMPTY_PREFS).prefs;
    const second = understandLocally("only in Borneo and make it cheaper", first).prefs;
    expect(second.region).toBe("Borneo");
    expect(second.budget).toBe("low");
    expect(second.topics.food).toBe(1);          // kept from the first message
    expect(second.quiet).toBe(1);                // kept too
  });
  it("detects the language of the message", () => {
    expect(langOf("想去人少的地方")).toBe("zh");
    expect(langOf("nak makan sedap, bajet murah")).toBe("ms");
    expect(langOf("Sandakan and Kundasang hiking")).toBe("en");   // 'dan' inside a word must not read as Malay
  });
});

describe.skipIf(!JR.ready)("replies are built from the data", () => {
  it("recommendation: three states, all in Borneo when asked, each with plain reasons", () => {
    const u = understandLocally("adventure in Borneo, diving and hiking", EMPTY_PREFS);
    const r = respond(u, rows, gap, "en");
    expect(r.kind).toBe("recommend");
    if (r.kind !== "recommend") return;
    expect(r.recs).toHaveLength(3);
    r.recs.forEach((x) => { expect(["SBH", "SWK", "LBN"]).toContain(x.code); expect(x.reasons.length).toBeGreaterThanOrEqual(2); expect(x.reasons.join(" ")).not.toMatch(/Gap rank/); });
    expect(r.text).toMatch(/in Borneo/);
  });
  it("state brief: real score, spend, quiet quarter, and a quote in the asked language when one exists", () => {
    const r = respond({ intent: "about_state", state: "TRG", topic: null, prefs: EMPTY_PREFS }, rows, gap, "ms");
    expect(r.kind).toBe("state");
    if (r.kind !== "state") return;
    expect(r.brief.score).toBeGreaterThan(50);
    expect(r.brief.spend).toBeCloseTo(rows.find((x) => x.code === "TRG")!.spend_per_visitor_rm as number, 5);
    expect([1, 2, 3, 4]).toContain(r.brief.quietQuarter);
    expect(r.brief.loved.length).toBeGreaterThan(0);
    expect(r.text).toMatch(/Terengganu/);
  });
  it("acknowledges the place the traveller named when it is not the state itself", () => {
    const u = { intent: "about_state" as const, state: "KDH", topic: null, prefs: EMPTY_PREFS };
    expect(respond(u, rows, gap, "en", "is Langkawi worth it for families?").text).toMatch(/^Langkawi is in Kedah/);
    expect(respond(u, rows, gap, "en", "tell me about Kedah").text).toMatch(/^Kedah:/);
    expect(namedPlace("what about KL", "KUL")).toBeNull();
  });
  it("anything else gets a helpful nudge, never an error", () => {
    const r = respond(understandLocally("hello", EMPTY_PREFS), rows, gap);
    expect(r.kind).toBe("text");
    expect(r.followUps.length).toBeGreaterThan(0);
  });
});
