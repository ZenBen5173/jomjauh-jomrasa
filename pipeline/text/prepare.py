"""Clean and de-identify collected text -> data/clean/text_items.parquet

One row per passage (article paragraph group) or comment, with ONLY:
  item_id, text, code (state), url, source_type, date, lang_hint
No usernames, channel ids or profile links are ever written (PDPA).
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "text"
CLEAN = ROOT / "data" / "clean"

MIN_CHARS, MAX_CHARS = 60, 700
_URL = re.compile(r"https?://\S+|www\.\S+")
_EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")
_HANDLE = re.compile(r"@[\w.\-]{2,}")   # also when glued to the previous word ("Follow@someone")
_PHONE = re.compile(r"(?<!\d)(?:\+?6?0)\d{1,2}[\s-]?\d{3,4}[\s-]?\d{3,4}(?!\d)")
_MS_WORDS = set("yang dan di ke dari ini itu untuk dengan tidak tak ada sangat memang boleh kami saya kita pergi "
                "makan tempat sini sana best sedap cantik jalan bercuti pantai harga murah mahal".split())
_BLOCKED = re.compile(r"://[^/]*(tripadvisor\.|google\.|goo\.gl|facebook\.com|instagram\.com|tiktok\.com)", re.I)
_BOILER =re.compile(r"(cookie|subscribe|newsletter|all rights reserved|privacy policy|sign up|log in|"
                     r"affiliate|click here|read more|share this|leave a comment|table of contents)", re.I)


def scrub(text: str) -> str:
    """Remove personal identifiers and links; collapse whitespace."""
    t = _URL.sub(" ", text)
    t = _EMAIL.sub(" ", t)
    t = _HANDLE.sub(" ", t)
    t = _PHONE.sub(" ", t)
    return re.sub(r"\s+", " ", t).strip()


def lang_hint(text: str) -> str:
    cjk = sum("一" <= ch <= "鿿" for ch in text)
    if cjk / max(len(text), 1) > 0.2:
        return "zh"
    words = re.findall(r"[a-z']+", text.lower())
    ms = sum(w in _MS_WORDS for w in words)
    return "ms" if words and ms / len(words) > 0.12 else "en"


def passages(article: str) -> list[str]:
    """Group an article's paragraphs into passages of roughly 250-700 characters."""
    paras = [scrub(p) for p in re.split(r"\n{1,}", article)]
    paras = [p for p in paras if len(p) >= 40 and not _BOILER.search(p) and not p.startswith(("#", "|", "!["))]
    out, buf = [], ""
    for p in paras:
        if len(buf) + len(p) + 1 <= MAX_CHARS:
            buf = f"{buf} {p}".strip()
        else:
            if buf:
                out.append(buf)
            buf = p[:MAX_CHARS]
    if buf:
        out.append(buf)
    return [p for p in out if len(p) >= MIN_CHARS]


def _norm_key(text: str) -> str:
    return hashlib.sha1(re.sub(r"\W+", "", text.lower())[:300].encode()).hexdigest()


def build(max_passages_per_page: int = 6) -> pd.DataFrame:
    rows = []
    for f in sorted((RAW / "exa").glob("*.json")):
        d = json.loads(f.read_text(encoding="utf8"))
        code = d["request"]["code"]
        for res in d["response"].get("results", []):
            if _BLOCKED.search(res.get("url") or ""):   # plan 4.3: no TripAdvisor / Google Maps review content
                continue
            for p in passages(res.get("text") or "")[:max_passages_per_page]:
                rows.append({"text": p, "code": code, "url": res.get("url"), "source_type": "web",
                             "date": (res.get("publishedDate") or "")[:10] or None})
    for f in sorted((RAW / "youtube_commentThreads").glob("*.json")):
        d = json.loads(f.read_text(encoding="utf8"))
        code, vid = d["request"]["_state"], d["request"]["videoId"]
        for it in d["response"].get("items", []):
            sn = it["snippet"]["topLevelComment"]["snippet"]      # author fields are never read
            t = scrub(sn.get("textDisplay") or sn.get("textOriginal") or "")[:MAX_CHARS]
            if len(t) >= MIN_CHARS:
                rows.append({"text": t, "code": code, "url": f"https://www.youtube.com/watch?v={vid}",
                             "source_type": "youtube_comment", "date": (sn.get("publishedAt") or "")[:10] or None})
    df = pd.DataFrame(rows, columns=["text", "code", "url", "source_type", "date"])
    df["_k"] = df["text"].map(_norm_key)
    df = df.drop_duplicates("_k").drop(columns="_k").reset_index(drop=True)
    df["lang_hint"] = df["text"].map(lang_hint)
    df.insert(0, "item_id", df["text"].map(lambda t: hashlib.sha1(t.encode()).hexdigest()[:12]))
    return df


def main() -> None:
    df = build()
    CLEAN.mkdir(parents=True, exist_ok=True)
    df.to_parquet(CLEAN / "text_items.parquet", index=False)
    print(df.groupby(["code", "source_type"]).size().unstack(fill_value=0))
    print(f"text_items: {len(df)} rows; languages: {df.lang_hint.value_counts().to_dict()}")


if __name__ == "__main__":
    main()
