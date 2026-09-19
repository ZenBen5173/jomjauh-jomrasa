import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type GDest, type GPlace, type Guide, clock, findDestination, km, monthRanges, parseDays, planTrip, wantsPlan, whenToGo } from "./trip";

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
