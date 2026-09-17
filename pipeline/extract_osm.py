"""Extract OpenStreetMap features per state via the Overpass API.

One country-wide query per layer (far fewer requests than one per state). We keep
the elements themselves (centre points + tags), not just counts, so the raw files
can be re-aggregated and drawn on the map; points are assigned to states in the
transform step using the geoBoundaries polygons. Raw: data/raw/osm/<layer>.json
"""
from __future__ import annotations

import json
import time
from datetime import date
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "raw" / "osm"
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

LAYERS = {
    "attractions": 'nwr["tourism"~"^(attraction|museum|viewpoint|theme_park|zoo|aquarium|gallery)$"](area.a);',
    "nature": '(nwr["natural"="beach"](area.a);nwr["boundary"="national_park"](area.a);'
              'nwr["leisure"="nature_reserve"](area.a);nwr["natural"="peak"]["name"](area.a);'
              'nwr["waterway"="waterfall"](area.a);nwr["natural"="cave_entrance"]["name"](area.a););',
    "heritage": '(nwr["historic"]["name"](area.a);nwr["heritage"](area.a););',
    "airports": 'nwr["aeroway"="aerodrome"]["iata"](area.a);',
    "rail": 'nwr["railway"="station"]["station"!~"subway|light_rail|monorail"](area.a);',
}


def overpass(query: str) -> dict:
    last = None
    for attempt in range(6):
        url = ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            r = requests.post(url, data={"data": query}, timeout=240,
                              headers={"User-Agent": "jomjauh-datathon/1.0"})
            if r.status_code == 200:
                return r.json()
            last = f"{r.status_code} from {url}"
        except Exception as e:  # noqa: BLE001
            last = str(e)
        time.sleep(8 + 6 * attempt)
    raise RuntimeError(last)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for layer, body in LAYERS.items():
        dest = OUT / f"{layer}.json"
        if dest.exists():
            continue
        q = f'[out:json][timeout:240];area["ISO3166-1"="MY"][admin_level=2]->.a;{body}out tags center;'
        data = overpass(q)
        data["_accessed"] = date.today().isoformat()
        dest.write_text(json.dumps(data), encoding="utf8")
        print(f"  {layer:12s} {len(data['elements']):6d}", flush=True)
        time.sleep(3)


if __name__ == "__main__":
    main()
