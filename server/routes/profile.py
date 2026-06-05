from flask import Blueprint, jsonify

import compat
from auth import apply_google_profile, login_required
from extensions import db
from models import Category, Entry, Pouch, PouchTransfer, Subscription, User
from rate_limits import check_auth_rate_limit, clear_auth_rate_limit, rate_limit_identity, record_auth_rate_limit_attempt
from request_utils import get_current_user, get_json_body
from serializers import (
    serialize_category,
    serialize_datetime,
    serialize_entry,
    serialize_pouch,
    serialize_pouch_transfer,
    serialize_subscription,
)
from services import count_admin_users, delete_user_related_data
from validators import validate_password


bp = Blueprint("profile", __name__)


@bp.route("/api/profile", methods=["GET"])
@login_required
def profile():
    user = get_current_user()
    return jsonify(
        {
            "username": user.username,
            "id": user.id,
            "is_admin": user.is_admin,
            "createdAt": serialize_datetime(user.created_at),
            "googleLinked": bool(user.google_sub),
            "googleEmail": user.google_email,
            "googleName": user.google_name,
            "googleGivenName": user.google_given_name,
            "googleFamilyName": user.google_family_name,
            "googlePicture": user.google_picture,
            "googleLinkedAt": serialize_datetime(user.google_linked_at),
        }
    )


@bp.route("/api/profile/google-link", methods=["POST"])
@login_required
def link_google_account():
    user = get_current_user()
    profile = compat.verify_google_credential(get_json_body().get("credential"))

    existing = User.query.filter_by(google_sub=profile["sub"]).first()
    if existing and existing.id != user.id:
        return jsonify({"error": "that Google account is already linked to another account"}), 409

    apply_google_profile(user, profile)
    db.session.commit()

    return jsonify(
        {
            "ok": True,
            "googleLinked": True,
            "googleEmail": user.google_email,
            "googleName": user.google_name,
            "googleGivenName": user.google_given_name,
            "googleFamilyName": user.google_family_name,
            "googlePicture": user.google_picture,
            "googleLinkedAt": serialize_datetime(user.google_linked_at),
        }
    )


@bp.route("/api/profile/password", methods=["PUT"])
@login_required
def change_password():
    user = get_current_user()
    data = get_json_body()
    current_password = data.get("currentPassword", "")
    new_password = data.get("newPassword", "")
    rate_identity = rate_limit_identity("password", user.id)
    check_auth_rate_limit("password", rate_identity)

    if not current_password or not new_password:
        return jsonify({"error": "current password and new password are required"}), 400

    if not user.verify_password(current_password):
        record_auth_rate_limit_attempt("password", rate_identity)
        return jsonify({"error": "current password is incorrect"}), 401

    if current_password == new_password:
        return jsonify({"error": "new password must be different from the current password"}), 400

    password_error = validate_password(new_password)
    if password_error:
        return jsonify({"error": password_error}), 400

    user.set_password(new_password)
    db.session.commit()
    clear_auth_rate_limit("password", rate_identity)
    return jsonify({"ok": True, "message": "Password updated successfully"})


@bp.route("/api/profile", methods=["DELETE"])
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


@bp.route("/api/export", methods=["GET"])
@login_required
def export_account_data():
    user = get_current_user()
    entries = Entry.query.filter_by(user_id=user.id).order_by(Entry.date.desc(), Entry.id.desc()).all()
    categories = Category.query.filter_by(user_id=user.id).order_by(Category.type.asc(), Category.name.asc()).all()
    subscriptions = Subscription.query.filter_by(user_id=user.id).order_by(Subscription.start_date.desc()).all()
    pouches = Pouch.query.filter_by(user_id=user.id).order_by(Pouch.created_at.asc(), Pouch.id.asc()).all()
    pouch_transfers = (
        PouchTransfer.query.filter_by(user_id=user.id)
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
                "id": user.id,
                "username": user.username,
                "is_admin": user.is_admin,
                "createdAt": serialize_datetime(user.created_at),
            },
            "entries": [serialize_entry(entry) for entry in entries],
            "categories": [serialize_category(category) for category in categories],
            "subscriptions": [serialize_subscription(subscription) for subscription in subscriptions],
            "pouches": [serialize_pouch(pouch, transfers_by_pouch.get(pouch.id, [])) for pouch in pouches],
            "pouchTransfers": [serialize_pouch_transfer(transfer) for transfer in pouch_transfers],
        }
    )
