import json
from io import BytesIO
from urllib.error import HTTPError

import pytest

from app.spotify import (
    SpotifyImportError,
    fetch_listening,
    fetch_top_artist_genres,
    normalize_genres,
)


class _Node:
    def __init__(self):
        self.data = None
        self._collections = {}

    def collection(self, name):
        return self._collections.setdefault(name, _Collection())

    def set(self, data):
        self.data = dict(data)


class _Collection:
    def __init__(self):
        self._docs = {}

    def document(self, doc_id):
        return self._docs.setdefault(doc_id, _Node())


class _Client:
    def __init__(self):
        self._collections = {}

    def collection(self, name):
        return self._collections.setdefault(name, _Collection())


def test_normalize_genres_collapses_dedupes_and_caps():
    raw = ["  indie   rock ", "Indie Rock", "", "   ", "edm"]
    raw.extend(f"genre {index}" for index in range(30))
    raw.append("x" * 100)
    genres = normalize_genres(raw)

    assert genres[0] == "Indie Rock"
    assert genres[1] == "Edm"
    assert "" not in genres
    assert len(genres) == 20
    assert all(len(item) <= 80 for item in genres)
    assert len({item.casefold() for item in genres}) == len(genres)


class _Body:
    def __init__(self, payload: bytes):
        self._payload = payload

    def read(self):
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def test_fetch_top_artist_genres_reads_artist_genres():
    captured = {}

    def opener(request, timeout=None):
        captured["url"] = request.full_url
        captured["authorization"] = request.get_header("Authorization")
        captured["timeout"] = timeout
        body = json.dumps(
            {
                "artists": [
                    {"genres": ["shoegaze", "dream pop"]},
                    {"genres": ["shoegaze"]},
                    {"name": "No Genres"},
                ]
            }
        ).encode()
        return _Body(body)

    genres = fetch_top_artist_genres("spotify-token", opener=opener)

    assert genres == ["shoegaze", "dream pop", "shoegaze"]
    assert captured["url"] == (
        "https://api.spotify.com/v1/me/top/artists?limit=20&time_range=medium_term"
    )
    assert captured["authorization"] == "Bearer spotify-token"
    assert captured["timeout"] == 15


def test_fetch_top_artist_genres_http_error():
    def opener(request, timeout=None):
        raise HTTPError(request.full_url, 403, "Forbidden", hdrs=None, fp=BytesIO(b""))

    with pytest.raises(SpotifyImportError, match="403"):
        fetch_top_artist_genres("spotify-token", opener=opener)


def test_import_normalizes_genres_and_stores_snapshot_without_token(client, monkeypatch):
    store = _Client()
    monkeypatch.setattr("app.firebase.firestore_client", lambda: store)
    monkeypatch.setattr(
        "app.routes.spotify.spotify_access_token",
        lambda user_id, secret_key: "should-not-be-stored",
    )
    monkeypatch.setattr(
        "app.routes.spotify.fetch_top_artist_genres",
        lambda access_token, opener=None: ["  alt   rock ", "ALT ROCK", "jazz", ""],
    )

    response = client.post(
        "/api/spotify/import",
        headers={"X-User-Id": "user_123"},
        json={"user_id": "someone_else"},
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body == {
        "genres": ["Alt Rock", "Jazz"],
        "suggestions": {"knows": ["Alt Rock", "Jazz"], "wants_to_learn": []},
    }

    snapshot = (
        store.collection("users")
        .document("user_123")
        .collection("profile")
        .document("spotify")
        .data
    )
    assert snapshot["genres"] == ["Alt Rock", "Jazz"]
    assert snapshot["source"] == "clerk_spotify"
    assert snapshot["imported_at"] is not None
    assert "access_token" not in snapshot
    assert "token" not in snapshot
    assert "should-not-be-stored" not in json.dumps(snapshot, default=str)


def test_import_without_spotify_returns_404(client, monkeypatch):
    def fail_fetch(*args, **kwargs):
        raise AssertionError("Spotify was called without a token")

    monkeypatch.setattr("app.routes.spotify.spotify_access_token", lambda user_id, secret_key: None)
    monkeypatch.setattr("app.routes.spotify.fetch_top_artist_genres", fail_fetch)
    monkeypatch.setattr(
        "app.routes.spotify.save_spotify_snapshot",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("snapshot was written")),
    )

    response = client.post("/api/spotify/import", headers={"X-User-Id": "user_123"})

    assert response.status_code == 404
    assert response.get_json()["error"] == "Connect Spotify before importing preferences"


_RECENT_URL = "https://api.spotify.com/v1/me/player/recently-played?limit=50"
_TOP_TRACKS_SHORT_URL = "https://api.spotify.com/v1/me/top/tracks?limit=20&time_range=short_term"
_TOP_TRACKS_MEDIUM_URL = "https://api.spotify.com/v1/me/top/tracks?limit=20&time_range=medium_term"
_TOP_ARTISTS_SHORT_URL = "https://api.spotify.com/v1/me/top/artists?limit=20&time_range=short_term"
_TOP_ARTISTS_MEDIUM_URL = "https://api.spotify.com/v1/me/top/artists?limit=20&time_range=medium_term"


def _json_opener(payloads, captured):
    def opener(request, timeout=None):
        captured.append(
            {
                "url": request.full_url,
                "authorization": request.get_header("Authorization"),
                "timeout": timeout,
            }
        )
        body = json.dumps(payloads[request.full_url]).encode()
        return _Body(body)

    return opener


def test_fetch_listening_reads_recent_and_short_term():
    captured = []
    opener = _json_opener(
        {
            _RECENT_URL: {
                "items": [
                    {
                        "played_at": "2026-10-01T00:00:00Z",
                        "track": {
                            "name": "Baby",
                            "artists": [{"name": "Four Tet"}],
                            "album": {"name": "Sixteen Oceans"},
                        },
                    },
                    {"played_at": "2026-10-02T00:00:00Z"},
                ]
            },
            _TOP_TRACKS_SHORT_URL: {
                "items": [
                    {
                        "name": "Glue",
                        "artists": [{"name": "Bicep"}],
                        "album": {"name": "Bicep"},
                    }
                ]
            },
            _TOP_ARTISTS_SHORT_URL: {
                "items": [
                    {"name": "Four Tet", "genres": ["electronica"]},
                    {"name": "No Genres"},
                ]
            },
        },
        captured,
    )

    result = fetch_listening("spotify-token", opener=opener)

    assert result == {
        "recent_tracks": [
            {
                "name": "Baby",
                "artists": ["Four Tet"],
                "album": "Sixteen Oceans",
                "played_at": "2026-10-01T00:00:00Z",
            }
        ],
        "top_tracks": [
            {"name": "Glue", "artists": ["Bicep"], "album": "Bicep"}
        ],
        "top_artists": [
            {"name": "Four Tet", "genres": ["electronica"]},
            {"name": "No Genres", "genres": []},
        ],
    }
    urls = [item["url"] for item in captured]
    assert urls == [_RECENT_URL, _TOP_TRACKS_SHORT_URL, _TOP_ARTISTS_SHORT_URL]
    assert all("medium_term" not in url for url in urls)
    assert all(item["authorization"] == "Bearer spotify-token" for item in captured)
    assert all(item["timeout"] == 15 for item in captured)


def test_fetch_listening_falls_back_to_medium_term_when_short_term_empty():
    captured = []
    opener = _json_opener(
        {
            _RECENT_URL: {"items": []},
            _TOP_TRACKS_SHORT_URL: {"items": []},
            _TOP_TRACKS_MEDIUM_URL: {
                "items": [
                    {
                        "name": "Glue",
                        "artists": [{"name": "Bicep"}],
                        "album": {"name": "Bicep"},
                    }
                ]
            },
            _TOP_ARTISTS_SHORT_URL: {"items": []},
            _TOP_ARTISTS_MEDIUM_URL: {
                "items": [{"name": "Four Tet", "genres": ["electronica"]}]
            },
        },
        captured,
    )

    result = fetch_listening("spotify-token", opener=opener)

    assert [item["url"] for item in captured] == [
        _RECENT_URL,
        _TOP_TRACKS_SHORT_URL,
        _TOP_TRACKS_MEDIUM_URL,
        _TOP_ARTISTS_SHORT_URL,
        _TOP_ARTISTS_MEDIUM_URL,
    ]
    assert result == {
        "recent_tracks": [],
        "top_tracks": [
            {"name": "Glue", "artists": ["Bicep"], "album": "Bicep"}
        ],
        "top_artists": [{"name": "Four Tet", "genres": ["electronica"]}],
    }


def test_fetch_listening_http_error():
    def opener(request, timeout=None):
        if request.full_url != _RECENT_URL:
            raise AssertionError(f"unexpected Spotify call {request.full_url}")
        raise HTTPError(request.full_url, 403, "Forbidden", hdrs=None, fp=BytesIO(b""))

    with pytest.raises(SpotifyImportError, match=r"recently played request failed \(403\)"):
        fetch_listening("spotify-token", opener=opener)


def test_fetch_listening_does_not_call_removed_spotify_endpoints():
    captured = []
    track = {
        "name": "Baby",
        "artists": [{"name": "Four Tet"}],
        "album": {"name": "Sixteen Oceans"},
    }
    opener = _json_opener(
        {
            _RECENT_URL: {
                "items": [{"played_at": "2026-10-01T00:00:00Z", "track": track}]
            },
            _TOP_TRACKS_SHORT_URL: {"items": [track]},
            _TOP_ARTISTS_SHORT_URL: {
                "items": [{"name": "Four Tet", "genres": ["electronica"]}]
            },
        },
        captured,
    )

    fetch_listening("spotify-token", opener=opener)

    banned = (
        "audio-features",
        "audio-analysis",
        "recommendations",
        "related-artists",
        "/v1/artists",
    )
    for item in captured:
        for token in banned:
            assert token not in item["url"]
