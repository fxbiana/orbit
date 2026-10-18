import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")

EXTENSION_ORIGIN = "chrome-extension://gpnknnpdogpdgeejedabdihnacblhmmj"


def env_csv(key: str, default: list[str] | None = None) -> list[str]:
    raw = os.environ.get(key)
    if not raw:
        return list(default or [])
    return [part.strip() for part in raw.split(",") if part.strip()]


class Config:
    # local reads X-User-Id. clerk verifies a session token.
    AUTH_MODE = (os.environ.get("AUTH_MODE") or "local").strip().lower() or "local"
    CLERK_SECRET_KEY = os.environ.get("CLERK_SECRET_KEY", "")
    CLERK_JWT_KEY = os.environ.get("CLERK_JWT_KEY") or None
    CLERK_AUTHORIZED_PARTIES = env_csv("CLERK_AUTHORIZED_PARTIES", [EXTENSION_ORIGIN])
    CORS_ORIGINS = env_csv("CORS_ORIGINS", [EXTENSION_ORIGIN])
    FIREBASE_CREDENTIALS_PATH = os.environ.get("FIREBASE_CREDENTIALS_PATH", "")
