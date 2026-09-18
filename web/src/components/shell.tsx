"use client";

import { motion } from "motion/react";

const EASE = [0.16, 1, 0.3, 1] as const;

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="mb-4">
      {eyebrow && <p className="text-xs font-medium uppercase tracking-wider text-primary">{eyebrow}</p>}
      <h1 className="mt-0.5 text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
      {children && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">{children}</p>}
    </motion.header>
  );
}

/** Staggered entrance for a grid of cards. */
export function Stagger({ children, className }: { children: React.ReactNode[]; className?: string }) {
  return (
    <div className={className}>
      {children.map((c, i) => (
        <motion.div key={i} className="min-w-0" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 * i, duration: 0.5, ease: EASE }}>
          {c}
        </motion.div>
      ))}
    </div>
  );
}

export function SourceNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[11px] leading-snug text-muted-foreground">{children}</p>;
}
