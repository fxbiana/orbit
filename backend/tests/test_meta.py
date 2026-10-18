import json
from io import BytesIO
from urllib.error import HTTPError

import pytest

from app.meta import MetaImportError, fetch_languages, normalize_languages


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


def test_normalize_languages_collapses_dedupes_and_caps():
    raw = ["  brazilian   portuguese ", "Brazilian Portuguese", "", "   ", "english"]
    raw.extend(f"language {index}" for index in range(30))
    raw.append("x" * 100)
    languages = normalize_languages(raw)

    assert languages[0] == "Brazilian Portuguese"
    assert languages[1] == "English"
    assert "" not in languages
    assert len(languages) == 20
    assert all(len(item) <= 80 for item in languages)
    assert len({item.casefold() for item in languages}) == len(languages)


class _Body:
    def __init__(self, payload: bytes):
        self._payload = payload

    def read(self):
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def test_fetch_languages_reads_language_names_only():
    captured = {}

    def opener(request, timeout=None):
        captured["url"] = request.full_url
        captured["authorization"] = request.get_header("Authorization")
        captured["timeout"] = timeout
        body = json.dumps(
            {
                "id": "user-1",
                "name": "Ada Lovelace",
                "email": "ada@example.com",
                "birthday": "12/10/1815",
                "location": {"name": "London"},
                "languages": [
                    {"name": "English", "id": "en"},
                    {"name": "French"},
                    {"id": "missing-name"},
                    "Spanish",
                ],
            }
        ).encode()
        return _Body(body)

    languages = fetch_languages("meta-token", opener=opener)

    assert languages == ["English", "French"]
    assert captured["url"] == "https://graph.facebook.com/v21.0/me?fields=languages{name}"
    assert "email" not in captured["url"]
    assert "birthday" not in captured["url"]
    assert "location" not in captured["url"]
    assert captured["authorization"] == "Bearer meta-token"
    assert captured["timeout"] == 15


def test_fetch_languages_http_error():
    def opener(request, timeout=None):
        raise HTTPError(request.full_url, 400, "Bad Request", hdrs=None, fp=BytesIO(b""))

    with pytest.raises(MetaImportError, match="failed \\(400\\)"):
        fetch_languages("meta-token", opener=opener)


def test_import_normalizes_languages_and_stores_snapshot_without_token(client, monkeypatch):
    store = _Client()
    monkeypatch.setattr("app.firebase.firestore_client", lambda: store)
    monkeypatch.setattr(
        "app.routes.meta.meta_access_token",
        lambda user_id, secret_key: "should-not-be-stored",
    )

    def opener(request, timeout=None):
        assert request.full_url == "https://graph.facebook.com/v21.0/me?fields=languages{name}"
        assert request.get_header("Authorization") == "Bearer should-not-be-stored"
        body = json.dumps(
            {
                "name": "Do Not Store",
                "email": "secret@example.com",
                "languages": [
                    {"name": "  alt   spanish "},
                    {"name": "ALT SPANISH"},
                    {"name": "korean"},
                    {"name": ""},
                ],
            }
        ).encode()
        return _Body(body)

    monkeypatch.setattr("urllib.request.urlopen", opener)

    response = client.post(
        "/api/meta/import",
        headers={"X-User-Id": "user_123"},
        json={"user_id": "someone_else"},
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body == {
        "languages": ["Alt Spanish", "Korean"],
        "suggestions": {"knows": ["Alt Spanish", "Korean"], "wants_to_learn": []},
    }

    snapshot = (
        store.collection("users")
        .document("user_123")
        .collection("profile")
        .document("meta")
        .data
    )
    assert snapshot["languages"] == ["Alt Spanish", "Korean"]
    assert snapshot["source"] == "clerk_meta"
    assert snapshot["imported_at"] is not None
    assert "access_token" not in snapshot
    assert "token" not in snapshot
    assert "name" not in snapshot
    assert "email" not in snapshot
    assert "birthday" not in snapshot
    assert "location" not in snapshot
    assert "should-not-be-stored" not in json.dumps(snapshot, default=str)


def test_import_http_failure_returns_502(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes.meta.meta_access_token",
        lambda user_id, secret_key: "meta-token",
    )

    def opener(request, timeout=None):
        raise HTTPError(request.full_url, 401, "Unauthorized", hdrs=None, fp=BytesIO(b""))

    monkeypatch.setattr("urllib.request.urlopen", opener)
    monkeypatch.setattr(
        "app.routes.meta.save_meta_snapshot",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("snapshot was written")),
    )

    response = client.post("/api/meta/import", headers={"X-User-Id": "user_123"})

    assert response.status_code == 502
    assert "failed (401)" in response.get_json()["error"]


def test_import_without_meta_returns_404(client, monkeypatch):
    def fail_http(*args, **kwargs):
        raise AssertionError("Meta was called without a token")

    monkeypatch.setattr("app.routes.meta.meta_access_token", lambda user_id, secret_key: None)
    monkeypatch.setattr("urllib.request.urlopen", fail_http)
    monkeypatch.setattr(
        "app.routes.meta.save_meta_snapshot",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("snapshot was written")),
    )

    response = client.post("/api/meta/import", headers={"X-User-Id": "user_123"})

    assert response.status_code == 404
    assert response.get_json()["error"] == "Connect Meta before importing preferences"
