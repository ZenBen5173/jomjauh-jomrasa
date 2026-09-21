"use client";

import { motion } from "motion/react";
import facts from "../../../../public/data/pipeline.json";
import { Card } from "@/components/charts";
import { Methods } from "@/components/planner/methods";
import { PageHeader } from "@/components/shell";
import { INDICATORS, META } from "@/lib/data";

const files = META.files as Record<string, { url: string; accessed: string }>;
const accessed = (prefix: string) => Object.entries(files).find(([k]) => k.startsWith(prefix))?.[1].accessed ?? "-";

const SOURCES = [
  { name: "DOSM Domestic Tourism Survey 2025 (national workbook)", what: "Visitors by state 2018-2025 (Table 9); tourists by origin × destination (Table 10); top destinations & districts (Tables 8A-8B); national key statistics", years: "2018-2025", level: "State", url: "https://storage.dosm.gov.my/tourism/tourism_domestic_2025.xlsx", date: accessed("dosm/tourism_domestic_2025") },
  { name: "DOSM Domestic Tourism Survey 2024 (national workbook)", what: "2017 visitors by state; 2024 origin × destination matrix", years: "2017-2024", level: "State", url: "https://storage.dosm.gov.my/tourism/tourism_domestic_2024.xlsx", date: accessed("dosm/tourism_domestic_2024") },
  { name: "DOSM Domestic Tourism Survey by State 2023 (16 workbooks)", what: "Receipts, trips, spend per visitor / trip, length of stay, tourist vs excursionist split, transport mode, accommodation type, NAPIC hotel stock", years: "2017-2023", level: "State", url: "https://open.dosm.gov.my/publications/tourism_domestic_state_2023", date: accessed("dosm/state/") },
  { name: "Tourism Malaysia - Paid Accommodation Survey (public Power BI)", what: "Hotels & rooms by state; average occupancy rate by state and quarter; domestic & foreign hotel guests", years: "2018 - Q1 2026", level: "State", url: "https://data.tourism.gov.my/public", date: (META.tourism_malaysia as { accessed: string }).accessed },
  { name: "data.gov.my / OpenDOSM - population_state", what: "Mid-year population by state", years: "2015-2026", level: "State", url: "https://data.gov.my/data-catalogue/population_state", date: accessed("datagovmy/population_state") },
  { name: "data.gov.my / OpenDOSM - HIES: hh_access_amenities, hh_income_state, hh_poverty_state", what: "Piped water, sanitation, electricity access; household income; poverty", years: "2016-2024", level: "District / state", url: "https://data.gov.my/data-catalogue", date: accessed("datagovmy/hh_access") },
  { name: "data.gov.my / OpenDOSM - gdp_state_real_supply", what: "Real GDP by state", years: "2016-2025", level: "State", url: "https://data.gov.my/data-catalogue/gdp_state_real_supply", date: accessed("datagovmy/gdp") },
  { name: "data.gov.my - arrivals_soe", what: "Foreign arrivals by state of entry (context only - entry point, not destination; ends Oct 2024)", years: "2020-2024", level: "State", url: "https://data.gov.my/data-catalogue/arrivals_soe", date: accessed("datagovmy/arrivals") },
  { name: "geoBoundaries MYS ADM1 (simplified)", what: "State boundaries", years: "current", level: "Polygon", url: "https://www.geoboundaries.org", date: accessed("geo/") },
  { name: "OpenStreetMap via Overpass API", what: "Attractions, nature & heritage sites, airports with IATA codes, rail stations - assigned to states by point-in-polygon", years: "current", level: "Point", url: "https://www.openstreetmap.org/copyright", date: META.osm_accessed as string },
  { name: "Exa search API", what: "Public travel blogs, forums and articles per state in Malay, English and Mandarin (TripAdvisor and Google Maps excluded); text passages only, no author data", years: "recent", level: "Text", url: "https://exa.ai", date: "2026-09-17" },
  { name: "YouTube Data API v3", what: "Public comments on per-state travel videos; comment text only, no usernames or channel ids stored", years: "recent", level: "Text", url: "https://developers.google.com/youtube/v3", date: "2026-09-17" },
];

const NOTES = [
  { h: "Trip planner", points: [
    "Places, eateries and hotels are real listings from Wikivoyage and OpenStreetMap. Descriptions are trimmed, never rewritten.",
    "A language model picks and orders places from that list only. Anything not on the list is dropped.",
    "Limits like \"no pork\" or \"with kids\" are enforced by our code before and after the model answers.",
    "Clock times, travel legs and the nearest hotel are calculated by us, never guessed by the model.",
    "If the model is down, a rule-based planner takes over: k-means groups sights into days, then the shortest route is found.",
    "When to go comes from ten years of daily rainfall (Open-Meteo, 2015-2024) for each town.",
  ] },
  { h: "Which year each number is from", points: [
    "Visitors, where tourists come from, hotel rooms and occupancy are from the year you pick.",
    "DOSM publishes state spending only up to 2023. For 2024 and 2025, spend per visitor and nights stayed are the 2023 figures, labelled on screen.",
    "Receipts for 2024 and 2025 are therefore estimates. 2023 is the fully matched year.",
  ] },
  { h: "References", points: [
    "Concentration: Gini and Lorenz curve, as used for tourism by Fernández-Morales et al. (2016) and Lau & Koo (2022).",
    "Opportunity: normalise-then-average composite index (OECD/JRC Handbook, 2008); visited side follows tourism intensity and density (McElroy & de Albuquerque; Eurostat).",
    "Bottleneck Diagnoser: Buhalis's (2000) destination \"As\". Small samples: empirical-Bayes shrinkage (Efron & Morris, 1975).",
    "Optional economic multiplier: Malaysian input-output range 1.20-1.82 (Mazumder et al., 2009). Off by default.",
  ] },
];

const LIMITS = [
  "Access is proxy-based (distance-decayed population reach, airports with an IATA code within 100 km, rail stations). No open road, flight-frequency or travel-time data exist; great-circle distance understates the sea crossing to Sabah, Sarawak and Labuan.",
  "OpenStreetMap coverage is uneven between states; site counts are log-scaled and carry one-seventh of the Potential index by default.",
  "Hotel capacity covers registered paid accommodation in Tourism Malaysia's survey; homestays and short-term rentals outside it are not counted, so capacity is conservative.",
  "Labuan, Putrajaya and Perlis are very small units; their scores move a lot with small absolute changes. Read them with the sensitivity intervals.",
  "JomRasa scores come from public online text, not a representative survey. They are an indicator of traveller experience, never an official statistic.",
  "The trip planner covers only towns that travellers have documented on Wikivoyage, and coverage is uneven: Kuala Lumpur, Penang, Johor Bahru and Ipoh are rich, parts of Kelantan, Perlis and Terengganu are thin, especially for food. Opening hours and eateries change; the app says so and links every stop to a map. A short town is given fewer days rather than padded.",
];

const fade = { initial: { opacity: 0, y: 10 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } };

export default function Methodology() {
  const groups = [["Potential index", INDICATORS.potential], ["Actual index", INDICATORS.actual], ...Object.entries(INDICATORS.pillars).map(([k, v]) => [`Pillar · ${k}`, v])] as [string, typeof INDICATORS.potential][];
  return (
    <>
      <PageHeader eyebrow="Methodology & data" title="How every score is worked out" />

      <div className="mb-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          [facts.tests.python + facts.tests.web, "automatic tests", `${facts.tests.python} on the data, ${facts.tests.web} on the website`],
          [facts.robustness.spearman_median.toFixed(2), "ranking stability", `${facts.robustness.draws.toLocaleString("en-MY")} random weightings, 1 = identical`],
          [facts.robustness.leave_one_out_min.toFixed(2), "lowest when one ingredient is removed", "still almost the same ranking"],
          ["5", "decimals", "the website's maths must match Python's"],
        ].map(([big, label, sub], i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i, duration: 0.45, ease: [0.16, 1, 0.3, 1] }} className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-foreground/20">
            <p className="text-2xl font-semibold leading-none tracking-tight tabular-nums">{big}</p>
            <p className="mt-1.5 text-xs font-medium">{label}</p>
            <p className="text-[11px] text-muted-foreground">{sub}</p>
          </motion.div>
        ))}
      </div>

      <Methods />

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {NOTES.map((m) => (
          <motion.div key={m.h} {...fade}>
            <Card title={m.h} className="h-full">
              <ul className="space-y-2">{m.points.map((t) => <li key={t} className="flex gap-2 text-xs leading-relaxed text-muted-foreground"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-[#3987e5]" />{t}</li>)}</ul>
            </Card>
          </motion.div>
        ))}
      </div>

      <motion.div {...fade} className="mt-4">
        <Card title="Data sources">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-xs">
              <thead><tr className="text-left text-muted-foreground"><th className="pb-2 pr-3 font-medium">Source</th><th className="pb-2 pr-3 font-medium">Used for</th><th className="pb-2 pr-3 font-medium">Years</th><th className="pb-2 pr-3 font-medium">Level</th><th className="pb-2 font-medium">Accessed</th></tr></thead>
              <tbody>
                {SOURCES.map((s) => (
                  <tr key={s.name} className="border-t border-border align-top transition-colors hover:bg-accent/40">
                    <td className="py-2 pr-3"><a href={s.url} target="_blank" rel="noreferrer" className="font-medium underline decoration-[var(--slate-7)] underline-offset-2 hover:decoration-[var(--primary)]">{s.name}</a></td>
                    <td className="py-2 pr-3 text-muted-foreground">{s.what}</td>
                    <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{s.years}</td>
                    <td className="py-2 pr-3">{s.level}</td>
                    <td className="whitespace-nowrap py-2 tabular-nums">{s.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </motion.div>

      <motion.div {...fade} className="mt-4">
        <Card title="Indicators behind each score">
          <div className="grid gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
            {groups.map(([name, inds]) => (
              <div key={name}>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-primary">{name}</p>
                <ul className="space-y-1.5">
                  {inds.map((i) => (
                    <li key={i.col} className="text-xs">
                      {i.label}{i.log && <span className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground">log</span>}
                      <span className="block text-[11px] text-muted-foreground">{i.source}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      </motion.div>

      <motion.div {...fade} className="mt-4">
        <Card title="Assumptions and limitations">
          <ul className="space-y-2">
            {LIMITS.map((l) => <li key={l} className="flex gap-2 text-xs leading-relaxed text-muted-foreground"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-[#3987e5]" />{l}</li>)}
          </ul>
        </Card>
      </motion.div>
    </>
  );
}
