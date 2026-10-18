from pathlib import Path

from app.config import ROOT
from app.firebase import _resolve_credentials_path


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
