import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient
from pathlib import Path
import sys
from datetime import datetime, timezone, timedelta

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import main
from main import (
    app,
    cache,
    ENABLE_IN_MEMORY_DERIVATION,
    create_access_token,
)

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_cache():
    cache.clear()
    yield
    cache.clear()

def make_admin_token(role: str = "SUPER_ADMIN", allowed_districts=None, username="test_admin", user_id="admin_123"):
    return create_access_token({
        "user_id": user_id,
        "username": username,
        "name": "Test Admin",
        "role": role,
        "allowed_districts": allowed_districts if allowed_districts is not None else ["All"]
    })

def test_attendance_fast_path_zero_firestore_reads():
    """Verify get_today_attendance derives attendance from get_raw_monthly_reports without streaming daily_field_reports from Firestore."""
    mock_staff = [
        {"district": "Patna", "name": "Alok Kumar", "is_active": True, "designation": "Field Officer"},
        {"district": "Patna", "name": "Bikash Singh", "is_active": True, "designation": "Field Officer"}
    ]
    mock_reports = [
        {
            "id": "patna_alok_2026-10-15",
            "working_place": "Patna",
            "fo_name": "Alok Kumar",
            "date_of_reporting": "2026-10-15",
            "timestamp": "2026-10-15T18:30:00+05:30",
            "submission_count": 2,
            "total_km": 25,
            "patient_ids": ["P1", "P2"]
        }
    ]

    with patch("main.get_cached_staff_directory_raw", AsyncMock(return_value=mock_staff)), \
         patch("main.get_raw_monthly_reports", AsyncMock(return_value=mock_reports)) as mock_raw_monthly, \
         patch("main.db") as mock_db:

        def mock_col(name):
            if name == "daily_field_reports":
                raise AssertionError("Should not stream Firestore collection 'daily_field_reports' in fast path!")
            col = MagicMock()
            col.where.return_value = col
            col.stream.return_value = []
            return col

        mock_db.collection.side_effect = mock_col

        token = make_admin_token()
        resp = client.get("/admin/today-attendance?date=2026-10-15", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["date"] == "2026-10-15"
        assert data["total_staff"] == 2
        assert data["submitted_count"] == 1
        assert data["submitted_full_count"] == 1
        assert data["submitted_partial_count"] == 0
        assert data["missing_count"] == 1
        assert data["submitted_fos"][0]["fo_name"] == "Alok Kumar"
        assert data["missing_fos"][0]["fo_name"] == "Bikash Singh"
        mock_raw_monthly.assert_called_with("2026-10")

def test_month_start_boundary_transition_guard():
    """Verify for day <= 2 (e.g. 2026-10-01), candidate pool extends with previous month reports (2026-09)."""
    mock_staff = [
        {"district": "Patna", "name": "Alok Kumar", "is_active": True, "designation": "Field Officer"},
        {"district": "Patna", "name": "Chandan Verma", "is_active": True, "designation": "Field Officer"}
    ]
    # Alok submitted on Oct 1 at 09:30 AM (before 12:00 PM cutoff on Day 1). By Rule 1, this belongs to Sep 30.
    oct_reports = [
        {
            "id": "patna_alok_2026-10-01",
            "working_place": "Patna",
            "fo_name": "Alok Kumar",
            "date_of_reporting": "2026-10-01",
            "timestamp": "2026-10-01T09:30:00+05:30",
            "submission_count": 1,
            "total_km": 10
        },
        {
            "id": "patna_chandan_2026-10-01",
            "working_place": "Patna",
            "fo_name": "Chandan Verma",
            "date_of_reporting": "2026-10-01",
            "timestamp": "2026-10-01T15:00:00+05:30",
            "submission_count": 1,
            "total_km": 12
        }
    ]
    sep_reports = [
        {
            "id": "patna_sep_old",
            "working_place": "Patna",
            "fo_name": "Old Staff",
            "date_of_reporting": "2026-09-20"
        }
    ]

    async def mock_get_monthly(month, **kwargs):
        if month == "2026-10":
            return list(oct_reports)
        elif month == "2026-09":
            return list(sep_reports)
        return []

    with patch("main.get_cached_staff_directory_raw", AsyncMock(return_value=mock_staff)), \
         patch("main.get_raw_monthly_reports", AsyncMock(side_effect=mock_get_monthly)) as mock_raw_monthly, \
         patch("main.db") as mock_db:

        mock_col = MagicMock()
        mock_col.where.return_value = mock_col
        mock_col.stream.return_value = []
        mock_db.collection.return_value = mock_col

        token = make_admin_token()
        resp = client.get("/admin/today-attendance?date=2026-10-01", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200, resp.text
        data = resp.json()

        # Both 2026-10 and 2026-09 should have been queried
        called_months = [call.args[0] for call in mock_raw_monthly.call_args_list]
        assert "2026-10" in called_months
        assert "2026-09" in called_months

        # Alok submitted on Day 1 before cutoff (09:30 AM < 12:00 PM), so excluded from Oct 1 attendance
        # Chandan submitted at 15:00, so included in Oct 1 attendance
        assert data["submitted_count"] == 1
        assert data["submitted_fos"][0]["fo_name"] == "Chandan Verma"
        assert any(m["fo_name"] == "Alok Kumar" for m in data["missing_fos"])

def test_month_end_boundary_transition_guard():
    """Verify for day >= 28 (e.g. 2026-09-30), candidate pool extends with next month reports (2026-10)."""
    mock_staff = [
        {"district": "Patna", "name": "Alok Kumar", "is_active": True, "designation": "Field Officer"}
    ]
    sep_reports = []
    # Alok submitted on Oct 1 morning at 09:30 AM as next-day submission for Sep 30
    oct_reports = [
        {
            "id": "patna_alok_next_day",
            "working_place": "Patna",
            "fo_name": "Alok Kumar",
            "date_of_reporting": "2026-10-01",
            "timestamp": "2026-10-01T09:30:00+05:30",
            "submission_count": 1,
            "total_km": 15
        }
    ]

    async def mock_get_monthly(month, **kwargs):
        if month == "2026-09":
            return list(sep_reports)
        elif month == "2026-10":
            return list(oct_reports)
        return []

    with patch("main.get_cached_staff_directory_raw", AsyncMock(return_value=mock_staff)), \
         patch("main.get_raw_monthly_reports", AsyncMock(side_effect=mock_get_monthly)) as mock_raw_monthly, \
         patch("main.db") as mock_db:

        mock_col = MagicMock()
        mock_col.where.return_value = mock_col
        mock_col.stream.return_value = []
        mock_db.collection.return_value = mock_col

        token = make_admin_token()
        resp = client.get("/admin/today-attendance?date=2026-09-30", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200, resp.text
        data = resp.json()

        # Both 2026-09 and 2026-10 should have been queried
        called_months = [call.args[0] for call in mock_raw_monthly.call_args_list]
        assert "2026-09" in called_months
        assert "2026-10" in called_months

        # Alok's Oct 1 09:30 AM report (< 12:00 PM Day 1 cutoff) is recognized as next-day morning submission for Sep 30
        assert data["submitted_count"] == 1
        assert data["submitted_fos"][0]["fo_name"] == "Alok Kumar"
        assert data["submitted_fos"][0]["is_next_day"] is True

def test_attendance_auto_failover_on_error():
    """Verify if in-memory derivation raises an unexpected exception, it silently fails over to legacy Firestore path."""
    mock_staff = [
        {"district": "Patna", "name": "Alok Kumar", "is_active": True, "designation": "Field Officer"}
    ]
    legacy_doc = MagicMock()
    legacy_doc.id = "doc123"
    legacy_doc.to_dict.return_value = {
        "working_place": "Patna",
        "fo_name": "Alok Kumar",
        "date_of_reporting": "2026-10-15",
        "timestamp": "2026-10-15T16:00:00+05:30",
        "submission_count": 1,
        "total_km": 10
    }

    with patch("main.get_cached_staff_directory_raw", AsyncMock(return_value=mock_staff)), \
         patch("main.get_raw_monthly_reports", AsyncMock(side_effect=RuntimeError("Master ledger memory failure"))), \
         patch("main.db") as mock_db:

        mock_col = MagicMock()
        mock_col.where.return_value = mock_col
        mock_col.stream.return_value = [legacy_doc]
        mock_db.collection.return_value = mock_col

        token = make_admin_token()
        resp = client.get("/admin/today-attendance?date=2026-10-15", headers={"Authorization": f"Bearer {token}"})
        # Must not crash with HTTP 500!
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["total_staff"] == 1
        assert data["submitted_count"] == 1
        assert data["submitted_fos"][0]["fo_name"] == "Alok Kumar"

def test_attendance_kill_switch_disabled():
    """Verify when ENABLE_IN_MEMORY_DERIVATION is False, requests route directly to legacy Firestore query."""
    mock_staff = [
        {"district": "Patna", "name": "Alok Kumar", "is_active": True, "designation": "Field Officer"}
    ]
    legacy_doc = MagicMock()
    legacy_doc.id = "legacy_doc_1"
    legacy_doc.to_dict.return_value = {
        "working_place": "Patna",
        "fo_name": "Alok Kumar",
        "date_of_reporting": "2026-10-15",
        "timestamp": "2026-10-15T17:00:00+05:30",
        "submission_count": 1,
        "total_km": 12
    }

    with patch("main.ENABLE_IN_MEMORY_DERIVATION", False), \
         patch("main.get_cached_staff_directory_raw", AsyncMock(return_value=mock_staff)), \
         patch("main.get_raw_monthly_reports", AsyncMock()) as mock_raw_monthly, \
         patch("main.db") as mock_db:

        mock_col = MagicMock()
        mock_col.where.return_value = mock_col
        mock_col.stream.return_value = [legacy_doc]
        mock_db.collection.return_value = mock_col

        token = make_admin_token()
        resp = client.get("/admin/today-attendance?date=2026-10-15", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200, resp.text
        # get_raw_monthly_reports should NEVER be called when kill switch is disabled
        mock_raw_monthly.assert_not_called()
        # db.collection should be called for Firestore streaming
        assert mock_db.collection.called

def test_attendance_subadmin_rbac_isolation():
    """Verify Sub-Admin only sees staff and reports for their allowed districts, and unauthorized districts get 403."""
    mock_staff = [
        {"district": "Patna", "name": "Alok Kumar", "is_active": True, "designation": "Field Officer"},
        {"district": "Gaya", "name": "Sunil Kumar", "is_active": True, "designation": "Field Officer"}
    ]
    mock_reports = [
        {
            "id": "patna_rep",
            "working_place": "Patna",
            "fo_name": "Alok Kumar",
            "date_of_reporting": "2026-10-15",
            "timestamp": "2026-10-15T18:00:00+05:30",
            "submission_count": 1,
            "total_km": 10
        },
        {
            "id": "gaya_rep",
            "working_place": "Gaya",
            "fo_name": "Sunil Kumar",
            "date_of_reporting": "2026-10-15",
            "timestamp": "2026-10-15T18:00:00+05:30",
            "submission_count": 1,
            "total_km": 15
        }
    ]

    with patch("main.get_cached_staff_directory_raw", AsyncMock(return_value=mock_staff)), \
         patch("main.get_raw_monthly_reports", AsyncMock(return_value=mock_reports)), \
         patch("main.db") as mock_db:

        mock_col = MagicMock()
        mock_col.where.return_value = mock_col
        mock_col.stream.return_value = []
        mock_db.collection.return_value = mock_col

        # Sub-Admin with only Patna permission
        token_sub = make_admin_token(role="SUB_ADMIN", allowed_districts=["Patna"], username="subadmin_patna")

        # 1. Normal query without district filter -> only sees Patna
        resp = client.get("/admin/today-attendance?date=2026-10-15", headers={"Authorization": f"Bearer {token_sub}"})
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["total_staff"] == 1
        assert data["submitted_count"] == 1
        assert data["submitted_fos"][0]["district"] == "Patna"
        assert not any(s["district"] == "Gaya" for s in data["submitted_fos"])

        # 2. Sub-Admin requests unauthorized district "Gaya" -> 403 Forbidden
        resp_forbidden = client.get("/admin/today-attendance?date=2026-10-15&districts=Gaya", headers={"Authorization": f"Bearer {token_sub}"})
        assert resp_forbidden.status_code == 403

        # 3. Sub-Admin with empty allowed districts [] -> returns empty list without leaking any district's staff
        token_empty_sub = make_admin_token(role="SUB_ADMIN", allowed_districts=[], username="subadmin_empty")
        resp_empty = client.get("/admin/today-attendance?date=2026-10-15", headers={"Authorization": f"Bearer {token_empty_sub}"})
        assert resp_empty.status_code == 200, resp_empty.text
        data_empty = resp_empty.json()
        assert data_empty["total_staff"] == 0
        assert data_empty["submitted_count"] == 0
        assert len(data_empty["submitted_fos"]) == 0
        assert len(data_empty["missing_fos"]) == 0

def test_attendance_user_scoped_cache_key():
    """Verify attendance cache keys are user-scoped so different sub-admins don't see each other's cached responses."""
    mock_staff = [
        {"district": "Patna", "name": "Alok Kumar", "is_active": True, "designation": "Field Officer"},
        {"district": "Gaya", "name": "Sunil Kumar", "is_active": True, "designation": "Field Officer"}
    ]
    mock_reports = [
        {
            "id": "patna_rep",
            "working_place": "Patna",
            "fo_name": "Alok Kumar",
            "date_of_reporting": "2026-10-15",
            "timestamp": "2026-10-15T18:00:00+05:30",
            "submission_count": 1,
            "total_km": 10
        },
        {
            "id": "gaya_rep",
            "working_place": "Gaya",
            "fo_name": "Sunil Kumar",
            "date_of_reporting": "2026-10-15",
            "timestamp": "2026-10-15T18:00:00+05:30",
            "submission_count": 1,
            "total_km": 15
        }
    ]

    with patch("main.get_cached_staff_directory_raw", AsyncMock(return_value=mock_staff)), \
         patch("main.get_raw_monthly_reports", AsyncMock(return_value=mock_reports)), \
         patch("main.db") as mock_db:

        mock_col = MagicMock()
        mock_col.where.return_value = mock_col
        mock_col.stream.return_value = []
        mock_db.collection.return_value = mock_col

        token_patna = make_admin_token(role="SUB_ADMIN", allowed_districts=["Patna"], username="sub_patna", user_id="user_patna")
        token_gaya = make_admin_token(role="SUB_ADMIN", allowed_districts=["Gaya"], username="sub_gaya", user_id="user_gaya")

        resp1 = client.get("/admin/today-attendance?date=2026-10-15", headers={"Authorization": f"Bearer {token_patna}"})
        assert resp1.status_code == 200
        data1 = resp1.json()
        assert data1["submitted_fos"][0]["district"] == "Patna"

        resp2 = client.get("/admin/today-attendance?date=2026-10-15", headers={"Authorization": f"Bearer {token_gaya}"})
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert data2["submitted_fos"][0]["district"] == "Gaya"
