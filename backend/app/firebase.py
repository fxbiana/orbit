import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore
from flask import abort, current_app
from werkzeug.exceptions import HTTPException

log = logging.getLogger(__name__)
_firestore = None


def _credentials_path() -> str:
    return (current_app.config.get("FIREBASE_CREDENTIALS_PATH") or "").strip()


def firestore_client():
    """Return the Admin SDK client. Abort with JSON when credentials are unusable."""
    global _firestore
    if _firestore is not None:
        return _firestore

    path = _credentials_path()
    if not path:
        abort(503, description="FIREBASE_CREDENTIALS_PATH is not configured")
    if not Path(path).is_file():
        abort(503, description=f"Firebase credentials file not found: {path}")

    try:
        try:
            firebase_admin.get_app()
        except ValueError:
            firebase_admin.initialize_app(credentials.Certificate(path))
        _firestore = firestore.client()
    except Exception:
        log.exception("Firebase Admin failed to initialize")
        abort(503, description="Firebase Admin could not initialize")

    current_app.logger.info("Firestore client ready")
    return _firestore


def check_firestore() -> None:
    """Initialize Admin and perform one document read."""
    client = firestore_client()
    try:
        client.collection("_ready").document("ping").get()
    except HTTPException:
        raise
    except Exception:
        log.exception("Firestore readiness check failed")
        abort(503, description="Firestore read failed")


def _iso(value) -> str | None:
    if value is None:
        return None
    isoformat = getattr(value, "isoformat", None)
    if callable(isoformat):
        return isoformat()
    return str(value)


def _ticket_dict(ticket_id: str, data: dict) -> dict:
    return {
        "id": ticket_id,
        "title": data.get("title") or "",
        "url": data.get("url") or "",
        "status": data.get("status") or "open",
        "created_at": _iso(data.get("created_at")),
    }


def _tickets(clerk_user_id: str):
    return (
        firestore_client()
        .collection("users")
        .document(clerk_user_id)
        .collection("tickets")
    )


def list_tickets(clerk_user_id: str) -> list[dict]:
    try:
        docs = (
            _tickets(clerk_user_id)
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .stream()
        )
        return [_ticket_dict(doc.id, doc.to_dict() or {}) for doc in docs]
    except HTTPException:
        raise
    except Exception:
        log.exception("Firestore list failed")
        abort(503, description="Firestore request failed")


def create_ticket(clerk_user_id: str, title: str, url: str) -> dict:
    ticket_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc)
    payload = {
        "title": title,
        "url": url,
        "status": "open",
        "created_at": created_at,
    }
    try:
        _tickets(clerk_user_id).document(ticket_id).set(payload)
    except HTTPException:
        raise
    except Exception:
        log.exception("Firestore create failed")
        abort(503, description="Firestore request failed")
    return _ticket_dict(ticket_id, payload)
