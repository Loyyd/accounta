from flask import Blueprint, g, jsonify, request

from auth import login_required
from extensions import db
from models import Category, Entry, Subscription
from request_utils import get_json_body
from validators import VALID_ENTRY_TYPES, normalize_category_color


bp = Blueprint("categories", __name__)


@bp.route("/api/categories", methods=["GET"])
@login_required
def get_categories():
    categories = Category.query.filter_by(user_id=g.user_id).order_by(Category.name.asc()).all()
    result = {"expense": [], "income": []}
    for category in categories:
        result[category.type].append({"name": category.name, "color": category.color})
    return jsonify(result)


@bp.route("/api/categories", methods=["POST"])
@login_required
def add_category():
    data = get_json_body()
    name = (data.get("name") or "").strip()
    category_type = data.get("type")
    try:
        color = normalize_category_color(data.get("color"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if not name or category_type not in VALID_ENTRY_TYPES:
        return jsonify({"error": "name and type are required"}), 400

    existing = Category.query.filter_by(user_id=g.user_id, type=category_type, name=name).first()
    if existing:
        return jsonify({"error": "category already exists"}), 400

    category = Category(user_id=g.user_id, type=category_type, name=name, color=color)
    db.session.add(category)
    db.session.commit()
    return jsonify({"ok": True, "id": category.id}), 201


@bp.route("/api/categories/<int:category_id>", methods=["DELETE"])
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


@bp.route("/api/categories/<int:category_id>", methods=["PUT"])
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
            category.name = name

    if "color" in data:
        try:
            category.color = normalize_category_color(data.get("color") or category.color)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    db.session.commit()
    return jsonify({"ok": True})
