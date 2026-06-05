import datetime as dt
import secrets
from functools import wraps

import jwt
from flask import abort, current_app, g, request
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

import compat
from extensions import db
from models import User
from validators import normalize_username, validate_username


def create_token(user_id):
    payload = {
        "sub": str(user_id),
        "exp": compat.utcnow() + dt.timedelta(seconds=current_app.config["JWT_EXP_SECONDS"]),
    }
    return jwt.encode(
        payload,
        current_app.config["SECRET_KEY"],
        algorithm=current_app.config["JWT_ALGORITHM"],
    )


def decode_token(token):
    try:
        payload = jwt.decode(
            token,
            current_app.config["SECRET_KEY"],
            algorithms=[current_app.config["JWT_ALGORITHM"]],
        )
        return int(payload["sub"])
    except jwt.ExpiredSignatureError:
        abort(401, description="Token expired")
    except Exception:
        abort(401, description="Invalid token")


def login_required(view_func):
    @wraps(view_func)
    def decorated(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        parts = auth.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            abort(401, description="Authorization header required")
        g.user_id = decode_token(parts[1])
        return view_func(*args, **kwargs)

    return decorated


def is_google_auth_enabled():
    return bool((current_app.config.get("GOOGLE_CLIENT_ID") or "").strip())


def verify_google_credential(credential):
    client_id = (current_app.config.get("GOOGLE_CLIENT_ID") or "").strip()
    if not client_id:
        abort(503, description="Google login is not configured")

    if not credential:
        abort(400, description="Google credential is required")

    try:
        payload = google_id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            client_id,
        )
    except ValueError:
        abort(401, description="Invalid Google credential")

    if payload.get("aud") != client_id:
        abort(401, description="Invalid Google audience")

    if not payload.get("sub"):
        abort(401, description="Google account identifier is missing")

    if payload.get("email") and payload.get("email_verified") is False:
        abort(401, description="Google email is not verified")

    return payload


def derive_google_username(profile):
    candidates = [
        (profile.get("email") or "").split("@")[0],
        profile.get("name"),
        f"google-{profile.get('sub', '')[:10]}",
    ]

    for candidate in candidates:
        username = normalize_username(candidate)
        if not username:
            continue
        username = username[:80]
        if len(username) < 3:
            username = f"{username}-google"
        if not validate_username(username):
            break
    else:
        username = f"google-{secrets.token_hex(4)}"

    base_username = username[:80]
    username = base_username
    suffix = 2
    while User.query.filter_by(username=username).first():
        suffix_text = f"-{suffix}"
        username = f"{base_username[:80 - len(suffix_text)]}{suffix_text}"
        suffix += 1

    return username


def apply_google_profile(user, profile):
    user.google_sub = profile["sub"]
    user.google_email = profile.get("email")
    user.google_name = profile.get("name")
    user.google_given_name = profile.get("given_name")
    user.google_family_name = profile.get("family_name")
    user.google_picture = profile.get("picture")
    user.google_linked_at = compat.utcnow()


def create_google_user(profile):
    user = User(username=derive_google_username(profile))
    user.set_password(secrets.token_urlsafe(48))
    apply_google_profile(user, profile)
    db.session.add(user)
    db.session.commit()
    return user
