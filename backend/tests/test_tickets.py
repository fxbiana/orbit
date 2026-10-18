from datetime import datetime, timezone

import pytest


class MemoryDocument:
    def __init__(self, doc_id):
        self.id = doc_id
        self._data = None
        self._collections = {}

    def collection(self, name):
        return self._collections.setdefault(name, MemoryCollection())

    def set(self, data):
        self._data = dict(data)

    def get(self):
        return self

    def to_dict(self):
        return dict(self._data or {})


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


class _SignedIn:
    def __init__(self, user_id):
        self.is_signed_in = True
        self.reason = None
        self.payload = {"sub": user_id}


@pytest.fixture(autouse=True)
def fake_firestore(monkeypatch):
    client = MemoryFirestore()
    monkeypatch.setattr("app.firebase._firestore", None)
    monkeypatch.setattr("app.firebase.firestore_client", lambda: client)
    return client


@pytest.fixture(autouse=True)
def signed_in(monkeypatch):
    def authenticate_request(flask_request, options):
        user_id = flask_request.headers.get("X-Test-User", "user_test")
        return _SignedIn(user_id)

    monkeypatch.setattr("app.auth.authenticate_request", authenticate_request)


def _post(client, title, url, user="user_test"):
    return client.post(
        "/api/tickets",
        json={"title": title, "url": url},
        headers={"X-Test-User": user},
    )


def test_me_returns_the_signed_in_user(client):
    response = client.get("/api/me")
    assert response.status_code == 200
    assert response.get_json() == {"user_id": "user_test"}

    other = client.get("/api/me", headers={"X-Test-User": "user_other"})
    assert other.status_code == 200
    assert other.get_json() == {"user_id": "user_other"}


def test_post_ticket_requires_a_title(client):
    response = client.post("/api/tickets", json={"url": "https://example.com/tab"})
    assert response.status_code == 400
    assert response.get_json()["error"] == "title and url are required"


def test_post_ticket_requires_a_url(client):
    response = client.post("/api/tickets", json={"title": "A tab"})
    assert response.status_code == 400
    assert response.get_json()["error"] == "title and url are required"


def test_post_ticket_rejects_a_long_title(client):
    response = _post(client, "t" * 501, "https://example.com/tab")
    assert response.status_code == 400
    assert response.get_json()["error"] == "title or url is too long"


def test_post_ticket_rejects_a_long_url(client):
    response = _post(client, "A tab", "u" * 2001)
    assert response.status_code == 400
    assert response.get_json()["error"] == "title or url is too long"


def test_post_ticket_returns_the_created_ticket(client):
    response = _post(client, "A tab", "https://example.com/tab")
    assert response.status_code == 201
    body = response.get_json()
    assert set(body) == {"id", "title", "url", "status", "created_at"}
    assert body["title"] == "A tab"
    assert body["url"] == "https://example.com/tab"
    assert body["status"] == "open"
    assert body["id"]
    assert body["created_at"]


def test_get_tickets_returns_newest_first(client, monkeypatch):
    monkeypatch.setattr("app.firebase.datetime", _Clock())
    first = _post(client, "First", "https://example.com/first")
    second = _post(client, "Second", "https://example.com/second")
    assert first.status_code == 201
    assert second.status_code == 201

    response = client.get("/api/tickets")
    assert response.status_code == 200
    tickets = response.get_json()["tickets"]
    assert [ticket["title"] for ticket in tickets] == ["Second", "First"]
    assert [ticket["status"] for ticket in tickets] == ["open", "open"]
    assert tickets[0]["created_at"] > tickets[1]["created_at"]


def test_tickets_are_private_to_each_user(client):
    created = _post(client, "Mine", "https://example.com/mine")
    assert created.status_code == 201
    other_created = _post(client, "Theirs", "https://example.com/theirs", user="user_other")
    assert other_created.status_code == 201

    mine = client.get("/api/tickets")
    assert mine.status_code == 200
    assert [ticket["title"] for ticket in mine.get_json()["tickets"]] == ["Mine"]

    theirs = client.get("/api/tickets", headers={"X-Test-User": "user_other"})
    assert theirs.status_code == 200
    assert [ticket["title"] for ticket in theirs.get_json()["tickets"]] == ["Theirs"]
