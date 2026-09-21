"use client";

/**
 * Planner theme: light by default, dark one click away (remembered per browser).
 * Most colours are CSS tokens and follow the `.dark` class. The few that have to be real hex values in
 * JavaScript - map fills are interpolated and animated - live in PALETTE, read with usePalette().
 */
import { createContext, useContext, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type Theme = "light" | "dark";
const KEY = "jj-theme";
const Ctx = createContext<{ theme: Theme; toggle: () => void }>({ theme: "light", toggle: () => {} });

export const PALETTE = {
  light: {
    neutral: "#e3e5ea", empty: "#eceef1", stroke: "#ffffff", active: "#1c2024",
    // one colour per stage still holds: the pillars are three steps of amber, the inks are readable text shades
    pillar: { Access: "#f0cd85", Awareness: "#e0a030", Amenities: "#80591a" } as Record<string, string>,
    ink: { problem: "#b83b3b", opportunity: "#1f63b8", obstacle: "#8a5a00", payoff: "#0e7a55" },
    ramp: (s: { pale: string; deep: string }) => ({ from: s.pale, to: s.deep }),   // more = darker on a light page
  },
  dark: {
    neutral: "#383835", empty: "#26282b", stroke: "#111113", active: "#edeef0",
    pillar: { Access: "#f6dfae", Awareness: "#e0a030", Amenities: "#80591a" } as Record<string, string>,
    ink: { problem: "#f0a3a3", opportunity: "#86b6ef", obstacle: "#ecc477", payoff: "#5fd0a5" },
    ramp: (s: { pale: string; deep: string }) => ({ from: s.deep, to: s.pale }),   // more = brighter on a dark page
  },
};

export function ThemeShell({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    try { if (localStorage.getItem(KEY) === "dark") setTheme("dark"); } catch { /* private window: stay light */ }
  }, []);
  const toggle = () => setTheme((t) => {
    const next = t === "dark" ? "light" : "dark";
    try { localStorage.setItem(KEY, next); } catch { /* nothing to remember it in */ }
    return next;
  });
  return (
    <Ctx.Provider value={{ theme, toggle }}>
      <div className={cn(theme === "dark" && "dark", "min-h-screen bg-background text-foreground transition-colors duration-300")}>{children}</div>
    </Ctx.Provider>
  );
}

export const useTheme = () => useContext(Ctx);
export const usePalette = () => PALETTE[useContext(Ctx).theme];
