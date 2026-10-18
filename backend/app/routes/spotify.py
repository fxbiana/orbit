"""Spotify import routes.

POST /api/spotify/import — Clerk Spotify token → analyze top artists → Firestore.
GET  /api/spotify — read the caller's persisted snapshot.
"""

from flask import Blueprint, abort, g, jsonify, request

from app.auth import caller_required
from app.firebase import get_spotify, save_spotify
from app.spotify import (
    analyze_top_artists,
    fetch_spotify_access_token,
    fetch_top_artists,
)

bp = Blueprint("spotify", __name__, url_prefix="/api")


@bp.get("/spotify")
@caller_required
def read_spotify():
    snapshot = get_spotify(g.user_id)
    if snapshot is None:
        abort(404, description="spotify profile not found")
    return jsonify(snapshot)


@bp.post("/spotify/import")
@caller_required
def import_spotify():
    """Pull Spotify taste for the caller, analyze genres, persist under their user id.

    Does not auto-merge into onboarding. Returns suggested interest chips for confirm.
    Rejects a body ``user_id`` as the caller (identity is always ``g.user_id``).
    """
    body = request.get_json(silent=True)
    if body is None:
        body = {}
    if not isinstance(body, dict):
        abort(400, description="JSON object required")
    if "user_id" in body:
        abort(400, description="user_id is not allowed; caller comes from auth")
    if body:
        abort(400, description="unexpected fields")

    access_token = fetch_spotify_access_token(g.user_id)
    artists = fetch_top_artists(access_token)
    analysis = analyze_top_artists(artists)
    snapshot = save_spotify(g.user_id, analysis)
    return jsonify(snapshot), 201
