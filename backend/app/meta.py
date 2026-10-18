"""Optional Meta personalization. Suggestions are not written onto onboarding."""

import json
import urllib.error
import urllib.request

_MAX_LANGUAGES = 20
_MAX_LANGUAGE_LEN = 80
_META_PROVIDERS = frozenset({"oauth_facebook", "facebook", "oauth_instagram", "instagram"})
_OAUTH_PROVIDER = {
    "facebook": "oauth_facebook",
    "oauth_facebook": "oauth_facebook",
    "instagram": "oauth_instagram",
    "oauth_instagram": "oauth_instagram",
}
LANGUAGES_URL = "https://graph.facebook.com/v21.0/me?fields=languages{name}"


class MetaImportError(Exception):
    """Meta refused or failed the languages request."""


def normalize_languages(raw) -> list[str]:
    """Title-case, collapse whitespace, and dedupe language labels."""
    if not isinstance(raw, list):
        return []

    seen: set[str] = set()
    languages: list[str] = []
    for item in raw:
        if not isinstance(item, str):
            continue
        collapsed = " ".join(item.split())
        if not collapsed:
            continue
        titled = collapsed.title()[:_MAX_LANGUAGE_LEN].strip()
        if not titled:
            continue
        key = titled.casefold()
        if key in seen:
            continue
        seen.add(key)
        languages.append(titled)
        if len(languages) >= _MAX_LANGUAGES:
            break
    return languages


def suggestions_from_languages(languages: list[str]) -> dict:
    """Language suggestions only. The caller confirms before any profile write."""
    return {"knows": list(languages), "wants_to_learn": []}


def fetch_languages(access_token: str, opener=None) -> list[str]:
    """GET the caller's Graph languages and collect name strings.

    Requests ``languages{name}`` only. Does not read location, email, birthday,
    or the user's name.
    """
    if opener is None:
        opener = urllib.request.urlopen
    request = urllib.request.Request(
        LANGUAGES_URL,
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
        raise MetaImportError(f"Meta languages request failed ({exc.code})") from exc
    except MetaImportError:
        raise
    except Exception as exc:
        raise MetaImportError("Meta languages request failed") from exc

    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise MetaImportError("Meta languages response was not JSON") from exc

    return _language_names(payload)


def _language_names(payload) -> list[str]:
    if not isinstance(payload, dict):
        return []
    languages = payload.get("languages")
    if not isinstance(languages, list):
        return []
    names: list[str] = []
    for item in languages:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        if isinstance(name, str):
            names.append(name)
    return names


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


def meta_access_token(user_id: str, secret_key: str) -> str | None:
    """Return the Clerk user's Meta OAuth access token, or None.

    Lists external accounts and keeps the token only when Facebook or
    Instagram is connected. Isolated so tests can monkeypatch this without
    calling Clerk.
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

        meta = next(
            (account for account in accounts if _provider_name(account) in _META_PROVIDERS),
            None,
        )
        if meta is None:
            return None

        direct = _token_from(meta)
        if direct:
            return direct

        getter = getattr(clerk.users, "get_o_auth_access_token", None)
        if getter is None:
            return None
        provider = _OAUTH_PROVIDER[_provider_name(meta)]
        tokens = getter(user_id=user_id, provider=provider) or []
        for item in tokens:
            token = _token_from(item)
            if token:
                return token
    return None
