import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type AiPlan, type GDest, type GPlace, type GStay, type Guide, clock, findDestination, fromAi, km, maxDays, monthRanges, parseDays, pickStay, planTrip, wantsPlan, whenToGo } from "./trip";

// a small made-up town for testing the geometry only (the app itself never uses made-up places)
const place = (id: string, kind: GPlace["kind"], lat: number, lon: number, slots: GPlace["slots"] = [], weight = 300): GPlace =>
  ({ id, kind, name: id, lat, lon, text: `${id} description`, hours: "", address: "", slots, famous: [], weight });
const town = (places: GPlace[], over: Partial<GDest> = {}): GDest => ({
  id: "testville", code: "PRK", name: "Testville", lat: 4.6, lon: 101.08, intro: "", eat_notes: "", url: "", known_for: [],
  climate: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, rain_mm: 200, rainy_days: 12 })), when: { best: [6, 7], avoid: [11, 12], sea_closed: [], even: false }, notes: [], places, ...over,
});
const WEST = [0, 1, 2, 3].map((i) => place(`west${i}`, "see", 4.60 + i * 0.002, 101.05));
const EAST = [0, 1, 2, 3].map((i) => place(`east${i}`, "see", 4.60 + i * 0.002, 101.20));
const EATS = [place("kopitiam", "eat", 4.601, 101.051, ["breakfast", "lunch"]), place("noodles", "eat", 4.603, 101.052, ["lunch", "dinner"]), place("grill", "eat", 4.604, 101.05, ["dinner"]),
  place("mamak", "eat", 4.605, 101.051, ["supper", "dinner"]), place("dimsum", "eat", 4.601, 101.201, ["breakfast"]), place("curry", "eat", 4.603, 101.2, ["lunch", "dinner"]), place("satay", "eat", 4.604, 101.201, ["dinner", "supper"])];

describe("reading what the traveller asked for", () => {
  it("finds how many days in English, Malay and Chinese", () => {
    expect(parseDays("plan 3 days in Ipoh")).toBe(3);
    expect(parseDays("3D2N Langkawi")).toBe(3);
    expect(parseDays("2 nights in Melaka")).toBe(3);
    expect(parseDays("tiga hari di Kuching")).toBe(3);
    expect(parseDays("怡保三天")).toBe(3);
    expect(parseDays("weekend in Penang")).toBe(2);
    expect(parseDays("day trip to Klang")).toBe(1);
    expect(parseDays("tell me about Klang")).toBeNull();
    expect(parseDays("20 days")).toBe(5);
  });
  it("knows a request for a plan from a question about a place", () => {
    expect(wantsPlan("plan my trip to Ipoh")).toBe(true);
    expect(wantsPlan("tell me about Ipoh")).toBe(false);
  });
  it("prefers the longest place name", () => {
    const g: Guide = { attribution: "", destinations: [town([], { id: "klang", name: "Klang" }), town([], { id: "kuala-selangor", name: "Kuala Selangor" }), town([], { id: "kuala-lumpur", name: "Kuala Lumpur" })] };
    expect(findDestination("tell me about klang", g)?.id).toBe("klang");
    expect(findDestination("fireflies in Kuala Selangor?", g)?.id).toBe("kuala-selangor");
    expect(findDestination("2 days in KL", g)?.id).toBe("kuala-lumpur");
    expect(findDestination("somewhere quiet", g)).toBeNull();
  });
});

describe("saying months the way people do", () => {
  it("joins runs and wraps around the new year", () => {
    expect(monthRanges([11, 12, 1, 2])).toBe("November to February");
    expect(monthRanges([3, 4, 9])).toBe("March to April and September");
    expect(monthRanges([6])).toBe("June");
    expect(monthRanges([])).toBe("");
  });
  it("explains monsoon closures differently from ordinary rain", () => {
    expect(whenToGo(town([], { when: { best: [4, 5], avoid: [11, 12, 1, 2], sea_closed: [11, 12, 1, 2], even: false } })).avoid).toContain("monsoon");
    expect(whenToGo(town([])).avoid).toContain("wettest");
    expect(whenToGo(town([], { when: { best: [1], avoid: [], sea_closed: [], even: true } })).avoid).toBeNull();
  });
});

describe("planning the days", () => {
  const plan = planTrip(town([...WEST, ...EAST, ...EATS]), 2);
  it("keeps places that are close together on the same day", () => {
    expect(plan.days).toHaveLength(2);
    for (const d of plan.days) {
      const sights = d.stops.filter((s) => !s.meal).map((s) => s.place.id);
      expect(new Set(sights.map((id) => id.slice(0, 4))).size).toBe(1);        // all west, or all east - never mixed
    }
  });
  it("runs breakfast, lunch, dinner, supper in order, at places open for that meal, never the same place twice", () => {
    const seen = new Set<string>();
    for (const d of plan.days) {
      const meals = d.stops.filter((s) => s.meal);
      expect(meals.map((s) => s.meal)).toEqual(["breakfast", "lunch", "dinner", "supper"].filter((m) => meals.some((s) => s.meal === m)));
      expect(meals.length).toBeGreaterThanOrEqual(3);
      for (const s of meals) { expect(s.place.slots).toContain(s.meal); expect(seen.has(s.place.id)).toBe(false); seen.add(s.place.id); }
      expect(d.stops[0].meal).toBe("breakfast");
    }
  });
  it("moves forward in time and eats at mealtimes", () => {
    for (const d of plan.days) {
      d.stops.forEach((s, i) => { if (i) expect(s.at).toBeGreaterThanOrEqual(d.stops[i - 1].at + d.stops[i - 1].mins); });
      expect(d.stops.find((s) => s.meal === "lunch")!.at).toBeGreaterThanOrEqual(12 * 60);
      expect(d.stops.find((s) => s.meal === "dinner")!.at).toBeGreaterThanOrEqual(18.5 * 60);
      expect(d.mapUrl).toContain("google.com/maps/dir");
    }
  });
  it("does not pad a small town out to the days asked for", () => {
    const small = planTrip(town([...WEST.slice(0, 3), ...EATS.slice(0, 3)]), 4);
    expect(small.days).toHaveLength(1);
    expect(small.note).toContain("one good day");
  });
  it("gives the same plan every time", () => {
    expect(planTrip(town([...WEST, ...EAST, ...EATS]), 2).days.map((d) => d.stops.map((s) => s.place.id))).toEqual(plan.days.map((d) => d.stops.map((s) => s.place.id)));
  });
  it("formats clock times", () => { expect(clock(8 * 60)).toBe("8:00 am"); expect(clock(12 * 60 + 30)).toBe("12:30 pm"); expect(clock(22 * 60 + 15)).toBe("10:15 pm"); });
});

const stay = (id: string, lat: number, lon: number, over: Partial<GStay> = {}): GStay => ({ id, name: id, lat, lon, tier: "", text: "", type: "hotel", stars: null, source: "osm", ...over });

describe("where to sleep", () => {
  const dest = town([...WEST, ...EATS.slice(0, 4)], { stays: [stay("far", 4.9, 101.4), stay("near", 4.602, 101.051), stay("written-up", 4.604, 101.055, { text: "Clean rooms above a kopitiam.", tier: "budget", source: "wikivoyage" })] });
  it("picks the place with the least running around, and a traveller's write-up beats a bare map pin nearby", () => {
    const plan = planTrip(dest, 1);
    expect(plan.stay!.stay.id).toBe("written-up");
    expect(plan.stay!.why).toContain("easy on the wallet");
    expect(plan.stay!.others.map((h) => h.id)).toEqual(["near", "far"]);
  });
  it("says nothing rather than inventing a hotel", () => { expect(planTrip(town([...WEST, ...EATS.slice(0, 4)]), 1).stay).toBeNull(); expect(pickStay(town([]), [])).toBeNull(); });
});

describe("what the language model may and may not do", () => {
  const dest = town([...WEST, ...EAST, ...EATS]);
  const ai = (stops: [string, AiPlan["days"][number]["stops"][number]["meal"]][]): AiPlan => ({ days: [{ theme: "Old town", stops: stops.map(([id, meal]) => ({ id, meal, note: `note for ${id}` })) }], stay: { id: "nope", why: "" }, tips: ["Bring an umbrella"] });
  it("keeps only places from our list - an invented place is dropped", () => {
    const plan = fromAi(dest, ai([["kopitiam", "breakfast"], ["west0", "none"], ["Hallucinated Cafe", "lunch"], ["west1", "none"], ["noodles", "lunch"]]), 1)!;
    expect(plan.by).toBe("ai");
    expect(plan.days[0].stops.map((x) => x.place.id)).toEqual(["kopitiam", "west0", "west1", "noodles"]);
    expect(plan.days[0].stops[1].note).toBe("note for west0");
    expect(plan.tips).toEqual(["Bring an umbrella"]);
  });
  it("never serves a meal at a sight, the same place twice, or dinner before lunch", () => {
    const plan = fromAi(dest, ai([["west0", "breakfast"], ["grill", "dinner"], ["grill", "dinner"], ["noodles", "lunch"], ["west1", "none"]]), 1)!;
    const stops = plan.days[0].stops;
    expect(stops.map((x) => x.place.id)).toEqual(["west0", "grill", "noodles", "west1"]);
    expect(stops[0].meal).toBeNull();                       // a sight is not breakfast
    expect(stops[1].meal).toBe("dinner");
    expect(stops[2].meal).toBeNull();                       // lunch after dinner is shown as a plain stop, not a meal out of order
    stops.forEach((x, i) => { if (i) expect(x.at).toBeGreaterThanOrEqual(stops[i - 1].at + stops[i - 1].mins); });
  });
  it("gives nothing back when the model returned nothing usable, so the rule-based plan takes over", () => {
    expect(fromAi(dest, ai([["ghost", "none"], ["phantom", "lunch"]]), 1)).toBeNull();
  });
});

describe("boats and honest day counts", () => {
  it("treats an island off a mainland town as a boat ride and keeps it out of the driving link", () => {
    const island = place("Pulau Ketam", "see", 4.60, 100.95);
    const plan = planTrip(town([...WEST.slice(0, 3), island, ...EATS.slice(0, 4)]), 1);
    const stops = plan.days[0].stops, k = stops.findIndex((x) => x.place.id === "Pulau Ketam");
    expect(stops[k].leg!.boat).toBe(true);
    expect(plan.days[0].mapUrl).not.toContain("100.95");
    expect(stops.filter((x) => !x.meal).at(-1)!.place.id).toBe("Pulau Ketam");      // last sight of the day: one crossing out, one back
  });
  it("knows how many days a town can fill", () => { expect(maxDays(town(WEST.slice(0, 3)))).toBe(1); expect(maxDays(town([...WEST, ...EAST]))).toBe(4); });
});

const file = join(__dirname, "../../public/data/guide.json");
describe.skipIf(!existsSync(file))("the real guide", () => {
  const guide: Guide = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { attribution: "", destinations: [] };
  it("covers every state, with real located places", () => {
    expect(new Set(guide.destinations.map((d) => d.code)).size).toBeGreaterThanOrEqual(14);
    for (const d of guide.destinations) {
      expect(d.climate).toHaveLength(12);
      for (const p of d.places) { expect(p.lat).toBeGreaterThan(0.8); expect(p.lat).toBeLessThan(7.6); expect(km(d, p)).toBeLessThan(60); expect(p.text.length).toBeGreaterThan(20); }
    }
  });
  it("plans every town without breaking", () => {
    for (const d of guide.destinations) for (const n of [1, 3]) {
      const p = planTrip(d, n);
      expect(p.days.length).toBeGreaterThanOrEqual(1);
      for (const day of p.days) expect(day.stops.length).toBeGreaterThanOrEqual(2);
    }
  });
  it("closes the east-coast islands for the monsoon", () => {
    const perhentian = guide.destinations.find((d) => d.id === "perhentian-islands");
    if (perhentian) expect(perhentian.when.avoid).toEqual(expect.arrayContaining([11, 12, 1, 2]));
  });
});
