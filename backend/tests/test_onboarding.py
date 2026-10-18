from datetime import datetime, timezone

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

    def order_by(self, field, direction=None):
        return MemoryQuery(self._docs, field, direction)


class MemoryQuery:
    def __init__(self, docs, field, direction):
        self._docs = docs
        self._field = field
        self._descending = direction == "DESCENDING"

    def stream(self):
        rows = [doc for doc in self._docs.values() if doc._data is not None]
        rows.sort(key=lambda doc: doc._data.get(self._field), reverse=self._descending)
        return rows


class MemoryFirestore:
    def __init__(self):
        self._collections = {}

    def collection(self, name):
        return self._collections.setdefault(name, MemoryCollection())


class _Clock:
    def __init__(self):
        self._second = 0

    def now(self, tz=None):
        self._second += 1
        return datetime(2026, 1, 1, 0, 0, self._second, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def fake_firestore(monkeypatch):
    client = MemoryFirestore()
    monkeypatch.setattr("app.firebase._firestore", None)
    monkeypatch.setattr("app.firebase.firestore_client", lambda: client)
    return client


@pytest.fixture(autouse=True)
def default_caller(monkeypatch):
    """Requests without X-User-Id act as user_test. A header selects another caller."""

    def read_local_user_id():
        from flask import request

        return (request.headers.get("X-User-Id") or "").strip() or "user_test"

    monkeypatch.setattr("app.auth.read_local_user_id", read_local_user_id)


def _profile(**overrides):
    body = {
        "username": "amira",
        "first_name": "Amira",
        "location": "Seattle",
        "age": 28,
        "gathering_size": "6-15",
        "languages": {"knows": ["Hindi", "English"], "wants_to_learn": ["Punjabi"]},
        "locations": {"knows": ["Chandigarh"], "wants_to_learn": ["Seattle"]},
        "hobbies": {"knows": ["Cooking"], "wants_to_learn": ["Tabla"]},
        "interests": {"knows": ["Classical music"], "wants_to_learn": ["Folk dance"]},
        "festivals": {"knows": ["Diwali"], "wants_to_learn": ["Holi"]},
    }
    body.update(overrides)
    return body


def _put(client, body=None, user="user_test"):
    return client.put(
        "/api/onboarding",
        json=_profile() if body is None else body,
        headers={"X-User-Id": user},
    )


def test_get_onboarding_is_404_when_missing(client):
    response = client.get("/api/onboarding")
    assert response.status_code == 404
    assert response.get_json()["error"] == "onboarding profile not found"


def test_put_onboarding_requires_json_object(client):
    response = client.put("/api/onboarding", json=["amira"])
    assert response.status_code == 400
    assert response.get_json()["error"] == "JSON object is required"


def test_put_onboarding_requires_a_username(client):
    body = _profile()
    del body["username"]
    response = _put(client, body)
    assert response.status_code == 400
    assert response.get_json()["error"] == "username is required"


def test_put_onboarding_requires_a_first_name(client):
    response = _put(client, _profile(first_name="   "))
    assert response.status_code == 400
    assert response.get_json()["error"] == "first_name is required"


def test_put_onboarding_requires_a_location(client):
    response = _put(client, _profile(location="  "))
    assert response.status_code == 400
    assert response.get_json()["error"] == "location is required"


def test_put_onboarding_rejects_a_long_location(client):
    response = _put(client, _profile(location="s" * 81))
    assert response.status_code == 400
    assert response.get_json()["error"] == "location is too long"


def test_put_onboarding_requires_an_age(client):
    body = _profile()
    del body["age"]
    response = _put(client, body)
    assert response.status_code == 400
    assert response.get_json()["error"] == "age is required"


def test_put_onboarding_rejects_an_age_that_is_not_an_integer(client):
    response = _put(client, _profile(age="28"))
    assert response.status_code == 400
    assert response.get_json()["error"] == "age must be an integer"

    response = _put(client, _profile(age=True))
    assert response.status_code == 400
    assert response.get_json()["error"] == "age must be an integer"


def test_put_onboarding_rejects_an_age_out_of_range(client):
    response = _put(client, _profile(age=12))
    assert response.status_code == 400
    assert response.get_json()["error"] == "age is out of range"

    response = _put(client, _profile(age=121))
    assert response.status_code == 400
    assert response.get_json()["error"] == "age is out of range"


def test_put_onboarding_rejects_an_unknown_gathering_size(client):
    response = _put(client, _profile(gathering_size="huge"))
    assert response.status_code == 400
    assert response.get_json()["error"] == "gathering_size must be one of: 2-5, 6-15, 16-40, 40+"


def test_put_onboarding_rejects_a_long_username(client):
    response = _put(client, _profile(username="a" * 41))
    assert response.status_code == 400
    assert response.get_json()["error"] == "username is too long"


def test_put_onboarding_rejects_a_user_id_in_the_body(client):
    response = _put(client, _profile(user_id="user_other"))
    assert response.status_code == 400
    assert response.get_json()["error"] == "unexpected field: user_id"


def test_put_onboarding_rejects_a_topic_that_is_not_an_object(client):
    response = _put(client, _profile(languages=["Hindi"]))
    assert response.status_code == 400
    assert response.get_json()["error"] == "languages must be an object"


def test_put_onboarding_rejects_a_non_string_item(client):
    response = _put(client, _profile(festivals={"knows": ["Diwali", 1], "wants_to_learn": []}))
    assert response.status_code == 400
    assert response.get_json()["error"] == "festivals.knows items must be strings"


def test_put_onboarding_rejects_too_many_items(client):
    response = _put(
        client,
        _profile(hobbies={"knows": ["hobby"] * 21, "wants_to_learn": []}),
    )
    assert response.status_code == 400
    assert response.get_json()["error"] == "hobbies.knows has too many items"


def test_put_onboarding_rejects_a_long_item(client):
    response = _put(
        client,
        _profile(interests={"knows": ["x" * 81], "wants_to_learn": []}),
    )
    assert response.status_code == 400
    assert response.get_json()["error"] == "interests.knows item is too long"


def test_put_onboarding_creates_a_profile(client):
    response = _put(client)
    assert response.status_code == 201
    body = response.get_json()
    assert set(body) == {
        "user_id",
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
        "created_at",
        "updated_at",
    }
    assert body["user_id"] == "user_test"
    assert body["username"] == "amira"
    assert body["first_name"] == "Amira"
    assert body["location"] == "Seattle"
    assert body["age"] == 28
    assert body["gathering_size"] == "6-15"
    assert body["languages"] == {"knows": ["Hindi", "English"], "wants_to_learn": ["Punjabi"]}
    assert body["festivals"]["knows"] == ["Diwali"]
    assert body["festivals"]["wants_to_learn"] == ["Holi"]
    assert body["created_at"]
    assert body["created_at"] == body["updated_at"]

    saved = client.get("/api/onboarding")
    assert saved.status_code == 200
    assert saved.get_json() == body


def test_put_onboarding_normalizes_lists(client):
    response = _put(
        client,
        _profile(
            username="  amira   kaur  ",
            festivals={"knows": ["  Diwali  ", "diwali", ""], "wants_to_learn": ["Holi"]},
        ),
    )
    assert response.status_code == 400
    assert response.get_json()["error"] == "festivals.knows has an empty item"

    response = _put(
        client,
        _profile(
            username="  amira   kaur  ",
            festivals={"knows": ["  Diwali  ", "diwali"], "wants_to_learn": ["Holi", "Holi"]},
        ),
    )
    assert response.status_code == 201
    body = response.get_json()
    assert body["username"] == "amira kaur"
    assert body["festivals"] == {"knows": ["Diwali"], "wants_to_learn": ["Holi"]}


def test_put_onboarding_fills_omitted_topics(client):
    response = _put(
        client,
        {
            "username": "amira",
            "first_name": "Amira",
            "location": "  Seattle  ",
            "age": 13,
            "gathering_size": "40+",
        },
    )
    assert response.status_code == 201
    body = response.get_json()
    assert body["location"] == "Seattle"
    assert body["age"] == 13
    assert body["gathering_size"] == "40+"
    for key in ("languages", "locations", "hobbies", "interests", "festivals"):
        assert body[key] == {"knows": [], "wants_to_learn": []}


def test_put_onboarding_keeps_created_at(client, monkeypatch):
    monkeypatch.setattr("app.firebase.datetime", _Clock())
    first = _put(client)
    second = _put(client, _profile(username="amira2", first_name="Ami"))
    assert first.status_code == 201
    assert second.status_code == 200
    assert second.get_json()["created_at"] == first.get_json()["created_at"]
    assert second.get_json()["updated_at"] > first.get_json()["updated_at"]
    assert second.get_json()["username"] == "amira2"
    assert second.get_json()["first_name"] == "Ami"
    assert client.get("/api/onboarding").get_json()["username"] == "amira2"


def test_onboarding_profiles_are_private_to_each_user(client):
    mine = _put(client, _profile(username="amira"))
    theirs = _put(client, _profile(username="jordan", first_name="Jordan"), user="user_other")
    assert mine.status_code == 201
    assert theirs.status_code == 201

    mine_read = client.get("/api/onboarding")
    assert mine_read.status_code == 200
    assert mine_read.get_json()["username"] == "amira"
    assert mine_read.get_json()["user_id"] == "user_test"

    theirs_read = client.get("/api/onboarding", headers={"X-User-Id": "user_other"})
    assert theirs_read.status_code == 200
    assert theirs_read.get_json()["username"] == "jordan"
    assert theirs_read.get_json()["user_id"] == "user_other"


def test_onboarding_profile_is_not_a_ticket(client):
    created = _put(client)
    assert created.status_code == 201
    tickets = client.get("/api/tickets")
    assert tickets.status_code == 200
    assert tickets.get_json()["tickets"] == []


def test_get_onboarding_when_firestore_fails(client, monkeypatch):
    class Boom:
        def collection(self, _name):
            return self

        def document(self, _name):
            return self

        def get(self):
            raise RuntimeError("firestore unavailable")

    monkeypatch.setattr("app.firebase.firestore_client", lambda: Boom())
    response = client.get("/api/onboarding")
    assert response.status_code == 503
    assert response.get_json()["error"] == "Firestore request failed"


def test_put_onboarding_when_firestore_fails(client, monkeypatch):
    class Boom:
        def collection(self, _name):
            return self

        def document(self, _name):
            return self

        def get(self):
            raise RuntimeError("firestore unavailable")

    monkeypatch.setattr("app.firebase.firestore_client", lambda: Boom())
    response = _put(client)
    assert response.status_code == 503
    assert response.get_json()["error"] == "Firestore request failed"
