"""Export the facts behind the website's Pipeline page: what was downloaded, how many rows each clean table has,
how the AI tagging was checked, how stable the ranking is, and how many automatic tests guard it all.

Everything here is counted from the files on disk, so the page cannot drift from the real pipeline.

    python -m pipeline.export_pipeline        # -> web/public/data/pipeline.json
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from collections import Counter
from datetime import date
from pathlib import Path

import pandas as pd

from core import metrics as M

ROOT = Path(__file__).resolve().parents[1]
RAW, CLEAN, DOCS, WEB = ROOT / "data" / "raw", ROOT / "data" / "clean", ROOT / "docs", ROOT / "web" / "public" / "data"


def osm_count(layer: str) -> int:
    path = RAW / "osm" / f"{layer}.json"
    return len(json.loads(path.read_text(encoding="utf8"))["elements"]) if path.exists() else 0


def collected_python_tests() -> int:
    """Ask pytest itself, so parametrised tests are counted the way the test report counts them."""
    done = subprocess.run([sys.executable, "-m", "pytest", "tests", "--collect-only", "-q"], cwd=ROOT, capture_output=True, text=True)
    m = re.search(r"(\d+) tests? collected", done.stdout)
    return int(m.group(1)) if m else 0


def collected_web_tests() -> int:
    """Ask vitest itself (it also counts tests generated in loops). Its JSON reporter writes to a file."""
    report = ROOT / "web" / ".vitest" / "json" / "output.json"
    subprocess.run("npx vitest run --reporter=json", cwd=ROOT / "web", capture_output=True, shell=True)
    return int(json.loads(report.read_text(encoding="utf8")).get("numTotalTests", 0)) if report.exists() else 0


def main() -> None:
    manifest = json.loads((RAW / "_manifest.json").read_text())
    files = Counter(k.split("/")[0] for k in manifest)
    tables = {f.stem: list(pd.read_parquet(f).shape) for f in sorted(CLEAN.glob("*.parquet"))}
    jr = json.loads((WEB / "jomrasa.json").read_text(encoding="utf8"))["meta"]
    guide = json.loads((WEB / "guide.json").read_text(encoding="utf8"))["destinations"]
    text = pd.read_parquet(CLEAN / "text_items.parquet") if (CLEAN / "text_items.parquet").exists() else None

    panel = pd.read_parquet(CLEAN / "state_panel.parquet")
    p = panel[panel.year == panel.year.max()].set_index("code")
    sens = M.gap_sensitivity(p)
    loo = sens.attrs["leave_one_out_spearman"]

    out = {
        "generated": date.today().isoformat(),
        "raw": {
            "dosm_files": files.get("dosm", 0), "datagovmy_files": files.get("datagovmy", 0),
            "tourism_malaysia_files": len(list((RAW / "tourism_malaysia").glob("*.csv"))),
            "osm_layers": len(list((RAW / "osm").glob("*.json"))), "osm_points": sum(osm_count(x) for x in ["attractions", "nature", "heritage", "airports", "rail"]),
            "osm_hotels": osm_count("stay"), "osm_eateries": osm_count("food"),
            "wikivoyage_pages": files.get("wikivoyage", 0), "rainfall_towns": len(list((RAW / "climate").glob("*.json"))),
            "logged_downloads": len(manifest),
        },
        "tables": {"count": len(tables), "rows": int(sum(v[0] for v in tables.values())), "panel_rows": tables["state_panel"][0], "panel_columns": tables["state_panel"][1],
                   "list": [{"name": k, "rows": v[0], "columns": v[1]} for k, v in tables.items()]},
        "text": {
            "model": jr["model"], "collected": jr["items_collected"], "tagged": jr["items_tagged"], "kept": jr["items_travel"], "by_source": jr["by_source"],
            "languages": ({k: int(v) for k, v in text.lang_hint.value_counts().items()} if text is not None and "lang_hint" in text else {}),
            "topics": len(jr["topics"]), "emotions": len(jr["emotions"]),
            "round1": json.loads((DOCS / "validation_round1.json").read_text()), "round2": json.loads((DOCS / "validation_results.json").read_text()),
        },
        "robustness": {
            "draws": 1000, "spearman_median": round(sens.attrs["spearman_median"], 3), "spearman_p05": round(sens.attrs["spearman_p05"], 3),
            "leave_one_out_min": round(min(loo.values()), 3),
            "top5": [{"code": c, "share": round(float(v), 3)} for c, v in sens.top5_frequency.sort_values(ascending=False).head(5).items()],
        },
        "guide": {
            "towns": len(guide), "places": sum(len(d["places"]) for d in guide), "stays": sum(len(d.get("stays", [])) for d in guide),
            "street_located": sum(1 for d in guide for x in d["places"] if x.get("approx")), "from_map_only": sum(1 for d in guide for x in d["places"] if x.get("source") == "osm"),
            "states": len({d["code"] for d in guide}),
        },
        "tests": {"python": collected_python_tests(), "web": collected_web_tests()},
    }
    (WEB / "pipeline.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf8")
    print(json.dumps({k: out[k] for k in ("raw", "guide", "tests")}, indent=None))


if __name__ == "__main__":
    main()
