"""Connection requests. A match score is not a connection.

``connectionId`` is the first 24 hex characters of SHA-256 over the sorted
user ids joined by a NUL byte. Clerk ids contain underscores, so joining them
with ``_`` could collide.
"""

import hashlib
import re

from flask import abort

BOXES = ("inbox", "outbox", "friends")
INTRO_MAX_LENGTH = 280
MESSAGE_MAX_LENGTH = 500
_USER_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
CONNECTION_ID = re.compile(r"^[a-f0-9]{24}$")


def _clean(value: str) -> str:
    return " ".join(value.split())


def pair_id(left: str, right: str) -> str:
    first, second = sorted((left, right))
    digest = hashlib.sha256(f"{first}\0{second}".encode()).hexdigest()
    return digest[:24]


def _optional_text(raw, name: str, max_length: int) -> str:
    if raw is None or raw == "":
        return ""
    if not isinstance(raw, str):
        abort(400, description=f"{name} must be a string")
    text = _clean(raw)
    if len(text) > max_length:
        abort(400, description=f"{name} is too long")
    return text


def parse_box(value: str | None) -> str:
    if value is None or value == "":
        abort(400, description="box is required")
    if value not in BOXES:
        abort(400, description="box must be one of: inbox, outbox, friends")
    return value


def parse_connection_create(body, caller: str) -> dict:
    if not isinstance(body, dict):
        abort(400, description="JSON object is required")

    unexpected = sorted(set(body) - {"to_user_id", "intro"})
    if unexpected:
        abort(400, description=f"unexpected field: {unexpected[0]}")

    raw_id = body.get("to_user_id")
    if not isinstance(raw_id, str) or _USER_ID.fullmatch(raw_id.strip()) is None:
        abort(400, description="to_user_id is invalid")
    to_user_id = raw_id.strip()
    if to_user_id == caller:
        abort(400, description="you cannot connect with yourself")

    return {"to_user_id": to_user_id, "intro": _optional_text(body.get("intro"), "intro", INTRO_MAX_LENGTH)}


def parse_message(body) -> str:
    if not isinstance(body, dict):
        abort(400, description="JSON object is required")
    unexpected = sorted(set(body) - {"text"})
    if unexpected:
        abort(400, description=f"unexpected field: {unexpected[0]}")
    text = _optional_text(body.get("text"), "text", MESSAGE_MAX_LENGTH)
    if not text:
        abort(400, description="text is required")
    return text
