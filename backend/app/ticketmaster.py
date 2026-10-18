"""Nearby Ticketmaster events chosen from a saved profile.

The city is the location the person typed. Keywords come from the preference
lists they saved. Spotify, Meta, or a typed chip all land in those lists
before this search runs. This module does not read contact handles.
"""

from __future__ import annotations

import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

DISCOVERY_URL = "https://app.ticketmaster.com/discovery/v2/events.json"
PREFERENCE_TOPICS = ("interests", "hobbies", "festivals", "languages")
MAX_KEYWORDS = 5
MAX_EVENTS = 10


class TicketmasterError(Exception):
    """The Discovery API did not return a usable event list."""


def preference_keywords(profile: dict) -> list[str]:
    """Unique preference chips, capped. Places and the home city are not keywords."""
    city = str(profile.get("location") or "").casefold()
    seen: set[str] = set()
    keywords: list[str] = []
    for topic in PREFERENCE_TOPICS:
        raw = profile.get(topic) or {}
        if not isinstance(raw, dict):
            continue
        for side in ("knows", "wants_to_learn"):
            items = raw.get(side) or []
            if not isinstance(items, list):
                continue
            for item in items:
                if not isinstance(item, str):
                    continue
                text = " ".join(item.split())
                key = text.casefold()
                if not text or key in seen or key == city:
                    continue
                seen.add(key)
                keywords.append(text)
                if len(keywords) >= MAX_KEYWORDS:
                    return keywords
    return keywords


def _event_from_payload(raw: dict, fallback_city: str) -> dict | None:
    if not isinstance(raw, dict):
        return None
    event_id = raw.get("id")
    title = raw.get("name")
    if not isinstance(event_id, str) or not event_id:
        return None
    if not isinstance(title, str) or not title.strip():
        return None

    venues = ((raw.get("_embedded") or {}).get("venues") or []) if isinstance(raw.get("_embedded"), dict) else []
    venue = venues[0] if venues and isinstance(venues[0], dict) else {}
    venue_name = venue.get("name") if isinstance(venue.get("name"), str) else ""
    city_name = fallback_city
    city = venue.get("city") if isinstance(venue.get("city"), dict) else {}
    if isinstance(city.get("name"), str) and city["name"].strip():
        city_name = city["name"].strip()

    dates = raw.get("dates") if isinstance(raw.get("dates"), dict) else {}
    start = dates.get("start") if isinstance(dates.get("start"), dict) else {}
    starts_at = start.get("dateTime") if isinstance(start.get("dateTime"), str) else ""
    url = raw.get("url") if isinstance(raw.get("url"), str) else ""

    return {
        "title": " ".join(title.split()),
        "venue": " ".join(venue_name.split()),
        "city": city_name,
        "starts_at": starts_at or None,
        "external_source": "ticketmaster",
        "external_id": event_id,
        "url": url,
    }


def seeded_seattle_events() -> list[dict]:
    """Dance and live-music stand-ins when Discovery has no key or does not answer.

    Times are fixed in October 2026 so the demo and tests stay stable.
    """
    return [
        {
            "title": "Dance show",
            "venue": "The Crocodile",
            "city": "Seattle",
            "starts_at": "2026-10-24T02:00:00Z",
            "external_source": "seed",
            "external_id": "seed-seattle-dance",
            "url": "",
        },
        {
            "title": "Live music gathering",
            "venue": "The Vera Project",
            "city": "Seattle",
            "starts_at": "2026-10-25T02:00:00Z",
            "external_source": "seed",
            "external_id": "seed-seattle-live",
            "url": "",
        },
    ]


def search_events(api_key: str, city: str, keywords: list[str], opener=urlopen) -> list[dict]:
    """Search Discovery once per keyword and return upcoming events, deduped."""
    found: dict[str, dict] = {}
    terms = keywords or [""]
    for keyword in terms:
        params = {
            "apikey": api_key,
            "city": city,
            "size": "5",
            "sort": "date,asc",
        }
        if keyword:
            params["keyword"] = keyword
        request = Request(f"{DISCOVERY_URL}?{urlencode(params)}")
        try:
            with opener(request, timeout=8) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise TicketmasterError("Ticketmaster did not return events") from exc
        if not isinstance(payload, dict):
            continue
        embedded = payload.get("_embedded") if isinstance(payload.get("_embedded"), dict) else {}
        events = embedded.get("events") or []
        if not isinstance(events, list):
            continue
        for raw in events:
            event = _event_from_payload(raw, city)
            if event is None:
                continue
            found.setdefault(event["external_id"], event)
            if len(found) >= MAX_EVENTS:
                break
        if len(found) >= MAX_EVENTS:
            break

    def sort_key(event: dict) -> tuple:
        return (event["starts_at"] is None, event["starts_at"] or "")

    return sorted(found.values(), key=sort_key)[:MAX_EVENTS]
