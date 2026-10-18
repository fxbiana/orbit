import json

from app.ticketmaster import preference_keywords, search_events


def test_preference_keywords_skip_the_home_city_and_place_topic():
    profile = {
        "location": "Seattle",
        "interests": {"knows": ["Jazz", "Seattle"], "wants_to_learn": ["jazz", "Cooking"]},
        "hobbies": {"knows": ["Dance"], "wants_to_learn": []},
        "festivals": {"knows": [], "wants_to_learn": []},
        "languages": {"knows": ["Spanish"], "wants_to_learn": []},
        "locations": {"knows": ["Montreal"], "wants_to_learn": []},
    }

    assert preference_keywords(profile) == ["Jazz", "Cooking", "Dance", "Spanish"]


def test_search_events_maps_and_dedupes_discovery_payloads():
    calls = []

    def opener(request, timeout=None):
        calls.append(request.full_url)
        keyword = "cooking" if "cooking" in request.full_url else "jazz"
        event_id = "shared" if keyword == "jazz" else "cook-1"
        payload = {
            "_embedded": {
                "events": [
                    {
                        "id": event_id,
                        "name": "Night show",
                        "url": "https://www.ticketmaster.com/night",
                        "dates": {"start": {"dateTime": "2026-11-02T02:00:00Z"}},
                        "_embedded": {"venues": [{"name": "The Crocodile", "city": {"name": "Seattle"}}]},
                    }
                ]
            }
        }

        class _Body:
            def read(self):
                return json.dumps(payload).encode()

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

        return _Body()

    events = search_events("test-key", "Seattle", ["Jazz", "Cooking"], opener)

    assert len(calls) == 2
    assert "apikey=test-key" in calls[0]
    assert "city=Seattle" in calls[0]
    assert events[0]["external_id"] in {"shared", "cook-1"}
    assert events[0]["external_source"] == "ticketmaster"
    assert events[0]["venue"] == "The Crocodile"
    assert events[0]["city"] == "Seattle"
    assert len({event["external_id"] for event in events}) == len(events)


def test_nearby_events_uses_saved_preferences(client, monkeypatch):
    monkeypatch.setitem(client.application.config, "TICKETMASTER_API_KEY", "test-key")
    monkeypatch.setattr(
        "app.routes.events.get_onboarding",
        lambda user_id: {
            "location": "Seattle",
            "interests": {"knows": ["Jazz"], "wants_to_learn": []},
            "hobbies": {"knows": [], "wants_to_learn": []},
            "festivals": {"knows": [], "wants_to_learn": []},
            "languages": {"knows": [], "wants_to_learn": []},
        },
    )
    monkeypatch.setattr(
        "app.routes.events.search_events",
        lambda api_key, city, keywords: [
            {
                "title": "Jazz night",
                "venue": "The Crocodile",
                "city": city,
                "starts_at": "2026-11-02T02:00:00Z",
                "external_source": "ticketmaster",
                "external_id": "vv1",
                "url": "https://www.ticketmaster.com/jazz",
            }
        ],
    )

    response = client.get("/api/events/nearby", headers={"X-User-Id": "user_test"})

    assert response.status_code == 200
    body = response.get_json()
    assert body["city"] == "Seattle"
    assert body["preferences"] == ["Jazz"]
    assert body["events"][0]["title"] == "Jazz night"


def test_nearby_events_seeds_when_the_key_is_missing(client, monkeypatch):
    monkeypatch.setitem(client.application.config, "TICKETMASTER_API_KEY", "")
    monkeypatch.setattr(
        "app.routes.events.get_onboarding",
        lambda user_id: {"location": "Seattle", "interests": {"knows": [], "wants_to_learn": []}},
    )

    response = client.get("/api/events/nearby", headers={"X-User-Id": "user_test"})

    assert response.status_code == 200
    events = response.get_json()["events"]
    assert [event["external_id"] for event in events] == [
        "seed-seattle-dance",
        "seed-seattle-live",
    ]
