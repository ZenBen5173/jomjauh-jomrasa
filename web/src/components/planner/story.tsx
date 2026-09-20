"use client";

/**
 * The executive summary: the whole argument in four numbered steps - problem, opportunity,
 * obstacle, payoff. It is a summary to read, not a control: the view bar below is the one place that changes the dashboard.
 */
import { useMemo } from "react";
import { motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { SpotlightCard } from "@/components/spotlight-card";
import StatsCounter from "@/components/ui/stats-counter";
import { PILLAR_COLOR, STAGE, STATE_LABEL, fmt } from "@/lib/data";
import { storyFacts } from "@/lib/story";
import { useStore } from "@/lib/store";

const EASE = [0.16, 1, 0.3, 1] as const;

function Step({ n, guide, kicker, color, last, children }: { n: number; guide: string; kicker: string; color: string; last?: boolean; children: React.ReactNode }) {
  return (
    <motion.div data-guide={guide} className="relative min-w-0" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 * (n - 1), duration: 0.5, ease: EASE }}>
      <SpotlightCard glow={`${color}29`} className="h-full overflow-visible p-4 md:p-5">
        <div className="flex h-full flex-col">
          <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            <span className="grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white" style={{ background: color }}>{n}</span>
            {kicker}
          </p>
          {children}
        </div>
      </SpotlightCard>
      {!last && (
        <span aria-hidden className="absolute -right-[11px] top-1/2 z-10 hidden size-[18px] -translate-y-1/2 place-items-center rounded-full border border-border bg-background text-muted-foreground xl:grid">
          <ChevronRight className="size-3" />
        </span>
      )}
    </motion.div>
  );
}

const Big = ({ children }: { children: React.ReactNode }) => <p className="mt-3 whitespace-nowrap text-[clamp(1.6rem,2.3vw,2.125rem)] font-semibold leading-none tracking-tight">{children}</p>;
const Line = ({ children }: { children: React.ReactNode }) => <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">{children}</p>;

export function Story() {
  const { rows, gap, pillars, capacity, concentration, assumptions } = useStore();

  const s = useMemo(() => storyFacts(rows, gap, pillars, capacity, assumptions), [rows, gap, pillars, capacity, assumptions]);

  const names = (codes: string[]) => codes.map((c) => STATE_LABEL[c]).join(", ").replace(/, ([^,]*)$/, " and $1");

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Step n={1} guide="problem" kicker="The problem" color={STAGE.problem.base}>
        <Big><StatsCounter value={concentration.top3_share * 100} suffix="%" duration={0.9} /></Big>
        <Line>of {fmt.visitorsK(s.total)} visits go to just 3 of 16 states</Line>
        <div className="mt-auto pt-3">
          <div className="flex h-2 gap-px overflow-hidden rounded-full">
            {s.shares.map((x, i) => (
              <motion.span key={x.code} title={`${STATE_LABEL[x.code]} ${fmt.pct(x.share * 100)}`} className="h-full origin-left" style={{ width: `${x.share * 100}%`, background: i < 3 ? STAGE.problem.base : "var(--slate-6)" }}
                initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.2 + 0.02 * i, duration: 0.4, ease: EASE }} />
            ))}
          </div>
          <p className="mt-1.5 truncate text-[11px]" style={{ color: STAGE.problem.soft }}>{names(s.shares.slice(0, 3).map((x) => x.code))}</p>
        </div>
      </Step>

      <Step n={2} guide="opportunity" kicker="The opportunity" color={STAGE.opportunity.base}>
        <Big><StatsCounter value={s.room / 1000} decimals={1} prefix="+" suffix="M" duration={0.9} /></Big>
        <Line>more visitors fit in the 5 most under-visited states before hotels fill up</Line>
        <div className="mt-auto flex flex-wrap gap-1 pt-3">
          {s.untapped.map((c) => (
            <span key={c} className="whitespace-nowrap rounded-full border border-[#3987e5]/40 px-1.5 py-0.5 text-[10.5px] text-[#86b6ef]">{STATE_LABEL[c]}</span>
          ))}
        </div>
      </Step>

      <Step n={3} guide="obstacle" kicker="The obstacle" color={STAGE.obstacle.base}>
        <Big><StatsCounter value={s.held.length} duration={0.9} /><span className="text-[0.55em] font-medium text-muted-foreground"> of 16 states</span></Big>
        <Line>are held back by one weak link - and it is a different one in each</Line>
        <div className="mt-auto pt-3">
          <div className="flex h-2 gap-px overflow-hidden rounded-full">
            {s.groups.map((g, i) => (
              <motion.span key={g.k} className="h-full origin-left" style={{ flex: g.n, background: PILLAR_COLOR[g.k] }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.3 + 0.08 * i, duration: 0.5, ease: EASE }} />
            ))}
          </div>
          <p className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
            {s.groups.map((g) => <span key={g.k} className="flex items-center gap-1"><span className="size-1.5 rounded-full" style={{ background: PILLAR_COLOR[g.k] }} />{g.k} {g.n}</span>)}
          </p>
        </div>
      </Step>

      <Step n={4} guide="payoff" kicker="The payoff" color={STAGE.payoff.base} last>
        <Big><StatsCounter value={s.sim.moved_k / 1000} decimals={1} suffix="M" duration={0.9} /><span className="text-[0.55em] font-medium text-muted-foreground"> visitors moved</span></Big>
        <Line>if 10% of {STATE_LABEL[s.origin]}&apos;s trips went to {names(s.dests)}</Line>
        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-3 text-[11px] text-muted-foreground">
          <span>Concentration <b className="font-semibold" style={{ color: STAGE.payoff.soft }}>{fmt.signed(s.giniChangePct, 1)}%</b></span>
          <span>National spending <b className="font-semibold" style={{ color: STAGE.payoff.soft }}>{s.sim.net_national_rm_m >= 0 ? "+" : "−"}{fmt.rmM(Math.abs(s.sim.net_national_rm_m))}</b></span>
        </div>
      </Step>
    </div>
  );
}
