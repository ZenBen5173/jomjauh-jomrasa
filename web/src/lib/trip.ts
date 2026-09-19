/**
 * The traveller guide: real places and eateries (Wikivoyage, CC BY-SA), ten years of rainfall (Open-Meteo),
 * and the logic that turns them into a day-by-day plan. Nothing here is generated text - the descriptions are
 * travellers' own words, and the plan is geometry: group nearby sights into days, walk them in a sensible
 * order, and slot in breakfast, lunch, dinner and supper at places that are actually open then.
 */

export interface GPlace {
  id: string; kind: "see" | "do" | "eat" | "drink" | "buy"; name: string; lat: number; lon: number; text: string;
  hours: string; address: string; slots: Meal[]; famous: string[]; weight: number; approx?: boolean;
}
export interface GNote { months: number[]; title: string; text: string; moves: boolean }
export interface GDest {
  id: string; code: string; name: string; lat: number; lon: number; intro: string; eat_notes: string; url: string; known_for: string[];
  climate: { month: number; rain_mm: number; rainy_days: number }[];
  when: { best: number[]; avoid: number[]; sea_closed: number[]; even: boolean }; notes: GNote[]; places: GPlace[];
}
export interface Guide { attribution: string; destinations: GDest[] }

export type Meal = "breakfast" | "lunch" | "dinner" | "supper";
export interface Stop { at: number; mins: number; place: GPlace; meal: Meal | null; leg: { km: number; mins: number; walk: boolean } | null }
export interface DayPlan { day: number; stops: Stop[]; km: number; mapUrl: string }
export interface TripPlan { dest: GDest; days: DayPlan[]; asked: number; note: string | null }

const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthName = (m: number) => MONTH[(m - 1 + 12) % 12];

/** [11,12,1,2] -> "November to February"; [3,4,9] -> "March to April and September". Wraps around the year end. */
export function monthRanges(months: number[]): string {
  const set = new Set(months);
  if (!set.size) return "";
  if (set.size === 12) return "all year";
  const runs: [number, number][] = [];
  for (let m = 1; m <= 12; m++) {
    if (!set.has(m) || set.has(m === 1 ? 12 : m - 1)) continue;          // only start a run where the month before is absent
    let end = m;
    while (set.has(end === 12 ? 1 : end + 1) && (end === 12 ? 1 : end + 1) !== m) end = end === 12 ? 1 : end + 1;
    runs.push([m, end]);
  }
  const parts = runs.map(([a, b]) => (a === b ? monthName(a) : `${monthName(a)} to ${monthName(b)}`));
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** How often it rains, the way people say it. (Reanalysis rainfall is good for comparing months, not for counting days.) */
export const rainWords = (rainyDays: number) => (rainyDays >= 20 ? "rain most days" : rainyDays >= 13 ? "rain about every other day" : rainyDays >= 7 ? "rain a couple of times a week" : "only the odd shower");

/** When to go, the way a local would put it. */
export function whenToGo(d: GDest): { best: string; avoid: string | null } {
  const wet = d.climate.filter((c) => d.when.avoid.includes(c.month));
  const wetDays = wet.length ? wet.reduce((s, c) => s + c.rainy_days, 0) / wet.length : 0;
  const best = d.when.even && !d.when.avoid.length
    ? "It rains on and off all year here, so there is no bad season - pack a light umbrella and go when it suits you."
    : `${monthRanges(d.when.best).replace(/^./, (c) => c.toUpperCase())} ${d.when.best.length === 1 ? "is" : "are"} the driest, so that's when to come.`;
  let avoid: string | null = null;
  if (d.when.sea_closed.length) {
    avoid = `Skip ${monthRanges(d.when.avoid)}: the northeast monsoon brings rough seas, and boats and most beach resorts stop running.`;
  } else if (d.when.avoid.length) {
    avoid = `${monthRanges(d.when.avoid).replace(/^./, (c) => c.toUpperCase())} ${d.when.avoid.length === 1 ? "is" : "are"} the wettest, with ${rainWords(wetDays)} - still doable, but plan indoor stops.`;
  }
  return { best, avoid };
}

// ------------------------------------------------------------------ understanding the request
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9一-鿿 ]+/g, " ").replace(/\s+/g, " ").trim();
const ALIAS: Record<string, string[]> = {
  "george-town-malaysia": ["george town", "georgetown", "penang", "pulau pinang", "槟城", "檳城"], malacca: ["melaka", "malacca", "马六甲", "馬六甲"],
  "kuala-lumpur": ["kuala lumpur", "kl", "吉隆坡"], "johor-bahru": ["johor bahru", "jb", "新山"], "kota-kinabalu": ["kota kinabalu", "kk", "亚庇"],
  "cameron-highlands": ["cameron", "camerons", "金马仑"], "genting-highlands": ["genting", "云顶"], "perhentian-islands": ["perhentian", "停泊岛"],
  langkawi: ["langkawi", "兰卡威", "浮罗交怡"], kuching: ["kuching", "古晋", "古晉"], ipoh: ["ipoh", "怡保"], "kuala-terengganu": ["kuala terengganu", "kt"],
  "gunung-mulu-national-park": ["mulu"], "kinabalu-national-park": ["kinabalu park", "mount kinabalu"], "taman-negara": ["taman negara"],
};

/** The destination a message names, if any. Longest name wins, so "Kuala Selangor" is not read as "Selangor". */
export function findDestination(text: string, guide: Guide): GDest | null {
  const t = ` ${norm(text)} `;
  let hit: GDest | null = null, len = 0;
  for (const d of guide.destinations) {
    for (const name of [norm(d.name), ...(ALIAS[d.id] ?? [])]) {
      const found = /[一-鿿]/.test(name) ? t.includes(name) : t.includes(` ${name} `);
      if (found && name.length > len) { hit = d; len = name.length; }
    }
  }
  return hit;
}

const WORD_NUM: Record<string, number> = { one: 1, a: 1, two: 2, three: 3, four: 4, five: 5, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5 };
/** "3 days", "2D1N", "weekend", "tiga hari", "三天" -> number of days; null when the message does not say. */
export function parseDays(text: string): number | null {
  const t = text.toLowerCase();
  let m = t.match(/(\d+)\s*d\s*\d+\s*n/) ?? t.match(/(\d+)\s*[- ]?\s*(?:days?|hari|天|日)/);
  if (m) return Math.max(1, Math.min(5, +m[1]));
  m = t.match(/(\d+)\s*(?:nights?|malam|晚)/);
  if (m) return Math.max(1, Math.min(5, +m[1] + 1));
  m = t.match(/\b(one|a|two|three|four|five|satu|dua|tiga|empat|lima)\s+(?:full\s+)?(?:days?|hari)\b/) ?? t.match(/([一两二三四五])\s*[天日]/);
  if (m) return WORD_NUM[m[1]];
  if (/day ?trip|balik hari|一日游/.test(t)) return 1;
  if (/weekend|hujung minggu|周末|週末/.test(t)) return 2;
  return null;
}
export const wantsPlan = (text: string) => /\b(plan|itinerary|route|schedule|jadual|rancang|trip to|visit|going to|pergi)\b|行程|路线|安排/i.test(text);

// ------------------------------------------------------------------ building the plan
const rad = Math.PI / 180;
export function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const h = 0.5 - Math.cos((b.lat - a.lat) * rad) / 2 + (Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * (1 - Math.cos((b.lon - a.lon) * rad))) / 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
/** Straight-line distance to a rough door-to-door time: roads wind (x1.35), towns are slow, open road is faster. */
function leg(a: GPlace, b: GPlace): Stop["leg"] {
  const d = km(a, b), road = d * 1.35;
  if (road < 0.7) return { km: d, mins: Math.max(3, Math.round((road / 4.5) * 60)), walk: true };
  const speed = road < 6 ? 22 : road < 25 ? 38 : 60;
  return { km: d, mins: Math.max(5, Math.round(((road / speed) * 60 + 4) / 5) * 5), walk: false };
}

/** Split the sights into `k` days of nearby places (k-means, seeded by the farthest-point rule so it is repeatable). */
function cluster(pts: GPlace[], k: number): GPlace[][] {
  const centres = [pts[0]].map((p) => ({ lat: p.lat, lon: p.lon }));
  while (centres.length < k) {
    const far = pts.reduce((best, p) => (Math.min(...centres.map((c) => km(c, p))) > Math.min(...centres.map((c) => km(c, best))) ? p : best), pts[0]);
    centres.push({ lat: far.lat, lon: far.lon });
  }
  let groups: GPlace[][] = [];
  for (let it = 0; it < 8; it++) {
    groups = centres.map(() => []);
    for (const p of pts) groups[centres.reduce((bi, c, i) => (km(c, p) < km(centres[bi], p) ? i : bi), 0)].push(p);
    groups.forEach((g, i) => { if (g.length) centres[i] = { lat: g.reduce((s, p) => s + p.lat, 0) / g.length, lon: g.reduce((s, p) => s + p.lon, 0) / g.length }; });
  }
  // even the days out: a day with six sights hands its outermost one to the nearest day with room
  const cap = Math.ceil(pts.length / k) + 1;
  for (let guard = 0; guard < 20; guard++) {
    const big = groups.findIndex((g) => g.length > cap), small = groups.map((g, i) => ({ g, i })).filter((x) => x.g.length < cap - 1);
    if (big < 0 || !small.length) break;
    const to = small.reduce((b, x) => (km(centres[x.i], centres[big]) < km(centres[b.i], centres[big]) ? x : b)).i;
    const mover = groups[big].reduce((b, p) => (km(p, centres[to]) < km(b, centres[to]) ? p : b));
    groups[big] = groups[big].filter((p) => p !== mover); groups[to].push(mover);
  }
  // one lonely sight is not a day out: fold it into the nearest other day
  for (let i = groups.length - 1; i >= 0 && groups.filter((g) => g.length).length > 1; i--) {
    if (groups[i].length !== 1) continue;
    const others = groups.map((g, j) => ({ g, j })).filter((x) => x.j !== i && x.g.length);
    const to = others.reduce((b, x) => (km(centres[x.j], groups[i][0]) < km(centres[b.j], groups[i][0]) ? x : b)).j;
    groups[to].push(groups[i][0]); groups[i] = [];
  }
  return groups.filter((g) => g.length).sort((a, b) => b.reduce((s, p) => s + p.weight, 0) - a.reduce((s, p) => s + p.weight, 0));
}

/** Nearest-neighbour order from `start`, then 2-opt: undo any crossing that makes the day longer. */
function nearestOrder(start: { lat: number; lon: number }, pts: GPlace[]): GPlace[] {
  const left = [...pts], out: GPlace[] = [];
  let at = start;
  while (left.length) {
    const i = left.reduce((bi, p, j) => (km(at, p) < km(at, left[bi]) ? j : bi), 0);
    at = left[i]; out.push(left.splice(i, 1)[0]);
  }
  const length = (seq: GPlace[]) => seq.reduce((d, p, i) => d + km(i ? seq[i - 1] : start, p), 0);
  for (let improved = true, guard = 0; improved && guard < 30; guard++) {
    improved = false;
    for (let i = 0; i < out.length - 1; i++) for (let j = i + 1; j < out.length; j++) {
      const flipped = [...out.slice(0, i), ...out.slice(i, j + 1).reverse(), ...out.slice(j + 1)];
      if (length(flipped) < length(out) - 1e-9) { out.splice(0, out.length, ...flipped); improved = true; }
    }
  }
  return out;
}

/** Well-described first, but a sight far out of town has to be much better to earn the drive. */
export const worthIt = (dest: GDest, p: GPlace) => p.weight - 14 * Math.max(0, km(dest, p) - 3);

const SLOT_START: Record<Meal, number> = { breakfast: 8 * 60, lunch: 12 * 60 + 30, dinner: 19 * 60, supper: 22 * 60 + 15 };
const SLOT_MINS: Record<Meal, number> = { breakfast: 45, lunch: 60, dinner: 75, supper: 45 };
const SIGHTS_PER_DAY = 4;

export function planTrip(dest: GDest, asked: number): TripPlan {
  const worth = (p: GPlace) => worthIt(dest, p);
  const all = dest.places.filter((p) => p.kind === "see" || p.kind === "do");
  const nearby = all.filter((p) => km(dest, p) <= 25);
  const sights = (nearby.length >= 4 ? nearby : all).sort((a, b) => worth(b) - worth(a));
  const eats = dest.places.filter((p) => p.kind === "eat" || p.kind === "drink");
  const possible = Math.max(1, Math.min(asked, Math.floor(sights.length / 2) || 1));
  const chosen = sights.slice(0, possible * SIGHTS_PER_DAY);
  const used = new Set<string>();
  const pickMeal = (meal: Meal, near: { lat: number; lon: number }): GPlace | null => {
    const pool = eats.filter((e) => !used.has(e.id) && e.slots.includes(meal) && km(near, e) < 25);
    if (!pool.length) return null;
    // close by, well written-up, and above all known for a local dish: that stall is worth a few minutes' detour
    const cost = (e: GPlace) => km(near, e) - e.weight / 400 - Math.min(e.famous.length, 2) * 2.5;
    const best = pool.reduce((b, e) => (cost(e) < cost(b) ? e : b));
    used.add(best.id);
    return best;
  };

  const days = cluster(chosen, possible).map((group, i): DayPlan => {
    const centre = { lat: group.reduce((s, p) => s + p.lat, 0) / group.length, lon: group.reduce((s, p) => s + p.lon, 0) / group.length };
    const breakfast = pickMeal("breakfast", centre);
    const ordered = nearestOrder(breakfast ?? group.reduce((w, p) => (p.lon < w.lon ? p : w)), group);
    const half = Math.ceil(ordered.length / 2);
    const morning = ordered.slice(0, half), afternoon = ordered.slice(half);
    const lunch = pickMeal("lunch", morning[morning.length - 1] ?? centre);
    const dinner = pickMeal("dinner", afternoon[afternoon.length - 1] ?? morning[morning.length - 1] ?? centre);
    const supper = dinner ? pickMeal("supper", dinner) : null;

    const seq: { place: GPlace; meal: Meal | null }[] = [
      ...(breakfast ? [{ place: breakfast, meal: "breakfast" as Meal }] : []), ...morning.map((place) => ({ place, meal: null })),
      ...(lunch ? [{ place: lunch, meal: "lunch" as Meal }] : []), ...afternoon.map((place) => ({ place, meal: null })),
      ...(dinner ? [{ place: dinner, meal: "dinner" as Meal }] : []), ...(supper ? [{ place: supper, meal: "supper" as Meal }] : []),
    ];
    let clock = breakfast ? SLOT_START.breakfast : 9 * 60, total = 0;
    const stops: Stop[] = seq.map((s, j) => {
      const hop = j ? leg(seq[j - 1].place, s.place) : null;
      if (hop) { clock += hop.mins; total += hop.km; }
      if (s.meal) clock = Math.max(clock, SLOT_START[s.meal]);
      const mins = s.meal ? SLOT_MINS[s.meal] : s.place.kind === "do" ? 105 : 75;
      const stop: Stop = { at: clock, mins, place: s.place, meal: s.meal, leg: hop };
      clock += mins;
      return stop;
    });
    const pts = stops.map((s) => `${s.place.lat},${s.place.lon}`);
    const mapUrl = `https://www.google.com/maps/dir/?api=1&origin=${pts[0]}&destination=${pts[pts.length - 1]}${pts.length > 2 ? `&waypoints=${pts.slice(1, -1).slice(0, 9).join("%7C")}` : ""}&travelmode=driving`;
    return { day: i + 1, stops, km: total, mapUrl };
  });

  const note = days.length < asked ? `There is about ${days.length === 1 ? "one good day" : `${days.length} good days`} of things to see here, so I kept it to that rather than padding it out.` : null;
  return { dest, days, asked, note };
}

export const clock = (mins: number) => {
  const h = Math.floor(mins / 60) % 24, m = mins % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};
