"use client";

/**
 * The planner dashboard, in an executive layout: the question and headline numbers on top; the
 * argument in four steps (problem, opportunity, obstacle, payoff); then a ranked list, the map
 * and the selected state side by side, all driven by the same metric and the same selection;
 * the evidence underneath. Analyst tools and full profiles slide in instead of being separate pages.
 */
import { useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { SlidersHorizontal } from "lucide-react";
import { Card, LineChart, LorenzChart, RankBars, Segmented } from "@/components/charts";
import { Info } from "@/components/info";
import { StatePanel } from "@/components/planner/state-panel";
import { Story } from "@/components/planner/story";
import { StateSheet } from "@/components/planner/state-sheet";
import { WeightsSheet } from "@/components/planner/weights-sheet";
import StatsCounter from "@/components/ui/stats-counter";
import { Legend, type Scale, StateMap } from "@/components/state-map";
import { PILLAR_COLOR, STATE_LABEL, TREND, fmt } from "@/lib/data";
import { JR } from "@/lib/jomrasa";
import { lorenz } from "@/lib/metrics";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type MetricKey = "gap" | "visitors" | "occupancy" | "spend" | "feel" | "bottleneck";
const METRICS: { value: MetricKey; label: string }[] = [
  { value: "gap", label: "Opportunity" }, { value: "visitors", label: "Visitors" }, { value: "occupancy", label: "Hotels" },
  { value: "spend", label: "Spending" }, { value: "feel", label: "Experience" }, { value: "bottleneck", label: "Bottleneck" },
];
const EASE = [0.16, 1, 0.3, 1] as const;

function Stat({ label, value, decimals, prefix, suffix, delta, info }: { label: string; value: number; decimals: number; prefix?: string; suffix?: string; delta?: number | null; info: React.ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">{label}<Info align="right">{info}</Info></dt>
      <dd className="mt-0.5 flex items-baseline gap-1.5 whitespace-nowrap text-lg font-semibold tabular-nums tracking-tight">
        <StatsCounter value={value} decimals={decimals} prefix={prefix} suffix={suffix} duration={0.9} />
        {delta != null && Math.abs(delta) > 1e-9 && <span className="text-[11px] font-medium text-muted-foreground">{delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(3)}</span>}
      </dd>
    </div>
  );
}

function SectionLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2.5 mt-5 flex items-center gap-3">
      <h2 className="shrink-0 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{children}</h2>
      <span className="h-px flex-1 bg-border" />
      {hint && <span className="hidden shrink-0 text-[11px] text-muted-foreground/70 sm:block">{hint}</span>}
    </div>
  );
}

export default function Dashboard() {
  const { rows, gap, pillars, concentration, year, selected, setSelected } = useStore();
  const [metric, setMetric] = useState<MetricKey>("gap");
  const [profile, setProfile] = useState(false);
  const [weights, setWeights] = useState(false);
  const explore = useRef<HTMLDivElement>(null);

  const ranked = useMemo(() => [...gap].sort((a, b) => b.gap - a.gap), [gap]);
  // open on the top-ranked full state; the three tiny federal territories stay one click away
  const sel = selected ?? (ranked.find((g) => !["KUL", "LBN", "PJY"].includes(g.code)) ?? ranked[0]).code;
  const pilBy = useMemo(() => Object.fromEntries(pillars.map((p) => [p.code, p])), [pillars]);

  const view = useMemo(() => {
    const col = (c: string) => Object.fromEntries(rows.map((r) => [r.code, r[c] as number]));
    const seq = (v: Record<string, number>, rank: string, title: string, left: string, right: string, format: (n: number) => string, info: string) => ({
      rank, title, info, left, right, format, diverging: false, values: v as Record<string, number | string>,
      scale: { kind: "sequential", min: Math.min(...Object.values(v)), max: Math.max(...Object.values(v)) } as Scale,
      list: Object.entries(v).sort((a, b) => b[1] - a[1]).map(([code, value]) => ({ code, value })),
    });
    switch (metric) {
      case "visitors": return seq(col("visitors_k"), "Busiest first", "Where the crowds are", "fewer", "more visitors", fmt.visitorsK, `Domestic visitors by state, DOSM Domestic Tourism Survey ${year} (Table 9).`);
      case "occupancy": return seq(col("occupancy_pct"), "Fullest hotels first", "Where hotels still have room", "emptier", "fuller hotels", (v) => fmt.pct(v, 0), `Average hotel occupancy rate, Tourism Malaysia Paid Accommodation Survey ${year}.`);
      case "spend": return seq(col("spend_per_visitor_rm"), "Biggest spenders first", "Where a visitor is worth the most", "lower", "higher spend per visitor", (v) => `RM ${fmt.int(v)}`, "Average spend per domestic visitor, DOSM Domestic Tourism Survey by State 2023 - the latest state-level release.");
      case "feel": return seq(Object.fromEntries(JR.states.map((s) => [s.code, s.experience_score])), "Best rated first", "How travellers rate each state", "lower", "higher Experience Score", (v) => v.toFixed(1),
        "JomRasa Experience Score: the average of 11 aspect sentiments from public travel text, adjusted for sample size. An indicator, not an official statistic.");
      case "bottleneck": return {
        rank: "Bottleneck by state", title: "What holds each state back", left: "", right: "", format: (v: number) => fmt.signed(v, 0), diverging: true,
        info: "The weakest of three pillars - Access, Awareness, Amenities - when it is below the national median. Grey means nothing is below the median.",
        values: Object.fromEntries(pillars.map((p) => [p.code, p.bottleneck_score < 50 ? p.bottleneck : "None"])) as Record<string, number | string>,
        scale: { kind: "categorical", colors: { ...PILLAR_COLOR, None: "#383835" } } as Scale,
        list: ranked.map((g) => ({ code: g.code, value: g.gap })),
      };
      default: return {
        rank: "Most untapped first", title: "Where the untapped potential is", left: "over-visited", right: "under-visited", format: (v: number) => fmt.signed(v, 0), diverging: true,
        info: "Gap Score = what a state can offer (rooms, spare capacity, spend, stay length, attractions, amenities, traveller experience) minus how intensely it is already visited. Each side is scaled 0-100 with equal weights - use Weights to change that.",
        values: Object.fromEntries(gap.map((g) => [g.code, g.gap])) as Record<string, number | string>,
        scale: { kind: "diverging", max: Math.max(...gap.map((g) => Math.abs(g.gap))) } as Scale,
        list: ranked.map((g) => ({ code: g.code, value: g.gap })),
      };
    }
  }, [metric, rows, gap, pillars, ranked, year]);

  // a plain-language reading of the map: the three states at each end (or, for bottlenecks, how many states share each one)
  const reading = useMemo(() => {
    if (metric === "bottleneck") {
      const groups = ["Access", "Awareness", "Amenities"].map((k) => ({ k, states: pillars.filter((p) => p.bottleneck === k && p.bottleneck_score < 50) }));
      return [
        { label: "States held back by", items: groups.map((g) => ({ code: "", text: `${g.k} · ${g.states.length}`, color: PILLAR_COLOR[g.k] })) },
        { label: "Not held back", items: pillars.filter((p) => p.bottleneck_score >= 50).map((p) => ({ code: p.code, text: STATE_LABEL[p.code], color: "" })) },
      ];
    }
    const labels: Record<string, [string, string]> = {
      gap: ["Most untapped", "Most saturated"], visitors: ["Busiest", "Quietest"], occupancy: ["Fullest hotels", "Most spare rooms"],
      spend: ["Highest spend per visitor", "Lowest spend per visitor"], feel: ["Best experienced", "Most friction"],
    };
    const item = (x: { code: string; value: number }) => ({ code: x.code, text: `${STATE_LABEL[x.code]} ${view.format(x.value)}`, color: "" });
    return [
      { label: labels[metric][0], items: view.list.slice(0, 3).map(item) },
      { label: labels[metric][1], items: view.list.slice(-3).reverse().map(item) },
    ];
  }, [metric, view, pillars]);

  const total = rows.reduce((s, r) => s + (r.visitors_k as number), 0);
  const receipts = rows.reduce((s, r) => s + (r.receipts_rm_m as number), 0);
  const giniPrev = TREND.gini_by_year[String(year - 1)];
  const years = Object.keys(TREND.gini_by_year);
  const gini2018 = TREND.gini_by_year["2018"];
  const feel = useMemo(() => [...JR.states].sort((a, b) => b.experience_score - a.experience_score), []);
  const lo = Math.min(...JR.states.map((x) => x.experience_lo)), hi = Math.max(...JR.states.map((x) => x.experience_hi));
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="mb-4 flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Malaysia · domestic tourism · 16 states · {year}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-[28px]">Where should the next visitor go?</h1>
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-2">
          <Stat label="Visits" value={total / 1000} decimals={1} suffix="M"
            info="Sum of visits to each state (someone visiting two states counts in both) - this is how DOSM defines the national figure. Domestic Tourism Survey, Table 9." />
          <Stat label={year > 2023 ? "Spending (est.)" : "Spending"} value={receipts / 1000} decimals={1} prefix="RM " suffix="bn"
            info={year > 2023 ? `Estimated: ${year} visitors multiplied by 2023 spend per visitor, the latest state-level spending DOSM has published.` : "Domestic visitor receipts, DOSM Domestic Tourism Survey by State 2023."} />
          <Stat label="Concentration" value={concentration.gini} decimals={3} delta={giniPrev ? concentration.gini - giniPrev : null}
            info={`Gini coefficient: 0 = visits spread evenly across the 16 states, 1 = all in one state. The arrow compares with ${year - 1}. ${fmt.pct(concentration.hoover_vs_population * 100, 0)} of visits would have to move for visits to match where people live (Hoover index).`} />
        </dl>
      </motion.div>

      <Story metric={metric} onMetric={(m) => { setMetric(m); explore.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }} />

      <SectionLabel hint="Click a state anywhere to focus it">Explore the 16 states</SectionLabel>
      <div ref={explore} className="grid scroll-mt-20 gap-3 xl:grid-cols-[290px_minmax(0,1fr)_340px]">
        <Card className="order-2 xl:order-1" title={view.rank}
          right={<button onClick={() => setWeights(true)} className="group inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
            <SlidersHorizontal className="size-3 transition-transform group-hover:rotate-90" />Weights</button>}>
          {metric === "bottleneck" ? (
            <div className="flex flex-col">
              {ranked.map((g, i) => {
                const p = pilBy[g.code], binding = p.bottleneck_score < 50;
                return (
                  <motion.button key={g.code} onClick={() => setSelected(g.code)} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.02 * i, duration: 0.35, ease: EASE }}
                    className={cn("flex items-center justify-between rounded-md px-1.5 py-[5px] text-left text-xs transition-colors hover:bg-accent/60", sel === g.code && "bg-accent")}>
                    <span className="text-muted-foreground">{STATE_LABEL[g.code]}</span>
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: "var(--muted)", color: binding ? "var(--foreground)" : "var(--muted-foreground)" }}>
                      {binding && <span className="mr-1.5 inline-block size-1.5 rounded-full align-middle" style={{ background: PILLAR_COLOR[p.bottleneck] }} />}{binding ? p.bottleneck : "none"}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          ) : (
            <RankBars key={metric} diverging={view.diverging} rows={view.list} format={view.format} selected={sel} onSelect={setSelected} />
          )}
        </Card>

        <Card className="order-1 xl:order-2" title={view.title} info={view.info} right={<Segmented id="metric" value={metric} onChange={setMetric} options={METRICS} />}>
          <StateMap values={view.values} scale={view.scale} selected={sel} onSelect={setSelected}
            tooltip={(c) => {
              const r = rows.find((x) => x.code === c)!, g = gap.find((x) => x.code === c)!, p = pilBy[c];
              return (
                <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-muted-foreground [&_dd]:text-right [&_dd]:font-medium [&_dd]:tabular-nums [&_dd]:text-foreground">
                  <dt>Opportunity</dt><dd>{fmt.signed(g.gap, 0)} · #{g.gap_rank}</dd>
                  <dt>Visitors</dt><dd>{fmt.visitorsK(r.visitors_k as number)}</dd>
                  <dt>Hotels full</dt><dd>{fmt.pct(r.occupancy_pct as number, 0)}</dd>
                  <dt>Bottleneck</dt><dd>{p.bottleneck_score < 50 ? p.bottleneck : "none"}</dd>
                </dl>
              );
            }} />
          <Legend scale={view.scale} left={view.left} right={view.right} />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {reading.map((g) => (
              <div key={g.label} className="rounded-xl bg-muted/50 px-3 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{g.label}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {g.items.map((it) => (
                    <button key={it.code + it.text} onClick={() => it.code && setSelected(it.code)} style={it.color ? { borderColor: it.color } : undefined}
                      className={cn("rounded-full border border-border px-2.5 py-1 text-xs transition-colors hover:border-foreground/40", sel === it.code && "bg-accent")}>
                      {it.text}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="order-3 min-w-0"><StatePanel code={sel} onOpenProfile={() => setProfile(true)} /></div>
      </div>

      <SectionLabel>The evidence</SectionLabel>
      <div className="grid gap-3 lg:grid-cols-3">
        <Card title={`The quietest half of the states get ${fmt.pct(lorenz(rows.map((r) => r.visitors_k as number)).y[8] * 100, 0)} of visits`}
          info="Lorenz curve of domestic visitors across the 16 states: the further it sags below the dashed line, the more concentrated tourism is. Hover the dots to read it.">
          <div className="flex justify-center"><LorenzChart before={lorenz(rows.map((r) => r.visitors_k as number))} /></div>
        </Card>
        <Card title={TREND.gini_by_year[String(year)] > gini2018 ? "Tourism is more concentrated than in 2018" : "Tourism is less concentrated than in 2018"}
          info="Gini coefficient of visitors across states, by year. It spiked when travel collapsed in 2021. Source: DOSM Domestic Tourism Survey, Table 9 (2017-2025).">
          <LineChart years={years} format={(v) => v.toFixed(2)} zeroBase={false} height={400} series={[{ id: "gini", label: "Gini", color: "#3987e5", values: years.map((y) => TREND.gini_by_year[y]) }]} />
        </Card>
        <Card title="People who go, like it - almost equally everywhere"
          info={`JomRasa Experience Score per state from ${fmt.int(JR.meta.items_travel)} first-hand travel texts. Dot = score, band = 95% interval, tick = national mean. Most bands overlap, so low visitor numbers are not explained by bad experiences.`}>
          <div className="space-y-[2px]">
            {feel.map((x) => (
              <button key={x.code} onClick={() => setSelected(x.code)} className={cn("grid w-full grid-cols-[84px_1fr_34px] items-center gap-2 rounded-md px-1.5 py-[3px] text-left text-xs transition-colors hover:bg-accent/60", sel === x.code && "bg-accent")}>
                <span className="truncate text-muted-foreground">{STATE_LABEL[x.code]}</span>
                <span className="relative h-3">
                  <span className="absolute inset-x-0 top-1/2 h-px bg-[var(--slate-5)]" />
                  <span className="absolute inset-y-0 w-px bg-[var(--slate-8)]" style={{ left: `${pos(x.national_mean)}%` }} />
                  <span className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#3987e5]/40" style={{ left: `${pos(x.experience_lo)}%`, width: `${pos(x.experience_hi) - pos(x.experience_lo)}%` }} />
                  <span className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3987e5]" style={{ left: `${pos(x.experience_score)}%` }} />
                </span>
                <span className="text-right tabular-nums">{x.experience_score.toFixed(0)}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <StateSheet code={sel} open={profile} onClose={() => setProfile(false)} />
      <WeightsSheet open={weights} onClose={() => setWeights(false)} />
    </>
  );
}
