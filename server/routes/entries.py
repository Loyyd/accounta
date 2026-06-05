from flask import Blueprint, g, jsonify

from auth import login_required
from extensions import db
from models import Entry
from request_utils import get_json_body
from serializers import serialize_entry
from validators import VALID_ENTRY_TYPES, parse_amount, parse_entry_date


bp = Blueprint("entries", __name__)


@bp.route("/api/entries", methods=["GET"])
@login_required
def list_entries():
    entries = Entry.query.filter_by(user_id=g.user_id).order_by(Entry.date.desc(), Entry.id.desc()).all()
    return jsonify([serialize_entry(entry) for entry in entries])


@bp.route("/api/entries", methods=["POST"])
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


@bp.route("/api/entries/<int:entry_id>", methods=["DELETE"])
@login_required
def delete_entry(entry_id):
    entry = db.session.get(Entry, entry_id)
    if not entry or entry.user_id != g.user_id:
        return jsonify({"error": "not found"}), 404
    db.session.delete(entry)
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/entries/<int:entry_id>", methods=["PUT"])
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
