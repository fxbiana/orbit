"""Optional Spotify personalization. Suggestions are not written onto onboarding."""

import json
import urllib.error
import urllib.request

from app.onboarding import TOPIC_ITEM_MAX_LENGTH, TOPIC_KEYS, TOPIC_SIDES

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
_MAX_SUGGESTIONS = 8
_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions"
_AI_TIMEOUT_SECONDS = 20
_FESTIVAL_LABELS = (
    "Electronic",
    "Hip hop",
    "Indie",
    "Pop",
    "Rock",
    "Jazz",
    "Folk",
    "Classical",
    "Latin",
    "Afrobeats",
    "K-pop",
    "Country",
    "Metal",
    "R&B",
)
_FESTIVAL_BY_KEY = {label.casefold(): label for label in _FESTIVAL_LABELS}
# Listed specific-to-general. Checked longest-first so "k-pop" beats "pop".
_FESTIVAL_KEYWORD_LABELS = (
    ("k-pop", "K-pop"),
    ("kpop", "K-pop"),
    ("hip hop", "Hip hop"),
    ("hip-hop", "Hip hop"),
    ("rap", "Hip hop"),
    ("afrobeats", "Afrobeats"),
    ("afrobeat", "Afrobeats"),
    ("r&b", "R&B"),
    ("rnb", "R&B"),
    ("techno", "Electronic"),
    ("house", "Electronic"),
    ("edm", "Electronic"),
    ("electronic", "Electronic"),
    ("electronica", "Electronic"),
    ("trance", "Electronic"),
    ("dubstep", "Electronic"),
    ("indie", "Indie"),
    ("metal", "Metal"),
    ("punk", "Rock"),
    ("rock", "Rock"),
    ("jazz", "Jazz"),
    ("folk", "Folk"),
    ("classical", "Classical"),
    ("latin", "Latin"),
    ("reggaeton", "Latin"),
    ("salsa", "Latin"),
    ("country", "Country"),
    ("pop", "Pop"),
)
_FESTIVAL_KEYWORDS = tuple(
    sorted(_FESTIVAL_KEYWORD_LABELS, key=lambda pair: len(pair[0]), reverse=True)
)
_SUGGESTION_SYSTEM_PROMPT = f"""Return one JSON object whose only keys are languages, locations, hobbies, interests, and festivals.
Each value is {{"knows": [], "wants_to_learn": []}}.
interests.knows = music styles the listening already shows.
interests.wants_to_learn = a few adjacent styles, or empty.
festivals.knows = only labels from this exact vocabulary: {", ".join(_FESTIVAL_LABELS)}. festivals.wants_to_learn is usually empty.
locations.wants_to_learn = up to 5 cities the scene clearly points at. locations.knows must be [].
hobbies and languages stay empty unless an activity or language is explicit in names (a choir can suggest Singing; a Spanish song title is not enough to claim the person speaks Spanish).
Do not return username, first_name, home city, age, or gathering size.
At most {_MAX_SUGGESTIONS} strings per list. Each string at most {TOPIC_ITEM_MAX_LENGTH} characters."""


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


def empty_suggestions() -> dict:
    """Five onboarding topics, each with empty knows and wants_to_learn."""
    return {topic: {side: [] for side in TOPIC_SIDES} for topic in TOPIC_KEYS}


def validate_suggestions(raw) -> dict:
    """Coerce a suggestion payload into the five-topic shape.

    Identity fields are ignored. Festival items must match the vocabulary.
    """
    suggestions = empty_suggestions()
    if not isinstance(raw, dict):
        return suggestions

    for topic in TOPIC_KEYS:
        block = raw.get(topic)
        if not isinstance(block, dict):
            continue
        for side in TOPIC_SIDES:
            if topic == "locations" and side == "knows":
                continue
            suggestions[topic][side] = _clean_suggestion_list(block.get(side), topic)
    suggestions["locations"]["knows"] = []
    return suggestions


def genres_from_listening(listening: dict) -> list[str]:
    """Normalized genre labels from string genres on top artists."""
    return normalize_genres(_listening_genre_strings(listening))


def fallback_suggestions(listening: dict) -> dict:
    """Genre chips and festival styles when a model is not used.

    When Spotify sends artists with no genres, interest chips use those names
    so a taste still becomes a suggestion.
    """
    suggestions = empty_suggestions()
    genres = genres_from_listening(listening)
    if genres:
        suggestions["interests"]["knows"] = genres[:_MAX_SUGGESTIONS]
        suggestions["festivals"]["knows"] = _festivals_for_genres(genres)
    else:
        suggestions["interests"]["knows"] = _names_from_listening(listening)[:_MAX_SUGGESTIONS]
    return suggestions


def _names_from_listening(listening) -> list[str]:
    if not isinstance(listening, dict):
        return []
    artists = listening.get("top_artists")
    if not isinstance(artists, list):
        return []
    names: list[str] = []
    for artist in artists:
        if not isinstance(artist, dict):
            continue
        name = artist.get("name")
        if isinstance(name, str):
            names.append(name)
    return _clean_suggestion_list(names, "interests")


def suggest_from_listening(
    listening,
    api_key: str,
    model: str,
    opener=urllib.request.urlopen,
) -> tuple[dict, str | None]:
    """Suggest topic chips from listening. Does not write onboarding.

    Returns ``(suggestions, model_used)``. ``model_used`` is None when the
    model is skipped or the call fails.
    """
    key = api_key.strip()
    chosen = model.strip()
    if not key or not chosen:
        return fallback_suggestions(listening), None

    try:
        parsed = _parse_model_suggestions(listening, key, chosen, opener)
        validated = validate_suggestions(parsed)
    except Exception:
        return fallback_suggestions(listening), None
    return validated, chosen


def _clean_suggestion_list(raw, topic: str) -> list[str]:
    if not isinstance(raw, list):
        return []

    seen: set[str] = set()
    cleaned: list[str] = []
    for item in raw:
        text = _clean_suggestion_item(item, topic)
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(text)
        if len(cleaned) >= _MAX_SUGGESTIONS:
            break
    return cleaned


def _clean_suggestion_item(item, topic: str) -> str:
    if not isinstance(item, str):
        return ""
    collapsed = " ".join(item.split())
    if not collapsed:
        return ""
    if topic == "festivals":
        return _FESTIVAL_BY_KEY.get(collapsed.casefold(), "")
    return collapsed.title()[:TOPIC_ITEM_MAX_LENGTH].strip()


def _listening_genre_strings(listening) -> list[str]:
    if not isinstance(listening, dict):
        return []
    artists = listening.get("top_artists")
    if not isinstance(artists, list):
        return []

    genres: list[str] = []
    for artist in artists:
        if not isinstance(artist, dict):
            continue
        values = artist.get("genres")
        if not isinstance(values, list):
            continue
        genres.extend(value for value in values if isinstance(value, str))
    return genres


def _festivals_for_genres(genres: list[str]) -> list[str]:
    seen: set[str] = set()
    labels: list[str] = []
    for genre in genres:
        label = _festival_for_genre(genre)
        if not label or label.casefold() in seen:
            continue
        seen.add(label.casefold())
        labels.append(label)
        if len(labels) >= _MAX_SUGGESTIONS:
            break
    return labels


def _style_tokens(text: str) -> list[str]:
    """Split a genre into words. Hyphens are spaces so k-pop stays two tokens."""
    folded = text.casefold().replace("-", " ")
    tokens: list[str] = []
    current: list[str] = []
    for char in folded:
        if char.isalnum() or char == "&":
            current.append(char)
        elif current:
            tokens.append("".join(current))
            current = []
    if current:
        tokens.append("".join(current))
    return tokens


def _festival_for_genre(genre: str) -> str:
    tokens = _style_tokens(genre)
    if not tokens:
        return ""
    for keyword, label in _FESTIVAL_KEYWORDS:
        needle = _style_tokens(keyword)
        width = len(needle)
        if width == 0:
            continue
        for start in range(len(tokens) - width + 1):
            if tokens[start : start + width] == needle:
                return label
    return ""


def _compact_listening(listening) -> dict:
    source = listening if isinstance(listening, dict) else {}
    return {
        "recent_tracks": source.get("recent_tracks", []),
        "top_tracks": source.get("top_tracks", []),
        "top_artists": source.get("top_artists", []),
    }


def _parse_model_suggestions(listening, api_key: str, model: str, opener):
    body = {
        "model": model,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": _SUGGESTION_SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(_compact_listening(listening))},
        ],
    }
    request = urllib.request.Request(
        _CHAT_COMPLETIONS_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    with opener(request, timeout=_AI_TIMEOUT_SECONDS) as response:
        raw = response.read()
    payload = json.loads(raw.decode("utf-8"))
    content = payload["choices"][0]["message"]["content"]
    return json.loads(content)


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


def _top_artists(payload) -> list[dict]:
    artists: list[dict] = []
    seen: set[str] = set()
    for artist in _artist_list(payload):
        if not isinstance(artist, dict):
            continue
        name = _named(artist.get("name"))
        if not name:
            continue
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        artists.append(
            {
                "name": name,
                "genres": _genre_names(artist),
                "image_url": _portrait_url(artist),
            }
        )
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
