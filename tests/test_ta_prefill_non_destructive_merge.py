import sys
from pathlib import Path
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from main import app
from backend.routers.travel_allowance import _IN_MEMORY_PREFILL_PERMS

client = TestClient(app)


def test_ta_prefill_preserves_pre_launch_manual_days():
    """
    Scenario: App launched on 8th. Days 1-7 were manually entered by Sub-Admin.
    Prefill must NOT zero-out Days 1-7, and should populate Days 8+ from field reports.
    """
    _IN_MEMORY_PREFILL_PERMS["test_admin"] = {"can_prefill": True}

    existing_daily_logs = [
        {"day": 1, "date": "2026-10-01", "morning_km": 1000, "evening_km": 1050, "total_km": 50, "visited_names": "Clinic A", "is_manual_override": False},
        {"day": 2, "date": "2026-10-02", "morning_km": 1050, "evening_km": 1085, "total_km": 35, "visited_names": "Clinic B", "is_manual_override": False},
        {"day": 3, "date": "2026-10-03", "morning_km": 0, "evening_km": 0, "total_km": 0, "visited_names": "", "is_manual_override": False},
    ]

    mock_rep_rows = [
        # Only day 8 report exists from FC
        {
            "id": 101,
            "date_of_reporting": "2026-10-08",
            "morning_km": 2000,
            "evening_km": 2045,
            "total_km": 45,
            "fo_name": "Ramesh Kumar",
            "working_place": "Patna",
            "visited_names": "PHC Patna City",
            "remark": "Field visits"
        }
    ]

    mock_existing_roster = [
        {
            "id": 888,
            "month": "2026-10",
            "district": "Patna",
            "staff_name": "Ramesh Kumar",
            "staff_key": "ramesh_key",
            "deduction_amount": 0,
            "deduction_reason": "",
            "admin_remarks": "",
            "daily_logs": existing_daily_logs
        }
    ]

    def mock_pg_execute(sql, params=None, fetch=False):
        if "FROM travel_allowance_rosters" in sql:
            return mock_existing_roster
        if "FROM daily_field_reports" in sql:
            return mock_rep_rows
        return []

    with patch("backend.core.security.get_current_user", return_value={"id": "test_admin", "user_id": "test_admin", "role": "SUB_ADMIN", "allowed_districts": ["Patna"]}):
        with patch("backend.routers.travel_allowance.pg_execute_raw", side_effect=mock_pg_execute):
            res = client.post("/admin/ta/prefill", json={
                "month": "2026-10",
                "district": "Patna",
                "staff_name": "Ramesh Kumar"
            })

            assert res.status_code == 200, res.text
            data = res.json()["data"]
            days = data["days"]

            # Day 1 manual data must be retained (NOT 0.0)
            d1 = next(d for d in days if d["day"] == 1)
            assert d1["total_km"] == 50.0, f"Expected 50.0, got {d1['total_km']}"
            assert d1["morning_km"] == 1000
            assert d1["evening_km"] == 1050
            assert d1["is_manual_override"] is True

            # Day 2 manual data must be retained (NOT 0.0)
            d2 = next(d for d in days if d["day"] == 2)
            assert d2["total_km"] == 35.0, f"Expected 35.0, got {d2['total_km']}"
            assert d2["is_manual_override"] is True

            # Day 3 was 0, no report -> stays 0
            d3 = next(d for d in days if d["day"] == 3)
            assert d3["total_km"] == 0.0

            # Day 8 had FC report -> populated from FC report
            d8 = next(d for d in days if d["day"] == 8)
            assert d8["total_km"] == 45.0
            assert d8["morning_km"] == 2000
            assert d8["evening_km"] == 2045
            assert "PHC Patna City" in d8["visited_names"]


def test_ta_prefill_preserves_manual_entry_when_fc_missed_report():
    """
    Scenario: FC did not submit report on Day 15. Admin previously entered 40 KM manually.
    Prefill must NOT wipe out Day 15 with 0.0.
    """
    _IN_MEMORY_PREFILL_PERMS["test_admin"] = {"can_prefill": True}

    existing_daily_logs = [
        {"day": 15, "date": "2026-10-15", "morning_km": 500, "evening_km": 540, "total_km": 40, "visited_names": "Community Visit", "is_manual_override": False}
    ]

    mock_existing_roster = [
        {
            "id": 889,
            "month": "2026-10",
            "district": "Patna",
            "staff_name": "Ramesh Kumar",
            "daily_logs": existing_daily_logs
        }
    ]

    def mock_pg_execute(sql, params=None, fetch=False):
        if "FROM travel_allowance_rosters" in sql:
            return mock_existing_roster
        if "FROM daily_field_reports" in sql:
            return []  # No reports returned
        return []

    with patch("backend.core.security.get_current_user", return_value={"id": "test_admin", "user_id": "test_admin", "role": "SUB_ADMIN", "allowed_districts": ["Patna"]}):
        with patch("backend.routers.travel_allowance.pg_execute_raw", side_effect=mock_pg_execute):
            res = client.post("/admin/ta/prefill", json={
                "month": "2026-10",
                "district": "Patna",
                "staff_name": "Ramesh Kumar"
            })

            assert res.status_code == 200
            days = res.json()["data"]["days"]
            d15 = next(d for d in days if d["day"] == 15)
            assert d15["total_km"] == 40.0
            assert d15["is_manual_override"] is True


def test_ta_prefill_preserves_manual_when_fc_reported_different_km():
    """
    Scenario: Admin entered 55 KM on Day 10. FC reported 30 KM on Day 10.
    Non-destructive merge means manual entry takes precedence and is not overwritten.
    """
    _IN_MEMORY_PREFILL_PERMS["test_admin"] = {"can_prefill": True}

    existing_daily_logs = [
        {"day": 10, "date": "2026-10-10", "morning_km": 100, "evening_km": 155, "total_km": 55, "visited_names": "Admin Special", "is_manual_override": False}
    ]

    mock_rep_rows = [
        {
            "id": 202,
            "date_of_reporting": "2026-10-10",
            "morning_km": 100,
            "evening_km": 130,
            "total_km": 30,
            "fo_name": "Ramesh Kumar",
            "working_place": "Patna",
            "visited_names": "FC Reported"
        }
    ]

    mock_existing_roster = [
        {
            "id": 890,
            "month": "2026-10",
            "district": "Patna",
            "staff_name": "Ramesh Kumar",
            "daily_logs": existing_daily_logs
        }
    ]

    def mock_pg_execute(sql, params=None, fetch=False):
        if "FROM travel_allowance_rosters" in sql:
            return mock_existing_roster
        if "FROM daily_field_reports" in sql:
            return mock_rep_rows
        return []

    with patch("backend.core.security.get_current_user", return_value={"id": "test_admin", "user_id": "test_admin", "role": "SUB_ADMIN", "allowed_districts": ["Patna"]}):
        with patch("backend.routers.travel_allowance.pg_execute_raw", side_effect=mock_pg_execute):
            res = client.post("/admin/ta/prefill", json={
                "month": "2026-10",
                "district": "Patna",
                "staff_name": "Ramesh Kumar"
            })

            assert res.status_code == 200
            days = res.json()["data"]["days"]
            d10 = next(d for d in days if d["day"] == 10)
            assert d10["total_km"] == 55.0
            assert d10["visited_names"] == "Admin Special"
            assert d10["is_manual_override"] is True


def test_ta_prefill_preserves_unsaved_current_days_from_payload():
    """
    Scenario: Admin typed 70 KM into the frontend grid for Day 4 without saving yet.
    Request includes current_days. Prefill preserves Day 4 as 70 KM.
    """
    _IN_MEMORY_PREFILL_PERMS["test_admin"] = {"can_prefill": True}

    current_days_payload = [
        {"day": 4, "date": "2026-10-04", "morning_km": 300, "evening_km": 370, "total_km": 70, "visited_names": "Unsaved Place"}
    ]

    def mock_pg_execute(sql, params=None, fetch=False):
        if "FROM travel_allowance_rosters" in sql:
            return []  # No existing DB record yet
        if "FROM daily_field_reports" in sql:
            return []
        return []

    with patch("backend.core.security.get_current_user", return_value={"id": "test_admin", "user_id": "test_admin", "role": "SUB_ADMIN", "allowed_districts": ["Patna"]}):
        with patch("backend.routers.travel_allowance.pg_execute_raw", side_effect=mock_pg_execute):
            res = client.post("/admin/ta/prefill", json={
                "month": "2026-10",
                "district": "Patna",
                "staff_name": "Ramesh Kumar",
                "current_days": current_days_payload
            })

            assert res.status_code == 200
            days = res.json()["data"]["days"]
            d4 = next(d for d in days if d["day"] == 4)
            assert d4["total_km"] == 70.0
            assert d4["is_manual_override"] is True
