"""When to go: ten years of daily rainfall per destination, plus the seasonal things a local would tell you.

Rainfall: Open-Meteo Historical Weather API (ERA5 reanalysis, CC BY 4.0), daily precipitation 2015-2024 at each
destination's coordinates. Raw responses are cached in data/raw/climate/ and logged in the manifest.
The seasonal notes below (monsoon closures, festivals, fruit and wildlife seasons) are editorial: a short,
deliberately conservative list of things that are widely known and do not change from year to year, except
where marked `moves=True` (lunar and Islamic calendar dates - the app tells travellers to check those).
"""
from __future__ import annotations

import hashlib
import json
import time
from datetime import date
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "climate"
MANIFEST = ROOT / "data" / "raw" / "_manifest.json"
URL = "https://archive-api.open-meteo.com/v1/archive"
WET_DAY_MM = 5.0   # a day with at least this much rain is one a traveller would call "a rainy day"

# island and east-coast places where the northeast monsoon shuts boats and resorts, roughly November to February
SEA_CLOSED = {"Perhentian Islands", "Redang", "Kapas", "Tioman", "Mersing", "Marang", "Cherating"}

# (states or "*" , destinations or None, months, title, what a local would say, moves)
NOTES: list[tuple[list[str], list[str] | None, list[int], str, str, bool]] = [
    (["*"], None, [12, 5, 6], "School holidays", "Late May to June and most of December are school holidays: book early, and expect traffic and queues at anything family-friendly.", False),
    (["*"], None, [3, 4], "Hari Raya Aidilfitri", "The biggest holiday of the year. Cities empty out, highways jam with people heading home, and many eateries close for the first few days. The date moves about 11 days earlier every year.", True),
    (["PNG", "KUL", "MLK", "PRK", "SWK", "JHR", "SGR"], None, [1, 2], "Chinese New Year", "Lanterns, lion dances and open houses. Many Chinese-run shops and eateries close for the first two or three days, so plan your meals.", True),
    (["SGR", "KUL", "PNG", "PRK"], None, [1, 2], "Thaipusam", "One of the great Hindu processions in the world, at Batu Caves and in George Town. Unforgettable, and extremely crowded.", True),
    (["KUL", "PNG", "SGR"], None, [10, 11], "Deepavali", "Little India streets are lit up and busy with sweets and shopping in the weeks before.", True),
    (["SBH", "LBN"], None, [5], "Pesta Kaamatan", "Sabah's harvest festival, all May and peaking on 30-31 May: rice wine, traditional dress and the Unduk Ngadau pageant.", False),
    (["SWK"], None, [6], "Gawai Dayak", "The Dayak harvest festival on 1-2 June. Longhouses open their doors; towns go quiet as people head upriver.", False),
    (["SWK"], ["Kuching"], [6, 7], "Rainforest World Music Festival", "Three days of music at the foot of Mount Santubong. Book rooms in Kuching well ahead.", True),
    (["PNG"], ["George Town (Malaysia)"], [7, 8], "George Town Festival", "A month of art, theatre and street events around George Town's heritage day on 7 July.", False),
    (["KUL", "PJY"], None, [8], "Merdeka", "National Day on 31 August: parades, flags everywhere and road closures in the city centre.", False),
    (["PNG", "PHG", "PRK", "JHR"], ["Balik Pulau", "Raub", "Bentong", "George Town (Malaysia)"], [6, 7, 8], "Durian season", "The main durian season. Roadside stalls and orchards are at their best - Balik Pulau, Raub and Bentong are the names to know.", False),
    (["PLS"], None, [4, 5, 6], "Harumanis mango season", "Perlis's famous harumanis mangoes are only around for a few weeks, roughly April to June.", False),
    (["SGR"], ["Sekinchan"], [3, 4, 9, 10], "Green paddy fields", "The rice fields are at their greenest roughly March-April and September-October; they turn gold before harvest around May-June and November-December.", False),
    (["TRG"], None, [4, 5, 6, 7, 8, 9], "Turtle nesting", "Sea turtles come ashore to nest on Terengganu's beaches, roughly April to September.", False),
    (["SBH"], ["Semporna"], [4, 5, 6, 7, 8, 9, 10, 11, 12], "Diving season", "The water around Semporna and Sipadan is usually clearest from about April to December.", False),
    (["SBH"], ["Kundasang", "Kinabalu National Park", "Ranau"], [3, 4, 5, 6, 7, 8], "Mount Kinabalu climbing weather", "The drier months give the best odds of a clear summit. Climb permits sell out months ahead.", False),
    (["PHG"], ["Cherating"], [11, 12, 1, 2, 3], "Monsoon surf", "The same monsoon that closes the islands brings surfable waves to Cherating.", False),
    (["PHG"], ["Taman Negara"], [3, 4, 5, 6, 7, 8, 9], "Dry-season trekking", "Trails and river trips in Taman Negara are easiest in the drier months; some close in the wettest weeks.", False),
]


def fetch(key: str, lat: float, lon: float, manifest: dict) -> dict:
    path = RAW / f"{key}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf8"))
    params = {"latitude": round(lat, 3), "longitude": round(lon, 3), "start_date": "2015-01-01", "end_date": "2024-12-31",
              "daily": "precipitation_sum", "timezone": "Asia/Kuala_Lumpur"}
    r = None
    for attempt in range(6):
        try:
            r = requests.get(URL, params=params, timeout=90)
            if r.status_code == 200:
                break
        except requests.RequestException:
            pass
        time.sleep(8 * (attempt + 1))
    if r is None:
        raise RuntimeError(f"Open-Meteo unreachable for {key}")
    r.raise_for_status()
    RAW.mkdir(parents=True, exist_ok=True)
    path.write_text(r.text, encoding="utf8")
    manifest[f"climate/{path.name}"] = {"url": r.url, "accessed": date.today().isoformat(), "bytes": len(r.content),
                                        "sha256": hashlib.sha256(r.content).hexdigest(), "license": "CC BY 4.0 (Open-Meteo, ERA5)"}
    time.sleep(0.6)
    return r.json()


def monthly(payload: dict) -> list[dict]:
    """Average rainfall (mm) and rainy days for each calendar month."""
    d = pd.DataFrame({"date": pd.to_datetime(payload["daily"]["time"]), "mm": payload["daily"]["precipitation_sum"]}).dropna()
    d["year"], d["month"] = d.date.dt.year, d.date.dt.month
    per = d.groupby(["year", "month"]).agg(mm=("mm", "sum"), wet=("mm", lambda s: int((s >= WET_DAY_MM).sum()))).reset_index()
    out = per.groupby("month").agg(mm=("mm", "mean"), wet=("wet", "mean")).round(1)
    return [{"month": int(m), "rain_mm": float(r.mm), "rainy_days": float(r.wet)} for m, r in out.iterrows()]


def verdict(months: list[dict], destination: str) -> dict:
    """Best and worst months from the rainfall itself: drier than usual = good, much wetter than usual = avoid."""
    mean = sum(m["rain_mm"] for m in months) / 12
    best = [m["month"] for m in months if m["rain_mm"] <= 0.85 * mean]
    avoid = [m["month"] for m in months if m["rain_mm"] >= 1.35 * mean]
    closed = [11, 12, 1, 2] if destination in SEA_CLOSED else []
    avoid = sorted(set(avoid) | set(closed))
    best = [m for m in best if m not in avoid]
    if not best:   # evenly wet places: fall back to the driest four months
        best = sorted(m["month"] for m in sorted(months, key=lambda x: x["rain_mm"])[:4] if m["month"] not in avoid)
    return {"best": best, "avoid": avoid, "sea_closed": closed, "even": (max(m["rain_mm"] for m in months) < 1.6 * min(m["rain_mm"] for m in months))}


def notes_for(code: str, destination: str) -> list[dict]:
    out = []
    for states, dests, months, title, text, moves in NOTES:
        if ("*" in states or code in states) and (dests is None or destination in dests):
            out.append({"months": months, "title": title, "text": text, "moves": moves})
    return out
