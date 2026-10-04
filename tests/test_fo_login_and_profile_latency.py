import sys
import time
from pathlib import Path
from unittest.mock import patch, MagicMock

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import pytest
from fastapi.testclient import TestClient
from main import app
from backend.core.supabase import ensure_database_indexes_exist
from backend.core.cache import cache

client = TestClient(app)

def test_ensure_database_indexes_exist_idempotent():
    with patch("backend.core.supabase.pg_execute_raw") as mock_pg:
        mock_pg.return_value = True
        ensure_database_indexes_exist()
        assert mock_pg.called
        call_sql = mock_pg.call_args[0][0]
        assert "idx_dfr_staff_date" in call_sql
        assert "idx_rkp_report_id" in call_sql
        assert "idx_staff_dist_name" in call_sql

def test_verify_pin_latency_under_50ms():
    cache.delete_prefix("pin_")
    with patch("backend.routers.auth.pg_execute_raw") as mock_pg:
        # Mock finding staff in staff_directory
        mock_pg.return_value = [{
            "id": 85,
            "district_id": 9,
            "name": "Sameer Arya",
            "pin": "1234",
            "is_active": True
        }]

        payload = {
            "working_place": "Gaya",
            "fo_name": "Sameer Arya",
            "pin": "1234"
        }

        t0 = time.perf_counter()
        res = client.post("/verify-pin", json=payload)
        t_elapsed_ms = (time.perf_counter() - t0) * 1000

        assert res.status_code == 200
        assert res.json().get("valid") is True
        assert t_elapsed_ms < 50.0

def test_verify_pin_deactivated_returns_error():
    cache.delete_prefix("pin_")
    with patch("backend.routers.auth.pg_execute_raw") as mock_pg:
        mock_pg.return_value = [{
            "id": 85,
            "district_id": 9,
            "name": "Sameer Arya",
            "pin": "1234",
            "is_active": False
        }]

        payload = {
            "working_place": "Gaya",
            "fo_name": "Sameer Arya",
            "pin": "1234"
        }

        res = client.post("/verify-pin", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data.get("valid") is False
        assert "Account deactivated" in data.get("error", "")

def test_my_profile_stats_latency_under_50ms():
    cache.delete_prefix("profile_")
    with patch("backend.core.helpers.pg_execute_raw") as mock_helpers_pg, \
         patch("backend.routers.reports.pg_execute_raw") as mock_reports_pg, \
         patch("backend.routers.reports.get_targets") as mock_targets:

        # Mock resolve_staff_and_district_ids
        mock_helpers_pg.return_value = [{"id": 85, "district_id": 9, "name": "Sameer Arya", "pin": "1234"}]
        mock_targets.return_value = {"targets": [{"fo_name": "Sameer Arya", "target": 60}]}

        # Mock reports query and child tables
        def pg_exec(sql, params=None, fetch=False):
            sql_upper = " ".join(sql.split()).upper()
            if "FROM DAILY_FIELD_REPORTS" in sql_upper:
                return [{
                    "id": 101,
                    "staff_id": 85,
                    "district_id": 9,
                    "fo_name": "Sameer Arya",
                    "working_place": "Gaya",
                    "date_of_reporting": "2026-10-02",
                    "submission_count": 1,
                    "total_km": 15,
                    "remark": "Good day"
                }]
            if "FROM REPORT_KPI_ENTRIES" in sql_upper:
                return [
                    {"report_id": 101, "category": "notification_ids", "patient_id": "123456789"},
                    {"report_id": 101, "category": "sample_tested_ids", "patient_id": "987654321"}
                ]
            if "FROM REPORT_FDC_DETAILS" in sql_upper:
                return []
            if "FROM REPORT_VISITED_NAMES" in sql_upper:
                return [{"report_id": 101, "name": "Dr. Sharma", "position": 1}]
            if "FROM DAILY_STAFF_LEAVES" in sql_upper:
                return []
            if "FROM STAFF_DIRECTORY" in sql_upper:
                return [{"pin": "1234", "is_active": True}]
            return []

        mock_reports_pg.side_effect = pg_exec

        payload = {
            "working_place": "Gaya",
            "fo_name": "Sameer Arya",
            "pin": "1234",
            "month": "2026-10"
        }

        t0 = time.perf_counter()
        res = client.post("/my-profile-stats", json=payload)
        t_elapsed_ms = (time.perf_counter() - t0) * 1000

        assert res.status_code == 200
        data = res.json()
        assert data.get("success") is True
        assert data.get("target") == 60
        assert "daily_history" in data
        assert "breakdown" in data
        assert data["breakdown"]["notification"] >= 1
        assert t_elapsed_ms < 50.0
