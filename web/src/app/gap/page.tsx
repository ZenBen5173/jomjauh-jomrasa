"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { RotateCcw } from "lucide-react";
import { Card, RankBars } from "@/components/charts";
import { PageHeader, SourceNote } from "@/components/shell";
import { INDICATORS, PILLAR_COLOR, STATE_LABEL, STATE_NAME, fmt } from "@/lib/data";
import { available, gapSensitivity, type Indicator, type Weights } from "@/lib/metrics";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

function WeightSliders({ inds, weights, onChange }: { inds: Indicator[]; weights: Weights; onChange: (w: Weights) => void }) {
  const total = inds.reduce((s, i) => s + (weights[i.col] ?? 0), 0) || 1;
  return (
    <div className="space-y-2.5">
      {inds.map((i) => (
        <label key={i.col} className="block" title={`Source: ${i.source}`}>
          <span className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="text-muted-foreground">{i.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{(((weights[i.col] ?? 0) / total) * 100).toFixed(0)}%</span>
          </span>
          <input type="range" min={0} max={3} step={0.25} value={weights[i.col] ?? 0}
            onChange={(e) => onChange({ ...weights, [i.col]: +e.target.value })}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-[var(--primary)]" />
        </label>
      ))}
    </div>
  );
}

function Scatter({ points, selected, onSelect }: { points: { code: string; x: number; y: number }[]; selected: string | null; onSelect: (c: string) => void }) {
  const S = 360, P = 36;
  const px = (v: number) => P + (v / 100) * (S - P - 10), py = (v: number) => S - P - (v / 100) * (S - P - 10);
  const [hover, setHover] = useState<string | null>(null);
  // vertical nudge for labels that would sit on top of each other (sorted by y so the push is one-directional)
  const dy = useMemo(() => {
    const placed: { x: number; y: number }[] = [];
    const out: Record<string, number> = {};
    // a label goes on the left when another dot sits just to its right (or near the right edge)
    const left: Record<string, boolean> = {};
    for (const p of points) {
      left[p.code] = p.x > 80 || points.some((q) => q !== p && px(q.x) - px(p.x) > 0 && px(q.x) - px(p.x) < 26 && Math.abs(py(q.y) - py(p.y)) < 9);
    }
    for (const p of [...points].sort((a, b) => py(a.y) - py(b.y))) {
      const x = px(p.x);
      let y = py(p.y);
      for (const q of placed) if (Math.abs(q.x - x) < 24 && y - q.y < 9) y = q.y + 9;
      placed.push({ x, y });
      out[p.code] = y - py(p.y);
    }
    return { dy: out, left };
  }, [points]);
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="mx-auto w-full max-w-[600px]">
      <polygon points={`${px(0)},${py(0)} ${px(100)},${py(100)} ${px(0)},${py(100)}`} fill="#3987e5" opacity={0.07} />
      <polygon points={`${px(0)},${py(0)} ${px(100)},${py(100)} ${px(100)},${py(0)}`} fill="#e66767" opacity={0.06} />
      {[0, 25, 50, 75, 100].map((t) => (
        <g key={t}>
          <line x1={px(0)} x2={px(100)} y1={py(t)} y2={py(t)} stroke="var(--slate-4)" />
          <line y1={py(0)} y2={py(100)} x1={px(t)} x2={px(t)} stroke="var(--slate-4)" />
          <text x={px(0) - 6} y={py(t) + 3} textAnchor="end" className="fill-[var(--slate-10)] text-[8px]">{t}</text>
          <text x={px(t)} y={S - P + 12} textAnchor="middle" className="fill-[var(--slate-10)] text-[8px]">{t}</text>
        </g>
      ))}
      <line x1={px(0)} y1={py(0)} x2={px(100)} y2={py(100)} stroke="var(--slate-8)" strokeDasharray="3 3" />
      <text x={px(3)} y={py(94)} className="fill-[#6da7ec] text-[9px] font-medium">UNDER-VISITED: potential exceeds visits</text>
      <text x={px(97)} y={py(4)} textAnchor="end" className="fill-[#e66767] text-[9px] font-medium">SATURATED: visits exceed potential</text>
      <text x={px(50)} y={S - 4} textAnchor="middle" className="fill-[var(--slate-10)] text-[9px]">Actual index (how visited it is) →</text>
      <text transform={`translate(10 ${py(50)}) rotate(-90)`} textAnchor="middle" className="fill-[var(--slate-10)] text-[9px]">Potential index →</text>
      {points.map((p, i) => {
        const on = hover === p.code || selected === p.code;
        return (
          <motion.g key={p.code} initial={{ opacity: 0 }} animate={{ opacity: 1, x: px(p.x), y: py(p.y) }} transition={{ delay: 0.03 * i, type: "spring", stiffness: 160, damping: 26 }}
            onPointerEnter={() => setHover(p.code)} onPointerLeave={() => setHover(null)} onClick={() => onSelect(p.code)} style={{ cursor: "pointer" }}>
            <circle r={12} fill="transparent" />
            <motion.circle r={5} initial={false} animate={{ r: on ? 7 : 5 }} fill={p.y >= p.x ? "#3987e5" : "#e66767"} stroke="var(--card)" strokeWidth={2} />
            {/* short codes keep the cluster readable; the full name appears on hover / selection and in the ranking beside it */}
            <text x={dy.left[p.code] ? -9 : 9} y={3 + (on ? 0 : dy.dy[p.code])} textAnchor={dy.left[p.code] ? "end" : "start"} stroke="var(--card)" strokeWidth={on ? 3 : 0} paintOrder="stroke"
              className={cn(on ? "fill-[var(--slate-12)] text-[10px] font-semibold" : "fill-[var(--slate-11)] text-[8px]")}>{on ? STATE_LABEL[p.code] : p.code}</text>
          </motion.g>
        );
      })}
    </svg>
  );
}

export default function GapPage() {
  const { rows, gap, pillars, year, selected, setSelected, weightsP, weightsA, setWeightsP, setWeightsA } = useStore();
  const ranked = useMemo(() => [...gap].sort((a, b) => b.gap - a.gap), [gap]);
  const pilBy = Object.fromEntries(pillars.map((p) => [p.code, p]));
  const usedP = available(rows, INDICATORS.potential), usedA = available(rows, INDICATORS.actual);
  const sens = useMemo(() => gapSensitivity(rows, INDICATORS.potential, INDICATORS.actual, 800), [rows]);
  const sensBy = Object.fromEntries(sens.states.map((s) => [s.code, s]));
  const reset = () => {
    setWeightsP(Object.fromEntries(INDICATORS.potential.map((i) => [i.col, 1])));
    setWeightsA(Object.fromEntries(INDICATORS.actual.map((i) => [i.col, 1])));
  };
  const sel = selected ?? ranked[0].code;
  const selGap = gap.find((g) => g.code === sel)!;

  return (
    <>
      <PageHeader eyebrow={`Gap Score & Bottleneck Finder · base year ${year}`} title="Which states deserve more visitors - and why are they skipped?">
        Potential is what a state can offer and absorb; Actual is how intensely it is already visited. The Gap is the difference. Every input is an
        official or open statistic, normalised 0-100 with equal weights by default - move the sliders and the ranking recomputes live.
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[300px_1fr_1fr]">
        <Card title="Weights" right={<button onClick={reset} className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><RotateCcw className="size-3 transition-transform group-hover:-rotate-90" />Equal weights</button>}>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[#6da7ec]">Potential index</p>
          <WeightSliders inds={usedP} weights={weightsP} onChange={setWeightsP} />
          <p className="mb-2 mt-5 text-[11px] font-medium uppercase tracking-wider text-[#e66767]">Actual index</p>
          <WeightSliders inds={usedA} weights={weightsA} onChange={setWeightsA} />
        </Card>

        <Card title="Potential vs Actual">
          <Scatter points={gap.map((g) => ({ code: g.code, x: g.actual, y: g.potential }))} selected={sel} onSelect={setSelected} />
          <SourceNote>Distance above the dashed line = Gap Score. Count-type indicators are log-scaled before min-max so Kuala Lumpur and Putrajaya do not flatten everyone else.</SourceNote>
        </Card>

        <Card title="Gap Score ranking">
          <RankBars diverging rows={ranked.map((g) => ({ code: g.code, value: g.gap }))} format={(v) => fmt.signed(v, 1)} selected={sel} onSelect={setSelected} />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card title="Bottleneck Finder - all three pillars, every state">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-2 font-medium">State (by Gap)</th>
                  {Object.keys(INDICATORS.pillars).map((p) => (
                    <th key={p} className="pb-2 font-medium"><span className="mr-1.5 inline-block size-2 rounded-sm" style={{ background: PILLAR_COLOR[p] }} />{p}</th>
                  ))}
                  <th className="pb-2 font-medium">Main bottleneck</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((g, i) => {
                  const p = pilBy[g.code];
                  return (
                    <motion.tr key={g.code} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 * i, duration: 0.4, ease: EASE }}
                      onClick={() => setSelected(g.code)} className={cn("cursor-pointer border-t border-border transition-colors hover:bg-accent/50", sel === g.code && "bg-accent/70")}>
                      <td className="py-1.5 pr-2"><span className="mr-2 inline-block w-5 text-right tabular-nums text-muted-foreground">{g.gap_rank}</span>{STATE_NAME[g.code]}</td>
                      {Object.keys(INDICATORS.pillars).map((k) => (
                        <td key={k} className="py-1.5 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="relative h-1.5 w-full max-w-[120px] rounded-full bg-muted">
                              <motion.div className="absolute inset-y-0 left-0 rounded-full" style={{ background: PILLAR_COLOR[k], opacity: p.bottleneck === k ? 1 : 0.45 }}
                                animate={{ width: `${p.scores[k]}%` }} transition={{ duration: 0.6, ease: EASE }} />
                              <span className="absolute inset-y-[-2px] left-1/2 w-px bg-[var(--slate-9)]" />
                            </div>
                            <span className={cn("w-6 tabular-nums", p.bottleneck === k ? "font-semibold" : "text-muted-foreground")}>{p.scores[k].toFixed(0)}</span>
                          </div>
                        </td>
                      ))}
                      <td className="py-1.5">
                        {p.bottleneck_score < 50
                          ? <span className="rounded px-1.5 py-0.5 text-[11px] font-medium text-white" style={{ background: PILLAR_COLOR[p.bottleneck] }}>{p.bottleneck}</span>
                          : <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">none below median</span>}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <SourceNote>
            Each pillar is the mean robust z-score (median / MAD) of its indicators, rescaled so 50 = the national median. The weakest pillar is the main
            bottleneck. Rule-based and explainable - no model decides this. Access uses proxies (distance-decayed population reach, airports within 100 km,
            rail stations) because no open road or air-traffic data exist; treat it as indicative.
          </SourceNote>
        </Card>

        <Card title={`Why ${STATE_NAME[sel]} scores ${fmt.signed(selGap.gap, 0)}`}>
          <div className="space-y-1.5">
            {[...usedP.map((i) => ({ i, side: "Potential" })), ...usedA.map((i) => ({ i, side: "Actual" }))].map(({ i, side }) => (
              <div key={side + i.col} className="grid grid-cols-[1fr_90px_30px] items-center gap-2 text-xs">
                <span className="truncate text-muted-foreground" title={i.label}>{i.label}</span>
                <span className="relative h-1.5 rounded-full bg-muted">
                  <motion.span className="absolute inset-y-0 left-0 rounded-full" style={{ background: side === "Potential" ? "#3987e5" : "#e66767" }}
                    animate={{ width: `${selGap.parts[i.col]}%` }} transition={{ duration: 0.5, ease: EASE }} />
                </span>
                <span className="text-right tabular-nums">{selGap.parts[i.col].toFixed(0)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Is the rank robust?</span> Across 800 random re-weightings, {STATE_LABEL[sel]} ranks between{" "}
            <span className="font-medium text-foreground">#{sensBy[sel].p05} and #{sensBy[sel].p95}</span> (90% interval; median #{sensBy[sel].median}) and lands in the top five{" "}
            {fmt.pct(sensBy[sel].top5 * 100, 0)} of the time.
          </div>
          <Link href={`/state/${sel}`} className="mt-3 inline-block text-xs font-medium text-primary">Open state profile →</Link>
        </Card>
      </div>

      <Card className="mt-4" title="Sensitivity check - how much does the ranking depend on the weights?">
        <div className="gap-x-8 md:columns-2">
          {sens.states.slice().sort((a, b) => a.rank - b.rank).map((s) => (
            <div key={s.code} className="mb-1 grid break-inside-avoid grid-cols-[92px_1fr_70px] items-center gap-2 text-xs">
              <span className="truncate text-muted-foreground">{STATE_LABEL[s.code]}</span>
              <span className="relative h-3">
                <span className="absolute inset-x-0 top-1/2 h-px bg-[var(--slate-5)]" />
                <motion.span className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[#3987e5]/40"
                  initial={{ opacity: 0 }} animate={{ opacity: 1, left: `${((s.p05 - 1) / 15) * 100}%`, width: `${Math.max(((s.p95 - s.p05) / 15) * 100, 1)}%` }} />
                <motion.span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--card)] bg-[#3987e5]" animate={{ left: `${((s.rank - 1) / 15) * 100}%` }} />
              </span>
              <span className="text-right tabular-nums text-muted-foreground">#{s.rank} <span className="text-[10px]">({s.p05}-{s.p95})</span></span>
            </div>
          ))}
        </div>
        <SourceNote>
          Dot = rank with equal weights; band = 5th-95th percentile rank over 800 Monte Carlo draws of Dirichlet(4) weights on both indices (OECD/JRC Handbook on
          Constructing Composite Indicators). Median Spearman correlation with the equal-weight ranking: <span className="font-medium text-foreground">{sens.spearmanMedian.toFixed(2)}</span>{" "}
          (5th percentile {sens.spearmanP05.toFixed(2)}). Left = most under-visited.
        </SourceNote>
      </Card>
    </>
  );
}
