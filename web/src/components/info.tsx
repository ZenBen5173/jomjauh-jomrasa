"use client";

/**
 * The "i" that replaces paragraphs of fine print: source, method and assumptions stay one
 * hover (or tap) away, so the layout can speak first and the detail never disappears.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Info as InfoIcon } from "lucide-react";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function Info({ children, align = "left", className }: { children: React.ReactNode; align?: "left" | "right"; className?: string }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      const hit = e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node);
      if (hit) { setOpen(false); setPinned(false); }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  return (
    <span ref={ref} className={cn("relative inline-flex align-middle", className)}
      onPointerEnter={(e) => e.pointerType === "mouse" && setOpen(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && !pinned && setOpen(false)}>
      <button type="button" aria-label="Source and method" aria-expanded={open}
        onClick={() => { const next = !(pinned && open); setPinned(next); setOpen(next); }}
        className="grid size-5 place-items-center rounded-full text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <InfoIcon className="size-3.5" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.span role="tooltip" initial={{ opacity: 0, y: -4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97, transition: { duration: 0.1 } }} transition={SPRING.snappy}
            className={cn("absolute top-6 z-40 block w-64 rounded-xl border border-border bg-popover p-3 text-left text-[11px] font-normal normal-case leading-relaxed tracking-normal text-muted-foreground shadow-xl",
              align === "right" ? "right-0" : "left-0")}>
            {children}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
