"use client";

/** The cards the assistant answers with. Facts only - everything here is read from the data. */
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ExternalLink, MapPin } from "lucide-react";
import { SpotlightCard } from "@/components/spotlight-card";
import type { StateBrief } from "@/lib/chat";
import { STATE_NAME } from "@/lib/data";
import { TOPIC_LABEL } from "@/lib/jomrasa";
import { type Recommendation, WEIGHTS } from "@/lib/planner";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;
const PART = {
  match: { label: "Fits what you asked for", color: "#3e63dd" }, quiet: { label: "Quiet", color: "#2a7e3b" },
  budget: { label: "Budget fit", color: "#ab6400" }, feel: { label: "Travellers enjoy it", color: "#8e4ec6" },
} as const;
const osm = (lat: number, lon: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=13/${lat}/${lon}`;
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n).trimEnd()}…` : t);

function Spots({ places }: { places: { place: string; lat: number; lon: number }[] }) {
  if (!places.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {places.map((p) => (
        <a key={p.place} href={osm(p.lat, p.lon)} target="_blank" rel="noreferrer"
          className="group/s inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs transition-colors hover:border-primary/50 hover:text-primary">
          <MapPin className="size-3 transition-transform group-hover/s:-translate-y-0.5" />{p.place}
        </a>
      ))}
    </div>
  );
}

function QuoteLine({ text, url, tone = "good" }: { text: string; url: string; tone?: "good" | "bad" }) {
  return (
    <blockquote className={cn("mt-3 border-l-2 pl-3 text-xs italic leading-relaxed text-muted-foreground", tone === "good" ? "border-[var(--indigo-7)]" : "border-[var(--amber-8)]")}>
      “{clip(text, 170)}”
      <a href={url} target="_blank" rel="noreferrer" className="ml-1.5 inline-flex items-center gap-0.5 not-italic text-primary hover:underline">source<ExternalLink className="size-2.5" /></a>
    </blockquote>
  );
}

export function DestinationCard({ rec, rank, onAsk }: { rec: Recommendation; rank: number; onAsk: (text: string) => void }) {
  const [why, setWhy] = useState(false);
  const name = STATE_NAME[rec.code].replace("W.P. ", "");
  return (
    <motion.div className="min-w-0" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * rank, duration: 0.5, ease: EASE }}>
      <SpotlightCard className="flex h-full flex-col p-4 shadow-sm" glow="rgba(62,99,221,0.10)">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-primary">{rank === 0 ? "Best match" : `Option ${rank + 1}`}</p>
            <h3 className="text-lg font-semibold tracking-tight">{name}</h3>
          </div>
          <span className="rounded-full bg-[var(--indigo-3)] px-2.5 py-1 text-xs font-semibold tabular-nums text-[var(--indigo-11)]">{Math.round(rec.score)}% match</span>
        </div>
        <ul className="mt-2.5 space-y-1">
          {rec.reasons.slice(0, 2).map((x) => <li key={x} className="flex gap-2 text-xs leading-relaxed text-muted-foreground"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />{x}</li>)}
        </ul>
        <Spots places={rec.places.slice(0, 3)} />
        {rec.quotes[0] && <QuoteLine text={rec.quotes[0].text} url={rec.quotes[0].url} />}

        <div className="mt-auto pt-3">
          <AnimatePresence initial={false}>
            {why && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="space-y-1.5 pb-3">
                  {(Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).map((k) => (
                    <div key={k} className="grid grid-cols-[1fr_70px_26px] items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{PART[k].label} <span className="opacity-60">· {Math.round(WEIGHTS[k] * 100)}%</span></span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-muted"><motion.span className="block h-full rounded-full" style={{ background: PART[k].color }} initial={{ width: 0 }} animate={{ width: `${rec.parts[k]}%` }} transition={{ duration: 0.5, ease: EASE }} /></span>
                      <span className="text-right tabular-nums text-foreground">{rec.parts[k].toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex items-center justify-between border-t border-border pt-2.5">
            <button onClick={() => setWhy(!why)} className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
              Why this?<ChevronDown className={cn("size-3.5 transition-transform", why && "rotate-180")} />
            </button>
            <button onClick={() => onAsk(`Tell me about ${name}`)} className="text-xs font-medium text-primary hover:underline">Tell me more</button>
          </div>
        </div>
      </SpotlightCard>
    </motion.div>
  );
}

export function StateCard({ brief: b }: { brief: StateBrief }) {
  const facts: [string, string][] = [
    ["Travellers rate it", b.score != null ? `${b.score.toFixed(0)} / 100` : "-"],
    ["Typical spend", `RM ${Math.round(b.spend)}`],
    ["Quietest time", `Q${b.quietQuarter} · hotels ${b.quietOccupancy.toFixed(0)}% full`],
  ];
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
      <SpotlightCard className="p-4 shadow-sm md:p-5" glow="rgba(62,99,221,0.10)">
        <div className="grid grid-cols-3 gap-2">
          {facts.map(([k, v]) => (
            <div key={k} className="rounded-xl bg-muted/60 p-3"><p className="text-[11px] text-muted-foreground">{k}</p><p className="mt-0.5 text-sm font-semibold tabular-nums">{v}</p></div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">People love</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {b.loved.map((t) => <span key={t.topic} className="rounded-full bg-[var(--indigo-3)] px-2.5 py-1 text-xs text-[var(--indigo-11)]">{TOPIC_LABEL[t.topic]} · {t.sentiment.toFixed(0)}</span>)}
            </div>
            {b.praise && <QuoteLine text={b.praise.text} url={b.praise.url} />}
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Worth knowing</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {b.gripes.length ? b.gripes.map((t) => <span key={t.topic} className="rounded-full bg-[var(--amber-3)] px-2.5 py-1 text-xs text-[var(--amber-11)]">{TOPIC_LABEL[t.topic]} · {t.sentiment.toFixed(0)}</span>)
                : <span className="text-xs text-muted-foreground">No common complaints in what we read.</span>}
            </div>
            {b.complaint && <QuoteLine text={b.complaint.text} url={b.complaint.url} tone="bad" />}
          </div>
        </div>
        {b.places.length > 0 && (
          <>
            <p className="mt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Places travellers mention</p>
            <Spots places={b.places} />
          </>
        )}
      </SpotlightCard>
    </motion.div>
  );
}
