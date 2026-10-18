"""Open plans API tests."""

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

    def where(self, field, op, value):
        return MemoryQuery(self._docs, filters=[(field, op, value)])

    def order_by(self, field, direction=None):
        return MemoryQuery(self._docs, order=(field, direction))

    def stream(self):
        return [doc for doc in self._docs.values() if doc._data is not None]


class MemoryQuery:
    def __init__(self, docs, filters=None, order=None):
        self._docs = docs
        self._filters = list(filters or [])
        self._order = order

    def where(self, field, op, value):
        return MemoryQuery(self._docs, filters=self._filters + [(field, op, value)], order=self._order)

    def order_by(self, field, direction=None):
        return MemoryQuery(self._docs, filters=self._filters, order=(field, direction))

    def stream(self):
        rows = [doc for doc in self._docs.values() if doc._data is not None]
        for field, op, value in self._filters:
            if op != "==":
                raise NotImplementedError(op)
            rows = [doc for doc in rows if (doc._data or {}).get(field) == value]
        if self._order is not None:
            field, direction = self._order
            descending = direction == "DESCENDING"
            rows.sort(key=lambda doc: doc._data.get(field), reverse=descending)
        return rows


class MemoryFirestore:
    def __init__(self):
        self._collections = {}

    def collection(self, name):
        return self._collections.setdefault(name, MemoryCollection("", name))


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
    def read_local_user_id():
        from flask import request

        return (request.headers.get("X-User-Id") or "").strip() or "user_test"

    monkeypatch.setattr("app.auth.read_local_user_id", read_local_user_id)


def _plan_body(**overrides):
    body = {
        "title": "Coffee at Cafe Vita",
        "activity_type": "coffee",
        "location_text": "Seattle",
        "capacity": 6,
    }
    body.update(overrides)
    return body


def _post_plan(client, body=None, user="user_test"):
    return client.post(
        "/api/plans",
        json=_plan_body() if body is None else body,
        headers={"X-User-Id": user},
    )


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


def _put_onboarding(client, body=None, user="user_test"):
    return client.put(
        "/api/onboarding",
        json=_profile() if body is None else body,
        headers={"X-User-Id": user},
    )


def test_post_plan_requires_title(client):
    response = _post_plan(client, {"activity_type": "coffee", "location_text": "Seattle"})
    assert response.status_code == 400
    assert response.get_json()["error"] == "title is required"


def test_post_plan_rejects_invalid_activity_type(client):
    response = _post_plan(client, _plan_body(activity_type="party"))
    assert response.status_code == 400
    assert "activity_type must be one of" in response.get_json()["error"]


def test_post_plan_rejects_long_title(client):
    response = _post_plan(client, _plan_body(title="t" * 121))
    assert response.status_code == 400
    assert response.get_json()["error"] == "title is too long"


def test_post_plan_rejects_long_location_text(client):
    response = _post_plan(client, _plan_body(location_text="x" * 81))
    assert response.status_code == 400
    assert response.get_json()["error"] == "location_text is too long"


def test_post_plan_rejects_capacity_out_of_range(client):
    response = _post_plan(client, _plan_body(capacity=1))
    assert response.status_code == 400
    assert response.get_json()["error"] == "capacity is out of range"

    response = _post_plan(client, _plan_body(capacity=41))
    assert response.status_code == 400
    assert response.get_json()["error"] == "capacity is out of range"


def test_post_plan_rejects_unexpected_field(client):
    response = _post_plan(client, _plan_body(host_id="user_other"))
    assert response.status_code == 400
    assert response.get_json()["error"] == "unexpected field: host_id"


def test_post_plan_rejects_user_id_in_body(client):
    response = _post_plan(client, _plan_body(user_id="user_other"))
    assert response.status_code == 400
    assert response.get_json()["error"] == "unexpected field: user_id"


def test_post_plan_creates_and_auto_joins_host(client):
    response = _post_plan(client)
    assert response.status_code == 201
    body = response.get_json()
    assert body["host_id"] == "user_test"
    assert body["title"] == "Coffee at Cafe Vita"
    assert body["activity_type"] == "coffee"
    assert body["location_text"] == "Seattle"
    assert body["starts_at"] is None
    assert body["capacity"] == 6
    assert body["status"] == "open"
    assert body["member_count"] == 1
    assert body["viewer_joined"] is True
    assert body["members"] == [
        {"user_id": "user_test", "role": "host", "joined_at": body["created_at"]}
    ]
    assert set(body) >= {
        "id",
        "host_id",
        "title",
        "activity_type",
        "location_text",
        "starts_at",
        "capacity",
        "status",
        "created_at",
        "updated_at",
        "member_count",
        "viewer_joined",
        "members",
    }


def test_post_plan_defaults_capacity_and_accepts_starts_at(client):
    response = _post_plan(
        client,
        {
            "title": "Study hall",
            "activity_type": "study",
            "location_text": "Library",
            "starts_at": "2026-06-01T18:00:00+00:00",
        },
    )
    assert response.status_code == 201
    body = response.get_json()
    assert body["capacity"] == 6
    assert body["starts_at"] == "2026-06-01T18:00:00+00:00"


def test_post_plan_rejects_invalid_starts_at(client):
    response = _post_plan(client, _plan_body(starts_at="not-a-date"))
    assert response.status_code == 400
    assert response.get_json()["error"] == "starts_at must be an ISO datetime string"


def test_get_plans_lists_open_newest_first(client, monkeypatch):
    monkeypatch.setattr("app.firebase.datetime", _Clock())
    first = _post_plan(client, _plan_body(title="First"))
    second = _post_plan(client, _plan_body(title="Second"))
    assert first.status_code == 201
    assert second.status_code == 201

    response = client.get("/api/plans")
    assert response.status_code == 200
    plans = response.get_json()["plans"]
    assert [plan["title"] for plan in plans] == ["Second", "First"]
    assert all(plan["viewer_joined"] is True for plan in plans)
    assert all(plan["member_count"] == 1 for plan in plans)
    assert "members" not in plans[0]


def test_get_plans_excludes_closed(client, fake_firestore):
    created = _post_plan(client, _plan_body(title="Open one"))
    assert created.status_code == 201
    plan_id = created.get_json()["id"]
    fake_firestore.collection("plans").document(plan_id).set(
        {
            **fake_firestore.collection("plans").document(plan_id).to_dict(),
            "status": "closed",
        }
    )

    response = client.get("/api/plans")
    assert response.status_code == 200
    assert response.get_json()["plans"] == []


def test_get_plan_detail_includes_members(client):
    created = _post_plan(client)
    plan_id = created.get_json()["id"]

    detail = client.get(f"/api/plans/{plan_id}")
    assert detail.status_code == 200
    body = detail.get_json()
    assert body["id"] == plan_id
    assert body["member_count"] == 1
    assert body["members"][0]["role"] == "host"


def test_get_plan_detail_is_404_when_missing(client):
    response = client.get("/api/plans/missing")
    assert response.status_code == 404
    assert response.get_json()["error"] == "plan not found"


def test_join_plan_adds_member(client):
    created = _post_plan(client, user="user_host")
    plan_id = created.get_json()["id"]

    joined = client.post(f"/api/plans/{plan_id}/join", headers={"X-User-Id": "user_guest"})
    assert joined.status_code == 201
    body = joined.get_json()
    assert body["member_count"] == 2
    assert body["viewer_joined"] is True
    roles = {member["user_id"]: member["role"] for member in body["members"]}
    assert roles == {"user_host": "host", "user_guest": "member"}

    listing = client.get("/api/plans", headers={"X-User-Id": "user_guest"})
    assert listing.get_json()["plans"][0]["viewer_joined"] is True
    assert listing.get_json()["plans"][0]["member_count"] == 2


def test_join_plan_rejects_duplicate(client):
    created = _post_plan(client)
    plan_id = created.get_json()["id"]
    response = client.post(f"/api/plans/{plan_id}/join")
    assert response.status_code == 409
    assert response.get_json()["error"] == "already joined"


def test_join_plan_rejects_when_at_capacity(client):
    created = _post_plan(client, _plan_body(capacity=2), user="user_host")
    plan_id = created.get_json()["id"]
    assert client.post(f"/api/plans/{plan_id}/join", headers={"X-User-Id": "user_a"}).status_code == 201

    response = client.post(f"/api/plans/{plan_id}/join", headers={"X-User-Id": "user_b"})
    assert response.status_code == 409
    assert response.get_json()["error"] == "plan is at capacity"


def test_join_plan_rejects_closed(client, fake_firestore):
    created = _post_plan(client, user="user_host")
    plan_id = created.get_json()["id"]
    fake_firestore.collection("plans").document(plan_id).set(
        {
            **fake_firestore.collection("plans").document(plan_id).to_dict(),
            "status": "closed",
        }
    )
    response = client.post(f"/api/plans/{plan_id}/join", headers={"X-User-Id": "user_guest"})
    assert response.status_code == 409
    assert response.get_json()["error"] == "plan is closed"


def test_join_plan_is_404_when_missing(client):
    response = client.post("/api/plans/missing/join")
    assert response.status_code == 404
    assert response.get_json()["error"] == "plan not found"


def test_plan_matches_requires_onboarding(client):
    created = _post_plan(client)
    plan_id = created.get_json()["id"]
    response = client.get(f"/api/plans/{plan_id}/matches")
    assert response.status_code == 404
    assert response.get_json()["error"] == "onboarding profile not found"


def test_plan_matches_scores_other_members(client):
    created = _post_plan(client, user="user_test")
    plan_id = created.get_json()["id"]
    assert _put_onboarding(client, user="user_test").status_code == 201
    assert (
        _put_onboarding(
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
    assert client.post(
        f"/api/plans/{plan_id}/join", headers={"X-User-Id": "user_neighbor"}
    ).status_code == 201

    response = client.get(f"/api/plans/{plan_id}/matches")
    assert response.status_code == 200
    matches = response.get_json()["matches"]
    assert len(matches) == 1
    assert matches[0]["user_id"] == "user_neighbor"
    assert matches[0]["first_name"] == "Ada"
    assert "Knows Dance" in matches[0]["matched_on"]
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


def test_plan_matches_excludes_viewer_and_skips_members_without_profiles(client):
    created = _post_plan(client, user="user_test")
    plan_id = created.get_json()["id"]
    assert _put_onboarding(client, user="user_test").status_code == 201
    assert client.post(
        f"/api/plans/{plan_id}/join", headers={"X-User-Id": "user_no_profile"}
    ).status_code == 201

    response = client.get(f"/api/plans/{plan_id}/matches")
    assert response.status_code == 200
    assert response.get_json()["matches"] == []


def test_plan_matches_is_404_when_plan_missing(client):
    assert _put_onboarding(client).status_code == 201
    response = client.get("/api/plans/missing/matches")
    assert response.status_code == 404
    assert response.get_json()["error"] == "plan not found"


def test_get_plans_returns_503_when_query_fails(client, fake_firestore, monkeypatch):
    plans = fake_firestore.collection("plans")

    def where(*_args, **_kwargs):
        raise RuntimeError("down")

    monkeypatch.setattr(plans, "where", where)
    response = client.get("/api/plans")
    assert response.status_code == 503
    assert response.get_json()["error"] == "Firestore request failed"
