"""GET /api/events/nearby when Ticketmaster is unavailable."""

import pytest

from app.ticketmaster import TicketmasterError


class MemoryDocument:
    def __init__(self, doc_id):
        self.id = doc_id
        self._data = None
        self._collections = {}

    @property
    def exists(self):
        return self._data is not None

    def collection(self, name):
        return self._collections.setdefault(name, MemoryCollection())

    def set(self, data):
        self._data = dict(data)

    def get(self):
        return self

    def to_dict(self):
        if self._data is None:
            return None
        return dict(self._data)


class MemoryCollection:
    def __init__(self):
        self._docs = {}

    def document(self, doc_id):
        return self._docs.setdefault(doc_id, MemoryDocument(doc_id))


class MemoryFirestore:
    def __init__(self):
        self._collections = {}

    def collection(self, name):
        return self._collections.setdefault(name, MemoryCollection())


@pytest.fixture(autouse=True)
def fake_firestore(monkeypatch):
    client = MemoryFirestore()
    monkeypatch.setattr("app.firebase._firestore", None)
    monkeypatch.setattr("app.firebase.firestore_client", lambda: client)
    return client


def _profile():
    return {
        "username": "amira",
        "first_name": "Amira",
        "location": "Seattle",
        "age": 28,
        "gathering_size": "6-15",
        "languages": {"knows": ["English"], "wants_to_learn": []},
        "locations": {"knows": ["Seattle"], "wants_to_learn": []},
        "hobbies": {"knows": ["Dance"], "wants_to_learn": ["Live music"]},
        "interests": {"knows": [], "wants_to_learn": []},
        "festivals": {"knows": [], "wants_to_learn": []},
    }


def test_nearby_events_without_a_key_returns_seeded_seattle_events(client, monkeypatch):
    monkeypatch.setitem(client.application.config, "TICKETMASTER_API_KEY", "")
    saved = client.put(
        "/api/onboarding",
        json=_profile(),
        headers={"X-User-Id": "user_test"},
    )
    assert saved.status_code == 201

    response = client.get("/api/events/nearby", headers={"X-User-Id": "user_test"})

    assert response.status_code == 200
    body = response.get_json()
    assert body["city"] == "Seattle"
    assert body["preferences"] == ["Dance", "Live music", "English"]
    assert len(body["events"]) == 2
    dance, live = body["events"]
    assert dance == {
        "title": "Dance show",
        "venue": "The Crocodile",
        "city": "Seattle",
        "starts_at": "2026-10-24T02:00:00Z",
        "external_source": "seed",
        "external_id": "seed-seattle-dance",
        "url": "",
    }
    assert live["external_id"] == "seed-seattle-live"
    assert live["city"] == "Seattle"
    assert live["title"] == "Live music gathering"
    assert live["venue"] == "The Vera Project"
    assert live["starts_at"] == "2026-10-25T02:00:00Z"
    assert live["url"] == ""


def test_nearby_events_seeds_when_ticketmaster_fails(client, monkeypatch):
    monkeypatch.setitem(client.application.config, "TICKETMASTER_API_KEY", "test-key")

    def fail(api_key, city, keywords):
        raise TicketmasterError("Ticketmaster did not return events")

    monkeypatch.setattr("app.routes.events.search_events", fail)
    saved = client.put(
        "/api/onboarding",
        json=_profile(),
        headers={"X-User-Id": "user_test"},
    )
    assert saved.status_code == 201

    response = client.get("/api/events/nearby", headers={"X-User-Id": "user_test"})

    assert response.status_code == 200
    ids = [event["external_id"] for event in response.get_json()["events"]]
    assert ids == ["seed-seattle-dance", "seed-seattle-live"]
