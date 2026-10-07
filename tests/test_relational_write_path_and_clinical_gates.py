import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from main import app
from backend.core.helpers import (
    resolve_staff_and_district_ids,
    check_patient_id_90day_notification_duplicate,
    canonicalize_district
)

client = TestClient(app)

def test_resolve_staff_and_district_ids_with_mocks():
    with patch("backend.core.helpers.pg_execute_raw") as mock_pg:
        # Mock district resolution
        def pg_side_effect(sql, params=None, fetch=False):
            sql_clean = " ".join(sql.split()).upper()
            if "FROM DISTRICTS" in sql_clean:
                return [{"id": 9, "name": "Gaya"}]
            if "FROM STAFF_DIRECTORY" in sql_clean:
                # Return Sammer Arya for Sameer Arya query
                return [{"id": 85, "name": "Sammer Arya", "district": "Gaya", "pin": "1234"}]
            return []

        mock_pg.side_effect = pg_side_effect

        staff_id, district_id = resolve_staff_and_district_ids(
            fo_name="Sameer Arya",
            district="Gaya",
            pin="1234"
        )
        assert district_id == 9
        assert staff_id == 85

def test_check_patient_id_90day_notification_duplicate_detected():
    with patch("backend.core.helpers.pg_execute_raw") as mock_pg:
        # Simulate PostgreSQL returning a record found within 90 days
        mock_pg.return_value = [{
            "patient_id": "123456789",
            "date_of_reporting": "2026-09-15",
            "fo_name": "Ramesh Kumar",
            "working_place": "Patna",
            "created_at": "2026-09-15 10:00:00"
        }]

        res = check_patient_id_90day_notification_duplicate(
            patient_id="123456789",
            district="Patna",
            reporting_date="2026-10-04"
        )
        assert res is not None
        assert res["patient_id"] == "123456789"
        assert res["fo_name"] == "Ramesh Kumar"

def test_check_patient_id_90day_notification_duplicate_not_found():
    with patch("backend.core.helpers.pg_execute_raw") as mock_pg:
        mock_pg.return_value = []

        res = check_patient_id_90day_notification_duplicate(
            patient_id="999999999",
            district="Patna",
            reporting_date="2026-10-04"
        )
        assert res is None

def test_edit_patient_id_90day_notification_duplicate_rejected():
    # Attempting to add a duplicate notification ID that was already notified within 90 days
    with patch("backend.routers.admin_feed.check_patient_id_90day_notification_duplicate") as mock_check, \
         patch("backend.routers.admin_feed.pg_execute_raw") as mock_pg:
        
        # Mock staff auth
        mock_pg.return_value = [{"pin": "1234"}]
        mock_check.return_value = {
            "patient_id": "123456789",
            "date_of_reporting": "2026-09-10",
            "fo_name": "Anita Devi",
            "working_place": "Gaya"
        }

        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        now_iso = datetime.now(timezone.utc).isoformat()

        # Mock finding the report in Postgres
        def pg_exec(sql, params=None, fetch=False):
            sql_clean = " ".join(sql.split()).upper()
            if "FROM DAILY_FIELD_REPORTS" in sql_clean:
                return [{
                    "id": 101,
                    "fo_name": "Sameer Arya",
                    "working_place": "Gaya",
                    "date_of_reporting": today_str,
                    "timestamp_completed": now_iso,
                    "legacy_doc_id": f"gaya_sameer_arya_{today_str}"
                }]
            if "FROM STAFF_DIRECTORY" in sql_clean:
                return [{"pin": "1234"}]
            if "FROM REPORT_KPI_ENTRIES" in sql_clean:
                return []
            return []

        mock_pg.side_effect = pg_exec

        payload = {
            "working_place": "Gaya",
            "fo_name": "Sameer Arya",
            "date": today_str,
            "category": "notification_ids",
            "action": "add",
            "new_id": "123456789",
            "pin": "1234",
            "edited_by": "FO"
        }

        resp = client.post("/api/reports/edit-id", json=payload)
        assert resp.status_code == 400
        data = resp.json()
        assert "already notified in a different report" in data["detail"]

def test_edit_patient_id_same_day_duplicate_returns_409():
    with patch("backend.core.helpers.check_patient_id_90day_notification_duplicate", return_value=None), \
         patch("backend.routers.admin_feed.pg_execute_raw") as mock_pg:
        
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        now_iso = datetime.now(timezone.utc).isoformat()

        def pg_exec(sql, params=None, fetch=False):
            sql_clean = " ".join(sql.split()).upper()
            if "FROM DAILY_FIELD_REPORTS" in sql_clean:
                return [{
                    "id": 102,
                    "fo_name": "Sameer Arya",
                    "working_place": "Gaya",
                    "date_of_reporting": today_str,
                    "timestamp_completed": now_iso,
                    "legacy_doc_id": f"gaya_sameer_arya_{today_str}"
                }]
            if "FROM STAFF_DIRECTORY" in sql_clean:
                return [{"pin": "1234"}]
            if "SELECT 1 FROM REPORT_KPI_ENTRIES" in sql_clean:
                # Simulates same ID already present
                return [{"?column?": 1}]
            return []

        mock_pg.side_effect = pg_exec

        payload = {
            "working_place": "Gaya",
            "fo_name": "Sameer Arya",
            "date": today_str,
            "category": "sample_tested_ids",
            "action": "add",
            "new_id": "987654321",
            "pin": "1234",
            "edited_by": "FO"
        }

        resp = client.post("/api/reports/edit-id", json=payload)
        assert resp.status_code == 409
        data = resp.json()
        assert "already present in this report" in data["detail"]

def test_edit_patient_id_safe_mutation_increments_and_preserves_parent():
    executed_sqls = []
    with patch("backend.core.helpers.check_patient_id_90day_notification_duplicate", return_value=None), \
         patch("backend.routers.admin_feed.pg_execute_raw") as mock_pg:
        
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        now_iso = datetime.now(timezone.utc).isoformat()

        def pg_exec(sql, params=None, fetch=False):
            executed_sqls.append((sql, params))
            sql_clean = " ".join(sql.split()).upper()
            if "FROM DAILY_FIELD_REPORTS" in sql_clean and "SELECT" in sql_clean:
                return [{
                    "id": 103,
                    "fo_name": "Sameer Arya",
                    "working_place": "Gaya",
                    "date_of_reporting": today_str,
                    "timestamp_completed": now_iso,
                    "legacy_count_sample_tested": 5,
                    "legacy_doc_id": f"gaya_sameer_arya_{today_str}"
                }]
            if "FROM STAFF_DIRECTORY" in sql_clean:
                return [{"pin": "1234"}]
            if "SELECT 1 FROM REPORT_KPI_ENTRIES" in sql_clean:
                return []
            if "SELECT PATIENT_ID FROM REPORT_KPI_ENTRIES" in sql_clean:
                return []
            return []

        mock_pg.side_effect = pg_exec

        payload = {
            "working_place": "Gaya",
            "fo_name": "Sameer Arya",
            "date": today_str,
            "category": "sample_tested_ids",
            "action": "add",
            "new_id": "987654321",
            "pin": "1234",
            "edited_by": "FO"
        }

        resp = client.post("/api/reports/edit-id", json=payload)
        assert resp.status_code == 200

        # Verify child insertion and atomic increment were executed
        insert_kpi = any("INSERT INTO REPORT_KPI_ENTRIES" in " ".join(s[0].split()).upper() for s in executed_sqls)
        update_parent = any("UPDATE DAILY_FIELD_REPORTS SET LEGACY_COUNT_SAMPLE_TESTED = COALESCE(LEGACY_COUNT_SAMPLE_TESTED, 0) + 1" in " ".join(s[0].split()).upper() for s in executed_sqls)
        # Verify NO delete was executed against daily_field_reports
        delete_parent = any("DELETE FROM DAILY_FIELD_REPORTS" in " ".join(s[0].split()).upper() for s in executed_sqls)

        assert insert_kpi is True
        assert update_parent is True
        assert delete_parent is False
