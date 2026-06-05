from flask import Blueprint, jsonify

import compat
from auth import login_required
from extensions import db
from models import Category, Entry, Pouch, PouchTransfer, Subscription, User
from request_utils import get_json_body, get_user_or_404, require_admin
from serializers import (
    serialize_category,
    serialize_datetime,
    serialize_entry,
    serialize_pouch,
    serialize_pouch_transfer,
    serialize_subscription,
)
from services import count_admin_users, delete_user_related_data
from validators import normalize_username, validate_password, validate_username


bp = Blueprint("admin", __name__)


@bp.route("/api/admin/users", methods=["GET"])
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
                "google_linked": bool(user.google_sub),
                "google_email": user.google_email,
                "google_name": user.google_name,
                "google_given_name": user.google_given_name,
                "google_family_name": user.google_family_name,
                "google_picture": user.google_picture,
                "google_linked_at": serialize_datetime(user.google_linked_at),
                "created_at": serialize_datetime(user.created_at),
                "entry_count": entry_count,
                "total_income": float(total_income),
                "total_expense": float(total_expense),
            }
        )

    return jsonify({"users": users_list})


@bp.route("/api/admin/users/<int:user_id>", methods=["DELETE"])
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


@bp.route("/api/admin/users/<int:user_id>/toggle-admin", methods=["POST"])
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


@bp.route("/api/admin/users/<int:user_id>", methods=["PUT"])
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


@bp.route("/api/admin/users/<int:user_id>/reset-password", methods=["POST"])
@login_required
def admin_reset_user_password(user_id):
    require_admin()
    target_user = db.session.get(User, user_id)
    if not target_user:
        return jsonify({"error": "user not found"}), 404

    data = get_json_body()
    new_password = data.get("newPassword", "")

    if not new_password:
        return jsonify({"error": "new password is required"}), 400

    password_error = validate_password(new_password)
    if password_error:
        return jsonify({"error": password_error}), 400

    target_user.set_password(new_password)
    db.session.commit()
    return jsonify({"ok": True, "message": "Password reset successfully"})


@bp.route("/api/admin/users/<int:user_id>/export", methods=["GET"])
@login_required
def admin_export_user_data(user_id):
    require_admin()
    target_user = get_user_or_404(user_id)

    entries = Entry.query.filter_by(user_id=target_user.id).order_by(Entry.date.desc(), Entry.id.desc()).all()
    categories = Category.query.filter_by(user_id=target_user.id).order_by(Category.type.asc(), Category.name.asc()).all()
    subscriptions = Subscription.query.filter_by(user_id=target_user.id).order_by(Subscription.start_date.desc()).all()
    pouches = Pouch.query.filter_by(user_id=target_user.id).order_by(Pouch.created_at.asc(), Pouch.id.asc()).all()
    pouch_transfers = (
        PouchTransfer.query.filter_by(user_id=target_user.id)
        .order_by(PouchTransfer.date.desc(), PouchTransfer.id.desc())
        .all()
    )
    transfers_by_pouch = {}
    for transfer in pouch_transfers:
        transfers_by_pouch.setdefault(transfer.pouch_id, []).append(transfer)

    return jsonify(
        {
            "exportedAt": serialize_datetime(compat.utcnow()),
            "profile": {
                "id": target_user.id,
                "username": target_user.username,
                "is_admin": target_user.is_admin,
                "createdAt": serialize_datetime(target_user.created_at),
            },
            "entries": [serialize_entry(entry) for entry in entries],
            "categories": [serialize_category(category) for category in categories],
            "subscriptions": [serialize_subscription(subscription) for subscription in subscriptions],
            "pouches": [serialize_pouch(pouch, transfers_by_pouch.get(pouch.id, [])) for pouch in pouches],
            "pouchTransfers": [serialize_pouch_transfer(transfer) for transfer in pouch_transfers],
        }
    )
