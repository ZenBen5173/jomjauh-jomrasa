"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Card, Kpi, LineChart, LorenzChart, PillarBars, RankBars, Segmented } from "@/components/charts";
import { PageHeader, SourceNote, Stagger } from "@/components/shell";
import { Legend, type Scale, StateMap } from "@/components/state-map";
import { PILLAR_BLURB, PILLAR_COLOR, STATE_NAME, TREND, fmt } from "@/lib/data";
import { lorenz } from "@/lib/metrics";
import { type MapMetric, useStore } from "@/lib/store";

const METRICS: { value: MapMetric; label: string }[] = [
  { value: "gap", label: "Gap Score" },
  { value: "visitors", label: "Visitors" },
  { value: "occupancy", label: "Hotel occupancy" },
  { value: "bottleneck", label: "Bottleneck" },
  { value: "spend", label: "Spend / visitor" },
];

export default function Overview() {
  const { rows, gap, pillars, capacity, concentration, year, selected, setSelected, assumptions } = useStore();
  const [metric, setMetric] = useState<MapMetric>("gap");
  const by = useMemo(() => Object.fromEntries(rows.map((r) => [r.code, r])), [rows]);
  const gapBy = useMemo(() => Object.fromEntries(gap.map((g) => [g.code, g])), [gap]);
  const pilBy = useMemo(() => Object.fromEntries(pillars.map((p) => [p.code, p])), [pillars]);
  const capBy = useMemo(() => Object.fromEntries(capacity.map((c) => [c.code, c])), [capacity]);

  const { values, scale, left, right } = useMemo(() => {
    const col = (c: string) => Object.fromEntries(rows.map((r) => [r.code, r[c] as number]));
    const range = (v: Record<string, number>) => ({ min: Math.min(...Object.values(v)), max: Math.max(...Object.values(v)) });
    const sequential = (c: string, l: string, r: string) => {
      const v = col(c);
      return { values: v as Record<string, number | string>, scale: { kind: "sequential", ...range(v) } as Scale, left: l, right: r };
    };
    switch (metric) {
      case "visitors": return sequential("visitors_k", "fewer", "more visitors");
      case "occupancy": return sequential("occupancy_pct", "emptier hotels", "fuller");
      case "spend": return sequential("spend_per_visitor_rm", "lower", "higher spend");
      case "bottleneck":
        return { values: Object.fromEntries(pillars.map((p) => [p.code, p.bottleneck])) as Record<string, number | string>,
                 scale: { kind: "categorical", colors: PILLAR_COLOR } as Scale, left: "", right: "" };
      default:
        return { values: Object.fromEntries(gap.map((g) => [g.code, g.gap])) as Record<string, number | string>,
                 scale: { kind: "diverging", max: Math.max(...gap.map((g) => Math.abs(g.gap))) } as Scale,
                 left: "over-visited", right: "under-visited opportunity" };
    }
  }, [metric, rows, gap, pillars]);

  const total = rows.reduce((s, r) => s + (r.visitors_k as number), 0);
  const receipts = rows.reduce((s, r) => s + (r.receipts_rm_m as number), 0);
  const giniPrev = TREND.gini_by_year[String(year - 1)];
  const ranked = [...gap].sort((a, b) => b.gap - a.gap);
  // default to the top-ranked full state; the tiny federal territories stay one click away
  const sel = selected ?? (ranked.find((g) => !["KUL", "LBN", "PJY"].includes(g.code)) ?? ranked[0]).code;
  const years = Object.keys(TREND.gini_by_year);

  return (
    <>
      <PageHeader eyebrow={`Overview · base year ${year}`} title="The best of Malaysia isn't where everyone's looking.">
        Three destinations take {fmt.pct(concentration.top3_share * 100, 0)} of all domestic visits. JomJauh shows which quieter states are ready
        for more, what holds them back, and what moving visitors would do - capped by real hotel capacity.
      </PageHeader>

      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Domestic visitors (sum of state visits)" value={total / 1000} decimals={1} suffix="M" note={`DOSM ${year}`} />
        <Kpi label="Tourism concentration · Gini" value={concentration.gini} decimals={3}
          delta={giniPrev ? concentration.gini - giniPrev : null} deltaGoodWhenNegative note={`vs ${year - 1}`} />
        <Kpi label="Visits to move for parity with population" value={concentration.hoover_vs_population * 100} decimals={1} suffix="%" note="Hoover index" />
        <Kpi label="Visitor receipts" value={receipts / 1000} decimals={1} prefix="RM " suffix="bn"
          note={year > 2023 ? "est. at 2023 spend / visitor" : "DOSM 2023"} />
      </Stagger>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_340px]">
        <Card title="Where the opportunity is" right={<Segmented id="metric" value={metric} onChange={setMetric} options={METRICS} />}>
          <StateMap
            values={values} scale={scale} selected={sel} onSelect={setSelected}
            tooltip={(c) => (
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-muted-foreground [&_dd]:text-right [&_dd]:font-medium [&_dd]:tabular-nums [&_dd]:text-foreground">
                <dt>Gap Score (rank)</dt><dd>{fmt.signed(gapBy[c].gap)} (#{gapBy[c].gap_rank})</dd>
                <dt>Visitors</dt><dd>{fmt.visitorsK(by[c].visitors_k as number)}</dd>
                <dt>Hotel occupancy</dt><dd>{fmt.pct(by[c].occupancy_pct as number)}</dd>
                <dt>Spend / visitor</dt><dd>RM {fmt.int(by[c].spend_per_visitor_rm as number)}</dd>
                <dt>Main bottleneck</dt><dd>{pilBy[c].bottleneck_score < 50 ? pilBy[c].bottleneck : "none below median"}</dd>
              </dl>
            )}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <Legend scale={scale} left={left} right={right} />
            <span className="text-[11px] text-muted-foreground">Hover for numbers · click a state to inspect it</span>
          </div>
        </Card>

        <Card title={STATE_NAME[sel]} right={<span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">Gap #{gapBy[sel].gap_rank} of 16</span>}>
          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
            {([["Potential", gapBy[sel].potential], ["Actual", gapBy[sel].actual], ["Gap", gapBy[sel].gap]] as [string, number][]).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-muted/60 py-2">
                <p className="text-[11px] text-muted-foreground">{k}</p>
                <p className="text-lg font-semibold tabular-nums">{k === "Gap" ? fmt.signed(v, 0) : v.toFixed(0)}</p>
              </div>
            ))}
          </div>
          <PillarBars scores={pilBy[sel].scores} colors={PILLAR_COLOR} bottleneck={pilBy[sel].bottleneck} />
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">
              {pilBy[sel].bottleneck_score < 50 ? `${PILLAR_BLURB[pilBy[sel].bottleneck]}.` : "No pillar is below the national median - access, awareness and amenities are not what limits this state."}
            </span>{" "}
            Hotels ran at {fmt.pct(by[sel].occupancy_pct as number)}; at a {assumptions.target_occupancy_pct}% ceiling there is room for about{" "}
            <span className="font-medium text-foreground">{fmt.visitorsK(capBy[sel].max_extra_visitors_k)}</span> more visitors a year.
          </p>
          <Link href={`/state/${sel}`} className="group mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary">
            Open state profile <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Gap Score ranking">
          <RankBars diverging rows={ranked.map((g) => ({ code: g.code, value: g.gap }))} format={(v) => fmt.signed(v, 0)} selected={sel} onSelect={setSelected} />
          <SourceNote>Gap = Potential − Actual (each 0-100, equal weights). Blue = under-visited relative to what the state can offer.</SourceNote>
        </Card>
        <Card title="How uneven? Lorenz curve of visitors">
          <div className="flex justify-center"><LorenzChart before={lorenz(rows.map((r) => r.visitors_k as number))} /></div>
          <SourceNote>
            The further the curve sags below the dashed line of equality, the more concentrated tourism is. Gini {concentration.gini.toFixed(3)};
            per-capita Gini {concentration.gini_per_capita.toFixed(3)}.
          </SourceNote>
        </Card>
        <Card title="Concentration over time (Gini of state visitors)">
          <LineChart years={years} format={(v) => v.toFixed(2)} zeroBase={false} height={300}
            series={[{ id: "gini", label: "Gini", color: "#3987e5", values: years.map((y) => TREND.gini_by_year[y]) }]} />
          <SourceNote>Source: DOSM Domestic Tourism Survey, Table 9 (2017-2025).</SourceNote>
        </Card>
      </div>
    </>
  );
}
