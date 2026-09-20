"use client";

/**
 * The pipeline, start to finish, in everyday words: where the data comes from, how it is cleaned and checked,
 * how the scores are worked out, where AI is used and how we know it works, and how it reaches this screen.
 * Every count on this page is read from public/data/pipeline.json, which the Python pipeline writes from the
 * files on disk (pipeline/export_pipeline.py) - so the page cannot drift from what was actually run.
 */
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Combine, Download, Eraser, MessagesSquare, Rocket, Route, Ruler, ShieldCheck } from "lucide-react";
import facts from "../../../../public/data/pipeline.json";
import { PageHeader } from "@/components/shell";
import { SpotlightCard } from "@/components/spotlight-card";
import StatsCounter from "@/components/ui/stats-counter";
import { STATE_LABEL } from "@/lib/data";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;
const n = (v: number) => v.toLocaleString("en-MY");
const pct = (v: number) => `${Math.round(v * 100)}%`;
const { raw, tables, text, robustness, guide, tests } = facts;
const r1 = text.round1, r2 = text.round2;

interface Stage { id: string; icon: React.ReactNode; name: string; line: string; big: number; unit: string; points: [string, string][]; guard: string; files: string[]; say: string }

const STAGES: Stage[] = [
  {
    id: "collect", icon: <Download className="size-4" />, name: "Collect", line: "We download the raw files and never edit them.", big: raw.logged_downloads, unit: "downloads, each one logged",
    points: [
      ["DOSM (OpenDOSM)", `${raw.dosm_files} spreadsheets: how many people visit each state, what they spend, and which state they come from.`],
      ["data.gov.my", `${raw.datagovmy_files} tables: population, income, poverty, basic amenities and the size of each state's economy.`],
      ["Tourism Malaysia", `${raw.tourism_malaysia_files} tables: hotels, rooms and how full they are, read from their public dashboard.`],
      ["OpenStreetMap", `${n(raw.osm_points)} sights, airports and stations, ${n(raw.osm_hotels)} hotels and ${n(raw.osm_eateries)} eateries.`],
      ["What travellers wrote", `${n(text.collected)} public travel posts and video comments in Malay, English and Chinese.`],
      ["Wikivoyage and rainfall", `${raw.wikivoyage_pages} town pages written by travellers, and ten years of daily rain for ${raw.rainfall_towns} towns.`],
    ],
    guard: "Every file is logged with its web address, the date and a digital fingerprint, so anyone can check we did not change it.",
    files: ["pipeline/extract.py", "pipeline/extract_powerbi.py", "pipeline/extract_osm.py", "pipeline/text/collect.py", "pipeline/guide/collect.py"],
    say: "Step one: go and get the data. Everything is public, and we keep the original files untouched with a note of where and when we got each one.",
  },
  {
    id: "clean", icon: <Eraser className="size-4" />, name: "Clean", line: "Messy spreadsheets become tidy tables.", big: tables.count, unit: `tidy tables, ${n(tables.rows)} rows`,
    points: [
      ["Made for reading, not for computers", "Government spreadsheets have titles, merged cells and totals in odd places. We pull out just the numbers and label them."],
      ["One name per state", "\"Pulau Pinang\", \"Penang\" and \"P. Pinang\" all become one code, so tables from different agencies can be joined."],
      ["No personal details", "Usernames and profile links are stripped from travel posts. We keep only the text, the state, the link, the date and the language."],
      ["A mistake we caught", "One file's total row was shifted by a column, which made the states look 30 million visits short. They actually add up exactly."],
    ],
    guard: "Cleaning is code, not hand-editing, so it can be re-run from the raw files at any time and gives the same answer.",
    files: ["pipeline/transform_structured.py", "pipeline/text/prepare.py", "pipeline/states.py"],
    say: "Step two: tidy up. Official spreadsheets are laid out for people to read. We turn them into plain tables a computer can add up.",
  },
  {
    id: "check", icon: <ShieldCheck className="size-4" />, name: "Check", line: "Automatic checks stop bad data getting through.", big: tests.python, unit: "checks on the data and the maths",
    points: [
      ["The states must add up", "The 16 states' visitors must equal DOSM's national total exactly. If they ever differ, the pipeline stops."],
      ["Nothing missing, nothing silly", "Every year has exactly the 16 states, nothing is negative, and every figure sits in a sensible range."],
      ["The maths is tested too", "Each score is checked against small examples worked out by hand."],
      ["Privacy is tested", "A check fails if anything that looks like a username survives in the travel posts."],
    ],
    guard: "These run every time the pipeline runs. A red check means nothing gets published.",
    files: ["tests/test_clean_tables.py", "tests/test_metrics.py", "tests/test_text.py", "tests/test_guide.py"],
    say: "Step three: trust, but verify. Dozens of automatic checks run every time. If the states stop adding up to the national total, everything stops.",
  },
  {
    id: "combine", icon: <Combine className="size-4" />, name: "Combine", line: "Everything joins into one row per state per year.", big: tables.panel_rows, unit: `rows x ${tables.panel_columns} columns`,
    points: [
      ["One big table", "Visitors, spending, hotels, people, attractions and traveller opinions sit side by side for each state and year."],
      ["Fair comparisons", "We work out visitors per resident and per square kilometre, so small states are not judged against big ones on size alone."],
      ["Honest about gaps", "DOSM has state-level spending only up to 2023. For later years we reuse the 2023 spend per visitor and label it as an estimate."],
    ],
    guard: "The join is by state code and year only, and a check confirms no state is dropped or doubled.",
    files: ["pipeline/build_panel.py"],
    say: "Step four: put it all in one table. One row for each state in each year, with everything we know about it side by side.",
  },
  {
    id: "measure", icon: <Ruler className="size-4" />, name: "Measure", line: "Open formulas turn the table into answers.", big: 5, unit: "measures, all simple enough to check by hand",
    points: [
      ["How lopsided?", "The Gini number: 0 means visitors are spread evenly, 1 means everyone goes to one state."],
      ["Opportunity", "What a state can offer (rooms, attractions, spending, how much travellers enjoy it) minus how visited it already is."],
      ["What holds it back", "The weakest of three things - getting there, being known, places to stay - but only if it is below the typical state."],
      ["Room to grow", "Empty hotel room-nights turned into extra visitors, stopping when hotels would be 75% full."],
      ["What if?", "Move visitors from a crowded state to quiet ones. If one runs out of rooms, the overflow goes to the others, and whatever still does not fit stays put."],
    ],
    guard: `No machine learning here, on purpose: a planner must be able to see why a state ranks where it does. We shuffled the weights ${n(robustness.draws)} times and the ranking stayed almost the same (${robustness.spearman_median.toFixed(2)} out of 1). ${STATE_LABEL[robustness.top5[0].code]} stayed in the top five ${pct(robustness.top5[0].share)} of the time.`,
    files: ["core/metrics.py", "web/src/lib/metrics.ts"],
    say: "Step five: the scores. These are plain formulas, not a black box, so anyone can see why a state ranks where it does. We also shook the weights a thousand times to make sure the ranking holds.",
  },
  {
    id: "read", icon: <MessagesSquare className="size-4" />, name: "Read travellers", line: "An AI reads what travellers wrote, in three languages.", big: text.kept, unit: `real trip stories kept, out of ${n(text.collected)}`,
    points: [
      ["The model", "Google Gemini 2.5 Flash Lite, a ready-made language model. We did not train it; we gave it a fixed form to fill in."],
      ["What it fills in", `For each post: is this a real trip? Which place? Which of ${text.topics} topics (food, scenery, cleanliness...)? Good or bad? Which of ${text.emotions} feelings?`],
      ["A second look", "A second pass throws out posts that are not trips, like \"nice video!\" or \"I want to go one day\". That is why fewer than half are kept."],
      ["Small samples are steadied", "A state with only a few posts is pulled towards the national average, so five angry comments cannot sink it."],
    ],
    guard: `We checked it against a stronger AI (Anthropic Claude) that labelled ${r2.n} fresh posts without seeing the first model's answers. They agreed on ${pct(r2.travel_filter_accuracy)} of "is this a real trip", ${pct(r2.polarity_accuracy)} of good-or-bad, ${pct(r2.main_topic_recall)} of the main topic and ${pct(r2.emotion_accuracy)} of the feeling. This is two AIs agreeing, not people marking it.`,
    files: ["pipeline/text/tag.py", "pipeline/text/verify.py", "pipeline/text/score.py"],
    say: "Step six: the AI part. A language model reads thousands of travel posts and fills in a form for each one. We then checked its answers against a stronger AI.",
  },
  {
    id: "plan", icon: <Route className="size-4" />, name: "Plan trips", line: "An AI plans the days, but only from real places.", big: guide.places, unit: `real places in ${guide.towns} towns, plus ${n(guide.stays)} places to sleep`,
    points: [
      ["Real places only", "Sights and eateries come from Wikivoyage, written by travellers and locals. Hotels and a few extra eateries come from OpenStreetMap."],
      ["The AI chooses, we check", "The model picks places from our list and puts them in order. If it names anything not on the list, we throw it away."],
      ["Hard limits are ours, not the AI's", "For \"no pork\" or \"with kids\", unsuitable places are removed before the AI even sees the list. We learned this the hard way in testing."],
      ["We do the maths", "Clock times, travel time between stops and the hotel closest to the plan are worked out by our code, never guessed by the AI."],
      ["If the AI is down", "A rule-based planner takes over: it groups nearby sights into days (k-means clustering) and finds the shortest route."],
    ],
    guard: `When to go comes from ten years of real rainfall. ${guide.street_located} eateries are pinned to their street rather than their door, and the app says so.`,
    files: ["pipeline/guide/build.py", "pipeline/guide/seasons.py", "web/src/app/api/plan/route.ts", "web/src/lib/trip.ts"],
    say: "Step seven: the trip planner. The AI is like a friend choosing from a menu we wrote. It can pick and arrange, but it cannot add a dish that is not on the menu.",
  },
  {
    id: "publish", icon: <Rocket className="size-4" />, name: "Publish", line: "Small files go to the website, which does the same maths live.", big: tests.web, unit: "checks on the website",
    points: [
      ["No database", "The pipeline writes small data files that ship with the website. There is nothing to log in to and nothing to go down."],
      ["Live maths", "When you drag a slider, the website recalculates the scores itself, using the same formulas as the pipeline."],
      ["Two calculators must agree", "The website's answers must match the pipeline's to five decimal places, or the checks fail."],
      ["Always current", "Every change to the code is rebuilt and published automatically."],
    ],
    guard: "This page reads its numbers from a file the pipeline writes, so it always describes what was really run.",
    files: ["pipeline/export_web.py", "pipeline/export_pipeline.py", "web/src/lib/metrics.test.ts"],
    say: "Last step: publish. The website gets small data files and redoes the maths live when you move a slider. Its answers have to match the pipeline's exactly.",
  },
];

const MODELS: { model: string; kind: string; job: string; proof: string }[] = [
  { model: "Opportunity, Bottleneck, Room to grow, Simulator, Gini", kind: "Open formulas (statistics)", job: "JomJauh: every score on the dashboard",
    proof: `Not machine learning, on purpose. Checked by hand-worked examples, and the ranking holds when the weights are shuffled ${n(robustness.draws)} times (${robustness.spearman_median.toFixed(2)} out of 1; never below ${robustness.leave_one_out_min.toFixed(2)} when any one ingredient is removed).` },
  { model: "Google Gemini 2.5 Flash Lite", kind: "Ready-made language model", job: `JomRasa: reads ${n(text.collected)} travel posts and tags place, topic, feeling and good-or-bad`,
    proof: `Against a stronger AI on ${r2.n} fresh posts: real-trip filter ${pct(r2.travel_filter_accuracy)}, good-or-bad ${pct(r2.polarity_accuracy)}, main topic ${pct(r2.main_topic_recall)}, feeling ${pct(r2.emotion_accuracy)}. The first round scored ${pct(r1.travel_filter_accuracy)} on the filter, so we added the second pass.` },
  { model: "Google Gemini 2.5 Flash Lite", kind: "Ready-made language model", job: "Trip chat: turns a traveller's sentence into preferences", proof: "Not scored. It only fills in a form; the answer itself is built from our data. If it fails, keyword rules take over and the app says so." },
  { model: "Google Gemini 2.5 Flash Lite", kind: "Ready-made language model", job: "Trip planner: chooses and orders real places",
    proof: "Not scored - there is no single right itinerary. It is fenced in instead: it cannot add places, limits like \"no pork\" are enforced by our code, and forgotten meals are filled in. All of this is covered by automatic checks." },
  { model: "k-means clustering", kind: "Machine learning (no training data needed)", job: "Backup trip planner: groups nearby sights into days", proof: "Checked that places close together land on the same day and that the same request always gives the same plan." },
  { model: "Anthropic Claude", kind: "Stronger language model", job: "Referee only: labelled sample posts to check the tagging. Not used in the live app.", proof: "It labelled without seeing the first model's answers. It is still an AI, so we report agreement, not accuracy." },
];

export default function Pipeline() {
  const [active, setActive] = useState(0);
  const s = STAGES[active];
  return (
    <>
      <PageHeader eyebrow="From raw files to this screen" title="Where do these numbers come from?" />

      <div className="grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)]">
        <nav aria-label="Pipeline steps" className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] xl:flex-col xl:overflow-visible xl:pb-0">
          {STAGES.map((st, i) => (
            <motion.button key={st.id} onClick={() => setActive(i)} data-guide-say={st.say} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i, duration: 0.45, ease: EASE }}
              className={cn("group relative flex shrink-0 items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors xl:w-full", i === active ? "border-primary/60 bg-card" : "border-border bg-card/40 hover:border-foreground/25")}>
              {i === active && <motion.span layoutId="pipe-active" className="absolute inset-y-3 left-0 w-[3px] rounded-full bg-primary" transition={{ type: "spring", stiffness: 320, damping: 28 }} />}
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-full border text-xs font-semibold transition-colors", i < active ? "border-primary/40 bg-primary/15 text-primary" : i === active ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>
                {i < active ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-medium">{st.name}<span className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">{st.icon}</span></span>
                <span className="hidden text-xs leading-snug text-muted-foreground xl:block">{st.line}</span>
              </span>
            </motion.button>
          ))}
        </nav>

        <AnimatePresence mode="wait">
          <motion.section key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25, ease: EASE }} className="min-w-0 self-start rounded-2xl border border-border bg-card p-5 md:p-6">
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-primary">{s.icon}Step {active + 1} of {STAGES.length}</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight">{s.name}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{s.line}</p>
              </div>
              <p className="text-right"><span className="block text-3xl font-semibold leading-none tracking-tight"><StatsCounter key={s.id} value={s.big} duration={0.8} /></span><span className="text-xs text-muted-foreground">{s.unit}</span></p>
            </div>

            <ul className="mt-5 grid gap-x-8 gap-y-3.5 md:grid-cols-2">
              {s.points.map(([h, t], i) => (
                <motion.li key={h} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + 0.04 * i, duration: 0.35, ease: EASE }}>
                  <p className="text-sm font-medium">{h}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{t}</p>
                </motion.li>
              ))}
            </ul>

            <p className="mt-5 flex gap-2.5 rounded-xl bg-muted/50 px-4 py-3 text-[13px] leading-relaxed"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /><span><span className="font-medium">How we keep it honest. </span><span className="text-muted-foreground">{s.guard}</span></span></p>

            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Code:</span>
              {s.files.map((f) => <code key={f} className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{f}</code>)}
              <span className="ml-auto flex gap-2">
                <button disabled={active === 0} onClick={() => setActive(active - 1)} className="rounded-lg border border-border px-3 py-1.5 text-xs transition-colors enabled:hover:border-foreground/30 disabled:opacity-40">Back</button>
                <button disabled={active === STAGES.length - 1} onClick={() => setActive(active + 1)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-transform enabled:active:scale-[0.97] disabled:opacity-40">Next step</button>
              </span>
            </div>
          </motion.section>
        </AnimatePresence>
      </div>

      <div className="mb-2.5 mt-6 flex items-center gap-3">
        <h2 className="shrink-0 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Which models, and how do we know they work?</h2>
        <span className="h-px flex-1 bg-border" />
      </div>
      <SpotlightCard className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead><tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">{["Model", "What kind", "Its job", "How we know it works"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {MODELS.map((m, i) => (
              <motion.tr key={m.job} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + 0.05 * i, duration: 0.4, ease: EASE }} className="border-b border-border/60 align-top last:border-0 hover:bg-accent/40">
                <td className="px-4 py-3 font-medium">{m.model}</td><td className="px-4 py-3 text-muted-foreground">{m.kind}</td><td className="px-4 py-3">{m.job}</td><td className="px-4 py-3 leading-relaxed text-muted-foreground">{m.proof}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </SpotlightCard>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        We did not train a machine-learning model of our own. JomJauh&apos;s scores are open formulas; the AI is a ready-made language model that we checked and fenced in.
        Counts on this page were read from the pipeline&apos;s files on {facts.generated}. Full formulas and sources are on the Methodology page.
      </p>
    </>
  );
}
