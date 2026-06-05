import datetime as dt


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


def serialize_pouch_transfer(transfer):
    return {
        "id": transfer.id,
        "pouchId": transfer.pouch_id,
        "direction": transfer.direction,
        "amount": float(transfer.amount),
        "description": transfer.description,
        "date": serialize_datetime(transfer.date),
    }


def serialize_pouch(pouch, transfers=None):
    pouch_transfers = transfers or []
    total_in = sum(float(transfer.amount) for transfer in pouch_transfers if transfer.direction == "to_pouch")
    total_out = sum(float(transfer.amount) for transfer in pouch_transfers if transfer.direction == "from_pouch")
    balance = total_in - total_out

    return {
        "id": pouch.id,
        "name": pouch.name,
        "createdAt": serialize_datetime(pouch.created_at),
        "balance": balance,
        "totalIn": total_in,
        "totalOut": total_out,
        "transferCount": len(pouch_transfers),
    }
