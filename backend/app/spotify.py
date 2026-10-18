"""Optional Spotify personalization. Suggestions are not written onto onboarding."""

import json
import urllib.error
import urllib.request

_MAX_GENRES = 20
_MAX_GENRE_LEN = 80
_MAX_TEXT_LEN = 200
_MAX_RECENT_TRACKS = 50
_MAX_TOP_TRACKS = 20
_MAX_TOP_ARTISTS = 20
_MAX_TRACK_ARTISTS = 5
_MAX_ARTIST_GENRES = 10
_SPOTIFY_PROVIDERS = frozenset({"oauth_spotify", "spotify"})
TOP_ARTISTS_URL = (
    "https://api.spotify.com/v1/me/top/artists?limit=20&time_range=medium_term"
)
_RECENTLY_PLAYED_URL = "https://api.spotify.com/v1/me/player/recently-played?limit=50"
_TOP_TRACKS_SHORT_URL = (
    "https://api.spotify.com/v1/me/top/tracks?limit=20&time_range=short_term"
)
_TOP_TRACKS_MEDIUM_URL = (
    "https://api.spotify.com/v1/me/top/tracks?limit=20&time_range=medium_term"
)
_TOP_ARTISTS_SHORT_URL = (
    "https://api.spotify.com/v1/me/top/artists?limit=20&time_range=short_term"
)


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


def fetch_top_artist_genres(access_token: str, opener=urllib.request.urlopen) -> list[str]:
    """GET the caller's medium-term top artists and collect genre strings.

    Reads ``artists`` when present, otherwise Spotify's ``items`` array.
    Does not call audio-features, recommendations, or related-artists.
    """
    request = urllib.request.Request(
        TOP_ARTISTS_URL,
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

    artists = _artist_list(payload)
    genres: list[str] = []
    for artist in artists:
        if not isinstance(artist, dict):
            continue
        values = artist.get("genres") or []
        if isinstance(values, list):
            genres.extend(value for value in values if isinstance(value, str))
    return genres


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


def _spotify_get_json(url: str, access_token: str, opener, label: str):
    """GET one Spotify JSON endpoint. ``label`` names the call in errors."""
    request = urllib.request.Request(
        url,
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
        raise SpotifyImportError(f"Spotify {label} request failed ({exc.code})") from exc
    except SpotifyImportError:
        raise
    except Exception as exc:
        raise SpotifyImportError(f"Spotify {label} request failed") from exc

    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError, AttributeError) as exc:
        raise SpotifyImportError(f"Spotify {label} response was not JSON") from exc


def _clip_text(value) -> str:
    """Collapse whitespace and cap a Spotify string. Non-strings become empty."""
    if not isinstance(value, str):
        return ""
    return " ".join(value.split())[:_MAX_TEXT_LEN].strip()


def _named(value) -> str | None:
    clipped = _clip_text(value)
    return clipped or None


def _track_artist_names(track: dict) -> list[str]:
    artists = track.get("artists")
    if not isinstance(artists, list):
        return []
    names: list[str] = []
    for artist in artists:
        if not isinstance(artist, dict):
            continue
        name = _named(artist.get("name"))
        if not name:
            continue
        names.append(name)
        if len(names) >= _MAX_TRACK_ARTISTS:
            break
    return names


def _album_name(track: dict) -> str:
    album = track.get("album")
    if not isinstance(album, dict):
        return ""
    return _clip_text(album.get("name"))


def _parse_track(track) -> dict | None:
    if not isinstance(track, dict):
        return None
    name = _named(track.get("name"))
    if not name:
        return None
    return {
        "name": name,
        "artists": _track_artist_names(track),
        "album": _album_name(track),
    }


def _recent_tracks(payload) -> list[dict]:
    if not isinstance(payload, dict):
        return []
    items = payload.get("items")
    if not isinstance(items, list):
        return []
    tracks: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        parsed = _parse_track(item.get("track"))
        if parsed is None:
            continue
        parsed["played_at"] = _clip_text(item.get("played_at"))
        tracks.append(parsed)
        if len(tracks) >= _MAX_RECENT_TRACKS:
            break
    return tracks


def _top_track_list(payload) -> list:
    if not isinstance(payload, dict):
        return []
    items = payload.get("items")
    if isinstance(items, list):
        return items
    tracks = payload.get("tracks")
    if isinstance(tracks, list):
        return tracks
    return []


def _top_tracks(payload) -> list[dict]:
    tracks: list[dict] = []
    for item in _top_track_list(payload):
        parsed = _parse_track(item)
        if parsed is None:
            continue
        tracks.append(parsed)
        if len(tracks) >= _MAX_TOP_TRACKS:
            break
    return tracks


def _genre_names(artist: dict) -> list[str]:
    genres = artist.get("genres")
    if not isinstance(genres, list):
        return []
    names: list[str] = []
    for genre in genres:
        if not isinstance(genre, str):
            continue
        clipped = " ".join(genre.split())[:_MAX_GENRE_LEN].strip()
        if not clipped:
            continue
        names.append(clipped)
        if len(names) >= _MAX_ARTIST_GENRES:
            break
    return names


def _top_artists(payload) -> list[dict]:
    artists: list[dict] = []
    for artist in _artist_list(payload):
        if not isinstance(artist, dict):
            continue
        name = _named(artist.get("name"))
        if not name:
            continue
        artists.append({"name": name, "genres": _genre_names(artist)})
        if len(artists) >= _MAX_TOP_ARTISTS:
            break
    return artists


def fetch_listening(access_token: str, opener=urllib.request.urlopen) -> dict:
    """Recent tracks plus short-term top tracks and artists.

    Short-term top lists that contain no named entries fall back to medium_term.
    Artists that exist with empty genres do not trigger that fallback.
    """
    recent_payload = _spotify_get_json(
        _RECENTLY_PLAYED_URL,
        access_token,
        opener,
        "recently played",
    )
    short_tracks = _spotify_get_json(
        _TOP_TRACKS_SHORT_URL,
        access_token,
        opener,
        "short-term top tracks",
    )
    top_tracks = _top_tracks(short_tracks)
    if not top_tracks:
        medium_tracks = _spotify_get_json(
            _TOP_TRACKS_MEDIUM_URL,
            access_token,
            opener,
            "medium-term top tracks",
        )
        top_tracks = _top_tracks(medium_tracks)

    short_artists = _spotify_get_json(
        _TOP_ARTISTS_SHORT_URL,
        access_token,
        opener,
        "short-term top artists",
    )
    top_artists = _top_artists(short_artists)
    if not top_artists:
        medium_artists = _spotify_get_json(
            TOP_ARTISTS_URL,
            access_token,
            opener,
            "medium-term top artists",
        )
        top_artists = _top_artists(medium_artists)

    return {
        "recent_tracks": _recent_tracks(recent_payload),
        "top_tracks": top_tracks,
        "top_artists": top_artists,
    }


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
