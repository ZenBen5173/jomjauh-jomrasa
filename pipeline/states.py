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

# Land area (km2, DOSM / JUPEM published state areas) and state capital coordinates
# (used only for the distance-based market-access proxy).
_GEO = {
    "JHR": (19166, "Johor Bahru", 1.4927, 103.7414), "KDH": (9492, "Alor Setar", 6.1248, 100.3678),
    "KTN": (15040, "Kota Bharu", 6.1254, 102.2381), "MLK": (1712, "Melaka", 2.1896, 102.2501),
    "NSN": (6658, "Seremban", 2.7297, 101.9381), "PHG": (35965, "Kuantan", 3.8077, 103.3260),
    "PRK": (21146, "Ipoh", 4.5975, 101.0901), "PLS": (819, "Kangar", 6.4414, 100.1986),
    "PNG": (1049, "George Town", 5.4141, 100.3288), "SBH": (73904, "Kota Kinabalu", 5.9804, 116.0735),
    "SWK": (124450, "Kuching", 1.5533, 110.3592), "SGR": (7951, "Shah Alam", 3.0733, 101.5185),
    "TRG": (12958, "Kuala Terengganu", 5.3296, 103.1370), "KUL": (243, "Kuala Lumpur", 3.1390, 101.6869),
    "LBN": (92, "Victoria", 5.2831, 115.2308), "PJY": (49, "Putrajaya", 2.9264, 101.6964),
}
STATES["area_km2"] = STATES["code"].map(lambda c: _GEO[c][0])
STATES["capital"] = STATES["code"].map(lambda c: _GEO[c][1])
STATES["lat"] = STATES["code"].map(lambda c: _GEO[c][2])
STATES["lon"] = STATES["code"].map(lambda c: _GEO[c][3])

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
