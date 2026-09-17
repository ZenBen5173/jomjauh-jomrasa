"""Extract: download every structured source into data/raw/, untouched.

Rerunnable. Files already present are skipped unless --force. Every download is
logged in data/raw/_manifest.json with URL, access date, size and sha256.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import date
from pathlib import Path

import requests

from pipeline.states import STATES

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
MANIFEST = RAW / "_manifest.json"

DOSM = "https://storage.dosm.gov.my"
DGM = "https://storage.data.gov.my"

SOURCES: dict[str, str] = {
    # DOSM Domestic Tourism Survey
    "dosm/tourism_domestic_2025.xlsx": f"{DOSM}/tourism/tourism_domestic_2025.xlsx",
    "dosm/tourism_domestic_2024.xlsx": f"{DOSM}/tourism/tourism_domestic_2024.xlsx",
    "dosm/tourism_domestic_2023.xlsx": f"{DOSM}/tourism/tourism_domestic_2023.xlsx",
    "dosm/tourism_2025.xlsx": f"{DOSM}/tourism/tourism_2025.xlsx",
    # data.gov.my / OpenDOSM parquet
    "datagovmy/population_state.parquet": f"{DOSM}/population/population_state.parquet",
    "datagovmy/gdp_state_real_supply.parquet": f"{DOSM}/gdp/gdp_state_real_supply.parquet",
    "datagovmy/hh_income_state.parquet": f"{DOSM}/hies/hh_income_state.parquet",
    "datagovmy/hh_poverty_state.parquet": f"{DOSM}/hies/hh_poverty_state.parquet",
    "datagovmy/hh_access_amenities.parquet": f"{DOSM}/hies/hh_access_amenities.parquet",
    "datagovmy/arrivals_soe.parquet": f"{DGM}/demography/arrivals_soe.parquet",
    "datagovmy/ridership_headline.parquet": f"{DGM}/transportation/ridership_headline.parquet",
}
for slug in STATES["dosm_slug"]:
    SOURCES[f"dosm/state/tourism_domestic_2023_{slug}.xlsx"] = (
        f"{DOSM}/tourism/tourism_domestic_2023_{slug}.xlsx"
    )


def _load_manifest() -> dict:
    return json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}


def fetch(rel: str, url: str, manifest: dict, force: bool = False) -> None:
    dest = RAW / rel
    if dest.exists() and rel in manifest and not force:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    r = requests.get(url, timeout=120, headers={"User-Agent": "jomjauh-datathon/1.0"})
    r.raise_for_status()
    dest.write_bytes(r.content)
    manifest[rel] = {
        "url": url,
        "accessed": date.today().isoformat(),
        "bytes": len(r.content),
        "sha256": hashlib.sha256(r.content).hexdigest(),
    }
    print(f"  fetched {rel}  ({len(r.content):,} B)")


def fetch_boundaries(manifest: dict, force: bool = False) -> None:
    rel = "geo/geoBoundaries-MYS-ADM1_simplified.geojson"
    if (RAW / rel).exists() and rel in manifest and not force:
        return
    meta = requests.get(
        "https://www.geoboundaries.org/api/current/gbOpen/MYS/ADM1/", timeout=60
    ).json()
    fetch(rel, meta["simplifiedGeometryGeoJSON"], manifest, force=True)
    manifest[rel]["license"] = meta.get("boundaryLicense")
    manifest[rel]["boundary_source"] = meta.get("boundarySource")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    RAW.mkdir(parents=True, exist_ok=True)
    manifest = _load_manifest()
    for rel, url in SOURCES.items():
        try:
            fetch(rel, url, manifest, args.force)
        except Exception as e:  # keep going; report at the end
            print(f"  FAILED {rel}: {e}")
    try:
        fetch_boundaries(manifest, args.force)
    except Exception as e:
        print(f"  FAILED boundaries: {e}")
    MANIFEST.write_text(json.dumps(manifest, indent=2, sort_keys=True))
    print(f"manifest: {len(manifest)} files")


if __name__ == "__main__":
    main()
