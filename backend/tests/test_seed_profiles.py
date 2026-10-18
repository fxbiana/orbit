from app.connections import CONNECTION_ID, pair_id

from seed_profiles import (
    DEMO_PLAN_ID,
    DEMO_USER_ID,
    SAMPLE_PEOPLE_PATH,
    demo_seed_documents,
    document_for,
    load_sample_people,
)


def test_sample_people_match_the_onboarding_schema():
    assert SAMPLE_PEOPLE_PATH.is_file()
    people = load_sample_people()

    assert len(people) == 100
    assert people[0]["id"] == "1ec93661-7c2e-413f-8fde-908dcf28e4ba"
    assert people[0]["first_name"] == "Amira"
    user_ids = []
    for person in people:
        user_id, profile = document_for(person)
        user_ids.append(user_id)
        assert set(profile) == {
            "username",
            "first_name",
            "location",
            "age",
            "gathering_size",
            "languages",
            "locations",
            "hobbies",
            "interests",
            "festivals",
        }
        assert "compatibility_score" not in profile
        assert "matched_on" not in profile
        assert profile["hobbies"]["knows"]
    assert len(set(user_ids)) == 100


def test_demo_seed_is_an_open_show_and_a_pending_request():
    people = load_sample_people()
    demo = demo_seed_documents(people)
    host_id, _profile = document_for(people[0])
    from_id, _profile = document_for(people[1])

    assert demo["plan_id"] == DEMO_PLAN_ID
    plan = demo["plan"]
    assert plan["title"] == "Diwali dance night"
    assert plan["activity_type"] == "show"
    assert plan["location_text"] == "Seattle"
    assert plan["capacity"] == 4
    assert plan["status"] == "open"
    assert plan["host_id"] == host_id
    assert plan["starts_at"].startswith("2026-10-")
    assert "compatibility_score" not in plan
    assert "matched_on" not in plan

    assert demo["member_id"] == host_id
    assert demo["member"] == {"role": "host"}

    assert demo["connection_id"] == pair_id(from_id, DEMO_USER_ID)
    assert CONNECTION_ID.fullmatch(demo["connection_id"])
    connection = demo["connection"]
    assert connection == {
        "from_user_id": from_id,
        "to_user_id": DEMO_USER_ID,
        "status": "pending",
        "intro": "Want to come to Diwali dance night?",
        "responded_at": None,
    }
    assert connection["status"] != "accepted"
    for handle in ("instagram", "discord", "snapchat", "facebook", "contact"):
        assert handle not in connection
