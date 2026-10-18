from flask import Blueprint, abort, current_app, g, jsonify

from app.auth import caller_required
from app.firebase import save_spotify_snapshot
from app.spotify import (
    SpotifyImportError,
    fetch_listening,
    genres_from_listening,
    spotify_access_token,
    suggest_from_listening,
)

bp = Blueprint("spotify", __name__, url_prefix="/api")


@bp.post("/spotify/import")
@caller_required
def import_spotify():
    """Suggest topic chips from Spotify listening. Does not write onboarding."""
    token = spotify_access_token(g.user_id, current_app.config.get("CLERK_SECRET_KEY") or "")
    if not token:
        abort(404, description="Connect Spotify before importing preferences")
    try:
        listening = fetch_listening(token)
    except SpotifyImportError as exc:
        abort(502, description=str(exc))

    genres = genres_from_listening(listening)
    suggestions, model_used = suggest_from_listening(
        listening,
        current_app.config.get("AI_API_KEY") or "",
        current_app.config.get("AI_MODEL") or "",
    )
    body = {
        "artists": listening["top_artists"],
        "tracks": listening["recent_tracks"],
        "top_tracks": listening["top_tracks"],
        "genres": genres,
        "suggestions": suggestions,
        "model": model_used,
    }
    save_spotify_snapshot(
        g.user_id,
        {
            "artists": body["artists"],
            "tracks": body["tracks"],
            "top_tracks": body["top_tracks"],
            "genres": body["genres"],
            "suggestions": body["suggestions"],
            "model": model_used or "",
        },
    )
    return jsonify(body)
