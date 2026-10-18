"""How a person wants to be reached.

Stored beside onboarding at ``users/{userId}/profile/contact``. Handles are
usernames, never links. The match list does not include this document.
"""

import re

from flask import abort

CHANNELS = ("instagram", "discord", "snapchat", "facebook")
PREFERRED = ("", "instagram", "discord", "snapchat", "facebook", "orbit")
NOTE_MAX_LENGTH = 160

_HANDLE = {
    "instagram": re.compile(r"^[A-Za-z0-9._]{1,30}$"),
    "discord": re.compile(r"^[A-Za-z0-9._]{2,32}$"),
    "snapchat": re.compile(r"^[A-Za-z][A-Za-z0-9._-]{2,14}$"),
    "facebook": re.compile(r"^[A-Za-z0-9.]{5,50}$"),
}

_FIELDS = (*CHANNELS, "preferred", "reach_note")


def _clean(value: str) -> str:
    return " ".join(value.split())


def blank_contact() -> dict:
    body = {field: "" for field in _FIELDS}
    body["updated_at"] = None
    return body


def _handle(body: dict, name: str) -> str:
    if name not in body or body[name] is None or body[name] == "":
        return ""
    raw = body[name]
    if not isinstance(raw, str):
        abort(400, description=f"{name} must be a string")
    text = raw.strip().lstrip("@").strip()
    if not text:
        return ""
    if any(mark in text for mark in ("/", ":", " ")):
        abort(400, description=f"{name} must be a username, not a link")
    if _HANDLE[name].fullmatch(text) is None or not any(char.isalnum() for char in text):
        abort(400, description=f"{name} username is not valid")
    return text


def _note(body: dict) -> str:
    if "reach_note" not in body or body["reach_note"] is None or body["reach_note"] == "":
        return ""
    raw = body["reach_note"]
    if not isinstance(raw, str):
        abort(400, description="reach_note must be a string")
    text = _clean(raw)
    if len(text) > NOTE_MAX_LENGTH:
        abort(400, description="reach_note is too long")
    return text


def parse_contact(body) -> dict:
    """Validate a contact body. Empty strings clear a field."""
    if not isinstance(body, dict):
        abort(400, description="JSON object is required")

    unexpected = sorted(set(body) - set(_FIELDS))
    if unexpected:
        abort(400, description=f"unexpected field: {unexpected[0]}")

    preferred = body.get("preferred", "")
    if preferred is None:
        preferred = ""
    if not isinstance(preferred, str):
        abort(400, description="preferred must be a string")
    preferred = _clean(preferred)
    if preferred not in PREFERRED:
        abort(400, description="preferred must be one of: instagram, discord, snapchat, facebook, orbit")

    contact = {name: _handle(body, name) for name in CHANNELS}
    contact["preferred"] = preferred
    contact["reach_note"] = _note(body)
    if preferred in CHANNELS and not contact[preferred]:
        abort(400, description=f"{preferred} is required when it is the preferred way to reach you")
    return contact


def contact_response(data: dict, iso) -> dict:
    body = blank_contact()
    for field in _FIELDS:
        value = data.get(field) or ""
        body[field] = value if isinstance(value, str) else ""
    body["updated_at"] = iso(data.get("updated_at"))
    return body


def public_contact(data: dict) -> dict:
    """Fields another person may see after they accept a connection."""
    shown = contact_response(data, lambda _value: None)
    shown.pop("updated_at", None)
    return shown
