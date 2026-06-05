from flask import Blueprint, g, jsonify

from auth import login_required
from extensions import db
from models import Subscription
from request_utils import get_json_body
from serializers import serialize_subscription
from subscriptions import sync_user_subscriptions_for_user
from validators import VALID_ENTRY_TYPES, VALID_SUBSCRIPTION_FREQUENCIES, parse_amount, parse_start_date


bp = Blueprint("subscriptions", __name__)


@bp.route("/api/subscriptions", methods=["GET"])
@login_required
def get_subscriptions():
    subscriptions = Subscription.query.filter_by(user_id=g.user_id).order_by(Subscription.start_date.desc()).all()
    return jsonify([serialize_subscription(subscription) for subscription in subscriptions])


@bp.route("/api/subscriptions", methods=["POST"])
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


@bp.route("/api/subscriptions/<int:sub_id>", methods=["DELETE"])
@login_required
def delete_subscription(sub_id):
    subscription = db.session.get(Subscription, sub_id)
    if not subscription or subscription.user_id != g.user_id:
        return jsonify({"error": "not found"}), 404
    db.session.delete(subscription)
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/subscriptions/<int:sub_id>", methods=["PUT"])
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


@bp.route("/api/subscriptions/<int:sub_id>/toggle", methods=["POST"])
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
