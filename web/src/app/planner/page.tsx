"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ExternalLink, Loader2, MapPin, Sparkles } from "lucide-react";
import { Card } from "@/components/charts";
import { PageHeader, SourceNote } from "@/components/shell";
import { SpotlightCard } from "@/components/spotlight-card";
import { StateMap, type Scale } from "@/components/state-map";
import { STATE_LABEL, STATE_NAME } from "@/lib/data";
import { JR, TOPIC_LABEL } from "@/lib/jomrasa";
import { EXAMPLES, type Prefs, WEIGHTS, parseLocal, recommend } from "@/lib/planner";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;
const PART_LABEL = { match: "Fits what you asked for", quiet: "Quietness", budget: "Budget fit", feel: "How travellers feel" } as const;
const PART_COLOR = { match: "#3987e5", quiet: "#199e70", budget: "#c98500", feel: "#9085e9" } as const;

export default function Planner() {
  const { rows, gap } = useStore();
  const [text, setText] = useState(EXAMPLES[0].text);
  const [prefs, setPrefs] = useState<Prefs>(EXAMPLES[0].prefs);
  const [busy, setBusy] = useState(false);

  const recs = useMemo(() => (JR.ready ? recommend(prefs, rows, gap, STATE_LABEL, TOPIC_LABEL) : []), [prefs, rows, gap]);
  const top = recs.slice(0, 3);

  async function plan(input: string) {
    const example = EXAMPLES.find((e) => e.text === input.trim());
    if (example) return setPrefs(example.prefs);       // pre-computed: instant, works offline
    setBusy(true);
    try {
      const r = await fetch("/api/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: input.slice(0, 400) }) });
      if (!r.ok) throw new Error();
      const p = (await r.json()) as Prefs;
      setPrefs(Object.keys(p.topics).length ? p : parseLocal(input));
    } catch {
      setPrefs(parseLocal(input));                     // fallback: local keyword parser, no network needed
    } finally {
      setBusy(false);
    }
  }

  if (!JR.ready) {
    return (<><PageHeader eyebrow="JomRasa · Trip Planner" title="Describe your trip">The planner needs the JomRasa text tables, which are not in this build.</PageHeader></>);
  }

  const values = Object.fromEntries(recs.map((r) => [r.code, r.score]));
  const scale: Scale = { kind: "sequential", min: Math.min(...recs.map((r) => r.score)), max: Math.max(...recs.map((r) => r.score)) };

  return (
    <>
      <PageHeader eyebrow="JomRasa · Trip Planner" title="Describe your trip. We'll send you somewhere quieter.">
        The same data that guides planners can guide travellers. Type what you want in your own words - Malay, English or Mandarin - and get states and
        specific spots that fit, weighted toward places with room for you.
      </PageHeader>

      <Card>
        <form onSubmit={(e) => { e.preventDefault(); plan(text); }} className="flex flex-col gap-3 md:flex-row">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={400} placeholder="e.g. quiet beach, good seafood, not too expensive"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); plan(text); } }}
            className="min-h-[56px] flex-1 resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-[var(--ring)]" />
          <motion.button type="submit" disabled={busy || !text.trim()} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            className="group inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4 transition-transform group-hover:rotate-12" />}Plan my trip
          </motion.button>
        </form>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((e) => (
            <button key={e.text} onClick={() => { setText(e.text); setPrefs(e.prefs); }}
              className={cn("rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground", text === e.text && "border-primary/60 text-foreground")}>
              {e.text.length > 52 ? `${e.text.slice(0, 52)}…` : e.text}
            </button>
          ))}
        </div>
      </Card>

      <motion.div layout className="mt-4 rounded-xl border border-border bg-card px-4 py-3">
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">How we read that:</span>
          {Object.entries(prefs.topics).sort((a, b) => b[1] - a[1]).map(([t, w]) => (
            <motion.span layout key={t} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="rounded-md bg-muted px-2 py-0.5" style={{ opacity: 0.55 + w * 0.45 }}>{TOPIC_LABEL[t]}</motion.span>
          ))}
          {prefs.emotions.map((e) => <span key={e} className="rounded-md bg-[var(--indigo-4)] px-2 py-0.5 capitalize text-[var(--indigo-11)]">wants {e}</span>)}
          {prefs.budget && <span className="rounded-md bg-[var(--amber-4)] px-2 py-0.5 text-[var(--amber-11)]">{prefs.budget} budget</span>}
          {prefs.quiet >= 0.8 && <span className="rounded-md bg-[var(--grass-4)] px-2 py-0.5 text-[var(--grass-11)]">few crowds</span>}
          {prefs.region && <span className="rounded-md bg-muted px-2 py-0.5">{prefs.region}</span>}
          <span className="ml-auto text-[10px]">{prefs.source === "ai" ? "parsed by AI" : prefs.source === "example" ? "pre-computed example" : "parsed by keyword rules (AI unavailable)"}</span>
        </p>
      </motion.div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {top.map((r, i) => (
            <motion.div key={r.code} layout className="min-w-0" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ delay: 0.08 * i, duration: 0.5, ease: EASE }}>
              <SpotlightCard className="h-full p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-primary">#{i + 1} match</p>
                    <h2 className="text-xl font-semibold tracking-tight">{STATE_NAME[r.code]}</h2>
                  </div>
                  <span className="rounded-lg bg-muted px-2.5 py-1 text-sm font-semibold tabular-nums">{r.score.toFixed(0)}</span>
                </div>

                <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-muted">
                  {(Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).map((k) => (
                    <motion.span key={k} title={`${PART_LABEL[k]}: ${r.parts[k].toFixed(0)}/100`} style={{ background: PART_COLOR[k] }} className="border-r border-[var(--card)]"
                      animate={{ width: `${r.parts[k] * WEIGHTS[k]}%` }} transition={{ duration: 0.6, ease: EASE }} />
                  ))}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                  {(Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).map((k) => (
                    <span key={k} className="flex items-center gap-1"><span className="size-1.5 rounded-full" style={{ background: PART_COLOR[k] }} />{PART_LABEL[k]} {r.parts[k].toFixed(0)}</span>
                  ))}
                </div>

                <p className="mt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Why</p>
                <ul className="mt-1 space-y-1">
                  {r.reasons.map((x) => <li key={x} className="flex gap-2 text-xs leading-relaxed"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />{x}</li>)}
                </ul>

                {r.places.length > 0 && (
                  <>
                    <p className="mt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Spots travellers mention</p>
                    <div className="mt-1.5 space-y-1.5">
                      {r.places.map((p) => (
                        <a key={p.place} target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=13/${p.lat}/${p.lon}`}
                          className="group/p flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs transition-colors hover:border-foreground/25">
                          <MapPin className="size-3.5 shrink-0 text-primary transition-transform group-hover/p:-translate-y-0.5" />
                          <span className="font-medium">{p.place}</span>
                          <span className="truncate text-[10px] text-muted-foreground">{p.praised_for.slice(0, 2).map((t) => TOPIC_LABEL[t]).join(" · ")}</span>
                          <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">{p.mentions} mentions</span>
                        </a>
                      ))}
                    </div>
                  </>
                )}

                {r.quotes.map((q) => (
                  <blockquote key={q.url + q.text.slice(0, 20)} className="mt-3 border-l-2 border-[var(--slate-7)] pl-3 text-xs italic leading-relaxed text-muted-foreground">
                    “{q.text.length > 200 ? `${q.text.slice(0, 200)}…` : q.text}”
                    <a href={q.url} target="_blank" rel="noreferrer" className="ml-1.5 inline-flex items-center gap-0.5 not-italic text-primary hover:underline">source<ExternalLink className="size-2.5" /></a>
                  </blockquote>
                ))}
                <Link href={`/state/${r.code}`} className="mt-4 inline-block text-xs font-medium text-primary">State profile →</Link>
              </SpotlightCard>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card title="Your match across Malaysia">
          <StateMap values={values} scale={scale} selected={top[0]?.code}
            tooltip={(c) => { const r = recs.find((x) => x.code === c)!; return <p className="text-muted-foreground">Match score <span className="font-medium text-foreground">{r.score.toFixed(0)}</span> · rank #{recs.indexOf(r) + 1}</p>; }} />
        </Card>
        <Card title="How the ranking works">
          <p className="text-xs leading-relaxed text-muted-foreground">
            An AI model only translates your sentence into preferences. The ranking is a fixed, visible formula: {Math.round(WEIGHTS.match * 100)}% how well travellers rate the
            things you asked for, {Math.round(WEIGHTS.quiet * 100)}% quietness (low visitor intensity, from DOSM), {Math.round(WEIGHTS.budget * 100)}% budget fit (DOSM spend per visitor) and{" "}
            {Math.round(WEIGHTS.feel * 100)}% the state&apos;s overall Experience Score. If the AI service is unreachable, keyword rules take over, and the example
            requests are pre-computed - the planner always answers.
          </p>
          <SourceNote>Spots come from places named in the collected travel text, geocoded with OpenStreetMap. Quotes link to their public source.</SourceNote>
        </Card>
      </div>
    </>
  );
}
