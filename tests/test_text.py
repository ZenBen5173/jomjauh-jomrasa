"""Tests for the JomRasa text pipeline's pure functions (no network)."""
import numpy as np

from pipeline.text import prepare as P
from pipeline.text.score import prior_strength, shrink
from pipeline.text.tag import valid


def test_scrub_removes_identifiers():
    t = P.scrub("Thanks @ali_travels! email me ali@mail.com or 012-345 6789, see https://blog.my/x  ok")
    assert "@" not in t and "http" not in t and "6789" not in t and t.endswith("ok")


def test_language_hint():
    assert P.lang_hint("Tempat ini memang cantik dan makanan sangat sedap, harga pun murah") == "ms"
    assert P.lang_hint("The beach was quiet and the food was great value for money") == "en"
    assert P.lang_hint("这个地方的风景很美，食物也很好吃，值得再去一次") == "zh"


def test_passages_drop_boilerplate_and_short_text():
    art = "Subscribe to our newsletter for more.\n" + "We reached the jetty at dawn and the water was clear. " * 4 + "\nok\n" + "x" * 900
    ps = P.passages(art)
    assert ps and all(P.MIN_CHARS <= len(p) <= P.MAX_CHARS for p in ps)
    assert not any("newsletter" in p.lower() for p in ps)


def test_shrinkage_pulls_small_samples_to_the_mean():
    mu, k = 60.0, 30.0
    assert abs(shrink(100, 3, mu, k) - mu) < abs(shrink(100, 300, mu, k) - mu)
    assert shrink(100, 3, mu, k) < 65 and shrink(100, 3000, mu, k) > 99
    assert shrink(np.nan, 0, mu, k) == mu


def test_prior_strength_bounds():
    rng = np.random.default_rng(0)
    same = [rng.normal(60, 20, 50) for _ in range(8)]                 # no real between-state difference
    diff = [rng.normal(m, 5, 50) for m in (30, 45, 60, 75, 90)]       # large real differences
    assert prior_strength(same) > prior_strength(diff)
    assert 5 <= prior_strength(diff) <= 200


def test_label_validation_rejects_out_of_vocabulary():
    ok = {"is_travel_experience": True, "language": "ms", "place": None, "overall": 1, "emotion": "joy",
          "topics": [{"topic": "food", "sentiment": 1}]}
    assert valid(ok)
    assert not valid({**ok, "emotion": "ecstatic"})
    assert not valid({**ok, "topics": [{"topic": "wifi", "sentiment": 1}]})


def test_text_table_has_no_identifier_columns():
    import pathlib
    import pandas as pd
    f = pathlib.Path(__file__).resolve().parents[1] / "data" / "clean" / "text_items.parquet"
    if f.exists():
        df = pd.read_parquet(f)
        assert set(df.columns) == {"item_id", "text", "code", "url", "source_type", "date", "lang_hint"}
        assert not df.text.str.contains(r"@\w{3,}|https?://", regex=True).any()
