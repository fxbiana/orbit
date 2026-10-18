from flask import Blueprint, jsonify

from app.firebase import check_firestore

bp = Blueprint("health", __name__)


@bp.get("/health")
def health():
    return jsonify({"status": "ok"})


@bp.get("/ready")
def ready():
    check_firestore()
    return jsonify({"status": "ok"})
