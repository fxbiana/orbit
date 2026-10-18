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
from app.plans import member_response, plan_response

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


def _plans():
    return firestore_client().collection("plans")


def _plan_ref(plan_id: str):
    return _plans().document(plan_id)


def _plan_members(plan_id: str):
    return _plan_ref(plan_id).collection("members")


def _list_member_docs(plan_id: str) -> list:
    try:
        return [doc for doc in _plan_members(plan_id).stream() if getattr(doc, "exists", True)]
    except HTTPException:
        raise
    except Exception:
        log.exception("Firestore plan members list failed")
        abort(503, description="Firestore request failed")


def _member_snapshot(plan_id: str, viewer_id: str) -> tuple[int, bool, list[dict]]:
    docs = _list_member_docs(plan_id)
    members = [member_response(doc.id, doc.to_dict() or {}, _iso) for doc in docs]
    members.sort(key=lambda item: (item["role"] != "host", item["joined_at"] or "", item["user_id"]))
    viewer_joined = any(item["user_id"] == viewer_id for item in members)
    return len(members), viewer_joined, members


def list_open_plans(viewer_id: str) -> list[dict]:
    """Return open plans newest first, with member_count and viewer_joined.

    Filter by ``status`` in the query, then sort ``created_at`` in process.
    That avoids a composite Firestore index on ``status`` + ``created_at``.
    """
    try:
        docs = list(_plans().where("status", "==", "open").stream())
        docs.sort(
            key=lambda doc: (doc.to_dict() or {}).get("created_at") or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )
        plans: list[dict] = []
        for doc in docs:
            data = doc.to_dict() or {}
            member_count, viewer_joined, _members = _member_snapshot(doc.id, viewer_id)
            plans.append(
                plan_response(
                    doc.id,
                    data,
                    _iso,
                    member_count=member_count,
                    viewer_joined=viewer_joined,
                )
            )
        return plans
    except HTTPException:
        raise
    except Exception:
        log.exception("Firestore open plans list failed")
        abort(503, description="Firestore request failed")


def create_plan(host_id: str, fields: dict) -> dict:
    """Create a plan and auto-join the creator as host."""
    plan_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    payload = {
        "host_id": host_id,
        "title": fields["title"],
        "activity_type": fields["activity_type"],
        "location_text": fields["location_text"],
        "starts_at": fields.get("starts_at"),
        "capacity": fields["capacity"],
        "status": "open",
        "created_at": now,
        "updated_at": now,
    }
    member_payload = {
        "joined_at": now,
        "role": "host",
    }
    try:
        plan_ref = _plan_ref(plan_id)
        plan_ref.set(payload)
        plan_ref.collection("members").document(host_id).set(member_payload)
    except HTTPException:
        raise
    except Exception:
        log.exception("Firestore plan create failed")
        abort(503, description="Firestore request failed")
    return plan_response(
        plan_id,
        payload,
        _iso,
        member_count=1,
        viewer_joined=True,
        members=[member_response(host_id, member_payload, _iso)],
    )


def get_plan(plan_id: str, viewer_id: str) -> dict | None:
    try:
        snap = _plan_ref(plan_id).get()
        if not snap.exists:
            return None
        data = snap.to_dict() or {}
    except HTTPException:
        raise
    except Exception:
        log.exception("Firestore plan read failed")
        abort(503, description="Firestore request failed")

    member_count, viewer_joined, members = _member_snapshot(plan_id, viewer_id)
    return plan_response(
        plan_id,
        data,
        _iso,
        member_count=member_count,
        viewer_joined=viewer_joined,
        members=members,
    )


def join_plan(plan_id: str, user_id: str) -> dict:
    """Join an open plan as a member when under capacity."""
    try:
        plan_ref = _plan_ref(plan_id)
        snap = plan_ref.get()
        if not snap.exists:
            abort(404, description="plan not found")
        data = snap.to_dict() or {}
        if (data.get("status") or "open") != "open":
            abort(409, description="plan is closed")

        members_ref = plan_ref.collection("members")
        existing = members_ref.document(user_id).get()
        if existing.exists:
            abort(409, description="already joined")

        member_docs = [doc for doc in members_ref.stream() if getattr(doc, "exists", True)]
        capacity = data.get("capacity")
        if not isinstance(capacity, int):
            capacity = 6
        if len(member_docs) >= capacity:
            abort(409, description="plan is at capacity")

        now = datetime.now(timezone.utc)
        member_payload = {"joined_at": now, "role": "member"}
        members_ref.document(user_id).set(member_payload)
        data["updated_at"] = now
        plan_ref.set({**data, "updated_at": now})
    except HTTPException:
        raise
    except Exception:
        log.exception("Firestore plan join failed")
        abort(503, description="Firestore request failed")

    result = get_plan(plan_id, user_id)
    if result is None:
        abort(404, description="plan not found")
    return result


def list_plan_member_profiles(plan_id: str, exclude_user_id: str) -> list[dict]:
    """Load onboarding profiles for plan members except the viewer."""
    try:
        snap = _plan_ref(plan_id).get()
        if not snap.exists:
            abort(404, description="plan not found")
        member_docs = _list_member_docs(plan_id)
    except HTTPException:
        raise
    except Exception:
        log.exception("Firestore plan member profiles failed")
        abort(503, description="Firestore request failed")

    peers: list[dict] = []
    for doc in member_docs:
        if doc.id == exclude_user_id:
            continue
        profile = get_onboarding(doc.id)
        if profile is not None:
            peers.append(profile)
    return peers
