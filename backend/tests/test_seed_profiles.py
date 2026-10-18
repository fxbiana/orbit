from seed_profiles import document_for, load_sample_people


def test_sample_people_match_the_onboarding_schema():
    people = load_sample_people()

    assert len(people) == 100
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
