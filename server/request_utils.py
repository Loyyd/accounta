from flask import abort, g, request

from extensions import db
from models import User


def get_json_body():
    return request.get_json(silent=True) or {}


def get_user_or_404(user_id):
    user = db.session.get(User, user_id)
    if not user:
        abort(404, description="not found")
    return user


def get_current_user():
    return get_user_or_404(g.user_id)


def require_admin():
    user = get_current_user()
    if not user.is_admin:
        abort(403, description="admin access required")
    return user
