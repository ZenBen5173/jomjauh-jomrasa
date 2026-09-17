"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ExternalLink, Quote } from "lucide-react";
import { Card, Kpi, Segmented } from "@/components/charts";
import { PageHeader, SourceNote, Stagger } from "@/components/shell";
import { SpotlightCard } from "@/components/spotlight-card";
import { Legend, type Scale, StateMap } from "@/components/state-map";
import { STATE_LABEL, STATE_NAME, fmt } from "@/lib/data";
import { EMOTION_COLOR, JR, TOPIC_LABEL } from "@/lib/jomrasa";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

export default function JomRasa() {
  const { selected, setSelected, gap } = useStore();
  const [tone, setTone] = useState<"praise" | "complaint">("praise");
  const states = useMemo(() => [...JR.states].sort((a, b) => b.experience_score - a.experience_score), []);
  const sel = selected ?? "TRG";

  if (!JR.ready) {
    return (
      <>
        <PageHeader eyebrow="JomRasa" title="How travellers feel, state by state">Text collection and tagging have not been run for this build.</PageHeader>
        <Card><p className="text-sm text-muted-foreground">Run the text pipeline (see README) and re-export to populate this page.</p></Card>
      </>
    );
  }

  const s = JR.states.find((x) => x.code === sel)!;
  const mean = s.national_mean;
  const lo = Math.min(...JR.states.map((x) => x.experience_lo)), hi = Math.max(...JR.states.map((x) => x.experience_hi));
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const topics = JR.topics.filter((t) => t.code === sel && t.n > 0).sort((a, b) => b.n - a.n);
  const maxN = Math.max(...topics.map((t) => t.n), 1);
  const quotes = JR.quotes.filter((q) => q.code === sel && (tone === "praise" ? q.overall > 0 : q.overall < 0)).slice(0, 4);
  const emotions = JR.meta.emotions.map((e) => ({ e, v: (s[`emo_${e}`] as number) ?? 0 })).filter((x) => x.v > 0.005);
  const values = Object.fromEntries(JR.states.map((x) => [x.code, x.experience_score]));
  const scale: Scale = { kind: "sequential", min: Math.min(...Object.values(values)), max: Math.max(...Object.values(values)) };
  const gapRank = gap.find((g) => g.code === sel)?.gap_rank;
  const v = JR.meta.validation;

  return (
    <>
      <PageHeader eyebrow="JomRasa · Experience Score" title="How does it feel to go there?">
        Official statistics count visitors; they do not say whether the trip was good. JomRasa reads {fmt.int(JR.meta.items_collected)} public travel passages and
        comments in Malay, English and Mandarin, keeps the {fmt.int(JR.meta.items_travel)} that describe a real travel experience, and scores each state.
        An indicator from public text - not an official statistic.
      </PageHeader>

      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Texts collected" value={JR.meta.items_collected} note="blogs, forums, articles, YouTube comments" />
        <Kpi label="Kept as travel experience" value={JR.meta.items_travel} note={`${fmt.pct((JR.meta.items_travel / Math.max(JR.meta.items_tagged, 1)) * 100, 0)} of tagged - rest filtered out`} />
        <Kpi label="National mean score" value={mean} decimals={1} note="0 = very negative · 100 = very positive" />
        {v ? <Kpi label="Sentiment agreement with blind reference labels" value={v.polarity_accuracy * 100} decimals={0} suffix="%" note={`n = ${v.n} · κ = ${v.polarity_kappa.toFixed(2)}`} />
           : <Kpi label="Shrinkage strength k" value={s.prior_k} decimals={0} note="a state needs ~k texts to count half" />}
      </Stagger>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_420px]">
        <Card title="Experience Score by state">
          <StateMap values={values} scale={scale} selected={sel} onSelect={setSelected}
            tooltip={(c) => {
              const x = JR.states.find((d) => d.code === c)!;
              return (
                <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-muted-foreground [&_dd]:text-right [&_dd]:font-medium [&_dd]:tabular-nums [&_dd]:text-foreground">
                  <dt>Experience Score</dt><dd>{x.experience_score.toFixed(1)}</dd>
                  <dt>Sample size</dt><dd>{fmt.int(x.mentions_n)} texts</dd>
                  <dt>Positive / negative</dt><dd>{fmt.pct((x.share_positive ?? 0) * 100, 0)} / {fmt.pct((x.share_negative ?? 0) * 100, 0)}</dd>
                </dl>
              );
            }} />
          <Legend scale={scale} left="lower" right="higher Experience Score" />
        </Card>

        <Card title="Ranking with uncertainty">
          <div className="space-y-[3px]">
            {states.map((x, i) => (
              <motion.button key={x.code} onClick={() => setSelected(x.code)} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.025 * i, duration: 0.4, ease: EASE }}
                className={cn("grid w-full grid-cols-[84px_1fr_78px] items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-accent/60", sel === x.code && "bg-accent")}>
                <span className="truncate text-muted-foreground">{STATE_LABEL[x.code]}</span>
                <span className="relative h-3">
                  <span className="absolute inset-x-0 top-1/2 h-px bg-[var(--slate-5)]" />
                  <span className="absolute inset-y-0 w-px bg-[var(--slate-8)]" style={{ left: `${pos(mean)}%` }} />
                  <span className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[#3987e5]/40" style={{ left: `${pos(x.experience_lo)}%`, width: `${pos(x.experience_hi) - pos(x.experience_lo)}%` }} />
                  {x.experience_raw != null && <span className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--slate-9)]" style={{ left: `${Math.max(0, Math.min(100, pos(x.experience_raw)))}%` }} title="raw mean before shrinkage" />}
                  <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--card)] bg-[#3987e5]" style={{ left: `${pos(x.experience_score)}%` }} />
                </span>
                <span className="text-right tabular-nums"><span className="font-medium">{x.experience_score.toFixed(1)}</span> <span className="text-[10px] text-muted-foreground">n={x.mentions_n}</span></span>
              </motion.button>
            ))}
          </div>
          <SourceNote>
            The score is the equal-weight average of 11 aspect sentiments, so frictions (access, price, crowding, cleanliness) count as much as praise for scenery and
            food - which is near-universal online. Solid dot = after empirical-Bayes shrinkage toward the national mean (tick); hollow = raw; band = 95% interval.
            Most bands overlap: <span className="font-medium text-foreground">quiet states are experienced just as well as busy ones</span>, so low visitor numbers are not explained by poor experiences.
          </SourceNote>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title={`${STATE_NAME[sel]} · what people talk about`} right={gapRank ? <span className="rounded-md bg-muted px-2 py-0.5 text-xs">Gap #{gapRank}</span> : undefined}>
          <div className="space-y-2">
            {topics.map((t) => (
              <div key={t.topic} className="grid grid-cols-[130px_1fr_34px] items-center gap-2 text-xs">
                <span className="truncate text-muted-foreground">{TOPIC_LABEL[t.topic]}</span>
                <span className="relative h-3.5 overflow-hidden rounded-[4px] bg-muted" title={`${t.n} mentions`}>
                  <motion.span className="absolute inset-y-0 left-0 rounded-[4px]" initial={{ width: 0 }} animate={{ width: `${(t.n / maxN) * 100}%` }} transition={{ duration: 0.6, ease: EASE }}
                    style={{ background: t.sentiment >= 50 ? `color-mix(in oklab, #3987e5 ${40 + (t.sentiment - 50) * 1.2}%, #383835)` : `color-mix(in oklab, #e66767 ${40 + (50 - t.sentiment) * 1.2}%, #383835)` }} />
                </span>
                <span className="text-right tabular-nums">{t.sentiment.toFixed(0)}</span>
              </div>
            ))}
          </div>
          <SourceNote>Bar length = how often the topic is mentioned; colour and number = sentiment (0-100, 50 neutral; blue praised, red complained about).</SourceNote>
        </Card>

        <Card title="Emotion mix">
          <div className="flex h-5 overflow-hidden rounded-md">
            {emotions.map(({ e, v: share }) => (
              <motion.div key={e} title={`${e} ${fmt.pct(share * 100, 0)}`} style={{ background: EMOTION_COLOR[e] }} className="border-r-2 border-[var(--card)] last:border-r-0"
                initial={{ width: 0 }} animate={{ width: `${share * 100}%` }} transition={{ duration: 0.7, ease: EASE }} />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
            {emotions.sort((a, b) => b.v - a.v).map(({ e, v: share }) => (
              <p key={e} className="flex items-center gap-1.5 text-xs capitalize text-muted-foreground">
                <span className="size-2 rounded-sm" style={{ background: EMOTION_COLOR[e] }} />{e}
                <span className="ml-auto tabular-nums text-foreground">{fmt.pct(share * 100, 0)}</span>
              </p>
            ))}
          </div>
          <SourceNote>Dominant emotion of each travel text (n = {s.mentions_n}). Languages: Malay {s.lang_ms}, English {s.lang_en}, Mandarin {s.lang_zh}, mixed {s.lang_mixed}.</SourceNote>
        </Card>

        <Card title="In their words" right={<Segmented id="tone" value={tone} onChange={setTone} options={[{ value: "praise", label: "Praise" }, { value: "complaint", label: "Complaints" }]} />}>
          <div className="space-y-2.5">
            <AnimatePresence mode="popLayout">
              {quotes.map((q, i) => (
                <motion.div key={q.url + i + tone} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: 0.05 * i, duration: 0.35 }}>
                  <SpotlightCard className="rounded-xl p-3" glow={tone === "praise" ? "rgba(57,135,229,0.14)" : "rgba(230,103,103,0.14)"}>
                    <Quote className="mb-1 size-3.5 text-muted-foreground" />
                    <p className="text-xs leading-relaxed">{q.text.length > 240 ? `${q.text.slice(0, 240)}…` : q.text}</p>
                    <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                      {q.topics.slice(0, 3).map((t) => <span key={t} className="rounded bg-muted px-1.5 py-0.5">{TOPIC_LABEL[t]}</span>)}
                      <span className="capitalize">· {q.emotion}</span>
                      <a href={q.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-primary hover:underline">source <ExternalLink className="size-2.5" /></a>
                    </p>
                  </SpotlightCard>
                </motion.div>
              ))}
            </AnimatePresence>
            {quotes.length === 0 && <p className="text-xs text-muted-foreground">No short {tone === "praise" ? "positive" : "negative"} quotes for this state.</p>}
          </div>
        </Card>
      </div>

      <Card className="mt-4" title="How JomRasa works">
        <div className="grid gap-4 text-xs leading-relaxed text-muted-foreground md:grid-cols-4">
          <p><span className="font-medium text-foreground">1 · Collect.</span> Per-state searches in Malay, English and Mandarin (Exa) plus comments on travel videos (YouTube Data API). Only text, state, link, date and language are stored - never usernames.</p>
          <p><span className="font-medium text-foreground">2 · Filter.</span> Each text is checked: is it about a travel experience? Two passes must both agree that it is a first-hand account; politics, news, spam and &quot;nice video&quot; comments are dropped.</p>
          <p><span className="font-medium text-foreground">3 · Tag.</span> A small language model ({JR.meta.model}) assigns topics with per-topic sentiment, overall sentiment and one emotion from fixed lists. Results are cached.</p>
          <p><span className="font-medium text-foreground">4 · Score.</span> Overall sentiment is averaged per state and shrunk toward the national mean according to sample size. The score also feeds the Gap Score and the bottleneck pillars.</p>
        </div>
        {v && (
          <SourceNote>
            Validation: {v.n} fresh texts were labelled independently by a stronger reference model that could not see the tagger&apos;s output. Agreement: travel filter{" "}
            {fmt.pct(v.travel_filter_accuracy * 100, 0)}, sentiment polarity {fmt.pct(v.polarity_accuracy * 100, 0)} (κ {v.polarity_kappa.toFixed(2)}), main topic recalled{" "}
            {fmt.pct(v.main_topic_recall * 100, 0)}, emotion {fmt.pct(v.emotion_accuracy * 100, 0)} - so treat the emotion mix as indicative. A first round of 200 texts showed the travel
            filter was too permissive (it kept &quot;great video&quot; and &quot;I want to go&quot; comments); a second, stricter pass was added and this figure is measured on texts not used for that fix.
            This is model-to-model agreement, not a human-labelled accuracy.
          </SourceNote>
        )}
      </Card>
    </>
  );
}
