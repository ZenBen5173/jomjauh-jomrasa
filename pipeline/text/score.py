"""JomRasa scoring: Experience Score with empirical-Bayes shrinkage, topic and emotion
profiles, representative quotes, place catalogue, and the validation workflow.

  python -m pipeline.text.score build              -> clean tables
  python -m pipeline.text.score sample             -> docs/validation_sample.csv (200 items to hand-label)
  python -m pipeline.text.score validate           -> accuracy / macro-F1 / kappa from the filled CSV

Shrinkage (Efron & Morris 1975; Morris 1983): shrunk = (n*xbar + k*mu) / (n + k) with
k = within-state variance / between-state variance, so a state with a handful of
comments is pulled toward the national mean instead of topping or bottoming the table.
"""
from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path

import numpy as np
import pandas as pd
import requests

from pipeline.states import CODES, STATES
from pipeline.text.tag import EMOTIONS, TOPICS, load_cache

ROOT = Path(__file__).resolve().parents[2]
CLEAN, CACHE, DOCS = ROOT / "data" / "clean", ROOT / "data" / "cache", ROOT / "docs"

ACCESS_TOPICS = ["access_transport"]
AMENITY_TOPICS = ["accommodation", "food", "cleanliness", "hospitality_service"]


# ---------------------------------------------------------------- shrinkage
def prior_strength(groups: list[np.ndarray]) -> float:
    """k = sigma^2_within / tau^2_between (method of moments), bounded to [5, 200]."""
    groups = [g for g in groups if len(g) >= 2]
    if len(groups) < 3:
        return 30.0
    within = np.average([g.var(ddof=1) for g in groups], weights=[len(g) - 1 for g in groups])
    means, ns = np.array([g.mean() for g in groups]), np.array([len(g) for g in groups])
    between = max(means.var(ddof=1) - within * np.mean(1 / ns), 1e-6)
    return float(np.clip(within / between, 5, 200))


def shrink(xbar: float, n: int, mu: float, k: float) -> float:
    return mu if n == 0 else (n * xbar + k * mu) / (n + k)


# ---------------------------------------------------------------- build
def _state_names() -> dict[str, list[str]]:
    names = {r.code: [r.state.lower().replace("w.p. ", ""), r.label.lower()] for r in STATES.itertuples()}
    names["PNG"].append("penang")
    names["MLK"].append("malacca")
    return names


def elsewhere(code: str, place) -> bool:
    """True when the place the model found names a DIFFERENT state and not the one the text was collected for:
    a search for Sabah that returns a post about Kuala Lumpur must not count towards Sabah's score."""
    p = place.lower() if isinstance(place, str) else ""
    hits = {c for c, ns in _state_names().items() if any(re.search(r"\b" + re.escape(n) + r"\b", p) for n in ns)}
    return bool(hits) and code not in hits


def tagged() -> pd.DataFrame:
    items = pd.read_parquet(CLEAN / "text_items.parquet")
    tags = pd.DataFrame(load_cache().values()).rename(columns={"id": "item_id"})
    df = items.merge(tags.drop(columns=["model", "prompt_version"]), on="item_id", how="inner")
    # second-pass filter: an item counts as travel experience only if both passes agree
    from pipeline.text.verify import load as load_verify
    ver = load_verify()
    if ver:
        df["tagger_travel"] = df["is_travel_experience"]
        df["is_travel_experience"] = df["is_travel_experience"] & df["item_id"].map(ver).fillna(False).astype(bool)
    df["both_passes"] = df["is_travel_experience"]
    df["elsewhere"] = [elsewhere(c, p) for c, p in zip(df["code"], df["place"])]
    df["is_travel_experience"] = df["is_travel_experience"] & ~df["elsewhere"]
    return df


def build() -> None:
    all_items = tagged()
    df = all_items[all_items.is_travel_experience].copy()
    print(f"tagged {len(all_items)}; travel experience {len(df)} ({len(df) / max(len(all_items), 1):.0%})")
    df["score100"] = (df["overall"] + 2) / 4 * 100

    # --- Experience Score per state
    mu = df.score100.mean()
    k = prior_strength([g.score100.to_numpy() for _, g in df.groupby("code")])
    rows = []
    for code in CODES:
        g = df[df.code == code]
        n = len(g)
        raw = g.score100.mean() if n else np.nan
        sd = g.score100.std(ddof=1) if n > 1 else df.score100.std(ddof=1)
        shr = shrink(raw, n, mu, k)
        se = sd / np.sqrt(n + k)
        rec = {"code": code, "mentions_n": n, "experience_raw": raw, "experience_score": shr,
               "experience_lo": shr - 1.96 * se, "experience_hi": shr + 1.96 * se,
               "share_positive": (g.overall > 0).mean() if n else np.nan,
               "share_negative": (g.overall < 0).mean() if n else np.nan}
        for e in EMOTIONS:
            rec[f"emo_{e}"] = (g.emotion == e).mean() if n else np.nan
        for lang in ["ms", "en", "zh", "mixed"]:
            rec[f"lang_{lang}"] = int((g.language == lang).sum())
        rows.append(rec)
    exp = pd.DataFrame(rows)
    exp["prior_k"], exp["national_mean"] = k, mu

    # --- topic sentiment per state (shrunk per topic)
    t = df[["item_id", "code", "topics"]].explode("topics").dropna(subset=["topics"])
    t["topic"] = t.topics.map(lambda d: d["topic"])
    t["s100"] = t.topics.map(lambda d: (d["sentiment"] + 1) / 2 * 100)
    trows = []
    for topic in TOPICS:
        tt = t[t.topic == topic]
        if tt.empty:
            continue
        mu_t = tt.s100.mean()
        k_t = prior_strength([g.s100.to_numpy() for _, g in tt.groupby("code")])
        for code in CODES:
            g = tt[tt.code == code]
            trows.append({"code": code, "topic": topic, "n": len(g),
                          "sentiment_raw": g.s100.mean() if len(g) else np.nan,
                          "sentiment": shrink(g.s100.mean() if len(g) else mu_t, len(g), mu_t, k_t),
                          "share_of_mentions": len(g) / max((df.code == code).sum(), 1)})
    topics = pd.DataFrame(trows)

    def pillar(tops: list[str]) -> pd.Series:
        sub = topics[topics.topic.isin(tops)]
        return sub.groupby("code").apply(lambda g: np.average(g.sentiment, weights=g.n + 1), include_groups=False)

    exp = exp.set_index("code")
    # Experience Score = equal-weight mean of the aspect sentiments (each already shrunk for sample size).
    # Why not the plain mean of overall sentiment: online travel writing is ~88% positive and scenery / food /
    # culture are praised almost identically everywhere, so that mean cannot separate states (range ~3 points).
    # Averaging aspects equally lets the frictions that do differ - access, crowding, price, cleanliness, safety -
    # count as much as the praise. The overall-sentiment mean is kept as `overall_sentiment_*` for reference.
    exp = exp.rename(columns={"experience_raw": "overall_sentiment_raw", "experience_score": "overall_sentiment",
                              "experience_lo": "overall_lo", "experience_hi": "overall_hi"})
    sd_t = t.groupby("topic").s100.std(ddof=1)
    k_t = {tp: prior_strength([g.s100.to_numpy() for _, g in t[t.topic == tp].groupby("code")]) for tp in topics.topic.unique()}
    piv, piv_raw, piv_n = (topics.pivot(index="code", columns="topic", values=v) for v in ("sentiment", "sentiment_raw", "n"))
    exp["experience_score"] = piv.mean(axis=1)
    exp["experience_raw"] = piv_raw.mean(axis=1)
    exp["national_mean"] = exp["experience_score"].mean()
    se = np.sqrt(sum((sd_t[c] ** 2) / (piv_n[c] + k_t[c]) for c in piv.columns)) / len(piv.columns)
    exp["experience_lo"], exp["experience_hi"] = exp["experience_score"] - 1.96 * se, exp["experience_score"] + 1.96 * se
    exp["access_sentiment"] = pillar(ACCESS_TOPICS)
    exp["amenity_sentiment"] = pillar(AMENITY_TOPICS)
    exp = exp.reset_index()

    # --- representative quotes: short, opinionated, one per URL, both praise and complaints
    q = df[(df.text.str.len() <= 320) & (df.overall != 0)].copy()
    q["strength"] = q.overall.abs() + q.topics.map(len) * 0.25
    q = q.sort_values("strength", ascending=False).drop_duplicates(["code", "url"])
    quotes = pd.concat([q[(q.code == c) & (np.sign(q.overall) == s)].head(6) for c in CODES for s in (1, -1)])
    quotes = quotes[["code", "text", "url", "source_type", "language", "overall", "emotion", "place", "topics"]].copy()
    quotes["topics"] = quotes.topics.map(lambda ts: [x["topic"] for x in ts])

    # --- place catalogue
    p = df.dropna(subset=["place"]).copy()
    p["place_key"] = p.place.str.lower().str.replace(r"[^a-z0-9一-鿿 ]", "", regex=True).str.strip()
    p = p[p.place_key.str.len() >= 4]
    # a state or country name is not a "spot"
    not_spots = {"malaysia", "penang", "pulau pinang", "malacca", "kl", "east malaysia", "borneo", "peninsular malaysia",
                 *STATES.state.str.lower(), *STATES.label.str.lower(), *STATES.state.str.replace("W.P. ", "", regex=False).str.lower()}
    p = p[~p.place_key.isin(not_spots)]
    cat = []
    for (code, key), g in p.groupby(["code", "place_key"]):
        if len(g) < 2:
            continue
        tl = [x for ts in g.topics for x in ts]
        tags = pd.Series([x["topic"] for x in tl]).value_counts()
        pos = pd.Series([x["topic"] for x in tl if x["sentiment"] > 0]).value_counts()
        best = g.sort_values("overall", ascending=False).iloc[0]
        cat.append({"code": code, "place": g.place.mode().iloc[0], "place_key": key, "mentions": len(g),
                    "sentiment": shrink(g.score100.mean(), len(g), mu, 5.0),
                    "tags": list(tags.index[:5]), "praised_for": list(pos.index[:3]),
                    "emotions": list(g.emotion.value_counts().index[:2]),
                    "quote": best.text[:260], "quote_url": best.url})
    places = pd.DataFrame(cat)
    if not places.empty:
        # the 40 most-mentioned places per state are plenty for the planner and keep geocoding to a few minutes
        places = places.sort_values("mentions", ascending=False).groupby("code").head(40).reset_index(drop=True)
        places = geocode(places)

    exp.to_parquet(CLEAN / "jomrasa_state.parquet", index=False)
    topics.to_parquet(CLEAN / "jomrasa_topics.parquet", index=False)
    quotes.to_parquet(CLEAN / "jomrasa_quotes.parquet", index=False)
    places.to_parquet(CLEAN / "jomrasa_places.parquet", index=False)
    print(exp[["code", "mentions_n", "overall_sentiment", "experience_raw", "experience_score", "experience_lo", "experience_hi"]].round(1).to_string(index=False))
    print(f"prior strength k = {k:.1f}; places {len(places)}; quotes {len(quotes)}")


# ---------------------------------------------------------------- geocoding (OpenStreetMap Nominatim, cached, 1 req/s)
def geocode(places: pd.DataFrame) -> pd.DataFrame:
    path = CACHE / "geocode.json"
    cache = json.loads(path.read_text(encoding="utf8")) if path.exists() else {}
    names = STATES.set_index("code")["state"].str.replace("W.P. ", "", regex=False)
    lat, lon = [], []
    for r in places.itertuples():
        key = f"{r.place_key}|{r.code}"
        if key not in cache:
            try:
                res = requests.get("https://nominatim.openstreetmap.org/search", timeout=30,
                                   params={"q": f"{r.place}, {names[r.code]}, Malaysia", "format": "json", "limit": 1, "countrycodes": "my"},
                                   headers={"User-Agent": "jomjauh-datathon/1.0 (DOSM Datathon 2026 student project)"}).json()
                cache[key] = [float(res[0]["lat"]), float(res[0]["lon"])] if res else None
            except Exception:  # noqa: BLE001
                cache[key] = None
            time.sleep(1.1)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf8")
        hit = cache[key]
        lat.append(hit[0] if hit else np.nan)
        lon.append(hit[1] if hit else np.nan)
    return places.assign(lat=lat, lon=lon)


# ---------------------------------------------------------------- validation
def sample(n: int = 200, seed: int = 11) -> None:
    df = tagged()
    r1 = DOCS / "validation_round1_sample.csv"
    if r1.exists():   # round 2: fresh items only, different seed - round 1 was used to tune the second-pass filter
        df = df[~df.item_id.isin(pd.read_csv(r1, encoding="utf-8-sig").item_id)]
        df = df[df.language.isin(["ms", "en", "zh", "mixed"])]
        n, seed = 120, 23
    df["stratum"] = df.language + "|" + df.source_type
    per = max(n // df.stratum.nunique(), 1)
    s = df.groupby("stratum", group_keys=False).apply(lambda g: g.sample(min(len(g), per), random_state=seed), include_groups=False)
    s = pd.concat([s, df.drop(s.index).sample(max(n - len(s), 0), random_state=seed)]).head(n)
    out = s[["item_id", "code", "text"]].copy()
    for col in ["gold_is_travel (1/0)", "gold_overall (-2..2)", "gold_emotion", "gold_main_topic"]:
        out[col] = ""
    DOCS.mkdir(exist_ok=True)
    out.to_csv(DOCS / "validation_sample.csv", index=False, encoding="utf-8-sig")
    print(f"wrote {len(out)} items to docs/validation_sample.csv - fill the gold_* columns by hand "
          f"(emotions: {EMOTIONS}; topics: {TOPICS})")


def _kappa(a: pd.Series, b: pd.Series) -> float:
    po = (a == b).mean()
    pe = sum((a == c).mean() * (b == c).mean() for c in set(a) | set(b))
    return float((po - pe) / (1 - pe)) if pe < 1 else 1.0


def _macro_f1(gold: pd.Series, pred: pd.Series) -> float:
    f = []
    for c in set(gold):
        tp = ((gold == c) & (pred == c)).sum()
        prec, rec = tp / max((pred == c).sum(), 1), tp / max((gold == c).sum(), 1)
        f.append(0 if tp == 0 else 2 * prec * rec / (prec + rec))
    return float(np.mean(f))


def validate() -> None:
    gold = pd.read_csv(DOCS / "validation_sample.csv", encoding="utf-8-sig").dropna(subset=["gold_is_travel (1/0)"])
    df = gold.merge(tagged()[["item_id", "is_travel_experience", "overall", "emotion", "topics"]], on="item_id")
    res = {"n": len(df)}
    g_travel = df["gold_is_travel (1/0)"].astype(int).astype(bool)
    res["travel_filter_accuracy"] = float((g_travel == df.is_travel_experience).mean())
    d = df[g_travel & df.is_travel_experience]
    pol = lambda s: np.sign(s.astype(int))  # noqa: E731
    res["polarity_accuracy"] = float((pol(d["gold_overall (-2..2)"]) == pol(d.overall)).mean())
    res["polarity_macro_f1"] = _macro_f1(pol(d["gold_overall (-2..2)"]), pol(d.overall))
    res["polarity_kappa"] = _kappa(pol(d["gold_overall (-2..2)"]), pol(d.overall))
    res["emotion_accuracy"] = float((d.gold_emotion.str.strip() == d.emotion).mean())
    res["emotion_macro_f1"] = _macro_f1(d.gold_emotion.str.strip(), d.emotion)
    res["main_topic_recall"] = float(np.mean([g in [t["topic"] for t in ts] for g, ts in zip(d.gold_main_topic.str.strip(), d.topics)]))
    (DOCS / "validation_results.json").write_text(json.dumps(res, indent=2))
    print(json.dumps(res, indent=2))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["build", "sample", "validate"])
    {"build": build, "sample": sample, "validate": validate}[ap.parse_args().cmd]()
