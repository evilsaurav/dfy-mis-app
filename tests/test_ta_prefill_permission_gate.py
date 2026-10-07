import os
import sys
from pathlib import Path
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import main
from backend.routers.travel_allowance import check_prefill_permission

client = TestClient(main.app)

@pytest.fixture(autouse=True)
def cleanup():
    main.app.dependency_overrides.clear()
    from backend.core.cache import cache
    cache.clear()
    yield
    main.app.dependency_overrides.clear()
    cache.clear()


def test_prefill_access_list_super_admin_only():
    # 1. Unauthenticated -> 401
    res = client.get("/admin/ta/prefill-access-list")
    assert res.status_code == 401

    # 2. Sub-Admin -> 403 Forbidden
    with patch("backend.core.security.get_current_user", return_value={"id": 10, "username": "sub1", "role": "SUB_ADMIN", "allowed_districts": ["Gaya"]}):
        res = client.get("/admin/ta/prefill-access-list")
        assert res.status_code == 403
        assert "super admin" in res.json()["detail"].lower()

    # 3. Main Incharge -> 403 Forbidden
    with patch("backend.core.security.get_current_user", return_value={"id": 11, "username": "inc1", "role": "MAIN_INCHARGE", "allowed_districts": ["All"]}):
        res = client.get("/admin/ta/prefill-access-list")
        assert res.status_code == 403

    # 4. Super Admin -> 200 OK
    mock_admin_users = [
        {"id": 1, "user_id": "u_super", "username": "superadmin", "name": "Super Admin", "role": "SUPER_ADMIN", "can_prefill": True, "granted_by": None, "updated_at": None},
        {"id": 2, "user_id": "u_sub1", "username": "sub_gaya", "name": "Sub Gaya", "role": "SUB_ADMIN", "can_prefill": False, "granted_by": None, "updated_at": None},
    ]
    with patch("backend.core.security.get_current_user", return_value={"id": 1, "username": "superadmin", "role": "SUPER_ADMIN", "allowed_districts": ["All"]}):
        with patch("backend.routers.travel_allowance.pg_execute_raw", return_value=mock_admin_users):
            res = client.get("/admin/ta/prefill-access-list")
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "success"
            assert len(data["data"]) == 2
            assert data["data"][0]["username"] == "superadmin"
            assert data["data"][1]["can_prefill"] is False


def test_grant_and_revoke_prefill_access_rbac():
    # 1. Non-Super Admin attempting to grant -> 403
    with patch("backend.core.security.get_current_user", return_value={"id": 10, "username": "sub1", "role": "SUB_ADMIN", "allowed_districts": ["Gaya"]}):
        res = client.post("/admin/ta/grant-prefill-access", json={"admin_id": 2})
        assert res.status_code == 403

    # 2. Non-Super Admin attempting to revoke -> 403
    with patch("backend.core.security.get_current_user", return_value={"id": 10, "username": "sub1", "role": "SUB_ADMIN", "allowed_districts": ["Gaya"]}):
        res = client.post("/admin/ta/revoke-prefill-access", json={"admin_id": 2})
        assert res.status_code == 403

    # 3. Super Admin granting prefill -> 200
    with patch("backend.core.security.get_current_user", return_value={"id": 1, "username": "superadmin", "name": "Super Admin", "role": "SUPER_ADMIN", "allowed_districts": ["All"]}):
        with patch("backend.routers.travel_allowance.pg_execute_raw", return_value=None) as mock_pg:
            res = client.post("/admin/ta/grant-prefill-access", json={"admin_id": 2})
            assert res.status_code == 200
            assert res.json()["status"] == "success"
            assert "granted" in res.json()["message"].lower()

    # 4. Super Admin revoking prefill -> 200
    with patch("backend.core.security.get_current_user", return_value={"id": 1, "username": "superadmin", "name": "Super Admin", "role": "SUPER_ADMIN", "allowed_districts": ["All"]}):
        with patch("backend.routers.travel_allowance.pg_execute_raw", return_value=None) as mock_pg:
            res = client.post("/admin/ta/revoke-prefill-access", json={"admin_id": 2})
            assert res.status_code == 200
            assert res.json()["status"] == "success"
            assert "revoked" in res.json()["message"].lower()


def test_prefill_endpoint_permission_gate():
    prefill_payload = {
        "month": "2026-09",
        "district": "Gaya",
        "staff_name": "Ramesh Kumar",
        "staff_key": "ramesh_kumar"
    }

    # 1. Main Incharge trying to prefill -> 403
    with patch("backend.core.security.get_current_user", return_value={"id": 11, "username": "inc1", "role": "MAIN_INCHARGE", "allowed_districts": ["All"]}):
        res = client.post("/admin/ta/prefill", json=prefill_payload)
        assert res.status_code == 403
        assert "read-only" in res.json()["detail"].lower()

    # 2. Sub-Admin without prefill access -> 403
    with patch("backend.core.security.get_current_user", return_value={"id": 20, "username": "sub_unauth", "role": "SUB_ADMIN", "allowed_districts": ["Gaya"]}):
        with patch("backend.routers.travel_allowance.pg_execute_raw", return_value=[]):
            res = client.post("/admin/ta/prefill", json=prefill_payload)
            assert res.status_code == 403
            assert "contact super admin" in res.json()["detail"].lower()

    # 3. Super Admin -> bypasses prefill gate
    with patch("backend.core.security.get_current_user", return_value={"id": 1, "username": "superadmin", "role": "SUPER_ADMIN", "allowed_districts": ["All"]}):
        with patch("backend.routers.travel_allowance.pg_execute_raw", return_value=[]):
            res = client.post("/admin/ta/prefill", json=prefill_payload)
            # Response may be 200 (or prefill result), NOT 403
            assert res.status_code == 200
            assert res.json()["status"] == "success"

    # 4. Authorized Sub-Admin (with can_prefill=True from DB) -> bypasses gate
    with patch("backend.core.security.get_current_user", return_value={"id": 25, "username": "sub_authorized", "role": "SUB_ADMIN", "allowed_districts": ["Gaya"]}):
        def pg_dispatcher(query, params=None, fetch=False):
            if "travel_allowance_permissions" in query:
                return [{"can_prefill": True}]
            return []

        with patch("backend.routers.travel_allowance.pg_execute_raw", side_effect=pg_dispatcher):
            res = client.post("/admin/ta/prefill", json=prefill_payload)
            assert res.status_code == 200
            assert res.json()["status"] == "success"
