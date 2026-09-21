"use client";

/**
 * Interactive state choropleth, drawn as SVG from the geoBoundaries polygons
 * (no tile server, so nothing external for the judges' network to block).
 * Small territories get a marker so they stay hoverable and clickable.
 */
import { usePalette } from "@/lib/theme";
import { useMemo, useRef, useState } from "react";
import { geoCentroid, geoMercator, geoPath } from "d3-geo";
import { interpolateRgb } from "d3-interpolate";
import { AnimatePresence, motion } from "motion/react";
import { GEO, STATE_NAME } from "@/lib/data";
import { SPRING } from "@/lib/motion";

const W = 960, H = 430;
const SMALL = new Set(["KUL", "PJY", "LBN", "PLS", "PNG", "MLK"]);
// nudge markers apart where territories sit on top of each other
const NUDGE: Record<string, [number, number]> = { KUL: [-4, -9], PJY: [6, 8], PNG: [-10, 0], PLS: [-6, -6], MLK: [0, 6], LBN: [-6, -8] };

export type Scale =
  | { kind: "diverging"; max: number; pos?: string; neg?: string }
  | { kind: "sequential"; min: number; max: number; from?: string; to?: string }
  | { kind: "categorical"; colors: Record<string, string> };

const POS = "#3987e5", NEG = "#e66767";
type Tone = { neutral: string; empty: string };
const DARK: Tone = { neutral: "#383835", empty: "#26282b" };

export function colorFor(v: number | string | undefined, scale: Scale, tone: Tone = DARK): string {
  const NEUTRAL = tone.neutral;
  if (v === undefined || v === null) return tone.empty;
  if (scale.kind === "categorical") return scale.colors[v as string] ?? tone.empty;
  const x = v as number;
  if (scale.kind === "diverging") {
    const t = Math.max(-1, Math.min(1, x / scale.max));
    return t >= 0 ? interpolateRgb(NEUTRAL, scale.pos ?? POS)(Math.sqrt(t)) : interpolateRgb(NEUTRAL, scale.neg ?? NEG)(Math.sqrt(-t));
  }
  return interpolateRgb(scale.from ?? "#173a63", scale.to ?? "#b7d3f6")(Math.max(0, Math.min(1, (x - scale.min) / (scale.max - scale.min || 1))));
}

export interface Flow { from: string; to: string; weight: number }

export function StateMap({
  values, scale, selected, onSelect, tooltip, flows = [], height = H,
}: {
  values: Record<string, number | string>;
  scale: Scale;
  selected?: string | null;
  onSelect?: (code: string) => void;
  tooltip: (code: string) => React.ReactNode;
  flows?: Flow[];
  height?: number;
}) {
  const tone = usePalette();
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const { paths, centroids } = useMemo(() => {
    const projection = geoMercator().fitExtent([[12, 12], [W - 12, H - 12]], GEO);
    const path = geoPath(projection).digits(1);   // fixed precision keeps server and client markup identical
    return {
      paths: GEO.features.map((f) => ({ code: f.properties.code, d: path(f) ?? "" })),
      centroids: Object.fromEntries(GEO.features.map((f) => {
        const [x, y] = projection(geoCentroid(f)) as [number, number];
        const n = NUDGE[f.properties.code] ?? [0, 0];
        return [f.properties.code, [Math.round(x + n[0]), Math.round(y + n[1])] as [number, number]];
      })),
    };
  }, []);

  const move = (e: React.PointerEvent) => {
    const r = wrap.current?.getBoundingClientRect();
    if (r) setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const bind = (code: string) => ({
    "data-guide": `state:${code}`,
    onPointerEnter: () => setHover(code),
    onPointerLeave: () => setHover((h) => (h === code ? null : h)),
    onClick: () => onSelect?.(code),
    style: { cursor: onSelect ? "pointer" : "default" },
  });

  const flipX = pos.x > (wrap.current?.clientWidth ?? 0) * 0.6;
  return (
    <div ref={wrap} className="relative w-full" onPointerMove={move} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: height }} role="img" aria-label="Map of Malaysian states">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={tone.active} />
          </marker>
        </defs>
        {paths.map((p, i) => {
          const active = hover === p.code || selected === p.code;
          return (
            <motion.path
              key={p.code}
              d={p.d}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, fill: colorFor(values[p.code], scale, tone) }}
              transition={{ opacity: { delay: 0.025 * i, duration: 0.4 }, fill: { duration: 0.45 } }}
              stroke={active ? tone.active : tone.stroke}
              strokeWidth={active ? 1.6 : 0.7}
              strokeLinejoin="round"
              {...bind(p.code)}
            />
          );
        })}
        {paths.filter((p) => SMALL.has(p.code)).map((p) => {
          const [x, y] = centroids[p.code];
          const active = hover === p.code || selected === p.code;
          return (
            <motion.circle
              key={`m-${p.code}`} cx={x} cy={y} r={5.5} initial={false}
              animate={{ r: active ? 8 : 5.5, fill: colorFor(values[p.code], scale, tone) }}
              transition={SPRING.snappy}
              stroke={active ? tone.active : tone.stroke} strokeWidth={1.5}
              {...bind(p.code)}
            />
          );
        })}
        <AnimatePresence>
          {flows.map((f) => {
            const [x1, y1] = centroids[f.from], [x2, y2] = centroids[f.to];
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.22;
            return (
              <motion.path
                key={`${f.from}-${f.to}`}
                d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`}
                fill="none" stroke={tone.active} strokeLinecap="round" markerEnd="url(#arrow)" pointerEvents="none"
                initial={{ pathLength: 0, opacity: 0, strokeWidth: 1.5 }}
                animate={{ pathLength: 1, opacity: 0.95, strokeWidth: 1.5 + 3 * f.weight }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              />
            );
          })}
        </AnimatePresence>
      </svg>

      <AnimatePresence>
        {hover && (
          <motion.div
            key="tip"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1, x: pos.x + (flipX ? -236 : 16), y: pos.y + 14 }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.08 } }}
            transition={{ x: SPRING.follow, y: SPRING.follow, opacity: { duration: 0.15 } }}
            className="pointer-events-none absolute left-0 top-0 z-20 w-[220px] rounded-xl border border-border bg-popover/95 p-3 text-xs shadow-xl backdrop-blur"
          >
            <p className="mb-1.5 text-sm font-semibold">{STATE_NAME[hover]}</p>
            {tooltip(hover)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Legend({ scale, left, right }: { scale: Scale; left: string; right: string }) {
  const tone = usePalette();
  if (scale.kind === "categorical") {
    return (
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {Object.entries(scale.colors).map(([k, c]) => (
          <span key={k} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: c }} />{k}</span>
        ))}
      </div>
    );
  }
  const stops = scale.kind === "diverging"
    ? [-1, -0.5, 0, 0.5, 1].map((t) => colorFor(t * scale.max, scale, tone))
    : [0, 0.25, 0.5, 0.75, 1].map((t) => colorFor(scale.min + t * (scale.max - scale.min), scale, tone));
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>{left}</span>
      <span className="h-2 w-36 rounded-full" style={{ background: `linear-gradient(90deg, ${stops.join(",")})` }} />
      <span>{right}</span>
    </div>
  );
}
