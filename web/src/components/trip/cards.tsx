"use client";

/**
 * The cards the assistant answers with, written for a traveller, not an analyst: what a place is famous for,
 * when to go and why, what a trip costs, and a day-by-day route from breakfast to supper.
 * Every place, description and figure is read from the data - nothing is generated.
 */
import dynamic from "next/dynamic";
import { Component, type ReactNode, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, BedDouble, Camera, CloudRain, Coffee, ExternalLink, Footprints, Lightbulb, MapPin, Moon, Navigation, Sailboat, ShoppingBag, Sparkles, Sun, UtensilsCrossed, Wallet } from "lucide-react";
import { SpotlightCard } from "@/components/spotlight-card";
import type { Pick, StateBrief } from "@/lib/chat";
import { STATE_NAME } from "@/lib/data";
import { TOPIC_LABEL } from "@/lib/jomrasa";
import { type GDest, type GStay, type Meal, type Stop, type TripPlan, clock, monthName, monthRanges, rainWords, whenToGo, worthIt } from "@/lib/trip";
import { cn } from "@/lib/utils";

// the street map needs the browser, so it is loaded on the client only
const RouteMap = dynamic(() => import("@/components/trip/route-map").then((m) => m.RouteMap), { ssr: false, loading: () => <div className="h-[300px] w-full animate-pulse rounded-xl bg-muted/60" /> });

/** The map is a nicety: if it ever fails, the plan underneath must stay usable. */
class MapGuard extends Component<{ children: ReactNode }, { broken: boolean }> {
  state = { broken: false };
  static getDerivedStateFromError() { return { broken: true }; }
  render() {
    return this.state.broken
      ? <div className="grid h-[300px] w-full place-items-center rounded-xl border border-border bg-muted/50 px-6 text-center text-xs text-muted-foreground">The map could not load. The route button below still works.</div>
      : this.props.children;
  }
}

const EASE = [0.16, 1, 0.3, 1] as const;
const GOOD = "#2a7e3b", WET = "#ab6400";
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n).trimEnd()}…` : t);
const stateName = (code: string) => STATE_NAME[code].replace("W.P. ", "");
const Label = ({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) => (
  <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{icon}{children}</p>
);

function QuoteLine({ text, url, tone = "good" }: { text: string; url: string; tone?: "good" | "bad" }) {
  return (
    <blockquote className={cn("mt-3 border-l-2 pl-3 text-xs italic leading-relaxed text-muted-foreground", tone === "good" ? "border-[var(--indigo-7)]" : "border-[var(--amber-8)]")}>
      “{clip(text, 170)}”
      <a href={url} target="_blank" rel="noreferrer" className="ml-1.5 inline-flex items-center gap-0.5 not-italic text-primary hover:underline">source<ExternalLink className="size-2.5" /></a>
    </blockquote>
  );
}

function TownChips({ towns, onAsk }: { towns: GDest[]; onAsk: (t: string) => void }) {
  if (!towns.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {towns.map((t) => (
        <button key={t.id} onClick={() => onAsk(`Tell me about ${t.name}`)}
          className="group/s inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs transition-colors hover:border-primary/50 hover:text-primary">
          <MapPin className="size-3 transition-transform group-hover/s:-translate-y-0.5" />{t.name}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ "where should I go?" -> three states, each with towns to base yourself in
export function DestinationCard({ rec, rank, onAsk }: { rec: Pick; rank: number; onAsk: (text: string) => void }) {
  const name = stateName(rec.code), town = rec.towns[0];
  return (
    <motion.div className="min-w-0" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * rank, duration: 0.5, ease: EASE }}>
      <SpotlightCard className="flex h-full flex-col p-4 shadow-sm" glow="rgba(62,99,221,0.10)">
        <p className="text-[11px] font-medium uppercase tracking-wider text-primary">{rank === 0 ? "Where I'd go" : `Option ${rank + 1}`}</p>
        <h3 className="text-lg font-semibold tracking-tight">{name}</h3>
        <ul className="mt-2.5 space-y-1">
          {rec.reasons.slice(0, 3).map((x) => <li key={x} className="flex gap-2 text-xs leading-relaxed text-muted-foreground"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />{x}</li>)}
          {town && town.when.best.length > 0 && <li className="flex gap-2 text-xs leading-relaxed text-muted-foreground"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />Best around {monthRanges(town.when.best)}</li>}
        </ul>
        <TownChips towns={rec.towns} onAsk={onAsk} />
        {rec.quotes[0] && <QuoteLine text={rec.quotes[0].text} url={rec.quotes[0].url} />}
        <div className="mt-auto pt-3"><div className="flex items-center justify-end border-t border-border pt-2.5">
          <button onClick={() => onAsk(town ? `Plan 2 days in ${town.name}` : `Tell me about ${name}`)} className="group/b inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            {town ? `Plan my days in ${town.name}` : "Tell me more"}<ArrowRight className="size-3 transition-transform group-hover/b:translate-x-0.5" />
          </button>
        </div></div>
      </SpotlightCard>
    </motion.div>
  );
}

// ------------------------------------------------------------------ a whole state: pick a town
export function TownsCard({ towns, onAsk }: { towns: GDest[]; onAsk: (text: string) => void }) {
  if (!towns.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {towns.map((t, i) => (
        <motion.div key={t.id} className="min-w-0" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 * i, duration: 0.5, ease: EASE }}>
          <SpotlightCard onClick={() => onAsk(`Tell me about ${t.name}`)} className="flex h-full flex-col p-4 shadow-sm" glow="rgba(62,99,221,0.10)">
            <h3 className="flex items-center justify-between text-base font-semibold tracking-tight">{t.name}
              <ArrowRight className="size-4 -translate-x-1 text-primary opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" /></h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{clip(t.intro, 150)}</p>
            {t.known_for.length > 0 && <p className="mt-2 text-xs"><span className="text-muted-foreground">Eat: </span>{t.known_for.slice(0, 3).join(", ")}</p>}
            <p className="mt-auto pt-2 text-[11px] text-muted-foreground">{t.places.filter((p) => p.kind === "see" || p.kind === "do").length} things to see · {t.places.filter((p) => p.kind === "eat").length} places to eat</p>
          </SpotlightCard>
        </motion.div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ one town, introduced like a local would
function RainYear({ dest }: { dest: GDest }) {
  const max = Math.max(...dest.climate.map((c) => c.rain_mm));
  const [hi, setHi] = useState<number | null>(null);
  const tone = (m: number) => (dest.when.avoid.includes(m) ? WET : dest.when.best.includes(m) ? GOOD : "var(--slate-8)");
  return (
    <div onPointerLeave={() => setHi(null)}>
      <div className="flex h-14 items-end gap-1">
        {dest.climate.map((c, i) => (
          <motion.span key={c.month} onPointerEnter={() => setHi(c.month)} className="flex-1 origin-bottom rounded-t-[3px]" style={{ background: tone(c.month), height: `${Math.max(12, (c.rain_mm / max) * 100)}%`, opacity: hi && hi !== c.month ? 0.45 : 1 }}
            initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 0.03 * i, duration: 0.45, ease: EASE }} />
        ))}
      </div>
      <div className="mt-1 flex gap-1 text-center text-[10px] text-muted-foreground">{dest.climate.map((c) => <span key={c.month} className="flex-1">{monthName(c.month)[0]}</span>)}</div>
      <p className="mt-1.5 h-4 text-[11px] text-muted-foreground">
        {hi ? `${monthName(hi)}: ${rainWords(dest.climate[hi - 1].rainy_days)}` : <>Taller bar = more rain · <span style={{ color: GOOD }}>green</span> = good time · <span style={{ color: WET }}>amber</span> = think twice</>}
      </p>
    </div>
  );
}

export function GuideCard({ dest, brief, onAsk }: { dest: GDest; brief: StateBrief; onAsk: (text: string) => void }) {
  const when = whenToGo(dest);
  const sights = dest.places.filter((p) => p.kind === "see" || p.kind === "do").sort((a, b) => worthIt(dest, b) - worthIt(dest, a)).slice(0, 4);
  const eats = dest.places.filter((p) => p.kind === "eat").sort((a, b) => b.famous.length - a.famous.length || b.weight - a.weight).slice(0, 3);
  const notes = [...dest.notes].sort((a, b) => Number(a.title === "School holidays" || a.title.startsWith("Hari Raya")) - Number(b.title === "School holidays" || b.title.startsWith("Hari Raya"))).slice(0, 4);
  const state = stateName(dest.code);
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
      <SpotlightCard className="p-4 shadow-sm md:p-5" glow="rgba(62,99,221,0.10)">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <Label icon={<Camera className="size-3.5" />}>Don&apos;t miss</Label>
            <ul className="mt-2 space-y-2.5">
              {sights.map((p, i) => (
                <motion.li key={p.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + 0.06 * i, duration: 0.4, ease: EASE }}>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{clip(p.text, 150)}</p>
                </motion.li>
              ))}
            </ul>
          </div>
          <div>
            <Label icon={<UtensilsCrossed className="size-3.5" />}>Come hungry</Label>
            {dest.known_for.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">{dest.known_for.map((f) => <span key={f} className="rounded-full bg-[var(--amber-3)] px-2.5 py-1 text-xs capitalize text-[var(--amber-11)]">{f}</span>)}</div>
            )}
            <ul className="mt-2.5 space-y-2.5">
              {eats.map((p, i) => (
                <motion.li key={p.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + 0.06 * i, duration: 0.4, ease: EASE }}>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{clip(p.text, 150)}</p>
                </motion.li>
              ))}
              {!eats.length && dest.eat_notes && <li className="text-xs leading-relaxed text-muted-foreground">{clip(dest.eat_notes, 260)}</li>}
            </ul>
          </div>
        </div>

        <div className="mt-6 grid gap-6 border-t border-border pt-5 md:grid-cols-2">
          <div>
            <Label icon={<Sun className="size-3.5" />}>When to go</Label>
            <p className="mt-2 text-sm leading-relaxed">{when.best}</p>
            {when.avoid && <p className="mt-1.5 flex gap-1.5 text-sm leading-relaxed text-muted-foreground"><CloudRain className="mt-0.5 size-3.5 shrink-0" style={{ color: WET }} />{when.avoid}</p>}
            <div className="mt-3"><RainYear dest={dest} /></div>
          </div>
          <div>
            <Label>Good to know</Label>
            <ul className="mt-2 space-y-2">
              {notes.map((n) => (
                <li key={n.title} className="text-xs leading-relaxed">
                  <span className="font-medium">{n.title}</span><span className="text-muted-foreground"> · {monthRanges(n.months)}{n.moves ? " (date changes yearly - check)" : ""}</span>
                  <p className="text-muted-foreground">{n.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-5 grid gap-3 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground md:grid-cols-2">
          <p className="flex gap-2"><Wallet className="mt-0.5 size-3.5 shrink-0 text-foreground" />
            <span><span className="font-medium text-foreground">About RM {Math.round(brief.spend / 10) * 10} per person for the whole trip</span> of around {Math.max(1, Math.round(brief.nights))} night{Math.round(brief.nights) === 1 ? "" : "s"} - transport, food, a room and shopping included. That is what Malaysian visitors to {state} told the government&apos;s tourism survey.</span></p>
          {brief.gripes.length > 0 && (
            <p><span className="font-medium text-foreground">Honest heads-up:</span> what visitors to {state} grumble about most is {brief.gripes.map((g) => TOPIC_LABEL[g.topic].toLowerCase()).join(" and ")}.</p>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {[1, 2, 3].map((n) => (
            <motion.button key={n} whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} onClick={() => onAsk(n === 1 ? `Plan a day trip to ${dest.name}` : `Plan ${n} days in ${dest.name}`)}
              className={cn("rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors", n === 2 ? "bg-primary text-primary-foreground" : "border border-border bg-background hover:border-primary/50 hover:text-primary")}>
              Plan {n === 1 ? "a day trip" : `${n} days`}
            </motion.button>
          ))}
          <a href={dest.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">Place notes: Wikivoyage, CC BY-SA<ExternalLink className="size-2.5" /></a>
        </div>
      </SpotlightCard>
    </motion.div>
  );
}

// ------------------------------------------------------------------ the day-by-day plan
const MEAL_LABEL: Record<Meal, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", supper: "Supper" };
function StopIcon({ stop }: { stop: Stop }) {
  const c = "size-3.5";
  if (stop.meal === "breakfast") return <Coffee className={c} />;
  if (stop.meal === "supper") return <Moon className={c} />;
  if (stop.meal) return <UtensilsCrossed className={c} />;
  return stop.place.kind === "do" ? <Footprints className={c} /> : stop.place.kind === "buy" ? <ShoppingBag className={c} /> : <Camera className={c} />;
}

const stayKind = (h: GStay) => (h.tier ? h.tier : h.stars ? `${h.stars}-star ${h.type || "hotel"}` : h.type || "place to stay");

export function PlanCard({ plan }: { plan: TripPlan }) {
  const [active, setActive] = useState(0);
  const [hi, setHi] = useState<number | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const day = plan.days[Math.min(active, plan.days.length - 1)];
  const driving = day.stops.reduce((s, x) => s + (x.leg && !x.leg.walk && !x.leg.boat ? x.leg.mins : 0), 0);
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
      <SpotlightCard className="overflow-visible p-4 shadow-sm md:p-5" glow="rgba(62,99,221,0.08)">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex rounded-full bg-muted p-1">
            {plan.days.map((d, i) => (
              <button key={d.day} onClick={() => { setActive(i); setHi(null); setOpen(null); }} className="relative z-10 rounded-full px-3.5 py-1 text-xs font-medium">
                {active === i && <motion.span layoutId={`day-${plan.dest.id}-${plan.asked}`} className="absolute inset-0 -z-10 rounded-full bg-background shadow-sm" transition={{ type: "spring", stiffness: 320, damping: 26 }} />}
                <span className={active === i ? "text-foreground" : "text-muted-foreground"}>Day {d.day}</span>
              </button>
            ))}
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            {plan.by === "ai" && <span className="inline-flex items-center gap-1 rounded-full bg-[var(--indigo-3)] px-2 py-0.5 text-[10px] font-medium text-[var(--indigo-11)]"><Sparkles className="size-3" />planned by AI from real listings</span>}
            {day.stops.length} stops · roughly {driving < 60 ? `${driving} min` : `${(driving / 60).toFixed(1)} h`} on the road
          </p>
        </div>

        {day.theme && <motion.p key={day.theme} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="mt-3 text-sm font-medium">Day {day.day}: {day.theme}</motion.p>}
        <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,1fr)_340px]">
          <AnimatePresence mode="wait">
            <motion.ol key={day.day} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              {day.stops.map((s, i) => (
                <motion.li key={s.place.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, duration: 0.4, ease: EASE }}>
                  {s.leg && (
                    <p className="ml-[68px] flex items-center gap-1.5 border-l border-dashed border-border py-1.5 pl-5 text-[11px] text-muted-foreground">
                      {s.leg.boat ? <Sailboat className="size-3" /> : s.leg.walk ? <Footprints className="size-3" /> : <Navigation className="size-3" />}
                      {s.leg.boat ? "by boat - check the jetty for times, the last one back leaves early" : `about ${s.leg.mins} min ${s.leg.walk ? "on foot" : "by car"}`}
                    </p>
                  )}
                  <div onPointerEnter={() => setHi(i)} onPointerLeave={() => setHi(null)} onClick={() => setOpen(open === s.place.id ? null : s.place.id)}
                    className={cn("grid cursor-pointer grid-cols-[56px_24px_minmax(0,1fr)] items-start gap-x-3 rounded-xl px-1 py-1.5 transition-colors", hi === i && "bg-accent/60")}>
                    <span className="pt-0.5 text-right text-xs tabular-nums text-muted-foreground">{clock(s.at)}</span>
                    <span className={cn("grid size-6 place-items-center rounded-full text-white", s.meal ? "bg-[var(--amber-9)]" : "bg-primary")}><StopIcon stop={s} /></span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                        {s.place.name}
                        {s.meal && <span className="rounded-full bg-[var(--amber-3)] px-2 py-px text-[10px] font-medium text-[var(--amber-11)]">{MEAL_LABEL[s.meal]}</span>}
                        {s.place.famous.slice(0, 2).map((f) => <span key={f} className="rounded-full border border-border px-2 py-px text-[10px] capitalize text-muted-foreground">{f}</span>)}
                      </p>
                      {s.note && <p className="mt-0.5 text-[13px] leading-relaxed">{s.note}</p>}
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{open === s.place.id ? s.place.text : clip(s.place.text, s.note ? 90 : 130)}</p>
                      <AnimatePresence initial={false}>
                        {open === s.place.id && (
                          <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden text-[11px] text-muted-foreground">
                            <span className="mt-1 block">{[s.place.hours && `Hours: ${s.place.hours}`, s.place.address].filter(Boolean).join(" · ") || "No opening hours listed - check before you go."}{s.place.approx ? " · We know the street, not the exact door - ask around, everyone knows it." : ""}</span>
                            <a href={`https://www.google.com/maps/search/?api=1&query=${s.place.approx ? encodeURIComponent(`${s.place.name}, ${plan.dest.name}`) : `${s.place.lat},${s.place.lon}`}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="mt-0.5 inline-flex items-center gap-1 text-primary hover:underline">Open in Maps<ExternalLink className="size-2.5" /></a>
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.li>
              ))}
            </motion.ol>
          </AnimatePresence>

          <div className="md:sticky md:top-4 md:self-start">
            <MapGuard><RouteMap day={day} stay={plan.stay?.stay ?? null} hi={hi} onHover={setHi} /></MapGuard>
            <a href={day.mapUrl} target="_blank" rel="noreferrer"
              className="group/m mt-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-transform active:scale-[0.98]">
              <Navigation className="size-3.5 transition-transform group-hover/m:translate-x-0.5 group-hover/m:-translate-y-0.5" />Open Day {day.day} driving route in Google Maps
            </a>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Times are a sensible pace, not a booking. Travel times are estimated from distance. Opening hours change - tap a stop to check.</p>
          </div>
        </div>
        {(plan.stay || plan.tips.length > 0) && (
          <div className="mt-5 grid gap-5 border-t border-border pt-4 md:grid-cols-2">
            {plan.stay && (
              <div>
                <Label icon={<BedDouble className="size-3.5" />}>Where to sleep</Label>
                <p className="mt-2 text-sm font-medium">{plan.stay.stay.name} <span className="ml-1 rounded-full bg-[var(--grass-3)] px-2 py-px text-[10px] font-medium capitalize text-[var(--grass-11)]">{stayKind(plan.stay.stay)}</span></p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{plan.stay.why}</p>
                {plan.stay.stay.text && <p className="mt-1 text-xs italic leading-relaxed text-muted-foreground">“{clip(plan.stay.stay.text, 170)}”</p>}
                {plan.stay.others.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">Also handy: {plan.stay.others.map((h, i) => (
                    <span key={h.id}>{i > 0 && ", "}<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${h.name}, ${plan.dest.name}`)}`} target="_blank" rel="noreferrer" className="text-foreground underline decoration-border underline-offset-2 hover:decoration-primary">{h.name}</a> <span className="opacity-70">({stayKind(h)})</span></span>
                  ))}.</p>
                )}
                <p className="mt-1.5 text-[11px] text-muted-foreground">I don&apos;t know tonight&apos;s prices or what&apos;s free - check before you book.</p>
              </div>
            )}
            {plan.tips.length > 0 && (
              <div>
                <Label icon={<Lightbulb className="size-3.5" />}>Before you go</Label>
                <ul className="mt-2 space-y-1.5">{plan.tips.map((t) => <li key={t} className="flex gap-2 text-xs leading-relaxed text-muted-foreground"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" />{t}</li>)}</ul>
              </div>
            )}
          </div>
        )}
        <p className="mt-4 border-t border-border pt-3 text-[11px] text-muted-foreground">
          Places and descriptions are travellers&apos; own notes from <a href={plan.dest.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">Wikivoyage</a> (CC BY-SA), trimmed and otherwise unchanged; hotels and a few extra eateries are from OpenStreetMap.{plan.by === "ai" ? " The AI chose and ordered the stops and wrote the one-line tips; it can only pick from these listings, never add its own." : " The route is worked out from their map locations."}
        </p>
      </SpotlightCard>
    </motion.div>
  );
}
