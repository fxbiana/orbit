import base64
import json
import re
from functools import wraps

from clerk_backend_api import AuthenticateRequestOptions, authenticate_request
from flask import abort, current_app, g, request

_USER_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")


def _token_azp() -> str | None:
    """Read azp from the bearer payload. The signature is not checked here."""
    header = request.headers.get("Authorization") or ""
    if not header.startswith("Bearer "):
        return None
    parts = header[7:].strip().split(".")
    if len(parts) != 3:
        return None
    try:
        padded = parts[1] + "=" * (-len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded))
    except (ValueError, json.JSONDecodeError):
        return None
    azp = payload.get("azp") if isinstance(payload, dict) else None
    return azp if isinstance(azp, str) else None


def read_local_user_id() -> str:
    """Read the caller from X-User-Id. A user id in the JSON body is not the caller."""
    user_id = (request.headers.get("X-User-Id") or "").strip()
    if not user_id:
        abort(401, description="X-User-Id is required")
    if _USER_ID.fullmatch(user_id) is None:
        abort(400, description="X-User-Id is invalid")
    return user_id


def _authenticate_clerk() -> None:
    secret = current_app.config["CLERK_SECRET_KEY"]
    if not secret:
        abort(401, description="CLERK_SECRET_KEY is not configured")

    state = authenticate_request(
        request,
        AuthenticateRequestOptions(
            secret_key=secret,
            jwt_key=current_app.config.get("CLERK_JWT_KEY"),
            authorized_parties=current_app.config["CLERK_AUTHORIZED_PARTIES"],
            accepts_token=["session_token"],
        ),
    )
    if not state.is_signed_in:
        reason = state.reason.name if state.reason else "unauthorized"
        current_app.logger.warning(
            "Clerk rejected the session token: %s azp=%s",
            reason,
            _token_azp() or "missing",
        )
        abort(401, description=reason)

    g.auth_state = state
    g.user_id = state.payload["sub"]


def caller_required(view):
    """Set g.user_id from X-User-Id, or from a Clerk session when AUTH_MODE is clerk."""

    @wraps(view)
    def wrapper(*args, **kwargs):
        if current_app.config.get("AUTH_MODE") == "clerk":
            _authenticate_clerk()
        else:
            g.user_id = read_local_user_id()
        return view(*args, **kwargs)

    return wrapper
