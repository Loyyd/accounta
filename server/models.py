import bcrypt
from werkzeug.security import check_password_hash, generate_password_hash

from extensions import db
from time_utils import utcnow


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    google_sub = db.Column(db.String(255), unique=True, nullable=True)
    google_email = db.Column(db.String(255), nullable=True)
    google_name = db.Column(db.String(255), nullable=True)
    google_given_name = db.Column(db.String(255), nullable=True)
    google_family_name = db.Column(db.String(255), nullable=True)
    google_picture = db.Column(db.String(1024), nullable=True)
    google_linked_at = db.Column(db.DateTime, nullable=True)
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


class Pouch(db.Model):
    __tablename__ = "pouches"
    __table_args__ = (
        db.UniqueConstraint("user_id", "name", name="uq_pouch_user_name"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    name = db.Column(db.String(80), nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)


class PouchTransfer(db.Model):
    __tablename__ = "pouch_transfers"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    pouch_id = db.Column(db.Integer, db.ForeignKey("pouches.id"), nullable=False)
    direction = db.Column(db.String(20), nullable=False)
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    description = db.Column(db.String(255), nullable=False)
    date = db.Column(db.DateTime, default=utcnow, nullable=False)
