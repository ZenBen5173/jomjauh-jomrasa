"use client";

/**
 * The pipeline as pictures of the real data: what came in, what each cleaning step removed, what was left.
 * Every number is measured, not written: public/data/pipeline_audit.json is produced by pipeline/audit.py, which
 * replays the cleaning code on the raw files with counters attached; pipeline.json holds file, table and test counts.
 */
import { useState } from "react";
import { motion } from "motion/react";
import { Check, Combine, Download, Eraser, Equal, Rocket, Ruler, ShieldCheck } from "lucide-react";
import facts from "../../../../public/data/pipeline.json";
import audit from "../../../../public/data/pipeline_audit.json";
import { PageHeader } from "@/components/shell";
import { SpotlightCard } from "@/components/spotlight-card";
import StatsCounter from "@/components/ui/stats-counter";
import { STATE_LABEL } from "@/lib/data";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;
const n = (v: number) => v.toLocaleString("en-MY");
const { raw, tables, tests } = facts;
const { structured: S, text: T, panel: P, guide: G } = audit;

function Section({ step, title, children, say }: { step: number; title: string; children: React.ReactNode; say: string }) {
  return (
    <motion.section initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, ease: EASE }} data-guide-say={say} className="mt-7">
      <div className="mb-2.5 flex items-center gap-3">
        <span className="grid size-6 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">{step}</span>
        <h2 className="min-w-0 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground sm:shrink-0">{title}</h2>
        <span className="hidden h-px flex-1 bg-border sm:block" />
      </div>
      {children}
    </motion.section>
  );
}

function Tile({ label, value, sub, className, children }: { label: string; value?: number; sub?: string; className?: string; children?: React.ReactNode }) {
  return (
    <SpotlightCard className={cn("p-4", className)}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      {value !== undefined && <p className="mt-1 text-2xl font-semibold leading-none tracking-tight"><StatsCounter value={value} duration={0.9} /></p>}
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      {children}
    </SpotlightCard>
  );
}

/** Two bars on one scale: what came in, and what was kept. Log scale when the drop is huge. */
function BeforeAfter({ label, before, after, note, log }: { label: string; before: number; after: number; note: string; log?: boolean }) {
  const w = (v: number) => (log ? Math.log10(v + 1) / Math.log10(before + 1) : v / before) * 100;
  return (
    <div className="group">
      <div className="flex flex-col gap-x-3 text-[13px] sm:flex-row sm:items-baseline sm:justify-between"><span className="font-medium">{label}</span><span className="text-xs text-muted-foreground">{note}</span></div>
      <div className="mt-1.5 space-y-1">
        {[{ v: before, tone: "bg-foreground/15", tag: "in" }, { v: after, tone: "bg-primary", tag: "kept" }].map((b) => (
          <div key={b.tag} className="flex items-center gap-2">
            <span className="w-7 text-[10px] uppercase tracking-wider text-muted-foreground">{b.tag}</span>
            <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-muted/40">
              <motion.div initial={{ width: 0 }} whileInView={{ width: `${Math.max(w(b.v), 1.5)}%` }} viewport={{ once: true }} transition={{ duration: 0.9, ease: EASE }} className={cn("h-full rounded-full transition-[filter] group-hover:brightness-125", b.tone)} />
            </div>
            <span className="w-16 text-right text-xs tabular-nums">{n(b.v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const FLOW = [
  { icon: Download, name: "Extract", big: raw.logged_downloads, unit: "downloads logged" },
  { icon: Eraser, name: "Clean", big: tables.count, unit: "tidy tables" },
  { icon: Combine, name: "Join", big: P.rows, unit: `rows × ${P.columns} columns` },
  { icon: Ruler, name: "Score", big: 5, unit: "open formulas" },
  { icon: ShieldCheck, name: "Check", big: tests.python + tests.web, unit: "automatic tests" },
  { icon: Rocket, name: "Publish", big: audit.published_files, unit: "small data files" },
];

const KIND = { f: { name: "From that year", cls: "fill-primary" }, c: { name: "Carried from an earlier year", cls: "fill-primary/35" }, e: { name: "Not published", cls: "fill-foreground/10" } } as const;
const pretty = (col: string) => col.replace(/_/g, " ").replace(/\b(rm|k|n|pct)\b/g, "").trim();

/** Every cell of the joined table, drawn. 80 state-years across, 48 values down. */
function CellMap() {
  const [hover, setHover] = useState<string | null>(null);
  const size = 9, tall = 6, gap = 1.5, yearGap = 10;
  const years = [...new Set(P.map.map((r) => r.year))];
  const x = (i: number) => i * (size + gap) + years.indexOf(P.map[i].year) * yearGap;
  const width = x(P.map.length - 1) + size, height = P.column_names.length * (tall + gap);
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
      <div className="overflow-x-auto">
        <svg viewBox={`0 -16 ${width} ${height + 16}`} className="w-full min-w-[640px]" role="img" aria-label="Every cell of the joined table: filled, carried forward or not published">
          {years.map((y) => { const i = P.map.findIndex((r) => r.year === y); return <text key={y} x={x(i)} y={-5} className="fill-muted-foreground text-[9px]">{y}</text>; })}
          {P.map.map((row, i) => (
            <motion.g key={`${row.year}${row.code}`} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.008, duration: 0.3 }}>
              {[...row.cells].map((k, j) => (
                <rect key={j} x={x(i)} y={j * (tall + gap)} width={size} height={tall} rx={1.5} className={cn(KIND[k as keyof typeof KIND].cls, "transition-opacity hover:opacity-60")}
                  onMouseEnter={() => setHover(`${STATE_LABEL[row.code] ?? row.code} ${row.year} · ${pretty(P.column_names[j])} · ${KIND[k as keyof typeof KIND].name.toLowerCase()}`)} onMouseLeave={() => setHover(null)} />
              ))}
            </motion.g>
          ))}
        </svg>
      </div>
      <div className="space-y-4 text-xs">
        <div className="space-y-1.5">
          {([["f", P.cells - P.carried - P.empty], ["c", P.carried], ["e", P.empty]] as const).map(([k, v]) => (
            <p key={k} className="flex items-center gap-2"><svg width="10" height="10"><rect width="10" height="10" rx="2" className={KIND[k].cls} /></svg>{KIND[k].name}<span className="ml-auto font-medium tabular-nums">{n(v)}</span></p>
          ))}
        </div>
        <div className="space-y-2 border-t border-border pt-3">
          {P.years.map((y) => { const t = y.filled + y.carried + y.empty; return (
            <div key={y.year} className="flex items-center gap-2"><span className="w-8 tabular-nums text-muted-foreground">{y.year}</span>
              <span className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
                <motion.span initial={{ width: 0 }} whileInView={{ width: `${(y.filled / t) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8, ease: EASE }} className="bg-primary" />
                <motion.span initial={{ width: 0 }} whileInView={{ width: `${(y.carried / t) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8, ease: EASE }} className="bg-primary/35" />
              </span><span className="w-9 text-right tabular-nums">{Math.round((y.filled / t) * 100)}%</span></div>
          ); })}
        </div>
        <p className="min-h-10 border-t border-border pt-3 leading-snug text-muted-foreground">{hover ?? "Hover a square to see what it is."}</p>
      </div>
    </div>
  );
}

export default function Pipeline() {
  const top = T.funnel[0].n;
  const langs = Object.entries(T.by_language).filter(([, v]) => v > 5);
  const langTotal = langs.reduce((a, [, v]) => a + v, 0);
  const LANG: Record<string, string> = { en: "English", ms: "Malay", zh: "Chinese", mixed: "Mixed" };
  return (
    <>
      <PageHeader eyebrow="From raw files to this screen" title="Where do these numbers come from?" />

      {/* the whole pipeline in one strip */}
      <div className="relative grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6" data-guide-say="This is the whole journey in six steps. Every number on this page was counted from the real files, not typed in.">
        {FLOW.map((f, i) => (
          <motion.div key={f.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 * i, duration: 0.45, ease: EASE }}>
            <SpotlightCard className="group h-full p-4">
              <p className="flex items-center gap-2 text-xs text-muted-foreground"><span className="grid size-6 place-items-center rounded-full border border-border text-[10px] font-semibold transition-colors group-hover:border-primary group-hover:text-primary">{i + 1}</span>{f.name}<f.icon className="ml-auto size-3.5 opacity-40 transition-opacity group-hover:opacity-100" /></p>
              <p className="mt-2 text-2xl font-semibold leading-none tracking-tight"><StatsCounter value={f.big} duration={0.9} /></p>
              <p className="mt-1 text-xs text-muted-foreground">{f.unit}</p>
            </SpotlightCard>
          </motion.div>
        ))}
      </div>

      <Section step={1} title="Extract" say="Step one: go and get the data. It is all public, and we keep every original file untouched.">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <Tile label="DOSM" value={raw.dosm_files} sub="spreadsheets" />
          <Tile label="data.gov.my" value={raw.datagovmy_files} sub="tables" />
          <Tile label="Tourism Malaysia" value={raw.tourism_malaysia_files} sub="tables" />
          <Tile label="OpenStreetMap" value={S.osm.raw} sub="map points" />
          <Tile label="Web pages" value={T.pages} sub={`from ${n(T.searches)} searches`} />
          <Tile label="Video comments" value={T.comments} sub="YouTube" />
        </div>
      </Section>

      <Section step={2} title="Clean the official tables" say="Step two: tidy up the official tables. Grey is what came in, blue is what we kept.">
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <SpotlightCard className="p-5"><div className="space-y-5">
            <BeforeAfter label="Visitors by state" before={S.duplicates[0]?.before ?? 0} after={S.duplicates[0]?.after ?? 0} note={`${n(S.duplicates_removed)} duplicates removed (same year in two editions)`} />
            {S.filters.map((f) => <BeforeAfter key={f.label} label={f.label} before={f.raw} after={f.kept} note="kept only the rows we need" log />)}
            <BeforeAfter label="Map points" before={S.osm.raw} after={S.osm.kept} note={`${n(S.osm.raw - S.osm.kept)} outside every state or repeated`} />
          </div></SpotlightCard>
          <div className="grid grid-cols-2 content-start gap-2">
            <Tile label="Spreadsheet cells read" value={S.cells.read} sub={`${n(S.cells.dash_to_empty)} dashes left empty, never 0`} />
            <Tile label="State spellings" value={S.spellings.variants} sub={`became ${S.spellings.codes} codes`}>
              <p className="mt-2 flex flex-wrap items-center gap-1 text-[11px]">{S.spellings.examples.map((e) => <span key={e} className="rounded-md border border-border px-1.5 py-0.5 text-muted-foreground">{e}</span>)}<span className="rounded-md bg-primary px-1.5 py-0.5 font-medium text-primary-foreground">PNG</span></p>
            </Tile>
            <SpotlightCard className="col-span-2 p-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Do the {P.states} states add up? ({S.reconcile.year}, thousand visitors)</p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xl font-semibold tabular-nums tracking-tight">
                <span>{n(S.reconcile.states_sum_k)}<span className="block text-[11px] font-normal text-muted-foreground">our 16 states added up</span></span>
                <Equal className="size-5 text-primary" />
                <span>{n(S.reconcile.national_k)}<span className="block text-[11px] font-normal text-muted-foreground">DOSM&apos;s national total</span></span>
                <motion.span initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ type: "spring", stiffness: 300, damping: 16, delay: 0.4 }} className="ml-auto grid size-8 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-4" /></motion.span>
              </div>
            </SpotlightCard>
            <SpotlightCard className="col-span-2 p-4"><div className="space-y-5">
              <BeforeAfter label="Trip guide listings" before={G.listings} after={G.from_wikivoyage} note="kept only places we could put on a map" />
            </div></SpotlightCard>
          </div>
        </div>
      </Section>

      <Section step={3} title="Clean and read the travel posts" say="Step three: the travel posts. Each bar is what was left after a step. Most of what we collected was thrown away on purpose.">
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <SpotlightCard className="p-5">
            <ol className="space-y-2.5">
              {T.funnel.map((f, i) => (
                <li key={f.label} className="group">
                  {"removed" in f && <p className="mb-1.5 pl-1 text-[11px] text-muted-foreground">− {n(f.removed ?? 0)} {f.why}</p>}
                  <p className="mb-1 flex items-baseline justify-between gap-3 text-[13px]"><span className="font-medium">{f.label}</span><span className="font-semibold tabular-nums">{n(f.n)}</span></p>
                  <div>
                    <div className="h-5 overflow-hidden rounded-md bg-muted/40">
                      <motion.div initial={{ width: 0 }} whileInView={{ width: `${(f.n / top) * 100}%` }} viewport={{ once: true }} transition={{ delay: 0.08 * i, duration: 0.9, ease: EASE }}
                        className="h-full rounded-md transition-[filter] group-hover:brightness-125" style={{ background: `color-mix(in oklab, var(--primary) ${45 + 55 * (i / (T.funnel.length - 1))}%, #1c1d22)` }}>
                      </motion.div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </SpotlightCard>
          <div className="grid grid-cols-2 content-start gap-2">
            <Tile label="Junk paragraphs dropped" value={T.paragraphs_junk} sub={`of ${n(T.paragraphs)} (menus, cookie notices)`} className="col-span-2" />
            <Tile label="Short comments dropped" value={T.comments_short} sub="under 60 characters" />
            <Tile label="Review sites blocked" value={T.pages_blocked} sub="pages skipped" />
            <SpotlightCard className="col-span-2 p-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Removed for privacy</p>
              <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                {Object.entries(T.scrubbed).map(([k, v]) => <div key={k}><p className="text-base font-semibold tabular-nums">{n(v)}</p><p className="text-[11px] text-muted-foreground">{k}</p></div>)}
              </div>
            </SpotlightCard>
            <SpotlightCard className="col-span-2 p-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Language of the {n(T.funnel[T.funnel.length - 1].n)} kept</p>
              <div className="mt-2 flex h-3 overflow-hidden rounded-full">
                {langs.map(([k, v], i) => <motion.div key={k} initial={{ width: 0 }} whileInView={{ width: `${(v / langTotal) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.9, ease: EASE }} className="bg-primary" style={{ opacity: 1 - i * 0.22 }} />)}
              </div>
              <p className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">{langs.map(([k, v]) => <span key={k}>{LANG[k] ?? k} {Math.round((v / langTotal) * 100)}%</span>)}</p>
            </SpotlightCard>
          </div>
        </div>
      </Section>

      <Section step={4} title={`Join: every cell of the final table (${P.rows} rows × ${P.value_columns} values)`} say="Step four: everything in one table. Each little square is one number. Pale squares are borrowed from an earlier year, and we say so. We never make a number up.">
        <SpotlightCard className="p-5"><CellMap /></SpotlightCard>
      </Section>

      <Section step={5} title="Score, check and publish" say="Last steps: the scores are open formulas, the AI only reads the travel posts, and nothing is published unless every test passes.">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Tile label="Dashboard scores" value={5} sub="open formulas, no AI" />
          <Tile label="Posts read by AI" value={T.funnel[2].n} sub="Gemini 2.5 Flash Lite, ready-made" />
          <Tile label="Trip places" value={G.placed} sub={`from ${n(G.listings)} listings; only ones we could put on a map`} />
          <Tile label="Tests passed" value={tests.python + tests.web} sub={`${tests.python} on the data, ${tests.web} on the website`} />
        </div>
      </Section>

      <p className="mt-6 text-[11px] text-muted-foreground">Counted from the pipeline&apos;s files on {facts.generated}. Formulas and sources are on the Methodology page.</p>
    </>
  );
}
