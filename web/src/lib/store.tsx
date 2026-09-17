"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { DEFAULT_ASSUMPTIONS, DEFAULT_YEAR, INDICATORS, panelFor } from "./data";
import * as M from "./metrics";

export type MapMetric = "gap" | "visitors" | "occupancy" | "bottleneck" | "spend";

interface Store {
  year: number;
  setYear: (y: number) => void;
  selected: string | null;
  setSelected: (c: string | null) => void;
  assumptions: M.Assumptions;
  setAssumptions: (a: M.Assumptions) => void;
  weightsP: M.Weights;
  weightsA: M.Weights;
  setWeightsP: (w: M.Weights) => void;
  setWeightsA: (w: M.Weights) => void;
  rows: M.Row[];
  gap: M.GapRow[];
  pillars: M.PillarRow[];
  capacity: M.CapacityRow[];
  concentration: ReturnType<typeof M.concentration>;
}

const Ctx = createContext<Store | null>(null);
const equal = (inds: M.Indicator[]) => Object.fromEntries(inds.map((i) => [i.col, 1]));

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [selected, setSelected] = useState<string | null>(null);
  const [assumptions, setAssumptions] = useState(DEFAULT_ASSUMPTIONS);
  const [weightsP, setWeightsP] = useState<M.Weights>(equal(INDICATORS.potential));
  const [weightsA, setWeightsA] = useState<M.Weights>(equal(INDICATORS.actual));

  const value = useMemo<Store>(() => {
    const rows = panelFor(year);
    return {
      year, setYear, selected, setSelected, assumptions, setAssumptions, weightsP, weightsA, setWeightsP, setWeightsA, rows,
      gap: M.gapTable(rows, INDICATORS.potential, INDICATORS.actual, weightsP, weightsA),
      pillars: M.bottlenecks(rows, INDICATORS.pillars),
      capacity: M.capacity(rows, assumptions),
      concentration: M.concentration(rows),
    };
  }, [year, selected, assumptions, weightsP, weightsA]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
