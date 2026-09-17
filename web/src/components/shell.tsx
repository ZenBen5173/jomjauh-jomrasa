"use client";

/**
 * App shell. The nav uses the Sidebar 2.0 technique from the component library:
 * one highlight for the whole menu, positioned by measurement, so the hover
 * glides from row to row instead of cutting in and out.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { motion } from "motion/react";
import { BookOpenText, Compass, Gauge, HeartPulse, Map as MapIcon, Scale, SlidersHorizontal } from "lucide-react";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { YEARS } from "@/lib/data";
import { useStore } from "@/lib/store";

const NAV = [
  { group: "JomJauh · for planners", items: [
    { href: "/", label: "Overview", icon: MapIcon },
    { href: "/gap", label: "Gap & Bottlenecks", icon: Scale },
    { href: "/simulator", label: "Visitor Simulator", icon: SlidersHorizontal },
    { href: "/state/TRG", match: "/state", label: "State Profiles", icon: Gauge },
  ]},
  { group: "JomRasa · how it feels", items: [
    { href: "/jomrasa", label: "Experience Score", icon: HeartPulse },
    { href: "/planner", label: "Trip Planner", icon: Compass },
  ]},
  { group: "Trust", items: [{ href: "/methodology", label: "Methodology & Data", icon: BookOpenText }] },
];

type Box = { top: number; left: number; width: number; height: number };

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { year, setYear } = useStore();
  const menuRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);

  const track = (e: React.PointerEvent) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-nav-row]");
    const host = menuRef.current;
    if (!row || !host || !host.contains(row)) return;
    const r = row.getBoundingClientRect(), h = host.getBoundingClientRect();
    setBox({ top: r.top - h.top, left: r.left - h.left, width: r.width, height: r.height });
  };

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-3 px-2">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">JJ</span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold">JomJauh + JomRasa</span>
            <span className="block text-xs text-muted-foreground">Rebalancing Malaysia&apos;s tourism</span>
          </span>
        </Link>

        <div ref={menuRef} className="relative flex-1" onPointerOver={track} onPointerLeave={() => setBox(null)}>
          <motion.div
            aria-hidden
            className="pointer-events-none absolute z-0 rounded-md bg-sidebar-accent"
            initial={false}
            animate={box ? { opacity: 1, ...box } : { opacity: 0 }}
            transition={SPRING.default}
          />
          {NAV.map((g) => (
            <div key={g.group} className="mb-5">
              <p className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{g.group}</p>
              {g.items.map((it) => {
                const active = it.match ? path.startsWith(it.match) : path === it.href;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    data-nav-row
                    className={cn(
                      "relative z-10 flex items-center gap-2.5 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors",
                      active && "font-medium text-foreground",
                    )}
                  >
                    {active && <motion.span layoutId="nav-active" className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" transition={SPRING.default} />}
                    <it.icon className={cn("size-4", active && "text-primary")} />
                    {it.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-sidebar-border p-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Base year</p>
          <div className="relative flex rounded-md bg-background p-0.5">
            {YEARS.map((y) => (
              <button key={y} onClick={() => setYear(y)} className="relative z-10 flex-1 rounded py-1 text-xs font-medium">
                {year === y && <motion.span layoutId="year-pill" className="absolute inset-0 -z-10 rounded bg-primary" transition={SPRING.default} />}
                <span className={year === y ? "text-primary-foreground" : "text-muted-foreground"}>{y}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            {year > 2023
              ? `Visitors, occupancy, rooms: ${year}. Spend per visitor & length of stay: carried forward from 2023 (latest DOSM state release).`
              : "All inputs from 2023 - fully aligned year."}
          </p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-sidebar px-3 py-2 md:hidden">
          {NAV.flatMap((g) => g.items).map((it) => (
            <Link key={it.href} href={it.href} className="shrink-0 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground">{it.label}</Link>
          ))}
        </nav>
        <main className="mx-auto max-w-[1320px] px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="mb-6">
      <p className="text-xs font-medium uppercase tracking-wider text-primary">{eyebrow}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
      {children && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{children}</p>}
    </motion.header>
  );
}

/** Staggered entrance for a grid of cards. */
export function Stagger({ children, className }: { children: React.ReactNode[]; className?: string }) {
  return (
    <div className={className}>
      {children.map((c, i) => (
        <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 * i, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
          {c}
        </motion.div>
      ))}
    </div>
  );
}

export function SourceNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[11px] leading-snug text-muted-foreground">{children}</p>;
}
