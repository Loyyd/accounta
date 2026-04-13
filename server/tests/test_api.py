import datetime as dt
import os
import sys
import tempfile
from pathlib import Path

import bcrypt
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app as app_module
from app import Budget, Category, Entry, Subscription, User, create_app, db


@pytest.fixture()
def app():
    fd, db_path = tempfile.mkstemp()
    os.close(fd)

    app = create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": f"sqlite:///{db_path}",
            "SECRET_KEY": "test-secret",
            "JWT_EXP_SECONDS": 3600,
        }
    )

    with app.app_context():
        db.drop_all()
        db.create_all()

    yield app

    if os.path.exists(db_path):
        os.unlink(db_path)


@pytest.fixture()
def client(app):
    return app.test_client()


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def register_user(client, username="alice", password="Password123"):
    response = client.post("/api/register", json={"username": username, "password": password})
    return response, response.get_json()


def login_user(client, username, password):
    response = client.post("/api/login", json={"username": username, "password": password})
    return response, response.get_json()


def test_register_login_and_profile_flow(client):
    response, payload = register_user(client)

    assert response.status_code == 200
    assert payload["username"] == "alice"
    assert "token" in payload

    profile_response = client.get("/api/profile", headers=auth_headers(payload["token"]))
    profile_payload = profile_response.get_json()

    assert profile_response.status_code == 200
    assert profile_payload["username"] == "alice"
    assert profile_payload["is_admin"] is False
    assert profile_payload["createdAt"].endswith("Z")


def test_register_rejects_weak_password(client):
    response = client.post("/api/register", json={"username": "alice", "password": "abcdefg"})

    assert response.status_code == 400
    assert "password" in response.get_json()["error"]


def test_entries_export_and_date_serialization(client):
    _, payload = register_user(client)
    token = payload["token"]

    create_response = client.post(
        "/api/entries",
        headers=auth_headers(token),
        json={
            "type": "expense",
            "description": "Coffee",
            "amount": 4.5,
            "category": "Food",
            "date": "2026-04-01",
        },
    )
    assert create_response.status_code == 201

    list_response = client.get("/api/entries", headers=auth_headers(token))
    list_payload = list_response.get_json()
    assert list_response.status_code == 200
    assert list_payload[0]["date"].endswith("Z")

    export_response = client.get("/api/export", headers=auth_headers(token))
    export_payload = export_response.get_json()
    assert export_response.status_code == 200
    assert export_payload["entries"][0]["description"] == "Coffee"
    assert export_payload["profile"]["username"] == "alice"


def test_legacy_bcrypt_hash_can_still_login(app, client):
    with app.app_context():
        user = User(username="legacy", is_admin=False)
        user.password_hash = bcrypt.hashpw(b"Password123", bcrypt.gensalt()).decode("utf-8")
        db.session.add(user)
        db.session.commit()

    response, payload = login_user(client, "legacy", "Password123")

    assert response.status_code == 200
    assert payload["username"] == "legacy"


def test_last_admin_cannot_delete_account(app, client):
    with app.app_context():
        admin = User(username="admin", is_admin=True)
        admin.set_password("Password123")
        db.session.add(admin)
        db.session.commit()

    response, payload = login_user(client, "admin", "Password123")
    delete_response = client.delete(
        "/api/profile",
        headers=auth_headers(payload["token"]),
        json={"confirmText": "admin"},
    )

    assert response.status_code == 200
    assert delete_response.status_code == 400
    assert "last admin" in delete_response.get_json()["error"]


def test_account_deletion_removes_related_records(app, client):
    _, payload = register_user(client, username="cleanup")
    token = payload["token"]

    with app.app_context():
        user = User.query.filter_by(username="cleanup").first()
        db.session.add_all(
            [
                Entry(
                    user_id=user.id,
                    type="expense",
                    description="Coffee",
                    amount=4.5,
                    category="Food",
                    date=dt.datetime(2026, 4, 1),
                ),
                Category(user_id=user.id, type="expense", name="Food", color="#123456"),
                Subscription(
                    user_id=user.id,
                    type="expense",
                    amount=12,
                    category="Food",
                    description="Lunch plan",
                    frequency="monthly",
                    start_date=dt.date(2026, 1, 1),
                    active=True,
                ),
                Budget(user_id=user.id, category="Food", amount=100),
            ]
        )
        db.session.commit()

    response = client.delete(
        "/api/profile",
        headers=auth_headers(token),
        json={"confirmText": "cleanup"},
    )

    assert response.status_code == 200

    with app.app_context():
        assert User.query.count() == 0
        assert Entry.query.count() == 0
        assert Category.query.count() == 0
        assert Subscription.query.count() == 0
        assert Budget.query.count() == 0


def test_authenticated_requests_materialize_due_subscription_entries(app, client, monkeypatch):
    _, payload = register_user(client, username="subscriber")
    token = payload["token"]
    monkeypatch.setattr(app_module, "utcnow", lambda: dt.datetime(2026, 4, 13, 12, 0, 0))

    response = client.post(
        "/api/subscriptions",
        headers=auth_headers(token),
        json={
            "type": "expense",
            "amount": 19.99,
            "category": "Software",
            "description": "Design Tool",
            "frequency": "monthly",
            "startDate": "2026-01-31",
        },
    )
    assert response.status_code == 201

    first_list_response = client.get("/api/entries", headers=auth_headers(token))
    second_list_response = client.get("/api/entries", headers=auth_headers(token))

    assert first_list_response.status_code == 200
    assert second_list_response.status_code == 200

    first_payload = first_list_response.get_json()
    second_payload = second_list_response.get_json()

    assert len(first_payload) == 3
    assert len(second_payload) == 3
    assert [entry["date"][:10] for entry in first_payload] == ["2026-03-31", "2026-02-28", "2026-01-31"]


def test_missing_secret_key_uses_generated_value(monkeypatch):
    fd, db_path = tempfile.mkstemp()
    os.close(fd)

    monkeypatch.delenv("SECRET_KEY", raising=False)

    temp_app = create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": f"sqlite:///{db_path}",
            "JWT_EXP_SECONDS": 3600,
        }
    )

    try:
        assert temp_app.config["SECRET_KEY"] != "dev-secret"
        assert len(temp_app.config["SECRET_KEY"]) >= 32
    finally:
        if os.path.exists(db_path):
            os.unlink(db_path)
