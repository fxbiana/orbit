from app import create_app


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.get_json()["status"] == "ok"


def test_tickets_require_a_session_token(client):
    response = client.get("/api/tickets")
    assert response.status_code == 401
    assert response.get_json()["error"] == "SESSION_TOKEN_MISSING"


def test_me_requires_a_session_token(client):
    response = client.get("/api/me")
    assert response.status_code == 401
    assert response.get_json()["error"] == "SESSION_TOKEN_MISSING"


def test_post_ticket_requires_a_session_token(client):
    response = client.post(
        "/api/tickets",
        json={"title": "A tab", "url": "https://example.com/tab"},
    )
    assert response.status_code == 401
    assert response.get_json()["error"] == "SESSION_TOKEN_MISSING"


def test_ready_without_firebase_credentials(client):
    response = client.get("/ready")
    assert response.status_code == 503
    assert response.get_json()["error"] == "FIREBASE_CREDENTIALS_PATH is not configured"


def test_ready_when_credentials_file_is_absent():
    app = create_app(
        {
            "TESTING": True,
            "FIREBASE_CREDENTIALS_PATH": "/tmp/ticket-trapper-no-such-firebase-credentials.json",
        }
    )
    response = app.test_client().get("/ready")
    assert response.status_code == 503
    assert response.get_json()["error"] == (
        "Firebase credentials file not found: "
        "/tmp/ticket-trapper-no-such-firebase-credentials.json"
    )


def test_ready_when_firestore_read_succeeds(client, monkeypatch):
    class ReadyFirestore:
        def collection(self, _name):
            return self

        def document(self, _name):
            return self

        def get(self):
            return object()

    monkeypatch.setattr("app.firebase.firestore_client", lambda: ReadyFirestore())
    response = client.get("/ready")
    assert response.status_code == 200
    assert response.get_json()["status"] == "ok"


def test_ready_when_firestore_read_fails(client, monkeypatch):
    class FailingFirestore:
        def collection(self, _name):
            return self

        def document(self, _name):
            return self

        def get(self):
            raise RuntimeError("firestore unavailable")

    monkeypatch.setattr("app.firebase.firestore_client", lambda: FailingFirestore())
    response = client.get("/ready")
    assert response.status_code == 503
    assert response.get_json()["error"] == "Firestore read failed"


def test_ready_keeps_an_http_error_from_the_read(client, monkeypatch):
    from flask import abort

    class AbortingRead:
        def collection(self, _name):
            return self

        def document(self, _name):
            return self

        def get(self):
            abort(503, description="permission denied")

    monkeypatch.setattr("app.firebase.firestore_client", lambda: AbortingRead())
    response = client.get("/ready")
    assert response.status_code == 503
    assert response.get_json()["error"] == "permission denied"


def test_api_cors_allows_only_the_configured_origin(client):
    origin = "chrome-extension://gpnknnpdogpdgeejedabdihnacblhmmj"
    allowed = client.get("/api/me", headers={"Origin": origin})
    assert allowed.headers["Access-Control-Allow-Origin"] == origin

    rejected = client.get("/api/me", headers={"Origin": "https://evil.example"})
    assert "Access-Control-Allow-Origin" not in rejected.headers

    health = client.get("/health", headers={"Origin": origin})
    assert "Access-Control-Allow-Origin" not in health.headers
