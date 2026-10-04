import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient
from pathlib import Path
import sys

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from main import app, cache, create_access_token, get_month_date_range
from backend.routers.admin_feed import admin_delete_day_report, DeleteDayReportReq
from backend.routers.targets import (
    update_target, 
    update_district_target, 
    update_district_targets_bulk,
    TargetUpdate, 
    DistrictTargetUpdate, 
    BulkDistrictTargetUpdate,
    ensure_district_targets_table_exists
)
from backend.routers.nikshay import get_patient_journey

client = TestClient(app)

def make_admin_token(role="SUPER_ADMIN", allowed=None):
    return create_access_token({
        "user_id": "test_admin",
        "username": "test_admin",
        "role": role,
        "allowed_districts": allowed or ["All"]
    })

@pytest.fixture(autouse=True)
def clean_cache():
    cache.clear()
    yield
    cache.clear()


# =========================================================================
# Task A (Issue 3): Month Boundary & Date Math Fix Tests
# =========================================================================
def test_get_month_date_range_exact_days():
    # September (30 days) - critical for PostgreSQL date out of range prevention
    start, end = get_month_date_range("2026-09")
    assert start == "2026-09-01"
    assert end == "2026-09-30"

    # October (31 days)
    start, end = get_month_date_range("2026-10")
    assert start == "2026-10-01"
    assert end == "2026-10-31"

    # February Leap Year 2024 (29 days)
    start, end = get_month_date_range("2024-02")
    assert start == "2024-02-01"
    assert end == "2024-02-29"

    # February Non-Leap Year 2026 (28 days)
    start, end = get_month_date_range("2026-02")
    assert start == "2026-02-01"
    assert end == "2026-02-28"

    # Full date string input YYYY-MM-DD
    start, end = get_month_date_range("2026-04-15")
    assert start == "2026-04-01"
    assert end == "2026-04-30"

    # Empty or None string returns valid current month range
    start, end = get_month_date_range("")
    assert start.endswith("-01")
    assert len(end) == 10


# =========================================================================
# Task B (Issue 5): Report Deletion PostgreSQL Migration & Cascade Delete Tests
# =========================================================================
@pytest.mark.asyncio
async def test_admin_delete_day_report_postgres_cascade_and_cache_eviction():
    admin = {
        "user_id": "admin_1",
        "username": "SuperAdmin",
        "role": "SUPER_ADMIN",
        "allowed_districts": ["All"]
    }
    req = DeleteDayReportReq(
        district="Patna",
        fo_name="Ravi Kumar",
        date="2026-09-15"
    )

    mock_pg_rows = [
        {
            "id": 1001,
            "fo_name": "Ravi Kumar",
            "working_place": "Patna",
            "date_of_reporting": "2026-09-15",
            "notification_ids": ["N1001", "N1002"],
            "sample_tested_ids": ["S1001"],
            "dbt_ids": [],
            "hiv_dm_ids": [],
            "contact_tracing_ids": [],
            "differentiated_tb_ids": []
        }
    ]

    pg_executed_sqls = []
    def fake_pg_execute(sql, params=None, fetch=False):
        pg_executed_sqls.append((sql, params))
        if fetch:
            return mock_pg_rows
        return True

    cache.set("master_reports_2026-09", ["report_data"], ttl=300)
    cache.set("status_1001", {"status": "present"}, ttl=300)
    cache.set("status_patna_ravi_kumar_2026-09-15", {"status": "present"}, ttl=300)

    with patch("backend.routers.admin_feed.pg_execute_raw", side_effect=fake_pg_execute), \
         patch("backend.routers.admin_feed.log_admin_activity", new=AsyncMock()), \
         patch("backend.routers.admin_feed.record_report_mutation") as mock_record_mut:

        res = await admin_delete_day_report(req, admin)

        assert res["success"] is True
        assert res["district"] == "Patna"
        assert res["fo_name"] == "Ravi Kumar"
        assert res["deleted_ids_count"] == 3  # 2 notifications + 1 test

        # Verify child table cascade deletes executed with report IDs
        child_deletes = [s[0] for s in pg_executed_sqls if "DELETE FROM" in s[0]]
        assert any("DELETE FROM report_kpi_entries WHERE report_id = ANY(%s)" in s for s in child_deletes)
        assert any("DELETE FROM report_fdc_details WHERE report_id = ANY(%s)" in s for s in child_deletes)
        assert any("DELETE FROM report_visited_names WHERE report_id = ANY(%s)" in s for s in child_deletes)
        assert any("DELETE FROM daily_field_reports WHERE id = ANY(%s)" in s for s in child_deletes)

        # Verify caches evicted
        assert cache.get("master_reports_2026-09") is None
        assert cache.get("status_1001") is None
        assert cache.get("status_patna_ravi_kumar_2026-09-15") is None


# =========================================================================
# Task C (Issue 2): Patient Journey Relational Queries Tests
# =========================================================================
@pytest.mark.asyncio
async def test_get_patient_journey_relational_kpi_and_fdc():
    clean_id = "887766554"

    mock_kpi_entries = [
        {
            "category": "notification_ids",
            "patient_id": clean_id,
            "report_id": 101,
            "fo_name": "Suresh Prasad",
            "district": "Gaya",
            "date_of_reporting": "2026-09-05",
            "created_at": "2026-09-05T10:00:00Z"
        },
        {
            "category": "sample_tested_ids",
            "patient_id": clean_id,
            "report_id": 102,
            "fo_name": "Suresh Prasad",
            "district": "Gaya",
            "date_of_reporting": "2026-09-10",
            "created_at": "2026-09-10T11:00:00Z"
        }
    ]

    mock_fdc_entries = [
        {
            "patient_id": clean_id,
            "fdc_type": "3-FDC",
            "regimen_name": "Standard IP",
            "phase": "IP",
            "report_id": 103,
            "fo_name": "Suresh Prasad",
            "district": "Gaya",
            "date_of_reporting": "2026-09-12",
            "created_at": "2026-09-12T09:30:00Z"
        }
    ]

    def fake_pg_execute_journey(sql, params=None, fetch=False):
        if "report_kpi_entries" in sql:
            return mock_kpi_entries
        if "report_fdc_details" in sql:
            return mock_fdc_entries
        return []

    with patch("backend.routers.nikshay.pg_execute_raw", side_effect=fake_pg_execute_journey):
        res = await get_patient_journey(clean_id)

        assert res["success"] is True
        assert res["patient_id"] == clean_id
        assert res["metadata"]["district"] == "Gaya"
        assert res["metadata"]["primary_fo"] == "Suresh Prasad"
        assert res["metadata"]["first_reported"] == "2026-09-05"

        milestones = res["journey"]
        assert len(milestones) == 3

        categories = [m["category"] for m in milestones]
        assert "notification_ids" in categories
        assert "sample_tested_ids" in categories
        assert "fdc_provided_ids" in categories

        # Verify date ordering
        dates = [m["date"] for m in milestones]
        assert dates == ["2026-09-05", "2026-09-10", "2026-09-12"]

        # Verify milestone keys
        for m in milestones:
            assert "action" in m
            assert "icon" in m
            assert "category" in m
            assert "fo_name" in m
            assert "district" in m
            assert "date" in m


# =========================================================================
# Task D (Issue 4): Targets System Write-Path Alignment Tests
# =========================================================================
@pytest.mark.asyncio
async def test_update_target_postgres_write_path_and_cache_eviction():
    admin = {
        "user_id": "admin_1",
        "username": "SuperAdmin",
        "role": "SUPER_ADMIN",
        "allowed_districts": ["All"]
    }
    update_req = TargetUpdate(
        district="Sitamarhi",
        fo_name="Avinash Kumar",
        target=75,
        month="2026-09"
    )

    pg_sqls = []
    def fake_pg_execute_target(sql, params=None, fetch=False):
        pg_sqls.append((sql, params))
        if fetch and "staff_directory" in sql:
            return [{"id": 505, "name": "Avinash Kumar", "district": "Sitamarhi"}]
        return True

    cache.set("targets_2026-09_all_all", {"cached": True}, ttl=300)
    cache.set("staff_targets_raw_2026-09", ["raw"], ttl=300)
    cache.set("district_targets_2026-09_sitamarhi", {"t": 1}, ttl=300)
    cache.set("pacing_2026-09", {"p": 1}, ttl=300)
    cache.set("statewide_top_2026-09_monthly", {"top": 1}, ttl=300)

    with patch("backend.routers.targets.pg_execute_raw", side_effect=fake_pg_execute_target), \
         patch("backend.routers.targets.log_admin_activity", new=AsyncMock()):

        res = await update_target(update_req, admin)
        assert res["success"] is True

        # Check staff_id lookup executed
        assert any("FROM staff_directory WHERE name ILIKE" in s[0] for s in pg_sqls)

        # Check staff_targets ON CONFLICT upsert executed with staff_id=505 and month="2026-09-01"
        target_inserts = [s for s in pg_sqls if "INSERT INTO staff_targets" in s[0]]
        assert len(target_inserts) >= 1
        sql_text, sql_params = target_inserts[0]
        assert "ON CONFLICT (staff_id, month)" in sql_text
        assert sql_params[0] == 505
        assert sql_params[1] == "2026-09-01"
        assert sql_params[2] == 75

        # Check all required caches are cleared
        assert cache.get("targets_2026-09_all_all") is None
        assert cache.get("staff_targets_raw_2026-09") is None
        assert cache.get("district_targets_2026-09_sitamarhi") is None
        assert cache.get("pacing_2026-09") is None
        assert cache.get("statewide_top_2026-09_monthly") is None


@pytest.mark.asyncio
async def test_update_district_targets_postgres_write_and_bulk():
    admin = {
        "user_id": "admin_1",
        "username": "SuperAdmin",
        "role": "SUPER_ADMIN",
        "allowed_districts": ["All"]
    }
    dist_req = DistrictTargetUpdate(
        district="Begusarai",
        official_target=350,
        month="2026-09"
    )

    pg_sqls = []
    def fake_pg_execute_dist(sql, params=None, fetch=False):
        pg_sqls.append((sql, params))
        return True

    cache.set("targets_2026-09_begusarai", {"t": 1}, ttl=300)
    cache.set("staff_targets_raw_2026-09", ["raw"], ttl=300)
    cache.set("district_targets_2026-09_begusarai", {"dt": 1}, ttl=300)
    cache.set("pacing_2026-09", {"p": 1}, ttl=300)
    cache.set("statewide_top_2026-09_monthly", {"top": 1}, ttl=300)

    with patch("backend.routers.targets.pg_execute_raw", side_effect=fake_pg_execute_dist), \
         patch("backend.routers.targets.log_admin_activity", new=AsyncMock()):

        # Single update
        res = await update_district_target(dist_req, admin)
        assert res["success"] is True

        dt_inserts = [s for s in pg_sqls if "INSERT INTO district_targets" in s[0]]
        assert len(dt_inserts) >= 1

        assert cache.get("targets_2026-09_begusarai") is None
        assert cache.get("staff_targets_raw_2026-09") is None
        assert cache.get("district_targets_2026-09_begusarai") is None
        assert cache.get("pacing_2026-09") is None
        assert cache.get("statewide_top_2026-09_monthly") is None

        # Bulk update
        bulk_req = BulkDistrictTargetUpdate(
            month="2026-09",
            targets=[
                DistrictTargetUpdate(district="Gaya", official_target=400, month="2026-09"),
                DistrictTargetUpdate(district="Bhojpur", official_target=320, month="2026-09")
            ]
        )
        bulk_res = await update_district_targets_bulk(bulk_req, admin)
        assert bulk_res["success"] is True
        assert bulk_res["count"] == 2
