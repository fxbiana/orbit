"""Onboarding profile schema.

One document per user, stored at ``users/{userId}/profile/onboarding``.
Compatibility matching compares one user's ``knows`` with another user's
``wants_to_learn`` on the same topic.
"""

from flask import abort

TOPIC_KEYS = ("languages", "locations", "hobbies", "interests", "festivals")
TOPIC_SIDES = ("knows", "wants_to_learn")

USERNAME_MAX_LENGTH = 40
FIRST_NAME_MAX_LENGTH = 80
LOCATION_MAX_LENGTH = 80
AGE_MIN = 13
AGE_MAX = 120
GATHERING_SIZES = ("2-5", "6-15", "16-40", "40+")
# Ticketmaster city search uses this spelling. Keep web/src/onboarding.ts CITIES in sync.
CITIES = (
    "Seattle",
    "Portland",
    "San Francisco",
    "Los Angeles",
    "Austin",
    "Denver",
    "Chicago",
    "New York",
    "Boston",
    "Toronto",
    "Vancouver",
    "London",
    "Delhi",
    "Chandigarh",
)
TOPIC_ITEM_MAX_LENGTH = 80
TOPIC_LIST_MAX_ITEMS = 20

ONBOARDING_SCHEMA = {
    "username": {
        "type": "string",
        "required": True,
        "max_length": USERNAME_MAX_LENGTH,
    },
    "first_name": {
        "type": "string",
        "required": True,
        "max_length": FIRST_NAME_MAX_LENGTH,
    },
    "location": {
        "type": "string",
        "required": True,
        "max_length": LOCATION_MAX_LENGTH,
    },
    "age": {
        "type": "integer",
        "required": True,
        "minimum": AGE_MIN,
        "maximum": AGE_MAX,
    },
    "gathering_size": {
        "type": "string",
        "required": True,
        "enum": GATHERING_SIZES,
    },
    "topics": {
        key: {
            "type": "object",
            "sides": {
                side: {
                    "type": "list",
                    "items": "string",
                    "max_items": TOPIC_LIST_MAX_ITEMS,
                    "max_length": TOPIC_ITEM_MAX_LENGTH,
                }
                for side in TOPIC_SIDES
            },
        }
        for key in TOPIC_KEYS
    },
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


def _required_int(body: dict, name: str, spec: dict) -> int:
    if name not in body or body[name] is None:
        abort(400, description=f"{name} is required")
    raw = body[name]
    if isinstance(raw, bool) or not isinstance(raw, int):
        abort(400, description=f"{name} must be an integer")
    if raw < spec["minimum"] or raw > spec["maximum"]:
        abort(400, description=f"{name} is out of range")
    return raw


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


def _string_list(value, label: str, spec: dict) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        abort(400, description=f"{label} must be a list")
    if len(value) > spec["max_items"]:
        abort(400, description=f"{label} has too many items")

    seen: set[str] = set()
    cleaned: list[str] = []
    for item in value:
        if not isinstance(item, str):
            abort(400, description=f"{label} items must be strings")
        text = _clean(item)
        if not text:
            abort(400, description=f"{label} has an empty item")
        if len(text) > spec["max_length"]:
            abort(400, description=f"{label} item is too long")
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(text)
    return cleaned


def _topic(value, name: str, spec: dict) -> dict:
    if value is None:
        value = {}
    if not isinstance(value, dict):
        abort(400, description=f"{name} must be an object")

    unexpected = sorted(set(value) - set(spec["sides"]))
    if unexpected:
        abort(400, description=f"unexpected field: {name}.{unexpected[0]}")

    return {
        side: _string_list(value.get(side), f"{name}.{side}", side_spec)
        for side, side_spec in spec["sides"].items()
    }


def _city(body: dict) -> str:
    text = _required_string(body, "location", ONBOARDING_SCHEMA["location"]["max_length"])
    for city in CITIES:
        if city.casefold() == text.casefold():
            return city
    abort(400, description="location must be a listed city")


def parse_onboarding(body) -> dict:
    """Validate a request body and return the document fields to store."""
    if not isinstance(body, dict):
        abort(400, description="JSON object is required")

    allowed = {"username", "first_name", "location", "age", "gathering_size", *TOPIC_KEYS}
    unexpected = sorted(set(body) - allowed)
    if unexpected:
        abort(400, description=f"unexpected field: {unexpected[0]}")

    profile = {
        "username": _required_string(
            body, "username", ONBOARDING_SCHEMA["username"]["max_length"]
        ),
        "first_name": _required_string(
            body, "first_name", ONBOARDING_SCHEMA["first_name"]["max_length"]
        ),
        "location": _city(body),
        "age": _required_int(body, "age", ONBOARDING_SCHEMA["age"]),
        "gathering_size": _required_choice(
            body, "gathering_size", ONBOARDING_SCHEMA["gathering_size"]["enum"]
        ),
    }
    for key, spec in ONBOARDING_SCHEMA["topics"].items():
        profile[key] = _topic(body.get(key), key, spec)
    return profile


def onboarding_response(user_id: str, data: dict, iso) -> dict:
    """Shape a stored document the way the API returns it."""
    body = {
        "user_id": user_id,
        "username": data.get("username") or "",
        "first_name": data.get("first_name") or "",
        "location": data.get("location") or "",
        "age": data.get("age"),
        "gathering_size": data.get("gathering_size") or "",
    }
    for key in TOPIC_KEYS:
        raw = data.get(key) or {}
        body[key] = {
            side: list(raw.get(side) or [])
            for side in TOPIC_SIDES
        }
    body["created_at"] = iso(data.get("created_at"))
    body["updated_at"] = iso(data.get("updated_at"))
    return body
