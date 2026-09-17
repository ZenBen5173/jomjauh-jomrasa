"""JomRasa tagging: closed-set aspect sentiment + emotion with a cheap LLM via OpenRouter.

Design choices (docs/prior_work.md section 5-6):
  * closed-set classification with enum-constrained JSON - zero-shot LLMs are reliable
    on polarity but drift on free-form ABSA, so nothing is free text except `place`;
  * a simple prompt (elaborate prompts do not help);
  * every result is appended to data/cache/tags.jsonl keyed by item_id + model +
    prompt version, so nothing is ever labelled (or paid for) twice;
  * a hard budget guard stops the run before the OpenRouter credit is gone.

Usage:  python -m pipeline.text.tag --limit 200        (try a small batch first)
        python -m pipeline.text.tag                    (everything not yet cached)
"""
from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

import pandas as pd
import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
CLEAN, CACHE = ROOT / "data" / "clean", ROOT / "data" / "cache"
load_dotenv(ROOT / ".env")

MODEL = os.environ.get("JOMRASA_MODEL", "google/gemini-2.5-flash-lite")
PROMPT_VERSION = "v1"
BUDGET_USD = float(os.environ.get("JOMRASA_BUDGET_USD", "3.50"))
BATCH = 8

TOPICS = ["access_transport", "accommodation", "food", "price_value", "crowding", "cleanliness",
          "scenery_nature", "culture_heritage", "safety", "activities", "hospitality_service"]
EMOTIONS = ["joy", "calm", "surprise", "trust", "disappointment", "frustration", "fear", "neutral"]
LANGS = ["ms", "en", "zh", "mixed", "other"]

SYSTEM = f"""You label short texts about travel in Malaysia. Texts may be in Malay, English, Mandarin or mixed (Manglish).
For each text return:
- is_travel_experience: true only if it describes or evaluates visiting a place (a trip, food, stay, sight, transport).
  false for politics, residents' complaints about government, spam, adverts, song/video praise ("nice video bro"), or pure listings with no opinion.
- language: one of {LANGS}
- place: the most specific named place or attraction mentioned (e.g. "Pantai Cenang", "Kek Lok Si"), else null. Never a person.
- topics: every topic the text clearly evaluates, each with sentiment -1 (negative), 0 (mixed/neutral) or 1 (positive). Only from: {TOPICS}
- overall: overall sentiment about the travel experience, integer -2 (very negative) to 2 (very positive)
- emotion: the dominant emotion of the writer, one of {EMOTIONS}
If is_travel_experience is false, use topics [], overall 0, emotion "neutral"."""

SCHEMA = {
    "name": "labels", "strict": True,
    "schema": {"type": "object", "additionalProperties": False, "required": ["items"], "properties": {"items": {
        "type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "required": ["id", "is_travel_experience", "language", "place", "topics", "overall", "emotion"],
            "properties": {
                "id": {"type": "string"},
                "is_travel_experience": {"type": "boolean"},
                "language": {"type": "string", "enum": LANGS},
                "place": {"type": ["string", "null"]},
                "topics": {"type": "array", "items": {
                    "type": "object", "additionalProperties": False, "required": ["topic", "sentiment"],
                    "properties": {"topic": {"type": "string", "enum": TOPICS},
                                   "sentiment": {"type": "integer", "enum": [-1, 0, 1]}}}},
                "overall": {"type": "integer", "enum": [-2, -1, 0, 1, 2]},
                "emotion": {"type": "string", "enum": EMOTIONS},
            }}}}},
}


def cache_path() -> Path:
    return CACHE / "tags.jsonl"


def load_cache() -> dict[str, dict]:
    out = {}
    if cache_path().exists():
        for line in cache_path().read_text(encoding="utf8").splitlines():
            r = json.loads(line)
            if r["model"] == MODEL and r["prompt_version"] == PROMPT_VERSION:
                out[r["id"]] = r
    return out


def valid(label: dict) -> bool:
    try:
        return (isinstance(label["is_travel_experience"], bool) and label["language"] in LANGS
                and label["emotion"] in EMOTIONS and label["overall"] in (-2, -1, 0, 1, 2)
                and all(t["topic"] in TOPICS and t["sentiment"] in (-1, 0, 1) for t in label["topics"]))
    except (KeyError, TypeError):
        return False


def call(batch: list[dict]) -> tuple[list[dict], float]:
    user = json.dumps([{"id": b["item_id"], "state": b["code"], "text": b["text"]} for b in batch], ensure_ascii=False)
    body = {"model": MODEL, "temperature": 0, "usage": {"include": True},
            "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
            "response_format": {"type": "json_schema", "json_schema": SCHEMA}}
    for attempt in range(4):
        r = requests.post("https://openrouter.ai/api/v1/chat/completions", timeout=120, json=body,
                          headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}"})
        if r.status_code == 200:
            d = r.json()
            try:
                items = json.loads(d["choices"][0]["message"]["content"])["items"]
                return items, float((d.get("usage") or {}).get("cost") or 0.0)
            except (KeyError, ValueError):
                pass
        if r.status_code in (401, 402):
            raise SystemExit(f"OpenRouter refused the request ({r.status_code}): {r.text[:200]}")
        time.sleep(3 * (attempt + 1))
    return [], 0.0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    a = ap.parse_args()
    items = pd.read_parquet(CLEAN / "text_items.parquet")
    done = load_cache()
    todo = items[~items.item_id.isin(done)]
    if a.limit:
        # stratify the trial batch across states
        todo = todo.groupby("code", group_keys=False).head(max(a.limit // 16, 1)).head(a.limit)
    CACHE.mkdir(parents=True, exist_ok=True)
    spent, n_ok = 0.0, 0
    with cache_path().open("a", encoding="utf8") as fh:
        for i in range(0, len(todo), BATCH):
            if spent >= BUDGET_USD:
                print(f"budget guard: stopped at ${spent:.2f}")
                break
            batch = todo.iloc[i:i + BATCH].to_dict("records")
            ids = {b["item_id"] for b in batch}
            labels, cost = call(batch)
            spent += cost
            for lab in labels:
                if lab.get("id") in ids and valid(lab):
                    fh.write(json.dumps({**lab, "model": MODEL, "prompt_version": PROMPT_VERSION}, ensure_ascii=False) + "\n")
                    n_ok += 1
            fh.flush()
            if (i // BATCH) % 25 == 0:
                print(f"  {i + len(batch)}/{len(todo)} items   ${spent:.3f}", flush=True)
    print(f"tagged {n_ok} new items with {MODEL}; spent ${spent:.3f}; cache now {len(load_cache())}")


if __name__ == "__main__":
    main()
