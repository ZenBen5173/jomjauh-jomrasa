"use client";

/** Full state profile, shown as a slide-in so the planner never leaves the map. */
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ExternalLink } from "lucide-react";
import { LineChart, RankBars, Segmented } from "@/components/charts";
import { Info } from "@/components/info";
import { Sheet } from "@/components/sheet";
import { CODES, OD, PLACES_DOSM, QUARTERLY, STATE_LABEL, STATE_NAME, TREND, fmt } from "@/lib/data";
import { EMOTION_COLOR, JR, TOPIC_LABEL } from "@/lib/jomrasa";
import { useStore } from "@/lib/store";

const EASE = [0.16, 1, 0.3, 1] as const;

function Block({ title, info, children }: { title: string; info?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">{title}{info && <Info>{info}</Info>}</h3>
      {children}
    </section>
  );
}

export function StateSheet({ code, open, onClose }: { code: string; open: boolean; onClose: () => void }) {
  const { rows, gap, year } = useStore();
  const [tone, setTone] = useState<"praise" | "complaint">("praise");
  const r = rows.find((x) => x.code === code)!;
  const g = gap.find((x) => x.code === code)!;
  const n = (k: string) => r[k] as number;

  const years = Object.keys(TREND.visitors[code]);
  const natAvg = years.map((y) => CODES.reduce((s, c) => s + (TREND.visitors[c][y] ?? 0), 0) / CODES.length);
  const origins = useMemo(() => OD[String(n("od_year"))].filter((o) => o.dest === code).sort((a, b) => b.tourists_k - a.tourists_k).slice(0, 6), [code, year]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = QUARTERLY[code].filter((d) => d.year >= 2022 && d.occupancy_pct != null);
  const quiet = [1, 2, 3, 4].map((k) => {
    const v = QUARTERLY[code].filter((d) => d.quarter === k && d.year >= 2023 && d.year <= 2025 && d.occupancy_pct != null).map((d) => d.occupancy_pct as number);
    return { k, mean: v.reduce((s, x) => s + x, 0) / (v.length || 1) };
  }).reduce((m, x) => (x.mean < m.mean ? x : m));
  const places = PLACES_DOSM.filter((d) => d.code === code && d.kind === "destination" && d.year === 2025);

  const jr = JR.states.find((x) => x.code === code);
  const topics = JR.topics.filter((t) => t.code === code && t.n > 0).sort((a, b) => b.n - a.n).slice(0, 8);
  const emotions = jr ? JR.meta.emotions.map((e) => ({ e, v: (jr[`emo_${e}`] as number) ?? 0 })).filter((x) => x.v > 0.01).sort((a, b) => b.v - a.v) : [];
  const quotes = JR.quotes.filter((x) => x.code === code && (tone === "praise" ? x.overall > 0 : x.overall < 0)).slice(0, 3);

  const stats: [string, string][] = [
    ["Visitors", fmt.visitorsK(n("visitors_k"))], ["Per resident", n("visitors_per_resident").toFixed(1)], ["Spend / visitor", `RM ${fmt.int(n("spend_per_visitor_rm"))}`],
    ["Nights stayed", n("avg_length_of_stay").toFixed(2)], ["Hotel occupancy", fmt.pct(n("occupancy_pct"))], ["Hotel rooms", fmt.int(n("rooms"))],
  ];

  return (
    <Sheet open={open} onClose={onClose} title={STATE_NAME[code]}
      subtitle={`Gap ${fmt.signed(g.gap, 0)} · rank #${g.gap_rank} of 16 · can offer ${g.potential.toFixed(0)}, visited ${g.actual.toFixed(0)}`}>
      <div className="mb-6 grid grid-cols-3 gap-2">
        {stats.map(([k, v], i) => (
          <motion.div key={k} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i, duration: 0.4, ease: EASE }} className="rounded-xl bg-muted/50 p-3">
            <p className="text-[11px] text-muted-foreground">{k}</p>
            <p className="mt-0.5 text-base font-semibold tabular-nums">{v}</p>
          </motion.div>
        ))}
      </div>

      <Block title="Visitors over time" info="Domestic visitors by state, DOSM Domestic Tourism Survey (Table 9), 2017-2025. The grey line is the average state.">
        <LineChart years={years} format={(v) => fmt.visitorsK(v)} height={200} series={[
          { id: "avg", label: "Average state", color: "var(--slate-9)", values: natAvg },
          { id: code, label: STATE_LABEL[code], color: "#e66767", values: years.map((y) => TREND.visitors[code][y]) },
        ]} />
      </Block>

      <Block title={`Quietest in Q${quiet.k} - hotels ${fmt.pct(quiet.mean, 0)} full`} info="Average hotel occupancy by quarter, Tourism Malaysia Paid Accommodation Survey. The quietest quarter (2023-2025 average) is the natural window for campaigns.">
        <LineChart years={q.map((d) => `Q${d.quarter} ${String(d.year).slice(2)}`)} format={(v) => `${v.toFixed(0)}%`} height={170}
          series={[{ id: "occ", label: "Occupancy", color: "#3987e5", values: q.map((d) => d.occupancy_pct) }]} />
      </Block>

      <Block title={`${fmt.pct(n("out_of_state_share_pct"), 0)} of its tourists come from other states`} info={`Overnight tourists by state of origin, DOSM Domestic Tourism Survey Table 10 (${n("od_year")}). The grey bar is the state's own residents.`}>
        <RankBars rows={origins.map((o) => ({ code: o.origin, value: o.tourists_k, color: o.origin === code ? "var(--slate-8)" : "#e66767" }))} format={(v) => fmt.visitorsK(v)} />
      </Block>

      {jr && (
        <Block title={`What ${fmt.int(jr.mentions_n)} travellers wrote`} info="From public travel blogs and video comments in Malay, English and Mandarin, tagged by AI. The bar and the number are the same thing: how positive travellers are about that topic (0-100, 50 is neutral). The small grey figure is how many posts mention it; topics are listed most-mentioned first. An indicator, not an official statistic.">
          <div className="space-y-1.5">
            {topics.map((t) => (
              <div key={t.topic} className="grid grid-cols-[130px_1fr_30px_58px] items-center gap-2 text-xs">
                <span className="truncate text-muted-foreground">{TOPIC_LABEL[t.topic]}</span>
                <span className="relative h-3 overflow-hidden rounded-[4px] bg-muted">
                  <motion.span className="absolute inset-y-0 left-0 rounded-[4px]" initial={{ width: 0 }} animate={{ width: `${t.sentiment}%` }} transition={{ duration: 0.6, ease: EASE }}
                    style={{ background: t.sentiment >= 50 ? `color-mix(in oklab, #3987e5 ${40 + (t.sentiment - 50) * 1.2}%, #383835)` : `color-mix(in oklab, #c4c7ce ${40 + (50 - t.sentiment) * 1.2}%, #383835)` }} />
                </span>
                <span className="text-right tabular-nums">{t.sentiment.toFixed(0)}</span>
                <span className="text-right text-[11px] tabular-nums text-muted-foreground">{fmt.int(t.n)} posts</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex h-3 overflow-hidden rounded-md">
            {emotions.map(({ e, v }) => <motion.div key={e} title={`${e} ${fmt.pct(v * 100, 0)}`} style={{ background: EMOTION_COLOR[e] }} className="border-r-2 border-background last:border-r-0" initial={{ width: 0 }} animate={{ width: `${v * 100}%` }} transition={{ duration: 0.7, ease: EASE }} />)}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] capitalize text-muted-foreground">
            {emotions.slice(0, 5).map(({ e, v }) => <span key={e} className="flex items-center gap-1"><span className="size-2 rounded-sm" style={{ background: EMOTION_COLOR[e] }} />{e} {fmt.pct(v * 100, 0)}</span>)}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs font-medium">In their words</p>
            <Segmented id="sheet-tone" value={tone} onChange={setTone} options={[{ value: "praise", label: "Praise" }, { value: "complaint", label: "Complaints" }]} />
          </div>
          <div className="mt-2 space-y-2">
            <AnimatePresence mode="popLayout">
              {quotes.map((x, i) => (
                <motion.blockquote key={x.url + tone + i} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: 0.04 * i }}
                  className="rounded-xl border border-border p-3 text-xs leading-relaxed">
                  {x.text.length > 220 ? `${x.text.slice(0, 220)}…` : x.text}
                  <a href={x.url} target="_blank" rel="noreferrer" className="ml-1.5 inline-flex items-center gap-0.5 text-primary hover:underline">source<ExternalLink className="size-2.5" /></a>
                </motion.blockquote>
              ))}
            </AnimatePresence>
          </div>
        </Block>
      )}

      <Block title="Where visitors already go" info="Top five destinations reported by DOSM, Domestic Tourism Survey 2025, Table 8A.">
        <ol className="grid gap-1.5 sm:grid-cols-2">
          {places.map((d) => <li key={d.name} className="flex items-center gap-2 text-xs"><span className="grid size-5 shrink-0 place-items-center rounded bg-muted text-[10px] font-medium tabular-nums">{d.rank}</span>{d.name}</li>)}
        </ol>
      </Block>

      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 border-t border-border pt-4 text-xs text-muted-foreground [&_dd]:text-right [&_dd]:font-medium [&_dd]:tabular-nums [&_dd]:text-foreground">
        <dt>Population</dt><dd>{fmt.visitorsK(n("population_k"))}</dd>
        <dt>Visitors who stay overnight</dt><dd>{fmt.pct(n("overnight_share") * 100, 0)}</dd>
        <dt>Tourists using paid accommodation</dt><dd>{fmt.pct(n("paid_accommodation_share") * 100, 0)}</dd>
        <dt>Foreign share of hotel guests</dt><dd>{fmt.pct(n("foreign_guest_share_pct"), 0)}</dd>
        <dt>Attractions, nature and heritage sites</dt><dd>{fmt.int(n("attractions_n"))}</dd>
        <dt>Airports within 100 km · rail stations</dt><dd>{n("airports_100km")} · {n("rail_stations_n")}</dd>
        <dt>Median household income</dt><dd>RM {fmt.int(n("income_median_rm"))}</dd>
      </dl>
    </Sheet>
  );
}
