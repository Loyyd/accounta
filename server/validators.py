import datetime as dt
import re

import compat


VALID_ENTRY_TYPES = {"income", "expense"}
VALID_SUBSCRIPTION_FREQUENCIES = {"weekly", "monthly", "yearly"}
VALID_TRANSFER_DIRECTIONS = {"to_pouch", "from_pouch"}
HEX_COLOR_PATTERN = re.compile(r"^#[0-9a-fA-F]{6}$")


def normalize_username(value):
    return (value or "").strip()


def validate_username(username):
    if len(username) < 3:
        return "username must be at least 3 characters"
    if len(username) > 80:
        return "username must be 80 characters or fewer"
    return None


def validate_password(password):
    if len(password) < 8:
        return "password must be at least 8 characters"
    if password.isalpha() or password.isdigit():
        return "password must include both letters and numbers"
    return None


def normalize_category_color(value):
    color = (value or "#6ee7b7").strip()
    if not HEX_COLOR_PATTERN.fullmatch(color):
        raise ValueError("color must be a 6-digit hex value")
    return color.lower()


def parse_amount(value):
    try:
        amount = round(float(value), 2)
    except (TypeError, ValueError):
        raise ValueError("amount must be numeric")
    if amount <= 0:
        raise ValueError("amount must be greater than 0")
    return amount


def parse_entry_date(value):
    if not value:
        return compat.utcnow()
    if not isinstance(value, str):
        raise ValueError("date must be a string")

    normalized = value.strip()
    if not normalized:
        return compat.utcnow()

    try:
        parsed = dt.datetime.fromisoformat(normalized.replace("Z", "+00:00"))
    except ValueError:
        try:
            parsed_date = dt.date.fromisoformat(normalized)
        except ValueError as exc:
            raise ValueError("invalid date format") from exc
        parsed = dt.datetime.combine(parsed_date, dt.time.min)

    if parsed.tzinfo:
        parsed = parsed.astimezone(dt.timezone.utc).replace(tzinfo=None)
    return parsed


def parse_start_date(value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError("invalid date")
    try:
        return dt.date.fromisoformat(value.strip())
    except ValueError as exc:
        raise ValueError("invalid date") from exc
