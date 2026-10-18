import logging
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore
from flask import abort, current_app
from werkzeug.exceptions import HTTPException

from app.config import ROOT
from app.onboarding import onboarding_response

log = logging.getLogger(__name__)
_firestore = None
_init_lock = threading.Lock()


def _credentials_path() -> str:
    return (current_app.config.get("FIREBASE_CREDENTIALS_PATH") or "").strip()


def _resolve_credentials_path(configured: str) -> Path:
    """Resolve a relative credentials path against the repo root.

    Absolute paths are left unchanged. The process cwd is not used, so a
    relative path still finds a file next to the root ``.env`` when Flask is
    started from ``backend/``.
    """
    candidate = Path(configured)
    if candidate.is_absolute():
        return candidate
    return (ROOT / candidate).resolve()


def firestore_client():
    """Return the Admin SDK client. Abort with JSON when credentials are unusable."""
    global _firestore
    if _firestore is not None:
        return _firestore

    with _init_lock:
        if _firestore is not None:
            return _firestore

        path = _credentials_path()
        if not path:
            abort(503, description="FIREBASE_CREDENTIALS_PATH is not configured")
        credentials_file = _resolve_credentials_path(path)
        if not credentials_file.is_file():
            abort(503, description=f"Firebase credentials file not found: {path}")

        try:
            try:
                firebase_admin.get_app()
            except ValueError:
                firebase_admin.initialize_app(credentials.Certificate(str(credentials_file)))
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


def _onboarding(clerk_user_id: str):
    return (
        firestore_client()
        .collection("users")
        .document(clerk_user_id)
        .collection("profile")
        .document("onboarding")
    )


def get_onboarding(clerk_user_id: str) -> dict | None:
    try:
        snap = _onboarding(clerk_user_id).get()
        if not snap.exists:
            return None
        data = snap.to_dict() or {}
    except HTTPException:
        raise
    except Exception:
        log.exception("Firestore onboarding read failed")
        abort(503, description="Firestore request failed")
    return onboarding_response(clerk_user_id, data, _iso)


def save_onboarding(clerk_user_id: str, profile: dict) -> tuple[dict, bool]:
    """Create or replace the caller's onboarding profile.

    Returns the API document and whether this write created it.
    """
    ref = _onboarding(clerk_user_id)
    now = datetime.now(timezone.utc)
    try:
        snap = ref.get()
        created = not snap.exists
        created_at = now
        if snap.exists:
            previous = snap.to_dict() or {}
            created_at = previous.get("created_at") or now
        payload = {
            "user_id": clerk_user_id,
            **profile,
            "created_at": created_at,
            "updated_at": now,
        }
        ref.set(payload)
    except HTTPException:
        raise
    except Exception:
        log.exception("Firestore onboarding write failed")
        abort(503, description="Firestore request failed")
    return onboarding_response(clerk_user_id, payload, _iso), created


def _user_id_from_onboarding_snap(snap) -> str | None:
    """Derive the owning user id from ``users/{uid}/profile/onboarding``."""
    data = snap.to_dict() or {}
    stored = data.get("user_id")
    if isinstance(stored, str) and stored:
        return stored
    reference = getattr(snap, "reference", None)
    path = getattr(reference, "path", None) if reference is not None else None
    if isinstance(path, str):
        parts = path.split("/")
        if len(parts) >= 4 and parts[0] == "users" and parts[2] == "profile":
            return parts[1]
    return None


def list_onboarding_peers(exclude_user_id: str) -> list[dict]:
    """Load every onboarding profile except the caller's.

    Uses a collection-group scan on ``profile`` documents named ``onboarding``.
    Parent ``users/{id}`` documents are not required to exist.
    """
    try:
        snaps = firestore_client().collection_group("profile").stream()
        peers: list[dict] = []
        for snap in snaps:
            if snap.id != "onboarding":
                continue
            user_id = _user_id_from_onboarding_snap(snap)
            if not user_id or user_id == exclude_user_id:
                continue
            data = snap.to_dict() or {}
            peers.append(onboarding_response(user_id, data, _iso))
        return peers
    except HTTPException:
        raise
    except Exception:
        log.exception("Firestore onboarding peer list failed")
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
