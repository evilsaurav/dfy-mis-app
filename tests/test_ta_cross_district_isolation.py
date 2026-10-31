import os
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


def test_ta_save_officer_cross_district_isolation():
    """
    Test that save_officer_ta_log resolves staff strictly within the target district,
    even when multiple staff share the exact same name across Bihar (e.g. Suraj Kumar).
    """
    # 1. Super Admin user
    super_user = {"id": "super", "username": "super", "role": "SUPER_ADMIN", "district": "All"}

    # Mock staff directory return for Jehanabad vs Nawada
    def mock_pg_execute(sql, params=None, fetch=False):
        sql_upper = sql.upper()
        if "FROM STAFF_DIRECTORY" in sql_upper:
            # Check if Jehanabad is in params
            if params and any("jehanabad" in str(p).lower() for p in params):
                return [{"id": 38, "district_id": 9, "name": "Suraj Kumar", "district": "Jehanabad"}]
            elif params and any("nawada" in str(p).lower() for p in params):
                return [{"id": 426, "district_id": 16, "name": "Suraj Kumar", "district": "Nawada"}]
            return [{"id": 38, "district_id": 9, "name": "Suraj Kumar", "district": "Jehanabad"}]
        
        if "FROM DISTRICTS" in sql_upper:
            return [{"id": 9}]

        if "TRAVEL_ALLOWANCE_ROSTERS" in sql_upper:
            if "INSERT INTO" in sql_upper:
                return [{"id": 16}]
            # SELECT existing: return empty so it inserts
            return []

        if "DELETE FROM TRAVEL_ALLOWANCE_DAILY_LOGS" in sql_upper:
            return []

        if "INSERT INTO TRAVEL_ALLOWANCE_DAILY_LOGS" in sql_upper:
            return []

        return []

    with patch("backend.core.security.get_current_user", return_value=super_user):
        with patch("backend.routers.travel_allowance.pg_execute_raw", side_effect=mock_pg_execute) as mock_exec:
            # Save for Jehanabad, even if frontend accidentally sent Nawada's staff_key '426'
            res = client.post("/admin/ta/save-log", json={
                "month": "2026-10",
                "district": "Jehanabad",
                "staff_name": "Suraj Kumar",
                "staff_key": "426",
                "days": [{"day": 1, "morning_km": 100, "evening_km": 150, "total_km": 50}]
            })

            assert res.status_code == 200, res.text
            data = res.json()["data"]
            # staff_key must be corrected to Jehanabad's ID 38
            assert str(data["staff_key"]) == "38", f"Expected '38', got {data['staff_key']}"


def test_ta_bulk_save_cross_district_isolation():
    """
    Test that save_all_staff_ta_bulk resolves staff strictly within the target district,
    preventing duplicate names in other districts from being overwritten.
    """
    super_user = {"id": "super", "username": "super", "role": "SUPER_ADMIN", "district": "All"}

    executed_sqls = []

    def mock_pg_execute(sql, params=None, fetch=False):
        executed_sqls.append((sql, params))
        sql_upper = sql.upper()
        if "FROM STAFF_DIRECTORY" in sql_upper:
            if params and any("jehanabad" in str(p).lower() for p in params):
                return [{"id": 38, "district_id": 9, "name": "Suraj Kumar", "district": "Jehanabad"}]
            return []
        if "FROM TRAVEL_ALLOWANCE_ROSTERS" in sql_upper:
            if "INSERT INTO" in sql_upper:
                return [{"id": 16}]
            return []
        if "FROM DISTRICTS" in sql_upper:
            return [{"id": 9}]
        return []

    with patch("backend.core.security.get_current_user", return_value=super_user):
        with patch("backend.routers.travel_allowance.pg_execute_raw", side_effect=mock_pg_execute):
            res = client.post("/admin/ta/save-log-bulk", json={
                "month": "2026-10",
                "district": "Jehanabad",
                "entries": [
                    {
                        "month": "2026-10",
                        "district": "Jehanabad",
                        "staff_name": "Suraj Kumar",
                        "staff_key": "suraj_kumar",
                        "days": [{"day": 1, "morning_km": 100, "evening_km": 140, "total_km": 40}]
                    }
                ]
            })

            assert res.status_code == 200, res.text
            # Verify staff_directory query contained district parameter
            staff_lookup = next(call for call in executed_sqls if "FROM staff_directory" in call[0])
            assert any("jehanabad" in str(p).lower() for p in staff_lookup[1]), "District parameter missing in bulk staff query!"


def test_ta_prefill_cross_district_isolation():
    """
    Test that prefill resolves existing roster and daily reports strictly for the target district.
    """
    _IN_MEMORY_PREFILL_PERMS["test_admin"] = {"can_prefill": True}
    sub_user = {"id": "test_admin", "user_id": "test_admin", "role": "SUB_ADMIN", "allowed_districts": ["Jehanabad"]}

    executed_sqls = []

    def mock_pg_execute(sql, params=None, fetch=False):
        executed_sqls.append((sql, params))
        sql_upper = sql.upper()
        if "FROM STAFF_DIRECTORY" in sql_upper:
            return [{"id": 38, "district_id": 9, "name": "Suraj Kumar", "district": "Jehanabad"}]
        if "FROM TRAVEL_ALLOWANCE_ROSTERS" in sql_upper:
            return []  # No existing record
        if "FROM DAILY_FIELD_REPORTS" in sql_upper:
            return [
                {
                    "id": 11178,
                    "date_of_reporting": "2026-10-30",
                    "morning_km": 21590,
                    "evening_km": 21616,
                    "total_km": 26,
                    "fo_name": "Suraj Kumar",
                    "working_place": "Jehanabad",
                    "visited_names": "PHC Makhdumpur",
                    "remark": ""
                }
            ]
        return []

    with patch("backend.core.security.get_current_user", return_value=sub_user):
        with patch("backend.routers.travel_allowance.pg_execute_raw", side_effect=mock_pg_execute):
            res = client.post("/admin/ta/prefill", json={
                "month": "2026-10",
                "district": "Jehanabad",
                "staff_name": "Suraj Kumar",
                "staff_key": "426"  # Foreign key mistakenly sent
            })

            assert res.status_code == 200, res.text
            data = res.json()["data"]
            # Correct staff key must be returned
            assert str(data["staff_key"]) == "38", f"Expected staff_key '38', got {data['staff_key']}"
            day30 = next(d for d in data["days"] if d["day"] == 30)
            assert day30["morning_km"] == 21590.0
            assert day30["evening_km"] == 21616.0
            assert day30["total_km"] == 26.0
            assert "PHC Makhdumpur" in day30["visited_names"]
