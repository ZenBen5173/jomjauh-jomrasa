"use client";

/**
 * Traveller app: a conversation, not a dashboard. One input, plain answers, destination cards.
 * A language model works out what the traveller means; every fact shown comes from the data.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, RotateCcw } from "lucide-react";
import { DestinationCard, StateCard } from "@/components/trip/cards";
import { FlipFadeText } from "@/components/ui/flip-fade-text";
import { GenerateButton } from "@/components/ui/generate-button";
import { EMPTY_PREFS, type Reply, type Understanding, langOf, respond, understandLocally } from "@/lib/chat";
import { JR } from "@/lib/jomrasa";
import { EXAMPLES, type Prefs } from "@/lib/planner";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;
type Via = "ai" | "example" | "keywords";
type Msg = { id: number; role: "user"; text: string } | { id: number; role: "assistant"; reply: Reply; via: Via };
const STARTERS = [EXAMPLES[0].text, EXAMPLES[1].text, EXAMPLES[2].text, "Tell me about Terengganu", EXAMPLES[3].text];

export default function Trip() {
  const { rows, gap } = useStore();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [prefs, setPrefs] = useState<Prefs>(EMPTY_PREFS);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const started = msgs.length > 0;

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);

  async function send(raw: string) {
    const t = raw.trim();
    if (!t || busy) return;
    setText("");
    setMsgs((m) => [...m, { id: Date.now(), role: "user", text: t }]);
    setBusy(true);
    let u: Understanding, via: Via = "keywords";
    const example = EXAMPLES.find((e) => e.text === t);
    if (example) {
      u = { intent: "recommend", state: null, topic: null, prefs: example.prefs };
      via = "example";          // pre-computed: instant, works offline
    } else {
      try {
        const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t.slice(0, 400), prefs }) });
        if (!r.ok) throw new Error();
        u = (await r.json()) as Understanding;
        if (u.intent === "recommend" && !Object.keys(u.prefs.topics).length && !u.prefs.budget && !u.prefs.region) throw new Error();
        via = "ai";
      } catch {
        u = understandLocally(t, prefs);                                                      // keyword rules: no network needed
      }
    }
    if (u.intent === "recommend") setPrefs(u.prefs);
    const reply = respond(u, rows, gap, langOf(t));
    setMsgs((m) => [...m, { id: Date.now() + 1, role: "assistant", reply, via }]);
    setBusy(false);
    input.current?.focus();
  }

  const reset = () => { setMsgs([]); setPrefs(EMPTY_PREFS); setText(""); };

  const composer = (
    <form onSubmit={(e) => { e.preventDefault(); send(text); }}
      className="flex items-end gap-2 rounded-[28px] border border-border bg-card p-2 pl-5 shadow-[0_8px_30px_rgba(28,32,36,0.08)] transition-shadow focus-within:shadow-[0_8px_36px_rgba(62,99,221,0.18)]">
      <textarea ref={input} value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={400} autoFocus
        placeholder={started ? "Refine it, or ask about a place…" : "Quiet beach, good seafood, not too expensive…"}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
        className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent py-3 text-[15px] outline-none placeholder:text-muted-foreground/70" />
      <GenerateButton type="submit" label={started ? "Send" : "Find my trip"} activeLabel="Thinking" isGenerating={busy} disabled={busy || !text.trim()} className="shrink-0 disabled:opacity-60" />
    </form>
  );

  if (!JR.ready) return <main className="grid min-h-screen place-items-center p-8 text-sm text-muted-foreground">The traveller app needs the JomRasa tables, which are not in this build.</main>;

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip bg-[var(--slate-1)] text-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,var(--indigo-4),transparent_70%)] opacity-70" />

      <header className="relative z-10 mx-auto flex w-full max-w-4xl items-center justify-between px-5 py-4">
        <button onClick={reset} className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-xl bg-primary text-xs font-semibold text-primary-foreground">JR</span>
          <span className="text-sm font-semibold tracking-tight">JomRasa</span>
        </button>
        <div className="flex items-center gap-2">
          {started && (
            <button onClick={reset} className="group inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <RotateCcw className="size-3.5 transition-transform group-hover:-rotate-90" />New trip
            </button>
          )}
          <Link href="/" className="group inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
            For planners <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </header>

      {!started ? (
        <main className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 pb-24">
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }} className="text-center text-4xl font-semibold tracking-tight md:text-5xl">
            Where should you go next?
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.6, ease: EASE }} className="mx-auto mt-3 max-w-md text-center text-[15px] leading-relaxed text-muted-foreground">
            Tell me what you are after. I will find the corners of Malaysia that fit - and are not packed with everyone else.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16, duration: 0.6, ease: EASE }} className="mt-8">{composer}</motion.div>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {STARTERS.map((s, i) => (
              <motion.button key={s} onClick={() => send(s)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 + 0.05 * i, duration: 0.5, ease: EASE }} whileHover={{ y: -2 }}
                className="rounded-full border border-border bg-card px-3.5 py-1.5 text-xs text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-foreground">
                {s.length > 46 ? `${s.slice(0, 46)}…` : s}
              </motion.button>
            ))}
          </div>
          <p className="mt-8 text-center text-[11px] text-muted-foreground/80">Malay, English or 中文 · built on official tourism statistics and {JR.meta.items_travel.toLocaleString("en-MY")} real traveller accounts</p>
        </main>
      ) : (
        <>
          <main className="relative z-10 mx-auto w-full max-w-4xl flex-1 px-5 pb-40 pt-2">
            <div className="space-y-6">
              {msgs.map((m) => m.role === "user" ? (
                <motion.div key={m.id} initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.3, ease: EASE }} className="flex justify-end">
                  <p className="max-w-[80%] rounded-3xl rounded-br-lg bg-foreground px-4 py-2.5 text-[15px] leading-relaxed text-background">{m.text}</p>
                </motion.div>
              ) : (
                <div key={m.id}>
                  <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }} className="max-w-2xl text-[15px] leading-relaxed">{m.reply.text}</motion.p>
                  {m.reply.kind === "recommend" && (
                    <div className="mt-4 grid gap-3 md:grid-cols-3">{m.reply.recs.map((r, i) => <DestinationCard key={r.code} rec={r} rank={i} onAsk={send} />)}</div>
                  )}
                  {m.reply.kind === "state" && <div className="mt-4"><StateCard brief={m.reply.brief} /></div>}
                  {m.id === msgs[msgs.length - 1].id && !busy && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-4 flex flex-wrap gap-2">
                      {m.reply.followUps.map((f) => (
                        <motion.button key={f} onClick={() => send(f)} whileHover={{ y: -2 }} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-foreground">{f}</motion.button>
                      ))}
                    </motion.div>
                  )}
                  {m.reply.kind !== "text" && m.via === "keywords" && m.id === msgs[msgs.length - 1].id && (
                    <p className="mt-2 text-[10px] text-muted-foreground/70">Understood with keyword rules.</p>
                  )}
                </div>
              ))}
              <AnimatePresence>
                {busy && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="size-2 animate-pulse rounded-full bg-primary" />
                    <FlipFadeText words={["Reading", "Matching", "Ranking"]} interval={900} className="min-h-0 justify-start" textClassName="text-sm md:text-sm font-normal normal-case tracking-normal text-muted-foreground dark:text-muted-foreground" />
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={end} />
            </div>
          </main>
          <div className={cn("fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[var(--slate-1)] via-[var(--slate-1)] to-transparent px-5 pb-5 pt-10")}>
            <div className="mx-auto max-w-3xl">{composer}</div>
          </div>
        </>
      )}
    </div>
  );
}
