import pytest

from seed_profiles import WEB, _esbuild_bin, document_for, load_sample_people


def test_sample_people_match_the_onboarding_schema():
    people = load_sample_people()

    assert len(people) == 100
    assert (WEB / "src/sampleProfiles.ts").is_file()
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
    assert people[0]["first_name"] == "Amira"
    assert people[0]["id"] == "1ec93661-7c2e-413f-8fde-908dcf28e4ba"


def test_esbuild_bin_errors_when_missing(monkeypatch, tmp_path):
    monkeypatch.setattr("seed_profiles.shutil.which", lambda _name: None)
    monkeypatch.setattr("seed_profiles.WEB", tmp_path)
    with pytest.raises(FileNotFoundError, match="esbuild not found"):
        _esbuild_bin()
