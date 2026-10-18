from app.config import env_csv


def test_env_csv_splits_and_strips(monkeypatch):
    monkeypatch.setenv(
        "CLERK_AUTHORIZED_PARTIES",
        " https://a.example , ,https://b.example, ",
    )
    assert env_csv("CLERK_AUTHORIZED_PARTIES", ["fallback"]) == [
        "https://a.example",
        "https://b.example",
    ]


def test_env_csv_uses_the_default_when_unset(monkeypatch):
    monkeypatch.delenv("MISSING_TICKET_TRAPPER", raising=False)
    assert env_csv("MISSING_TICKET_TRAPPER", ["chrome-extension://id"]) == [
        "chrome-extension://id"
    ]


def test_env_csv_empty_string_uses_the_default(monkeypatch):
    monkeypatch.setenv("CLERK_AUTHORIZED_PARTIES", "")
    assert env_csv("CLERK_AUTHORIZED_PARTIES", ["fallback"]) == ["fallback"]


def test_env_csv_whitespace_only_returns_empty(monkeypatch):
    monkeypatch.setenv("CLERK_AUTHORIZED_PARTIES", "   ")
    assert env_csv("CLERK_AUTHORIZED_PARTIES", ["fallback"]) == []


def test_env_csv_without_a_default_returns_an_empty_list(monkeypatch):
    monkeypatch.delenv("MISSING_TICKET_TRAPPER", raising=False)
    assert env_csv("MISSING_TICKET_TRAPPER") == []
