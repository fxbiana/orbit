import pytest

from app import create_app


@pytest.fixture
def app():
    return create_app(
        {
            "TESTING": True,
            "AUTH_MODE": "local",
            "CLERK_SECRET_KEY": "sk_test_placeholder",
            "CLERK_AUTHORIZED_PARTIES": ["chrome-extension://gpnknnpdogpdgeejedabdihnacblhmmj"],
            "FIREBASE_CREDENTIALS_PATH": "",
        }
    )


@pytest.fixture
def client(app):
    return app.test_client()
