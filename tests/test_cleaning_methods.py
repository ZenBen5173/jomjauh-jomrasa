"""The extra cleaning methods, on small hand-made cases."""
from pipeline.text.prepare import near_duplicates
from pipeline.text.score import elsewhere


def test_near_duplicates_keep_the_first_copy_and_leave_different_texts_alone():
    a = ("We took the morning ferry to the island and the water was so clear you could see the fish from the jetty all day long. "
         "The chalet owner cooked dinner for everyone, the beach was almost empty, and we stayed two more nights than we planned to.")
    b = a.replace("so clear", "very clear")            # one word changed: the same text reposted
    c = "The night market opens at six and the grilled fish stall near the mosque is the one the locals queue for every evening"
    assert near_duplicates([a, b, c]) == {1}
    assert near_duplicates([a, c]) == set()


def test_post_about_another_state_is_not_counted():
    assert elsewhere("SBH", "Kuala Lumpur")             # collected for Sabah, written about KL
    assert not elsewhere("SBH", "Kota Kinabalu, Sabah")
    assert not elsewhere("SBH", "a quiet beach")        # no state named: keep it where it was collected
    assert not elsewhere("SBH", None)
