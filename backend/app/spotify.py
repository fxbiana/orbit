"""Spotify taste import and analysis.

Fetches top artists via the user's Spotify OAuth token (from Clerk),
normalizes genres, and returns suggested ``interests`` chips. Persistence
lives at ``users/{userId}/profile/spotify`` — never store OAuth tokens there.
"""

from __future__ import annotations

import json
import logging
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import abort, current_app

from app.onboarding import TOPIC_ITEM_MAX_LENGTH, TOPIC_LIST_MAX_ITEMS

log = logging.getLogger(__name__)

SPOTIFY_PROVIDER = "oauth_spotify"
SPOTIFY_TOP_ARTISTS_URL = "https://api.spotify.com/v1/me/top/artists"
SPOTIFY_SOURCE = "clerk_spotify"
GENRE_MAX_ITEMS = TOPIC_LIST_MAX_ITEMS
GENRE_MAX_LENGTH = TOPIC_ITEM_MAX_LENGTH

_WHITESPACE = re.compile(r"\s+")


def normalize_genre(raw: str) -> str | None:
    """Collapse whitespace and enforce max length. Empty → None."""
    if not isinstance(raw, str):
        return None
    cleaned = _WHITESPACE.sub(" ", raw).strip()
    if not cleaned:
        return None
    if len(cleaned) > GENRE_MAX_LENGTH:
        cleaned = cleaned[:GENRE_MAX_LENGTH].rstrip()
    return cleaned or None


def analyze_top_artists(artists: list) -> dict:
    """Derive a genre snapshot and suggested interest chips from Spotify artists.

    Listening taste maps to ``interests.knows`` suggestions only. Does not
    auto-merge into onboarding — the caller confirms chips before PUT.
    """
    counts: dict[str, int] = {}
    display: dict[str, str] = {}
    for artist in artists:
        if not isinstance(artist, dict):
            continue
        genres = artist.get("genres") or []
        if not isinstance(genres, list):
            continue
        for genre in genres:
            normalized = normalize_genre(genre)
            if normalized is None:
                continue
            key = normalized.casefold()
            counts[key] = counts.get(key, 0) + 1
            display.setdefault(key, normalized)

    ranked = sorted(counts.keys(), key=lambda k: (-counts[k], display[k].casefold()))
    genres = [display[k] for k in ranked[:GENRE_MAX_ITEMS]]
    return {
        "genres": genres,
        "suggested_interests": {
            "knows": list(genres),
            "wants_to_learn": [],
        },
        "artist_count": sum(1 for a in artists if isinstance(a, dict)),
    }


def fetch_spotify_access_token(user_id: str) -> str:
    """Load the caller's Spotify OAuth access token from Clerk (refreshes if needed)."""
    secret = (current_app.config.get("CLERK_SECRET_KEY") or "").strip()
    if not secret:
        abort(503, description="CLERK_SECRET_KEY is not configured")

    try:
        from clerk_backend_api import Clerk
    except ImportError:
        log.exception("clerk_backend_api missing")
        abort(503, description="Clerk SDK is not available")

    try:
        with Clerk(bearer_auth=secret) as clerk:
            tokens = clerk.users.get_o_auth_access_token(
                user_id=user_id,
                provider=SPOTIFY_PROVIDER,
            )
    except Exception:
        log.exception("Clerk Spotify token fetch failed for user %s", user_id)
        abort(502, description="Could not load Spotify token from Clerk")

    if not tokens:
        abort(404, description="Spotify account not linked")

    token = getattr(tokens[0], "token", None)
    if not isinstance(token, str) or not token.strip():
        abort(404, description="Spotify account not linked")
    return token.strip()


def fetch_top_artists(access_token: str, *, limit: int = 20) -> list[dict]:
    """GET Spotify top artists. Does not use audio-features / recommendations APIs."""
    query = urlencode({"limit": max(1, min(limit, 50)), "time_range": "medium_term"})
    request = Request(
        f"{SPOTIFY_TOP_ARTISTS_URL}?{query}",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        with urlopen(request, timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as err:
        body = err.read().decode("utf-8", errors="replace") if err.fp else ""
        log.warning("Spotify top artists failed: %s %s", err.code, body[:200])
        if err.code in (401, 403):
            abort(401, description="Spotify token rejected")
        abort(502, description="Spotify request failed")
    except (URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError):
        log.exception("Spotify top artists request error")
        abort(502, description="Spotify request failed")

    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        abort(502, description="Spotify response was invalid")
    return [item for item in items if isinstance(item, dict)]


def spotify_response(user_id: str, data: dict, iso) -> dict:
    """Shape a Firestore spotify snapshot for JSON clients."""
    genres = data.get("genres") or []
    if not isinstance(genres, list):
        genres = []
    clean_genres = []
    seen: set[str] = set()
    for item in genres:
        normalized = normalize_genre(item) if isinstance(item, str) else None
        if normalized is None:
            continue
        key = normalized.casefold()
        if key in seen:
            continue
        seen.add(key)
        clean_genres.append(normalized)
        if len(clean_genres) >= GENRE_MAX_ITEMS:
            break

    suggested = data.get("suggested_interests") or {
        "knows": list(clean_genres),
        "wants_to_learn": [],
    }
    if not isinstance(suggested, dict):
        suggested = {"knows": list(clean_genres), "wants_to_learn": []}
    knows = suggested.get("knows") if isinstance(suggested.get("knows"), list) else list(clean_genres)
    wants = (
        suggested.get("wants_to_learn")
        if isinstance(suggested.get("wants_to_learn"), list)
        else []
    )

    return {
        "user_id": user_id,
        "genres": clean_genres,
        "suggested_interests": {
            "knows": [g for g in knows if isinstance(g, str)][:GENRE_MAX_ITEMS],
            "wants_to_learn": [g for g in wants if isinstance(g, str)][:GENRE_MAX_ITEMS],
        },
        "source": data.get("source") or SPOTIFY_SOURCE,
        "artist_count": int(data["artist_count"]) if isinstance(data.get("artist_count"), int) else 0,
        "imported_at": iso(data.get("imported_at")),
    }
