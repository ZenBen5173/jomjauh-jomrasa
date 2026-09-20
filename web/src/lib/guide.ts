/**
 * What Jojo (the guide in the corner of the planner) says when the pointer rests on something.
 *
 * Jojo talks to someone who has never read a chart: everyday words, and almost no numbers - the
 * screen already shows those. No language model: every line is a template filled from the same data
 * the dashboard shows, so the guide can never contradict it. A zone names itself with
 * `data-guide="key"`; `explain(key, ctx)` turns the key into a sentence or two and the stage it belongs to.
 */
import { PILLAR_BLURB, STATE_LABEL, STATE_NAME, TREND } from "./data";
import { JR, TOPIC_LABEL } from "./jomrasa";
import type { Assumptions, CapacityRow, GapRow, PillarRow, Row } from "./metrics";
import type { StoryFacts } from "./story";

export type Stage = "problem" | "opportunity" | "obstacle" | "payoff";
export interface Say { text: string; stage: Stage | null }
export interface GuideCtx {
  rows: Row[]; gap: GapRow[]; pillars: PillarRow[]; capacity: CapacityRow[]; assumptions: Assumptions;
  concentration: { gini: number }; year: number; facts: StoryFacts;
}

export const GREETING = "Hi, I'm Jojo! Point at anything and I'll explain it in plain words.";

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const labels = (codes: string[]) => list(codes.map((c) => STATE_LABEL[c]));
const short = (code: string) => STATE_NAME[code].replace("W.P. ", "");
const say = (stage: Stage | null, text: string): Say => ({ stage, text });

/** A share as people say it out loud: 0.33 -> "about a third". */
export function inWords(share: number): string {
  if (share < 0.15) return "a small slice";
  if (share < 0.22) return "about a fifth";
  if (share < 0.29) return "about a quarter";
  if (share < 0.38) return "about a third";
  if (share < 0.45) return "about two in five";
  if (share < 0.56) return "about half";
  return "more than half";
}

// the three weak spots, the way you would say them to a friend
const WEAK: Record<string, string> = { Access: "it is hard to get to", Awareness: "not many people know about it", Amenities: "it does not have enough places to stay and eat" };

function aboutState(code: string, c: GuideCtx): Say | null {
  const r = c.rows.find((x) => x.code === code), g = c.gap.find((x) => x.code === code);
  const p = c.pillars.find((x) => x.code === code), cap = c.capacity.find((x) => x.code === code);
  if (!r || !g || !p || !cap) return null;
  const name = short(code);
  const place = [...c.rows].sort((a, b) => (b.visitors_k as number) - (a.visitors_k as number)).findIndex((x) => x.code === code);
  const crowd = place < 4 ? "is one of the busiest places in Malaysia" : place >= c.rows.length - 4 ? "is one of the quietest places in Malaysia" : "gets a middling number of visitors";
  const verdict = g.gap >= 5 && place < 4 ? "Even so, it has so much to offer that it could still handle more."
    : g.gap >= 5 ? "It has more to offer than its visitor numbers suggest, so it deserves more attention."
    : g.gap <= -5 ? "It is already busier than you would expect for what it offers."
      : "That is about right for what it offers.";
  const hold = p.bottleneck_score < 50 ? `What holds it back: ${WEAK[p.bottleneck]}.`
    : cap.max_extra_visitors_k > 0 ? "Nothing major holds it back, and its hotels still have room."
      : "Its hotels are already nearly full, so it needs more rooms before more visitors.";
  return say(g.gap >= 0 ? "opportunity" : "problem", `${name} ${crowd}. ${verdict} ${hold}`);
}

function aboutMetric(m: string, c: GuideCtx): Say | null {
  const ends = (col: string) => {
    const s = [...c.rows].sort((a, b) => (b[col] as number) - (a[col] as number));
    return [STATE_LABEL[s[0].code], STATE_LABEL[s[s.length - 1].code]];
  };
  switch (m) {
    case "gap": return say("opportunity", "This map shows who deserves more visitors. Blue states have a lot to offer but few people go. Red states are already busy.");
    case "visitors": { const [hi, lo] = ends("visitors_k"); return say("problem", `Where the crowds are. The brighter the red, the more visitors. ${hi} is the busiest and ${lo} is the quietest.`); }
    case "occupancy": { const [hi, lo] = ends("occupancy_pct"); return say("opportunity", `How full the hotels are. Emptier hotels mean a state can welcome more people straight away. Hotels are fullest in ${hi} and emptiest in ${lo}.`); }
    case "spend": { const [hi, lo] = ends("spend_per_visitor_rm"); return say("opportunity", `How much a typical visitor spends on a trip. People spend the most in ${hi} and the least in ${lo}.`); }
    case "feel": return say("opportunity", "What travellers think of each state. We read thousands of public travel posts and comments to see what people liked and disliked. It is a helpful hint, not an official figure.");
    case "bottleneck": return say("obstacle", "The main thing holding each state back: hard to get to, not well known, or not enough places to stay. Grey states are doing fine.");
    default: return null;
  }
}

function aboutPanel(part: string, code: string, c: GuideCtx): Say | null {
  const g = c.gap.find((x) => x.code === code), p = c.pillars.find((x) => x.code === code), cap = c.capacity.find((x) => x.code === code);
  if (!g || !p || !cap) return null;
  const name = short(code);
  switch (part) {
    case "visited": return say("problem", `How busy ${name} already is compared with the other states. A longer bar means more crowded. ${name} is ${g.actual < 35 ? "on the quiet side" : g.actual < 65 ? "about average" : "on the busy side"}.`);
    case "offer": return say("opportunity", `How much ${name} has going for it: hotels, things to see, and how much travellers enjoy it. ${g.potential > g.actual ? "Its blue bar is longer than its red one, so it could handle more visitors." : "Its red bar is longer than its blue one, so it is already well used."}`);
    case "pillars": return say("obstacle", `Three things can hold a state back: getting there (access), being known (awareness) and places to stay (amenities). The little line marks a typical state. ${p.bottleneck_score < 50 ? `${name} falls short on ${p.bottleneck.toLowerCase()}: ${PILLAR_BLURB[p.bottleneck].toLowerCase()}.` : `${name} is fine on all three.`}`);
    case "room": return say("opportunity", cap.max_extra_visitors_k > 0
      ? `${name}'s hotels still have empty rooms on most nights. The big number is roughly how many more visitors they could take in a year before filling up.`
      : `${name}'s hotels are already nearly full. It needs more rooms before it can take more visitors.`);
    case "feel": {
      const t = JR.topics.filter((x) => x.code === code && x.n >= 8).sort((a, b) => b.sentiment - a.sentiment);
      if (!t.length) return say("opportunity", `What travellers say about ${name}, as a score out of 100.`);
      return say("opportunity", `What travellers say about ${name}, as a score out of 100. They love its ${TOPIC_LABEL[t[0].topic].toLowerCase()}; they grumble most about ${TOPIC_LABEL[t[t.length - 1].topic].toLowerCase()}.`);
    }
    case "profile": return say(null, `Open ${name}'s full story: is it getting busier, when is it quiet, where do its visitors come from and what do people say about it.`);
    case "simulate": return say("payoff", `Curious what happens if more visitors went to ${name}? The simulator lets you try it.`);
    default: return null;
  }
}

export function explain(key: string, c: GuideCtx): Say | null {
  const [kind, a, b] = key.split(":");
  const f = c.facts;
  switch (kind) {
    case "problem": return say("problem", `Ah, you're looking at the problem. Did you know? ${inWords(f.top3Share).replace(/^a/, "A")} of all trips go to just three places - ${labels(f.top3)}. That's a bit crowded, isn't it?`);
    case "opportunity": return say("opportunity", `Here's the good news. Quiet states like ${labels(f.untapped.slice(0, 3))} have lots of empty hotel rooms right now. They could welcome many more visitors without building anything new.`);
    case "obstacle": return say("obstacle", "So why aren't people going? Almost every quiet state has one weak spot: some are hard to get to, some are not well known, and some don't have enough places to stay. Pick Bottleneck in the bar below to see which is which.");
    case "payoff": return say("payoff", `Let's play what-if. Imagine one in ten of ${STATE_LABEL[f.origin]}'s visitors went to ${labels(f.dests)} instead. Tourism would be shared ${f.giniChangePct <= 0 ? "a little more fairly" : "a little less fairly"}. The country would not earn more - the money just moves around. Try your own idea in the Simulator tab.`);
    case "stat":
      if (a === "visits") return say(null, `How many trips Malaysians made inside Malaysia in ${c.year}. If someone visits two states on one holiday, that counts as two.`);
      if (a === "spending") return say(null, c.year > 2023
        ? "Roughly how much those travellers spent. It is our best estimate, because the government's latest state-by-state spending figures are from 2023."
        : "How much those travellers spent, straight from the government's 2023 survey.");
      if (a === "gini") {
        const prev = TREND.gini_by_year[String(c.year - 1)];
        return say("problem", `This number shows how lopsided tourism is. Closer to 0 means visitors are nicely spread out; closer to 1 means everyone crowds into one place.${prev ? ` It is ${c.concentration.gini > prev ? "a little more" : "a little less"} lopsided than last year.` : ""}`);
      }
      return null;
    case "metric": return aboutMetric(a, c);
    case "state": return aboutState(a, c);
    case "panel": return aboutPanel(a, b, c);
    case "ranking": return say(null, "All 16 states in order, for whatever the map is showing. Click a row and that state lights up everywhere.");
    case "weights": return say(null, "Not sure hotels should count as much as attractions? Open this to change what matters most and watch the ranking change.");
    case "reading": return say(null, "The map in one line: the three states at each end. Click a name to focus on it.");
    case "chart":
      if (a === "lorenz") return say("problem", `If every state got a fair share of visitors, this curve would follow the dotted line. The more it sags, the more lopsided tourism is. The quieter half of the states get only ${inWords(f.shares.slice(8).reduce((s, x) => s + x.share, 0))} of the visitors.`);
      if (a === "gini") {
        const g18 = TREND.gini_by_year["2018"], now = TREND.gini_by_year[String(c.year)];
        return say("problem", `How lopsided tourism has been, year by year. The jump in 2021 was the pandemic, when few people travelled. Today it is ${now > g18 ? "slightly more" : "slightly less"} lopsided than in 2018.`);
      }
      if (a === "feel") return say("opportunity", "Here's the twist: people who visit the quiet states enjoy them just as much as the famous ones. So quiet states are not quiet because they are bad.");
      return null;
    case "year": return say(null, "Pick which year to look at. Spending figures by state only go up to 2023, so for later years we reuse those.");
    case "travellers": return say(null, "That's JomRasa, the traveller side: a chat that suggests quieter places that fit what you like.");
    default: return null;
  }
}
