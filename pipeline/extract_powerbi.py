"""Extract Tourism Malaysia's Paid Accommodation Survey from its public Power BI report.

The report (data.tourism.gov.my/public) is a "publish to web" Power BI embed. Its
front-end reads data from a public, unauthenticated `querydata` endpoint using the
resource key in the share URL. We call the same endpoint and ask for the rows of
the tables behind the three tabs (Hotel Inventory, AOR, Hotel Guests).

Raw JSON responses are saved untouched in data/raw/tourism_malaysia/; decoded rows
are written next to them as CSV.
"""
from __future__ import annotations

import base64
import json
from datetime import date
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "raw" / "tourism_malaysia"

SHARE_URL = (
    "https://app.powerbi.com/view?r=eyJrIjoiNDlhNjRlOTktNGFhNy00MDdhLThmYmYtMjVkZjQ3ZTYyZjUzIiwidCI6IjYy"
    "MjNlMWFmLWExNDYtNDI0Ny1hYmNjLWYwNGFkMjlmYTc4NSIsImMiOjEwfQ%3D%3D"
)
API = "https://wabi-south-east-asia-api.analysis.windows.net/public/reports"

TABLES = {
    "ref_states": ["id", "name"],
    "dashboard_room_cumulative_public": ["date", "year", "quarter_cumulative", "state_id", "total_hotel", "total_room"],
    "dashboard_room_quarter_public": ["date", "year", "quarter_quarterly", "state_id", "total_hotel", "total_room"],
    "dashboard_aor_cumulative_public": ["date", "year", "quarter_cumulative", "state_id", "aor_cumulative"],
    "dashboard_aor_quarter_public": ["date", "year", "quarter_quarterly", "state_id", "aor_quarter"],
    "dashboard_hg_cumulative_public": ["date", "year", "quarter_cumulative", "state_id",
                                       "domestic_hotel_guest", "foreigner_hotel_guest", "overall_hotel_guest"],
    "dashboard_hg_quarter_public": ["date", "year", "quarter_quarterly", "state_id",
                                    "domestic_hotel_guest", "foreigner_hotel_guest", "overall_hotel_guest"],
}


def resource_key() -> str:
    token = SHARE_URL.split("r=")[1].replace("%3D", "=")
    return json.loads(base64.b64decode(token))["k"]


def _headers() -> dict:
    return {"X-PowerBI-ResourceKey": resource_key(), "Accept": "application/json",
            "Content-Type": "application/json"}


def model_id() -> int:
    r = requests.get(f"{API}/{resource_key()}/modelsAndExploration?preferReadOnlySession=true",
                     headers=_headers(), timeout=60)
    r.raise_for_status()
    (OUT / "modelsAndExploration.json").write_text(r.text, encoding="utf8")
    return r.json()["models"][0]["id"]


def _query(entity: str, cols: list[str]) -> dict:
    select = [{"Column": {"Expression": {"SourceRef": {"Source": "t"}}, "Property": c}, "Name": f"t.{c}"}
              for c in cols]
    return {
        "Commands": [{"SemanticQueryDataShapeCommand": {
            "Query": {"Version": 2, "From": [{"Name": "t", "Entity": entity, "Type": 0}], "Select": select},
            "Binding": {"Primary": {"Groupings": [{"Projections": list(range(len(cols)))}]},
                        "DataReduction": {"DataVolume": 6, "Primary": {"Window": {"Count": 30000}}},
                        "Version": 1},
        }}]
    }


def decode_dsr(result: dict, cols: list[str]) -> pd.DataFrame:
    """Decode Power BI's compressed DSR rows (R = repeat-previous bitmask, Ø = null bitmask)."""
    ds = result["results"][0]["result"]["data"]["dsr"]["DS"][0]
    dicts = ds.get("ValueDicts", {})
    rows, prev, schema = [], [None] * len(cols), None
    for rec in ds["PH"][0]["DM0"]:
        if "S" in rec:
            schema = rec["S"]
        values = iter(rec.get("C", []))
        rmask, nmask = rec.get("R", 0), rec.get("Ø", 0)
        row = []
        for i in range(len(cols)):
            if rmask & (1 << i):
                v = prev[i]
            elif nmask & (1 << i):
                v = None
            else:
                v = next(values)
                dn = schema[i].get("DN")
                if dn is not None and isinstance(v, int):
                    v = dicts[dn][v]
            row.append(v)
        rows.append(row)
        prev = row
    return pd.DataFrame(rows, columns=cols)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    mid = model_id()
    for entity, cols in TABLES.items():
        body = {"version": "1.0.0", "queries": [{"Query": _query(entity, cols), "QueryId": ""}],
                "cancelQueries": [], "modelId": mid}
        r = requests.post(f"{API}/querydata?synchronous=true", headers=_headers(), json=body, timeout=120)
        r.raise_for_status()
        (OUT / f"{entity}.json").write_text(r.text, encoding="utf8")
        df = decode_dsr(r.json(), cols)
        df.to_csv(OUT / f"{entity}.csv", index=False)
        print(f"  {entity:36s} {len(df):6d} rows")
    (OUT / "_access.json").write_text(json.dumps(
        {"source": "Tourism Malaysia - Paid Accommodation Survey (public Power BI)",
         "url": SHARE_URL, "accessed": date.today().isoformat()}, indent=2))


if __name__ == "__main__":
    main()
