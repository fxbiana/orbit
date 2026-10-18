from flask import Blueprint, g, jsonify, request

from app.auth import caller_required
from app.contact import parse_contact
from app.firebase import get_contact, save_contact

bp = Blueprint("contact", __name__, url_prefix="/api")


@bp.get("/contact")
@caller_required
def read_contact():
    return jsonify(get_contact(g.user_id))


@bp.put("/contact")
@caller_required
def write_contact():
    fields = parse_contact(request.get_json(silent=True))
    return jsonify(save_contact(g.user_id, fields))
