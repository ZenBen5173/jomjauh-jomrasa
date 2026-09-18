"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle } from "lucide-react";
import { Card, Kpi, LorenzChart, Segmented } from "@/components/charts";
import { Info } from "@/components/info";
import { PageHeader, Stagger } from "@/components/shell";
import { Legend, type Scale, StateMap } from "@/components/state-map";
import { STAGE, STATE_LABEL, STATE_NAME, fmt } from "@/lib/data";
import { lorenz, simulate } from "@/lib/metrics";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

function Slider({ label, value, min, max, step, onChange, format, hint }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string; hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-[var(--primary)]" />
      {hint && <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** RM millions as a KPI: switch to billions from RM 1,000M so the figure never wraps. */
const rm = (m: number) => (m >= 1000 ? { value: m / 1000, decimals: 2, prefix: "RM ", suffix: "bn" } : { value: m, decimals: 0, prefix: "RM ", suffix: "M" });

export default function Simulator() {
  const { rows, gap, assumptions, setAssumptions, year, selected } = useStore();
  const ranked = useMemo(() => [...gap].sort((a, b) => b.gap - a.gap).map((g) => g.code), [gap]);
  const [origin, setOrigin] = useState("SGR");
  const [mode, setMode] = useState<"one" | "top">("one");
  const [dest, setDest] = useState(selected && selected !== "SGR" ? selected : "TRG");
  const [topN, setTopN] = useState(3);
  const [share, setShare] = useState(5);
  const [multOn, setMultOn] = useState(false);
  const [view, setView] = useState<"change" | "after">("change");

  const a = { ...assumptions, multiplier: multOn ? assumptions.multiplier > 1 ? assumptions.multiplier : 1.42 : 1 };
  const destinations = useMemo(() => {
    const list = mode === "one" ? [dest] : ranked.filter((c) => c !== origin).slice(0, topN);
    return Object.fromEntries(list.filter((c) => c !== origin).map((c) => [c, 1]));
  }, [mode, dest, topN, ranked, origin]);
  const sim = useMemo(() => simulate(rows, { origin, destinations, share_pct: share }, a), [rows, origin, destinations, share, a.target_occupancy_pct, a.guests_per_room, a.multiplier]); // eslint-disable-line react-hooks/exhaustive-deps

  const by = Object.fromEntries(rows.map((r) => [r.code, r]));
  const change = Object.fromEntries(sim.after.map((r) => [r.code, (((r.visitors_k as number) - (by[r.code].visitors_k as number)) / (by[r.code].visitors_k as number)) * 100]));
  const maxChange = Math.max(...Object.values(change).map(Math.abs), 1);
  const afterVals = Object.fromEntries(sim.after.map((r) => [r.code, r.visitors_k as number]));
  const scale: Scale = view === "change"
    ? { kind: "diverging", max: maxChange, pos: STAGE.payoff.base, neg: STAGE.problem.base }
    : { kind: "sequential", min: Math.min(...Object.values(afterVals)), max: Math.max(...Object.values(afterVals)), from: STAGE.payoff.deep, to: STAGE.payoff.pale };
  const maxMoved = Math.max(...sim.destinations.map((d) => d.moved_k), 1e-9);

  return (
    // the simulator is the payoff stage, so its controls wear the payoff colour
    <div style={{ "--primary": STAGE.payoff.base, "--ring": STAGE.payoff.base } as React.CSSProperties}>
      <PageHeader title="What if some visitors went somewhere quieter?" />

      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <Card title="Scenario" className="self-start xl:sticky xl:top-6">
          <div className="space-y-5">
            <label className="block text-xs">
              <span className="mb-1.5 block text-muted-foreground">Take visitors from</span>
              <select value={origin} onChange={(e) => setOrigin(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                {[...rows].sort((x, y) => (y.visitors_k as number) - (x.visitors_k as number)).map((r) => (
                  <option key={r.code} value={r.code}>{STATE_NAME[r.code]} · {fmt.visitorsK(r.visitors_k as number)}</option>
                ))}
              </select>
            </label>
            <Slider label="Share of its visitors to redirect" value={share} min={0} max={30} step={0.5} onChange={setShare} format={(v) => `${v}%`} />
            <div>
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                Send them to
                <Segmented id="mode" value={mode} onChange={setMode} options={[{ value: "one", label: "One state" }, { value: "top", label: "Top-Gap states" }]} />
              </div>
              {mode === "one" ? (
                <select value={dest} onChange={(e) => setDest(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                  {ranked.filter((c) => c !== origin).map((c, i) => <option key={c} value={c}>{STATE_NAME[c]} · Gap #{i + 1}</option>)}
                </select>
              ) : (
                <Slider label="Number of top-Gap states (split equally)" value={topN} min={2} max={6} step={1} onChange={setTopN} format={(v) => `${v}`} />
              )}
            </div>

            <div className="space-y-4 rounded-xl border border-dashed border-border p-3">
              <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Assumptions
                <Info>These are your assumptions, not measurements. Target occupancy is the ceiling hotels may run at; guests per room converts visitors into rooms; the economic multiplier (off by default) uses the Malaysian input-output range 1.20-1.82, mean 1.42 (Mazumder et al. 2009).</Info></p>
              <Slider label="Target hotel occupancy (ceiling)" value={assumptions.target_occupancy_pct} min={50} max={90} step={1}
                onChange={(v) => setAssumptions({ ...assumptions, target_occupancy_pct: v })} format={(v) => `${v}%`} />
              <Slider label="Guests per room" value={assumptions.guests_per_room} min={1} max={3} step={0.1}
                onChange={(v) => setAssumptions({ ...assumptions, guests_per_room: v })} format={(v) => v.toFixed(1)} />
              <div>
                <label className="flex cursor-pointer items-center justify-between text-xs text-muted-foreground">
                  Economic multiplier
                  <button onClick={() => setMultOn(!multOn)} className={cn("relative h-5 w-9 rounded-full transition-colors", multOn ? "bg-primary" : "bg-muted")} aria-pressed={multOn}>
                    <motion.span layout className={cn("absolute top-0.5 size-4 rounded-full bg-white", multOn ? "right-0.5" : "left-0.5")} transition={{ type: "spring", stiffness: 500, damping: 30 }} />
                  </button>
                </label>
                <AnimatePresence initial={false}>
                  {multOn && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="pt-3">
                        <Slider label="Output multiplier" value={a.multiplier} min={1.2} max={1.82} step={0.01}
                          onChange={(v) => setAssumptions({ ...assumptions, multiplier: v })} format={(v) => `×${v.toFixed(2)}`}
                          />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <AnimatePresence>
            {sim.capacity_binds && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                className="flex items-start gap-2.5 rounded-xl border border-foreground/25 bg-muted px-4 py-3 text-xs text-foreground">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-foreground" />
                <p>
                  <span className="font-semibold">Capacity Limit reached.</span> You asked to move {fmt.visitorsK(sim.requested_k)} visitors, but only{" "}
                  {fmt.visitorsK(sim.moved_k)} fit before {sim.destinations.filter((d) => d.capped).map((d) => STATE_LABEL[d.code]).join(", ")}{" "}
                  hotels pass {assumptions.target_occupancy_pct}% occupancy. Building rooms - not marketing - is the constraint here.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Visitors moved" value={sim.moved_k / 1000} decimals={2} suffix="M" note={`of ${fmt.visitorsK(sim.requested_k)} requested`} />
            <Kpi label={multOn ? "Economic impact at destinations" : "Receipts gained by destinations"} {...rm(multOn ? sim.economic_impact_gained_rm_m : sim.receipts_gained_rm_m)}
              note={multOn ? `incl. ×${a.multiplier.toFixed(2)} multiplier (assumption)` : "at destination spend / visitor"} />
            <Kpi label={`Receipts lost by ${STATE_LABEL[origin]}`} {...rm(sim.receipts_lost_rm_m)} note="at origin spend / visitor" />
            <Kpi label="Gini of visitors, after" value={sim.concentration_after.gini} decimals={3}
              delta={sim.concentration_after.gini - sim.concentration_before.gini} note={`from ${sim.concentration_before.gini.toFixed(3)}`} />
          </Stagger>

          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Net effect for Malaysia: {sim.net_national_rm_m >= 0 ? "+" : "−"}{fmt.rmM(Math.abs(sim.net_national_rm_m))}</span>
            <span>- this is rebalancing, not new money</span>
            <Info>The same visitors spend in a different place, so the national total barely moves. The small net figure comes only from the difference in spend per visitor between the two states.</Info>
          </div>

          <Card title="Who gains, who loses" right={<Segmented id="simview" value={view} onChange={setView} options={[{ value: "change", label: "% change in visitors" }, { value: "after", label: "Visitors after" }]} />}>
            <StateMap
              values={view === "change" ? change : afterVals} scale={scale}
              flows={sim.destinations.filter((d) => d.moved_k > 0).map((d) => ({ from: origin, to: d.code, weight: d.moved_k / maxMoved }))}
              tooltip={(c) => (
                <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-muted-foreground [&_dd]:text-right [&_dd]:font-medium [&_dd]:tabular-nums [&_dd]:text-foreground">
                  <dt>Visitors before</dt><dd>{fmt.visitorsK(by[c].visitors_k as number)}</dd>
                  <dt>Visitors after</dt><dd>{fmt.visitorsK(afterVals[c])}</dd>
                  <dt>Change</dt><dd>{fmt.signed(change[c])}%</dd>
                </dl>
              )}
            />
            <Legend scale={scale} left={view === "change" ? "fewer visitors" : "fewer"} right={view === "change" ? "more visitors" : "more visitors"} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
            <Card title="Can the destinations absorb them?" info={`Spare room-nights = rooms x 365 x (target - current occupancy), Tourism Malaysia Paid Accommodation Survey ${year}. Only overnight visitors in paid accommodation need rooms (DOSM tourist / day-tripper split and accommodation type). Redirected visitors are assumed to behave like the destination average.`}>
              <div className="space-y-4">
                {sim.destinations.map((d) => {
                  const used = d.spare_room_nights > 0 ? Math.min(d.room_nights_needed / d.spare_room_nights, 1) : 1;
                  return (
                    <div key={d.code}>
                      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
                        <span className="font-medium">{STATE_NAME[d.code]} {d.capped && <span className="ml-1 rounded bg-foreground/15 px-1.5 py-px text-[10px] text-foreground">{sim.capacity_binds ? "at capacity" : "at capacity · overflow sent to the others"}</span>}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {fmt.int(d.room_nights_needed)} needed of {fmt.int(d.spare_room_nights)} spare · occupancy {fmt.pct(d.occupancy_before_pct)} → <span className="font-medium text-foreground">{fmt.pct(d.occupancy_after_pct)}</span>
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                        <motion.div className="h-full rounded-full" style={{ background: d.capped ? "#c4c7ce" : STAGE.payoff.base }} animate={{ width: `${used * 100}%` }} transition={{ type: "spring", stiffness: 160, damping: 26 }} />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">+{fmt.visitorsK(d.moved_k)} visitors · +{fmt.rmM(d.receipts_gained_rm_m)} receipts</p>
                    </div>
                  );
                })}
                <div className="border-t border-border pt-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Crowding relieved in {STATE_NAME[origin]}:</span>{" "}
                  visitors per resident {sim.origin.per_resident_before.toFixed(1)} → {sim.origin.per_resident_after.toFixed(1)};{" "}
                  {fmt.int(sim.origin.room_nights_freed)} room-nights freed (occupancy {fmt.pct(sim.origin.occupancy_before_pct)} → {fmt.pct(sim.origin.occupancy_after_pct)}).
                </div>
              </div>
            </Card>
            <Card title="Tourism gets more even" info={`Lorenz curve of visitors: grey is today, yellow is this scenario. Spending Gini ${sim.receipts_gini_before.toFixed(3)} to ${sim.receipts_gini_after.toFixed(3)}.`}>
              <LorenzChart color={STAGE.payoff.base} before={lorenz(rows.map((r) => r.visitors_k as number))} after={lorenz(sim.after.map((r) => r.visitors_k as number))} />
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
