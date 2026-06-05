from flask import Blueprint, jsonify

from config import build_info


bp = Blueprint("meta", __name__)


@bp.route("/api/ping")
def ping():
    return jsonify({"ok": True})


@bp.route("/api/version")
def version():
    return jsonify(build_info())
