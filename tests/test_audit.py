"""The Pipeline page shows pipeline_audit.json: it must describe the clean tables that actually exist."""
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
AUDIT = json.loads((ROOT / "web" / "public" / "data" / "pipeline_audit.json").read_text(encoding="utf8"))
CLEAN = ROOT / "data" / "clean"


def test_funnel_only_shrinks_and_ends_at_the_posts_we_score():
    ns = [f["n"] for f in AUDIT["text"]["funnel"]]
    assert ns == sorted(ns, reverse=True)
    for prev, step in zip(AUDIT["text"]["funnel"], AUDIT["text"]["funnel"][1:]):
        assert prev["n"] - step["n"] == step["removed"]
    assert AUDIT["text"]["funnel"][2]["n"] == len(pd.read_parquet(CLEAN / "text_items.parquet"))   # after exact and near-duplicates


def test_duplicates_and_filters_match_the_clean_tables():
    d = AUDIT["structured"]["duplicates"][0]
    assert d["after"] == len(pd.read_parquet(CLEAN / "visitors_state_year.parquet"))
    assert all(f["kept"] <= f["raw"] for f in AUDIT["structured"]["filters"])
    assert AUDIT["structured"]["spellings"]["codes"] == 16


def test_states_add_up_to_the_national_total():
    r = AUDIT["structured"]["reconcile"]
    assert abs(r["states_sum_k"] - r["national_k"]) < 0.1


def test_cell_map_covers_every_cell_of_the_panel():
    p = AUDIT["panel"]
    assert len(p["map"]) == p["rows"] and all(len(r["cells"]) == p["value_columns"] for r in p["map"])
    assert sum(r["cells"].count("e") for r in p["map"]) == p["empty"]
    assert sum(r["cells"].count("c") for r in p["map"]) == p["carried"]


def test_quality_methods_found_no_problems():
    q = AUDIT["quality"]
    assert all(q[k]["problems"] == 0 for k in ("ranges", "completeness", "reconcile", "outliers"))
    assert q["outliers"]["flagged"] == q["outliers"]["explained"]          # every flagged jump is a pandemic year
    assert q["ranges"]["checked"] > 2000 and q["reconcile"]["checked"] > 40
