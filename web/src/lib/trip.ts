/**
 * The traveller guide: real places and eateries (Wikivoyage, CC BY-SA), ten years of rainfall (Open-Meteo),
 * and the logic that turns them into a day-by-day plan. Nothing here is generated text - the descriptions are
 * travellers' own words, and the plan is geometry: group nearby sights into days, walk them in a sensible
 * order, and slot in breakfast, lunch, dinner and supper at places that are actually open then.
 */

export interface GPlace {
  id: string; kind: "see" | "do" | "eat" | "drink" | "buy"; name: string; lat: number; lon: number; text: string;
  hours: string; address: string; slots: Meal[]; famous: string[]; weight: number; approx?: boolean; source?: "osm";
}
export interface GStay { id: string; name: string; lat: number; lon: number; tier: string; text: string; type: string; stars: number | null; source: "wikivoyage" | "osm" }
export interface GNote { months: number[]; title: string; text: string; moves: boolean }
export interface GDest {
  id: string; code: string; name: string; lat: number; lon: number; intro: string; eat_notes: string; url: string; known_for: string[];
  climate: { month: number; rain_mm: number; rainy_days: number }[];
  when: { best: number[]; avoid: number[]; sea_closed: number[]; even: boolean }; notes: GNote[]; places: GPlace[]; stays?: GStay[];
}
export interface Guide { attribution: string; destinations: GDest[] }

export type Meal = "breakfast" | "lunch" | "dinner" | "supper";
export interface Stop { at: number; mins: number; place: GPlace; meal: Meal | null; note?: string; leg: { km: number; mins: number; walk: boolean; boat?: boolean } | null }
export interface DayPlan { day: number; theme?: string; stops: Stop[]; km: number; mapUrl: string }
export interface StayPick { stay: GStay; why: string; others: GStay[] }
export interface TripPlan { dest: GDest; days: DayPlan[]; asked: number; note: string | null; stay: StayPick | null; tips: string[]; by: "ai" | "rules" }
/** What the language model hands back: only ids from the list it was given, plus its own one-line notes. */
export interface AiPlan { days: { theme: string; stops: { id: string; meal: Meal | "none"; note: string }[] }[]; stay: { id: string; why: string }; tips: string[] }

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
const OFFSHORE = /\b(pulau|island|islands)\b/i;
function leg(a: GPlace, b: GPlace): Stop["leg"] {
  const d = km(a, b), road = d * 1.35;
  // an island off the coast is a boat ride, and no road-routing app will take you there
  if (d > 2 && OFFSHORE.test(a.name) !== OFFSHORE.test(b.name)) return { km: d, mins: Math.max(30, Math.round((d * 3 + 20) / 5) * 5), walk: false, boat: true };
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

type Seq = { place: GPlace; meal: Meal | null; note?: string }[];

/**
 * Hard limits a traveller sets. A small language model forgets these, so they are enforced in code: a place that
 * conflicts is removed before the model sees the list, and again from whatever it sends back.
 */
const NO_PORK = /\b(no pork|without pork|don'?t eat pork|halal|muslim|tak makan babi|tanpa babi)\b|不吃猪|清真/i;
const WITH_KIDS = /\b(kids?|child|children|toddler|baby|family|anak)\b|小孩|孩子/i;
const PORK = /\b(pork|bak kut teh|char siu|char siew|siew yoke|siu yuk|roast(ed)? meat|lard|bacon|ham|dim sum|wantan|wonton|lap cheong|non-halal)\b/i;
const BOOZE = /\b(bar|pub|beer|cocktails?|wine|whisky|liquor|nightclub|club|gastrobar|brewery)\b/i;
export function conflicts(place: GPlace, wishes: string): boolean {
  const about = `${place.name} ${place.famous.join(" ")} ${place.text}`;
  if (NO_PORK.test(wishes) && (PORK.test(about) || BOOZE.test(about) || place.kind === "drink")) return true;
  if (WITH_KIDS.test(wishes) && (place.kind === "drink" || BOOZE.test(about))) return true;
  return false;
}
/** What we can honestly promise about a wish - said out loud, because filtering by keywords is not a certificate. */
export function wishCaveats(wishes: string): string[] {
  return NO_PORK.test(wishes) ? ["I left out every place known for pork or alcohol, but I can't see a kitchen's halal certificate from here - look for the halal logo at the door."] : [];
}

/** Put clock times and travel legs on an ordered list of stops. Meals wait for mealtime; sights just follow on. */
export function timeline(seq: Seq, day: number, theme?: string, town = ""): DayPlan {
  let at = seq[0]?.meal === "breakfast" ? SLOT_START.breakfast : 9 * 60, total = 0;
  const stops: Stop[] = seq.map((s, j) => {
    const hop = j ? leg(seq[j - 1].place, s.place) : null;
    if (hop) { at += hop.mins; total += hop.km; }
    if (s.meal) at = Math.max(at, SLOT_START[s.meal]);
    const mins = s.meal ? SLOT_MINS[s.meal] : s.place.kind === "do" ? 105 : 75;
    const stop: Stop = { at, mins, place: s.place, meal: s.meal, note: s.note, leg: hop };
    at += mins;
    return stop;
  });
  // the driving link leaves out anything reached by boat - the app would refuse the whole route otherwise
  const boats = stops.some((x) => x.leg?.boat);
  const road = stops.filter((x) => !(boats && OFFSHORE.test(x.place.name)));
  const where = (x: Stop) => (x.place.approx ? encodeURIComponent(`${x.place.name}, ${town}`) : `${x.place.lat},${x.place.lon}`);   // street-level pins: let Maps find the door by name
  const pts = (road.length >= 2 ? road : stops).map(where);
  const mapUrl = `https://www.google.com/maps/dir/?api=1&origin=${pts[0]}&destination=${pts[pts.length - 1]}${pts.length > 2 ? `&waypoints=${pts.slice(1, -1).slice(0, 9).join("%7C")}` : ""}&travelmode=driving`;
  return { day, theme, stops, km: total, mapUrl };
}

const TIER_WORD: Record<string, string> = { budget: "easy on the wallet", "mid-range": "comfortable without being pricey", splurge: "a treat" };
/** Where to sleep: the place with the least running around to everything on the plan; a traveller's write-up beats a bare map pin. */
export function pickStay(dest: GDest, days: DayPlan[], preferId?: string, why?: string): StayPick | null {
  const stays = dest.stays ?? [];
  if (!stays.length) return null;
  const stops = days.flatMap((d) => d.stops.map((x) => x.place)).filter((pl) => !OFFSHORE.test(pl.name) || OFFSHORE.test(dest.name));
  const reach = (h: GStay) => (stops.length ? stops.reduce((t, pl) => t + km(h, pl), 0) / stops.length : km(h, dest));
  const cost = (h: GStay) => reach(h) - (h.text ? 1.5 : 0) - (h.stars ? 0.3 : 0);
  const ranked = [...stays].sort((a, b) => cost(a) - cost(b));
  const stay = stays.find((h) => h.id === preferId) ?? ranked[0];
  const mins = Math.max(5, Math.round((reach(stay) * 1.35 / 25) * 60 / 5) * 5);
  const kind = stay.tier ? TIER_WORD[stay.tier] : stay.stars ? `a ${stay.stars}-star ${stay.type || "hotel"}` : `a ${stay.type || "place to stay"}`;
  return { stay, why: why || `It is ${kind}, and about ${mins} minutes from most of your stops - the least running around of the places I know here.`, others: ranked.filter((h) => h.id !== stay.id).slice(0, 3) };
}

/** How many days this town can honestly fill. */
export const maxDays = (dest: GDest) => Math.max(1, Math.min(5, Math.floor(dest.places.filter((p) => (p.kind === "see" || p.kind === "do") && km(dest, p) <= 25).length / 2)));

/** The rule-based plan: used when the language model is unreachable, and as its safety net. */
export function planTrip(dest: GDest, asked: number, wishes = ""): TripPlan {
  const worth = (p: GPlace) => worthIt(dest, p);
  const all = dest.places.filter((p) => (p.kind === "see" || p.kind === "do") && !conflicts(p, wishes));
  const nearby = all.filter((p) => km(dest, p) <= 25);
  const sights = (nearby.length >= 4 ? nearby : all).sort((a, b) => worth(b) - worth(a));
  const eats = dest.places.filter((p) => (p.kind === "eat" || p.kind === "drink") && !conflicts(p, wishes));
  const possible = Math.max(1, Math.min(asked, Math.floor(sights.length / 2) || 1));
  const chosen = sights.slice(0, possible * SIGHTS_PER_DAY);
  const used = new Set<string>();

  const days = cluster(chosen, possible).map((group, i): DayPlan => {
    const eaten = new Set<string>();                       // nobody wants the same dish three times in a day
    const pickMeal = (meal: Meal, near: { lat: number; lon: number }): GPlace | null => {
      const pool = eats.filter((e) => !used.has(e.id) && e.slots.includes(meal) && km(near, e) < 25);
      if (!pool.length) return null;
      // close by, well written-up, and above all known for a local dish: that stall is worth a few minutes' detour
      const cost = (e: GPlace) => km(near, e) - e.weight / 400 - Math.min(e.famous.length, 2) * 2.5 + (e.famous.some((f) => eaten.has(f)) ? 6 : 0);
      const best = pool.reduce((b, e) => (cost(e) < cost(b) ? e : b));
      used.add(best.id); best.famous.forEach((f) => eaten.add(f));
      return best;
    };
    const centre = { lat: group.reduce((t, p) => t + p.lat, 0) / group.length, lon: group.reduce((t, p) => t + p.lon, 0) / group.length };
    const breakfast = pickMeal("breakfast", centre);
    // anything reached by boat goes last among the sights, so the day is not split by two crossings
    const ordered = nearestOrder(breakfast ?? group.reduce((w, p) => (p.lon < w.lon ? p : w)), group).sort((a, b) => Number(OFFSHORE.test(a.name) && !OFFSHORE.test(dest.name)) - Number(OFFSHORE.test(b.name) && !OFFSHORE.test(dest.name)));
    const half = Math.ceil(ordered.length / 2);
    const morning = ordered.slice(0, half), afternoon = ordered.slice(half);
    const lunch = pickMeal("lunch", morning[morning.length - 1] ?? centre);
    const dinner = pickMeal("dinner", afternoon[afternoon.length - 1] ?? morning[morning.length - 1] ?? centre);
    const supper = dinner ? pickMeal("supper", dinner) : null;
    return timeline([
      ...(breakfast ? [{ place: breakfast, meal: "breakfast" as Meal }] : []), ...morning.map((place) => ({ place, meal: null })),
      ...(lunch ? [{ place: lunch, meal: "lunch" as Meal }] : []), ...afternoon.map((place) => ({ place, meal: null })),
      ...(dinner ? [{ place: dinner, meal: "dinner" as Meal }] : []), ...(supper ? [{ place: supper, meal: "supper" as Meal }] : []),
    ], i + 1, undefined, dest.name);
  });

  const note = days.length < asked ? `There is about ${days.length === 1 ? "one good day" : `${days.length} good days`} of things to see here, so I kept it to that rather than padding it out.` : null;
  return { dest, days, asked, note, stay: pickStay(dest, days), tips: wishCaveats(wishes), by: "rules" };
}

/** Turn the language model's choice of ids into a plan. Anything it did not get from our list is dropped, so it cannot add a place that does not exist. */
export function fromAi(dest: GDest, ai: AiPlan, asked: number, wishes = ""): TripPlan | null {
  const byId = new Map(dest.places.filter((pl) => !conflicts(pl, wishes)).map((pl) => [pl.id, pl]));
  const eats = [...byId.values()].filter((pl) => pl.kind === "eat" || pl.kind === "drink");
  const seen = new Set<string>();
  const order: Meal[] = ["breakfast", "lunch", "dinner", "supper"];
  const days = ai.days.slice(0, Math.max(1, asked)).map((d, i) => {
    const seq: Seq = [];
    for (const x of d.stops.slice(0, 10)) {
      const place = byId.get(x.id);
      if (!place || seen.has(place.id)) continue;
      seen.add(place.id);
      const meal = x.meal !== "none" && (place.kind === "eat" || place.kind === "drink") ? x.meal : null;
      seq.push({ place, meal, note: x.note?.trim().slice(0, 220) || undefined });
    }
    // meals must run in order through the day; a meal that would go backwards in time is shown as a snack stop instead
    let last = -1;
    for (const x of seq) if (x.meal) { const k = order.indexOf(x.meal); if (k <= last) x.meal = null; else last = k; }
    if (seq.length < 2) return null;                      // the model gave us nothing real to work with
    // a day out needs feeding: if the model forgot a main meal, add the nearest suitable eatery at the right point in the day
    const fill = (meal: Meal, at: number) => {
      if (seq.some((x) => x.meal === meal)) return;
      const near = seq[Math.max(0, Math.min(seq.length - 1, at - 1))]?.place ?? dest;
      const pool = eats.filter((e) => !seen.has(e.id) && e.slots.includes(meal) && km(near, e) < 20);
      if (!pool.length) return;
      const cost = (e: GPlace) => km(near, e) - e.weight / 400 - Math.min(e.famous.length, 2) * 2.5;
      const best = pool.reduce((b, e) => (cost(e) < cost(b) ? e : b));
      seen.add(best.id);
      seq.splice(at, 0, { place: best, meal });
    };
    const sightsBefore = (n: number) => { let c = 0, i = 0; for (; i < seq.length && c < n; i++) if (!seq[i].meal) c++; return i; };
    const nSights = seq.filter((x) => !x.meal).length;
    fill("breakfast", 0);
    const firstLater = () => { const i = seq.findIndex((x) => x.meal === "dinner" || x.meal === "supper"); return i < 0 ? seq.length : i; };
    fill("lunch", Math.min(firstLater(), Math.max(sightsBefore(Math.ceil(nSights / 2)), seq.findIndex((x) => x.meal === "breakfast") + 1)));
    fill("dinner", (() => { const sup = seq.findIndex((x) => x.meal === "supper"); return sup >= 0 ? sup : seq.length; })());
    return seq.length >= 2 ? timeline(seq, i + 1, d.theme?.trim().slice(0, 60), dest.name) : null;
  }).filter((d): d is DayPlan => d !== null).map((d, i) => ({ ...d, day: i + 1 }));
  if (!days.length) return null;
  const note = days.length < asked ? `I kept it to ${days.length === 1 ? "one day" : `${days.length} days`}: that is what there is to do here without padding it out.` : null;
  return { dest, days, asked, note, stay: pickStay(dest, days, ai.stay?.id, ai.stay?.why?.trim().slice(0, 240)), tips: [...wishCaveats(wishes), ...(ai.tips ?? []).map((t) => t.trim().slice(0, 200)).filter(Boolean)].slice(0, 4), by: "ai" };
}

export const clock = (mins: number) => {
  const h = Math.floor(mins / 60) % 24, m = mins % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};
