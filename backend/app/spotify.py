"""Optional Spotify personalization. Suggestions are not written onto onboarding."""

import json
import urllib.error
import urllib.request

_MAX_GENRES = 20
_MAX_GENRE_LEN = 80
_SPOTIFY_PROVIDERS = frozenset({"oauth_spotify", "spotify"})
_TIME_RANGES = ("medium_term", "short_term", "long_term")


def _top_artists_url(time_range: str) -> str:
    return f"https://api.spotify.com/v1/me/top/artists?limit=20&time_range={time_range}"


class SpotifyImportError(Exception):
    """Spotify refused or failed the top-artists request."""


def normalize_genres(raw) -> list[str]:
    """Title-case, collapse whitespace, and dedupe genre labels."""
    if not isinstance(raw, list):
        return []

    seen: set[str] = set()
    genres: list[str] = []
    for item in raw:
        if not isinstance(item, str):
            continue
        collapsed = " ".join(item.split())
        if not collapsed:
            continue
        titled = collapsed.title()[:_MAX_GENRE_LEN].strip()
        if not titled:
            continue
        key = titled.casefold()
        if key in seen:
            continue
        seen.add(key)
        genres.append(titled)
        if len(genres) >= _MAX_GENRES:
            break
    return genres


def suggestions_from_genres(genres: list[str]) -> dict:
    """Interest suggestions only. The caller confirms before any profile write."""
    return {"knows": list(genres), "wants_to_learn": []}


def fetch_spotify_taste(access_token: str, opener=urllib.request.urlopen) -> dict:
    """GET top artists once and return preference labels plus portrait URLs.

    Tries the last six months first, then the last month, then several years.
    Reads ``artists`` when present, otherwise Spotify's ``items`` array.
    Uses genre labels when Spotify sends them. When every genre list is empty,
    uses the artist names so a music taste still becomes a suggestion.
    Portrait URLs come from that same payload. Does not call audio-features,
    recommendations, or related-artists.
    """
    for time_range in _TIME_RANGES:
        payload = _read_top_artists(access_token, time_range, opener)
        rows = _artist_rows(payload)
        labels = _labels_from_rows(rows)
        if labels:
            return {"labels": labels, "artists": portrait_artists(rows)}
    return {"labels": [], "artists": []}


def fetch_top_artist_genres(access_token: str, opener=urllib.request.urlopen) -> list[str]:
    """Preference labels from the caller's top artists."""
    return fetch_spotify_taste(access_token, opener)["labels"]


def _read_top_artists(access_token: str, time_range: str, opener) -> dict:
    request = urllib.request.Request(
        _top_artists_url(time_range),
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        with opener(request, timeout=15) as response:
            raw = response.read()
    except urllib.error.HTTPError as exc:
        if exc.code == 403:
            raise SpotifyImportError(
                "Spotify is connected, but user-top-read is missing. Add that scope on the Clerk Spotify connection."
            ) from exc
        raise SpotifyImportError(
            f"Spotify top artists request failed ({exc.code})"
        ) from exc
    except SpotifyImportError:
        raise
    except Exception as exc:
        raise SpotifyImportError("Spotify top artists request failed") from exc

    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SpotifyImportError("Spotify top artists response was not JSON") from exc
    if not isinstance(payload, dict):
        raise SpotifyImportError("Spotify top artists response was not JSON")
    return payload


def _artist_rows(payload: dict) -> list[dict]:
    rows: list[dict] = []
    for artist in _artist_list(payload):
        if not isinstance(artist, dict):
            continue
        name = artist.get("name")
        name = name.strip() if isinstance(name, str) else ""
        values = artist.get("genres") or []
        genres = (
            [value.strip() for value in values if isinstance(value, str) and value.strip()]
            if isinstance(values, list)
            else []
        )
        rows.append({"name": name, "genres": genres, "image_url": _portrait_url(artist)})
    return rows


def _labels_from_rows(rows: list[dict]) -> list[str]:
    genres: list[str] = []
    names: list[str] = []
    for row in rows:
        if row["name"]:
            names.append(row["name"])
        genres.extend(row["genres"])
    return genres or names


def portrait_artists(rows: list[dict]) -> list[dict]:
    """Named artists with an https image, deduped. Display only — not a topic."""
    seen: set[str] = set()
    portraits: list[dict] = []
    for row in rows:
        name = " ".join(row["name"].split())
        if not name:
            continue
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        image = row.get("image_url")
        image_url = image if isinstance(image, str) and image.startswith("https://") else None
        portraits.append({"name": name, "image_url": image_url})
        if len(portraits) >= _MAX_GENRES:
            break
    return portraits


def _portrait_url(artist: dict) -> str | None:
    """Pick a mid-size https image. Spotify lists the largest first."""
    images = artist.get("images")
    if not isinstance(images, list):
        return None
    best_url = None
    best_score = None
    best_width = None
    for image in images:
        if not isinstance(image, dict):
            continue
        url = image.get("url")
        if not isinstance(url, str) or not url.startswith("https://"):
            continue
        width = image.get("width") if isinstance(image.get("width"), int) else 640
        score = abs(width - 320)
        if best_score is None or score < best_score or (score == best_score and width > (best_width or 0)):
            best_url = url
            best_score = score
            best_width = width
    return best_url


def _artist_list(payload) -> list:
    if not isinstance(payload, dict):
        return []
    named = payload.get("artists")
    if isinstance(named, list):
        return named
    items = payload.get("items")
    if isinstance(items, list):
        return items
    return []


def _provider_name(account) -> str:
    if isinstance(account, dict):
        raw = account.get("provider") or ""
    else:
        raw = getattr(account, "provider", None) or ""
    return str(raw).strip().lower()


def _string_token(value) -> str | None:
    if isinstance(value, str):
        token = value.strip()
        return token or None
    return None


def _token_from(obj) -> str | None:
    """Pull an OAuth access token without reading profile fields."""
    if obj is None:
        return None
    if isinstance(obj, str):
        return _string_token(obj)
    if isinstance(obj, dict):
        for key in ("token", "access_token", "oauth_access_token"):
            found = _string_token(obj.get(key))
            if found:
                return found
        return None
    for key in ("token", "access_token", "oauth_access_token"):
        found = _string_token(getattr(obj, key, None))
        if found:
            return found
    return None


def spotify_access_token(user_id: str, secret_key: str) -> str | None:
    """Return the Clerk user's Spotify OAuth access token, or None.

    Lists external accounts and keeps the token only when Spotify is connected.
    Isolated so tests can monkeypatch this without calling Clerk.
    """
    if not user_id or not secret_key:
        return None

    from clerk_backend_api import Clerk

    with Clerk(bearer_auth=secret_key) as clerk:
        user = clerk.users.get(user_id=user_id)
        if isinstance(user, dict):
            accounts = user.get("external_accounts") or []
        else:
            accounts = getattr(user, "external_accounts", None) or []

        spotify = next(
            (account for account in accounts if _provider_name(account) in _SPOTIFY_PROVIDERS),
            None,
        )
        if spotify is None:
            return None

        direct = _token_from(spotify)
        if direct:
            return direct

        getter = getattr(clerk.users, "get_o_auth_access_token", None)
        if getter is None:
            return None
        tokens = getter(user_id=user_id, provider="oauth_spotify") or []
        for item in tokens:
            token = _token_from(item)
            if token:
                return token
    return None
