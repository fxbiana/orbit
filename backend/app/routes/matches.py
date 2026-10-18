from flask import Blueprint, abort, g, jsonify, request

from app.auth import caller_required
from app.firebase import get_onboarding, list_onboarding_peers
from app.matching import parse_match_limit, rank_matches

bp = Blueprint("matches", __name__, url_prefix="/api")


@bp.get("/matches")
@caller_required
def get_matches():
    viewer = get_onboarding(g.user_id)
    if viewer is None:
        abort(404, description="onboarding profile not found")

    peers = list_onboarding_peers(g.user_id)
    limit = parse_match_limit(request.args.get("limit"))
    return jsonify({"matches": rank_matches(viewer, peers, limit=limit)})
