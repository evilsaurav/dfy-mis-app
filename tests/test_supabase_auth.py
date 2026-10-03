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
        "allowed_districts": "Patna, Nalanda",
        "permissions": "{\"can_view_dashboard\": true}"
    }
    norm = _normalize_admin_user_row(raw)
    assert norm["user_id"] == "1"
    assert norm["username"] == "patna_admin"
    assert norm["password"] == "hash123"
    assert norm["allowed_districts"] == ["Patna", "Nalanda"]
    assert norm["permissions"] == {"can_view_dashboard": True}

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
    mock_supabase_client = MagicMock()
    mock_res = MagicMock()
    mock_res.data = [{
        "user_id": "subadmin_gaya",
        "username": "subadmin_gaya",
        "password": hash_password("gaya2026"),
        "role": "SUB_ADMIN",
        "allowed_districts": ["Gaya"],
        "permissions": {"can_view_dashboard": True},
        "status": "ACTIVE",
        "name": "Gaya Incharge"
    }]
    mock_supabase_client.table().select().or_().limit().execute.return_value = mock_res

    with patch("backend.core.supabase.get_supabase_client", return_value=mock_supabase_client):
        req = AdminUserLoginReq(username="subadmin_gaya", password="gaya2026")
        mock_request = MagicMock()
        mock_request.headers = {}
        mock_request.client.host = "127.0.0.1"

        res = await admin_user_login(req, mock_request)
        assert res["success"] is True
        assert res["user"]["username"] == "subadmin_gaya"
        assert res["user"]["role"] == "SUB_ADMIN"
