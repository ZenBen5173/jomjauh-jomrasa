/**
 * Trip Planner logic. The language model (when reachable) only turns free text into
 * structured preferences; the recommendation itself is this transparent scoring, so
 * every suggestion can be explained and the planner still works with no API at all.
 */
import { JR, type JrPlace, type JrQuote } from "./jomrasa";
import type { GapRow, Row } from "./metrics";

export interface Prefs {
  topics: Record<string, number>;          // topic -> importance 0..1
  emotions: string[];                      // desired feelings
  budget: "low" | "mid" | "high" | null;
  quiet: number;                           // 0 = does not mind crowds, 1 = wants few crowds
  region: "Peninsular" | "Borneo" | null;
  source: "ai" | "keywords" | "example";
}

export const TOPICS = ["access_transport", "accommodation", "food", "price_value", "crowding", "cleanliness",
  "scenery_nature", "culture_heritage", "safety", "activities", "hospitality_service"];
export const EMOTIONS = ["joy", "calm", "surprise", "trust"];

const KEYWORDS: Record<string, RegExp> = {
  scenery_nature: /nature|scener|view|sunrise|sunset|beach|island|mountain|hik|waterfall|forest|jungle|paddy|sea|alam|pantai|pulau|gunung|air terjun|hutan|pemandangan|matahari|自然|风景|海|岛|山|日出|日落|瀑布/i,
  food: /food|eat|cuisine|seafood|spicy|street food|cafe|makan|sedap|makanan|masakan|pedas|kopi|美食|吃|海鲜|小吃|辣/i,
  culture_heritage: /cultur|heritage|histor|museum|temple|mosque|tradition|craft|batik|kampung|budaya|warisan|sejarah|muzium|masjid|文化|古迹|历史|庙|传统/i,
  activities: /activit|adventure|div|snorkel|kayak|raft|theme park|cycling|fishing|shopping|aktiviti|menyelam|memancing|活动|潜水|浮潜|探险|购物/i,
  price_value: /cheap|budget|afford|value|not too expensive|inexpensive|murah|bajet|jimat|berbaloi|便宜|省钱|实惠|划算/i,
  crowding: /crowd|quiet|peaceful|hidden|off the beaten|less touristy|secluded|sesak|sunyi|tenang|ramai orang|人少|安静|清静|小众/i,
  accommodation: /hotel|resort|homestay|chalet|stay|glamping|penginapan|inap|酒店|民宿|住宿/i,
  access_transport: /easy to reach|accessible|public transport|train|flight|short drive|no car|senang sampai|pengangkutan|kereta api|交通|方便|火车/i,
  cleanliness: /clean|hygien|bersih|干净|卫生/i,
  safety: /safe|family|kids|children|solo female|selamat|keluarga|anak|安全|亲子|家庭/i,
  hospitality_service: /friendly|hospitab|service|locals|welcoming|mesra|layanan|ramah|热情|服务|友善/i,
};

export function parseLocal(text: string): Prefs {
  const topics: Record<string, number> = {};
  for (const [t, rx] of Object.entries(KEYWORDS)) if (rx.test(text)) topics[t] = 1;
  if (Object.keys(topics).length === 0) topics.scenery_nature = topics.food = 0.6;
  const quietWanted = /few crowd|no crowd|less crowd|quiet|peaceful|hidden|secluded|off the beaten|sunyi|tenang|tak ramai|tidak sesak|人少|安静|清静|小众/i.test(text);
  const lively = /lively|nightlife|bustling|meriah|热闹/i.test(text);
  const emotions = [
    ...(/(calm|relax|peace|tenang|santai|healing|放松|安静|悠闲)/i.test(text) ? ["calm"] : []),
    ...(/(fun|excit|adventure|thrill|seronok|刺激|好玩)/i.test(text) ? ["joy"] : []),
    ...(/(unique|hidden|surpris|different|unik|lain dari|特别|小众)/i.test(text) ? ["surprise"] : []),
  ];
  return {
    topics, emotions,
    budget: /cheap|budget|afford|not too expensive|inexpensive|murah|bajet|jimat|便宜|省钱|实惠/i.test(text) ? "low" : /luxur|premium|splurge|mewah|高级|奢华/i.test(text) ? "high" : null,
    quiet: quietWanted ? 1 : lively ? 0.1 : 0.6,
    region: /borneo|sabah|sarawak/i.test(text) ? "Borneo" : /peninsula|semenanjung|drive from kl|road trip/i.test(text) ? "Peninsular" : null,
    source: "keywords",
  };
}

const minmax = (v: number[]) => {
  const lo = Math.min(...v), hi = Math.max(...v);
  return v.map((x) => (hi > lo ? ((x - lo) / (hi - lo)) * 100 : 50));
};

export interface Recommendation {
  code: string;
  score: number;
  parts: { match: number; quiet: number; budget: number; feel: number };
  reasons: string[];
  places: JrPlace[];
  quotes: JrQuote[];
}

export const WEIGHTS = { match: 0.4, quiet: 0.25, budget: 0.15, feel: 0.2 };

export function recommend(prefs: Prefs, rows: Row[], gap: GapRow[], labels: Record<string, string>, topicLabel: Record<string, string>): Recommendation[] {
  const spend = minmax(rows.map((r) => r.spend_per_visitor_rm as number));
  const feel = minmax(rows.map((r) => JR.states.find((s) => s.code === r.code)?.experience_score ?? 50));
  const wanted = Object.entries(prefs.topics).filter(([t, w]) => w > 0 && t !== "crowding" && t !== "price_value");
  // how strongly each state is praised on each wanted topic, scaled across states so differences show
  const topicScore: Record<string, number[]> = {};
  for (const [t] of wanted) {
    topicScore[t] = minmax(rows.map((r) => {
      const x = JR.topics.find((k) => k.code === r.code && k.topic === t);
      return x ? x.sentiment * 0.7 + Math.min(x.share_of_mentions * 100, 30) : 50;
    }));
  }
  const crowdSent = minmax(rows.map((r) => JR.topics.find((k) => k.code === r.code && k.topic === "crowding")?.sentiment ?? 50));

  return rows.map((r, i) => {
    const g = gap.find((x) => x.code === r.code)!;
    const wsum = wanted.reduce((s, [, w]) => s + w, 0);
    let match = wsum ? wanted.reduce((s, [t, w]) => s + topicScore[t][i] * w, 0) / wsum : 50;
    const st = JR.states.find((s) => s.code === r.code);
    if (st && prefs.emotions.length) {
      const share = prefs.emotions.reduce((s, e) => s + ((st[`emo_${e}`] as number) ?? 0), 0);
      match = match * 0.8 + Math.min(share * 250, 100) * 0.2;
    }
    const quietRaw = (100 - g.actual) * 0.7 + crowdSent[i] * 0.3;
    const quiet = 50 + (quietRaw - 50) * (0.4 + prefs.quiet * 1.1);
    const budget = prefs.budget === "low" ? 100 - spend[i] : prefs.budget === "high" ? spend[i] : 100 - Math.abs(spend[i] - 50);
    const parts = { match, quiet: Math.max(0, Math.min(100, quiet)), budget, feel: feel[i] };
    let score = parts.match * WEIGHTS.match + parts.quiet * WEIGHTS.quiet + parts.budget * WEIGHTS.budget + parts.feel * WEIGHTS.feel;
    // an explicit region is a requirement, not a preference: states outside it always rank below states inside it
    if (prefs.region && r.region !== prefs.region) score -= 100;

    const wantedTopics = wanted.map(([t]) => t);
    const places = JR.places.filter((p) => p.code === r.code)
      .map((p) => ({ p, s: (p.tags.filter((t) => wantedTopics.includes(t)).length + p.praised_for.filter((t) => wantedTopics.includes(t)).length) * 20 + p.sentiment * 0.4 + Math.log1p(p.mentions) * 6 }))
      .filter((x) => x.s > 45).sort((a, b) => b.s - a.s).slice(0, 4).map((x) => x.p);
    const quotes = JR.quotes.filter((q) => q.code === r.code && q.overall > 0 && q.topics.some((t) => wantedTopics.includes(t))).slice(0, 6);

    const best = wanted.map(([t]) => ({ t, v: JR.topics.find((k) => k.code === r.code && k.topic === t) })).filter((x) => x.v && x.v.n >= 3)
      .sort((a, b) => b.v!.sentiment - a.v!.sentiment)[0];
    // plain language: these are read by travellers, not analysts
    const reasons = [
      best ? `People who went ${best.v!.sentiment >= 90 ? "rave about" : best.v!.sentiment >= 75 ? "really liked" : "liked"} the ${topicLabel[best.t].toLowerCase()}` : null,
      g.actual < 45 ? "One of the quietest states in Malaysia" : g.actual < 60 ? "Moderately busy - quieter than the big names" : "One of the busier states, so expect company",
      spend[i] < 40 ? "Easy on the wallet compared with most states" : spend[i] > 70 ? "On the pricier side" : "Middle of the road on cost",
      (r.occupancy_pct as number) < 50 ? "Rooms are easy to find" : null,
    ].filter(Boolean) as string[];
    return { code: r.code, score, parts, reasons, places, quotes };
  }).sort((a, b) => b.score - a.score);
}

export const EXAMPLES: { text: string; prefs: Prefs }[] = [
  { text: "nice scenery, few crowds, not too expensive, sunrise or sunset, nature vibe",
    prefs: { topics: { scenery_nature: 1, crowding: 1, price_value: 0.8 }, emotions: ["calm"], budget: "low", quiet: 1, region: null, source: "example" } },
  { text: "nak makan sedap, tempat tenang, bajet murah, bawa keluarga",
    prefs: { topics: { food: 1, safety: 0.7, price_value: 0.8 }, emotions: ["calm"], budget: "low", quiet: 0.9, region: null, source: "example" } },
  { text: "想去人少的地方，看文化古迹，吃地道美食",
    prefs: { topics: { culture_heritage: 1, food: 1 }, emotions: ["surprise"], budget: null, quiet: 1, region: null, source: "example" } },
  { text: "adventure trip in Borneo: diving, hiking, friendly locals",
    prefs: { topics: { activities: 1, scenery_nature: 0.8, hospitality_service: 0.7 }, emotions: ["joy"], budget: null, quiet: 0.6, region: "Borneo", source: "example" } },
  { text: "short road trip from KL, heritage town, good coffee, comfortable hotel",
    prefs: { topics: { culture_heritage: 1, food: 0.8, accommodation: 0.8, access_transport: 0.6 }, emotions: [], budget: "mid", quiet: 0.6, region: "Peninsular", source: "example" } },
  { text: "luxury island resort, clean beaches, great service",
    prefs: { topics: { accommodation: 1, cleanliness: 0.9, hospitality_service: 0.9, scenery_nature: 0.8 }, emotions: ["calm"], budget: "high", quiet: 0.7, region: null, source: "example" } },
];
