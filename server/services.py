from extensions import db
from models import Category, Entry, Pouch, PouchTransfer, Subscription, User


def count_admin_users():
    return User.query.filter_by(is_admin=True).count()


def get_pouch_balance(user_id, pouch_id):
    transfers = PouchTransfer.query.filter_by(user_id=user_id, pouch_id=pouch_id).all()
    balance = 0.0

    for transfer in transfers:
        if transfer.direction == "to_pouch":
            balance += float(transfer.amount)
        elif transfer.direction == "from_pouch":
            balance -= float(transfer.amount)

    return round(balance, 2)


def delete_user_related_data(user):
    PouchTransfer.query.filter_by(user_id=user.id).delete(synchronize_session=False)
    Pouch.query.filter_by(user_id=user.id).delete(synchronize_session=False)
    Subscription.query.filter_by(user_id=user.id).delete(synchronize_session=False)
    Category.query.filter_by(user_id=user.id).delete(synchronize_session=False)
    Entry.query.filter_by(user_id=user.id).delete(synchronize_session=False)
    db.session.delete(user)
