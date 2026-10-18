"""Unit tests for compatibility scoring (port of sampleProfiles.test.ts)."""

from app.matching import compatibility_with, parse_match_limit, rank_matches


def _empty_topics():
    return {
        "languages": {"knows": [], "wants_to_learn": []},
        "locations": {"knows": [], "wants_to_learn": []},
        "hobbies": {"knows": [], "wants_to_learn": []},
        "interests": {"knows": [], "wants_to_learn": []},
        "festivals": {"knows": [], "wants_to_learn": []},
    }


VIEWER = {
    "username": "you",
    "first_name": "You",
    "location": "Seattle",
    "age": 28,
    "gathering_size": "6-15",
    "languages": {"knows": ["English", "Hindi"], "wants_to_learn": ["Spanish"]},
    "locations": {"knows": ["Seattle"], "wants_to_learn": ["Chandigarh"]},
    "hobbies": {"knows": ["Cooking"], "wants_to_learn": ["Dance"]},
    "interests": {"knows": ["Classical music"], "wants_to_learn": ["Folk dance"]},
    "festivals": {"knows": ["Diwali"], "wants_to_learn": ["Holi"]},
}


def test_scores_a_dance_teacher_against_someone_who_wants_to_learn_dance():
    candidate = {
        **VIEWER,
        "username": "teacher",
        "first_name": "Teacher",
        "location": "London",
        "age": 50,
        "gathering_size": "40+",
        **_empty_topics(),
        "hobbies": {"knows": ["Dance"], "wants_to_learn": []},
    }
    match = compatibility_with(VIEWER, candidate)
    assert match["score"] == 40
    assert match["matched_on"] == ["Knows Dance"]


def test_overlap_is_case_insensitive_and_uses_known_spelling():
    candidate = {
        **VIEWER,
        "location": "Austin",
        "age": 50,
        "gathering_size": "40+",
        **_empty_topics(),
        "hobbies": {"knows": ["Dance"], "wants_to_learn": []},
    }
    viewer = {
        **VIEWER,
        "hobbies": {"knows": [], "wants_to_learn": ["dance"]},
    }
    match = compatibility_with(viewer, candidate)
    assert match["matched_on"] == ["Knows Dance"]
    assert match["score"] == 40


def test_location_gathering_and_age_bonuses():
    candidate = {
        **VIEWER,
        "username": "neighbor",
        "first_name": "Neighbor",
        **_empty_topics(),
    }
    match = compatibility_with(VIEWER, candidate)
    assert match["score"] == 30  # 12 + 8 + 10
    assert "Lives in Seattle" in match["matched_on"]
    assert "Gathering 6-15" in match["matched_on"]
    assert "Similar age" in match["matched_on"]


def test_age_delta_between_6_and_12_adds_four_without_label():
    candidate = {
        **VIEWER,
        "location": "London",
        "age": 38,
        "gathering_size": "40+",
        **_empty_topics(),
    }
    match = compatibility_with(VIEWER, candidate)
    assert match["score"] == 4
    assert match["matched_on"] == []


def test_score_caps_at_100():
    candidate = {
        **VIEWER,
        "languages": {"knows": ["Spanish"], "wants_to_learn": ["English"]},
        "locations": {"knows": ["Chandigarh"], "wants_to_learn": ["Seattle"]},
        "hobbies": {"knows": ["Dance"], "wants_to_learn": ["Cooking"]},
        "interests": {"knows": ["Folk dance"], "wants_to_learn": ["Classical music"]},
        "festivals": {"knows": ["Holi"], "wants_to_learn": ["Diwali"]},
    }
    match = compatibility_with(VIEWER, candidate)
    assert match["score"] == 100


def test_learn_hits_cap_at_two_for_scoring():
    candidate = {
        **VIEWER,
        "location": "London",
        "age": 50,
        "gathering_size": "40+",
        **_empty_topics(),
        "languages": {"knows": [], "wants_to_learn": ["English"]},
        "hobbies": {"knows": [], "wants_to_learn": ["Cooking"]},
        "festivals": {"knows": [], "wants_to_learn": ["Diwali"]},
    }
    match = compatibility_with(VIEWER, candidate)
    # three learn hits listed, but only 2 * 6 points
    assert match["score"] == 12
    assert len([m for m in match["matched_on"] if m.startswith("Wants ")]) == 3


def test_rank_matches_sorts_by_score_then_first_name():
    peers = [
        {
            "user_id": "b",
            "username": "b",
            "first_name": "Bella",
            "location": "London",
            "age": 50,
            "gathering_size": "40+",
            **_empty_topics(),
            "hobbies": {"knows": ["Dance"], "wants_to_learn": []},
        },
        {
            "user_id": "a",
            "username": "a",
            "first_name": "Ada",
            "location": "London",
            "age": 50,
            "gathering_size": "40+",
            **_empty_topics(),
            "hobbies": {"knows": ["Dance"], "wants_to_learn": []},
        },
        {
            "user_id": "c",
            "username": "c",
            "first_name": "Cora",
            "location": "London",
            "age": 50,
            "gathering_size": "40+",
            **_empty_topics(),
        },
    ]
    ranked = rank_matches(VIEWER, peers, limit=10)
    assert [item["first_name"] for item in ranked] == ["Ada", "Bella", "Cora"]
    assert ranked[0]["compatibility_score"] == 40
    assert ranked[2]["compatibility_score"] == 0
    assert set(ranked[0]) == {
        "user_id",
        "username",
        "first_name",
        "location",
        "age",
        "gathering_size",
        "compatibility_score",
        "matched_on",
    }
    assert "hobbies" not in ranked[0]


def test_rank_matches_respects_limit():
    peers = [
        {
            "user_id": f"u{i}",
            "username": f"u{i}",
            "first_name": f"Person{i}",
            "location": "London",
            "age": 50,
            "gathering_size": "40+",
            **_empty_topics(),
        }
        for i in range(5)
    ]
    assert len(rank_matches(VIEWER, peers, limit=2)) == 2


def test_preference_topics_share_one_pool_and_duplicates_count_once():
    viewer = {
        **VIEWER,
        "location": "London",
        "age": 50,
        "gathering_size": "40+",
        **_empty_topics(),
        "interests": {"knows": [], "wants_to_learn": ["Cooking"]},
        "hobbies": {"knows": [], "wants_to_learn": ["Cooking"]},
    }
    candidate = {
        **VIEWER,
        "location": "Austin",
        "age": 70,
        "gathering_size": "2-5",
        **_empty_topics(),
        "hobbies": {"knows": ["Cooking"], "wants_to_learn": []},
        "interests": {"knows": ["cooking"], "wants_to_learn": []},
    }
    match = compatibility_with(viewer, candidate)
    assert match["matched_on"] == ["Knows Cooking"]
    assert match["score"] == 40

    languages_only = {
        **viewer,
        "hobbies": {"knows": [], "wants_to_learn": []},
        "interests": {"knows": [], "wants_to_learn": []},
        "languages": {"knows": [], "wants_to_learn": ["Cooking"]},
    }
    assert compatibility_with(languages_only, candidate)["matched_on"] == []


def test_parse_match_limit():
    assert parse_match_limit(None) == 10
    assert parse_match_limit("") == 10
    assert parse_match_limit("3") == 3
    assert parse_match_limit("99") == 50
    assert parse_match_limit("0") == 10
    assert parse_match_limit("nope") == 10
