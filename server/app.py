import calendar
import datetime as dt
import os
import secrets
from functools import wraps
from pathlib import Path

import bcrypt
import jwt
from dotenv import load_dotenv
from flask import Flask, abort, current_app, g, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect, text
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

load_dotenv()

db = SQLAlchemy()

VALID_ENTRY_TYPES = {"income", "expense"}
VALID_SUBSCRIPTION_FREQUENCIES = {"weekly", "monthly", "yearly"}
DEFAULT_DEV_CORS_ORIGINS = (
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "http://localhost:5001",
    "http://127.0.0.1:5001",
)


def utcnow():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0, tzinfo=None)


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


def resolve_secret_key():
    configured_secret = (os.getenv("SECRET_KEY") or "").strip()
    if configured_secret:
        return configured_secret
    return secrets.token_urlsafe(32)


def is_development_mode(app):
    return app.config.get("TESTING") or os.getenv("FLASK_DEBUG") == "1" or os.getenv("FLASK_ENV") == "development"


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    is_admin = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    def set_password(self, raw_password):
        self.password_hash = generate_password_hash(raw_password)

    def verify_password(self, raw_password):
        if self.password_hash.startswith("$2"):
            return bcrypt.checkpw(raw_password.encode("utf-8"), self.password_hash.encode("utf-8"))
        return check_password_hash(self.password_hash, raw_password)


class Entry(db.Model):
    __tablename__ = "entries"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    type = db.Column(db.String(10), nullable=False)
    description = db.Column(db.String(255), nullable=False)
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    category = db.Column(db.String(80), nullable=False)
    date = db.Column(db.DateTime, default=utcnow, nullable=False)


class Category(db.Model):
    __tablename__ = "categories"
    __table_args__ = (
        db.UniqueConstraint("user_id", "type", "name", name="uq_category_user_type_name"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    type = db.Column(db.String(10), nullable=False)
    name = db.Column(db.String(80), nullable=False)
    color = db.Column(db.String(7), nullable=False)


class Subscription(db.Model):
    __tablename__ = "subscriptions"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    type = db.Column(db.String(10), nullable=False)
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    category = db.Column(db.String(80), nullable=False)
    description = db.Column(db.String(255), nullable=False)
    frequency = db.Column(db.String(10), nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    active = db.Column(db.Boolean, default=True, nullable=False)


class Budget(db.Model):
    __tablename__ = "budgets"
    __table_args__ = (
        db.UniqueConstraint("user_id", "category", name="uq_budget_user_category"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    category = db.Column(db.String(80), nullable=False)
    amount = db.Column(db.Numeric(12, 2), nullable=False)


def create_token(user_id):
    payload = {
        "sub": str(user_id),
        "exp": utcnow() + dt.timedelta(seconds=current_app.config["JWT_EXP_SECONDS"]),
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
    except jwt.ExpiredSignatureError as exc:
        abort(401, description="Token expired")
    except Exception as exc:
        abort(401, description="Invalid token")


def login_required(view_func):
    @wraps(view_func)
    def decorated(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        parts = auth.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            abort(401, description="Authorization header required")
        g.user_id = decode_token(parts[1])
        sync_user_subscriptions_for_user(g.user_id)
        return view_func(*args, **kwargs)

    return decorated


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


def serialize_datetime(value):
    if not value:
        return None
    return value.replace(tzinfo=dt.timezone.utc).isoformat().replace("+00:00", "Z")


def serialize_entry(entry):
    return {
        "id": entry.id,
        "type": entry.type,
        "description": entry.description,
        "amount": float(entry.amount),
        "category": entry.category,
        "date": serialize_datetime(entry.date),
    }


def serialize_category(category):
    return {"id": category.id, "name": category.name, "color": category.color, "type": category.type}


def serialize_subscription(subscription):
    return {
        "id": subscription.id,
        "type": subscription.type,
        "amount": float(subscription.amount),
        "category": subscription.category,
        "description": subscription.description,
        "frequency": subscription.frequency,
        "startDate": subscription.start_date.isoformat(),
        "active": subscription.active,
    }


def serialize_budget(budget):
    return {"category": budget.category, "amount": float(budget.amount)}


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
        return utcnow()
    if not isinstance(value, str):
        raise ValueError("date must be a string")

    normalized = value.strip()
    if not normalized:
        return utcnow()

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


def count_admin_users():
    return User.query.filter_by(is_admin=True).count()


def add_months(value, months, anchor_day):
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(anchor_day, calendar.monthrange(year, month)[1])
    return dt.date(year, month, day)


def add_years(value, years, anchor_month, anchor_day):
    year = value.year + years
    day = min(anchor_day, calendar.monthrange(year, anchor_month)[1])
    return dt.date(year, anchor_month, day)


def get_next_occurrence_date(current_date, subscription):
    if subscription.frequency == "weekly":
        return current_date + dt.timedelta(days=7)
    if subscription.frequency == "monthly":
        return add_months(current_date, 1, subscription.start_date.day)
    if subscription.frequency == "yearly":
        return add_years(current_date, 1, subscription.start_date.month, subscription.start_date.day)
    raise ValueError("invalid subscription frequency")


def iter_subscription_occurrences(subscription, today=None):
    current_date = subscription.start_date
    final_date = today or utcnow().date()

    while current_date <= final_date:
        yield current_date
        current_date = get_next_occurrence_date(current_date, subscription)


def subscription_entry_exists(subscription, occurrence_date):
    occurrence_datetime = dt.datetime.combine(occurrence_date, dt.time.min)
    return (
        Entry.query.filter_by(
            user_id=subscription.user_id,
            type=subscription.type,
            description=subscription.description,
            amount=subscription.amount,
            category=subscription.category,
            date=occurrence_datetime,
        ).first()
        is not None
    )


def sync_user_subscriptions_for_user(user_id, today=None):
    subscriptions = Subscription.query.filter_by(user_id=user_id, active=True).all()
    if not subscriptions:
        return 0

    created_entries = 0
    final_date = today or utcnow().date()

    for subscription in subscriptions:
        if subscription.start_date > final_date:
            continue

        for occurrence_date in iter_subscription_occurrences(subscription, today=final_date):
            if subscription_entry_exists(subscription, occurrence_date):
                continue

            db.session.add(
                Entry(
                    user_id=subscription.user_id,
                    type=subscription.type,
                    description=subscription.description,
                    amount=subscription.amount,
                    category=subscription.category,
                    date=dt.datetime.combine(occurrence_date, dt.time.min),
                )
            )
            created_entries += 1

    if created_entries:
        db.session.commit()

    return created_entries


def delete_user_related_data(user):
    Budget.query.filter_by(user_id=user.id).delete(synchronize_session=False)
    Subscription.query.filter_by(user_id=user.id).delete(synchronize_session=False)
    Category.query.filter_by(user_id=user.id).delete(synchronize_session=False)
    Entry.query.filter_by(user_id=user.id).delete(synchronize_session=False)
    db.session.delete(user)


def ensure_user_schema():
    inspector = inspect(db.engine)
    if "users" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("users")}

    if "is_admin" not in columns:
        db.session.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0"))
        db.session.commit()

    if "created_at" not in columns:
        db.session.execute(text("ALTER TABLE users ADD COLUMN created_at DATETIME"))
        db.session.execute(text("UPDATE users SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"))
        db.session.commit()


def ensure_database_ready():
    db.create_all()
    ensure_user_schema()


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.update(
        SQLALCHEMY_DATABASE_URI=resolve_database_url(),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SECRET_KEY=resolve_secret_key(),
        JWT_ALGORITHM=os.getenv("JWT_ALGORITHM", "HS256"),
        JWT_EXP_SECONDS=int(os.getenv("JWT_EXP_SECONDS", "86400")),
    )

    if test_config:
        app.config.update(test_config)

    db.init_app(app)

    cors_origins = parse_cors_origins(os.getenv("CORS_ORIGINS"))
    if cors_origins:
        CORS(app, resources={r"/api/*": {"origins": cors_origins}})
    elif is_development_mode(app):
        CORS(app, resources={r"/api/*": {"origins": list(DEFAULT_DEV_CORS_ORIGINS)}})

    if not (os.getenv("SECRET_KEY") or "").strip():
        app.logger.warning("SECRET_KEY is not set; using a generated ephemeral key for this process.")

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

    @app.route("/api/register", methods=["POST"])
    def register():
        data = get_json_body()
        username = normalize_username(data.get("username"))
        password = data.get("password", "")

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

    @app.route("/api/login", methods=["POST"])
    def login():
        data = get_json_body()
        username = normalize_username(data.get("username"))
        password = data.get("password", "")

        if not username or not password:
            return jsonify({"error": "username and password are required"}), 400

        user = User.query.filter_by(username=username).first()
        if not user or not user.verify_password(password):
            return jsonify({"error": "invalid credentials"}), 401

        sync_user_subscriptions_for_user(user.id)

        return jsonify(
            {
                "token": create_token(user.id),
                "username": user.username,
                "is_admin": user.is_admin,
            }
        )

    @app.route("/api/entries", methods=["GET"])
    @login_required
    def list_entries():
        entries = Entry.query.filter_by(user_id=g.user_id).order_by(Entry.date.desc(), Entry.id.desc()).all()
        return jsonify([serialize_entry(entry) for entry in entries])

    @app.route("/api/entries", methods=["POST"])
    @login_required
    def add_entry():
        data = get_json_body()
        entry_type = data.get("type")
        description = (data.get("description") or "").strip() or (
            entry_type.capitalize() if isinstance(entry_type, str) else "Transaction"
        )
        category = (data.get("category") or "").strip() or "Other"

        if entry_type not in VALID_ENTRY_TYPES:
            return jsonify({"error": "type must be income or expense"}), 400

        try:
            amount = parse_amount(data.get("amount"))
            entry_date = parse_entry_date(data.get("date"))
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

        entry = Entry(
            user_id=g.user_id,
            type=entry_type,
            description=description,
            amount=amount,
            category=category,
            date=entry_date,
        )
        db.session.add(entry)
        db.session.commit()
        return jsonify({"id": entry.id}), 201

    @app.route("/api/entries/<int:entry_id>", methods=["DELETE"])
    @login_required
    def delete_entry(entry_id):
        entry = db.session.get(Entry, entry_id)
        if not entry or entry.user_id != g.user_id:
            return jsonify({"error": "not found"}), 404
        db.session.delete(entry)
        db.session.commit()
        return jsonify({"ok": True})

    @app.route("/api/entries/<int:entry_id>", methods=["PUT"])
    @login_required
    def update_entry(entry_id):
        entry = db.session.get(Entry, entry_id)
        if not entry or entry.user_id != g.user_id:
            return jsonify({"error": "not found"}), 404

        data = get_json_body()

        if "type" in data:
            entry_type = data.get("type")
            if entry_type not in VALID_ENTRY_TYPES:
                return jsonify({"error": "invalid type"}), 400
            entry.type = entry_type

        if "description" in data:
            entry.description = (data.get("description") or "").strip() or entry.description

        if "amount" in data:
            try:
                entry.amount = parse_amount(data.get("amount"))
            except ValueError as exc:
                return jsonify({"error": str(exc)}), 400

        if "category" in data:
            entry.category = (data.get("category") or "").strip() or entry.category

        if "date" in data:
            try:
                entry.date = parse_entry_date(data.get("date"))
            except ValueError as exc:
                return jsonify({"error": str(exc)}), 400

        db.session.commit()
        return jsonify({"ok": True})

    @app.route("/api/ping")
    def ping():
        return jsonify({"ok": True})

    @app.route("/api/profile", methods=["GET"])
    @login_required
    def profile():
        user = get_current_user()
        return jsonify(
            {
                "username": user.username,
                "id": user.id,
                "is_admin": user.is_admin,
                "createdAt": serialize_datetime(user.created_at),
            }
        )

    @app.route("/api/profile/password", methods=["PUT"])
    @login_required
    def change_password():
        user = get_current_user()
        data = get_json_body()
        current_password = data.get("currentPassword", "")
        new_password = data.get("newPassword", "")

        if not current_password or not new_password:
            return jsonify({"error": "current password and new password are required"}), 400

        if not user.verify_password(current_password):
            return jsonify({"error": "current password is incorrect"}), 401

        if current_password == new_password:
            return jsonify({"error": "new password must be different from the current password"}), 400

        password_error = validate_password(new_password)
        if password_error:
            return jsonify({"error": password_error}), 400

        user.set_password(new_password)
        db.session.commit()
        return jsonify({"ok": True, "message": "Password updated successfully"})

    @app.route("/api/profile", methods=["DELETE"])
    @login_required
    def delete_account():
        user = get_current_user()
        data = get_json_body()
        confirm_text = (data.get("confirmText") or "").strip()

        if confirm_text not in {user.username, "DELETE"}:
            return jsonify({"error": f'type "{user.username}" to confirm account deletion'}), 400

        if user.is_admin and count_admin_users() <= 1:
            return jsonify({"error": "cannot delete the last admin account"}), 400

        delete_user_related_data(user)
        db.session.commit()
        return jsonify({"ok": True, "message": "Account deleted successfully"})

    @app.route("/api/export", methods=["GET"])
    @login_required
    def export_account_data():
        user = get_current_user()
        entries = Entry.query.filter_by(user_id=user.id).order_by(Entry.date.desc(), Entry.id.desc()).all()
        categories = Category.query.filter_by(user_id=user.id).order_by(Category.type.asc(), Category.name.asc()).all()
        subscriptions = Subscription.query.filter_by(user_id=user.id).order_by(Subscription.start_date.desc()).all()
        budgets = Budget.query.filter_by(user_id=user.id).order_by(Budget.category.asc()).all()

        return jsonify(
            {
                "exportedAt": serialize_datetime(utcnow()),
                "profile": {
                    "id": user.id,
                    "username": user.username,
                    "is_admin": user.is_admin,
                    "createdAt": serialize_datetime(user.created_at),
                },
                "entries": [serialize_entry(entry) for entry in entries],
                "categories": [serialize_category(category) for category in categories],
                "subscriptions": [serialize_subscription(subscription) for subscription in subscriptions],
                "budgets": [serialize_budget(budget) for budget in budgets],
            }
        )

    @app.route("/api/admin/users", methods=["GET"])
    @login_required
    def admin_get_users():
        require_admin()
        users = User.query.order_by(User.created_at.desc(), User.id.desc()).all()
        users_list = []

        for user in users:
            entry_count = Entry.query.filter_by(user_id=user.id).count()
            total_income = (
                db.session.query(db.func.sum(Entry.amount))
                .filter_by(user_id=user.id, type="income")
                .scalar()
                or 0
            )
            total_expense = (
                db.session.query(db.func.sum(Entry.amount))
                .filter_by(user_id=user.id, type="expense")
                .scalar()
                or 0
            )

            users_list.append(
                {
                    "id": user.id,
                    "username": user.username,
                    "is_admin": user.is_admin,
                    "created_at": serialize_datetime(user.created_at),
                    "entry_count": entry_count,
                    "total_income": float(total_income),
                    "total_expense": float(total_expense),
                }
            )

        return jsonify({"users": users_list})

    @app.route("/api/admin/users/<int:user_id>", methods=["DELETE"])
    @login_required
    def admin_delete_user(user_id):
        admin_user = require_admin()
        target_user = db.session.get(User, user_id)
        if not target_user:
            return jsonify({"error": "user not found"}), 404

        if target_user.id == admin_user.id:
            return jsonify({"error": "cannot delete yourself"}), 400

        if target_user.is_admin and count_admin_users() <= 1:
            return jsonify({"error": "cannot delete the last admin account"}), 400

        delete_user_related_data(target_user)
        db.session.commit()
        return jsonify({"ok": True})

    @app.route("/api/admin/users/<int:user_id>/toggle-admin", methods=["POST"])
    @login_required
    def admin_toggle_admin(user_id):
        admin_user = require_admin()
        target_user = db.session.get(User, user_id)
        if not target_user:
            return jsonify({"error": "user not found"}), 404

        if target_user.id == admin_user.id:
            return jsonify({"error": "cannot modify your own admin status"}), 400

        if target_user.is_admin and count_admin_users() <= 1:
            return jsonify({"error": "cannot remove the last admin"}), 400

        target_user.is_admin = not target_user.is_admin
        db.session.commit()
        return jsonify({"ok": True, "is_admin": target_user.is_admin})

    @app.route("/api/admin/users/<int:user_id>", methods=["PUT"])
    @login_required
    def admin_update_user(user_id):
        require_admin()
        target_user = db.session.get(User, user_id)
        if not target_user:
            return jsonify({"error": "user not found"}), 404

        data = get_json_body()
        if "username" in data:
            new_username = normalize_username(data.get("username"))
            username_error = validate_username(new_username)
            if username_error:
                return jsonify({"error": username_error}), 400

            existing = User.query.filter_by(username=new_username).first()
            if existing and existing.id != user_id:
                return jsonify({"error": "username already exists"}), 400

            target_user.username = new_username

        db.session.commit()
        return jsonify({"ok": True})

    @app.route("/api/categories", methods=["GET"])
    @login_required
    def get_categories():
        categories = Category.query.filter_by(user_id=g.user_id).order_by(Category.name.asc()).all()
        result = {"expense": [], "income": []}
        for category in categories:
            result[category.type].append({"name": category.name, "color": category.color})
        return jsonify(result)

    @app.route("/api/categories", methods=["POST"])
    @login_required
    def add_category():
        data = get_json_body()
        name = (data.get("name") or "").strip()
        category_type = data.get("type")
        color = (data.get("color") or "#6ee7b7").strip()

        if not name or category_type not in VALID_ENTRY_TYPES:
            return jsonify({"error": "name and type are required"}), 400

        existing = Category.query.filter_by(user_id=g.user_id, type=category_type, name=name).first()
        if existing:
            return jsonify({"error": "category already exists"}), 400

        category = Category(user_id=g.user_id, type=category_type, name=name, color=color)
        db.session.add(category)
        db.session.commit()
        return jsonify({"ok": True, "id": category.id}), 201

    @app.route("/api/categories/<int:category_id>", methods=["DELETE"])
    @login_required
    def delete_category(category_id):
        name = request.args.get("name", "").strip()
        category_type = request.args.get("type", "").strip()

        if name and category_type:
            category = Category.query.filter_by(user_id=g.user_id, name=name, type=category_type).first()
        else:
            category = db.session.get(Category, category_id)
            if category and category.user_id != g.user_id:
                category = None

        if not category:
            return jsonify({"error": "not found"}), 404

        db.session.delete(category)
        db.session.commit()
        return jsonify({"ok": True})

    @app.route("/api/categories/<int:category_id>", methods=["PUT"])
    @login_required
    def update_category(category_id):
        data = get_json_body()
        name = (data.get("name") or "").strip()
        category_type = data.get("type")
        old_name = (data.get("oldName") or "").strip()

        if old_name and category_type:
            category = Category.query.filter_by(user_id=g.user_id, name=old_name, type=category_type).first()
        elif name and category_type:
            category = Category.query.filter_by(user_id=g.user_id, name=name, type=category_type).first()
        else:
            category = db.session.get(Category, category_id)
            if category and category.user_id != g.user_id:
                category = None

        if not category:
            return jsonify({"error": "not found"}), 404

        if "name" in data:
            if not name:
                return jsonify({"error": "name is required"}), 400
            if name != (old_name or category.name):
                existing = Category.query.filter_by(user_id=g.user_id, name=name, type=category_type).first()
                if existing and existing.id != category.id:
                    return jsonify({"error": "category name already exists"}), 400
                Entry.query.filter_by(
                    user_id=g.user_id,
                    category=old_name or category.name,
                    type=category_type,
                ).update({"category": name})
                Subscription.query.filter_by(
                    user_id=g.user_id,
                    category=old_name or category.name,
                    type=category_type,
                ).update({"category": name})
                if category_type == "expense":
                    Budget.query.filter_by(user_id=g.user_id, category=old_name or category.name).update(
                        {"category": name}
                    )
                category.name = name

        if "color" in data:
            category.color = (data.get("color") or category.color).strip() or category.color

        db.session.commit()
        return jsonify({"ok": True})

    @app.route("/api/subscriptions", methods=["GET"])
    @login_required
    def get_subscriptions():
        subscriptions = Subscription.query.filter_by(user_id=g.user_id).order_by(Subscription.start_date.desc()).all()
        return jsonify([serialize_subscription(subscription) for subscription in subscriptions])

    @app.route("/api/subscriptions", methods=["POST"])
    @login_required
    def add_subscription():
        data = get_json_body()
        subscription_type = data.get("type")
        category = (data.get("category") or "").strip()
        description = (data.get("description") or "").strip()
        frequency = data.get("frequency")

        if subscription_type not in VALID_ENTRY_TYPES:
            return jsonify({"error": "invalid type"}), 400
        if not category or not description or frequency not in VALID_SUBSCRIPTION_FREQUENCIES:
            return jsonify({"error": "invalid data"}), 400

        try:
            amount = parse_amount(data.get("amount"))
            start_date = parse_start_date(data.get("startDate"))
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

        subscription = Subscription(
            user_id=g.user_id,
            type=subscription_type,
            amount=amount,
            category=category,
            description=description,
            frequency=frequency,
            start_date=start_date,
            active=True,
        )
        db.session.add(subscription)
        db.session.commit()
        sync_user_subscriptions_for_user(g.user_id)
        return jsonify({"ok": True, "id": subscription.id}), 201

    @app.route("/api/subscriptions/<int:sub_id>", methods=["DELETE"])
    @login_required
    def delete_subscription(sub_id):
        subscription = db.session.get(Subscription, sub_id)
        if not subscription or subscription.user_id != g.user_id:
            return jsonify({"error": "not found"}), 404
        db.session.delete(subscription)
        db.session.commit()
        return jsonify({"ok": True})

    @app.route("/api/subscriptions/<int:sub_id>", methods=["PUT"])
    @login_required
    def update_subscription(sub_id):
        subscription = db.session.get(Subscription, sub_id)
        if not subscription or subscription.user_id != g.user_id:
            return jsonify({"error": "not found"}), 404

        data = get_json_body()

        if "type" in data:
            if data["type"] not in VALID_ENTRY_TYPES:
                return jsonify({"error": "invalid type"}), 400
            subscription.type = data["type"]

        if "amount" in data:
            try:
                subscription.amount = parse_amount(data.get("amount"))
            except ValueError as exc:
                return jsonify({"error": str(exc)}), 400

        if "category" in data:
            subscription.category = (data.get("category") or "").strip() or subscription.category

        if "description" in data:
            subscription.description = (data.get("description") or "").strip() or subscription.description

        if "frequency" in data:
            if data["frequency"] not in VALID_SUBSCRIPTION_FREQUENCIES:
                return jsonify({"error": "invalid frequency"}), 400
            subscription.frequency = data["frequency"]

        if "startDate" in data:
            try:
                subscription.start_date = parse_start_date(data.get("startDate"))
            except ValueError as exc:
                return jsonify({"error": str(exc)}), 400

        db.session.commit()
        sync_user_subscriptions_for_user(g.user_id)
        return jsonify({"ok": True})

    @app.route("/api/subscriptions/<int:sub_id>/toggle", methods=["POST"])
    @login_required
    def toggle_subscription(sub_id):
        subscription = db.session.get(Subscription, sub_id)
        if not subscription or subscription.user_id != g.user_id:
            return jsonify({"error": "not found"}), 404
        subscription.active = not subscription.active
        db.session.commit()
        if subscription.active:
            sync_user_subscriptions_for_user(g.user_id)
        return jsonify({"ok": True, "active": subscription.active})

    @app.route("/api/budgets", methods=["GET"])
    @login_required
    def get_budgets():
        budgets = Budget.query.filter_by(user_id=g.user_id).order_by(Budget.category.asc()).all()
        return jsonify([serialize_budget(budget) for budget in budgets])

    @app.route("/api/budgets", methods=["POST"])
    @login_required
    def set_budget():
        data = get_json_body()
        category = (data.get("category") or "").strip()
        if not category:
            return jsonify({"error": "category is required"}), 400

        try:
            amount = parse_amount(data.get("amount"))
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

        budget = Budget.query.filter_by(user_id=g.user_id, category=category).first()
        if budget:
            budget.amount = amount
        else:
            budget = Budget(user_id=g.user_id, category=category, amount=amount)
            db.session.add(budget)

        db.session.commit()
        return jsonify({"ok": True})

    @app.route("/api/budgets/<string:category>", methods=["DELETE"])
    @login_required
    def delete_budget(category):
        budget = Budget.query.filter_by(user_id=g.user_id, category=category).first()
        if not budget:
            return jsonify({"error": "not found"}), 404
        db.session.delete(budget)
        db.session.commit()
        return jsonify({"ok": True})

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_frontend(path):
        if path.startswith("api/"):
            abort(404)

        static_dir = current_app.static_folder
        if path and os.path.exists(os.path.join(static_dir, path)):
            return send_from_directory(static_dir, path)

        return send_from_directory(static_dir, "login.html")

    with app.app_context():
        ensure_database_ready()

    return app


app = create_app()


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG") == "1",
    )
