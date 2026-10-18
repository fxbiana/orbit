from flask import Blueprint, abort, current_app, g, jsonify

from app.auth import caller_required
from app.firebase import save_spotify_snapshot
from app.spotify import (
    SpotifyImportError,
    fetch_top_artist_genres,
    normalize_genres,
    spotify_access_token,
    suggestions_from_genres,
)

bp = Blueprint("spotify", __name__, url_prefix="/api")


@bp.post("/spotify/import")
@caller_required
def import_spotify():
    """Suggest interest chips from Spotify. Does not merge them into onboarding."""
    token = spotify_access_token(g.user_id, current_app.config.get("CLERK_SECRET_KEY") or "")
    if not token:
        abort(404, description="Connect Spotify before importing preferences")
    try:
        raw_genres = fetch_top_artist_genres(token)
    except SpotifyImportError as exc:
        abort(502, description=str(exc))

    genres = normalize_genres(raw_genres)
    save_spotify_snapshot(g.user_id, genres)
    return jsonify(
        {
            "genres": genres,
            "suggestions": suggestions_from_genres(genres),
        }
    )
