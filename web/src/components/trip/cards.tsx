"use client";

/**
 * The cards the assistant answers with, written for a traveller, not an analyst: what a place is famous for,
 * when to go and why, what a trip costs, and a day-by-day route from breakfast to supper.
 * Every place, description and figure is read from the data - nothing is generated.
 */
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Camera, CloudRain, Coffee, ExternalLink, Footprints, MapPin, Moon, Navigation, ShoppingBag, Sun, UtensilsCrossed, Wallet } from "lucide-react";
import { SpotlightCard } from "@/components/spotlight-card";
import type { Pick, StateBrief } from "@/lib/chat";
import { STATE_NAME } from "@/lib/data";
import { TOPIC_LABEL } from "@/lib/jomrasa";
import { type DayPlan, type GDest, type GPlace, type Meal, type Stop, type TripPlan, clock, monthName, monthRanges, rainWords, whenToGo, worthIt } from "@/lib/trip";
import { cn } from "@/lib/utils";

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

/** The shape of the day's route: no basemap needed to see whether it is a tidy loop or a zig-zag. */
function RouteSketch({ day, hi, onHover }: { day: DayPlan; hi: number | null; onHover: (i: number | null) => void }) {
  const W = 300, H = 210, P = 22;
  const pts = useMemo(() => {
    const ps = day.stops.map((s) => s.place as GPlace);
    const lat0 = ps.reduce((s, p) => s + p.lat, 0) / ps.length, kx = Math.cos((lat0 * Math.PI) / 180);
    const xs = ps.map((p) => p.lon * kx), ys = ps.map((p) => p.lat);
    const minX = Math.min(...xs), minY = Math.min(...ys), span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY, 0.002);
    const scale = Math.min(W - 2 * P, H - 2 * P) / span;
    const offX = (W - (Math.max(...xs) - minX) * scale) / 2, offY = (H - (Math.max(...ys) - minY) * scale) / 2;
    return xs.map((x, i) => ({ x: offX + (x - minX) * scale, y: H - offY - (ys[i] - minY) * scale }));
  }, [day]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl bg-muted/50" onPointerLeave={() => onHover(null)} role="img" aria-label={`Route for day ${day.day}`}>
      <motion.path key={day.day} d={pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} fill="none" stroke="var(--indigo-8)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="1 6"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: EASE }} />
      {pts.map((p, i) => {
        const meal = day.stops[i].meal, on = hi === i;
        return (
          <motion.g key={`${day.day}-${i}`} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.25 + 0.07 * i, type: "spring", stiffness: 300, damping: 18 }}
            style={{ transformOrigin: `${p.x}px ${p.y}px`, cursor: "default" }} onPointerEnter={() => onHover(i)}>
            <motion.circle cx={p.x} cy={p.y} initial={false} animate={{ r: on ? 12 : 9 }} fill={meal ? "var(--amber-9)" : "var(--indigo-9)"} stroke="white" strokeWidth={2} />
            <text x={p.x} y={p.y + 3.5} textAnchor="middle" className="pointer-events-none fill-white text-[10px] font-semibold">{i + 1}</text>
          </motion.g>
        );
      })}
    </svg>
  );
}

export function PlanCard({ plan }: { plan: TripPlan }) {
  const [active, setActive] = useState(0);
  const [hi, setHi] = useState<number | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const day = plan.days[Math.min(active, plan.days.length - 1)];
  const driving = day.stops.reduce((s, x) => s + (x.leg && !x.leg.walk ? x.leg.mins : 0), 0);
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
          <p className="text-xs text-muted-foreground">{day.stops.length} stops · roughly {driving < 60 ? `${driving} min` : `${(driving / 60).toFixed(1)} h`} of driving in total</p>
        </div>

        <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,1fr)_300px]">
          <AnimatePresence mode="wait">
            <motion.ol key={day.day} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              {day.stops.map((s, i) => (
                <motion.li key={s.place.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, duration: 0.4, ease: EASE }}>
                  {s.leg && (
                    <p className="ml-[68px] flex items-center gap-1.5 border-l border-dashed border-border py-1.5 pl-5 text-[11px] text-muted-foreground">
                      {s.leg.walk ? <Footprints className="size-3" /> : <Navigation className="size-3" />}about {s.leg.mins} min {s.leg.walk ? "on foot" : "by car"}
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
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{open === s.place.id ? s.place.text : clip(s.place.text, 130)}</p>
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
            <RouteSketch day={day} hi={hi} onHover={setHi} />
            <a href={day.mapUrl} target="_blank" rel="noreferrer"
              className="group/m mt-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-transform active:scale-[0.98]">
              <Navigation className="size-3.5 transition-transform group-hover/m:translate-x-0.5 group-hover/m:-translate-y-0.5" />Open Day {day.day} route in Google Maps
            </a>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Times are a sensible pace, not a booking. Travel times are estimated from distance. Opening hours change - tap a stop to check.</p>
          </div>
        </div>
        <p className="mt-4 border-t border-border pt-3 text-[11px] text-muted-foreground">
          Places and descriptions are travellers&apos; own notes from <a href={plan.dest.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">Wikivoyage</a> (CC BY-SA), trimmed and otherwise unchanged. The route is worked out from their map locations.
        </p>
      </SpotlightCard>
    </motion.div>
  );
}
