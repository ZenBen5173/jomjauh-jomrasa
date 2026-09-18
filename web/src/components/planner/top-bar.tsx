"use client";

/**
 * Planner top bar. The tabs use the Spotlight Navbar technique from the component library:
 * a light that follows the pointer along the bar, and a line of "ambience" that springs to the active tab.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";
import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { Info } from "@/components/info";
import { YEARS } from "@/lib/data";
import { SPRING } from "@/lib/motion";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Dashboard" },
  { href: "/simulator", label: "Simulator" },
  { href: "/methodology", label: "Methodology" },
];

function SpotlightTabs() {
  const path = usePathname();
  const active = Math.max(0, TABS.findIndex((t) => t.href === path));
  const nav = useRef<HTMLElement>(null);
  const [hover, setHover] = useState(false);
  const ambience = useRef(0);

  useEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!el || !nav.current) return;
    const target = el.offsetLeft + el.offsetWidth / 2;
    const controls = animate(ambience.current, target, {
      type: "spring", stiffness: 200, damping: 20,
      onUpdate: (v) => { ambience.current = v; nav.current?.style.setProperty("--ambience-x", `${v}px`); },
    });
    return () => controls.stop();
  }, [active]);

  return (
    <nav ref={nav} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onMouseMove={(e) => nav.current?.style.setProperty("--spotlight-x", `${e.clientX - nav.current.getBoundingClientRect().left}px`)}
      className="relative h-10 w-fit overflow-hidden rounded-full border border-border bg-card/70">
      <ul className="relative z-10 flex h-full items-center px-1.5">
        {TABS.map((t, i) => (
          <li key={t.href}>
            <Link href={t.href} data-index={i}
              className={cn("block rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors", i === active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
      <div aria-hidden className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{ opacity: hover ? 1 : 0, background: "radial-gradient(110px circle at var(--spotlight-x) 100%, rgba(255,255,255,0.14) 0%, transparent 55%)" }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px]"
        style={{ background: "radial-gradient(56px circle at var(--ambience-x) 0%, rgba(255,255,255,0.95) 0%, transparent 100%)" }} />
    </nav>
  );
}

export function TopBar() {
  const { year, setYear } = useStore();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 md:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">JJ</span>
          <span className="text-sm font-semibold tracking-tight">JomJauh</span>
        </Link>
        <div className="order-3 w-full overflow-x-auto md:order-none md:ml-2 md:w-auto"><SpotlightTabs /></div>

        <div className="ml-auto flex items-center gap-1.5">
          <div data-guide="year" className="relative flex rounded-lg bg-muted p-0.5" role="group" aria-label="Base year">
            {YEARS.map((y) => (
              <button key={y} onClick={() => setYear(y)} className="relative z-10 rounded-md px-2.5 py-1 text-xs font-medium tabular-nums">
                {year === y && <motion.span layoutId="year-pill" className="absolute inset-0 -z-10 rounded-md bg-background shadow-sm" transition={SPRING.default} />}
                <span className={year === y ? "text-foreground" : "text-muted-foreground"}>{y}</span>
              </button>
            ))}
          </div>
          <Info align="right">
            <b className="font-medium text-foreground">Base year.</b> Visitors, hotel occupancy and rooms use the year you pick. DOSM has published state-level spending only up to
            2023, so for 2024 and 2025 spend per visitor and length of stay are carried forward from 2023. 2023 is the fully aligned year.
          </Info>
          <Link href="/trip" data-guide="travellers" className="group ml-2 inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
            For travellers <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
