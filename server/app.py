import os

from dotenv import load_dotenv
from flask import Flask, current_app, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

from auth import (
    apply_google_profile,
    create_google_user,
    create_token,
    decode_token,
    derive_google_username,
    is_google_auth_enabled,
    login_required,
    verify_google_credential,
)
from config import (
    DEFAULT_DEV_CORS_ORIGINS,
    build_info,
    is_development_mode,
    parse_bool_env,
    parse_cors_origins,
    parse_int_env,
    resolve_database_url,
    resolve_default_database_url,
    resolve_secret_key,
)
from extensions import db
from models import Category, Entry, Pouch, PouchTransfer, Subscription, User
from rate_limits import (
    auth_rate_limit_key,
    check_auth_rate_limit,
    clear_auth_rate_limit,
    get_auth_rate_limit_store,
    get_rate_limit_config,
    rate_limit_identity,
    record_auth_rate_limit_attempt,
)
from request_utils import get_current_user, get_json_body, get_user_or_404, require_admin
from routes import register_routes
from schema import ensure_database_ready, ensure_user_schema
from serializers import (
    serialize_category,
    serialize_datetime,
    serialize_entry,
    serialize_pouch,
    serialize_pouch_transfer,
    serialize_subscription,
)
from services import count_admin_users, delete_user_related_data, get_pouch_balance
from subscriptions import (
    add_months,
    add_years,
    get_next_occurrence_date,
    iter_subscription_occurrences,
    subscription_entry_exists,
    sync_user_subscriptions_for_user,
)
from time_utils import utcnow
from validators import (
    HEX_COLOR_PATTERN,
    VALID_ENTRY_TYPES,
    VALID_SUBSCRIPTION_FREQUENCIES,
    VALID_TRANSFER_DIRECTIONS,
    normalize_category_color,
    normalize_username,
    parse_amount,
    parse_entry_date,
    parse_start_date,
    validate_password,
    validate_username,
)

load_dotenv()


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.update(
        SQLALCHEMY_DATABASE_URI=resolve_database_url(),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SECRET_KEY=resolve_secret_key(),
        JWT_ALGORITHM=os.getenv("JWT_ALGORITHM", "HS256"),
        JWT_EXP_SECONDS=int(os.getenv("JWT_EXP_SECONDS", "86400")),
        ALLOW_REGISTRATION=parse_bool_env("ALLOW_REGISTRATION", default=True),
        ALLOW_PASSWORD_AUTH=parse_bool_env("ALLOW_PASSWORD_AUTH", default=True),
        GOOGLE_CLIENT_ID=os.getenv("GOOGLE_CLIENT_ID", ""),
    )

    if test_config:
        app.config.update(test_config)

    db.init_app(app)

    if not is_development_mode(app) and not (os.getenv("SECRET_KEY") or "").strip():
        raise RuntimeError("SECRET_KEY must be set in production")

    trust_proxy_count = parse_int_env("TRUST_PROXY_COUNT", default=0)
    if trust_proxy_count:
        app.wsgi_app = ProxyFix(
            app.wsgi_app,
            x_for=trust_proxy_count,
            x_proto=trust_proxy_count,
            x_host=trust_proxy_count,
            x_port=trust_proxy_count,
            x_prefix=trust_proxy_count,
        )

    cors_origins = parse_cors_origins(os.getenv("CORS_ORIGINS"))
    if cors_origins:
        CORS(app, resources={r"/api/*": {"origins": cors_origins}})
    elif is_development_mode(app):
        CORS(app, resources={r"/api/*": {"origins": list(DEFAULT_DEV_CORS_ORIGINS)}})

    if not (os.getenv("SECRET_KEY") or "").strip():
        app.logger.warning("SECRET_KEY is not set; using a generated ephemeral key for this process.")

    register_error_handlers(app)
    register_security_headers(app)
    register_routes(app)

    with app.app_context():
        ensure_database_ready()

    return app


def register_error_handlers(app):
    @app.errorhandler(HTTPException)
    def handle_http_exception(error):
        if request.path.startswith("/api/"):
            return jsonify({"error": error.description}), error.code
        return error

    @app.errorhandler(Exception)
    def handle_unexpected_error(error):
        if request.path.startswith("/api/"):
            current_app.logger.exception("Unhandled API error")
            return jsonify({"error": "internal server error"}), 500
        raise error


def register_security_headers(app):
    @app.after_request
    def add_security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        if request.is_secure:
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        if request.path.endswith("login.html") or request.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response


app = create_app()


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG") == "1",
    )
