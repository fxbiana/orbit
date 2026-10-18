from datetime import datetime, timezone

import pytest

from app.spotify import analyze_top_artists, normalize_genre, spotify_response


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


@pytest.fixture(autouse=True)
def default_caller(monkeypatch):
    def read_local_user_id():
        from flask import request

        return (request.headers.get("X-User-Id") or "").strip() or "user_test"

    monkeypatch.setattr("app.auth.read_local_user_id", read_local_user_id)


def test_normalize_genre_collapses_whitespace():
    assert normalize_genre("  indie   rock  ") == "indie rock"
    assert normalize_genre("") is None
    assert normalize_genre("   ") is None


def test_analyze_top_artists_ranks_and_caps_genres():
    artists = [
        {"genres": ["indie rock", "dream pop"]},
        {"genres": ["Indie Rock", "shoegaze"]},
        {"genres": ["dream pop"]},
    ]
    result = analyze_top_artists(artists)
    assert result["artist_count"] == 3
    # indie rock and dream pop both appear twice; tie-break is alphabetical.
    assert set(result["genres"][:2]) == {"indie rock", "dream pop"}
    assert result["genres"][0] == "dream pop"
    assert "shoegaze" in result["genres"]
    assert result["suggested_interests"]["knows"] == result["genres"]
    assert result["suggested_interests"]["wants_to_learn"] == []


def test_spotify_response_never_echoes_tokens():
    body = spotify_response(
        "user_a",
        {
            "genres": ["jazz"],
            "suggested_interests": {"knows": ["jazz"], "wants_to_learn": []},
            "source": "clerk_spotify",
            "artist_count": 1,
            "imported_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
            "access_token": "should-not-appear",
            "token": "nope",
        },
        lambda value: value.isoformat() if hasattr(value, "isoformat") else str(value),
    )
    assert "access_token" not in body
    assert "token" not in body
    assert body["user_id"] == "user_a"
    assert body["genres"] == ["jazz"]


def test_import_persists_under_caller(client, monkeypatch, fake_firestore):
    monkeypatch.setattr(
        "app.routes.spotify.fetch_spotify_access_token",
        lambda user_id: "spotify-token",
    )
    monkeypatch.setattr(
        "app.routes.spotify.fetch_top_artists",
        lambda token, **kwargs: [
            {"genres": ["afrobeats", "dancehall"]},
            {"genres": ["afrobeats"]},
        ],
    )

    response = client.post("/api/spotify/import")
    assert response.status_code == 201
    body = response.get_json()
    assert body["user_id"] == "user_test"
    assert body["genres"][0] == "afrobeats"
    assert body["source"] == "clerk_spotify"
    assert body["suggested_interests"]["knows"]
    assert "token" not in body

    stored = (
        fake_firestore.collection("users")
        .document("user_test")
        .collection("profile")
        .document("spotify")
        .to_dict()
    )
    assert stored["user_id"] == "user_test"
    assert stored["genres"][0] == "afrobeats"
    assert "token" not in stored
    assert "access_token" not in stored


def test_import_is_isolated_per_user(client, monkeypatch, fake_firestore):
    monkeypatch.setattr(
        "app.routes.spotify.fetch_spotify_access_token",
        lambda user_id: f"token-for-{user_id}",
    )
    monkeypatch.setattr(
        "app.routes.spotify.fetch_top_artists",
        lambda token, **kwargs: [{"genres": ["soul" if "user_a" in token else "punk"]}],
    )

    assert client.post("/api/spotify/import", headers={"X-User-Id": "user_a"}).status_code == 201
    assert client.post("/api/spotify/import", headers={"X-User-Id": "user_b"}).status_code == 201

    a = (
        fake_firestore.collection("users")
        .document("user_a")
        .collection("profile")
        .document("spotify")
        .to_dict()
    )
    b = (
        fake_firestore.collection("users")
        .document("user_b")
        .collection("profile")
        .document("spotify")
        .to_dict()
    )
    assert a["genres"] == ["soul"]
    assert b["genres"] == ["punk"]


def test_get_spotify_reads_persisted_snapshot(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes.spotify.fetch_spotify_access_token",
        lambda user_id: "spotify-token",
    )
    monkeypatch.setattr(
        "app.routes.spotify.fetch_top_artists",
        lambda token, **kwargs: [{"genres": ["house"]}],
    )
    assert client.post("/api/spotify/import").status_code == 201

    response = client.get("/api/spotify")
    assert response.status_code == 200
    assert response.get_json()["genres"] == ["house"]


def test_get_spotify_404_when_missing(client):
    response = client.get("/api/spotify")
    assert response.status_code == 404
    assert response.get_json()["error"] == "spotify profile not found"


def test_import_rejects_body_user_id(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes.spotify.fetch_spotify_access_token",
        lambda user_id: "spotify-token",
    )
    response = client.post("/api/spotify/import", json={"user_id": "someone_else"})
    assert response.status_code == 400
    assert "user_id" in response.get_json()["error"]


def test_import_requires_auth_header_in_local_mode_override(client, monkeypatch):
    """Empty X-User-Id still defaults via fixture; ensure 401 when auth fails."""

    def deny():
        from flask import abort

        abort(401, description="X-User-Id is required")

    monkeypatch.setattr("app.auth.read_local_user_id", deny)
    response = client.post("/api/spotify/import")
    assert response.status_code == 401


def test_reimport_overwrites_same_user_doc(client, monkeypatch, fake_firestore):
    calls = {"n": 0}

    def artists(token, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return [{"genres": ["jazz"]}]
        return [{"genres": ["techno"]}]

    monkeypatch.setattr(
        "app.routes.spotify.fetch_spotify_access_token",
        lambda user_id: "spotify-token",
    )
    monkeypatch.setattr("app.routes.spotify.fetch_top_artists", artists)

    assert client.post("/api/spotify/import").status_code == 201
    assert client.post("/api/spotify/import").status_code == 201

    stored = (
        fake_firestore.collection("users")
        .document("user_test")
        .collection("profile")
        .document("spotify")
        .to_dict()
    )
    assert stored["genres"] == ["techno"]
