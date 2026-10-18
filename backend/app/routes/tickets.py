from flask import Blueprint, abort, g, jsonify, request

from app.auth import caller_required
from app.firebase import create_ticket, list_tickets

bp = Blueprint("tickets", __name__, url_prefix="/api")


@bp.get("/me")
@caller_required
def me():
    return jsonify({"user_id": g.user_id})


@bp.get("/tickets")
@caller_required
def get_tickets():
    return jsonify({"tickets": list_tickets(g.user_id)})


@bp.post("/tickets")
@caller_required
def post_ticket():
    body = request.get_json(silent=True) or {}
    title = str(body.get("title") or "").strip()
    url = str(body.get("url") or "").strip()
    if not title or not url:
        abort(400, description="title and url are required")
    if len(title) > 500 or len(url) > 2000:
        abort(400, description="title or url is too long")

    return jsonify(create_ticket(g.user_id, title, url)), 201
