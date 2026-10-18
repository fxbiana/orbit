from flask import Blueprint, abort, g, jsonify, request

from app.auth import caller_required
from app.firebase import get_onboarding, save_onboarding
from app.onboarding import parse_onboarding

bp = Blueprint("onboarding", __name__, url_prefix="/api")


@bp.get("/onboarding")
@caller_required
def read_onboarding():
    profile = get_onboarding(g.user_id)
    if profile is None:
        abort(404, description="onboarding profile not found")
    return jsonify(profile)


@bp.put("/onboarding")
@caller_required
def write_onboarding():
    profile = parse_onboarding(request.get_json(silent=True))
    body, created = save_onboarding(g.user_id, profile)
    return jsonify(body), 201 if created else 200
