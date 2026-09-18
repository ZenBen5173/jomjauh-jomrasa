"use client";

/**
 * Jojo, the guide in the corner of the planner. Rest the pointer on anything marked `data-guide="key"`
 * (or `data-guide-say="text"` for a line the page writes itself) and Jojo explains it in plain language.
 * Nothing is generated: the lines are templates in `lib/guide.ts`, filled from the dashboard's own data.
 * Eyes follow the pointer, the body takes the colour of the stage being explained, a click sends it to sleep.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring } from "motion/react";
import { STAGE } from "@/lib/data";
import { GREETING, type Say, type Stage, explain } from "@/lib/guide";
import { storyFacts } from "@/lib/story";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;
const REST = "#8b8d98";          // body colour when what it is explaining belongs to no stage
const DWELL = 180, LINGER = 4000; // ms: how long the pointer must rest before Jojo speaks, and how long a line stays after leaving
type Heard = { key: string } | { text: string; stage: Stage | null };

export function Guide() {
  const { rows, gap, pillars, capacity, concentration, assumptions, year } = useStore();
  const ctx = useMemo(() => ({ rows, gap, pillars, capacity, concentration, assumptions, year, facts: storyFacts(rows, gap, pillars, capacity, assumptions) }),
    [rows, gap, pillars, capacity, concentration, assumptions, year]);

  const [heard, setHeard] = useState<Heard | null>(null);
  const [asleep, setAsleep] = useState(false);
  const [side, setSide] = useState<"right" | "left">("right");   // Jojo steps aside when the thing being explained sits under the bubble
  const [hovering, setHovering] = useState(false);   // only show up for devices that can hover
  const pet = useRef<HTMLButtonElement>(null);
  const ex = useMotionValue(0), ey = useMotionValue(0);
  const px = useSpring(ex, { stiffness: 260, damping: 22 }), py = useSpring(ey, { stiffness: 260, damping: 22 });

  useEffect(() => {
    setHovering(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
    try { setAsleep(localStorage.getItem("jojo-asleep") === "1"); } catch { /* private mode */ }
  }, []);

  // say hello once, then get out of the way
  useEffect(() => {
    if (!hovering || asleep) return;
    setHeard({ text: GREETING, stage: null });
    const t = setTimeout(() => setHeard((h) => (h && "text" in h && h.text === GREETING ? null : h)), 6000);
    return () => clearTimeout(t);
  }, [hovering]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hovering) return;
    let dwell: ReturnType<typeof setTimeout> | undefined, linger: ReturnType<typeof setTimeout> | undefined, last: string | null = null;
    const over = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest || pet.current?.contains(target)) return;
      const el = target.closest("[data-guide],[data-guide-say]");
      const said = el?.getAttribute("data-guide-say"), key = el?.getAttribute("data-guide");
      const id = said ? `say:${said}` : key ?? null;
      if (id === last) return;
      last = id;
      clearTimeout(dwell);
      if (!id) { linger = setTimeout(() => setHeard(null), LINGER); return; }
      clearTimeout(linger);
      const next: Heard = said ? { text: said, stage: (el!.getAttribute("data-guide-stage") as Stage | null) ?? null } : { key: key! };
      const r = el!.getBoundingClientRect();
      const under = r.right > window.innerWidth - 380 && r.bottom > window.innerHeight - 330;
      dwell = setTimeout(() => { setHeard(next); setSide(under ? "left" : "right"); }, DWELL);
    };
    const move = (e: PointerEvent) => {
      const r = pet.current?.getBoundingClientRect();
      if (!r) return;
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), d = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, d / 220) * 2.6;
      ex.set((dx / d) * reach); ey.set((dy / d) * reach);
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointermove", move, { passive: true });
    return () => { document.removeEventListener("pointerover", over); document.removeEventListener("pointermove", move); clearTimeout(dwell); clearTimeout(linger); };
  }, [hovering, ex, ey]);

  if (!hovering) return null;

  const line: Say | null = asleep || !heard ? null : "key" in heard ? explain(heard.key, ctx) : heard;
  const colour = line?.stage ? STAGE[line.stage].base : REST;
  const words = line?.text.split(" ") ?? [];
  const toggle = () => {
    const next = !asleep;
    setAsleep(next); setHeard(null);
    try { localStorage.setItem("jojo-asleep", next ? "1" : "0"); } catch { /* private mode */ }
  };

  return (
    <motion.div layout transition={{ type: "spring", stiffness: 210, damping: 26 }}
      className={cn("pointer-events-none fixed bottom-5 z-50 flex flex-col gap-2.5", side === "right" ? "right-5 items-end" : "left-5 items-start")}>
      <AnimatePresence mode="wait">
        {line && (
          <motion.div key={line.text} role="status" aria-live="polite"
            initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ duration: 0.28, ease: EASE }} style={{ transformOrigin: side === "right" ? "bottom right" : "bottom left" }}
            className={cn("relative w-[min(330px,calc(100vw-2.5rem))] rounded-2xl border border-border bg-popover/95 px-4 py-3 shadow-2xl backdrop-blur", side === "right" ? "rounded-br-md" : "rounded-bl-md")}>
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <motion.span className="size-1.5 rounded-full" animate={{ background: colour }} />Jojo{line.stage && <span className="normal-case tracking-normal text-muted-foreground/70">· the {line.stage}</span>}
            </p>
            <p className="text-[13px] leading-relaxed text-foreground">
              {words.map((w, i) => (
                <motion.span key={i} className="inline-block whitespace-pre" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + Math.min(i * 0.016, 0.7), duration: 0.25 }}>{w}{" "}</motion.span>
              ))}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button ref={pet} onClick={toggle} aria-pressed={asleep} aria-label={asleep ? "Wake Jojo, the dashboard guide" : "Send Jojo, the dashboard guide, to sleep"}
        title={asleep ? "Wake me up" : "Click to send me to sleep"}
        className="pointer-events-auto relative size-[68px] rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}>
        {/* the bob lives inside the button so the click target stays still */}
        <motion.span className="block size-full" animate={asleep ? { y: 0 } : { y: [0, -4, 0] }} transition={asleep ? { duration: 0.3 } : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }}>
        <motion.svg key={line?.text ?? "idle"} viewBox="0 0 64 64" className="size-full overflow-visible drop-shadow-[0_6px_14px_rgba(0,0,0,0.45)]"
          initial={{ scaleY: 0.9, scaleX: 1.06 }} animate={{ scaleY: 1, scaleX: 1 }} transition={{ type: "spring", stiffness: 420, damping: 12 }} style={{ transformOrigin: "50% 100%" }}>
          {/* antenna: the spark that says "I can explain this" */}
          <path d="M32 12 V5" stroke="var(--slate-9)" strokeWidth={2} strokeLinecap="round" />
          <motion.circle cx={32} cy={4} r={3} animate={{ fill: colour, opacity: asleep ? 0.35 : [1, 0.55, 1] }} transition={{ opacity: { duration: 1.6, repeat: Infinity }, fill: { duration: 0.4 } }} />
          <motion.rect x={8} y={12} width={48} height={44} rx={20} animate={{ fill: colour }} transition={{ duration: 0.4 }} />
          <rect x={8} y={12} width={48} height={44} rx={20} fill="url(#jojo-shade)" />
          <defs>
            <linearGradient id="jojo-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity={0.22} /><stop offset="1" stopColor="#000" stopOpacity={0.22} /></linearGradient>
          </defs>
          {asleep ? (
            <>
              <path d="M18 34 q5 4 10 0 M36 34 q5 4 10 0" stroke="#111113" strokeWidth={2.2} strokeLinecap="round" fill="none" />
              <motion.text x={50} y={12} className="fill-[var(--slate-11)] text-[11px] font-semibold" animate={{ y: [12, 4], opacity: [0, 1, 0] }} transition={{ duration: 2.4, repeat: Infinity }}>z</motion.text>
            </>
          ) : (
            <motion.g animate={{ scaleY: [1, 1, 0.1, 1, 1] }} transition={{ duration: 4.6, repeat: Infinity, times: [0, 0.9, 0.94, 0.98, 1] }} style={{ transformOrigin: "32px 33px" }}>
              <ellipse cx={23} cy={33} rx={6.5} ry={7.5} fill="#fff" />
              <ellipse cx={41} cy={33} rx={6.5} ry={7.5} fill="#fff" />
              <motion.g style={{ x: px, y: py }}>
                <circle cx={23} cy={33} r={3.2} fill="#111113" /><circle cx={41} cy={33} r={3.2} fill="#111113" />
                <circle cx={24.2} cy={31.8} r={1} fill="#fff" /><circle cx={42.2} cy={31.8} r={1} fill="#fff" />
              </motion.g>
            </motion.g>
          )}
          <path d={line ? "M27 45 q5 5 10 0" : "M28 46 q4 2.5 8 0"} stroke="#111113" strokeWidth={2} strokeLinecap="round" fill="none" />
        </motion.svg>
        </motion.span>
      </motion.button>
    </motion.div>
  );
}
