/**
 * Conversation logic for the traveller app.
 *
 * The language model only decides WHAT the traveller means (an intent, a state, updated
 * preferences). Every fact in a reply - scores, prices, quotes, places - is filled in from the
 * data by the templates below, so the assistant cannot make a number up. If the model is
 * unreachable, `understandLocally` does the same job with keyword rules.
 */
import { QUARTERLY, STATE_LABEL, STATE_NAME } from "./data";
import { JR, TOPIC_LABEL, type JrPlace, type JrQuote, type JrTopic } from "./jomrasa";
import type { GapRow, Row } from "./metrics";
import { type Prefs, type Recommendation, parseLocal, recommend } from "./planner";

export type Intent = "recommend" | "about_state" | "other";
export interface Understanding { intent: Intent; state: string | null; topic: string | null; prefs: Prefs }

export interface StateBrief {
  code: string; score: number | null; spend: number; quietQuarter: number; quietOccupancy: number;
  loved: JrTopic[]; gripes: JrTopic[]; focus: JrTopic | null; places: JrPlace[]; praise: JrQuote | null; complaint: JrQuote | null;
}
export type Reply =
  | { kind: "recommend"; text: string; recs: Recommendation[]; prefs: Prefs; followUps: string[] }
  | { kind: "state"; text: string; brief: StateBrief; followUps: string[] }
  | { kind: "text"; text: string; followUps: string[] };

export const EMPTY_PREFS: Prefs = { topics: {}, emotions: [], budget: null, quiet: 0.6, region: null, source: "keywords" };

// names travellers actually type, mapped to the state they are in
const PLACE_TO_STATE: [RegExp, string][] = [
  [/\b(johor|jb|johor bahru|desaru|mersing|legoland)\b|柔佛|新山/i, "JHR"], [/\b(kedah|langkawi|alor setar)\b|吉打|兰卡威|浮罗交怡/i, "KDH"],
  [/\b(kelantan|kota bharu)\b|吉兰丹/i, "KTN"], [/\b(melaka|malacca|jonker)\b|马六甲|馬六甲/i, "MLK"],
  [/\b(negeri sembilan|n9|port dickson|seremban)\b|森美兰|波德申/i, "NSN"], [/\b(pahang|cameron|genting|kuantan|tioman|taman negara|cherating)\b|彭亨|金马仑|云顶/i, "PHG"],
  [/\b(perak|ipoh|pangkor|taiping)\b|霹雳|霹靂|怡保/i, "PRK"], [/\b(perlis|kangar)\b|玻璃市/i, "PLS"],
  [/\b(penang|pulau pinang|george ?town|batu ferringhi)\b|槟城|檳城/i, "PNG"], [/\b(sabah|kota kinabalu|kundasang|semporna|sipadan|sandakan|kinabalu)\b|沙巴|亚庇/i, "SBH"],
  [/\b(sarawak|kuching|miri|mulu|sibu)\b|砂拉越|古晋|古晉/i, "SWK"], [/\b(selangor|sekinchan|shah alam|kuala selangor)\b|雪兰莪|适耕庄/i, "SGR"],
  [/\b(terengganu|redang|perhentian|kenyir|kapas)\b|登嘉楼|登嘉樓|热浪岛|停泊岛/i, "TRG"], [/\b(kuala lumpur|kl|klcc|bukit bintang)\b|吉隆坡/i, "KUL"],
  [/\blabuan\b|纳闽/i, "LBN"], [/\bputrajaya\b|布城/i, "PJY"],
];
const ASKING = /\b(tell me|about|how is|how's|what is|what's|what about|like in|worth|review|macam mana|bagaimana|best ke|ok ke)\b|怎么样|如何|好玩吗|值得/i;
const GREETING = /^\s*(hi|hello|hey|helo|hai|yo|salam|你好|嗨)\b[\s!.]*$/i;

/** Rough language of a message, to show quotes the traveller can read. */
export function langOf(text: string): "zh" | "ms" | "en" {
  if (/[一-鿿]/.test(text)) return "zh";
  return /\b(nak|yang|dan|tempat|makan|murah|sedap|bercuti|tenang|saya|kami|dengan|tak|bajet|pantai)\b/i.test(text) ? "ms" : "en";
}

// the traveller's own language first, then mixed, then whichever script they can most likely still read
function readability(quoteLang: string, lang: string): number {
  if (quoteLang === lang) return 0;
  if (quoteLang === "mixed") return 1;
  return ["en", "ms", "zh"].indexOf(quoteLang) + 2;
}

export function findState(text: string): string | null {
  for (const [rx, code] of PLACE_TO_STATE) if (rx.test(text)) return code;
  return null;
}

/** Keyword fallback: same output shape as the model, no network. */
export function understandLocally(text: string, prev: Prefs): Understanding {
  if (GREETING.test(text)) return { intent: "other", state: null, topic: null, prefs: prev };
  const state = findState(text);
  const parsed = parseLocal(text);
  const named = Object.keys(parsed.topics).length > 0 && !(Object.keys(parsed.topics).length === 2 && parsed.topics.scenery_nature === 0.6);  // 0.6/0.6 is parseLocal's "nothing found" default
  if (state && (ASKING.test(text) || !named)) {
    return { intent: "about_state", state, topic: named ? Object.keys(parsed.topics)[0] : null, prefs: prev };
  }
  if (!named && !parsed.budget && !parsed.region && parsed.quiet === 0.6) return { intent: "other", state: null, topic: null, prefs: prev };
  // refine: keep what was said before, add or override with what is new
  const merged: Prefs = {
    topics: named ? { ...prev.topics, ...parsed.topics } : prev.topics,
    emotions: [...new Set([...prev.emotions, ...parsed.emotions])],
    budget: parsed.budget ?? prev.budget,
    quiet: parsed.quiet !== 0.6 ? parsed.quiet : prev.quiet,
    region: parsed.region ?? prev.region,
    source: "keywords",
  };
  if (/\b(anywhere|any region|whole malaysia|semua negeri)\b/i.test(text)) merged.region = null;
  return { intent: "recommend", state: null, topic: null, prefs: merged };
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

function describe(p: Prefs): string {
  const topics = Object.entries(p.topics).filter(([t]) => t !== "crowding" && t !== "price_value").sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => TOPIC_LABEL[t].toLowerCase());
  const bits = [topics.length ? list(topics) : "a good all-round trip"];
  if (p.quiet >= 0.8) bits.push("away from the crowds");
  if (p.budget === "low") bits.push("on a tight budget"); else if (p.budget === "high") bits.push("with room to splurge");
  if (p.region) bits.push(p.region === "Borneo" ? "in Borneo" : "on the Peninsula");
  return bits.join(", ");
}

export function brief(code: string, rows: Row[], topic: string | null, lang: string = "en"): StateBrief {
  const r = rows.find((x) => x.code === code)!;
  const topics = JR.topics.filter((t) => t.code === code && t.n >= 8);
  const byGood = [...topics].sort((a, b) => b.sentiment - a.sentiment);
  const q = [1, 2, 3, 4].map((k) => {
    const v = QUARTERLY[code].filter((d) => d.quarter === k && d.year >= 2023 && d.year <= 2025 && d.occupancy_pct != null).map((d) => d.occupancy_pct as number);
    return { k, mean: v.reduce((s, x) => s + x, 0) / (v.length || 1) };
  }).reduce((m, x) => (x.mean < m.mean ? x : m));
  const readable = (x: JrQuote) => readability(x.language, lang);
  const all = JR.quotes.filter((x) => x.code === code).sort((a, b) => readable(a) - readable(b));
  const quotes = all.filter((x) => !topic || x.topics.includes(topic));
  return {
    code, score: JR.states.find((s) => s.code === code)?.experience_score ?? null, spend: r.spend_per_visitor_rm as number,
    quietQuarter: q.k, quietOccupancy: q.mean, loved: byGood.slice(0, 3), gripes: byGood.slice(-2).reverse().filter((t) => t.sentiment < 80),
    focus: topic ? JR.topics.find((t) => t.code === code && t.topic === topic) ?? null : null,
    places: JR.places.filter((p) => p.code === code && (!topic || p.tags.includes(topic))).sort((a, b) => b.mentions - a.mentions).slice(0, 6),
    praise: quotes.find((x) => x.overall > 0) ?? all.find((x) => x.overall > 0) ?? null,
    complaint: quotes.find((x) => x.overall < 0) ?? all.find((x) => x.overall < 0) ?? null,
  };
}

/** Turn an understanding into a reply. Every number comes from the data passed in. */
export function respond(u: Understanding, rows: Row[], gap: GapRow[], lang: string = "en"): Reply {
  if (u.intent === "about_state" && u.state) {
    const b = brief(u.state, rows, u.topic, lang);
    const name = STATE_NAME[u.state].replace("W.P. ", "");
    const text = b.focus
      ? `On ${TOPIC_LABEL[b.focus.topic].toLowerCase()} in ${name}: travellers rate it ${b.focus.sentiment.toFixed(0)}/100 across ${b.focus.n} mentions.`
      : `${name}: travellers love its ${list(b.loved.slice(0, 2).map((t) => TOPIC_LABEL[t.topic].toLowerCase()))}` +
        (b.gripes.length ? `; the most common gripe is ${TOPIC_LABEL[b.gripes[0].topic].toLowerCase()}.` : ".") +
        ` A typical visitor spends about RM ${Math.round(b.spend)}, and it is quietest in Q${b.quietQuarter}.`;
    return { kind: "state", text, brief: b, followUps: [`What about food in ${name}?`, `Somewhere like ${name} but quieter`, "Plan something cheaper"] };
  }
  if (u.intent === "recommend") {
    const readable = (x: JrQuote) => readability(x.language, lang);
    const recs = recommend(u.prefs, rows, gap, STATE_LABEL, TOPIC_LABEL).slice(0, 3)
      .map((r) => ({ ...r, quotes: [...r.quotes].sort((a, b) => readable(a) - readable(b) || a.text.length - b.text.length) }));
    const names = recs.map((r) => STATE_NAME[r.code].replace("W.P. ", ""));
    const text = `For ${describe(u.prefs)}, ${names[0]} fits best. ${names[1]} and ${names[2]} are close behind.`;
    const followUps = [
      u.prefs.budget !== "low" ? "Make it cheaper" : "Budget is flexible",
      u.prefs.region !== "Borneo" ? "Only in Borneo" : "Anywhere in Malaysia",
      u.prefs.quiet < 0.8 ? "Fewer crowds please" : "More about food",
      `Tell me about ${names[0]}`,
    ];
    return { kind: "recommend", text, recs, prefs: u.prefs, followUps };
  }
  return {
    kind: "text",
    text: "I help you pick where to go in Malaysia, leaning toward places that are not overrun. Tell me what you are after - scenery, food, budget, how much you mind crowds - or ask me about a state.",
    followUps: ["Quiet beach, good seafood, not expensive", "Tell me about Terengganu", "Adventure trip in Borneo"],
  };
}
