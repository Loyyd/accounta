import os

from flask import Blueprint, abort, current_app, send_from_directory


bp = Blueprint("frontend", __name__)


@bp.route("/", defaults={"path": ""})
@bp.route("/<path:path>")
def serve_frontend(path):
    if path.startswith("api/"):
        abort(404)

    static_dir = current_app.static_folder
    if path and os.path.exists(os.path.join(static_dir, path)):
        return send_from_directory(static_dir, path)

    return send_from_directory(static_dir, "login.html")
