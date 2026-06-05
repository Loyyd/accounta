from flask import Blueprint, g, jsonify

from auth import login_required
from extensions import db
from models import Pouch, PouchTransfer
from request_utils import get_json_body
from serializers import serialize_pouch, serialize_pouch_transfer
from services import get_pouch_balance
from validators import VALID_TRANSFER_DIRECTIONS, parse_amount, parse_entry_date


bp = Blueprint("pouches", __name__)


@bp.route("/api/pouches", methods=["GET"])
@login_required
def get_pouches():
    pouches = Pouch.query.filter_by(user_id=g.user_id).order_by(Pouch.created_at.asc(), Pouch.id.asc()).all()
    transfers = (
        PouchTransfer.query.filter_by(user_id=g.user_id)
        .order_by(PouchTransfer.date.desc(), PouchTransfer.id.desc())
        .all()
    )
    transfers_by_pouch = {}
    for transfer in transfers:
        transfers_by_pouch.setdefault(transfer.pouch_id, []).append(transfer)

    return jsonify([serialize_pouch(pouch, transfers_by_pouch.get(pouch.id, [])) for pouch in pouches])


@bp.route("/api/pouches", methods=["POST"])
@login_required
def add_pouch():
    data = get_json_body()
    name = (data.get("name") or "").strip()

    if not name:
        return jsonify({"error": "name is required"}), 400
    if len(name) > 80:
        return jsonify({"error": "name must be 80 characters or fewer"}), 400

    existing = Pouch.query.filter_by(user_id=g.user_id, name=name).first()
    if existing:
        return jsonify({"error": "pouch already exists"}), 400

    pouch = Pouch(user_id=g.user_id, name=name)
    db.session.add(pouch)
    db.session.commit()
    return jsonify(serialize_pouch(pouch, [])), 201


@bp.route("/api/pouches/<int:pouch_id>", methods=["DELETE"])
@login_required
def delete_pouch(pouch_id):
    pouch = db.session.get(Pouch, pouch_id)
    if not pouch or pouch.user_id != g.user_id:
        return jsonify({"error": "not found"}), 404

    PouchTransfer.query.filter_by(user_id=g.user_id, pouch_id=pouch.id).delete(synchronize_session=False)
    db.session.delete(pouch)
    db.session.commit()
    return jsonify({"ok": True})


@bp.route("/api/pouch-transfers", methods=["GET"])
@login_required
def get_pouch_transfers():
    transfers = (
        PouchTransfer.query.filter_by(user_id=g.user_id)
        .order_by(PouchTransfer.date.desc(), PouchTransfer.id.desc())
        .all()
    )
    return jsonify([serialize_pouch_transfer(transfer) for transfer in transfers])


@bp.route("/api/pouches/<int:pouch_id>/transfers", methods=["POST"])
@login_required
def create_pouch_transfer(pouch_id):
    pouch = db.session.get(Pouch, pouch_id)
    if not pouch or pouch.user_id != g.user_id:
        return jsonify({"error": "not found"}), 404

    data = get_json_body()
    direction = data.get("direction")
    description = (data.get("description") or "").strip() or "Pouch transfer"

    if direction not in VALID_TRANSFER_DIRECTIONS:
        return jsonify({"error": "invalid transfer direction"}), 400

    try:
        amount = parse_amount(data.get("amount"))
        transfer_date = parse_entry_date(data.get("date"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if direction == "from_pouch" and amount > get_pouch_balance(g.user_id, pouch.id):
        return jsonify({"error": "insufficient pouch balance"}), 400

    transfer = PouchTransfer(
        user_id=g.user_id,
        pouch_id=pouch.id,
        direction=direction,
        amount=amount,
        description=description,
        date=transfer_date,
    )
    db.session.add(transfer)
    db.session.commit()
    return jsonify(serialize_pouch_transfer(transfer)), 201


@bp.route("/api/pouch-transfers/<int:transfer_id>", methods=["DELETE"])
@login_required
def delete_pouch_transfer(transfer_id):
    transfer = db.session.get(PouchTransfer, transfer_id)
    if not transfer or transfer.user_id != g.user_id:
        return jsonify({"error": "not found"}), 404

    db.session.delete(transfer)
    db.session.commit()
    return jsonify({"ok": True})
