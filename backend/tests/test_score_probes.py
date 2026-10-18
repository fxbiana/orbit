"""Probe profiles line up with complementary scoring, including Spotify knows."""

from app.matching import compatibility_with
from score_probes import build_score_probes

SPOTIFY_KNOWS = ["Steve Lacy", "Tyler, The Creator", "Sza", "Beyoncé"]

LISTENER = {
    "username": "listener",
    "first_name": "Listener",
    "location": "Seattle",
    "age": 18,
    "gathering_size": "6-15",
    "languages": {"knows": [], "wants_to_learn": []},
    "locations": {"knows": [], "wants_to_learn": []},
    "hobbies": {"knows": [], "wants_to_learn": []},
    "interests": {"knows": SPOTIFY_KNOWS, "wants_to_learn": []},
    "festivals": {"knows": [], "wants_to_learn": []},
}

TYPED = {
    **LISTENER,
    "age": 21,
    "location": "Vancouver",
    "languages": {"knows": ["English"], "wants_to_learn": ["Tamil"]},
    "hobbies": {"knows": ["Chess"], "wants_to_learn": ["Art"]},
    "interests": {"knows": [*SPOTIFY_KNOWS, "Golf"], "wants_to_learn": ["Cheese"]},
}


def _by_id(viewer):
    return {person["id"]: person for person in build_score_probes(viewer)}


def _labels(match, prefix):
    return [item for item in match["matched_on"] if item.startswith(prefix)]


def test_spotify_knows_score_as_learn_hits_and_cap_at_two():
    probes = _by_id(LISTENER)
    every = compatibility_with(LISTENER, probes["probe-every-artist"])
    two = compatibility_with(LISTENER, probes["probe-two-artists"])
    one = compatibility_with(LISTENER, probes["probe-one-artist"])

    assert _labels(every, "Wants ") == [f"Wants {name}" for name in SPOTIFY_KNOWS]
    assert len(_labels(two, "Wants ")) == 2
    assert _labels(one, "Wants ") == ["Wants Steve Lacy"]
    assert every["score"] == two["score"]
    assert one["score"] == two["score"] - 6
    assert "Lives in Seattle" in every["matched_on"]
    assert "Gathering 6-15" in every["matched_on"]
    assert "Similar age" in every["matched_on"]


def test_case_and_duplicate_labels_do_not_add_extra_learn_points():
    probes = _by_id(LISTENER)
    case = compatibility_with(LISTENER, probes["probe-case-match"])
    twice = compatibility_with(LISTENER, probes["probe-listed-twice"])
    two = compatibility_with(LISTENER, probes["probe-two-artists"])
    one = compatibility_with(LISTENER, probes["probe-one-artist"])

    assert _labels(case, "Wants ") == ["Wants sTEVE lACY", "Wants tYLER, tHE cREATOR"]
    assert case["score"] == two["score"]
    assert _labels(twice, "Wants ") == ["Wants Steve Lacy"]
    assert twice["score"] == one["score"]


def test_same_knows_near_miss_and_language_wall_do_not_match_spotify():
    probes = _by_id(LISTENER)
    city = compatibility_with(LISTENER, probes["probe-city-only"])
    for probe_id in ("probe-same-knows", "probe-close-miss", "probe-language-wall"):
        match = compatibility_with(LISTENER, probes[probe_id])
        assert _labels(match, "Wants ") == []
        assert _labels(match, "Knows ") == []
        assert match["score"] == city["score"]

    far = compatibility_with(LISTENER, probes["probe-far-listener"])
    assert len(_labels(far, "Wants ")) == len(SPOTIFY_KNOWS)
    assert "Lives in Seattle" not in far["matched_on"]
    assert far["score"] == 12

    none = compatibility_with(LISTENER, probes["probe-no-overlap"])
    assert none["score"] == 0
    assert none["matched_on"] == []


def test_typed_wants_add_the_teach_bucket_on_top_of_spotify_knows():
    probes = _by_id(TYPED)
    both = compatibility_with(TYPED, probes["probe-both-ways"])
    teaches = compatibility_with(TYPED, probes["probe-teaches-wants"])
    every = compatibility_with(TYPED, probes["probe-every-artist"])

    assert "Knows Art" in teaches["matched_on"]
    assert "Knows Cheese" in teaches["matched_on"]
    assert "Knows Tamil" in both["matched_on"]
    assert "Wants Steve Lacy" in both["matched_on"]
    assert "Wants Golf" in both["matched_on"]
    assert teaches["score"] > every["score"]
    assert both["score"] >= teaches["score"]
    assert both["score"] <= 100
