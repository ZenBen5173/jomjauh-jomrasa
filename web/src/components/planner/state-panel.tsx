"use client";

/** The right-hand panel of the dashboard: everything a planner needs about the selected state, at a glance. */
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, BedDouble, MessageCircleHeart, PanelRightOpen } from "lucide-react";
import { Info } from "@/components/info";
import { PILLAR_BLURB, STAGE, STATE_NAME, fmt } from "@/lib/data";
import { JR, TOPIC_LABEL } from "@/lib/jomrasa";
import { useStore } from "@/lib/store";
import { usePalette } from "@/lib/theme";

const EASE = [0.16, 1, 0.3, 1] as const;

function Bar({ value, color, tick }: { value: number; color: string; tick?: number }) {
  return (
    <div className="relative h-2 rounded-full bg-muted">
      <motion.div className="absolute inset-y-0 left-0 rounded-full" style={{ background: color }} initial={false}
        animate={{ width: `${Math.max(0, Math.min(100, value)).toFixed(2)}%` }} transition={{ duration: 0.6, ease: EASE }} />
      {tick != null && <span className="absolute inset-y-[-3px] w-px bg-[var(--slate-9)]" style={{ left: `${tick}%` }} />}
    </div>
  );
}

export function StatePanel({ code, onOpenProfile }: { code: string; onOpenProfile: () => void }) {
  const { rows, gap, pillars, capacity, assumptions } = useStore();
  const tone = usePalette();
  const r = rows.find((x) => x.code === code)!;
  const g = gap.find((x) => x.code === code)!;
  const p = pillars.find((x) => x.code === code)!;
  const cap = capacity.find((x) => x.code === code)!;
  const jr = JR.states.find((x) => x.code === code);
  const topics = JR.topics.filter((t) => t.code === code && t.n >= 8).sort((a, b) => b.sentiment - a.sentiment);
  const occ = r.occupancy_pct as number;
  const binding = p.bottleneck_score < 50;

  return (
    <section className="flex h-full min-w-0 flex-col rounded-2xl border border-border bg-card p-5">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={code} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="flex flex-1 flex-col">
          <div data-guide={`state:${code}`} className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{STATE_NAME[code]}</h2>
              <p className="text-xs text-muted-foreground">{fmt.visitorsK(r.visitors_k as number)} visitors · {fmt.pct(r.visitor_share_pct as number)} of Malaysia</p>
            </div>
            <span className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold tabular-nums" style={{ background: g.gap >= 0 ? "rgba(57,135,229,0.18)" : "rgba(230,103,103,0.18)", color: g.gap >= 0 ? tone.ink.opportunity : tone.ink.problem }}>
              Opportunity {fmt.signed(g.gap, 0)} · #{g.gap_rank}
            </span>
          </div>

          <div className="mt-4 space-y-2">
            {([["How visited it is", g.actual, STAGE.problem.base], ["What it can offer", g.potential, STAGE.opportunity.base]] as const).map(([label, v, c]) => (
              <div key={label} data-guide={`panel:${c === STAGE.problem.base ? "visited" : "offer"}:${code}`}>
                <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">{label}</span><span className="font-medium tabular-nums">{v.toFixed(0)}</span></div>
                <Bar value={v} color={c} />
              </div>
            ))}
          </div>

          <div className="mt-5" data-guide={`panel:pillars:${code}`}>
            <p className="mb-2 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              What holds it back
              <Info>Each pillar is scored against the typical state: 50 is the national median (the tick). The weakest pillar is called the bottleneck only when it is below that median. Access uses proxies - open road and flight data do not exist.</Info>
            </p>
            <div className="space-y-2">
              {Object.entries(p.scores).map(([k, v]) => (
                <div key={k}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-sm" style={{ background: tone.pillar[k] }} />{k}
                      {k === p.bottleneck && binding && <span className="rounded bg-[#e0a030]/20 px-1.5 py-px text-[10px] font-medium text-[#8a5a00] dark:text-[#ecc477]">bottleneck</span>}
                    </span>
                    <span className="font-medium tabular-nums">{v.toFixed(0)}</span>
                  </div>
                  <Bar value={v} color={tone.pillar[k]} tick={50} />
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{binding ? `${PILLAR_BLURB[p.bottleneck]}.` : "Nothing below the national median - this state is not held back."}</p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <div data-guide={`panel:room:${code}`} className="rounded-xl bg-muted/50 p-3">
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><BedDouble className="size-3.5" />Room to grow
                <Info>Extra visitors a year before hotels pass the {assumptions.target_occupancy_pct}% occupancy ceiling (an assumption you can change in the Simulator). Only overnight visitors in paid accommodation need rooms.</Info>
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums">+{fmt.visitorsK(cap.max_extra_visitors_k)}</p>
              <p className="text-[11px] text-muted-foreground">hotels {fmt.pct(occ, 0)} full</p>
            </div>
            <div data-guide={`panel:feel:${code}`} className="rounded-xl bg-muted/50 p-3">
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><MessageCircleHeart className="size-3.5" />Travellers say</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{jr ? jr.experience_score.toFixed(0) : "-"}<span className="text-xs font-normal text-muted-foreground"> /100</span></p>
              <p className="truncate text-[11px] text-muted-foreground">{topics.length ? `weakest: ${TOPIC_LABEL[topics[topics.length - 1].topic].toLowerCase()}` : "from public travel text"}</p>
            </div>
          </div>

          <div className="mt-auto flex flex-wrap gap-2 pt-5">
            <button data-guide={`panel:profile:${code}`} onClick={onOpenProfile} className="group inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-transform active:scale-[0.98]">
              <PanelRightOpen className="size-3.5" />Full profile
            </button>
            <Link href="/simulator" data-guide={`panel:simulate:${code}`} className="group inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-[#199e70]/50 px-3 py-2 text-xs font-medium text-[#5fd0a5] transition-colors hover:border-[#199e70] hover:bg-[#199e70]/10">
              Simulate <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
