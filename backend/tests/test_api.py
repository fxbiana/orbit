from app import create_app


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.get_json()["status"] == "ok"


def test_tickets_require_a_user_id(client):
    response = client.get("/api/tickets")
    assert response.status_code == 401
    assert response.get_json()["error"] == "X-User-Id is required"


def test_me_requires_a_user_id(client):
    response = client.get("/api/me")
    assert response.status_code == 401
    assert response.get_json()["error"] == "X-User-Id is required"


def test_onboarding_requires_a_user_id(client):
    read = client.get("/api/onboarding")
    assert read.status_code == 401
    assert read.get_json()["error"] == "X-User-Id is required"

    write = client.put(
        "/api/onboarding",
        json={"username": "amira", "first_name": "Amira"},
    )
    assert write.status_code == 401
    assert write.get_json()["error"] == "X-User-Id is required"


def test_matches_requires_a_user_id(client):
    response = client.get("/api/matches")
    assert response.status_code == 401
    assert response.get_json()["error"] == "X-User-Id is required"


def test_post_ticket_requires_a_user_id(client):
    response = client.post(
        "/api/tickets",
        json={"title": "A tab", "url": "https://example.com/tab"},
    )
    assert response.status_code == 401
    assert response.get_json()["error"] == "X-User-Id is required"


def test_user_id_rejects_a_path_character(client):
    response = client.get("/api/me", headers={"X-User-Id": "../other"})
    assert response.status_code == 400
    assert response.get_json()["error"] == "X-User-Id is invalid"


def test_user_id_header_is_the_caller(client):
    response = client.get(
        "/api/me",
        headers={"X-User-Id": "local_browser"},
    )
    assert response.status_code == 200
    assert response.get_json() == {"user_id": "local_browser"}


def test_preflight_allows_the_user_header(client):
    origin = "chrome-extension://gpnknnpdogpdgeejedabdihnacblhmmj"
    response = client.options(
        "/api/tickets",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "x-user-id,content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["Access-Control-Allow-Origin"] == origin
    assert "x-user-id" in response.headers["Access-Control-Allow-Headers"].lower()


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
