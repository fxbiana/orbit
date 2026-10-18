from app import create_app


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.get_json()["status"] == "ok"


def test_tickets_require_a_session_token(client):
    response = client.get("/api/tickets")
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
