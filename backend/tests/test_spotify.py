import json
from io import BytesIO
from urllib.error import HTTPError

import pytest

from app.spotify import (
    SpotifyImportError,
    empty_suggestions,
    fallback_suggestions,
    fetch_listening,
    fetch_top_artist_genres,
    genres_from_listening,
    normalize_genres,
    suggest_from_listening,
    validate_suggestions,
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


def test_genres_from_listening_normalizes_top_artist_genres():
    listening = {
        "top_artists": [
            {"name": "Someone", "genres": ["  alt   rock ", "ALT ROCK", "jazz", ""]},
            "not-a-dict",
            {"name": "Missing"},
            {"name": "Nope", "genres": [None, 3]},
        ]
    }
    assert genres_from_listening(listening) == ["Alt Rock", "Jazz"]
    assert genres_from_listening({}) == []


def test_import_normalizes_genres_and_stores_snapshot_without_token(client, monkeypatch):
    store = _Client()
    listening = {
        "recent_tracks": [
            {"name": "Baby", "artists": ["Four Tet"], "album": "", "played_at": ""}
        ],
        "top_tracks": [],
        "top_artists": [
            {"name": "Someone", "genres": ["  alt   rock ", "ALT ROCK", "jazz", ""]},
        ],
    }
    suggestions = empty_suggestions()
    suggestions["interests"]["knows"] = ["Alt Rock", "Jazz"]
    suggestions["festivals"]["knows"] = ["Rock", "Jazz"]
    monkeypatch.setattr("app.firebase.firestore_client", lambda: store)
    monkeypatch.setattr(
        "app.routes.spotify.spotify_access_token",
        lambda user_id, secret_key: "should-not-be-stored",
    )
    monkeypatch.setattr(
        "app.routes.spotify.fetch_listening",
        lambda access_token, opener=None: listening,
    )
    monkeypatch.setattr(
        "app.routes.spotify.suggest_from_listening",
        lambda *args, **kwargs: (suggestions, None),
    )

    response = client.post(
        "/api/spotify/import",
        headers={"X-User-Id": "user_123"},
        json={"user_id": "someone_else"},
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body == {
        "artists": listening["top_artists"],
        "tracks": listening["recent_tracks"],
        "top_tracks": [],
        "genres": ["Alt Rock", "Jazz"],
        "suggestions": suggestions,
        "model": None,
    }

    snapshot = (
        store.collection("users")
        .document("user_123")
        .collection("profile")
        .document("spotify")
        .data
    )
    assert snapshot["genres"] == ["Alt Rock", "Jazz"]
    assert snapshot["artists"] == listening["top_artists"]
    assert snapshot["tracks"] == listening["recent_tracks"]
    assert snapshot["top_tracks"] == []
    assert snapshot["suggestions"] == suggestions
    assert snapshot["model"] == ""
    assert snapshot["source"] == "clerk_spotify"
    assert snapshot["imported_at"] is not None
    assert "access_token" not in snapshot
    assert "token" not in snapshot
    assert "should-not-be-stored" not in json.dumps(snapshot, default=str)
    onboarding = (
        store.collection("users")
        .document("user_123")
        .collection("profile")
        .document("onboarding")
        .data
    )
    assert onboarding is None


def test_import_without_spotify_returns_404(client, monkeypatch):
    def fail_fetch(*args, **kwargs):
        raise AssertionError("Spotify was called without a token")

    monkeypatch.setattr("app.routes.spotify.spotify_access_token", lambda user_id, secret_key: None)
    monkeypatch.setattr("app.routes.spotify.fetch_listening", fail_fetch)
    monkeypatch.setattr("app.routes.spotify.suggest_from_listening", fail_fetch)
    monkeypatch.setattr(
        "app.routes.spotify.save_spotify_snapshot",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("snapshot was written")),
    )

    response = client.post("/api/spotify/import", headers={"X-User-Id": "user_123"})

    assert response.status_code == 404
    assert response.get_json()["error"] == "Connect Spotify before importing preferences"


def test_import_spotify_failure_returns_502(client, monkeypatch):
    def fail(*args, **kwargs):
        raise AssertionError("should not be called")

    def fetch_failed(access_token, opener=None):
        raise SpotifyImportError("Spotify recently played request failed (403)")

    monkeypatch.setattr(
        "app.routes.spotify.spotify_access_token",
        lambda user_id, secret_key: "spotify-token",
    )
    monkeypatch.setattr("app.routes.spotify.fetch_listening", fetch_failed)
    monkeypatch.setattr("app.routes.spotify.suggest_from_listening", fail)
    monkeypatch.setattr("app.routes.spotify.save_spotify_snapshot", fail)

    response = client.post("/api/spotify/import", headers={"X-User-Id": "user_123"})

    assert response.status_code == 502
    assert response.get_json()["error"] == "Spotify recently played request failed (403)"


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


_TOPIC_KEYS = ("languages", "locations", "hobbies", "interests", "festivals")


def test_validate_suggestions_cleans_topics_and_drops_identity():
    raw = {
        "username": "nope",
        "first_name": "Ada",
        "location": "Berlin",
        "age": 30,
        "gathering_size": "2-5",
        "interests": {"knows": ["  house  ", "House", "x" * 100]},
        "locations": {"knows": ["Berlin"], "wants_to_learn": [" berlin "]},
        "festivals": {"knows": ["k-pop", "Diwali", "R&B"]},
        "hobbies": {"knows": [" choir "]},
        "languages": {"knows": [42, "  spanish "]},
    }
    result = validate_suggestions(raw)

    assert result["interests"]["knows"][0] == "House"
    assert len(result["interests"]["knows"]) == 2
    assert len(result["interests"]["knows"][1]) == 80
    assert result["locations"]["knows"] == []
    assert result["locations"]["wants_to_learn"] == ["Berlin"]
    assert result["festivals"]["knows"] == ["K-pop", "R&B"]
    assert result["hobbies"]["knows"] == ["Choir"]
    assert result["languages"]["knows"] == ["Spanish"]
    assert "username" not in result
    assert set(result) == set(_TOPIC_KEYS)
    for topic in result.values():
        assert set(topic) == {"knows", "wants_to_learn"}


def test_validate_suggestions_rejects_non_dict():
    result = validate_suggestions(None)
    assert result == empty_suggestions()
    assert set(result) == set(_TOPIC_KEYS)


def test_fallback_suggestions_maps_genres_to_festivals():
    listening = {
        "top_artists": [
            {"name": "Four Tet", "genres": ["electronica", "indie rock"]},
            {"name": "Duplicate", "genres": ["electronica"]},
            "not-a-dict",
        ]
    }
    result = fallback_suggestions(listening)

    assert "Electronica" in result["interests"]["knows"]
    assert "Indie Rock" in result["interests"]["knows"]
    assert result["interests"]["knows"] == ["Electronica", "Indie Rock"]
    assert result["interests"]["wants_to_learn"] == []
    assert result["festivals"]["knows"] == ["Electronic", "Indie"]
    assert result["festivals"]["wants_to_learn"] == []
    assert result["locations"]["wants_to_learn"] == []
    assert result["locations"]["knows"] == []


def test_fallback_suggestions_matches_whole_words_only():
    listening = {
        "top_artists": [
            {"name": "Trap artist", "genres": ["trap"]},
            {"name": "Popular", "genres": ["popular rock"]},
        ]
    }
    result = fallback_suggestions(listening)

    assert result["festivals"]["knows"] == ["Rock"]


def test_suggest_from_listening_without_key_skips_network():
    def opener(request, timeout=None):
        raise AssertionError("opener should not be called")

    listening = {"top_artists": [{"name": "Miles Davis", "genres": ["jazz"]}]}
    expected = (fallback_suggestions(listening), None)
    assert suggest_from_listening(listening, "", "", opener=opener) == expected
    assert suggest_from_listening(listening, "  ", "gpt-test", opener=opener) == expected
    assert suggest_from_listening(listening, "test-key", "  ", opener=opener) == expected


def test_suggest_from_listening_reads_model_json():
    captured = {}
    listening = {
        "recent_tracks": [{"name": "Baby", "artists": ["Four Tet"], "album": "Sixteen Oceans"}],
        "top_tracks": [],
        "top_artists": [{"name": "Four Tet", "genres": ["electronica"]}],
        "token": "should-not-be-sent",
    }
    content = json.dumps(
        {
            "interests": {"knows": ["House"], "wants_to_learn": []},
            "locations": {"knows": ["Paris"], "wants_to_learn": ["Berlin"]},
            "username": "nope",
        }
    )

    def opener(request, timeout=None):
        captured["url"] = request.full_url
        captured["authorization"] = request.get_header("Authorization")
        captured["content_type"] = request.get_header("Content-type")
        captured["accept"] = request.get_header("Accept")
        captured["timeout"] = timeout
        captured["method"] = request.get_method()
        captured["body"] = json.loads(request.data.decode())
        payload = {"choices": [{"message": {"content": content}}]}
        return _Body(json.dumps(payload).encode())

    suggestions, model_used = suggest_from_listening(
        listening,
        api_key="test-key",
        model="gpt-test",
        opener=opener,
    )

    assert suggestions["interests"]["knows"] == ["House"]
    assert suggestions["locations"]["wants_to_learn"] == ["Berlin"]
    assert suggestions["locations"]["knows"] == []
    assert "username" not in suggestions
    assert model_used == "gpt-test"
    assert captured["url"] == "https://api.openai.com/v1/chat/completions"
    assert captured["authorization"] == "Bearer test-key"
    assert captured["content_type"] == "application/json"
    assert captured["accept"] == "application/json"
    assert captured["timeout"] == 20
    assert captured["method"] == "POST"
    assert captured["body"]["model"] == "gpt-test"
    assert captured["body"]["temperature"] == 0.2
    assert captured["body"]["response_format"] == {"type": "json_object"}
    system = captured["body"]["messages"][0]["content"]
    assert "K-pop" in system and "R&B" in system and "locations.knows" in system
    user_payload = json.loads(captured["body"]["messages"][1]["content"])
    assert user_payload == {
        "recent_tracks": listening["recent_tracks"],
        "top_tracks": [],
        "top_artists": listening["top_artists"],
    }


def test_suggest_from_listening_falls_back_when_model_fails():
    called = {"count": 0}

    def opener(request, timeout=None):
        called["count"] += 1
        raise HTTPError(request.full_url, 500, "Server Error", hdrs=None, fp=BytesIO(b""))

    listening = {"top_artists": [{"name": "Miles Davis", "genres": ["jazz"]}]}
    suggestions, model_used = suggest_from_listening(
        listening,
        api_key="test-key",
        model="gpt-test",
        opener=opener,
    )

    assert suggestions["interests"]["knows"] == ["Jazz"]
    assert model_used is None
    assert called["count"] == 1
