"""Collect the traveller guide: real places to see and eat, written by travellers and locals.

Source: English Wikivoyage destination pages for Malaysia (text licensed CC BY-SA 4.0). Each page holds
structured listings - {{see}}, {{do}}, {{eat}}, {{drink}}, {{buy}} - with a name, often coordinates and
opening hours, and a description. We keep the raw page untouched in data/raw/wikivoyage/ (logged in the
manifest with its revision id), and parse the listings from it. Nothing is generated or invented here.

    python -m pipeline.guide.collect            # fetch (cached) + parse -> data/clean/guide_places.parquet
"""
from __future__ import annotations

import hashlib
import html
import json
import re
import time
from datetime import date
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "wikivoyage"
MANIFEST = ROOT / "data" / "raw" / "_manifest.json"
CLEAN = ROOT / "data" / "clean"
API = "https://en.wikivoyage.org/w/api.php"
UA = {"User-Agent": "jomjauh-datathon/1.0 (DOSM Datathon 2026 student project)"}
KINDS = {"see", "do", "eat", "drink", "buy", "sleep"}

# state code -> Wikivoyage destination pages (district sub-pages such as "Kuala Lumpur/Golden Triangle" are discovered)
PAGES: dict[str, list[str]] = {
    "JHR": ["Johor Bahru", "Desaru", "Mersing", "Muar", "Batu Pahat", "Kluang", "Kota Tinggi"],
    "KDH": ["Alor Setar", "Langkawi", "Sungai Petani", "Kulim"],
    "KTN": ["Kota Bharu", "Tumpat", "Gua Musang"],
    "MLK": ["Malacca", "Alor Gajah"],
    "NSN": ["Seremban", "Port Dickson", "Kuala Pilah"],
    "PHG": ["Kuantan", "Cameron Highlands", "Genting Highlands", "Cherating", "Tioman", "Taman Negara", "Fraser's Hill", "Bentong", "Raub"],
    "PRK": ["Ipoh", "Taiping", "Pangkor", "Kuala Kangsar", "Teluk Intan", "Lumut", "Gopeng"],
    "PLS": ["Kangar", "Kuala Perlis", "Padang Besar (Malaysia)", "Arau"],
    "PNG": ["George Town (Malaysia)", "Batu Ferringhi", "Butterworth", "Balik Pulau", "Bukit Mertajam", "Air Itam"],
    "SBH": ["Kota Kinabalu", "Sandakan", "Semporna", "Kundasang", "Kudat", "Tawau", "Ranau", "Kinabalu National Park"],
    "SWK": ["Kuching", "Miri", "Sibu", "Bintulu", "Gunung Mulu National Park", "Sri Aman", "Kapit"],
    "SGR": ["Klang", "Shah Alam", "Petaling Jaya", "Kuala Selangor", "Subang Jaya", "Sekinchan", "Sepang", "Kajang", "Kuala Kubu Bharu"],
    "TRG": ["Kuala Terengganu", "Perhentian Islands", "Redang", "Dungun", "Kapas", "Kenyir Lake", "Marang"],
    "KUL": ["Kuala Lumpur"],
    "LBN": ["Labuan"],
    "PJY": ["Putrajaya"],
}


def _slug(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_")


def fetch(title: str, manifest: dict, force: bool = False) -> dict | None:
    """One page's wikitext, cached on disk. Returns None when Wikivoyage has no such page."""
    path = RAW / f"{_slug(title)}.json"
    if path.exists() and not force:
        return json.loads(path.read_text(encoding="utf8"))
    parse = None
    for attempt in range(5):   # the API answers with an HTML error page when it wants us to slow down
        r = requests.get(API, params={"action": "parse", "page": title, "prop": "wikitext|revid", "format": "json", "redirects": 1, "maxlag": 5}, headers=UA, timeout=60)
        time.sleep(1.0)
        try:
            parse = r.json().get("parse")
            break
        except ValueError:
            time.sleep(5 * (attempt + 1))
    else:
        raise RuntimeError(f"Wikivoyage kept refusing {title!r}")
    page = {"requested": title, "missing": True} if not parse else {
        "requested": title, "title": parse["title"], "revid": parse["revid"], "wikitext": parse["wikitext"]["*"],
        "url": f"https://en.wikivoyage.org/wiki/{parse['title'].replace(' ', '_')}",
    }
    RAW.mkdir(parents=True, exist_ok=True)
    body = json.dumps(page, ensure_ascii=False)
    path.write_text(body, encoding="utf8")
    manifest[f"wikivoyage/{path.name}"] = {
        "url": page.get("url", f"{API}?page={title}"), "accessed": date.today().isoformat(), "bytes": len(body.encode("utf8")),
        "sha256": hashlib.sha256(body.encode("utf8")).hexdigest(), "revid": page.get("revid"), "license": "CC BY-SA 4.0 (Wikivoyage contributors)",
    }
    return page


# ------------------------------------------------------------------ wikitext parsing
def templates(text: str):
    """Yield every top-level {{...}} block (nested templates stay inside their parent)."""
    for _, body in templates_at(text):
        yield body


def templates_at(text: str):
    """The same, with the position each block starts at (to know which heading it sits under)."""
    i, n = 0, len(text)
    while i < n - 1:
        if text[i:i + 2] == "{{":
            depth, j = 1, i + 2
            while j < n - 1 and depth:
                if text[j:j + 2] == "{{":
                    depth, j = depth + 1, j + 2
                elif text[j:j + 2] == "}}":
                    depth, j = depth - 1, j + 2
                else:
                    j += 1
            yield i, text[i + 2:j - 2]
            i = j
        else:
            i += 1


def params(body: str) -> tuple[str, dict[str, str]]:
    """Split a template body on top-level pipes."""
    parts, depth, cur = [], 0, []
    k = 0
    while k < len(body):
        two = body[k:k + 2]
        if two in ("{{", "[["):
            depth += 1; cur.append(two); k += 2
        elif two in ("}}", "]]"):
            depth -= 1; cur.append(two); k += 2
        elif body[k] == "|" and depth == 0:
            parts.append("".join(cur)); cur = []; k += 1
        else:
            cur.append(body[k]); k += 1
    parts.append("".join(cur))
    out = {}
    for p in parts[1:]:
        if "=" in p:
            key, val = p.split("=", 1)
            out[key.strip().lower()] = val.strip()
    return parts[0].strip().lower(), out


def clean(text: str) -> str:
    """Wikitext -> plain sentence text."""
    t = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    t = re.sub(r"<ref[^>]*>.*?</ref>|<ref[^>]*/>", "", t, flags=re.S)
    t = re.sub(r"\{\{\s*RM\s*\|\s*([^}|]+)[^}]*\}\}", r"RM\1", t, flags=re.I)
    t = re.sub(r"\{\{\s*(km|m|ft|mi|kg|ha)\s*\|\s*([^}|]+)[^}]*\}\}", r"\2 \1", t, flags=re.I)
    for _ in range(3):
        t = re.sub(r"\{\{[^{}]*\}\}", "", t)
    t = re.sub(r"\[\[(?:File|Image):[^\]]*\]\]", "", t, flags=re.I)
    t = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"\[\[([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"\[https?://\S+\s+([^\]]+)\]", r"\1", t)
    t = re.sub(r"\[https?://\S+\]|https?://\S+", "", t)
    t = re.sub(r"<[^>]+>", " ", t)
    t = t.replace("'''", "").replace("''", "")
    t = html.unescape(t).replace(" ", " ")
    return re.sub(r"\s+", " ", t).strip(" ,;")


def intro(wikitext: str) -> str:
    """The page's opening paragraph: what the place is, in a traveller's words."""
    lead = wikitext.split("\n==", 1)[0]
    for para in clean(re.sub(r"\n\s*\n", "\n\n", lead).replace("\n\n", " ¶ ")).split("¶"):
        para = para.strip()
        if len(para) > 40:
            return para
    return ""


def section(wikitext: str, name: str) -> str:
    """Free text of a level-2 section, listings removed (e.g. the prose at the top of "Eat")."""
    m = re.search(rf"\n==\s*{name}\s*==\n(.*?)(?=\n==[^=]|\Z)", wikitext, flags=re.S | re.I)
    if not m:
        return ""
    body = m.group(1)
    for t in list(templates(body)):
        body = body.replace("{{" + t + "}}", "")
    body = re.sub(r"\n=+[^=\n]+=+\n", "\n", body)
    paras = [clean(p) for p in re.split(r"\n\s*\n|\n\*", body)]
    return " ".join(p for p in paras if len(p) > 50)[:900]


def _tier(headings: list[str]) -> str:
    """Wikivoyage sorts places to sleep under Budget / Mid-range / Splurge headings."""
    for h in reversed(headings):
        if "budget" in h or "backpack" in h or "hostel" in h:
            return "budget"
        if "mid" in h:
            return "mid-range"
        if "splurge" in h or "luxury" in h or "upscale" in h:
            return "splurge"
        if h in ("sleep", "eat", "drink", "buy", "see", "do"):
            break
    return ""


def listings(page: dict, code: str, destination: str) -> list[dict]:
    rows = []
    heads = [(m.start(), m.group(1).strip().lower()) for m in re.finditer(r"\n=+\s*([^=\n]+?)\s*=+", page["wikitext"])]
    for order, (at, body) in enumerate(templates_at(page["wikitext"])):
        kind, p = params(body)
        if kind not in KINDS or not p.get("name"):
            continue
        name = clean(p["name"])
        text = clean(p.get("content", ""))
        if not name or len(name) > 70:
            continue

        def num(v):
            try:
                return float(v)
            except (TypeError, ValueError):
                return None
        rows.append({
            "code": code, "destination": destination, "page": page["title"], "url": page["url"], "revid": page["revid"], "order": order,
            "kind": kind, "name": name, "alt": clean(p.get("alt", "")), "address": clean(p.get("address", "")), "directions": clean(p.get("directions", "")),
            "hours": clean(p.get("hours", "")), "lat": num(p.get("lat")), "lon": num(p.get("long")), "content": text,
            "tier": _tier([h for pos, h in heads if pos < at]) if kind == "sleep" else "",
        })
    return rows


def run(force: bool = False) -> pd.DataFrame:
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    rows, dests = [], []
    for code, titles in PAGES.items():
        for title in titles:
            page = fetch(title, manifest, force)
            if not page or page.get("missing"):
                print(f"  - no page: {title}")
                continue
            pages = [page]
            # big cities are split into district pages: "Kuala Lumpur/Golden Triangle"
            for sub in sorted(set(re.findall(rf"\[\[({re.escape(page['title'])}/[^\]|#]+)", page["wikitext"]))):
                sp = fetch(sub, manifest, force)
                if sp and not sp.get("missing"):
                    pages.append(sp)
            got = [r for pg in pages for r in listings(pg, code, page["title"])]
            rows += got
            dests.append({"code": code, "destination": page["title"], "url": page["url"], "revid": page["revid"], "intro": intro(page["wikitext"]),
                          "eat_notes": section(page["wikitext"], "Eat"), "understand": section(page["wikitext"], "Understand"),
                          "pages": len(pages), "listings": len(got)})
            print(f"  {code} {page['title']:<28} pages={len(pages):<2} listings={len(got)}")
    MANIFEST.write_text(json.dumps(manifest, indent=1, sort_keys=True))
    df = pd.DataFrame(rows).drop_duplicates(subset=["code", "name", "kind"])
    CLEAN.mkdir(parents=True, exist_ok=True)
    df.to_parquet(CLEAN / "guide_places_raw.parquet", index=False)
    pd.DataFrame(dests).to_parquet(CLEAN / "guide_destinations_raw.parquet", index=False)
    return df


if __name__ == "__main__":
    out = run()
    print(f"\n{len(out)} listings, {out['lat'].notna().sum()} with coordinates")
    print(out.groupby(["code", "kind"]).size().unstack(fill_value=0))
