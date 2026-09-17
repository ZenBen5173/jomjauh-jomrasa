"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Card, Kpi, LineChart, PillarBars, RankBars } from "@/components/charts";
import { PageHeader, SourceNote, Stagger } from "@/components/shell";
import { CODES, INDICATORS, OD, PILLAR_BLURB, PILLAR_COLOR, PLACES_DOSM, QUARTERLY, STATE_LABEL, STATE_NAME, TREND, fmt } from "@/lib/data";
import { SPRING } from "@/lib/motion";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

function StatePicker({ current }: { current: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  return (
    <div ref={host} className="relative mb-5 flex flex-wrap gap-1" onPointerLeave={() => setBox(null)}
      onPointerOver={(e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>("[data-chip]");
        if (!el || !host.current) return;
        const r = el.getBoundingClientRect(), h = host.current.getBoundingClientRect();
        setBox({ left: r.left - h.left, top: r.top - h.top, width: r.width, height: r.height });
      }}>
      <motion.span aria-hidden className="pointer-events-none absolute rounded-md bg-accent" initial={false}
        animate={box ? { opacity: 1, ...box } : { opacity: 0 }} transition={SPRING.default} />
      {CODES.map((c) => (
        <Link key={c} href={`/state/${c}`} data-chip scroll={false}
          className={cn("relative z-10 rounded-md px-2.5 py-1 text-xs transition-colors", c === current ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
          {STATE_LABEL[c]}
        </Link>
      ))}
    </div>
  );
}

export default function StateProfile() {
  const { code: raw } = useParams<{ code: string }>();
  const code = CODES.includes(raw?.toUpperCase()) ? raw.toUpperCase() : "TRG";
  const { rows, gap, pillars, capacity, year, assumptions } = useStore();
  const r = rows.find((x) => x.code === code)!;
  const g = gap.find((x) => x.code === code)!;
  const p = pillars.find((x) => x.code === code)!;
  const cap = capacity.find((x) => x.code === code)!;
  const n = (k: string) => r[k] as number;

  const years = Object.keys(TREND.visitors[code]);
  const natAvg = years.map((y) => CODES.reduce((s, c) => s + (TREND.visitors[c][y] ?? 0), 0) / CODES.length);
  const origins = useMemo(() => {
    const y = String(n("od_year"));
    return OD[y].filter((o) => o.dest === code).sort((a, b) => b.tourists_k - a.tourists_k).slice(0, 8);
  }, [code, year]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = QUARTERLY[code].filter((d) => d.year >= 2022 && d.occupancy_pct != null);
  const byQuarter = [1, 2, 3, 4].map((k) => {
    const v = QUARTERLY[code].filter((d) => d.quarter === k && d.year >= 2023 && d.year <= 2025 && d.occupancy_pct != null).map((d) => d.occupancy_pct as number);
    return { k, mean: v.reduce((s, x) => s + x, 0) / (v.length || 1) };
  });
  const quiet = byQuarter.reduce((m, x) => (x.mean < m.mean ? x : m));
  const places = PLACES_DOSM.filter((d) => d.code === code && d.kind === "destination" && d.year === 2025);
  const districts = PLACES_DOSM.filter((d) => d.code === code && d.kind === "district");

  return (
    <>
      <PageHeader eyebrow={`State profile · base year ${year}`} title={STATE_NAME[code]}>
        Gap Score {fmt.signed(g.gap, 0)} (#{g.gap_rank} of 16) · Potential {g.potential.toFixed(0)} vs Actual {g.actual.toFixed(0)} · main bottleneck:{" "}
        <span className="font-medium" style={{ color: PILLAR_COLOR[p.bottleneck] }}>{p.bottleneck}</span> - {PILLAR_BLURB[p.bottleneck].toLowerCase()}.
      </PageHeader>
      <StatePicker current={code} />

      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Domestic visitors" value={n("visitors_k") / 1000} decimals={1} suffix="M" note={`${fmt.pct(n("visitor_share_pct"))} of Malaysia`} />
        <Kpi label="Visitors per resident" value={n("visitors_per_resident")} decimals={1} note="tourism intensity" />
        <Kpi label="Spend per visitor" value={n("spend_per_visitor_rm")} prefix="RM " note={`DOSM ${n("spend_year")}`} />
        <Kpi label="Avg length of stay" value={n("avg_length_of_stay")} decimals={2} suffix=" nights" note={`DOSM ${n("spend_year")}`} />
        <Kpi label="Hotel occupancy" value={n("occupancy_pct")} decimals={1} suffix="%" note={`${fmt.int(n("rooms"))} rooms`} />
        <Kpi label="Room for more visitors" value={cap.max_extra_visitors_k / 1000} decimals={2} suffix="M" note={`at ${assumptions.target_occupancy_pct}% ceiling (assumption)`} />
      </Stagger>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card title="Domestic visitors, 2017-2025">
          <LineChart years={years} format={(v) => fmt.visitorsK(v)} series={[
            { id: "avg", label: "Average state", color: "var(--slate-9)", values: natAvg },
            { id: code, label: STATE_LABEL[code], color: "#3987e5", values: years.map((y) => TREND.visitors[code][y]) },
          ]} />
          <SourceNote>Source: DOSM Domestic Tourism Survey, Table 9.</SourceNote>
        </Card>

        <Card title="Hotel occupancy by quarter - when is it quiet?">
          <LineChart years={q.map((d) => `Q${d.quarter} ${String(d.year).slice(2)}`)} format={(v) => `${v.toFixed(0)}%`}
            series={[{ id: "occ", label: "Occupancy", color: "#199e70", values: q.map((d) => d.occupancy_pct) }]} />
          <SourceNote>
            Quietest quarter on average (2023-2025): <span className="font-medium text-foreground">Q{quiet.k} at {fmt.pct(quiet.mean)}</span> - the natural window
            for campaigns. Source: Tourism Malaysia, Paid Accommodation Survey.
          </SourceNote>
        </Card>

        <Card title="Bottleneck pillars">
          <PillarBars scores={p.scores} colors={PILLAR_COLOR} bottleneck={p.bottleneck} />
          <div className="mt-3 space-y-1 border-t border-border pt-3">
            {INDICATORS.pillars[p.bottleneck].filter((i) => p.z[p.bottleneck][i.col] !== undefined).map((i) => (
              <p key={i.col} className="flex justify-between gap-3 text-[11px] text-muted-foreground">
                <span className="truncate">{i.label}</span>
                <span className="shrink-0 tabular-nums text-foreground">
                  {typeof r[i.col] === "number" ? (r[i.col] as number).toLocaleString("en-MY", { maximumFractionDigits: 1 }) : "-"}
                  <span className={cn("ml-1.5", p.z[p.bottleneck][i.col] < 0 ? "text-[var(--red-11)]" : "text-[var(--grass-11)]")}>{fmt.signed(p.z[p.bottleneck][i.col])}σ</span>
                </span>
              </p>
            ))}
            <p className="pt-1 text-[10px] text-muted-foreground">σ = robust standard deviations from the national median.</p>
          </div>
        </Card>

        <Card title={`Where its overnight tourists come from (${n("od_year")})`}>
          <RankBars rows={origins.map((o) => ({ code: o.origin, value: o.tourists_k, color: o.origin === code ? "var(--slate-8)" : "#3987e5" }))} format={(v) => fmt.visitorsK(v)} />
          <SourceNote>
            {fmt.pct(n("out_of_state_share_pct"), 0)} of tourists come from other states (grey bar = own residents). Source: DOSM Domestic Tourism Survey, Table 10.
          </SourceNote>
        </Card>

        <Card title="Where visitors already go (DOSM top five, 2025)">
          <ol className="space-y-1.5">
            {places.map((d, i) => (
              <motion.li key={d.name} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }} className="flex items-center gap-2.5 text-xs">
                <span className="grid size-5 shrink-0 place-items-center rounded bg-muted text-[10px] font-medium tabular-nums">{d.rank}</span>{d.name}
              </motion.li>
            ))}
          </ol>
          {districts.length > 0 && <p className="mt-3 text-[11px] text-muted-foreground">Top districts: {districts.map((d) => d.name).join(" · ")}</p>}
          <SourceNote>Mostly malls and town centres - a sign that nature and heritage sites are under-marketed. Source: DOSM DTS 2025, Tables 8A-8B.</SourceNote>
        </Card>

        <Card title="Context">
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-xs text-muted-foreground [&_dd]:text-right [&_dd]:font-medium [&_dd]:tabular-nums [&_dd]:text-foreground">
            <dt>Population</dt><dd>{fmt.visitorsK(n("population_k"))}</dd>
            <dt>Overnight share of visitors</dt><dd>{fmt.pct(n("overnight_share") * 100, 0)}</dd>
            <dt>Tourists using paid accommodation</dt><dd>{fmt.pct(n("paid_accommodation_share") * 100, 0)}</dd>
            <dt>Foreign share of hotel guests</dt><dd>{fmt.pct(n("foreign_guest_share_pct"), 0)}</dd>
            <dt>Arrive by air</dt><dd>{fmt.pct(n("mode_air_pct"))}</dd>
            <dt>Attractions, nature & heritage sites (OSM)</dt><dd>{fmt.int(n("attractions_n"))}</dd>
            <dt>Airports within 100 km · rail stations</dt><dd>{n("airports_100km")} · {n("rail_stations_n")}</dd>
            <dt>Median household income</dt><dd>RM {fmt.int(n("income_median_rm"))}</dd>
            <dt>Absolute poverty</dt><dd>{fmt.pct(n("poverty_absolute_pct"))}</dd>
          </dl>
          <Link href="/simulator" className="mt-4 inline-block text-xs font-medium text-primary">Simulate sending visitors here →</Link>
        </Card>
      </div>
    </>
  );
}
