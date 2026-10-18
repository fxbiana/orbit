import threading
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import Mock

import pytest
from werkzeug.exceptions import ServiceUnavailable

from app import create_app
from app.config import ROOT
from app.firebase import _iso, _resolve_credentials_path, _ticket_dict, firestore_client


def test_relative_credentials_path_resolves_against_repo_root(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    configured = "firebase/service-account.json"
    resolved = _resolve_credentials_path(configured)
    assert resolved == (ROOT / configured).resolve()
    assert resolved.is_absolute()
    assert tmp_path not in resolved.parents


def test_absolute_credentials_path_stays_absolute():
    configured = "/tmp/ticket-trapper-absolute-credentials.json"
    resolved = _resolve_credentials_path(configured)
    assert resolved == Path(configured)
    assert resolved.is_absolute()


def test_empty_credentials_path_does_not_become_a_file(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    resolved = _resolve_credentials_path("")
    assert resolved == ROOT
    assert not resolved.is_file()


def test_iso_formats_datetimes():
    value = datetime(2026, 5, 1, 12, 30, tzinfo=timezone.utc)
    assert _iso(value) == "2026-05-01T12:30:00+00:00"


def test_iso_none_is_none():
    assert _iso(None) is None


def test_iso_uses_isoformat_when_present():
    class Stamp:
        def isoformat(self):
            return "2026-05-01T12:30:00Z"

    assert _iso(Stamp()) == "2026-05-01T12:30:00Z"


def test_iso_stringifies_other_values():
    assert _iso(123) == "123"


def test_ticket_dict_defaults_missing_fields():
    assert _ticket_dict("t1", {}) == {
        "id": "t1",
        "title": "",
        "url": "",
        "status": "open",
        "created_at": None,
    }


def test_ticket_dict_keeps_stored_fields():
    created = datetime(2026, 5, 1, tzinfo=timezone.utc)
    assert _ticket_dict(
        "t1",
        {
            "title": "A tab",
            "url": "https://example.com/tab",
            "status": "closed",
            "created_at": created,
        },
    ) == {
        "id": "t1",
        "title": "A tab",
        "url": "https://example.com/tab",
        "status": "closed",
        "created_at": created.isoformat(),
    }


def _app_with_credentials(path: str):
    return create_app(
        {
            "TESTING": True,
            "FIREBASE_CREDENTIALS_PATH": path,
        }
    )


def test_blank_credentials_path_is_not_configured():
    app = _app_with_credentials("   ")
    response = app.test_client().get("/ready")
    assert response.status_code == 503
    assert response.get_json()["error"] == "FIREBASE_CREDENTIALS_PATH is not configured"


def test_missing_relative_credentials_file_names_the_configured_path(monkeypatch, tmp_path):
    monkeypatch.setattr("app.firebase._firestore", None)
    monkeypatch.chdir(tmp_path)
    app = _app_with_credentials("firebase/missing.json")
    response = app.test_client().get("/ready")
    assert response.status_code == 503
    assert response.get_json()["error"] == (
        "Firebase credentials file not found: firebase/missing.json"
    )


def test_firestore_client_reuses_an_initialized_client(monkeypatch):
    sentinel = object()
    monkeypatch.setattr("app.firebase._firestore", sentinel)
    get_app = Mock(side_effect=AssertionError("cached client should skip Admin"))
    monkeypatch.setattr("app.firebase.firebase_admin.get_app", get_app)

    assert firestore_client() is sentinel
    assert firestore_client() is sentinel
    get_app.assert_not_called()


def test_firestore_client_uses_an_existing_admin_app(monkeypatch, tmp_path):
    credentials_file = tmp_path / "service-account.json"
    credentials_file.write_text("{}")
    monkeypatch.setattr("app.firebase._firestore", None)
    monkeypatch.setattr("app.firebase.firebase_admin.get_app", lambda: object())
    initialize_app = Mock(side_effect=AssertionError("existing app should not be reinitialized"))
    monkeypatch.setattr("app.firebase.firebase_admin.initialize_app", initialize_app)
    client = object()
    monkeypatch.setattr("app.firebase.firestore.client", lambda: client)

    app = _app_with_credentials(str(credentials_file))
    with app.app_context():
        assert firestore_client() is client
        assert firestore_client() is client
    initialize_app.assert_not_called()


def test_firestore_client_initializes_once_when_admin_is_missing(monkeypatch, tmp_path):
    credentials_file = tmp_path / "service-account.json"
    credentials_file.write_text("{}")
    monkeypatch.setattr("app.firebase._firestore", None)
    monkeypatch.setattr(
        "app.firebase.firebase_admin.get_app",
        Mock(side_effect=ValueError("no app")),
    )
    initialize_app = Mock()
    monkeypatch.setattr("app.firebase.firebase_admin.initialize_app", initialize_app)
    monkeypatch.setattr("app.firebase.credentials.Certificate", lambda path: {"path": path})
    client = object()
    monkeypatch.setattr("app.firebase.firestore.client", lambda: client)

    app = _app_with_credentials(str(credentials_file))
    with app.app_context():
        assert firestore_client() is client
        assert firestore_client() is client

    initialize_app.assert_called_once()
    certificate_path = initialize_app.call_args.args[0]["path"]
    assert certificate_path == str(credentials_file)


def test_concurrent_callers_initialize_admin_once(monkeypatch, tmp_path):
    credentials_file = tmp_path / "service-account.json"
    credentials_file.write_text("{}")
    monkeypatch.setattr("app.firebase._firestore", None)
    started = threading.Barrier(2)
    initialize_app = Mock()
    monkeypatch.setattr(
        "app.firebase.firebase_admin.get_app",
        Mock(side_effect=ValueError("no app")),
    )
    monkeypatch.setattr("app.firebase.firebase_admin.initialize_app", initialize_app)
    monkeypatch.setattr("app.firebase.credentials.Certificate", lambda path: {"path": path})
    client = object()
    monkeypatch.setattr("app.firebase.firestore.client", lambda: client)

    app = _app_with_credentials(str(credentials_file))
    errors = []

    def call():
        try:
            with app.app_context():
                started.wait(timeout=2)
                assert firestore_client() is client
        except Exception as exc:
            errors.append(exc)

    threads = [threading.Thread(target=call) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert errors == []
    initialize_app.assert_called_once()


def test_firestore_client_aborts_when_admin_init_fails(monkeypatch, tmp_path):
    credentials_file = tmp_path / "service-account.json"
    credentials_file.write_text("{}")
    monkeypatch.setattr("app.firebase._firestore", None)
    monkeypatch.setattr(
        "app.firebase.firebase_admin.get_app",
        Mock(side_effect=ValueError("no app")),
    )
    monkeypatch.setattr("app.firebase.credentials.Certificate", lambda path: path)
    monkeypatch.setattr(
        "app.firebase.firebase_admin.initialize_app",
        Mock(side_effect=RuntimeError("bad credentials")),
    )

    app = _app_with_credentials(str(credentials_file))
    with app.app_context():
        with pytest.raises(ServiceUnavailable) as exc:
            firestore_client()
        assert exc.value.description == "Firebase Admin could not initialize"

    from app import firebase

    assert firebase._firestore is None
