"""Open plans schema and request validation.

Plans live at ``plans/{planId}``. Membership lives at
``plans/{planId}/members/{userId}``.
"""

from datetime import datetime

from flask import abort

TITLE_MAX_LENGTH = 120
LOCATION_TEXT_MAX_LENGTH = 80
ACTIVITY_TYPES = ("coffee", "study", "workshop", "other")
CAPACITY_MIN = 2
CAPACITY_MAX = 40
CAPACITY_DEFAULT = 6
PLAN_STATUSES = ("open", "closed")
MEMBER_ROLES = ("host", "member")

ALLOWED_CREATE_FIELDS = {
    "title",
    "activity_type",
    "location_text",
    "starts_at",
    "capacity",
}


def _clean(value: str) -> str:
    return " ".join(value.split())


def _required_string(body: dict, name: str, max_length: int) -> str:
    if name not in body or body[name] is None:
        abort(400, description=f"{name} is required")
    raw = body[name]
    if not isinstance(raw, str):
        abort(400, description=f"{name} must be a string")
    text = _clean(raw)
    if not text:
        abort(400, description=f"{name} is required")
    if len(text) > max_length:
        abort(400, description=f"{name} is too long")
    return text


def _required_choice(body: dict, name: str, choices: tuple[str, ...]) -> str:
    if name not in body or body[name] is None:
        abort(400, description=f"{name} is required")
    raw = body[name]
    if not isinstance(raw, str):
        abort(400, description=f"{name} must be a string")
    text = _clean(raw)
    if not text:
        abort(400, description=f"{name} is required")
    if text not in choices:
        abort(400, description=f"{name} must be one of: {', '.join(choices)}")
    return text


def _optional_starts_at(body: dict) -> str | None:
    if "starts_at" not in body or body["starts_at"] is None:
        return None
    raw = body["starts_at"]
    if not isinstance(raw, str):
        abort(400, description="starts_at must be a string or null")
    text = raw.strip()
    if not text:
        return None
    try:
        datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        abort(400, description="starts_at must be an ISO datetime string")
    return text


def _capacity(body: dict) -> int:
    if "capacity" not in body or body["capacity"] is None:
        return CAPACITY_DEFAULT
    raw = body["capacity"]
    if isinstance(raw, bool) or not isinstance(raw, int):
        abort(400, description="capacity must be an integer")
    if raw < CAPACITY_MIN or raw > CAPACITY_MAX:
        abort(400, description="capacity is out of range")
    return raw


def parse_plan_create(body) -> dict:
    """Validate a create-plan body and return fields to store."""
    if not isinstance(body, dict):
        abort(400, description="JSON object is required")

    unexpected = sorted(set(body) - ALLOWED_CREATE_FIELDS)
    if unexpected:
        abort(400, description=f"unexpected field: {unexpected[0]}")

    return {
        "title": _required_string(body, "title", TITLE_MAX_LENGTH),
        "activity_type": _required_choice(body, "activity_type", ACTIVITY_TYPES),
        "location_text": _required_string(body, "location_text", LOCATION_TEXT_MAX_LENGTH),
        "starts_at": _optional_starts_at(body),
        "capacity": _capacity(body),
    }


def plan_response(
    plan_id: str,
    data: dict,
    iso,
    *,
    member_count: int,
    viewer_joined: bool,
    members: list[dict] | None = None,
) -> dict:
    """Shape a stored plan the way the API returns it."""
    body = {
        "id": plan_id,
        "host_id": data.get("host_id") or "",
        "title": data.get("title") or "",
        "activity_type": data.get("activity_type") or "",
        "location_text": data.get("location_text") or "",
        "starts_at": data.get("starts_at"),
        "capacity": data.get("capacity") if data.get("capacity") is not None else CAPACITY_DEFAULT,
        "status": data.get("status") or "open",
        "created_at": iso(data.get("created_at")),
        "updated_at": iso(data.get("updated_at")),
        "member_count": member_count,
        "viewer_joined": viewer_joined,
    }
    if members is not None:
        body["members"] = members
    return body


def member_response(user_id: str, data: dict, iso) -> dict:
    return {
        "user_id": user_id,
        "role": data.get("role") or "member",
        "joined_at": iso(data.get("joined_at")),
    }
