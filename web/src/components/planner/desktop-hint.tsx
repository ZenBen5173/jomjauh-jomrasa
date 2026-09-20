"use client";

/**
 * On a phone the planner works, but the maps, the ranked list and the state panel are built to sit side by side.
 * This card says so once, slides away on "Got it", and stays away (remembered per browser).
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Monitor, X } from "lucide-react";

const KEY = "jj-desktop-hint";

export function DesktopHint() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(KEY) === "1"; } catch { /* private window: just show it */ }
    if (seen) return;
    const small = window.matchMedia("(max-width: 767px)");
    const sync = () => setOpen(small.matches);
    const t = setTimeout(sync, 900);   // let the page land first
    small.addEventListener("change", sync);
    return () => { clearTimeout(t); small.removeEventListener("change", sync); };
  }, []);

  const close = () => {
    setOpen(false);
    try { localStorage.setItem(KEY, "1"); } catch { /* nothing to remember it in */ }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.aside role="status" initial={{ y: 120, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 120, opacity: 0 }} transition={{ type: "spring", stiffness: 260, damping: 26 }}
          drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }} onDragEnd={(_, i) => { if (i.offset.y > 60) close(); }}
          className="fixed inset-x-3 bottom-3 z-50 rounded-2xl border border-border bg-card/95 p-4 shadow-2xl shadow-black/50 backdrop-blur md:hidden">
          <span aria-hidden className="absolute left-1/2 top-1.5 h-1 w-9 -translate-x-1/2 rounded-full bg-foreground/15" />
          <div className="flex items-start gap-3 pt-1.5">
            <motion.span initial={{ scale: 0.6, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 14, delay: 0.15 }} className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary"><Monitor className="size-5" /></motion.span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Best on a computer</p>
              <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">The maps and charts are built for a big screen. It works here, but a laptop shows more at once.</p>
            </div>
            <button onClick={close} aria-label="Dismiss" className="-mr-1 -mt-0.5 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors active:bg-muted"><X className="size-4" /></button>
          </div>
          <button onClick={close} className="mt-3 w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]">Got it, continue on my phone</button>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
