import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch
import jwt

import main
from main import app, JWT_SECRET_KEY, JWT_ALGORITHM
from backend.routers.admin_feed import edit_patient_id, EditIdRequest


def make_admin_token(role="SUPER_ADMIN", allowed_districts=None, username="admin", name="Saurav Kumar"):
    payload = {
        "user_id": username,
        "username": username,
        "name": name,
        "role": role,
        "allowed_districts": allowed_districts or ["All"],
        "exp": datetime.now(timezone.utc) + timedelta(days=1),
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


@pytest.mark.asyncio
async def test_admin_edit_id_with_custom_name_succeeds():
    """
    Asserts:
    1. Valid admin token + edited_by='Saurav Kumar' (caller's real name) -> 200 OK (No 401 logout!)
    2. Valid admin token + edited_by='Admin' -> 200 OK (backward compatible)
    """
    token_saurav = make_admin_token(name="Saurav Kumar")
    admin_ctx_saurav = {
        "user_id": "admin",
        "username": "admin",
        "name": "Saurav Kumar",
        "role": "SUPER_ADMIN",
        "allowed_districts": ["All"]
    }

    mock_pg_report = {
        "id": 101,
        "working_place": "Patna",
        "fo_name": "Ramesh Kumar",
        "date_of_reporting": "2026-10-04",
        "legacy_count_notifications": 1
    }

    def mock_pg_execute_raw(sql, params=None, fetch=False):
        sql_upper = sql.upper()
        if "FROM DAILY_FIELD_REPORTS" in sql_upper:
            return [dict(mock_pg_report)] if fetch else True
        if "FROM REPORT_KPI_ENTRIES" in sql_upper:
            if "SELECT 1" in sql_upper:
                return [] if fetch else False
            return [{"patient_id": "111111111"}] if fetch else True
        if "INSERT INTO REPORT_KPI_ENTRIES" in sql_upper or "UPDATE REPORT_KPI_ENTRIES" in sql_upper:
            return True
        if "UPDATE DAILY_FIELD_REPORTS" in sql_upper:
            return True
        return [] if fetch else True

    with patch("backend.routers.admin_feed.pg_execute_raw", side_effect=mock_pg_execute_raw), \
         patch("backend.routers.admin_feed.pg_fetch_one", return_value=None), \
         patch("backend.routers.admin_feed.check_patient_id_90day_notification_duplicate", return_value=None):

        # Case 1: Frontend sends caller's name 'Saurav Kumar'
        req1 = EditIdRequest(
            working_place="Patna",
            fo_name="Ramesh Kumar",
            date="2026-10-04",
            category="notification_ids",
            action="add",
            new_id="999999999",
            edited_by="Saurav Kumar"
        )
        res1 = await edit_patient_id(req1, admin=admin_ctx_saurav)
        assert res1["success"] is True

        # Case 2: Frontend sends legacy string 'Admin'
        admin_ctx_admin = {
            "user_id": "admin",
            "username": "admin",
            "name": "Admin",
            "role": "SUPER_ADMIN",
            "allowed_districts": ["All"]
        }
        req2 = EditIdRequest(
            working_place="Patna",
            fo_name="Ramesh Kumar",
            date="2026-10-04",
            category="notification_ids",
            action="add",
            new_id="888888888",
            edited_by="Admin"
        )
        res2 = await edit_patient_id(req2, admin=admin_ctx_admin)
        assert res2["success"] is True


@pytest.mark.asyncio
async def test_field_officer_edit_id_pin_auth():
    """
    Asserts:
    3. Koi token nahi + valid PIN + edited_by='Ramesh Kumar' -> 200 OK (FO path)
    4. Koi token nahi + PIN missing -> 401 (FO ko PIN chahiye)
    """
    from fastapi import HTTPException

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    now_iso = datetime.now(timezone.utc).isoformat()
    mock_pg_report = {
        "id": 102,
        "working_place": "Gaya",
        "fo_name": "Ramesh Kumar",
        "date_of_reporting": today_str,
        "timestamp_completed": now_iso,
        "legacy_count_notifications": 1
    }

    mock_staff_row = {
        "id": 55,
        "name": "Ramesh Kumar",
        "district": "Gaya",
        "pin": "1234"
    }

    def mock_pg_execute_raw(sql, params=None, fetch=False):
        sql_upper = sql.upper()
        if "FROM STAFF_DIRECTORY" in sql_upper:
            return [dict(mock_staff_row)] if fetch else True
        if "FROM DAILY_FIELD_REPORTS" in sql_upper:
            return [dict(mock_pg_report)] if fetch else True
        if "FROM REPORT_KPI_ENTRIES" in sql_upper:
            if "SELECT 1" in sql_upper:
                return [] if fetch else False
            return [{"patient_id": "111111111"}] if fetch else True
        if "INSERT INTO REPORT_KPI_ENTRIES" in sql_upper or "UPDATE REPORT_KPI_ENTRIES" in sql_upper:
            return True
        if "UPDATE DAILY_FIELD_REPORTS" in sql_upper:
            return True
        return [] if fetch else True

    with patch("backend.routers.admin_feed.pg_execute_raw", side_effect=mock_pg_execute_raw), \
         patch("backend.routers.admin_feed.pg_fetch_one", return_value=None), \
         patch("backend.routers.admin_feed.check_patient_id_90day_notification_duplicate", return_value=None):

        # Case 3: FO path with valid PIN and no admin token
        req3 = EditIdRequest(
            working_place="Gaya",
            fo_name="Ramesh Kumar",
            date=today_str,
            category="notification_ids",
            action="add",
            new_id="777777777",
            edited_by="FO",
            pin="1234"
        )
        res3 = await edit_patient_id(req3, admin=None)
        assert res3["success"] is True

        # Case 4: FO path with missing PIN -> must raise 401
        req4 = EditIdRequest(
            working_place="Gaya",
            fo_name="Ramesh Kumar",
            date="2026-10-04",
            category="notification_ids",
            action="add",
            new_id="666666666",
            edited_by="FO",
            pin=""
        )
        with pytest.raises(HTTPException) as exc_info:
            await edit_patient_id(req4, admin=None)
        assert exc_info.value.status_code == 401
        assert "PIN authorization is required" in exc_info.value.detail
