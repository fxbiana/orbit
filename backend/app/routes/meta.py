from flask import Blueprint, abort, current_app, g, jsonify

from app.auth import caller_required
from app.firebase import save_meta_snapshot
from app.meta import (
    MetaImportError,
    fetch_languages,
    meta_access_token,
    normalize_languages,
    suggestions_from_languages,
)

bp = Blueprint("meta", __name__, url_prefix="/api")


@bp.post("/meta/import")
@caller_required
def import_meta():
    """Suggest language chips from Meta. Does not merge them into onboarding."""
    token = meta_access_token(g.user_id, current_app.config.get("CLERK_SECRET_KEY") or "")
    if not token:
        abort(404, description="Connect Meta before importing preferences")
    try:
        raw_languages = fetch_languages(token)
    except MetaImportError as exc:
        abort(502, description=str(exc))

    languages = normalize_languages(raw_languages)
    save_meta_snapshot(g.user_id, languages)
    return jsonify(
        {
            "languages": languages,
            "suggestions": suggestions_from_languages(languages),
        }
    )
