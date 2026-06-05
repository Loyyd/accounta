import time

from flask import abort, current_app, request


DEFAULT_AUTH_RATE_LIMITS = {
    "login": (5, 300),
    "register": (5, 3600),
    "google": (10, 300),
    "password": (5, 300),
}


def get_rate_limit_config(scope):
    attempts, window_seconds = DEFAULT_AUTH_RATE_LIMITS[scope]
    configured_attempts = current_app.config.get(f"{scope.upper()}_RATE_LIMIT_ATTEMPTS", attempts)
    configured_window = current_app.config.get(f"{scope.upper()}_RATE_LIMIT_WINDOW_SECONDS", window_seconds)
    return int(configured_attempts), int(configured_window)


def rate_limit_identity(*parts):
    remote_addr = request.remote_addr or "unknown"
    normalized_parts = [str(part or "").strip().lower() for part in parts if str(part or "").strip()]
    return "|".join([remote_addr, *normalized_parts])


def auth_rate_limit_key(scope, identity):
    return f"{scope}:{identity}"


def get_auth_rate_limit_store():
    return current_app.extensions.setdefault("accounta_auth_rate_limits", {})


def check_auth_rate_limit(scope, identity):
    attempts, window_seconds = get_rate_limit_config(scope)
    if attempts <= 0 or window_seconds <= 0:
        return

    store = get_auth_rate_limit_store()
    key = auth_rate_limit_key(scope, identity)
    now = time.monotonic()
    recent_attempts = [timestamp for timestamp in store.get(key, []) if now - timestamp < window_seconds]
    store[key] = recent_attempts

    if len(recent_attempts) >= attempts:
        abort(429, description="Too many attempts, please try again later")


def record_auth_rate_limit_attempt(scope, identity):
    attempts, window_seconds = get_rate_limit_config(scope)
    if attempts <= 0 or window_seconds <= 0:
        return

    store = get_auth_rate_limit_store()
    key = auth_rate_limit_key(scope, identity)
    now = time.monotonic()
    store[key] = [timestamp for timestamp in store.get(key, []) if now - timestamp < window_seconds] + [now]


def clear_auth_rate_limit(scope, identity):
    get_auth_rate_limit_store().pop(auth_rate_limit_key(scope, identity), None)
