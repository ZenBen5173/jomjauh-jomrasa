"use client";

import { useState } from "react";
import { motion } from "motion/react";
import StatsCounter from "@/components/ui/stats-counter";
import { SpotlightCard } from "@/components/spotlight-card";
import { STATE_LABEL } from "@/lib/data";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

// ------------------------------------------------------------ KPI tile
export function Kpi({
  label, value, decimals = 0, prefix, suffix, note, delta, deltaGoodWhenNegative,
}: {
  label: string; value: number; decimals?: number; prefix?: string; suffix?: string; note?: string;
  delta?: number | null; deltaGoodWhenNegative?: boolean;
}) {
  const good = delta != null && (deltaGoodWhenNegative ? delta < 0 : delta > 0);
  return (
    <SpotlightCard className="h-full p-5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">
        <StatsCounter value={value} decimals={decimals} prefix={prefix} suffix={suffix} duration={0.9} />
      </p>
      <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
        {delta != null && Math.abs(delta) > 1e-9 && (
          <span className={cn("rounded px-1.5 py-0.5 font-medium", good ? "bg-[var(--grass-4)] text-[var(--grass-11)]" : "bg-[var(--red-4)] text-[var(--red-11)]")}>
            {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(decimals || 1)}{suffix ?? ""}
          </span>
        )}
        {note && <span>{note}</span>}
      </div>
    </SpotlightCard>
  );
}

// ------------------------------------------------------------ Lorenz curve
export function LorenzChart({ before, after }: { before: { x: number[]; y: number[] }; after?: { x: number[]; y: number[] } }) {
  const S = 260, P = 30;
  const px = (v: number) => P + v * (S - P - 8), py = (v: number) => S - P - v * (S - P - 8);
  const line = (c: { x: number[]; y: number[] }) => c.x.map((x, i) => `${i ? "L" : "M"}${px(x)},${py(c.y[i])}`).join(" ");
  const [hi, setHi] = useState<number | null>(null);
  const cur = after ?? before;
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="w-full max-w-[340px]" onPointerLeave={() => setHi(null)}>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line x1={px(0)} x2={px(1)} y1={py(t)} y2={py(t)} stroke="var(--slate-4)" strokeWidth={1} />
          <text x={px(0) - 6} y={py(t) + 3} textAnchor="end" className="fill-[var(--slate-10)] text-[8px]">{t * 100}%</text>
          <text x={px(t)} y={S - P + 12} textAnchor="middle" className="fill-[var(--slate-10)] text-[8px]">{t * 100}%</text>
        </g>
      ))}
      <line x1={px(0)} y1={py(0)} x2={px(1)} y2={py(1)} stroke="var(--slate-8)" strokeDasharray="3 3" strokeWidth={1} />
      <motion.path d={`${line(before)} L${px(1)},${py(0)} Z`} fill="#3987e5" opacity={0.12} initial={{ opacity: 0 }} animate={{ opacity: 0.12 }} />
      <motion.path d={line(before)} fill="none" stroke={after ? "var(--slate-9)" : "#3987e5"} strokeWidth={2} strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, ease: EASE }} />
      {after && <motion.path animate={{ d: line(after) }} fill="none" stroke="#ffc53d" strokeWidth={2} strokeLinejoin="round" transition={{ duration: 0.4 }} />}
      {cur.x.map((x, i) => i > 0 && (
        <g key={i} onPointerEnter={() => setHi(i)}>
          <rect x={px(x) - 7} y={P - 20} width={14} height={S - P} fill="transparent" />
          <circle cx={px(x)} cy={py(cur.y[i])} r={hi === i ? 4 : 2} fill={after ? "#ffc53d" : "#3987e5"} stroke="var(--card)" strokeWidth={1.5} />
        </g>
      ))}
      {hi != null && (
        <text x={px(0) + 6} y={P - 8} className="fill-[var(--slate-12)] text-[9px]">
          Quietest {hi} of {cur.x.length - 1} states receive {(cur.y[hi] * 100).toFixed(1)}% of visitors
        </text>
      )}
      <text x={px(0.5)} y={S - 2} textAnchor="middle" className="fill-[var(--slate-10)] text-[8px]">cumulative share of states (least-visited first)</text>
    </svg>
  );
}

// ------------------------------------------------------------ diverging / plain bar ranking
export function RankBars({
  rows, diverging, color = "#3987e5", format, selected, onSelect, max,
}: {
  rows: { code: string; value: number; sub?: string; color?: string }[];
  diverging?: boolean; color?: string; format: (v: number) => string;
  selected?: string | null; onSelect?: (code: string) => void; max?: number;
}) {
  const m = max ?? Math.max(...rows.map((r) => Math.abs(r.value)), 1e-9);
  return (
    <div className="flex flex-col">
      {rows.map((r, i) => {
        const w = (Math.abs(r.value) / m) * (diverging ? 50 : 100);
        const fill = r.color ?? (diverging ? (r.value >= 0 ? "#3987e5" : "#e66767") : color);
        return (
          <motion.button
            key={r.code} layout="position" onClick={() => onSelect?.(r.code)}
            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.025 * i, duration: 0.4, ease: EASE }}
            className={cn("group grid grid-cols-[92px_1fr_64px] items-center gap-2 rounded-md px-1.5 py-[5px] text-left text-xs transition-colors hover:bg-accent/60",
              selected === r.code && "bg-accent")}
          >
            <span className="truncate text-muted-foreground group-hover:text-foreground">{STATE_LABEL[r.code]}</span>
            <span className="relative h-3.5">
              {diverging && <span className="absolute inset-y-0 left-1/2 w-px bg-[var(--slate-7)]" />}
              <motion.span
                className="absolute inset-y-0 rounded-[4px]"
                style={{ background: fill, ...(diverging ? (r.value >= 0 ? { left: "50%" } : { right: "50%" }) : { left: 0 }) }}
                initial={{ width: 0 }} animate={{ width: `${w}%` }} transition={{ duration: 0.6, ease: EASE }}
              />
            </span>
            <span className="text-right font-medium tabular-nums">{format(r.value)}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------ line chart (single y axis)
export function LineChart({
  series, years, format, height = 180, highlight,
}: {
  series: { id: string; label: string; color: string; values: (number | null)[] }[];
  years: (number | string)[]; format: (v: number) => string; height?: number; highlight?: string;
}) {
  const W = 520, P = { l: 44, r: 12, t: 12, b: 22 };
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const lo = Math.min(0, ...all), hi = Math.max(...all) * 1.05;
  const px = (i: number) => P.l + (i / Math.max(years.length - 1, 1)) * (W - P.l - P.r);
  const py = (v: number) => height - P.b - ((v - lo) / (hi - lo || 1)) * (height - P.t - P.b);
  const [hi_i, setHi] = useState<number | null>(null);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" onPointerLeave={() => setHi(null)}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          setHi(Math.max(0, Math.min(years.length - 1, Math.round(((x - P.l) / (W - P.l - P.r)) * (years.length - 1)))));
        }}>
        {[0, 0.5, 1].map((t) => {
          const v = lo + t * (hi - lo);
          return (
            <g key={t}>
              <line x1={P.l} x2={W - P.r} y1={py(v)} y2={py(v)} stroke="var(--slate-4)" />
              <text x={P.l - 6} y={py(v) + 3} textAnchor="end" className="fill-[var(--slate-10)] text-[9px]">{format(v)}</text>
            </g>
          );
        })}
        {years.map((y, i) => (i % Math.ceil(years.length / 9) === 0 || i === years.length - 1) && (
          <text key={i} x={px(i)} y={height - 6} textAnchor="middle" className="fill-[var(--slate-10)] text-[9px]">{y}</text>
        ))}
        {hi_i != null && <line x1={px(hi_i)} x2={px(hi_i)} y1={P.t} y2={height - P.b} stroke="var(--slate-8)" strokeDasharray="2 3" />}
        {series.map((s) => {
          const d = s.values.map((v, i) => (v == null ? "" : `${s.values.slice(0, i).some((p) => p != null) ? "L" : "M"}${px(i)},${py(v)}`)).join(" ");
          const dim = highlight && highlight !== s.id;
          return (
            <motion.path key={s.id} d={d} fill="none" stroke={s.color} strokeWidth={dim ? 1 : 2} opacity={dim ? 0.35 : 1} strokeLinejoin="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: EASE }} />
          );
        })}
        {hi_i != null && series.map((s) => s.values[hi_i] != null && (
          <circle key={s.id} cx={px(hi_i)} cy={py(s.values[hi_i] as number)} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} />
        ))}
      </svg>
      {hi_i != null && (
        <div className="pointer-events-none absolute right-2 top-0 rounded-lg border border-border bg-popover/95 px-2.5 py-1.5 text-[11px] shadow-lg">
          <p className="mb-0.5 font-medium">{years[hi_i]}</p>
          {series.filter((s) => s.values[hi_i] != null).map((s) => (
            <p key={s.id} className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-0.5 w-3 rounded" style={{ background: s.color }} />{s.label}
              <span className="ml-auto pl-3 font-medium tabular-nums text-foreground">{format(s.values[hi_i] as number)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ pillar bars (0-100, 50 = national median)
export function PillarBars({ scores, colors, bottleneck }: { scores: Record<string, number>; colors: Record<string, string>; bottleneck: string }) {
  return (
    <div className="space-y-2.5">
      {Object.entries(scores).map(([k, v]) => (
        <div key={k}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm" style={{ background: colors[k] }} />{k}
              {k === bottleneck && <span className="rounded bg-[var(--amber-4)] px-1.5 py-px text-[10px] font-medium text-[var(--amber-11)]">⚠ main bottleneck</span>}
            </span>
            <span className="font-medium tabular-nums">{v.toFixed(0)}</span>
          </div>
          <div className="relative h-2 rounded-full bg-muted">
            <motion.div className="absolute inset-y-0 left-0 rounded-full" style={{ background: colors[k] }}
              initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ duration: 0.7, ease: EASE }} />
            <span className="absolute inset-y-[-3px] left-1/2 w-px bg-[var(--slate-9)]" title="national median" />
          </div>
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground">Tick = national median (50). Below 50 means weaker than the typical state.</p>
    </div>
  );
}

export function Card({ title, right, children, className }: { title?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-5", className)}>
      {(title || right) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

/** Segmented control with a sliding pill (same shared-layout trick as the library's tabs). */
export function Segmented<T extends string>({ id, value, onChange, options }: { id: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="relative flex rounded-lg bg-muted p-0.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className="relative z-10 rounded-md px-2.5 py-1 text-xs font-medium">
          {value === o.value && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 -z-10 rounded-md bg-background shadow-sm" transition={{ type: "spring", stiffness: 300, damping: 24 }} />}
          <span className={value === o.value ? "text-foreground" : "text-muted-foreground"}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
