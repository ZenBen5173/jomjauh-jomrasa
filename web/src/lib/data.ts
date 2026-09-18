import panelJson from "../../public/data/panel.json";
import metaJson from "../../public/data/meta.json";
import trendJson from "../../public/data/trend.json";
import odJson from "../../public/data/od.json";
import quarterlyJson from "../../public/data/quarterly.json";
import geoJson from "../../public/data/states_geo.json";
import placesDosmJson from "../../public/data/places_dosm.json";
import type { Assumptions, Indicator, Row } from "./metrics";

export const YEARS = panelJson.years as number[];
export const DEFAULT_YEAR = panelJson.default_year as number;
export const panelFor = (year: number) => (panelJson.rows as unknown as Record<string, Row[]>)[String(year)];

export const INDICATORS = metaJson.indicators as unknown as {
  potential: Indicator[];
  actual: Indicator[];
  pillars: Record<string, Indicator[]>;
};
export const DEFAULT_ASSUMPTIONS = metaJson.assumptions_default as Assumptions;
export const META = metaJson;
export const TREND = trendJson as unknown as {
  visitors: Record<string, Record<string, number>>;
  receipts: Record<string, Record<string, number>>;
  spend_per_visitor: Record<string, Record<string, number>>;
  national: Record<string, number>[];
  gini_by_year: Record<string, number>;
};
export const OD = odJson as unknown as Record<string, { origin: string; dest: string; tourists_k: number }[]>;
export const QUARTERLY = quarterlyJson as unknown as Record<
  string,
  { year: number; quarter: number; occupancy_pct: number | null; hotel_guests_domestic: number | null; hotel_guests_foreign: number | null }[]
>;
export const GEO = geoJson as unknown as GeoJSON.FeatureCollection<GeoJSON.Geometry, { code: string; state: string }>;
export const PLACES_DOSM = placesDosmJson as { code: string; year: number; kind: string; rank: number; name: string }[];

const first = panelFor(DEFAULT_YEAR);
export const STATE_NAME: Record<string, string> = Object.fromEntries(first.map((r) => [r.code, r.state as string]));
export const STATE_LABEL: Record<string, string> = Object.fromEntries(first.map((r) => [r.code, r.label as string]));
export const CODES = first.map((r) => r.code);

/**
 * One colour per stage of the argument, and nothing else. Whatever belongs to a stage wears its colour:
 * problem (how crowded) = red, opportunity (what a state can offer) = blue, obstacle (what holds it back) = amber,
 * payoff (the simulator) = green. `deep` -> `pale` is the ramp for maps; greys carry everything that has no stage.
 */
export const STAGE = {
  problem: { base: "#e66767", soft: "#f0a3a3", pale: "#f29a9a", deep: "#4a1f1f" },
  opportunity: { base: "#3987e5", soft: "#86b6ef", pale: "#b7d3f6", deep: "#173a63" },
  obstacle: { base: "#e0a030", soft: "#ecc477", pale: "#f6dfae", deep: "#80591a" },
  payoff: { base: "#199e70", soft: "#5fd0a5", pale: "#a9e6cf", deep: "#0f4d38" },
} as const;
/** The three pillars are all "obstacle", so they are three steps of its amber - fixed per pillar, never cycled. */
export const PILLAR_COLOR: Record<string, string> = { Access: STAGE.obstacle.pale, Awareness: STAGE.obstacle.base, Amenities: STAGE.obstacle.deep };
export const PILLAR_BLURB: Record<string, string> = {
  Access: "Hard to reach from where most travellers live",
  Awareness: "Few out-of-state or foreign travellers know to go",
  Amenities: "Too few rooms and services for the visitors it has",
};

// ------------------------------------------------------------ formatters
export const fmt = {
  int: (v: number) => Math.round(v).toLocaleString("en-MY"),
  one: (v: number) => v.toLocaleString("en-MY", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  /** thousands of visitors -> "18.2M" / "604k" */
  visitorsK: (k: number) => (Math.abs(k) >= 1000 ? `${(k / 1000).toFixed(1)}M` : `${Math.round(k)}k`),
  /** RM million -> "RM 1.2bn" / "RM 340M" */
  rmM: (m: number) => (Math.abs(m) >= 1000 ? `RM ${(m / 1000).toFixed(2)}bn` : `RM ${m.toFixed(Math.abs(m) < 10 ? 1 : 0)}M`),
  pct: (v: number, d = 1) => `${v.toFixed(d)}%`,
  signed: (v: number, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}`,
};
