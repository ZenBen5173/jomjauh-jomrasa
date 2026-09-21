"use client";

/**
 * The pipeline, step by step. For every step: the methods used, how many items each one caught, and why -
 * in one short line. Not a dashboard: a ledger you read top to bottom.
 * Every count is measured: pipeline/audit.py replays the cleaning code on the raw files with counters attached,
 * pipeline/quality.py runs the validation rules, and both write public/data/pipeline_audit.json.
 */
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Combine, Download, Eraser, MessagesSquare, Rocket } from "lucide-react";
import facts from "../../../../public/data/pipeline.json";
import audit from "../../../../public/data/pipeline_audit.json";
import { PageHeader } from "@/components/shell";
import { STATE_LABEL } from "@/lib/data";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;
const n = (v: number) => v.toLocaleString("en-MY");
const { raw, tests, robustness } = facts;
const { structured: S, quality: Q, text: T, panel: P, guide: G } = audit;

interface Row { method: string; does: string; count: string; unit: string; share?: number; why: string }

function Ledger({ rows, head = ["Method", "What it does", "Found", "Why"] }: { rows: Row[]; head?: string[] }) {
  return (
    <div className="mt-4">
      <div className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_150px_minmax(0,1.6fr)] gap-x-5 border-b border-border px-2 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground lg:grid">
        {head.map((h, i) => <span key={h} className={i === 2 ? "text-right" : ""}>{h}</span>)}
      </div>
      {rows.map((r, i) => (
        <motion.div key={r.method} initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-30px" }} transition={{ delay: 0.03 * i, duration: 0.4, ease: EASE }}
          className="group grid gap-x-5 gap-y-1 border-b border-border/60 py-3 text-[13px] leading-snug transition-colors last:border-0 hover:bg-accent/30 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_150px_minmax(0,1.6fr)] lg:items-start lg:px-2">
          <p className="font-medium">{r.method}</p>
          <p className="text-muted-foreground">{r.does}</p>
          <div className="lg:text-right">
            <p><span className="text-base font-semibold tabular-nums tracking-tight">{r.count}</span> <span className="text-xs text-muted-foreground">{r.unit}</span></p>
            {r.share !== undefined && (
              <span className="mt-1 block h-1 w-full max-w-[150px] overflow-hidden rounded-full bg-muted lg:ml-auto">
                <motion.span initial={{ width: 0 }} whileInView={{ width: `${Math.max(r.share * 100, r.share > 0 ? 2 : 0)}%` }} viewport={{ once: true }} transition={{ duration: 0.8, ease: EASE }} className="block h-full rounded-full bg-primary transition-[filter] group-hover:brightness-125" />
              </span>
            )}
          </div>
          <p className="text-muted-foreground"><span className="mr-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 lg:hidden">Why</span>{r.why}</p>
        </motion.div>
      ))}
    </div>
  );
}

function Stage({ step, icon: Icon, title, line, result, last, children }: { step: number; icon: typeof Download; title: string; line: string; result: string; last?: boolean; children: React.ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, ease: EASE }} className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 sm:grid-cols-[40px_minmax(0,1fr)] sm:gap-x-4">
      <div className="flex flex-col items-center">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground sm:size-9 sm:text-sm">{step}</span>
        {!last && <span className="mt-1 w-px flex-1 bg-border" />}
      </div>
      <div className="mb-6 min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight"><Icon className="size-4 text-primary" />{title}</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{line}</p>
          </div>
          <p className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{result}</p>
        </div>
        {children}
      </div>
    </motion.section>
  );
}

const KIND = { f: { name: "From that year", cls: "fill-primary" }, c: { name: "Carried from an earlier year", cls: "fill-primary/35" }, e: { name: "Not published", cls: "fill-foreground/10" } } as const;
const pretty = (col: string) => col.replace(/_/g, " ").replace(/\b(rm|k|n|pct)\b/g, "").trim();

/** Every cell of the joined table, drawn: 80 state-years across, 48 values down. */
function CellMap() {
  const [hover, setHover] = useState<string | null>(null);
  const size = 9, tall = 6, gap = 1.5, yearGap = 10;
  const years = [...new Set(P.map.map((r) => r.year))];
  const x = (i: number) => i * (size + gap) + years.indexOf(P.map[i].year) * yearGap;
  const width = x(P.map.length - 1) + size, height = P.column_names.length * (tall + gap);
  return (
    <div className="mt-3">
      <div className="overflow-x-auto">
        <svg viewBox={`0 -16 ${width} ${height + 16}`} className="w-full min-w-[640px]" role="img" aria-label="Every cell of the joined table: filled, carried forward or not published">
          {years.map((y) => { const i = P.map.findIndex((r) => r.year === y); return <text key={y} x={x(i)} y={-5} className="fill-muted-foreground text-[9px]">{y}</text>; })}
          {P.map.map((row, i) => [...row.cells].map((k, j) => (
            <rect key={`${i}-${j}`} x={x(i)} y={j * (tall + gap)} width={size} height={tall} rx={1.5} className={cn(KIND[k as keyof typeof KIND].cls, "transition-opacity hover:opacity-60")}
              onMouseEnter={() => setHover(`${STATE_LABEL[row.code] ?? row.code} ${row.year} · ${pretty(P.column_names[j])} · ${KIND[k as keyof typeof KIND].name.toLowerCase()}`)} onMouseLeave={() => setHover(null)} />
          )))}
        </svg>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {(["f", "c", "e"] as const).map((k) => <span key={k} className="flex items-center gap-1.5"><svg width="10" height="10"><rect width="10" height="10" rx="2" className={KIND[k].cls} /></svg>{KIND[k].name}</span>)}
        <span className="ml-auto text-foreground">{hover ?? "Hover a square"}</span>
      </p>
    </div>
  );
}

export default function Pipeline() {
  const [cells, setCells] = useState(false);
  const f = T.funnel, step = (label: string) => f.find((x) => x.label === label)!;
  const start = f[0].n, end = f[f.length - 1].n;
  const scrubbed = Object.values(T.scrubbed).reduce((a, b) => a + b, 0);
  const rawRows = S.filters.reduce((a, x) => a + x.raw, 0), keptRows = S.filters.reduce((a, x) => a + x.kept, 0);
  const dup = S.duplicates[0];

  const EXTRACT: Row[] = [
    { method: "DOSM Domestic Tourism Survey", does: "File download from OpenDOSM", count: n(raw.dosm_files), unit: "spreadsheets", why: "Visitors, spending and where tourists come from, by state." },
    { method: "data.gov.my", does: "File download", count: n(raw.datagovmy_files), unit: "tables", why: "Population, income, poverty, basic amenities, GDP." },
    { method: "Tourism Malaysia", does: "The public dashboard's own data API", count: n(raw.tourism_malaysia_files), unit: "tables", why: "Hotels, rooms and how full they are." },
    { method: "OpenStreetMap", does: "Overpass API, one query per kind of place", count: n(S.osm.raw), unit: "map points", why: "Attractions, airports, rail stations, hotels, eateries." },
    { method: "Travel web pages", does: `Exa search API, ${n(T.searches)} searches`, count: n(T.pages), unit: "pages", why: "What travellers write, in Malay, English and Chinese." },
    { method: "Video comments", does: "YouTube Data API", count: n(T.comments), unit: "comments", why: "Short first-hand reactions to each state." },
    { method: "Wikivoyage and rainfall", does: "MediaWiki API and Open-Meteo API", count: n(raw.wikivoyage_pages), unit: `pages, ${raw.rainfall_towns} towns`, why: "Real places and ten years of rain for the trip planner." },
  ];

  const CLEAN: Row[] = [
    { method: "Find rows by their label", does: "Search for the row that says \"Johor\" instead of trusting cell B12.", count: n(S.cells.read), unit: "cells read", why: "The sheets are laid out for printing, so positions shift from file to file." },
    { method: "Dashes stay empty", does: "\"-\" and \"n.a.\" become an empty cell, never 0.", count: n(S.cells.dash_to_empty), unit: "cells", share: S.cells.dash_to_empty / S.cells.read, why: "A dash means \"not published\". A zero would mean \"nobody came\"." },
    { method: "One code per state", does: "Every spelling is mapped to one 3-letter code.", count: `${S.spellings.variants} → ${S.spellings.codes}`, unit: "spellings", why: `"${S.spellings.examples.join("\" and \"")}" must be the same state, or tables from different agencies cannot be matched.` },
    { method: "Remove repeated state-years", does: "Two DOSM editions cover the same years. One copy is kept.", count: n(S.duplicates_removed), unit: `of ${n(dup.before)} removed`, share: S.duplicates_removed / dup.before, why: "Counting a state twice in one year would double its visitors." },
    { method: "Compare the two editions", does: "Where both editions give the same state and year, do the numbers agree?", count: n(Q.editions.differ), unit: `of ${n(Q.editions.checked)} differ`, share: Q.editions.differ / Q.editions.checked, why: "They agree everywhere, so dropping the repeated copy loses nothing." },
    { method: "Keep only the rows we need", does: "Drop the rows split by sex, age group or sub-total; keep the \"everyone\" row.", count: n(keptRows), unit: `of ${n(rawRows)} kept`, share: keptRows / rawRows, why: "Each state and year must appear exactly once, or the join would multiply rows." },
    { method: "Map points inside a state", does: "Each point is placed in the state whose border it falls inside; repeats are dropped.", count: n(S.osm.raw - S.osm.kept), unit: `of ${n(S.osm.raw)} removed`, share: (S.osm.raw - S.osm.kept) / S.osm.raw, why: "A point out at sea or listed twice cannot be counted for a state." },
    { method: "Range rules", does: "Percentages must be 0-100, counts cannot be negative, nights stayed must be believable.", count: n(Q.ranges.problems), unit: `problems in ${n(Q.ranges.checked)} values`, share: 0, why: "A value outside its range means we read the file wrongly. The pipeline stops if one appears." },
    { method: "Every state, every year", does: "Each year must hold exactly the 16 states, once each.", count: n(Q.completeness.problems), unit: `missing of ${n(Q.completeness.checked)}`, share: 0, why: "A missing or doubled state would bend every share and every ranking." },
    { method: "Totals must match the publisher", does: "Our 16 states added up = DOSM's national total; tourists + day-trippers = visitors; state rooms = Tourism Malaysia's total.", count: n(Q.reconcile.problems), unit: `failed of ${n(Q.reconcile.checked)} checks`, share: 0, why: `It proves nothing was lost or double-counted. ${S.reconcile.year}: ${n(S.reconcile.states_sum_k)} = ${n(S.reconcile.national_k)} thousand visitors.` },
    { method: "Outlier scan", does: "Flag any yearly jump in visitors far from the usual change (robust z-score above 3.5).", count: n(Q.outliers.flagged), unit: `of ${n(Q.outliers.checked)} flagged`, share: Q.outliers.flagged / Q.outliers.checked, why: `All are ${Q.outliers.years.join(", ")}: travel bouncing back after the pandemic. Real, so kept unchanged. A flag in a normal year would point to an error.` },
  ];

  const TEXT: Row[] = [
    { method: "Skip review sites", does: "Pages from TripAdvisor, Google Maps, Facebook, Instagram and TikTok are not read.", count: n(T.pages_blocked), unit: `of ${n(T.pages)} pages`, share: T.pages_blocked / T.pages, why: "Their terms do not allow reviews to be copied." },
    { method: "Drop junk paragraphs", does: "Menus, cookie notices, \"subscribe\", headings and one-liners under 40 characters.", count: n(T.paragraphs_junk), unit: `of ${n(T.paragraphs)}`, share: T.paragraphs_junk / T.paragraphs, why: "Most of a web page is not travel writing." },
    { method: "Drop very short comments", does: "Comments under 60 characters.", count: n(T.comments_short), unit: `of ${n(T.comments)}`, share: T.comments_short / T.comments, why: "\"Nice video!\" says nothing about a place." },
    { method: "Remove personal details", does: `Links ${n(T.scrubbed.links)}, e-mails ${n(T.scrubbed.emails)}, usernames ${n(T.scrubbed.usernames)}, phone numbers ${n(T.scrubbed.phones)}.`, count: n(scrubbed), unit: "removed", why: "Privacy. We need what was said, not who said it." },
    { method: "Cap long pages", does: "At most 6 passages are taken from one page.", count: n(T.passages_over_cap), unit: "passages left out", why: "One very long blog must not drown out a whole state." },
    { method: "Remove exact duplicates", does: "Same text after ignoring capitals, spaces and punctuation.", count: n(step("After removing exact duplicates").removed ?? 0), unit: `of ${n(start)}`, share: (step("After removing exact duplicates").removed ?? 0) / start, why: "A repeated post would count one opinion many times." },
    { method: "Remove near-duplicates", does: "Texts sharing at least 70% of their 5-word runs with an earlier text.", count: n(step("After removing near-duplicates").removed ?? 0), unit: "more removed", share: (step("After removing near-duplicates").removed ?? 0) / start, why: "The same article copied to a second site with a word changed." },
    { method: "AI filter: is this a real trip?", does: "Gemini 2.5 Flash Lite reads each text and answers from fixed lists.", count: n(step("AI says: a real trip").removed ?? 0), unit: "not a trip", share: (step("AI says: a real trip").removed ?? 0) / start, why: "Adverts, news and \"I want to go one day\" are not experiences." },
    { method: "Ask a second time", does: "The same yes/no question again, more strictly. Kept only on two yeses.", count: n(step("Yes on the second ask too").removed ?? 0), unit: "more removed", share: (step("Yes on the second ask too").removed ?? 0) / start, why: "One pass let too much chatter through. Fewer posts, but cleaner." },
    { method: "Wrong-state check", does: "If the place the AI found names a different state, the post is not counted.", count: n(step("About the right state").removed ?? 0), unit: "removed", share: (step("About the right state").removed ?? 0) / start, why: "A search for Sabah that returns a post about Kuala Lumpur must not score Sabah." },
    { method: "Steady small samples", does: "A topic with few mentions is pulled towards the national average.", count: n(176), unit: "state-topic scores", why: "Twelve posts should not decide whether a state is called safe." },
  ];

  const JOIN: Row[] = [
    { method: "Match by state code and year", does: "Every clean table is looked up for each of the 16 states. No state is ever dropped.", count: `${P.rows} × ${P.columns}`, unit: "rows × columns", why: "One table means every score is worked out from the same numbers." },
    { method: "Carry the latest year forward", does: "If a year is not published, use the most recent earlier year and record which year it was.", count: n(P.carried), unit: `of ${n(P.cells)} cells`, share: P.carried / P.cells, why: "DOSM's state spending stops at 2023. We say so on screen instead of guessing." },
    { method: "Never fill a gap", does: "A value that was never published stays empty.", count: n(P.empty), unit: "cells left empty", share: P.empty / P.cells, why: "An invented number looks as real as a true one. Almost all are 2021 detail DOSM did not publish." },
  ];

  const PUBLISH: Row[] = [
    { method: "Open formulas", does: "Gini, Opportunity, Bottleneck Diagnoser, Room to grow, Simulator.", count: "5", unit: "scores", why: "Anyone can check by hand why a state ranks where it does. Steps are on the Methodology page." },
    { method: "Shake the weights", does: `Re-rank the states ${n(robustness.draws)} times with random weights.`, count: robustness.spearman_median.toFixed(2), unit: "of 1 agreement", share: robustness.spearman_median, why: "The ranking must not depend on the weights we happened to choose." },
    { method: "Automatic tests", does: `${tests.python} on the data and the maths, ${tests.web} on the website.`, count: n(tests.python + tests.web), unit: "must pass", why: "If one fails, nothing is published." },
    { method: "Two calculators must agree", does: "The website recalculates every score live; its answers are compared with Python's.", count: "5", unit: "decimal places", why: "So the screen can never drift from the pipeline." },
    { method: "Ship small files", does: "The final table and scores are exported as JSON with the website. No database.", count: n(audit.published_files), unit: "files", why: "Nothing to log in to, nothing to go down." },
  ];

  return (
    <>
      <PageHeader eyebrow="From raw files to this screen" title="The data pipeline, step by step">
        For every step: the methods we used, how much each one caught, and why. Every count is measured by re-running the cleaning code on the raw files.
      </PageHeader>

      <div className="mt-5" data-guide-say="This page is the journey of the data. Read it top to bottom: each row is one cleaning method, how much it caught, and why we do it.">
        <Stage step={1} icon={Download} title="Extract" line="Get the data. Everything is public. Raw files are kept unedited, each logged with its link, date and fingerprint." result={`${n(raw.logged_downloads)} downloads logged`}>
          <Ledger rows={EXTRACT} head={["Source", "How we got it", "Got", "Used for"]} />
        </Stage>

        <Stage step={2} icon={Eraser} title="Clean the official tables" line="Turn print-style spreadsheets into tidy tables, then prove nothing went wrong." result={`${facts.tables.count} clean tables`}>
          <Ledger rows={CLEAN} />
        </Stage>

        <Stage step={3} icon={MessagesSquare} title="Clean and read the travel posts" line="Most of what we collected is thrown away on purpose. Each method below removes one kind of noise." result={`${n(start)} texts → ${n(end)} real trips`}>
          <Ledger rows={TEXT} />
        </Stage>

        <Stage step={4} icon={Combine} title="Join into one table" line="One row for each state in each year, 2021 to 2025. Everything on the dashboard is calculated from it." result={`${n(P.cells)} values`}>
          <Ledger rows={JOIN} />
          <button onClick={() => setCells(!cells)} aria-expanded={cells} className="group mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
            <ChevronDown className={cn("size-3.5 transition-transform", cells && "rotate-180")} />{cells ? "Hide" : "See"} every cell
          </button>
          <AnimatePresence initial={false}>
            {cells && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }} className="overflow-hidden"><CellMap /></motion.div>}
          </AnimatePresence>
        </Stage>

        <Stage step={5} icon={Rocket} title="Score, test and publish" line="The table becomes scores, the scores are tested, and small files go to the website." result={`${n(G.placed)} trip places, ${n(end)} posts, 16 states`} last>
          <Ledger rows={PUBLISH} />
        </Stage>
      </div>

      <p className="text-[11px] text-muted-foreground">Counted from the pipeline&apos;s files on {facts.generated}.</p>
    </>
  );
}
