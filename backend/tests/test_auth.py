from app import create_app


class _Reason:
    def __init__(self, name):
        self.name = name


class _State:
    def __init__(self, signed_in, reason=None, sub="user_test"):
        self.is_signed_in = signed_in
        self.reason = reason
        self.payload = {"sub": sub}


def _clerk_app(**extra):
    config = {
        "TESTING": True,
        "AUTH_MODE": "clerk",
        "CLERK_SECRET_KEY": "sk_test_placeholder",
        "CLERK_AUTHORIZED_PARTIES": ["chrome-extension://gpnknnpdogpdgeejedabdihnacblhmmj"],
        "FIREBASE_CREDENTIALS_PATH": "",
    }
    config.update(extra)
    return create_app(config)


def test_missing_clerk_secret_is_unauthorized():
    app = _clerk_app(CLERK_SECRET_KEY="")
    response = app.test_client().get("/api/me")
    assert response.status_code == 401
    assert response.get_json()["error"] == "CLERK_SECRET_KEY is not configured"


def test_signed_out_uses_the_clerk_reason(monkeypatch):
    def authenticate_request(_flask_request, _options):
        return _State(False, _Reason("SESSION_TOKEN_EXPIRED"))

    monkeypatch.setattr("app.auth.authenticate_request", authenticate_request)
    response = _clerk_app().test_client().get("/api/me", headers={"Authorization": "Bearer nope"})
    assert response.status_code == 401
    assert response.get_json()["error"] == "SESSION_TOKEN_EXPIRED"


def test_signed_out_without_a_reason_is_unauthorized(monkeypatch):
    def authenticate_request(_flask_request, _options):
        return _State(False, None)

    monkeypatch.setattr("app.auth.authenticate_request", authenticate_request)
    response = _clerk_app().test_client().get("/api/me", headers={"Authorization": "Bearer nope"})
    assert response.status_code == 401
    assert response.get_json()["error"] == "unauthorized"


def test_user_id_comes_from_the_token_subject(monkeypatch):
    seen = {}

    def authenticate_request(_flask_request, options):
        seen["options"] = options
        return _State(True, sub="user_from_token")

    monkeypatch.setattr("app.auth.authenticate_request", authenticate_request)
    response = _clerk_app().test_client().get("/api/me", headers={"X-User-Id": "local_spoofed"})
    assert response.status_code == 200
    assert response.get_json() == {"user_id": "user_from_token"}

    options = seen["options"]
    assert options.secret_key == "sk_test_placeholder"
    assert options.jwt_key is None
    assert options.authorized_parties == [
        "chrome-extension://gpnknnpdogpdgeejedabdihnacblhmmj"
    ]
    assert options.accepts_token == ["session_token"]


def test_ticket_routes_surface_missing_firebase_credentials(monkeypatch):
    monkeypatch.setattr(
        "app.auth.authenticate_request",
        lambda _request, _options: _State(True),
    )
    client = _clerk_app().test_client()

    listed = client.get("/api/tickets")
    assert listed.status_code == 503
    assert listed.get_json()["error"] == "FIREBASE_CREDENTIALS_PATH is not configured"

    created = client.post(
        "/api/tickets",
        json={"title": "A tab", "url": "https://example.com/tab"},
    )
    assert created.status_code == 503
    assert created.get_json()["error"] == "FIREBASE_CREDENTIALS_PATH is not configured"


def test_jwt_key_is_forwarded_to_clerk(monkeypatch):
    seen = {}

    def authenticate_request(_flask_request, options):
        seen["options"] = options
        return _State(True, sub="user_from_token")

    monkeypatch.setattr("app.auth.authenticate_request", authenticate_request)
    app = _clerk_app(CLERK_JWT_KEY="pem-key", CLERK_AUTHORIZED_PARTIES=["https://example.com"])
    response = app.test_client().get("/api/me")
    assert response.status_code == 200
    assert seen["options"].jwt_key == "pem-key"
    assert seen["options"].authorized_parties == ["https://example.com"]
