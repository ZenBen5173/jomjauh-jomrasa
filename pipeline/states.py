"""Canonical state table. Every source is mapped onto these 16 codes."""
from __future__ import annotations

import re

import pandas as pd

# code, canonical name, short label, DOSM per-state file slug, region
_STATES = [
    ("JHR", "Johor", "Johor", "johor", "Peninsular"),
    ("KDH", "Kedah", "Kedah", "kedah", "Peninsular"),
    ("KTN", "Kelantan", "Kelantan", "kelantan", "Peninsular"),
    ("MLK", "Melaka", "Melaka", "melaka", "Peninsular"),
    ("NSN", "Negeri Sembilan", "N. Sembilan", "negerisembilan", "Peninsular"),
    ("PHG", "Pahang", "Pahang", "pahang", "Peninsular"),
    ("PRK", "Perak", "Perak", "perak", "Peninsular"),
    ("PLS", "Perlis", "Perlis", "perlis", "Peninsular"),
    ("PNG", "Pulau Pinang", "P. Pinang", "pulaupinang", "Peninsular"),
    ("SBH", "Sabah", "Sabah", "sabah", "Borneo"),
    ("SWK", "Sarawak", "Sarawak", "sarawak", "Borneo"),
    ("SGR", "Selangor", "Selangor", "selangor", "Peninsular"),
    ("TRG", "Terengganu", "Terengganu", "terengganu", "Peninsular"),
    ("KUL", "W.P. Kuala Lumpur", "Kuala Lumpur", "wpkualalumpur", "Peninsular"),
    ("LBN", "W.P. Labuan", "Labuan", "wplabuan", "Borneo"),
    ("PJY", "W.P. Putrajaya", "Putrajaya", "wpputrajaya", "Peninsular"),
]

STATES = pd.DataFrame(_STATES, columns=["code", "state", "label", "dosm_slug", "region"])
CODES = list(STATES["code"])

_ALIASES = {
    "johor": "JHR", "johore": "JHR",
    "kedah": "KDH",
    "kelantan": "KTN",
    "melaka": "MLK", "malacca": "MLK",
    "negerisembilan": "NSN", "nsembilan": "NSN",
    "pahang": "PHG",
    "perak": "PRK",
    "perlis": "PLS",
    "pulaupinang": "PNG", "penang": "PNG", "ppinang": "PNG",
    "sabah": "SBH",
    "sarawak": "SWK",
    "selangor": "SGR",
    "terengganu": "TRG", "trengganu": "TRG",
    "kualalumpur": "KUL", "wpkualalumpur": "KUL", "kl": "KUL", "wpkl": "KUL",
    "wilayahpersekutuankualalumpur": "KUL", "federalterritoryofkualalumpur": "KUL",
    "labuan": "LBN", "wplabuan": "LBN", "wilayahpersekutuanlabuan": "LBN",
    "federalterritoryoflabuan": "LBN",
    "putrajaya": "PJY", "wpputrajaya": "PJY", "wilayahpersekutuanputrajaya": "PJY",
    "federalterritoryofputrajaya": "PJY",
}


def to_code(name: object) -> str | None:
    """Map any source's state spelling to a canonical code (None if not a state)."""
    if name is None or (isinstance(name, float) and pd.isna(name)):
        return None
    key = re.sub(r"[^a-z]", "", str(name).lower())
    # strip footnote letters DOSM appends, e.g. "Selangor1" -> handled by regex; "sabaha" is not
    return _ALIASES.get(key)
