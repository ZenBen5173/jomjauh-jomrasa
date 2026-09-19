"""Traveller guide: parsing Wikivoyage listings, meal slots from opening hours, and the when-to-go verdict."""
from pipeline.guide import seasons
from pipeline.guide.build import blurb, famous, opening, slots
from pipeline.guide.collect import clean, intro, params, templates

PAGE = """{{pagebanner|Klang banner.jpg}}
'''Klang''' is the royal town of [[Selangor]], famous for ''bak kut teh''.

==Eat==
Klang is where bak kut teh was born.
* {{eat
| name=The Old Stall | alt= | url=https://example.com
| address=Jalan Stesen Satu | lat=3.0436 | long=101.4495 | directions=next to the parking lot
| hours=5AM-11AM | price=
| content=Klang's oldest ''bak kut teh'' shop. RM5 for a small bowl. Get there early &mdash; it sells out. See {{RM|7}} sets.
}}
* {{see | name=Sultan Abdul Aziz Royal Gallery | lat=3.0449 | long=101.4478 | content=A [[museum|gallery]] about the royal family. }}
"""


def test_listings_are_read_out_of_the_wikitext():
    found = [params(t) for t in templates(PAGE)]
    kinds = [k for k, _ in found]
    assert kinds == ["pagebanner", "eat", "see"]                       # the nested {{RM|7}} stays inside its listing
    eat = dict(found)["eat"]
    assert eat["name"] == "The Old Stall" and eat["lat"] == "3.0436" and eat["hours"] == "5AM-11AM"
    assert clean(eat["content"]).startswith("Klang's oldest bak kut teh shop.")
    assert "—" in clean(eat["content"]) and "RM7" in clean(eat["content"])
    assert clean(dict(found)["see"]["content"]) == "A gallery about the royal family."
    assert intro(PAGE).startswith("Klang is the royal town of Selangor")


def test_opening_hours():
    assert opening("5AM-11AM") == (5, 11)
    assert opening("Daily 11:00-23:00") == (11, 23)
    assert opening("6-11pm") == (18, 23)
    assert opening("6PM-midnight") == (18, 24)
    assert opening("18:00-02:00") == (18, 26)
    assert opening("Open 24 hours") == (0, 24)
    assert opening("closed Mondays") is None


def test_meals_follow_the_opening_hours_first_and_the_words_second():
    assert slots("eat", "5AM-11AM", "bak kut teh") == ["breakfast"]
    assert slots("eat", "11:00-15:00", "noodles") == ["lunch"]
    assert slots("eat", "6PM-2AM", "hawker centre") == ["dinner", "supper"]
    assert slots("eat", "", "famous for dim sum in the morning") == ["breakfast"]
    assert slots("eat", "", "a mamak open till late") == ["supper"]
    assert slots("eat", "", "a nice restaurant") == ["lunch", "dinner"]          # nothing known: a safe default
    assert slots("eat", "6PM-11PM", "also does breakfast sets") == ["dinner"]        # the hours win over the word "breakfast"
    assert slots("see", "9-5", "museum") == []


def test_descriptions_are_trimmed_not_rewritten_and_lose_stale_prices():
    text = "Klang's oldest bak kut teh shop. RM5 for a small bowl. Get there early - it sells out."
    out = blurb(text)
    assert "RM5" not in out and out.startswith("Klang's oldest") and "Get there early" in out
    assert all(sentence in text for sentence in out.split(". ")[:1])


def test_famous_dishes():
    assert famous("their asam laksa and cendol are the best in town", "Kim's") == ["asam laksa", "cendol"]      # not also "laksa"
    assert famous("a pizzeria", "Michelangelo's") == []


def test_when_to_go():
    months = [{"month": m, "rain_mm": mm, "rainy_days": 10} for m, mm in enumerate([60, 50, 120, 200, 230, 180, 190, 240, 330, 380, 260, 120], start=1)]
    v = seasons.verdict(months, "Langkawi")
    assert v["best"] == [1, 2, 3, 12] and 10 in v["avoid"] and not v["sea_closed"]
    island = seasons.verdict(months, "Perhentian Islands")
    assert {11, 12, 1, 2} <= set(island["avoid"]) and not set(island["best"]) & {11, 12, 1, 2}
    flat = seasons.verdict([{"month": m, "rain_mm": 200 + m, "rainy_days": 12} for m in range(1, 13)], "Kuching")
    assert flat["even"] and not flat["avoid"] and len(flat["best"]) == 4


def test_season_notes_are_scoped():
    titles = lambda code, dest: {n["title"] for n in seasons.notes_for(code, dest)}  # noqa: E731
    assert "Gawai Dayak" in titles("SWK", "Kuching") and "Gawai Dayak" not in titles("SBH", "Kota Kinabalu")
    assert "Green paddy fields" in titles("SGR", "Sekinchan") and "Green paddy fields" not in titles("SGR", "Klang")
    assert "School holidays" in titles("PLS", "Kangar")
