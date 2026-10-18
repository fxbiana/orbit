from functools import wraps

from clerk_backend_api import AuthenticateRequestOptions, authenticate_request
from flask import abort, current_app, g, request


def clerk_required(view):
    """Verify the Clerk session token and set g.user_id to the Clerk user id."""

    @wraps(view)
    def wrapper(*args, **kwargs):
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
            abort(401, description=reason)

        g.auth_state = state
        g.user_id = state.payload["sub"]
        return view(*args, **kwargs)

    return wrapper
