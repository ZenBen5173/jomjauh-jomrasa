/**
 * What Jojo (the guide in the corner of the planner) says when the pointer rests on something.
 *
 * No language model: every line is a template filled from the same data the dashboard shows, so the
 * guide can never state a number the screen does not back up. A zone names itself with
 * `data-guide="key"`; `explain(key, ctx)` turns the key into a sentence or two and the stage it belongs to.
 */
import { PILLAR_BLURB, STATE_LABEL, STATE_NAME, TREND, fmt } from "./data";
import { JR, TOPIC_LABEL } from "./jomrasa";
import type { Assumptions, CapacityRow, GapRow, PillarRow, Row } from "./metrics";
import type { StoryFacts } from "./story";

export type Stage = "problem" | "opportunity" | "obstacle" | "payoff";
export interface Say { text: string; stage: Stage | null }
export interface GuideCtx {
  rows: Row[]; gap: GapRow[]; pillars: PillarRow[]; capacity: CapacityRow[]; assumptions: Assumptions;
  concentration: { gini: number }; year: number; facts: StoryFacts;
}

export const GREETING = "Hi, I'm Jojo! Rest your mouse on anything and I'll tell you what it means.";

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const labels = (codes: string[]) => list(codes.map((c) => STATE_LABEL[c]));
const short = (code: string) => STATE_NAME[code].replace("W.P. ", "");
const say = (stage: Stage | null, text: string): Say => ({ stage, text });

function aboutState(code: string, c: GuideCtx): Say | null {
  const r = c.rows.find((x) => x.code === code), g = c.gap.find((x) => x.code === code);
  const p = c.pillars.find((x) => x.code === code), cap = c.capacity.find((x) => x.code === code);
  if (!r || !g || !p || !cap) return null;
  const name = short(code);
  const verdict = g.gap >= 5 ? `It has more to offer than its visitor numbers suggest - #${g.gap_rank} of 16 for untapped potential.`
    : g.gap <= -5 ? "It is already busier than what it offers would predict, so it is one of the saturated ones."
      : "Its visitor numbers roughly match what it has to offer.";
  const hold = p.bottleneck_score < 50 ? `Its weak link is ${p.bottleneck.toLowerCase()}: ${PILLAR_BLURB[p.bottleneck].toLowerCase()}.`
    : cap.max_extra_visitors_k > 0 ? `Nothing much holds it back, and its hotels could still take about ${fmt.visitorsK(cap.max_extra_visitors_k)} more visitors.`
      : `Its hotels are already past the ${c.assumptions.target_occupancy_pct}% ceiling, so it needs rooms before it needs marketing.`;
  return say(g.gap >= 0 ? "opportunity" : "problem", `${name} gets ${fmt.visitorsK(r.visitors_k as number)} visits a year, ${fmt.pct(r.visitor_share_pct as number)} of Malaysia's total. ${verdict} ${hold}`);
}

function aboutMetric(m: string, c: GuideCtx): Say | null {
  const ends = (col: string, f: (v: number) => string) => {
    const s = [...c.rows].sort((a, b) => (b[col] as number) - (a[col] as number));
    return [`${STATE_LABEL[s[0].code]} (${f(s[0][col] as number)})`, `${STATE_LABEL[s[s.length - 1].code]} (${f(s[s.length - 1][col] as number)})`];
  };
  switch (m) {
    case "gap": return say("opportunity", "Opportunity compares what a state can offer - rooms, attractions, spending, traveller experience - with how visited it already is. Blue states have more to offer than visitors; red ones are already busy.");
    case "visitors": { const [hi, lo] = ends("visitors_k", fmt.visitorsK); return say("problem", `Plain visitor counts - the brighter the red, the bigger the crowd. Busiest is ${hi}, quietest is ${lo}.`); }
    case "occupancy": { const [hi, lo] = ends("occupancy_pct", (v) => fmt.pct(v, 0)); return say("opportunity", `How full hotels are on average. Emptier hotels mean a state can grow without building anything. Fullest: ${hi}. Emptiest: ${lo}.`); }
    case "spend": { const [hi, lo] = ends("spend_per_visitor_rm", (v) => `RM ${fmt.int(v)}`); return say("opportunity", `What a typical domestic visitor spends on a trip. Highest: ${hi}. Lowest: ${lo}. These are 2023 figures - the latest DOSM has published by state.`); }
    case "feel": return say("opportunity", `The Experience Score, built from ${fmt.int(JR.meta.items_travel)} public travel posts scored on 11 things like food, scenery and cleanliness. Treat it as an indicator, not an official statistic.`);
    case "bottleneck": return say("obstacle", "Each state's weakest of three pillars - access, awareness, amenities - but only when it is below the typical state. Grey states have no real weak link.");
    default: return null;
  }
}

function aboutPanel(part: string, code: string, c: GuideCtx): Say | null {
  const r = c.rows.find((x) => x.code === code), g = c.gap.find((x) => x.code === code);
  const p = c.pillars.find((x) => x.code === code), cap = c.capacity.find((x) => x.code === code);
  if (!r || !g || !p || !cap) return null;
  const name = short(code);
  switch (part) {
    case "visited": return say("problem", `How intensely ${name} is visited, scored 0-100 against the other states: its share of all visits, visitors per resident and visitors per km2. It scores ${g.actual.toFixed(0)}.`);
    case "offer": return say("opportunity", `What ${name} has to offer, scored 0-100: rooms, spare hotel capacity, spending, length of stay, attractions, amenities and traveller experience. It scores ${g.potential.toFixed(0)} - ${g.potential > g.actual ? "more than its visitor score, so there is room to grow" : "less than its visitor score, so it is already well used"}.`);
    case "pillars": return say("obstacle", `Three things can hold a state back. 50 is the typical state - that's the tick mark. ${name}'s weakest is ${p.bottleneck.toLowerCase()} at ${p.bottleneck_score.toFixed(0)}${p.bottleneck_score < 50 ? `, below the tick, so that's its bottleneck: ${PILLAR_BLURB[p.bottleneck].toLowerCase()}.` : ", still above the tick, so nothing is really holding it back."}`);
    case "room": return say("opportunity", cap.max_extra_visitors_k > 0
      ? `${name}'s hotels are ${fmt.pct(r.occupancy_pct as number, 0)} full. Before they reach the ${c.assumptions.target_occupancy_pct}% ceiling they could take about ${fmt.visitorsK(cap.max_extra_visitors_k)} more visitors a year. Only overnight guests in paid rooms count.`
      : `${name}'s hotels are ${fmt.pct(r.occupancy_pct as number, 0)} full - already past the ${c.assumptions.target_occupancy_pct}% ceiling. It needs more rooms before more marketing.`);
    case "feel": {
      const jr = JR.states.find((x) => x.code === code);
      const t = JR.topics.filter((x) => x.code === code && x.n >= 8).sort((a, b) => b.sentiment - a.sentiment);
      if (!jr || !t.length) return say("opportunity", "What travellers wrote about this state, scored 0-100.");
      return say("opportunity", `Travellers rate ${name} ${jr.experience_score.toFixed(0)} out of 100 across ${fmt.int(jr.mentions_n)} posts. They are happiest about ${TOPIC_LABEL[t[0].topic].toLowerCase()}; the sore point is ${TOPIC_LABEL[t[t.length - 1].topic].toLowerCase()}.`);
    }
    case "profile": return say(null, `Open ${name}'s full profile: its trend, its quiet season, where its tourists come from and what travellers wrote.`);
    case "simulate": return say("payoff", `Curious what happens if more visitors went to ${name}? The simulator lets you try it.`);
    default: return null;
  }
}

export function explain(key: string, c: GuideCtx): Say | null {
  const [kind, a, b] = key.split(":");
  const f = c.facts;
  switch (kind) {
    case "problem": return say("problem", `Ah, you're looking at the problem. Did you know? ${fmt.pct(f.top3Share * 100, 0)} of all ${fmt.visitorsK(f.total)} visits go to just three states - ${labels(f.top3)}. That's a bit crowded, isn't it? Click and I'll show you where the crowds are.`);
    case "opportunity": return say("opportunity", `Here's the good news. The five most under-visited states - ${labels(f.untapped)} - could host about ${fmt.visitorsK(f.room)} more visitors a year before their hotels reach the ${c.assumptions.target_occupancy_pct}% ceiling. The room is already there.`);
    case "obstacle": return say("obstacle", `So why aren't people going? ${f.held.length} of 16 states have one weak link: ${f.groups.map((g) => `${g.n} ${g.k.toLowerCase()}`).join(", ")}. Each needs a different fix - click to see which state has which.`);
    case "payoff": return say("payoff", `Let's test it. If 10% of ${STATE_LABEL[f.origin]}'s trips went to ${labels(f.dests)}, ${fmt.visitorsK(f.sim.moved_k)} visitors would move and concentration would ${f.giniChangePct <= 0 ? "fall" : "rise"} ${Math.abs(f.giniChangePct).toFixed(1)}%. National spending barely changes - it's rebalancing, not new money. Click to try your own.`);
    case "stat":
      if (a === "visits") return say(null, `${fmt.visitorsK(f.total)} domestic visits in ${c.year}. Someone who visits two states is counted in both - that's how DOSM counts the national figure too.`);
      if (a === "spending") return say(null, c.year > 2023
        ? `What domestic visitors spent. Heads up: this one is an estimate - ${c.year} visitors multiplied by 2023 spend per visitor, because DOSM's state-level spending stops at 2023.`
        : "What domestic visitors spent in 2023, straight from DOSM's Domestic Tourism Survey by state.");
      if (a === "gini") {
        const prev = TREND.gini_by_year[String(c.year - 1)];
        return say("problem", `This is the Gini coefficient: 0 means visits are spread evenly across the 16 states, 1 means everyone goes to one state. Malaysia sits at ${c.concentration.gini.toFixed(3)}${prev ? `, ${c.concentration.gini > prev ? "a little more" : "a little less"} concentrated than in ${c.year - 1}` : ""}.`);
      }
      return null;
    case "metric": return aboutMetric(a, c);
    case "state": return aboutState(a, c);
    case "panel": return aboutPanel(a, b, c);
    case "ranking": return say(null, "All 16 states, ranked by whichever view the map is showing. Click a row and that state lights up everywhere.");
    case "weights": return say(null, "Think hotels should count more than attractions? Open this to change the weights and watch the ranking reshuffle. It also shows how stable the ranking is.");
    case "reading": return say(null, "The map in one line: the three states at each end. Click a name to focus it.");
    case "chart":
      if (a === "lorenz") return say("problem", `If tourism were perfectly even, this curve would follow the dashed line. It sags: the quietest 8 of 16 states receive only ${fmt.pct((1 - f.shares.slice(0, 8).reduce((s, x) => s + x.share, 0)) * 100, 0)} of visits.`);
      if (a === "gini") {
        const g18 = TREND.gini_by_year["2018"], now = TREND.gini_by_year[String(c.year)];
        return say("problem", `Concentration year by year. The spike in 2021 is the pandemic - few trips, mostly close to home. At ${now.toFixed(3)} it is now ${now > g18 ? "slightly higher" : "slightly lower"} than 2018's ${g18.toFixed(3)}.`);
      }
      if (a === "feel") {
        const s = JR.states.map((x) => x.experience_score);
        return say("opportunity", `Here's the twist: people who do go rate every state about the same - scores only run from ${Math.min(...s).toFixed(0)} to ${Math.max(...s).toFixed(0)}. Quiet states aren't quiet because they're bad.`);
      }
      return null;
    case "year": return say(null, "Switch the base year. 2023 is the only year with official state-level spending, so for 2024 and 2025 I carry 2023 spend per visitor forward.");
    case "travellers": return say(null, "That's JomRasa, the traveller side: a chat that suggests quieter places that fit what you like.");
    default: return null;
  }
}
