"""Build the traveller guide from the collected listings: locate every place, work out which meal an eatery
suits, pick out what it is famous for, add the when-to-go picture, and export web/public/data/guide.json.

    python -m pipeline.guide.build            # quick: uses coordinates already known
    python -m pipeline.guide.build --locate   # also looks up places without coordinates (slow, cached)

Rules: a place is only kept if it has a real description and a real location (its own coordinates from
Wikivoyage, or an OpenStreetMap/Nominatim match inside Malaysia and near its town). Old prices are dropped
rather than shown. Descriptions stay the travellers' own words, trimmed - nothing is rewritten or invented.
"""
from __future__ import annotations

import json
import math
import re
import time
from pathlib import Path

import pandas as pd
import requests

from pipeline.guide import seasons
from pipeline.states import STATES

ROOT = Path(__file__).resolve().parents[2]
CLEAN = ROOT / "data" / "clean"
CACHE = ROOT / "data" / "cache"
WEB = ROOT / "web" / "public" / "data"
UA = {"User-Agent": "jomjauh-datathon/1.0 (DOSM Datathon 2026 student project)"}
MAX_KM_FROM_TOWN = 45      # further than this from the rest of the town's places = a wrong match
LOCAL_NAME = {"Malacca": "Melaka"}   # what people here call it
MIN_SIGHTS = 3             # a destination needs at least this many located things to see or do

DISHES = [
    "bak kut teh", "nasi lemak", "nasi kandar", "nasi dagang", "nasi kerabu", "nasi ulam", "nasi ayam", "chicken rice", "char kway teow", "char kuey teow",
    "laksa", "asam laksa", "curry mee", "hokkien mee", "wantan mee", "kolo mee", "kampua", "mee goreng", "mee rebus", "mee kolok", "pan mee", "prawn mee",
    "roti canai", "roti tisu", "murtabak", "satay", "satay celup", "cendol", "ais kacang", "rojak", "pasembur", "popiah", "lok lok", "dim sum", "yong tau foo",
    "bean sprout chicken", "tauge ayam", "hor fun", "white coffee", "kaya toast", "keropok lekor", "ikan bakar", "otak-otak", "otak otak", "lemang", "rendang",
    "ayam percik", "sup tulang", "tuaran mee", "ngiu chap", "sang nyuk mee", "hinava", "ambuyat", "manok pansoh", "umai", "midin", "seafood", "steamboat",
    "durian", "coconut shake", "chicken rice ball", "nyonya", "peranakan", "banana leaf", "teh tarik", "kopitiam", "claypot", "fish head curry", "mamak",
]
BREAKFAST = r"breakfast|dim sum|kopitiam|nasi lemak|roti canai|kaya toast|bak kut teh|morning|white coffee|nasi dagang|nasi kerabu"
SUPPER = r"supper|late[- ]night|24[- ]hours?|24/7|mamak|till late|until late|after midnight|open late|wee hours"
DINNER = r"dinner|night market|pasar malam|evening|seafood|steamboat|ikan bakar|satay"


def km(a: tuple[float, float], b: tuple[float, float]) -> float:
    p = math.pi / 180
    h = 0.5 - math.cos((b[0] - a[0]) * p) / 2 + math.cos(a[0] * p) * math.cos(b[0] * p) * (1 - math.cos((b[1] - a[1]) * p)) / 2
    return 12742 * math.asin(math.sqrt(h))


# ------------------------------------------------------------------ opening hours -> meal slots
def _clock(h: str, m: str | None, ap: str | None) -> float:
    v = int(h) % 24 + (int(m) / 60 if m else 0)
    if ap:
        ap = ap.lower()
        if ap == "pm" and v < 12:
            v += 12
        if ap == "am" and int(h) == 12:
            v -= 12
    return v


def opening(hours: str) -> tuple[float, float] | None:
    """First opening range in the text as (open, close) in hours; close may run past 24."""
    t = hours.lower().replace("midnight", "12am").replace("noon", "12pm").replace("–", "-").replace("—", "-").replace(" to ", "-")
    if re.search(r"24\s*(hours|hrs|h\b)|24/7", t):
        return (0.0, 24.0)
    m = re.search(r"(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?", t)
    if not m:
        return None
    ap1, ap2 = m.group(3), m.group(6)
    if not ap1 and ap2 and int(m.group(1)) <= 12 and m.group(2) is None and int(m.group(1)) < int(m.group(4)):
        ap1 = ap2                                     # "6-11pm"
    o, c = _clock(m.group(1), m.group(2), ap1), _clock(m.group(4), m.group(5), ap2)
    if c <= o:
        c += 24
    return (o, c)


def slots(kind: str, hours: str, text: str) -> list[str]:
    if kind not in ("eat", "drink"):
        return []
    rng, low = opening(hours), f"{text} {hours}".lower()
    out = set()
    if rng:
        o, c = rng
        if o <= 9 and c >= 8.5:
            out.add("breakfast")
        if o <= 12.5 and c >= 13.5:
            out.add("lunch")
        if o <= 19.5 and c >= 20:
            out.add("dinner")
        if c >= 24 or (o, c) == (0.0, 24.0):
            out.add("supper")
    if re.search(BREAKFAST, low) and not (rng and rng[0] > 11):
        out.add("breakfast")
    if re.search(SUPPER, low):
        out.add("supper")
    if re.search(DINNER, low) and not (rng and rng[1] < 19):
        out.add("dinner")
    if not out:
        out = {"lunch", "dinner"}
    if kind == "drink":
        out = (out & {"supper", "dinner"}) or {"dinner"}
    return [s for s in ("breakfast", "lunch", "dinner", "supper") if s in out]


# ------------------------------------------------------------------ text
def blurb(text: str, limit: int = 260) -> str:
    """The first sentences of the description, skipping anything that quotes a (probably stale) price."""
    keep, used = [], 0
    for s in re.split(r"(?<=[.!?])\s+", text):
        if re.search(r"\bRM\s?\d|\bMYR\b|\bsen\b|\$\d", s):
            continue
        if used + len(s) > limit and keep:
            break
        keep.append(s)
        used += len(s) + 1
        if used > limit * 0.6:
            break
    out = " ".join(keep).strip()
    return out if len(out) <= limit + 40 else out[:limit].rsplit(" ", 1)[0] + "…"


def famous(text: str, name: str) -> list[str]:
    low = f"{name} {text}".lower()
    hits = [d for d in DISHES if re.search(rf"(?<![a-z]){re.escape(d)}(?![a-z])", low)]
    hits = [h for h in hits if not any(h != o and h in o for o in hits)]        # "laksa" inside "asam laksa"
    return [h.replace("char kuey teow", "char kway teow").replace("otak otak", "otak-otak") for h in hits][:3]


# ------------------------------------------------------------------ OpenStreetMap: places to stay, and eateries for towns with thin write-ups
def osm_layer(name: str) -> list[dict]:
    path = ROOT / "data" / "raw" / "osm" / f"{name}.json"
    if not path.exists():
        return []
    out = []
    for e in json.loads(path.read_text(encoding="utf8"))["elements"]:
        lat, lon = e.get("lat") or (e.get("center") or {}).get("lat"), e.get("lon") or (e.get("center") or {}).get("lon")
        tags = e.get("tags", {})
        if lat and lon and tags.get("name"):
            out.append({"lat": lat, "lon": lon, **tags})
    return out


def _key(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", re.sub(r"\b(hotel|resort|hostel|guest ?house|the|inn|boutique|residence|suites?)\b", "", name.lower()))


STAY_KIND = {"hotel": "hotel", "guest_house": "guesthouse", "hostel": "hostel", "resort": "resort", "chalet": "chalet", "motel": "motel"}
MIN_EATS, MAX_EATS_FROM_MAP = 8, 10


def stays_for(sleep: pd.DataFrame, centre: tuple[float, float], hotels: list[dict], code: str) -> list[dict]:
    """Places to sleep: travellers' write-ups first (located via the map when they gave no coordinates), then mapped hotels close to the centre."""
    near = [h for h in hotels if km(centre, (h["lat"], h["lon"])) <= 40]
    by_key = {_key(h["name"]): h for h in near}
    out, seen = [], set()
    for r in sleep.sort_values("order").itertuples():
        lat, lon, approx = r.lat, r.lon, False
        if pd.isna(lat) or pd.isna(lon):
            hit = by_key.get(_key(r.name))
            if not hit:
                continue
            lat, lon = hit["lat"], hit["lon"]
        if km(centre, (lat, lon)) > MAX_KM_FROM_TOWN or _key(r.name) in seen:
            continue
        seen.add(_key(r.name))
        text = blurb(r.content, 200)
        out.append({"id": f"{code}-s{len(out)}", "name": r.name, "lat": round(lat, 5), "lon": round(lon, 5), "tier": r.tier, "text": text if len(text) >= 25 else "",
                    "type": "", "stars": None, "source": "wikivoyage", "approx": approx})
    for h in sorted(near, key=lambda h: km(centre, (h["lat"], h["lon"]))):
        if len(out) >= 16 or km(centre, (h["lat"], h["lon"])) > 8:
            break
        if _key(h["name"]) in seen or not _key(h["name"]):
            continue
        seen.add(_key(h["name"]))
        stars = re.match(r"\d", str(h.get("stars", "")))
        out.append({"id": f"{code}-s{len(out)}", "name": h["name"], "lat": round(h["lat"], 5), "lon": round(h["lon"], 5), "tier": "", "text": "",
                    "type": STAY_KIND.get(h.get("tourism", ""), "hotel"), "stars": int(stars.group(0)) if stars else None, "source": "osm", "approx": False})
    return out


def eats_from_map(have: int, centre: tuple[float, float], food: list[dict], code: str, start: int) -> list[dict]:
    """Where travellers have written up few eateries, add named, cuisine-tagged ones from the map near the centre. No description is invented for them."""
    if have >= MIN_EATS:
        return []
    near = sorted((f for f in food if km(centre, (f["lat"], f["lon"])) <= 4), key=lambda f: km(centre, (f["lat"], f["lon"])))
    local = [f for f in near if re.search(r"malay|chinese|indian|regional|asian|noodle|seafood|local|nasi|mamak|bak_kut_teh|dim_sum|satay|laksa|kopitiam|coffee_shop", f.get("cuisine", ""))]
    out = []
    for f in (local + [f for f in near if f not in local])[:min(MAX_EATS_FROM_MAP, MIN_EATS + 4 - have)]:
        cuisine = [c.replace("_", " ").strip() for c in re.split(r"[;,]", f.get("cuisine", "")) if c.strip()][:2]
        hours = f.get("opening_hours", "")[:80]
        kind = "food court" if f.get("amenity") == "food_court" else "cafe" if f.get("amenity") == "cafe" else "restaurant"
        out.append({"id": f"{code}-m{start + len(out)}", "kind": "eat", "name": f["name"], "lat": round(f["lat"], 5), "lon": round(f["lon"], 5),
                    "text": f"A {'/'.join(cuisine) + ' ' if cuisine else ''}{kind} on the map near the centre. No traveller has written it up yet, so go by the crowd.",
                    "hours": hours, "address": f.get("addr:street", "")[:90], "slots": slots("eat", hours, " ".join(cuisine)), "famous": famous(" ".join(cuisine), ""), "weight": 30,
                    "approx": False, "source": "osm"})
    return out


# ------------------------------------------------------------------ location
def locate(df: pd.DataFrame, lookup: bool = True) -> pd.DataFrame:
    """Fill missing coordinates from OpenStreetMap (Nominatim), one polite request a second, cached.
    With lookup=False only the cache is used (quick rebuild; run `--locate` to look up the rest)."""
    path = CACHE / "guide_geocode.json"
    cache = json.loads(path.read_text(encoding="utf8")) if path.exists() else {}
    names = STATES.set_index("code")["state"].str.replace("W.P. ", "", regex=False)
    todo = df[df.lat.isna() & (df.content.str.len() > 40) & (df.kind != "sleep")]   # places to sleep are matched to mapped hotels instead
    have = df[df.lat.notna() & df.kind.isin(["see", "do"])].groupby("destination").size()
    todo = todo.assign(_have=todo.destination.map(have).fillna(0), _k=todo.kind.map({"see": 0, "do": 0, "eat": 1}).fillna(2)).sort_values(["_have", "_k"])
    print(f"  locating {len(todo)} places without coordinates ({sum(1 for r in todo.itertuples() if f'{r.name}|{r.destination}' not in cache)} new)")
    for r in todo.itertuples():
        key = f"{r.name}|{r.destination}"
        if key not in cache and not lookup:
            continue
        if key not in cache:
            town = re.sub(r"\s*\(.*\)", "", r.destination)
            try:
                res = requests.get("https://nominatim.openstreetmap.org/search", timeout=30, headers=UA,
                                   params={"q": f"{r.name}, {town}, {names[r.code]}, Malaysia", "format": "json", "limit": 1, "countrycodes": "my"}).json()
                cache[key] = [float(res[0]["lat"]), float(res[0]["lon"])] if res else None
            except Exception:  # noqa: BLE001 - a network hiccup is not "not found": leave it for the next run
                time.sleep(3)
                continue
            time.sleep(1.1)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf8")
        if cache.get(key):
            df.loc[r.Index, ["lat", "lon"]] = cache[key]
            df.loc[r.Index, "located_by"] = "osm"
            continue
        # second chance: a hawker stall is rarely mapped by name, but its street is - close enough to route to
        street = _street(r.address)
        akey = f"addr:{street}|{r.destination}"
        if not street or (akey not in cache and not lookup):
            continue
        if akey not in cache:
            town = re.sub(r"\s*\(.*\)", "", r.destination)
            try:
                res = requests.get("https://nominatim.openstreetmap.org/search", timeout=30, headers=UA,
                                   params={"q": f"{street}, {town}, {names[r.code]}, Malaysia", "format": "json", "limit": 1, "countrycodes": "my"}).json()
                cache[akey] = [float(res[0]["lat"]), float(res[0]["lon"])] if res else None
            except Exception:  # noqa: BLE001
                time.sleep(3)
                continue
            time.sleep(1.1)
            path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf8")
        if cache.get(akey):
            df.loc[r.Index, ["lat", "lon"]] = cache[akey]
            df.loc[r.Index, "located_by"] = "osm-street"
    return df


def _street(address: str) -> str:
    """The street part of an address: "12, Jalan Stesen Satu (next to the car park)" -> "Jalan Stesen Satu"."""
    m = re.search(r"((?:Jalan|Jln|Lorong|Lebuh|Lebuhraya|Persiaran|Lintang|Medan|Gat|Solok|Leboh)\.?\s+[A-Z0-9][\w' ./-]{2,40}?)(?=,|\(|$|\s+\d{5})", address or "", flags=re.I)
    if m:
        return re.sub(r"^Jln\.?", "Jalan", m.group(1).strip(), flags=re.I)
    m = re.search(r"([A-Z][\w' -]{2,30}\s(?:Road|Street|Lane|Avenue))", address or "")
    return m.group(1).strip() if m else ""


def run(lookup: bool = False) -> dict:
    raw = pd.read_parquet(CLEAN / "guide_places_raw.parquet")
    dests = pd.read_parquet(CLEAN / "guide_destinations_raw.parquet").drop_duplicates("destination")   # two names can redirect to one page
    raw["located_by"] = raw.lat.notna().map({True: "wikivoyage", False: None})
    sleep_all = raw[raw.kind == "sleep"].copy()
    hotels, food = osm_layer("stay"), osm_layer("food")
    raw = raw[(raw.content.str.len() > 40) & (raw.kind != "sleep")].copy()
    raw = locate(raw, lookup)
    raw = raw[raw.lat.notna() & raw.lon.notna() & raw.lat.between(0.8, 7.6) & raw.lon.between(99.5, 119.5)].copy()

    manifest_path = ROOT / "data" / "raw" / "_manifest.json"
    manifest = json.loads(manifest_path.read_text())
    out = []
    # the best-covered town of a state that has no town reaching MIN_SIGHTS still gets in, if it has two sights
    located = raw[raw.kind.isin(["see", "do"])].groupby(["code", "destination"]).size().rename("n").reset_index()
    ok_states = set(located[located.n >= MIN_SIGHTS].code)
    fallback = set(located[~located.code.isin(ok_states)].sort_values("n", ascending=False).drop_duplicates("code").destination)
    for d in dests.itertuples():
        p = raw[raw.destination == d.destination].copy()
        if p.empty:
            continue
        centre = (p.lat.median(), p.lon.median())
        p = p[[km(centre, (a, b)) <= MAX_KM_FROM_TOWN for a, b in zip(p.lat, p.lon)]]
        sights = int(p.kind.isin(["see", "do"]).sum())
        if sights < MIN_SIGHTS and not (sights >= 2 and d.destination in fallback):
            continue
        centre = (round(p.lat.median(), 4), round(p.lon.median(), 4))
        months = seasons.monthly(seasons.fetch(re.sub(r"[^a-z0-9]+", "_", d.destination.lower()).strip("_"), centre[0], centre[1], manifest))
        places = []
        for r in p.sort_values("order").itertuples():
            text = blurb(r.content)
            if len(text) < 30:
                continue
            places.append({
                "id": f"{d.code}-{len(places)}", "kind": r.kind, "name": r.name, "lat": round(r.lat, 5), "lon": round(r.lon, 5), "text": text,
                "hours": r.hours[:80], "address": (r.address or r.directions)[:90], "slots": slots(r.kind, r.hours, r.content),
                "famous": famous(r.content, r.name) if r.kind in ("eat", "drink") else [], "weight": min(len(r.content), 600),
                "approx": r.located_by == "osm-street",   # we know the street, not the door
            })
        places += eats_from_map(sum(1 for x in places if x["kind"] == "eat"), centre, food, d.code, len(places))
        dishes = pd.Series([f for x in places for f in x["famous"]] or ["-"]).value_counts().drop("-", errors="ignore")
        out.append({
            "id": re.sub(r"[^a-z0-9]+", "-", d.destination.lower()).strip("-"), "code": d.code, "name": LOCAL_NAME.get(d.destination, re.sub(r"\s*\(.*\)", "", d.destination)),
            "lat": centre[0], "lon": centre[1], "intro": blurb(d.intro, 420), "eat_notes": blurb(d.eat_notes, 380), "url": d.url,
            "known_for": [x for x in dishes.index[:5] if x not in ("seafood", "kopitiam", "mamak")] or list(dishes.index[:3]),
            "climate": months, "when": seasons.verdict(months, d.destination), "notes": seasons.notes_for(d.code, d.destination), "places": places,
            "stays": stays_for(sleep_all[sleep_all.destination == d.destination], centre, hotels, d.code),
        })
    manifest_path.write_text(json.dumps(manifest, indent=1, sort_keys=True))

    guide = {
        "attribution": "Place descriptions: Wikivoyage contributors, CC BY-SA 4.0 (trimmed, otherwise unchanged). Rainfall: Open-Meteo / ERA5, CC BY 4.0. Hotels, extra eateries and missing coordinates: OpenStreetMap contributors, ODbL.",
        "destinations": sorted(out, key=lambda x: (x["code"], -len(x["places"]))),
    }
    (WEB / "guide.json").write_text(json.dumps(guide, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf8")   # allow_nan=False: fail here, not in the browser
    return guide


if __name__ == "__main__":
    import sys
    g = run(lookup="--locate" in sys.argv)
    n = sum(len(d["places"]) for d in g["destinations"])
    print(f"\n{len(g['destinations'])} destinations, {n} places")
    for d in g["destinations"]:
        kinds = pd.Series([p["kind"] for p in d["places"]]).value_counts().to_dict()
        kinds["stay"] = len(d["stays"])
        print(f"  {d['code']} {d['name']:<26} {kinds}  best={d['when']['best']} avoid={d['when']['avoid']} known_for={d['known_for'][:3]}")
