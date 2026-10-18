"""Contact links and consented connections."""

import pytest


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

    def where(self, field, op, value):
        return MemoryQuery(self._docs, filters=[(field, op, value)])

    def stream(self):
        return [doc for doc in self._docs.values() if doc._data is not None]


class MemoryQuery:
    def __init__(self, docs, filters=None):
        self._docs = docs
        self._filters = list(filters or [])

    def stream(self):
        rows = [doc for doc in self._docs.values() if doc._data is not None]
        for field, op, value in self._filters:
            if op != "==":
                raise NotImplementedError(op)
            rows = [doc for doc in rows if (doc._data or {}).get(field) == value]
        return rows


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


@pytest.fixture(autouse=True)
def default_caller(monkeypatch):
    def read_local_user_id():
        from flask import request

        return (request.headers.get("X-User-Id") or "").strip() or "user_test"

    monkeypatch.setattr("app.auth.read_local_user_id", read_local_user_id)


def _profile(name="Amira", username="amira"):
    return {
        "username": username,
        "first_name": name,
        "location": "Seattle",
        "age": 28,
        "gathering_size": "6-15",
        "languages": {"knows": ["English"], "wants_to_learn": []},
        "locations": {"knows": [], "wants_to_learn": []},
        "hobbies": {"knows": ["Tabla"], "wants_to_learn": ["Dance"]},
        "interests": {"knows": [], "wants_to_learn": []},
        "festivals": {"knows": [], "wants_to_learn": []},
    }


def _onboard(client, user, name, username):
    response = client.put(
        "/api/onboarding",
        json=_profile(name, username),
        headers={"X-User-Id": user},
    )
    assert response.status_code == 201
    return response


def _contact(client, user, body):
    return client.put("/api/contact", json=body, headers={"X-User-Id": user})


def test_get_contact_does_not_create_a_document(client, fake_firestore):
    response = client.get("/api/contact", headers={"X-User-Id": "user_test"})
    assert response.status_code == 200
    assert response.get_json()["instagram"] == ""
    assert response.get_json()["facebook"] == ""
    assert response.get_json()["updated_at"] is None
    stored = (
        fake_firestore.collection("users")
        .document("user_test")
        .collection("profile")
        .document("contact")
    )
    assert stored.exists is False


def test_put_contact_stores_handles_and_strips_at(client):
    saved = _contact(
        client,
        "user_test",
        {
            "instagram": "@Amira.Learns",
            "discord": "amira",
            "snapchat": "",
            "preferred": "discord",
            "reach_note": "I answer Discord in the evening.",
        },
    )
    assert saved.status_code == 200
    body = saved.get_json()
    assert body["instagram"] == "Amira.Learns"
    assert body["discord"] == "amira"
    assert body["preferred"] == "discord"
    assert body["reach_note"] == "I answer Discord in the evening."
    assert body["updated_at"]

    read = client.get("/api/contact", headers={"X-User-Id": "user_test"})
    assert read.get_json()["instagram"] == "Amira.Learns"


def test_contact_rejects_a_link_and_a_preferred_channel_without_a_handle(client):
    linked = _contact(client, "user_test", {"instagram": "https://instagram.com/amira"})
    assert linked.status_code == 400
    assert "username" in linked.get_json()["error"]

    missing = _contact(client, "user_test", {"preferred": "instagram"})
    assert missing.status_code == 400
    assert missing.get_json()["error"] == "instagram is required when it is the preferred way to reach you"

    extra = _contact(client, "user_test", {"user_id": "user_other", "preferred": "orbit"})
    assert extra.status_code == 400
    assert extra.get_json()["error"] == "unexpected field: user_id"


def test_facebook_is_a_username_and_required_when_preferred(client):
    saved = _contact(
        client,
        "user_test",
        {"facebook": "@Amira.Learns", "preferred": "facebook"},
    )
    assert saved.status_code == 200
    body = saved.get_json()
    assert body["facebook"] == "Amira.Learns"
    assert body["preferred"] == "facebook"
    assert body["instagram"] == ""

    linked = _contact(client, "user_test", {"facebook": "https://facebook.com/amira.learns"})
    assert linked.status_code == 400
    assert "username" in linked.get_json()["error"]

    short = _contact(client, "user_test", {"facebook": "amir"})
    assert short.status_code == 400
    assert short.get_json()["error"] == "facebook username is not valid"

    missing = _contact(client, "user_test", {"preferred": "facebook"})
    assert missing.status_code == 400
    assert missing.get_json()["error"] == "facebook is required when it is the preferred way to reach you"


def test_orbit_preference_does_not_require_a_handle(client):
    saved = _contact(client, "user_test", {"preferred": "orbit", "reach_note": "Message me here."})
    assert saved.status_code == 200
    assert saved.get_json()["preferred"] == "orbit"
    assert saved.get_json()["instagram"] == ""


def test_connection_hides_social_links_until_accept(client):
    _onboard(client, "user_a", "Amira", "amira")
    _onboard(client, "user_b", "Luis", "luis")
    assert _contact(
        client,
        "user_b",
        {"instagram": "luis.plays", "preferred": "instagram"},
    ).status_code == 200

    created = client.post(
        "/api/connections",
        json={"to_user_id": "user_b", "intro": "Want to try tabla Thursday?"},
        headers={"X-User-Id": "user_a"},
    )
    assert created.status_code == 201
    pending = created.get_json()
    assert pending["status"] == "pending"
    assert pending["contact"] is None
    assert pending["other"]["first_name"] == "Luis"
    connection_id = pending["id"]

    inbox = client.get("/api/connections?box=inbox", headers={"X-User-Id": "user_b"})
    assert inbox.status_code == 200
    assert inbox.get_json()["connections"][0]["intro"] == "Want to try tabla Thursday?"
    assert inbox.get_json()["connections"][0]["contact"] is None

    outbox = client.get("/api/connections?box=outbox", headers={"X-User-Id": "user_a"})
    assert outbox.get_json()["connections"][0]["id"] == connection_id

    early = client.get(
        f"/api/connections/{connection_id}/messages",
        headers={"X-User-Id": "user_b"},
    )
    assert early.status_code == 403
    assert early.get_json()["error"] == "messages open after you both accept"

    sender = client.post(
        f"/api/connections/{connection_id}/accept",
        headers={"X-User-Id": "user_a"},
    )
    assert sender.status_code == 403

    accepted = client.post(
        f"/api/connections/{connection_id}/accept",
        headers={"X-User-Id": "user_b"},
    )
    assert accepted.status_code == 200
    assert accepted.get_json()["status"] == "accepted"
    assert accepted.get_json()["other"]["first_name"] == "Amira"
    assert accepted.get_json()["contact"]["instagram"] == ""

    friends = client.get("/api/connections?box=friends", headers={"X-User-Id": "user_a"})
    shown = friends.get_json()["connections"][0]["contact"]
    assert shown["instagram"] == "luis.plays"
    assert shown["preferred"] == "instagram"

    stranger = client.get(
        f"/api/connections/{connection_id}/messages",
        headers={"X-User-Id": "user_c"},
    )
    assert stranger.status_code == 403


def test_messages_open_for_both_people_after_accept(client):
    _onboard(client, "user_a", "Amira", "amira")
    _onboard(client, "user_b", "Luis", "luis")
    created = client.post(
        "/api/connections",
        json={"to_user_id": "user_b"},
        headers={"X-User-Id": "user_a"},
    )
    connection_id = created.get_json()["id"]
    assert client.post(
        f"/api/connections/{connection_id}/accept",
        headers={"X-User-Id": "user_b"},
    ).status_code == 200

    sent = client.post(
        f"/api/connections/{connection_id}/messages",
        json={"text": "Thursday after 6?"},
        headers={"X-User-Id": "user_a"},
    )
    assert sent.status_code == 201
    assert sent.get_json()["mine"] is True

    reply = client.post(
        f"/api/connections/{connection_id}/messages",
        json={"text": "Library works."},
        headers={"X-User-Id": "user_b"},
    )
    assert reply.status_code == 201

    listing = client.get(
        f"/api/connections/{connection_id}/messages",
        headers={"X-User-Id": "user_b"},
    )
    messages = listing.get_json()["messages"]
    assert [item["text"] for item in messages] == ["Thursday after 6?", "Library works."]
    assert [item["mine"] for item in messages] == [False, True]


def test_reject_lets_either_person_ask_again(client):
    _onboard(client, "user_a", "Amira", "amira")
    _onboard(client, "user_b", "Luis", "luis")
    first = client.post(
        "/api/connections",
        json={"to_user_id": "user_b", "intro": "First try"},
        headers={"X-User-Id": "user_a"},
    )
    connection_id = first.get_json()["id"]
    declined = client.post(
        f"/api/connections/{connection_id}/reject",
        headers={"X-User-Id": "user_b"},
    )
    assert declined.status_code == 200
    assert declined.get_json()["status"] == "rejected"

    again = client.post(
        "/api/connections",
        json={"to_user_id": "user_a", "intro": "Want to try next week?"},
        headers={"X-User-Id": "user_b"},
    )
    assert again.status_code == 201
    assert again.get_json()["id"] == connection_id
    assert again.get_json()["from_user_id"] == "user_b"
    assert again.get_json()["status"] == "pending"

    duplicate = client.post(
        "/api/connections",
        json={"to_user_id": "user_a"},
        headers={"X-User-Id": "user_b"},
    )
    assert duplicate.status_code == 409


def test_connection_rejects_self_unknown_people_and_extra_fields(client):
    _onboard(client, "user_a", "Amira", "amira")
    self_request = client.post(
        "/api/connections",
        json={"to_user_id": "user_a"},
        headers={"X-User-Id": "user_a"},
    )
    assert self_request.status_code == 400

    missing = client.post(
        "/api/connections",
        json={"to_user_id": "user_missing"},
        headers={"X-User-Id": "user_a"},
    )
    assert missing.status_code == 404
    assert missing.get_json()["error"] == "that person is not on Orbit"

    extra = client.post(
        "/api/connections",
        json={"to_user_id": "user_missing", "user_id": "user_a"},
        headers={"X-User-Id": "user_a"},
    )
    assert extra.status_code == 400
    assert extra.get_json()["error"] == "unexpected field: user_id"

    needs_profile = client.post(
        "/api/connections",
        json={"to_user_id": "user_a"},
        headers={"X-User-Id": "user_new"},
    )
    assert needs_profile.status_code == 404
    assert needs_profile.get_json()["error"] == "onboarding profile not found"
