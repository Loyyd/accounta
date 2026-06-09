from flask import Blueprint, current_app, jsonify
from werkzeug.exceptions import HTTPException

import compat
from auth import apply_google_profile, create_google_user, create_token, is_google_auth_enabled
from extensions import db
from models import User
from rate_limits import (
    check_auth_rate_limit,
    clear_auth_rate_limit,
    rate_limit_identity,
    record_auth_rate_limit_attempt,
)
from request_utils import get_json_body, is_tailscale_request
from subscriptions import sync_user_subscriptions_for_user
from validators import normalize_username, validate_password, validate_username


bp = Blueprint("auth", __name__)


def is_password_auth_allowed():
    if not current_app.config.get("ALLOW_PASSWORD_AUTH", True):
        return False
    # Only allow password auth if on Tailscale or in development mode
    return is_tailscale_request() or current_app.debug


@bp.route("/api/register", methods=["POST"])
def register():
    if not current_app.config["ALLOW_REGISTRATION"]:
        return jsonify({"error": "registration is disabled"}), 403

    if not current_app.config.get("ALLOW_PASSWORD_AUTH", True):
        return jsonify({"error": "password registration is disabled"}), 403

    if not is_password_auth_allowed():
        return jsonify({"error": "password registration is only allowed from the private network"}), 403

    data = get_json_body()
    username = normalize_username(data.get("username"))
    password = data.get("password", "")
    rate_identity = rate_limit_identity("register")
    check_auth_rate_limit("register", rate_identity)
    record_auth_rate_limit_attempt("register", rate_identity)

    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400

    username_error = validate_username(username)
    if username_error:
        return jsonify({"error": username_error}), 400

    password_error = validate_password(password)
    if password_error:
        return jsonify({"error": password_error}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"error": "username already exists"}), 400

    user = User(username=username)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    return jsonify(
        {
            "token": create_token(user.id),
            "username": user.username,
            "is_admin": user.is_admin,
        }
    )


@bp.route("/api/login", methods=["POST"])
def login():
    if not current_app.config.get("ALLOW_PASSWORD_AUTH", True):
        return jsonify({"error": "password login is disabled"}), 403

    if not is_password_auth_allowed():
        return jsonify({"error": "password login is only allowed from the private network"}), 403

    data = get_json_body()
    username = normalize_username(data.get("username"))
    password = data.get("password", "")
    rate_identity = rate_limit_identity("login", username)
    check_auth_rate_limit("login", rate_identity)

    if not username or not password:
        record_auth_rate_limit_attempt("login", rate_identity)
        return jsonify({"error": "username and password are required"}), 400

    user = User.query.filter_by(username=username).first()
    if not user or not user.verify_password(password):
        record_auth_rate_limit_attempt("login", rate_identity)
        return jsonify({"error": "invalid credentials"}), 401

    clear_auth_rate_limit("login", rate_identity)
    sync_user_subscriptions_for_user(user.id)

    return jsonify(
        {
            "token": create_token(user.id),
            "username": user.username,
            "is_admin": user.is_admin,
        }
    )


@bp.route("/api/auth/google/config", methods=["GET"])
def google_auth_config():
    return jsonify(
        {
            "enabled": is_google_auth_enabled(),
            "clientId": current_app.config.get("GOOGLE_CLIENT_ID") if is_google_auth_enabled() else None,
            "passwordAuthAllowed": is_password_auth_allowed(),
        }
    )


@bp.route("/api/auth/google", methods=["POST"])
def google_login():
    rate_identity = rate_limit_identity("google")
    check_auth_rate_limit("google", rate_identity)
    try:
        profile = compat.verify_google_credential(get_json_body().get("credential"))
    except HTTPException:
        record_auth_rate_limit_attempt("google", rate_identity)
        raise

    user = User.query.filter_by(google_sub=profile["sub"]).first()

    if not user:
        if not current_app.config["ALLOW_REGISTRATION"]:
            return jsonify({"error": "registration is disabled"}), 403
        user = create_google_user(profile)
    else:
        apply_google_profile(user, profile)
        db.session.commit()

    sync_user_subscriptions_for_user(user.id)
    clear_auth_rate_limit("google", rate_identity)

    return jsonify(
        {
            "token": create_token(user.id),
            "username": user.username,
            "is_admin": user.is_admin,
        }
    )
