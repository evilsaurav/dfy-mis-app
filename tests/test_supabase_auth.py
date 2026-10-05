import pytest
import asyncio
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from backend.core.supabase import fetch_admin_user, _normalize_admin_user_row
from backend.routers.rbac_audit import admin_user_login, AdminUserLoginReq
from backend.core.security import hash_password
from fastapi import HTTPException

def test_normalize_admin_user_row():
    raw = {
        "id": 1,
        "username": "patna_admin",
        "password_hash": "hash123",
        "role": "SUB_ADMIN",
        "has_all_districts": False,
        "district_names": ["Patna", "Nalanda"],
        "can_view_dashboard": True,
        "can_edit_targets": False,
        "can_manage_staff": False,
        "can_edit_patient_ids": False,
        "can_export_reports": True
    }
    norm = _normalize_admin_user_row(raw)
    assert norm["user_id"] == "1"
    assert norm["username"] == "patna_admin"
    assert norm["password"] == "hash123"
    assert norm["allowed_districts"] == ["Patna", "Nalanda"]
    assert norm["permissions"]["can_export_reports"] == True
    assert norm["permissions"]["can_edit_targets"] == False
    assert norm["permissions"]["can_view_audit_logs"] == False  # SUB_ADMIN role

    # Also test has_all_districts=True case (e.g. SUPER_ADMIN)
    raw2 = {
        "id": 2,
        "username": "admin",
        "password_hash": "hash456",
        "role": "SUPER_ADMIN",
        "has_all_districts": True,
        "district_names": [],
        "can_export_reports": True,
        "can_edit_targets": True,
        "can_manage_staff": True,
        "can_edit_patient_ids": True
    }
    norm2 = _normalize_admin_user_row(raw2)
    assert norm2["allowed_districts"] == ["All"]
    assert norm2["permissions"]["can_view_audit_logs"] == True  # SUPER_ADMIN role

def test_fetch_admin_user_fallback():
    user = fetch_admin_user("admin")
    assert user is not None
    assert user["username"] == "admin"
    assert user["role"] == "SUPER_ADMIN"
    assert user["status"] == "ACTIVE"

@pytest.mark.asyncio
async def test_admin_user_login_success():
    req = AdminUserLoginReq(username="admin", password="dfyadmin2026")
    mock_request = MagicMock()
    mock_request.headers = {}
    mock_request.client.host = "127.0.0.1"
    
    res = await admin_user_login(req, mock_request)
    assert res["success"] is True
    assert "token" in res
    assert res["user"]["username"] == "admin"
    assert "password" not in res["user"]

@pytest.mark.asyncio
async def test_admin_user_login_invalid_password():
    req = AdminUserLoginReq(username="admin", password="wrong_password_999")
    mock_request = MagicMock()
    mock_request.headers = {}
    mock_request.client.host = "127.0.0.1"
    
    with pytest.raises(HTTPException) as exc_info:
        await admin_user_login(req, mock_request)
    assert exc_info.value.status_code == 401

@pytest.mark.asyncio
async def test_admin_user_login_with_mocked_supabase():
    mock_row = {
        "id": 101,
        "user_id": "subadmin_gaya",
        "username": "subadmin_gaya",
        "name": "Gaya Incharge",
        "password_hash": hash_password("gaya2026"),
        "role": "SUB_ADMIN",
        "status": "ACTIVE",
        "has_all_districts": False,
        "district_names": ["Gaya"],
        "can_view_dashboard": True,
        "can_export_reports": True,
        "can_edit_patient_ids": False,
        "can_edit_targets": False,
        "can_manage_staff": False,
    }
    mock_cur = MagicMock()
    mock_cur.fetchone.return_value = mock_row
    mock_conn = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cur

    with patch("backend.core.supabase.get_db_connection") as mock_get_conn:
        mock_get_conn.return_value.__enter__.return_value = mock_conn

        # 1. Successful login
        req = AdminUserLoginReq(username="subadmin_gaya", password="gaya2026")
        mock_request = MagicMock()
        mock_request.headers = {}
        mock_request.client.host = "127.0.0.1"

        res = await admin_user_login(req, mock_request)
        assert res["success"] is True
        assert res["user"]["username"] == "subadmin_gaya"
        assert res["user"]["role"] == "SUB_ADMIN"
        assert res["user"]["allowed_districts"] == ["Gaya"]
        assert res["user"]["permissions"]["can_export_reports"] is True
        assert "token" in res

        # 2. Invalid password raises 401
        req_bad = AdminUserLoginReq(username="subadmin_gaya", password="wrong_password")
        with pytest.raises(HTTPException) as exc_bad:
            await admin_user_login(req_bad, mock_request)
        assert exc_bad.value.status_code == 401
