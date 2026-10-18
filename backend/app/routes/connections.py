from flask import Blueprint, g, jsonify, request

from app.auth import caller_required
from app.connections import parse_box, parse_connection_create, parse_message
from app.firebase import (
    create_connection,
    list_connections,
    list_messages,
    post_message,
    set_connection_status,
)

bp = Blueprint("connections", __name__, url_prefix="/api")


@bp.get("/connections")
@caller_required
def get_connections():
    box = parse_box(request.args.get("box"))
    return jsonify({"connections": list_connections(g.user_id, box)})


@bp.post("/connections")
@caller_required
def post_connection():
    fields = parse_connection_create(request.get_json(silent=True), g.user_id)
    return jsonify(create_connection(g.user_id, fields)), 201


@bp.post("/connections/<connection_id>/accept")
@caller_required
def post_accept(connection_id: str):
    return jsonify(set_connection_status(connection_id, g.user_id, "accepted"))


@bp.post("/connections/<connection_id>/reject")
@caller_required
def post_reject(connection_id: str):
    return jsonify(set_connection_status(connection_id, g.user_id, "rejected"))


@bp.get("/connections/<connection_id>/messages")
@caller_required
def get_messages(connection_id: str):
    return jsonify({"messages": list_messages(connection_id, g.user_id)})


@bp.post("/connections/<connection_id>/messages")
@caller_required
def post_connection_message(connection_id: str):
    text = parse_message(request.get_json(silent=True))
    return jsonify(post_message(connection_id, g.user_id, text)), 201
