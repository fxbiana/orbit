"""GET /api/matches endpoint tests."""

from datetime import datetime, timezone

import pytest


class MemoryReference:
    def __init__(self, path: str):
        self.path = path


class MemoryDocument:
    def __init__(self, doc_id, parent_path=""):
        self.id = doc_id
        self._parent_path = parent_path
        self._data = None
        self._collections = {}

    @property
    def exists(self):
        return self._data is not None

    @property
    def path(self):
        if self._parent_path:
            return f"{self._parent_path}/{self.id}"
        return self.id

    @property
    def reference(self):
        return MemoryReference(self.path)

    def collection(self, name):
        child_path = self.path
        return self._collections.setdefault(name, MemoryCollection(child_path, name))

    def set(self, data):
        self._data = dict(data)

    def get(self):
        return self

    def to_dict(self):
        if self._data is None:
            return None
        return dict(self._data)


class MemoryCollection:
    def __init__(self, parent_path="", name=""):
        self._parent_path = parent_path
        self._name = name
        self._docs = {}

    def document(self, doc_id):
        path_prefix = f"{self._parent_path}/{self._name}" if self._name else self._parent_path
        if not path_prefix:
            path_prefix = self._name
        return self._docs.setdefault(doc_id, MemoryDocument(doc_id, path_prefix))

    def order_by(self, field, direction=None):
        return MemoryQuery(self._docs, field, direction)

    def stream(self):
        return [doc for doc in self._docs.values() if doc._data is not None]


class MemoryQuery:
    def __init__(self, docs, field, direction):
        self._docs = docs
        self._field = field
        self._descending = direction == "DESCENDING"

    def stream(self):
        rows = [doc for doc in self._docs.values() if doc._data is not None]
        rows.sort(key=lambda doc: doc._data.get(self._field), reverse=self._descending)
        return rows


class MemoryCollectionGroup:
    def __init__(self, root, name):
        self._root = root
        self._name = name

    def stream(self):
        yield from self._walk(self._root._collections)

    def _walk(self, collections):
        for coll_name, coll in collections.items():
            if coll_name == self._name:
                for doc in coll._docs.values():
                    if doc._data is not None:
                        yield doc
            for doc in coll._docs.values():
                yield from self._walk(doc._collections)


class MemoryFirestore:
    def __init__(self):
        self._collections = {}

    def collection(self, name):
        return self._collections.setdefault(name, MemoryCollection("", name))

    def collection_group(self, name):
        return MemoryCollectionGroup(self, name)


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


def _profile(**overrides):
    body = {
        "username": "amira",
        "first_name": "Amira",
        "location": "Seattle",
        "age": 28,
        "gathering_size": "6-15",
        "languages": {"knows": ["English"], "wants_to_learn": ["Spanish"]},
        "locations": {"knows": ["Seattle"], "wants_to_learn": []},
        "hobbies": {"knows": ["Cooking"], "wants_to_learn": ["Dance"]},
        "interests": {"knows": [], "wants_to_learn": []},
        "festivals": {"knows": [], "wants_to_learn": []},
    }
    body.update(overrides)
    return body


def _put(client, body=None, user="user_test"):
    return client.put(
        "/api/onboarding",
        json=_profile() if body is None else body,
        headers={"X-User-Id": user},
    )


def test_get_matches_is_404_when_caller_has_no_onboarding(client):
    response = client.get("/api/matches")
    assert response.status_code == 404
    assert response.get_json()["error"] == "onboarding profile not found"


def test_get_matches_returns_empty_list_when_no_peers(client):
    assert _put(client).status_code == 201
    response = client.get("/api/matches")
    assert response.status_code == 200
    assert response.get_json() == {"matches": []}


def test_get_matches_excludes_the_caller(client):
    assert _put(client).status_code == 201
    response = client.get("/api/matches")
    assert response.status_code == 200
    assert response.get_json()["matches"] == []


def test_get_matches_scores_and_ranks_peers(client):
    assert _put(client).status_code == 201
    assert (
        _put(
            client,
            _profile(
                username="teacher",
                first_name="Zed",
                location="London",
                age=50,
                gathering_size="40+",
                hobbies={"knows": ["Dance"], "wants_to_learn": []},
                languages={"knows": [], "wants_to_learn": []},
            ),
            user="user_teacher",
        ).status_code
        == 201
    )
    assert (
        _put(
            client,
            _profile(
                username="neighbor",
                first_name="Ada",
                location="Seattle",
                age=27,
                gathering_size="6-15",
                hobbies={"knows": ["Dance"], "wants_to_learn": []},
                languages={"knows": ["Spanish"], "wants_to_learn": []},
            ),
            user="user_neighbor",
        ).status_code
        == 201
    )

    response = client.get("/api/matches")
    assert response.status_code == 200
    body = response.get_json()
    matches = body["matches"]
    assert len(matches) == 2
    assert matches[0]["user_id"] == "user_neighbor"
    assert matches[0]["first_name"] == "Ada"
    assert matches[0]["compatibility_score"] > matches[1]["compatibility_score"]
    assert "Knows Dance" in matches[0]["matched_on"]
    assert "Knows Spanish" in matches[0]["matched_on"]
    assert set(matches[0]) == {
        "user_id",
        "username",
        "first_name",
        "location",
        "age",
        "gathering_size",
        "compatibility_score",
        "matched_on",
    }
    assert "hobbies" not in matches[0]
    assert matches[1]["user_id"] == "user_teacher"
    assert matches[1]["matched_on"] == ["Knows Dance"]


def test_get_matches_respects_limit(client):
    assert _put(client).status_code == 201
    for i in range(5):
        assert (
            _put(
                client,
                _profile(
                    username=f"peer{i}",
                    first_name=f"Peer{i}",
                    location="London",
                    age=50,
                    gathering_size="40+",
                    hobbies={"knows": ["Dance"], "wants_to_learn": []},
                ),
                user=f"user_peer_{i}",
            ).status_code
            == 201
        )

    response = client.get("/api/matches?limit=2")
    assert response.status_code == 200
    assert len(response.get_json()["matches"]) == 2


def test_get_matches_when_firestore_fails(client, monkeypatch):
    assert _put(client).status_code == 201

    class Boom:
        def collection_group(self, _name):
            raise RuntimeError("firestore unavailable")

    monkeypatch.setattr("app.firebase.firestore_client", lambda: Boom())
    response = client.get("/api/matches")
    assert response.status_code == 503
    assert response.get_json()["error"] == "Firestore request failed"
