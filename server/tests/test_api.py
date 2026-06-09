import datetime as dt
import os
import sys
import tempfile
from pathlib import Path

import bcrypt
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app as app_module
from app import Category, Entry, Pouch, PouchTransfer, Subscription, User, create_app, db


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
    assert profile_payload["googleLinked"] is False


def test_password_auth_disabled_blocks_manual_login_and_registration(app, client):
    response, payload = register_user(client)
    assert response.status_code == 200
    assert payload["username"] == "alice"

    app.config["ALLOW_PASSWORD_AUTH"] = False

    login_response = client.post("/api/login", json={"username": "alice", "password": "Password123"})
    assert login_response.status_code == 403
    assert login_response.get_json()["error"] == "password login is disabled"

    register_response = client.post("/api/register", json={"username": "bob", "password": "Password123"})
    assert register_response.status_code == 403
    assert register_response.get_json()["error"] == "password registration is disabled"


def test_google_login_creates_user_and_can_login_again(app, client, monkeypatch):
    google_profile = {
        "sub": "google-user-123",
        "email": "google.user@example.com",
        "email_verified": True,
        "name": "Google User",
        "given_name": "Google",
        "family_name": "User",
        "picture": "https://example.com/google-user.png",
    }

    monkeypatch.setattr(app_module, "verify_google_credential", lambda credential: google_profile)
    app.config["GOOGLE_CLIENT_ID"] = "test-google-client"

    response = client.post("/api/auth/google", json={"credential": "valid-google-token"})
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["username"] == "google.user"
    assert "token" in payload

    second_response = client.post("/api/auth/google", json={"credential": "valid-google-token"})
    second_payload = second_response.get_json()

    assert second_response.status_code == 200
    assert second_payload["username"] == "google.user"

    with app.app_context():
        assert User.query.count() == 1
        user = User.query.filter_by(username="google.user").first()
        assert user.google_sub == "google-user-123"
        assert user.google_email == "google.user@example.com"
        assert user.google_name == "Google User"
        assert user.google_given_name == "Google"
        assert user.google_family_name == "User"
        assert user.google_picture == "https://example.com/google-user.png"


def test_authenticated_user_can_link_google_account(app, client, monkeypatch):
    _, payload = register_user(client, username="linked")
    google_profile = {
        "sub": "google-link-123",
        "email": "linked@example.com",
        "email_verified": True,
        "name": "Linked User",
        "given_name": "Linked",
        "family_name": "User",
        "picture": "https://example.com/linked.png",
    }

    monkeypatch.setattr(app_module, "verify_google_credential", lambda credential: google_profile)
    app.config["GOOGLE_CLIENT_ID"] = "test-google-client"

    response = client.post(
        "/api/profile/google-link",
        headers=auth_headers(payload["token"]),
        json={"credential": "valid-google-token"},
    )
    link_payload = response.get_json()

    assert response.status_code == 200
    assert link_payload["googleLinked"] is True
    assert link_payload["googleEmail"] == "linked@example.com"
    assert link_payload["googleName"] == "Linked User"
    assert link_payload["googleGivenName"] == "Linked"
    assert link_payload["googleFamilyName"] == "User"
    assert link_payload["googlePicture"] == "https://example.com/linked.png"

    profile_response = client.get("/api/profile", headers=auth_headers(payload["token"]))
    profile_payload = profile_response.get_json()
    assert profile_response.status_code == 200
    assert profile_payload["googleLinked"] is True
    assert profile_payload["googleEmail"] == "linked@example.com"
    assert profile_payload["googleName"] == "Linked User"
    assert profile_payload["googleGivenName"] == "Linked"
    assert profile_payload["googleFamilyName"] == "User"
    assert profile_payload["googlePicture"] == "https://example.com/linked.png"


def test_google_link_rejects_account_already_linked_to_another_user(app, client, monkeypatch):
    google_profile = {
        "sub": "shared-google-sub",
        "email": "shared@example.com",
        "email_verified": True,
        "name": "Shared Google",
    }

    with app.app_context():
        linked_user = User(username="already-linked")
        linked_user.set_password("Password123")
        linked_user.google_sub = google_profile["sub"]
        db.session.add(linked_user)
        db.session.commit()

    _, payload = register_user(client, username="second")
    monkeypatch.setattr(app_module, "verify_google_credential", lambda credential: google_profile)
    app.config["GOOGLE_CLIENT_ID"] = "test-google-client"

    response = client.post(
        "/api/profile/google-link",
        headers=auth_headers(payload["token"]),
        json={"credential": "valid-google-token"},
    )

    assert response.status_code == 409
    assert "already linked" in response.get_json()["error"]


def test_register_rejects_weak_password(client):
    response = client.post("/api/register", json={"username": "alice", "password": "abcdefg"})

    assert response.status_code == 400
    assert "password" in response.get_json()["error"]


def test_login_rate_limit_blocks_repeated_bad_passwords(app, client):
    app.config["LOGIN_RATE_LIMIT_ATTEMPTS"] = 2
    app.config["LOGIN_RATE_LIMIT_WINDOW_SECONDS"] = 60
    register_user(client)

    first_response, _ = login_user(client, "alice", "WrongPass123")
    second_response, _ = login_user(client, "alice", "WrongPass123")
    blocked_response, blocked_payload = login_user(client, "alice", "WrongPass123")

    assert first_response.status_code == 401
    assert second_response.status_code == 401
    assert blocked_response.status_code == 429
    assert "too many attempts" in blocked_payload["error"].lower()


def test_login_success_clears_rate_limit_failures(app, client):
    app.config["LOGIN_RATE_LIMIT_ATTEMPTS"] = 2
    app.config["LOGIN_RATE_LIMIT_WINDOW_SECONDS"] = 60
    register_user(client)

    bad_response, _ = login_user(client, "alice", "WrongPass123")
    good_response, _ = login_user(client, "alice", "Password123")
    second_bad_response, _ = login_user(client, "alice", "WrongPass123")

    assert bad_response.status_code == 401
    assert good_response.status_code == 200
    assert second_bad_response.status_code == 401


def test_api_responses_include_security_headers(client):
    response = client.get("/api/ping")

    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "same-origin"
    assert response.headers["Cache-Control"] == "no-store"


def test_version_endpoint_exposes_build_info(app, client, monkeypatch):
    monkeypatch.setenv("ACCOUNTA_REVISION", "abcdef123456")
    monkeypatch.setenv("ACCOUNTA_CREATED", "2026-06-03T20:00:00Z")

    response = client.get("/api/version")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["revision"] == "abcdef123456"
    assert payload["created"] == "2026-06-03T20:00:00Z"
    assert payload["source"] == "https://github.com/Loyyd/accounta"


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


def test_category_color_must_be_hex(client):
    _, payload = register_user(client)
    token = payload["token"]

    response = client.post(
        "/api/categories",
        headers=auth_headers(token),
        json={"name": "Unsafe", "type": "expense", "color": "red;background:url(javascript:alert(1))"},
    )

    assert response.status_code == 400
    assert "hex" in response.get_json()["error"]


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


def test_admin_can_reset_user_password(app, client):
    member_id = None

    with app.app_context():
        admin = User(username="admin", is_admin=True)
        admin.set_password("AdminPass123")
        member = User(username="member", is_admin=False)
        member.set_password("MemberPass123")
        db.session.add_all([admin, member])
        db.session.commit()
        member_id = member.id

    login_response, admin_payload = login_user(client, "admin", "AdminPass123")
    assert login_response.status_code == 200

    reset_response = client.post(
        f"/api/admin/users/{member_id}/reset-password",
        headers=auth_headers(admin_payload["token"]),
        json={
            "newPassword": "TempPass456",
        },
    )

    assert reset_response.status_code == 200

    old_login_response, _ = login_user(client, "member", "MemberPass123")
    new_login_response, new_login_payload = login_user(client, "member", "TempPass456")

    assert old_login_response.status_code == 401
    assert new_login_response.status_code == 200
    assert new_login_payload["username"] == "member"


def test_admin_reset_rejects_weak_password(app, client):
    member_id = None

    with app.app_context():
        admin = User(username="admin", is_admin=True)
        admin.set_password("AdminPass123")
        member = User(username="member", is_admin=False)
        member.set_password("MemberPass123")
        db.session.add_all([admin, member])
        db.session.commit()
        member_id = member.id

    _, admin_payload = login_user(client, "admin", "AdminPass123")
    reset_response = client.post(
        f"/api/admin/users/{member_id}/reset-password",
        headers=auth_headers(admin_payload["token"]),
        json={"newPassword": "short"},
    )

    assert reset_response.status_code == 400
    assert "password" in reset_response.get_json()["error"]


def test_admin_users_includes_google_profile_details(app, client):
    with app.app_context():
        admin = User(username="admin", is_admin=True)
        admin.set_password("AdminPass123")
        member = User(username="member", is_admin=False)
        member.set_password("MemberPass123")
        member.google_sub = "google-member"
        member.google_email = "member@example.com"
        member.google_name = "Member Example"
        member.google_given_name = "Member"
        member.google_family_name = "Example"
        member.google_picture = "https://example.com/member.png"
        db.session.add_all([admin, member])
        db.session.commit()

    login_response, admin_payload = login_user(client, "admin", "AdminPass123")
    assert login_response.status_code == 200

    response = client.get("/api/admin/users", headers=auth_headers(admin_payload["token"]))
    payload = response.get_json()

    assert response.status_code == 200
    member_payload = next(user for user in payload["users"] if user["username"] == "member")
    assert member_payload["google_linked"] is True
    assert member_payload["google_email"] == "member@example.com"
    assert member_payload["google_name"] == "Member Example"
    assert member_payload["google_given_name"] == "Member"
    assert member_payload["google_family_name"] == "Example"
    assert member_payload["google_picture"] == "https://example.com/member.png"
    assert member_payload["is_admin"] is False


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
                Pouch(user_id=user.id, name="Savings"),
            ]
        )
        db.session.commit()

        pouch = Pouch.query.filter_by(user_id=user.id, name="Savings").first()
        db.session.add(
            PouchTransfer(
                user_id=user.id,
                pouch_id=pouch.id,
                direction="to_pouch",
                amount=50,
                description="Starter transfer",
                date=dt.datetime(2026, 4, 2),
            )
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
        assert Pouch.query.count() == 0
        assert PouchTransfer.query.count() == 0


def test_pouch_lifecycle_transfers_and_export(client):
    _, payload = register_user(client, username="saver")
    token = payload["token"]

    create_pouch_response = client.post(
        "/api/pouches",
        headers=auth_headers(token),
        json={"name": "Savings Account"},
    )
    create_pouch_payload = create_pouch_response.get_json()

    assert create_pouch_response.status_code == 201
    assert create_pouch_payload["name"] == "Savings Account"
    assert create_pouch_payload["balance"] == 0

    pouch_id = create_pouch_payload["id"]

    first_transfer = client.post(
        f"/api/pouches/{pouch_id}/transfers",
        headers=auth_headers(token),
        json={
            "direction": "to_pouch",
            "amount": 125,
            "description": "Monthly savings",
            "date": "2026-04-10",
        },
    )
    second_transfer = client.post(
        f"/api/pouches/{pouch_id}/transfers",
        headers=auth_headers(token),
        json={
            "direction": "from_pouch",
            "amount": 25,
            "description": "Moved back",
            "date": "2026-04-12",
        },
    )

    assert first_transfer.status_code == 201
    assert second_transfer.status_code == 201

    list_pouches_response = client.get("/api/pouches", headers=auth_headers(token))
    list_pouches_payload = list_pouches_response.get_json()

    assert list_pouches_response.status_code == 200
    assert len(list_pouches_payload) == 1
    assert list_pouches_payload[0]["balance"] == 100
    assert list_pouches_payload[0]["totalIn"] == 125
    assert list_pouches_payload[0]["totalOut"] == 25
    assert list_pouches_payload[0]["transferCount"] == 2

    list_transfers_response = client.get("/api/pouch-transfers", headers=auth_headers(token))
    list_transfers_payload = list_transfers_response.get_json()

    assert list_transfers_response.status_code == 200
    assert len(list_transfers_payload) == 2
    assert list_transfers_payload[0]["direction"] == "from_pouch"
    assert list_transfers_payload[1]["direction"] == "to_pouch"

    insufficient_response = client.post(
        f"/api/pouches/{pouch_id}/transfers",
        headers=auth_headers(token),
        json={
            "direction": "from_pouch",
            "amount": 500,
            "description": "Too much",
            "date": "2026-04-13",
        },
    )

    assert insufficient_response.status_code == 400
    assert "insufficient pouch balance" in insufficient_response.get_json()["error"]

    export_response = client.get("/api/export", headers=auth_headers(token))
    export_payload = export_response.get_json()

    assert export_response.status_code == 200
    assert export_payload["pouches"][0]["name"] == "Savings Account"
    assert export_payload["pouches"][0]["balance"] == 100
    assert len(export_payload["pouchTransfers"]) == 2

    delete_transfer_response = client.delete(
        f"/api/pouch-transfers/{list_transfers_payload[0]['id']}",
        headers=auth_headers(token),
    )

    assert delete_transfer_response.status_code == 200

    refreshed_pouches_response = client.get("/api/pouches", headers=auth_headers(token))
    refreshed_pouches_payload = refreshed_pouches_response.get_json()

    assert refreshed_pouches_response.status_code == 200
    assert refreshed_pouches_payload[0]["balance"] == 125


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
