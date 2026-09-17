"""Second-pass travel filter.

Validation round 1 (docs/validation_round1.json) showed the tagger's travel filter was too
permissive: it kept comments that praise a video or only say "I want to go there", and news /
official statements about tourism. This pass re-checks every item the tagger kept with one
narrow question - is this a first-hand account or evaluation of being at the place? - and the
score step keeps an item only if BOTH passes agree. Cached in data/cache/verify.jsonl.

Usage:  python -m pipeline.text.verify
"""
from __future__ import annotations

import json
import os
import time
from concurrent.futures import ThreadPoolExecutor

import pandas as pd
import requests

from pipeline.text.tag import CACHE, CLEAN, MODEL, load_cache

VERSION = "f1"
BATCH, WORKERS = 12, 6
BUDGET_USD = float(os.environ.get("JOMRASA_VERIFY_BUDGET_USD", "0.80"))

SYSTEM = """You filter texts for a study of travellers' experiences in Malaysia. For each text answer keep = true or false.
keep = true ONLY when the writer (a traveller, blogger, reviewer or a local) gives a first-hand account or evaluation of actually being at a place
in Malaysia: what they saw, ate, paid, how they got there, how it felt, whether it is worth it. Travel-guide passages written from experience that
evaluate a place ("the laksa here is the best in town", "the beach is quiet on weekdays") count.
keep = false for:
- reactions to a video or its maker ("great vlog", "this makes me want to visit", "I didn't know my state had this", "can't wait to go")
- plans, wishes or questions about a future trip; requests for recommendations
- news reports, press statements by officials, tourism policy, event announcements
- encyclopaedic facts or history with no evaluation; bare lists of names, addresses, prices or opening hours
- general opinions about Malaysia or a whole state with no visit described; food-brand opinions unrelated to a trip
- spam, adverts, website navigation, code, text not about Malaysia."""

SCHEMA = {"name": "keep", "strict": True, "schema": {
    "type": "object", "additionalProperties": False, "required": ["items"], "properties": {"items": {"type": "array", "items": {
        "type": "object", "additionalProperties": False, "required": ["id", "keep"],
        "properties": {"id": {"type": "string"}, "keep": {"type": "boolean"}}}}}}}


def path():
    return CACHE / "verify.jsonl"


def load() -> dict[str, bool]:
    out = {}
    if path().exists():
        for line in path().read_text(encoding="utf8").splitlines():
            r = json.loads(line)
            if r["v"] == VERSION and r["model"] == MODEL:
                out[r["id"]] = r["keep"]
    return out


def call(batch: list[dict]) -> tuple[list[dict], float]:
    user = json.dumps([{"id": b["item_id"], "source": b["source_type"], "text": b["text"]} for b in batch], ensure_ascii=False)
    body = {"model": MODEL, "temperature": 0, "usage": {"include": True},
            "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
            "response_format": {"type": "json_schema", "json_schema": SCHEMA}}
    for attempt in range(4):
        r = requests.post("https://openrouter.ai/api/v1/chat/completions", timeout=120, json=body,
                          headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}"})
        if r.status_code == 200:
            d = r.json()
            try:
                return json.loads(d["choices"][0]["message"]["content"])["items"], float((d.get("usage") or {}).get("cost") or 0)
            except (KeyError, ValueError):
                pass
        if r.status_code in (401, 402):
            raise SystemExit(f"OpenRouter refused the request ({r.status_code})")
        time.sleep(3 * (attempt + 1))
    return [], 0.0


def main() -> None:
    items = pd.read_parquet(CLEAN / "text_items.parquet")
    kept = {k for k, v in load_cache().items() if v["is_travel_experience"]}
    done = load()
    todo = items[items.item_id.isin(kept) & ~items.item_id.isin(done)]
    batches = [todo.iloc[i:i + BATCH].to_dict("records") for i in range(0, len(todo), BATCH)]
    spent, n, wave = 0.0, 0, WORKERS * 4
    with path().open("a", encoding="utf8") as fh, ThreadPoolExecutor(WORKERS) as pool:
        for w in range(0, len(batches), wave):
            if spent >= BUDGET_USD:
                print(f"budget guard: stopped at ${spent:.2f}")
                break
            chunk = batches[w:w + wave]
            for batch, (labels, cost) in zip(chunk, pool.map(call, chunk)):
                ids = {b["item_id"] for b in batch}
                spent += cost
                for lab in labels:
                    if lab.get("id") in ids and isinstance(lab.get("keep"), bool):
                        fh.write(json.dumps({"id": lab["id"], "keep": lab["keep"], "v": VERSION, "model": MODEL}) + "\n")
                        n += 1
            fh.flush()
            print(f"  {min((w + wave) * BATCH, len(todo))}/{len(todo)}   ${spent:.3f}", flush=True)
    res = load()
    print(f"verified {n} new; kept {sum(res.values())} of {len(res)} tagger-kept items; spent ${spent:.3f}")


if __name__ == "__main__":
    main()
