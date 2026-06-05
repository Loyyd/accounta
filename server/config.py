import os
import secrets
from pathlib import Path


DEFAULT_DEV_CORS_ORIGINS = (
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "http://localhost:5001",
    "http://127.0.0.1:5001",
)


def resolve_default_database_url():
    base_dir = Path(__file__).resolve().parent
    candidate_paths = [
        base_dir / "instance" / "dev.db",
        base_dir.parent / "instance" / "dev.db",
    ]

    for path in candidate_paths:
        if path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            return f"sqlite:///{path}"

    default_path = candidate_paths[0]
    default_path.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{default_path}"


def resolve_database_url():
    configured_url = os.getenv("DATABASE_URL")
    if not configured_url:
        return resolve_default_database_url()

    if configured_url.startswith("sqlite:///"):
        sqlite_path = Path(configured_url.replace("sqlite:///", "/", 1))
        try:
            sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        except OSError:
            return resolve_default_database_url()

    return configured_url


def parse_cors_origins(value):
    if not value:
        return []
    return [origin.strip() for origin in value.split(",") if origin.strip()]


def parse_bool_env(name, default=False):
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def parse_int_env(name, default=0):
    value = (os.getenv(name) or "").strip()
    if not value:
        return default
    try:
        parsed = int(value)
    except ValueError:
        return default
    return max(parsed, 0)


def resolve_secret_key():
    configured_secret = (os.getenv("SECRET_KEY") or "").strip()
    if configured_secret:
        return configured_secret
    return secrets.token_urlsafe(32)


def build_info():
    return {
        "revision": os.getenv("ACCOUNTA_REVISION", "unknown"),
        "created": os.getenv("ACCOUNTA_CREATED", "unknown"),
        "source": os.getenv("ACCOUNTA_SOURCE", "https://github.com/Loyyd/accounta"),
    }


def is_development_mode(app):
    return (
        app.config.get("TESTING")
        or os.getenv("FLASK_DEBUG") == "1"
        or os.getenv("FLASK_ENV") == "development"
        or os.getenv("APP_ENV") == "development"
    )
