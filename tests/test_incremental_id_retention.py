import pytest
from unittest.mock import MagicMock, patch
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import main
from backend.routers.reports import submit_daily_report, DailyActivityReport
from backend.routers.admin_feed import edit_patient_id, EditIdRequest

@pytest.mark.asyncio
async def test_incremental_patient_id_retention_and_lookup():
    """
    Verifies that:
    1. First submission creates parent report and inserts initial patient IDs.
    2. Second submission on the same day finds the existing report using canonical lookup.
    3. Incremental insertion merges new IDs without deleting existing ones.
    """
    # Track executed SQL and mock DB state
    mock_db_reports = [
        {
            "id": 999,
            "staff_id": 10,
            "district_id": 1,
            "fo_name": "Ramesh Kumar",
            "working_place": "Patna",
            "date_of_reporting": "2026-10-04",
            "submission_count": 1,
            "legacy_count_notifications": 2,
        }
    ]
    mock_kpi_entries = [
        {"id": 1, "report_id": 999, "category": "notification_ids", "patient_id": "NOTIF-001"},
        {"id": 2, "report_id": 999, "category": "notification_ids", "patient_id": "NOTIF-002"},
        {"id": 3, "report_id": 999, "category": "sample_tested_ids", "patient_id": "TEST-001"},
    ]

    executed_queries = []

    def mock_pg_execute_raw(sql, params=None, fetch=False):
        executed_queries.append((sql, params))
        sql_upper = sql.upper()

        if "SELECT * FROM DAILY_FIELD_REPORTS" in sql_upper:
            # Check date, district, fo_name
            res = []
            for r in mock_db_reports:
                if str(r["date_of_reporting"]) == params[0] and r["working_place"].lower() == params[2].lower() and r["fo_name"].lower() == params[3].lower():
                    res.append(dict(r))
            return res if fetch else bool(res)

        if "SELECT CATEGORY, PATIENT_ID FROM REPORT_KPI_ENTRIES WHERE REPORT_ID = %S" in sql_upper:
            rep_id = params[0]
            entries = [dict(e) for e in mock_kpi_entries if e["report_id"] == rep_id]
            return entries if fetch else bool(entries)

        if "SELECT PATIENT_ID FROM REPORT_KPI_ENTRIES WHERE REPORT_ID = %S" in sql_upper:
            rep_id = params[0]
            cats = [params[1], params[2]] if len(params) > 2 else [params[1]]
            entries = [dict(e) for e in mock_kpi_entries if e["report_id"] == rep_id and e["category"] in cats]
            return entries if fetch else bool(entries)

        if "INSERT INTO REPORT_KPI_ENTRIES" in sql_upper:
            # params is batch
            return True

        if "DELETE FROM REPORT_KPI_ENTRIES" in sql_upper:
            # Guard: Should NEVER be called during incremental daily report submission!
            raise AssertionError("Blind DELETE FROM report_kpi_entries was called! Destructive deletion bug detected.")

        return [] if fetch else True

    # Mock DB connection context manager
    class MockConn:
        def __enter__(self):
            return self
        def __exit__(self, exc_type, exc_val, exc_tb):
            pass
        def cursor(self):
            cur = MagicMock()
            cur.__enter__.return_value = cur
            return cur
        def commit(self):
            pass

    mock_conn = MockConn()

    with patch("backend.routers.reports.pg_execute_raw", side_effect=mock_pg_execute_raw), \
         patch("backend.routers.reports.get_db_connection", return_value=mock_conn), \
         patch("backend.routers.reports.pg_upsert_row", return_value=True), \
         patch("backend.routers.reports.resolve_staff_and_district_ids", return_value=(10, 1)), \
         patch("backend.routers.reports.check_patient_id_90day_notification_duplicate", return_value=None), \
         patch("backend.routers.reports.get_district_90day_notified_ids", return_value=set()):

        # Clear submission cache
        doc_id = "patna_ramesh_kumar_2026-10-04"
        main.cache.delete(f"submitting_{doc_id}")

        # FO submits a second report adding NOTIF-003 and a new DBT ID
        second_report = DailyActivityReport(
            working_place="Patna",
            fo_name="Ramesh Kumar",
            date_of_reporting="2026-10-04",
            pin="1234",
            notification_ids=["NOTIF-003"],
            dbt_ids=["DBT-001"]
        )

        resp = await submit_daily_report(second_report)
        assert resp["message"] == "Daily report submitted successfully"

        # Verify that lookup query was executed
        lookup_queries = [q for q in executed_queries if "SELECT * FROM daily_field_reports" in q[0]]
        assert len(lookup_queries) > 0, "Expected canonical PostgreSQL lookup query to be executed"
        
        # Verify params of lookup query
        l_sql, l_params = lookup_queries[0]
        assert l_params[0] == "2026-10-04"
        assert l_params[2] == "Patna"
        assert l_params[3] == "Ramesh Kumar"

        # Verify NO blind delete query was executed
        delete_queries = [q for q in executed_queries if "DELETE FROM report_kpi_entries" in q[0]]
        assert len(delete_queries) == 0, f"Destructive delete queries detected: {delete_queries}"

        # Verify batch insertion was prepared with only new IDs
        kpi_select_queries = [q for q in executed_queries if "SELECT patient_id FROM report_kpi_entries" in q[0]]
        assert len(kpi_select_queries) > 0, "Expected existing patient IDs query for category diff"


@pytest.mark.asyncio
async def test_edit_patient_id_category_alias_and_retention():
    """
    Verifies that edit_patient_id in admin_feed supports category aliases ('notification' vs 'notification_ids')
    and performs targeted add/replace/delete operations without dropping other category patient IDs.
    """
    mock_db_reports = [
        {
            "id": 888,
            "staff_id": 11,
            "district_id": 2,
            "fo_name": "Suresh Kumar",
            "working_place": "Gaya",
            "date_of_reporting": "2026-10-04",
            "created_at": "2026-10-04 10:00:00",
            "timestamp_completed": "2026-10-04 10:00:00",
            "legacy_count_notifications": 1,
        }
    ]
    mock_staff_directory = [
        {
            "id": 11,
            "name": "Suresh Kumar",
            "district": "Gaya",
            "pin": "4321",
            "deleted_at": None,
        }
    ]
    kpi_rows = [
        {"id": 101, "report_id": 888, "category": "notifications", "patient_id": "123456789"},
    ]

    executed_queries = []

    def mock_pg_execute_raw(sql, params=None, fetch=False):
        executed_queries.append((sql, params))
        sql_upper = sql.upper()

        if "SELECT PIN FROM STAFF_DIRECTORY" in sql_upper:
            return [{"pin": "4321"}] if fetch else True

        if "SELECT * FROM DAILY_FIELD_REPORTS" in sql_upper:
            return [dict(mock_db_reports[0])] if fetch else True

        if "SELECT PATIENT_ID FROM REPORT_KPI_ENTRIES" in sql_upper:
            # Check both category = %s OR category = %s
            cats = [params[1], params[2]] if len(params) > 2 else [params[1]]
            rows = [{"patient_id": r["patient_id"]} for r in kpi_rows if r["report_id"] == params[0] and r["category"] in cats]
            return rows if fetch else bool(rows)

        if "SELECT 1 FROM REPORT_KPI_ENTRIES" in sql_upper:
            cats = [params[1], params[2]] if len(params) > 2 else [params[1]]
            target_pid = params[3] if len(params) > 3 else params[2]
            found = any(r["report_id"] == params[0] and r["category"] in cats and r["patient_id"] == target_pid for r in kpi_rows)
            return [{"1": 1}] if (found and fetch) else ([] if fetch else found)

        if "INSERT INTO REPORT_KPI_ENTRIES" in sql_upper:
            kpi_rows.append({"id": len(kpi_rows) + 100, "report_id": params[0], "category": params[1], "patient_id": params[2]})
            return True

        if "UPDATE REPORT_KPI_ENTRIES" in sql_upper:
            return True

        if "DELETE FROM REPORT_KPI_ENTRIES" in sql_upper:
            return True

        if "UPDATE DAILY_FIELD_REPORTS" in sql_upper:
            return True

        return [] if fetch else True

    with patch("backend.routers.admin_feed.pg_execute_raw", side_effect=mock_pg_execute_raw), \
         patch("backend.routers.admin_feed.pg_fetch_one", return_value=None), \
         patch("backend.routers.admin_feed.check_patient_id_90day_notification_duplicate", return_value=None):

        # FO adds a missing ID using category="notification" (alias)
        req = EditIdRequest(
            working_place="Gaya",
            fo_name="Suresh Kumar",
            date="2026-10-04",
            category="notification",
            action="add",
            new_id="987654321",
            edited_by="FO",
            pin="4321"
        )
        resp = await edit_patient_id(req, admin=None)
        assert "success" in resp["message"].lower()

        # Verify query checked category aliases
        select_queries = [q for q in executed_queries if "SELECT patient_id FROM report_kpi_entries" in q[0]]
        assert len(select_queries) > 0
        assert "(category::text = %s OR category::text = %s)" in select_queries[0][0]

        # Verify insert executed
        insert_queries = [q for q in executed_queries if "INSERT INTO report_kpi_entries" in q[0]]
        assert len(insert_queries) > 0
        assert insert_queries[0][1][2] == "987654321"


@pytest.mark.asyncio
async def test_two_phase_submission_missing_category_retention():
    """
    Asserts:
    - pehli submission: notification_ids=['111111111', '222222222'] -> parent notifications count = 2
    - doosri submission: sirf sample_tested_ids=['333333333'], notification_ids field absent
      -> child table mein A,B ab bhi hain
      -> parent notifications count ab bhi 2 hai, 0 nahi
      -> sample_tested count = 1
    """
    mock_parent_reports = {}
    mock_child_kpi = []

    class MockConn:
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def cursor(self):
            cur = MagicMock()
            cur.__enter__.return_value = cur
            return cur
        def commit(self):
            pass

    mock_conn = MockConn()

    def mock_pg_execute(sql, params=None, fetch=False):
        sql_upper = sql.upper()

        if "SELECT * FROM DAILY_FIELD_REPORTS" in sql_upper:
            # params: [clean_date, f"{clean_date}%", c_wp, fo_trimmed]
            if 777 in mock_parent_reports:
                r = mock_parent_reports[777]
                if r["date_of_reporting"] == params[0] and r["working_place"].lower() == params[2].lower() and r["fo_name"].lower() == params[3].lower():
                    return [dict(r)] if fetch else True
            return [] if fetch else False

        if "SELECT CATEGORY" in sql_upper and "FROM REPORT_KPI_ENTRIES" in sql_upper:
            rep_id = params[0]
            entries = [{"category": e["category"], "patient_id": e["patient_id"]} for e in mock_child_kpi if e["report_id"] == rep_id]
            return entries if fetch else bool(entries)

        if "SELECT PATIENT_ID FROM REPORT_KPI_ENTRIES" in sql_upper:
            rep_id = params[0]
            cat_list = [params[1], params[2]] if len(params) > 2 else [params[1]]
            entries = [{"patient_id": e["patient_id"]} for e in mock_child_kpi if e["report_id"] == rep_id and e["category"] in cat_list]
            return entries if fetch else bool(entries)

        if "INSERT INTO DAILY_FIELD_REPORTS" in sql_upper:
            # First submission insert returning id
            rep_data = {
                "id": 777,
                "working_place": "Patna",
                "fo_name": "Ramesh Kumar",
                "date_of_reporting": "2026-10-04",
                "legacy_count_notifications": 2,
                "legacy_count_sample_tested": 0,
            }
            mock_parent_reports[777] = rep_data
            return [{"id": 777}] if fetch else True

        if "INSERT INTO REPORT_KPI_ENTRIES" in sql_upper:
            return True

        if "DELETE FROM REPORT_KPI_ENTRIES" in sql_upper:
            raise AssertionError("Destructive DELETE FROM report_kpi_entries executed!")

        return [] if fetch else True

    def mock_pg_upsert(table, data, conflict_columns=None):
        if table == "daily_field_reports":
            rep_id = data.get("id") or 777
            if rep_id in mock_parent_reports:
                mock_parent_reports[rep_id].update(data)
            else:
                data["id"] = rep_id
                mock_parent_reports[rep_id] = dict(data)
            return True
        return True

    def mock_pg_update(table, data, filters=None):
        if table == "daily_field_reports":
            rep_id = (filters or {}).get("id") or 777
            if rep_id in mock_parent_reports:
                mock_parent_reports[rep_id].update(data)
            else:
                mock_parent_reports[rep_id] = dict(data)
            return True
        return True

    with patch("backend.routers.reports.pg_execute_raw", side_effect=mock_pg_execute), \
         patch("backend.routers.reports.get_db_connection", return_value=mock_conn), \
         patch("backend.routers.reports.pg_upsert_row", side_effect=mock_pg_upsert), \
         patch("backend.routers.reports.pg_update_row", side_effect=mock_pg_update), \
         patch("backend.routers.reports.resolve_staff_and_district_ids", return_value=(10, 1)), \
         patch("backend.routers.reports.check_patient_id_90day_notification_duplicate", return_value=None), \
         patch("backend.routers.reports.get_district_90day_notified_ids", return_value=set()):

        doc_id = "patna_ramesh_kumar_2026-10-04"
        main.cache.delete(f"submitting_{doc_id}")

        # --- Phase 1: First submission with notification_ids=['111111111', '222222222'] ---
        report_1 = DailyActivityReport(
            working_place="Patna",
            fo_name="Ramesh Kumar",
            date_of_reporting="2026-10-04",
            pin="1234",
            notification_ids=["111111111", "222222222"]
        )

        # Mock the child table insert for Phase 1
        mock_child_kpi.extend([
            {"report_id": 777, "category": "notification_ids", "patient_id": "111111111"},
            {"report_id": 777, "category": "notification_ids", "patient_id": "222222222"},
        ])

        res_1 = await submit_daily_report(report_1)
        assert res_1["message"] == "Daily report submitted successfully"
        assert 777 in mock_parent_reports
        assert mock_parent_reports[777]["legacy_count_notifications"] == 2
        assert mock_parent_reports[777].get("legacy_count_sample_tested", 0) == 0

        # --- Phase 2: Second submission with ONLY sample_tested_ids=['333333333'] (notification_ids absent) ---
        main.cache.delete(f"submitting_{doc_id}")

        report_2 = DailyActivityReport(
            working_place="Patna",
            fo_name="Ramesh Kumar",
            date_of_reporting="2026-10-04",
            pin="1234",
            sample_tested_ids=["333333333"]
            # notification_ids is absent (defaults to empty list in model)
        )

        res_2 = await submit_daily_report(report_2)
        assert res_2["message"] == "Daily report submitted successfully"

        # Assertions per user specification:
        # 1. Child table mein A, B ab bhi hain
        child_pids = [e["patient_id"] for e in mock_child_kpi]
        assert "111111111" in child_pids
        assert "222222222" in child_pids

        # 2. Parent notifications count ab bhi 2 hai, 0 nahi!
        updated_parent = mock_parent_reports[777]
        assert updated_parent["legacy_count_notifications"] == 2, f"Expected 2, got {updated_parent['legacy_count_notifications']}"

        # 3. Sample tested count = 1
        assert updated_parent["legacy_count_sample_tested"] == 1, f"Expected 1, got {updated_parent['legacy_count_sample_tested']}"


