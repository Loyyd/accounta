from sqlalchemy import inspect, text

from extensions import db


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

    if "google_sub" not in columns:
        db.session.execute(text("ALTER TABLE users ADD COLUMN google_sub VARCHAR(255)"))
        db.session.commit()

    if "google_email" not in columns:
        db.session.execute(text("ALTER TABLE users ADD COLUMN google_email VARCHAR(255)"))
        db.session.commit()

    if "google_name" not in columns:
        db.session.execute(text("ALTER TABLE users ADD COLUMN google_name VARCHAR(255)"))
        db.session.commit()

    if "google_given_name" not in columns:
        db.session.execute(text("ALTER TABLE users ADD COLUMN google_given_name VARCHAR(255)"))
        db.session.commit()

    if "google_family_name" not in columns:
        db.session.execute(text("ALTER TABLE users ADD COLUMN google_family_name VARCHAR(255)"))
        db.session.commit()

    if "google_picture" not in columns:
        db.session.execute(text("ALTER TABLE users ADD COLUMN google_picture VARCHAR(1024)"))
        db.session.commit()

    if "google_linked_at" not in columns:
        db.session.execute(text("ALTER TABLE users ADD COLUMN google_linked_at DATETIME"))
        db.session.commit()

    db.session.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_sub ON users (google_sub)"))
    db.session.commit()


def ensure_database_ready():
    db.create_all()
    ensure_user_schema()
