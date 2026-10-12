import sys
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from main import app
from backend.core.security import create_access_token

client = TestClient(app)

def test_auth_me_reflects_post_token_permission_change():
    """
    Simulates the exact Backlog #89 regression scenario (ritik scenario):
    1. Token is issued at login when user has can_prefill = False.
    2. Permission is updated in the database after token issuance (can_prefill = True).
    3. Calling GET /admin/auth/me with the ORIGINAL token returns the NEW permission.
    """
    initial_user = {
        "user_id": "test_ritik",
        "username": "test_ritik",
        "name": "Ritik Test",
        "role": "SUB_ADMIN",
        "allowed_districts": ["Patna", "Gaya"],
        "status": "ACTIVE",
        "can_prefill": False,
        "can_manage_staff": False
    }
    # Create token at login time
    token = create_access_token(initial_user)

    # Later: DB row is updated in PostgreSQL (can_prefill is now True)
    fresh_db_user = {
        "id": 999,
        "user_id": "test_ritik",
        "username": "test_ritik",
        "name": "Ritik Test",
        "role": "SUB_ADMIN",
        "allowed_districts": ["Patna", "Gaya"],
        "status": "ACTIVE",
        "password": "hashed_secret_password",
        "can_prefill": True,
        "can_manage_staff": True,
        "can_edit_targets": False,
        "can_export_reports": True,
        "can_edit_patient_ids": False
    }

    with patch("backend.routers.rbac_audit.fetch_admin_user", return_value=fresh_db_user):
        res = client.get("/admin/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert data["success"] is True
    assert "user" in data
    # Verified: Permission is freshly reflected
    assert data["user"]["can_prefill"] is True
    assert data["user"]["can_manage_staff"] is True
    # Verified: Password must be stripped
    assert "password" not in data["user"]
    assert data["user"]["username"] == "test_ritik"


def test_auth_me_inactive_user_returns_401():
    """
    Deactivated/disabled user must be rejected with 401, triggering frontend auto-logout.
    """
    user_payload = {
        "user_id": "disabled_admin",
        "username": "disabled_admin",
        "name": "Disabled Admin",
        "role": "SUB_ADMIN",
        "status": "ACTIVE"
    }
    token = create_access_token(user_payload)

    # In DB, account was deactivated
    disabled_db_user = {
        "user_id": "disabled_admin",
        "username": "disabled_admin",
        "status": "INACTIVE"
    }

    with patch("backend.routers.rbac_audit.fetch_admin_user", return_value=disabled_db_user):
        res = client.get("/admin/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert res.status_code == 401, f"Expected 401 for inactive account, got {res.status_code}"
    assert "disabled" in res.json().get("detail", "").lower() or "not found" in res.json().get("detail", "").lower()


def test_auth_me_deleted_user_returns_401():
    """
    User deleted from PostgreSQL must return 401.
    """
    user_payload = {
        "user_id": "deleted_admin",
        "username": "deleted_admin",
        "name": "Deleted Admin",
        "role": "SUB_ADMIN"
    }
    token = create_access_token(user_payload)

    with patch("backend.routers.rbac_audit.fetch_admin_user", return_value=None):
        res = client.get("/admin/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert res.status_code == 401
    assert "Account not found or disabled" in res.json().get("detail", "")


def test_auth_me_invalid_and_missing_token_returns_401():
    """
    Invalid, expired, or missing tokens must be rejected with 401 by security dependency.
    """
    # Missing token
    res_none = client.get("/admin/auth/me")
    assert res_none.status_code == 401

    # Malformed token
    res_bad = client.get("/admin/auth/me", headers={"Authorization": "Bearer bad.token.here"})
    assert res_bad.status_code == 401
