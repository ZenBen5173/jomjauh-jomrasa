"use client";

import { motion } from "motion/react";
import { Card } from "@/components/charts";
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

const METHODS = [
  { h: "Tourism concentration", p: "Gini coefficient and Lorenz curve of domestic visitors across the 16 states and federal territories (Fernández-Morales et al. 2016; Lau & Koo 2022), plus a population-weighted per-capita Gini, a normalised Herfindahl index and the Hoover index - the share of visits that would have to move for visits to be proportional to population. DOSM's national visitor figure is the sum of state visits (a person visiting two states is counted in both); our recomputed state sums match DOSM's Table 1 to within 0.05% every year. The total row printed under Table 9 is misaligned by one column in the source file, so we never read it." },
  { h: "Potential, Actual and Gap", p: "Each indicator is min-max normalised to 0-100 across the 16 states; count-type indicators (rooms, sites, visitor share, intensity, density) are log-transformed first so the very small federal territories do not flatten everyone else. Indices are weighted arithmetic means with equal weights by default (OECD/JRC Handbook on Constructing Composite Indicators, 2008; the same normalise-then-average structure as the WEF Travel & Tourism Development Index). PCA weights are deliberately not used - they are unstable with 16 units. The Actual index follows the tourism-penetration tradition (McElroy & de Albuquerque; Eurostat tourism intensity and density): share of national visitors, visitors per resident and visitors per km². Gap = Potential − Actual." },
  { h: "Sensitivity check", p: "800 Monte Carlo draws of Dirichlet(4) weights on both indices give a 5th-95th percentile rank interval for every state and the Spearman correlation with the equal-weight ranking; a leave-one-indicator-out test is run in the Python test suite (every ρ ≥ 0.85)." },
  { h: "Bottleneck Finder", p: "Three pillars follow Buhalis's (2000) destination 'As': Access, Awareness, Amenities. Each indicator becomes a robust z-score against the national median (median / 1.4826·MAD, clipped at ±3); a pillar is the mean of its z-scores rescaled so 50 = the median state. The weakest pillar is reported as the main bottleneck only when it is below the median (a state strong on all three has none), and all three are always shown. The method is rule-based; any generated text only restates these numbers." },
  { h: "Capacity Limit", p: "Spare room-nights = rooms × 365 × (target occupancy − current occupancy), using Tourism Malaysia's state room counts and average occupancy rate for the same year. Only overnight visitors in paid accommodation need rooms: room-nights per extra visitor = overnight share (DOSM tourists ÷ visitors) × paid-accommodation share (1 − share staying with friends & relatives, DOSM Table 12) × average length of stay ÷ guests per room. Target occupancy (default 75%) and guests per room (default 2.0) are user-set assumptions. Legal site-level limits exist in places (e.g. Sipadan's daily dive permits) but are outside this state-level model." },
  { h: "Visitor Simulator", p: "A what-if calculator, not a forecast. Moved visitors = share × origin visitors, capped by each destination's Capacity Limit; with several destinations, the overflow from one that fills up is re-offered to the others, so visitors stay unmoved only when every destination is full. Receipts gained use the destination's spend per visitor and receipts lost use the origin's, so the national net is near zero by construction - this is rebalancing, not new money. Redirected visitors are assumed to behave like the destination's current average visitor. The optional economic multiplier (off by default) uses the Malaysian input-output range of 1.20-1.82, mean 1.42 (Mazumder et al. 2009). Results are an upper bound that presumes the destination's main bottleneck is addressed." },
  { h: "JomRasa Experience Score", p: "Public travel text is collected per state in Malay, English and Mandarin (Exa search; YouTube Data API comments). Only text, state, URL, date and language are stored - no usernames. A small language model assigns closed-set labels: travel-experience yes/no, up to 11 topics with per-topic sentiment, overall sentiment and one of 8 emotions; a second, stricter pass must also agree the text is a first-hand account. Online travel writing is about 88% positive and praise for scenery, food and culture is near-identical everywhere, so a plain average of overall sentiment cannot separate states (range about 3 points). The Experience Score is therefore the equal-weight mean of the 11 aspect sentiments, each shrunk toward the national mean by sample size (empirical Bayes; Efron & Morris 1975), which lets the frictions that do differ - access, price, crowding, cleanliness, safety - count. It enters the Potential index; access and amenity sentiment enter the bottleneck pillars; text volume enters Awareness." },
  { h: "JomRasa validation", p: "A stronger reference model labelled samples blind to the tagger's output. Round 1 (200 texts) found the travel filter too permissive - it kept 'great video' and 'I want to go there' comments - so a second filtering pass was added. Round 2 (120 fresh texts, not used for that fix) gives the reported agreement: travel filter 82%, sentiment polarity 87% (Cohen's kappa 0.57), main topic 93%, emotion 63%. These are model-to-model agreement figures, not human-labelled accuracy; both labelled samples are in the repository (docs/). Emotion is the weakest label and is shown as indicative only." },
  { h: "Trip Planner", p: "A language model only converts the traveller's sentence into structured preferences (topics, feelings, budget, crowd tolerance, region). The ranking is a fixed formula shown on the page: 40% how travellers rate the requested aspects, 25% quietness (DOSM visitor intensity and crowding sentiment), 15% budget fit (DOSM spend per visitor), 20% Experience Score; a requested region is a hard requirement. If the model is unreachable the page falls back to multilingual keyword rules, and the example requests are pre-computed, so the planner always answers." },
  { h: "Year alignment", p: "DOSM has published state-level spending only up to 2023. For base years 2024 and 2025, visitors, the origin-destination matrix, occupancy, rooms and hotel guests are from that year, while spend per visitor, length of stay and accommodation-type shares are carried forward from 2023 and labelled on screen; receipts for those years are therefore estimates. Base year 2023 is fully aligned." },
];

const LIMITS = [
  "Access is proxy-based (distance-decayed population reach, airports with an IATA code within 100 km, rail stations). No open road, flight-frequency or travel-time data exist; great-circle distance understates the sea crossing to Sabah, Sarawak and Labuan.",
  "OpenStreetMap coverage is uneven between states; site counts are log-scaled and carry one-seventh of the Potential index by default.",
  "Hotel capacity covers registered paid accommodation in Tourism Malaysia's survey; homestays and short-term rentals outside it are not counted, so capacity is conservative.",
  "Labuan, Putrajaya and Perlis are very small units; their scores move a lot with small absolute changes. Read them with the sensitivity intervals.",
  "JomRasa scores come from public online text, not a representative survey. They are an indicator of traveller experience, never an official statistic.",
];

const fade = { initial: { opacity: 0, y: 10 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } };

export default function Methodology() {
  const groups = [["Potential index", INDICATORS.potential], ["Actual index", INDICATORS.actual], ...Object.entries(INDICATORS.pillars).map(([k, v]) => [`Pillar · ${k}`, v])] as [string, typeof INDICATORS.potential][];
  return (
    <>
      <PageHeader eyebrow="Methodology & data" title="Every number, where it comes from, and how it is used">
        One rerunnable Python pipeline (extract → transform → load → checks) produces every table behind this dashboard. 37 automated data checks and metric
        tests must pass before export, and the dashboard&apos;s TypeScript calculations are tested (20 tests) against the Python reference results.
      </PageHeader>

      <motion.div {...fade}>
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

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {METHODS.map((m) => (
          <motion.div key={m.h} {...fade}>
            <Card title={m.h} className="h-full"><p className="text-xs leading-relaxed text-muted-foreground">{m.p}</p></Card>
          </motion.div>
        ))}
      </div>

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
            {LIMITS.map((l) => <li key={l} className="flex gap-2 text-xs leading-relaxed text-muted-foreground"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--amber-9)]" />{l}</li>)}
          </ul>
        </Card>
      </motion.div>
    </>
  );
}
