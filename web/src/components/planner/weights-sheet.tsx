"use client";

/** The analyst tools, kept out of the way: adjustable weights, potential-vs-actual scatter, robustness of the ranking. */
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { RotateCcw } from "lucide-react";
import { Info } from "@/components/info";
import { Sheet } from "@/components/sheet";
import { INDICATORS, STATE_LABEL } from "@/lib/data";
import { available, gapSensitivity, type Indicator, type Weights } from "@/lib/metrics";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

function Sliders({ inds, weights, onChange }: { inds: Indicator[]; weights: Weights; onChange: (w: Weights) => void }) {
  const total = inds.reduce((s, i) => s + (weights[i.col] ?? 0), 0) || 1;
  return (
    <div className="space-y-2.5">
      {inds.map((i) => (
        <label key={i.col} className="block" title={`Source: ${i.source}`}>
          <span className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="text-muted-foreground">{i.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{(((weights[i.col] ?? 0) / total) * 100).toFixed(0)}%</span>
          </span>
          <input type="range" min={0} max={3} step={0.25} value={weights[i.col] ?? 0} onChange={(e) => onChange({ ...weights, [i.col]: +e.target.value })}
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
  const lay = useMemo(() => {
    const placed: { x: number; y: number }[] = [];
    const dy: Record<string, number> = {}, left: Record<string, boolean> = {};
    for (const p of points) left[p.code] = p.x > 80 || points.some((q) => q !== p && px(q.x) - px(p.x) > 0 && px(q.x) - px(p.x) < 26 && Math.abs(py(q.y) - py(p.y)) < 9);
    for (const p of [...points].sort((a, b) => py(a.y) - py(b.y))) {
      const x = px(p.x);
      let y = py(p.y);
      for (const q of placed) if (Math.abs(q.x - x) < 24 && y - q.y < 9) y = q.y + 9;
      placed.push({ x, y });
      dy[p.code] = y - py(p.y);
    }
    return { dy, left };
  }, [points]);
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="mx-auto w-full max-w-[460px]">
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
      <text x={px(3)} y={py(94)} className="fill-[#1f63b8] text-[9px] font-medium dark:fill-[#6da7ec]">UNDER-VISITED</text>
      <text x={px(97)} y={py(4)} textAnchor="end" className="fill-[#e66767] text-[9px] font-medium">SATURATED</text>
      <text x={px(50)} y={S - 4} textAnchor="middle" className="fill-[var(--slate-10)] text-[9px]">How visited it is →</text>
      <text transform={`translate(10 ${py(50)}) rotate(-90)`} textAnchor="middle" className="fill-[var(--slate-10)] text-[9px]">What it can offer →</text>
      {points.map((p, i) => {
        const on = hover === p.code || selected === p.code;
        return (
          <motion.g key={p.code} initial={{ opacity: 0 }} animate={{ opacity: 1, x: px(p.x), y: py(p.y) }} transition={{ delay: 0.03 * i, type: "spring", stiffness: 160, damping: 26 }}
            onPointerEnter={() => setHover(p.code)} onPointerLeave={() => setHover(null)} onClick={() => onSelect(p.code)} style={{ cursor: "pointer" }}>
            <circle r={12} fill="transparent" />
            <motion.circle r={5} initial={false} animate={{ r: on ? 7 : 5 }} fill={p.y >= p.x ? "#3987e5" : "#e66767"} stroke="var(--card)" strokeWidth={2} />
            <text x={lay.left[p.code] ? -9 : 9} y={3 + (on ? 0 : lay.dy[p.code])} textAnchor={lay.left[p.code] ? "end" : "start"} stroke="var(--background)" strokeWidth={on ? 3 : 0} paintOrder="stroke"
              className={cn(on ? "fill-[var(--slate-12)] text-[10px] font-semibold" : "fill-[var(--slate-11)] text-[8px]")}>{on ? STATE_LABEL[p.code] : p.code}</text>
          </motion.g>
        );
      })}
    </svg>
  );
}

export function WeightsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { rows, gap, selected, setSelected, weightsP, weightsA, setWeightsP, setWeightsA } = useStore();
  const usedP = available(rows, INDICATORS.potential), usedA = available(rows, INDICATORS.actual);
  // 800 Monte Carlo draws: only worth computing while the panel is open
  const sens = useMemo(() => (open ? gapSensitivity(rows, INDICATORS.potential, INDICATORS.actual, 800) : null), [rows, open]);
  const reset = () => {
    setWeightsP(Object.fromEntries(INDICATORS.potential.map((i) => [i.col, 1])));
    setWeightsA(Object.fromEntries(INDICATORS.actual.map((i) => [i.col, 1])));
  };

  return (
    <Sheet open={open} onClose={onClose} title="How the Gap Score is built" subtitle="Change what matters and the whole dashboard re-ranks live" width={560}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">Weights
          <Info>Each indicator is scaled 0-100 across the 16 states (counts are log-scaled first) and averaged. Equal weights by default, as in the OECD/JRC composite-indicator handbook. Hover a slider for its source.</Info>
        </h3>
        <button onClick={reset} className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><RotateCcw className="size-3 transition-transform group-hover:-rotate-90" />Equal weights</button>
      </div>
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[#1f63b8] dark:text-[#6da7ec]">What a state can offer</p>
      <Sliders inds={usedP} weights={weightsP} onChange={setWeightsP} />
      <p className="mb-2 mt-5 text-[11px] font-medium uppercase tracking-wider text-[#e66767]">How visited it already is</p>
      <Sliders inds={usedA} weights={weightsA} onChange={setWeightsA} />

      <h3 className="mb-2 mt-7 flex items-center gap-1.5 text-sm font-semibold">Offer vs visits
        <Info>Distance above the dashed line is the Gap Score. Click a dot to select that state on the dashboard.</Info>
      </h3>
      <Scatter points={gap.map((g) => ({ code: g.code, x: g.actual, y: g.potential }))} selected={selected} onSelect={setSelected} />

      <h3 className="mb-2 mt-7 flex items-center gap-1.5 text-sm font-semibold">Does the ranking survive different weights?
        <Info>Dot = rank with equal weights. Band = where the state ranks in 90% of 800 random re-weightings (Dirichlet). Rank correlation with the equal-weight ranking: {sens?.spearmanMedian.toFixed(2)}.</Info>
      </h3>
      <div>
        {(sens?.states ?? []).slice().sort((a, b) => a.rank - b.rank).map((s) => (
          <div key={s.code} className="mb-1 grid grid-cols-[88px_1fr_64px] items-center gap-2 text-xs">
            <span className="truncate text-muted-foreground">{STATE_LABEL[s.code]}</span>
            <span className="relative h-3">
              <span className="absolute inset-x-0 top-1/2 h-px bg-[var(--slate-5)]" />
              <span className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[#3987e5]/40" style={{ left: `${((s.p05 - 1) / 15) * 100}%`, width: `${Math.max(((s.p95 - s.p05) / 15) * 100, 1)}%` }} />
              <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-[#3987e5]" style={{ left: `${((s.rank - 1) / 15) * 100}%` }} />
            </span>
            <span className="text-right tabular-nums text-muted-foreground">#{s.rank} <span className="text-[10px]">({s.p05}-{s.p95})</span></span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
