"""Collect public travel text per state from Exa (blogs, forums, articles) and
YouTube (comments on travel videos).

Rules (plan section 4.3, PDPA):
  * we keep only: text, state, source URL, source type, date, language hint;
    author names, channel ids and profile links are dropped at collection time;
  * every API response is cached on disk by request hash - nothing is fetched twice;
  * run one state first (`--state TRG`) to check quality and cost before `--all`.

Usage:
  python -m pipeline.text.collect exa --state TRG
  python -m pipeline.text.collect exa --all
  python -m pipeline.text.collect youtube --all
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import time
from datetime import date
from pathlib import Path

import requests
from dotenv import load_dotenv

from pipeline.states import STATES

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "text"
load_dotenv(ROOT / ".env")

# search names per state: (English, Malay, Mandarin, key destinations)
NAMES = {
    "JHR": ("Johor", "Johor", "柔佛", ["Desaru", "Mersing", "Johor Bahru", "Kota Tinggi"]),
    "KDH": ("Kedah", "Kedah", "吉打", ["Langkawi", "Alor Setar", "Gunung Jerai"]),
    "KTN": ("Kelantan", "Kelantan", "吉兰丹", ["Kota Bharu", "Gua Musang", "Pantai Cahaya Bulan"]),
    "MLK": ("Melaka", "Melaka", "马六甲", ["Jonker Street", "A Famosa", "Klebang"]),
    "NSN": ("Negeri Sembilan", "Negeri Sembilan", "森美兰", ["Port Dickson", "Seremban", "Kuala Pilah"]),
    "PHG": ("Pahang", "Pahang", "彭亨", ["Cameron Highlands", "Kuantan", "Taman Negara", "Tioman", "Cherating"]),
    "PRK": ("Perak", "Perak", "霹雳", ["Ipoh", "Pangkor", "Taiping", "Royal Belum"]),
    "PLS": ("Perlis", "Perlis", "玻璃市", ["Kangar", "Wang Kelian", "Gua Kelam", "Kuala Perlis"]),
    "PNG": ("Penang", "Pulau Pinang", "槟城", ["George Town", "Batu Ferringhi", "Balik Pulau"]),
    "SBH": ("Sabah", "Sabah", "沙巴", ["Kota Kinabalu", "Kundasang", "Semporna", "Sandakan"]),
    "SWK": ("Sarawak", "Sarawak", "砂拉越", ["Kuching", "Mulu", "Miri", "Bako National Park"]),
    "SGR": ("Selangor", "Selangor", "雪兰莪", ["Sekinchan", "Kuala Selangor", "Batu Caves", "Shah Alam"]),
    "TRG": ("Terengganu", "Terengganu", "登嘉楼", ["Redang", "Perhentian", "Kuala Terengganu", "Kenyir"]),
    "KUL": ("Kuala Lumpur", "Kuala Lumpur", "吉隆坡", ["Bukit Bintang", "KLCC", "Petaling Street"]),
    "LBN": ("Labuan", "Labuan", "纳闽", ["Labuan island", "Pulau Papan"]),
    "PJY": ("Putrajaya", "Putrajaya", "布城", ["Putrajaya lake", "Putra Mosque"]),
}

THEMES = {
    "en": ["{n} travel experience review", "{n} food trip what to eat honest review", "{n} nature beach hiking trip report",
           "{n} culture heritage things to do", "is {n} worth visiting"],
    "ms": ["pengalaman bercuti di {n}", "tempat makan sedap di {n} review jujur", "tempat menarik alam semula jadi {n} pengalaman",
           "budaya dan warisan {n} percutian", "berbaloi ke bercuti di {n}"],
    "zh": ["{n} 旅游 游记 体验", "{n} 美食 推荐 心得", "{n} 自然 景点 游记", "{n} 文化 古迹 旅行", "{n} 值得去吗"],
}
YT_QUERIES = ["{n} travel vlog", "bercuti di {n} vlog", "{z} 旅游 vlog"]


def queries_for(code: str) -> list[tuple[str, str]]:
    en, ms, zh, places = NAMES[code]
    out = [(lang, t.format(n={"en": en, "ms": ms, "zh": zh}[lang])) for lang, ts in THEMES.items() for t in ts]
    out += [("en", f"{p} {en} trip review experience") for p in places]
    return out


def _cached(kind: str, key: dict, fetch) -> dict:
    h = hashlib.sha1(json.dumps(key, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]
    path = RAW / kind / f"{h}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf8"))
    data = fetch()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"request": key, "accessed": date.today().isoformat(), "response": data},
                               ensure_ascii=False), encoding="utf8")
    return json.loads(path.read_text(encoding="utf8"))


# ---------------------------------------------------------------- Exa
def exa_search(code: str, lang: str, query: str, n: int = 10) -> dict:
    key = {"code": code, "lang": lang, "query": query, "n": n}

    def fetch():
        r = requests.post("https://api.exa.ai/search", timeout=60,
                          headers={"x-api-key": os.environ["EXA_API_KEY"], "Content-Type": "application/json"},
                          json={"query": query, "numResults": n, "type": "auto",
                                "excludeDomains": ["tripadvisor.com", "tripadvisor.com.my", "google.com", "maps.google.com"],
                                "contents": {"text": {"maxCharacters": 6000}}})
        r.raise_for_status()
        d = r.json()
        # PDPA: drop author fields before anything touches disk
        for res in d.get("results", []):
            res.pop("author", None)
        time.sleep(0.25)
        return d

    return _cached("exa", key, fetch)


def run_exa(codes: list[str], n: int) -> None:
    cost = 0.0
    for code in codes:
        got = 0
        for lang, q in queries_for(code):
            d = exa_search(code, lang, q, n)["response"]
            got += len(d.get("results", []))
            cost += (d.get("costDollars") or {}).get("total", 0.0)
        print(f"  {code}: {got} results   (cumulative Exa cost reported by API: ${cost:.2f})", flush=True)


# ---------------------------------------------------------------- YouTube
YT = "https://www.googleapis.com/youtube/v3"


def yt_get(endpoint: str, params: dict) -> dict:
    def fetch():
        api_params = {k: v for k, v in params.items() if not k.startswith("_")}  # "_state" is a cache label only
        r = requests.get(f"{YT}/{endpoint}", params={**api_params, "key": os.environ["YOUTUBE_API_KEY"]}, timeout=60)
        if r.status_code == 403 and "commentsDisabled" in r.text:
            return {"items": []}
        r.raise_for_status()
        return r.json()

    return _cached(f"youtube_{endpoint}", params, fetch)


def run_youtube(codes: list[str], videos_per_query: int = 6, comments_per_video: int = 100) -> None:
    for code in codes:
        en, ms, zh, _ = NAMES[code]
        n_comments = 0
        for tmpl in YT_QUERIES:
            q = tmpl.format(n=ms if "bercuti" in tmpl else en, z=zh)
            s = yt_get("search", {"part": "snippet", "q": q, "type": "video", "maxResults": videos_per_query,
                                  "regionCode": "MY", "order": "relevance", "_state": code})["response"]
            for it in s.get("items", []):
                vid = it["id"]["videoId"]
                c = yt_get("commentThreads", {"part": "snippet", "videoId": vid, "maxResults": comments_per_video,
                                              "order": "relevance", "textFormat": "plainText", "_state": code})["response"]
                n_comments += len(c.get("items", []))
        print(f"  {code}: {n_comments} comments", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("source", choices=["exa", "youtube"])
    ap.add_argument("--state")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--n", type=int, default=10, help="results per Exa query")
    a = ap.parse_args()
    codes = list(STATES["code"]) if a.all else [a.state]
    (run_exa(codes, a.n) if a.source == "exa" else run_youtube(codes))


if __name__ == "__main__":
    main()
