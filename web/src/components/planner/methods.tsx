"use client";

/**
 * How each score is calculated: what it tells us, the steps, and a worked example.
 * The example is not text: it is recomputed from the live data for the state and year picked,
 * using the same functions as the dashboard, so it always matches the screen.
 */
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { INDICATORS, STAGE, STATE_LABEL, fmt } from "@/lib/data";
import { JR, TOPIC_LABEL } from "@/lib/jomrasa";
import { simulate, type Indicator, type Row } from "@/lib/metrics";
import { useStore } from "@/lib/store";

type StageKey = keyof typeof STAGE;
const EASE = [0.16, 1, 0.3, 1] as const;
const REST = "#8b8d98";
const num = (r: Row, c: string) => Number(r[c] ?? 0);
const pre = (x: number, ind: Indicator) => (ind.log ? Math.log1p(Math.max(x, 0)) : x);
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const short = (v: number) => (Math.abs(v) >= 1000 ? fmt.int(v) : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));

function Method({ n, stage, title, tells, steps, children }: { n: number; stage: StageKey | null; title: string; tells: string; steps: React.ReactNode[]; children: React.ReactNode }) {
  const color = stage ? STAGE[stage].base : REST;
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.5, ease: EASE }}
      data-guide-stage={stage ?? undefined} className="group flex min-w-0 flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-foreground/20">
      <div className="flex items-center gap-2.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-black transition-transform group-hover:scale-110" style={{ background: color }}>{n}</span>
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      </div>
      <p className="mt-2 text-[13px] leading-snug text-muted-foreground">{tells}</p>
      <ol className="mt-3 space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2.5 text-[13px] leading-snug"><span className="w-3 shrink-0 text-right text-xs font-semibold tabular-nums" style={{ color }}>{i + 1}</span><span>{s}</span></li>
        ))}
      </ol>
      <div className="mt-4 rounded-xl bg-muted/40 p-3.5 text-[13px] leading-relaxed" style={{ borderLeft: `3px solid ${color}` }}>{children}</div>
    </motion.section>
  );
}

const B = ({ children }: { children: React.ReactNode }) => <b className="font-semibold tabular-nums text-foreground">{children}</b>;
const Eg = ({ children }: { children: React.ReactNode }) => <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{children}</p>;

export function Methods() {
  const { rows, gap, pillars, capacity, concentration, assumptions, year, selected } = useStore();
  const [picked, setPicked] = useState<string | null>(null);
  const code = picked ?? selected ?? "JHR";
  const name = STATE_LABEL[code];
  const row = rows.find((r) => r.code === code)!;
  const g = gap.find((x) => x.code === code)!;
  const pil = pillars.find((x) => x.code === code)!;
  const cap = capacity.find((x) => x.code === code)!;

  // concentration
  const byVisits = [...rows].sort((a, b) => num(b, "visitors_k") - num(a, "visitors_k"));
  const total = rows.reduce((a, r) => a + num(r, "visitors_k"), 0);
  const top3 = byVisits.slice(0, 3);
  const bottomHalf = byVisits.slice(8).reduce((a, r) => a + num(r, "visitors_k"), 0) / total;

  // one ingredient by hand: spare occupancy is not logged, so the sum is easy to follow
  const ind = INDICATORS.potential.find((i) => i.col === "spare_occupancy_pct") ?? INDICATORS.potential[0];
  const vals = rows.map((r) => pre(num(r, ind.col), ind));
  const lo = Math.min(...vals), hi = Math.max(...vals), mine = pre(num(row, ind.col), ind);
  const parts = (inds: Indicator[]) => inds.filter((i) => i.col in g.parts);

  // one pillar ingredient by hand
  const weakest = pil.bottleneck;
  const zs = Object.entries(pil.z[weakest] ?? {});
  const [zCol] = [...zs].sort((a, b) => a[1] - b[1])[0] ?? ["", 0];
  const zInd = INDICATORS.pillars[weakest]?.find((i) => i.col === zCol);
  const zVals = zInd ? rows.map((r) => pre(num(r, zInd.col), zInd)) : [];
  const med = median(zVals), spread = median(zVals.map((v) => Math.abs(v - med))) * 1.4826;
  const zMean = zs.reduce((a, [, v]) => a + v, 0) / Math.max(zs.length, 1);

  // simulator: a tenth of the busiest state to the three most untapped states
  const sim = useMemo(() => {
    const origin = byVisits[0].code;
    const dests = [...gap].sort((a, b) => b.gap - a.gap).map((x) => x.code).filter((c) => c !== origin && !["LBN", "PJY", "KUL"].includes(c)).slice(0, 3);
    return { origin, dests, out: simulate(rows, { origin, destinations: Object.fromEntries(dests.map((d) => [d, 1])), share_pct: 10 }, assumptions) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, gap, assumptions]);

  // traveller scores: the least and most talked-about topics show what the small-sample fix does
  const jr = JR.states.find((x) => x.code === code);
  const topics = JR.topics.filter((t) => t.code === code && t.n > 0).sort((a, b) => a.n - b.n);
  const few = topics[0], many = topics[topics.length - 1];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">How each score is calculated</h2>
        <span className="hidden h-px flex-1 bg-border sm:block" />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">Worked example for
          <select value={code} onChange={(e) => setPicked(e.target.value)} className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground outline-none transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring">
            {[...rows].sort((a, b) => STATE_LABEL[a.code].localeCompare(STATE_LABEL[b.code])).map((r) => <option key={r.code} value={r.code}>{STATE_LABEL[r.code]}</option>)}
          </select>
          <span className="tabular-nums">{year}</span>
        </label>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Method n={1} stage="problem" title="Concentration (Gini)" tells="Are visits spread across the country, or piled into a few states? 0 = every state gets the same. 1 = one state gets everything."
          steps={["Sort the 16 states from fewest visitors to most.", "Give them weights from −15 (smallest) up to +15 (biggest), in steps of 2.", "Multiply each state's visitors by its weight and add everything up.", "Divide by (16 × total visitors)."]}>
          <Eg>Malaysia {year}</Eg>
          Gini = <B>{concentration.gini.toFixed(3)}</B>. The top 3 ({top3.map((r) => STATE_LABEL[r.code]).join(", ")}) take <B>{fmt.pct(concentration.top3_share * 100)}</B> of {fmt.visitorsK(total)} visits.
          The 8 least-visited states share only <B>{fmt.pct(bottomHalf * 100)}</B>. The Lorenz curve is the same thing drawn: the further it sags below the diagonal, the more uneven.
        </Method>

        <Method n={2} stage="opportunity" title="Opportunity score" tells="Which states have a lot to offer but few visitors? Opportunity = what it can offer − how visited it already is."
          steps={["Score every ingredient from 0 to 100: (state − lowest state) ÷ (highest − lowest) × 100.", "Counts (rooms, attractions, visitor measures) are logged first, so Kuala Lumpur's size does not flatten everyone else.", `Offer = average of ${parts(INDICATORS.potential).length} scores. Visited = average of ${parts(INDICATORS.actual).length}. Equal weights unless you move the sliders.`, "Opportunity = Offer − Visited. Above 0 is untapped, below 0 is crowded."]}>
          <Eg>{name} {year}</Eg>
          <span className="block">{ind.label}: ({short(mine)} − {short(lo)}) ÷ ({short(hi)} − {short(lo)}) × 100 = <B>{g.parts[ind.col]?.toFixed(1)}</B></span>
          <span className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {parts(INDICATORS.potential).map((i) => <span key={i.col} className="contents"><span className="truncate">{i.label}</span><span className="text-right tabular-nums text-foreground">{g.parts[i.col].toFixed(1)}</span></span>)}
            <span className="contents font-medium text-foreground"><span className="border-t border-border pt-1">Offer (average)</span><span className="border-t border-border pt-1 text-right tabular-nums">{g.potential.toFixed(1)}</span></span>
            {parts(INDICATORS.actual).map((i) => <span key={i.col} className="contents"><span className="truncate pt-1 first:pt-0">{i.label}</span><span className="text-right tabular-nums text-foreground">{g.parts[i.col].toFixed(1)}</span></span>)}
            <span className="contents font-medium text-foreground"><span className="border-t border-border pt-1">Visited (average)</span><span className="border-t border-border pt-1 text-right tabular-nums">{g.actual.toFixed(1)}</span></span>
          </span>
          <span className="mt-2 block">{g.potential.toFixed(1)} − {g.actual.toFixed(1)} = <B>{fmt.signed(g.gap)}</B>, rank <B>{g.gap_rank}</B> of 16.</span>
        </Method>

        <Method n={3} stage="obstacle" title="Bottleneck" tells="What holds a state back: getting there (access), being known (awareness), or places to stay (amenities)? Four ingredients each."
          steps={["For each ingredient, find the typical state: the median of the 16.", "Typical spread = the median distance from that median × 1.4826.", "Distance = (state − median) ÷ typical spread, limited to −3 … +3.", "Pillar score = 50 + (average of its 4 distances) × 50 ÷ 3. 50 = the typical state.", "Bottleneck = the lowest pillar, flagged only if it is below 50."]}>
          <Eg>{name} {year}</Eg>
          {zInd && <span className="block">{zInd.label}: ({short(pre(num(row, zInd.col), zInd))} − {short(med)}) ÷ {short(spread)} = <B>{(pil.z[weakest][zCol]).toFixed(2)}</B></span>}
          <span className="mt-1 block">{weakest}: average distance {zMean.toFixed(2)}, so 50 + ({zMean.toFixed(2)} × 16.67) = <B>{pil.scores[weakest].toFixed(1)}</B></span>
          <span className="mt-1 block text-muted-foreground">{Object.entries(pil.scores).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(" · ")}. {pil.bottleneck_score < 50 ? <>Bottleneck: <B>{weakest}</B>.</> : <>All three are at or above typical, so <B>no bottleneck</B> is flagged.</>}</span>
        </Method>

        <Method n={4} stage="payoff" title="Room to grow" tells="How many more visitors can the hotels that already exist take, without building anything?"
          steps={[`Spare room-nights = rooms × 365 × (${assumptions.target_occupancy_pct}% − occupancy). The ceiling is yours to change in the Simulator.`, `Room-nights one visitor needs = overnight share × paid accommodation share × nights ÷ ${assumptions.guests_per_room} per room.`, "Extra visitors = step 1 ÷ step 2."]}>
          <Eg>{name} {year}</Eg>
          <span className="block">{fmt.int(num(row, "rooms"))} × 365 × ({assumptions.target_occupancy_pct}% − {num(row, "occupancy_pct").toFixed(1)}%) = <B>{fmt.int(cap.spare_room_nights)}</B> spare room-nights</span>
          <span className="mt-1 block">{num(row, "overnight_share").toFixed(2)} × {num(row, "paid_accommodation_share").toFixed(2)} × {num(row, "avg_length_of_stay").toFixed(2)} ÷ {assumptions.guests_per_room} = <B>{cap.room_nights_per_visitor.toFixed(3)}</B> per visitor</span>
          <span className="mt-1 block">{fmt.int(cap.spare_room_nights)} ÷ {cap.room_nights_per_visitor.toFixed(3)} = <B>{fmt.visitorsK(cap.max_extra_visitors_k)}</B> extra visitors</span>
        </Method>

        <Method n={5} stage="payoff" title="Simulator" tells="What changes if some visitors go to another state instead? A what-if calculator, not a forecast."
          steps={["Visitors moved = the crowded state's visitors × the chosen %.", "Split them across the destinations. None takes more than its room to grow; the overflow goes to the others.", "Gained = moved × destination's spend per visitor. Lost = moved × origin's spend per visitor. Net = gained − lost.", "Gini, top-3 share and hotel occupancy are recalculated."]}>
          <Eg>10% of {STATE_LABEL[sim.origin]} to {sim.dests.map((d) => STATE_LABEL[d]).join(", ")}</Eg>
          <span className="block"><B>{fmt.visitorsK(sim.out.moved_k)}</B> moved{sim.out.capacity_binds ? ` of ${fmt.visitorsK(sim.out.requested_k)} asked (hotels full)` : ", all fit"}.</span>
          <span className="mt-1 block">{fmt.rmM(sim.out.receipts_gained_rm_m)} gained − {fmt.rmM(sim.out.receipts_lost_rm_m)} lost = <B>{sim.out.net_national_rm_m >= 0 ? "+" : "−"}{fmt.rmM(Math.abs(sim.out.net_national_rm_m))}</B></span>
          <span className="mt-1 block">Gini {sim.out.concentration_before.gini.toFixed(3)} to <B>{sim.out.concentration_after.gini.toFixed(3)}</B>.</span>
        </Method>

        <Method n={6} stage={null} title="Traveller scores (JomRasa)" tells="How do real travellers describe each state? The only part that uses AI, and only to label text."
          steps={[`A ready-made model (Gemini 2.5 Flash Lite) tags each post from fixed lists: real trip or not, place, topic (1 of ${JR.meta.topics.length}), negative / mixed / positive.`, `The "real trip?" question is asked twice; a post is kept only on two yeses: ${fmt.int(JR.meta.items_travel)} posts.`, "Negative = 0, mixed = 50, positive = 100. Average per state and topic.", "Few mentions? The average is pulled towards the national average: (mentions × state average + k × national average) ÷ (mentions + k).", "Experience Score = average of the adjusted topic scores."]}>
          <Eg>{name}</Eg>
          {few && many ? <>
            <span className="block">{TOPIC_LABEL[few.topic]}: only {few.n} mentions averaging {(few.sentiment_raw ?? few.sentiment).toFixed(1)}, adjusted to <B>{few.sentiment.toFixed(1)}</B>.</span>
            <span className="mt-1 block">{TOPIC_LABEL[many.topic]}: {many.n} mentions averaging {(many.sentiment_raw ?? many.sentiment).toFixed(1)}, adjusted to <B>{many.sentiment.toFixed(1)}</B> (plenty of evidence, so it hardly moves).</span>
            {jr && <span className="mt-1 block">Experience Score = <B>{jr.experience_score.toFixed(1)}</B> from {fmt.int(jr.mentions_n)} posts.</span>}
          </> : <span>No traveller posts for this state.</span>}
        </Method>
      </div>
    </div>
  );
}
