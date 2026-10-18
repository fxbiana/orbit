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
from app.connections import CONNECTION_ID, pair_id
from app.contact import blank_contact, contact_response, public_contact
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

    The status filter uses the automatic single-field index. Sorting happens
    here so the list does not depend on a composite ``status`` + ``created_at``
    index.
    """
    try:
        docs = list(_plans().where("status", "==", "open").stream())
        rows = []
        for doc in docs:
            data = doc.to_dict() or {}
            member_count, viewer_joined, _members = _member_snapshot(doc.id, viewer_id)
            rows.append((data.get("created_at"), doc.id, data, member_count, viewer_joined))
        rows.sort(key=lambda item: (item[0] is not None, item[0] or ""), reverse=True)
        return [
            plan_response(
                plan_id,
                data,
                _iso,
                member_count=member_count,
                viewer_joined=viewer_joined,
            )
            for _created_at, plan_id, data, member_count, viewer_joined in rows
        ]
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


def _contact_ref(clerk_user_id: str):
    return (
        firestore_client()
        .collection("users")
        .document(clerk_user_id)
        .collection("profile")
        .document("contact")
    )


def get_contact(clerk_user_id: str) -> dict:
    """Read the caller's contact document. A miss does not create one."""
    try:
        snap = _contact_ref(clerk_user_id).get()
        if not snap.exists:
            return blank_contact()
        return contact_response(snap.to_dict() or {}, _iso)
    except HTTPException:
        raise
    except Exception:
        log.exception("Firestore contact read failed")
        abort(503, description="Firestore request failed")


def _spotify_ref(clerk_user_id: str):
    return (
        firestore_client()
        .collection("users")
        .document(clerk_user_id)
        .collection("profile")
        .document("spotify")
    )


def _meta_ref(clerk_user_id: str):
    return (
        firestore_client()
        .collection("users")
        .document(clerk_user_id)
        .collection("profile")
        .document("meta")
    )


def save_meta_snapshot(clerk_user_id: str, languages: list[str]) -> dict:
    """Store normalized languages only. OAuth tokens never go in this document."""
    payload = {
        "languages": list(languages),
        "imported_at": datetime.now(timezone.utc),
        "source": "clerk_meta",
    }
    try:
        _meta_ref(clerk_user_id).set(payload)
    except HTTPException:
        raise
    except Exception:
        log.exception("Firestore meta write failed")
        abort(503, description="Firestore request failed")
    return {
        "languages": payload["languages"],
        "imported_at": _iso(payload["imported_at"]),
        "source": payload["source"],
    }


def save_spotify_snapshot(clerk_user_id: str, genres: list[str]) -> dict:
    """Store normalized genres only. OAuth tokens never go in this document."""
    payload = {
        "genres": list(genres),
        "imported_at": datetime.now(timezone.utc),
        "source": "clerk_spotify",
    }
    try:
        _spotify_ref(clerk_user_id).set(payload)
    except HTTPException:
        raise
    except Exception:
        log.exception("Firestore spotify write failed")
        abort(503, description="Firestore request failed")
    return {
        "genres": payload["genres"],
        "imported_at": _iso(payload["imported_at"]),
        "source": payload["source"],
    }


def save_contact(clerk_user_id: str, fields: dict) -> dict:
    now = datetime.now(timezone.utc)
    payload = {**fields, "updated_at": now}
    try:
        _contact_ref(clerk_user_id).set(payload)
    except HTTPException:
        raise
    except Exception:
        log.exception("Firestore contact write failed")
        abort(503, description="Firestore request failed")
    return contact_response(payload, _iso)


def _contact_for_friend(user_id: str) -> dict:
    try:
        snap = _contact_ref(user_id).get()
    except HTTPException:
        raise
    except Exception:
        log.exception("Firestore contact read failed")
        abort(503, description="Firestore request failed")
    if not snap.exists:
        return public_contact({})
    return public_contact(snap.to_dict() or {})


def _connections():
    return firestore_client().collection("connections")


def _connection_ref(connection_id: str):
    return _connections().document(connection_id)


def _other_summary(user_id: str) -> dict:
    profile = get_onboarding(user_id) if user_id else None
    return {
        "user_id": user_id,
        "first_name": (profile or {}).get("first_name") or "",
        "username": (profile or {}).get("username") or "",
    }


def _connection_body(doc_id: str, data: dict, caller: str) -> dict:
    if data.get("from_user_id") == caller:
        other_id = data.get("to_user_id") or ""
    else:
        other_id = data.get("from_user_id") or ""
    contact = None
    if data.get("status") == "accepted" and other_id:
        contact = _contact_for_friend(other_id)
    return {
        "id": doc_id,
        "from_user_id": data.get("from_user_id") or "",
        "to_user_id": data.get("to_user_id") or "",
        "status": data.get("status") or "",
        "intro": data.get("intro") or "",
        "other": _other_summary(other_id),
        "contact": contact,
        "created_at": _iso(data.get("created_at")),
        "updated_at": _iso(data.get("updated_at")),
        "responded_at": _iso(data.get("responded_at")),
    }


def _load_connection(connection_id: str) -> tuple[str, dict]:
    if CONNECTION_ID.fullmatch(connection_id or "") is None:
        abort(404, description="connection not found")
    try:
        snap = _connection_ref(connection_id).get()
    except HTTPException:
        raise
    except Exception:
        log.exception("Firestore connection read failed")
        abort(503, description="Firestore request failed")
    if not snap.exists:
        abort(404, description="connection not found")
    return snap.id, snap.to_dict() or {}


def _require_party(data: dict, caller: str) -> None:
    if caller not in (data.get("from_user_id"), data.get("to_user_id")):
        abort(403, description="you are not part of this connection")


def create_connection(caller: str, fields: dict) -> dict:
    to_user_id = fields["to_user_id"]
    if get_onboarding(caller) is None:
        abort(404, description="onboarding profile not found")
    if get_onboarding(to_user_id) is None:
        abort(404, description="that person is not on Orbit")

    ref = _connection_ref(pair_id(caller, to_user_id))
    now = datetime.now(timezone.utc)
    try:
        snap = ref.get()
        if snap.exists:
            data = snap.to_dict() or {}
            parties = {data.get("from_user_id"), data.get("to_user_id")}
            if parties != {caller, to_user_id}:
                abort(409, description="connection id is already in use")
            status = data.get("status")
            if status == "pending":
                abort(409, description="a request is already waiting")
            if status == "accepted":
                abort(409, description="you are already connected")
            if status != "rejected":
                abort(409, description="a request is already waiting")
        payload = {
            "from_user_id": caller,
            "to_user_id": to_user_id,
            "status": "pending",
            "intro": fields.get("intro") or "",
            "created_at": now,
            "updated_at": now,
            "responded_at": None,
        }
        ref.set(payload)
    except HTTPException:
        raise
    except Exception:
        log.exception("Firestore connection create failed")
        abort(503, description="Firestore request failed")
    return _connection_body(ref.id, payload, caller)


def list_connections(caller: str, box: str) -> list[dict]:
    try:
        outgoing = list(_connections().where("from_user_id", "==", caller).stream())
        incoming = list(_connections().where("to_user_id", "==", caller).stream())
    except HTTPException:
        raise
    except Exception:
        log.exception("Firestore connection list failed")
        abort(503, description="Firestore request failed")

    seen: set[str] = set()
    chosen: list[tuple[str, dict]] = []
    for doc in outgoing + incoming:
        if doc.id in seen:
            continue
        seen.add(doc.id)
        data = doc.to_dict() or {}
        if caller not in (data.get("from_user_id"), data.get("to_user_id")):
            continue
        status = data.get("status")
        if box == "inbox" and data.get("to_user_id") == caller and status == "pending":
            chosen.append((doc.id, data))
        elif box == "outbox" and data.get("from_user_id") == caller and status == "pending":
            chosen.append((doc.id, data))
        elif box == "friends" and status == "accepted":
            chosen.append((doc.id, data))

    floor = datetime.min.replace(tzinfo=timezone.utc)
    chosen.sort(key=lambda item: item[1].get("created_at") or floor, reverse=True)
    return [_connection_body(doc_id, data, caller) for doc_id, data in chosen]


def set_connection_status(connection_id: str, caller: str, status: str) -> dict:
    doc_id, data = _load_connection(connection_id)
    _require_party(data, caller)
    if data.get("to_user_id") != caller:
        verb = "accept" if status == "accepted" else "decline"
        abort(403, description=f"only the recipient can {verb}")
    if data.get("status") != "pending":
        abort(409, description="this request is no longer pending")

    now = datetime.now(timezone.utc)
    data["status"] = status
    data["updated_at"] = now
    data["responded_at"] = now
    try:
        _connection_ref(doc_id).set(data)
    except HTTPException:
        raise
    except Exception:
        log.exception("Firestore connection update failed")
        abort(503, description="Firestore request failed")
    return _connection_body(doc_id, data, caller)


def _message_body(message_id: str, data: dict, caller: str) -> dict:
    return {
        "id": message_id,
        "author_id": data.get("author_id") or "",
        "text": data.get("text") or "",
        "created_at": _iso(data.get("created_at")),
        "mine": data.get("author_id") == caller,
    }


def _require_accepted_party(connection_id: str, caller: str) -> tuple[str, dict]:
    doc_id, data = _load_connection(connection_id)
    _require_party(data, caller)
    if data.get("status") != "accepted":
        abort(403, description="messages open after you both accept")
    return doc_id, data


def list_messages(connection_id: str, caller: str) -> list[dict]:
    doc_id, _data = _require_accepted_party(connection_id, caller)
    try:
        docs = list(_connection_ref(doc_id).collection("messages").stream())
    except HTTPException:
        raise
    except Exception:
        log.exception("Firestore message list failed")
        abort(503, description="Firestore request failed")

    floor = datetime.min.replace(tzinfo=timezone.utc)
    packed = []
    for doc in docs:
        item = doc.to_dict() or {}
        packed.append((item.get("created_at") or floor, doc.id, item))
    packed.sort(key=lambda row: row[0])
    return [_message_body(message_id, item, caller) for _stamp, message_id, item in packed[-50:]]


def post_message(connection_id: str, caller: str, text: str) -> dict:
    doc_id, _data = _require_accepted_party(connection_id, caller)
    message_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    payload = {"author_id": caller, "text": text, "created_at": now}
    try:
        _connection_ref(doc_id).collection("messages").document(message_id).set(payload)
    except HTTPException:
        raise
    except Exception:
        log.exception("Firestore message create failed")
        abort(503, description="Firestore request failed")
    return _message_body(message_id, payload, caller)
