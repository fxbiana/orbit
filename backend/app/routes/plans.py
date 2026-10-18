from flask import Blueprint, abort, g, jsonify, request

from app.auth import caller_required
from app.firebase import (
    create_plan,
    get_onboarding,
    get_plan,
    join_plan,
    list_open_plans,
    list_plan_member_profiles,
)
from app.matching import parse_match_limit, rank_matches
from app.plans import parse_plan_create

bp = Blueprint("plans", __name__, url_prefix="/api")


@bp.get("/plans")
@caller_required
def get_plans():
    return jsonify({"plans": list_open_plans(g.user_id)})


@bp.post("/plans")
@caller_required
def post_plan():
    fields = parse_plan_create(request.get_json(silent=True))
    return jsonify(create_plan(g.user_id, fields)), 201


@bp.get("/plans/<plan_id>")
@caller_required
def get_plan_detail(plan_id: str):
    plan = get_plan(plan_id, g.user_id)
    if plan is None:
        abort(404, description="plan not found")
    return jsonify(plan)


@bp.post("/plans/<plan_id>/join")
@caller_required
def post_plan_join(plan_id: str):
    return jsonify(join_plan(plan_id, g.user_id)), 201


@bp.get("/plans/<plan_id>/matches")
@caller_required
def get_plan_matches(plan_id: str):
    viewer = get_onboarding(g.user_id)
    if viewer is None:
        abort(404, description="onboarding profile not found")

    peers = list_plan_member_profiles(plan_id, g.user_id)
    limit = parse_match_limit(request.args.get("limit"))
    return jsonify({"matches": rank_matches(viewer, peers, limit=limit)})
