"use client";

/** Slide-in side panel. Rendered inline (no portal) so it inherits the theme of the section it lives in. */
import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { SPRING } from "@/lib/motion";

export function Sheet({ open, onClose, title, subtitle, children, width = 620 }: {
  open: boolean; onClose: () => void; title: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode; width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = prev; };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <motion.div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={SPRING.soft}
            style={{ width: `min(${width}px, 100vw)` }}
            className="absolute inset-y-0 right-0 flex flex-col border-l border-border bg-background shadow-2xl">
            <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold tracking-tight">{title}</h2>
                {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
              </div>
              <button onClick={onClose} aria-label="Close" className="group grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                <X className="size-4 transition-transform group-hover:rotate-90" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
