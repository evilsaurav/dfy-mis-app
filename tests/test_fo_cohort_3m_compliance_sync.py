import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import pytest
from fastapi.testclient import TestClient
import main
from backend.routers import reports as reports_router

client = TestClient(main.app)
IST = timezone(timedelta(hours=5, minutes=30))


@pytest.fixture(autouse=True)
def cleanup():
    main.app.dependency_overrides.clear()
    from backend.core.cache import cache
    cache.clear()
    yield
    main.app.dependency_overrides.clear()
    cache.clear()


def _make_pg_mock(rep_rows, kpi_rows, nik_rows, grace_rows=None):
    """Routes SQL queries inside compute_fo_3m_cohort_sync to deterministic test rows."""
    grace_rows = grace_rows or []

    def _side_effect(sql, params=None, fetch=False):
        q = (sql or "").lower()
        if "from daily_field_reports" in q:
            return list(rep_rows)
        if "from report_kpi_entries" in q:
            return list(kpi_rows)
        if "from nikshay_verified_patients" in q:
            return list(nik_rows)
        if "from nikshay_sync_grace_records" in q:
            return list(grace_rows)
        return []

    return _side_effect


def test_cohort_sync_requires_valid_auth():
    """Verify /api/fo/cohort-compliance-sync enforces FO PIN / Admin Bearer auth in production."""
    with patch("backend.routers.travel_allowance.get_active_db", return_value=None), \
         patch("backend.routers.travel_allowance.pg_execute_raw", return_value=[]):
        res = client.get(
            "/api/fo/cohort-compliance-sync",
            params={"district": "Buxar", "fo_name": "Santosh Kumar"},
        )
        assert res.status_code == 401

        res_bad_pin = client.get(
            "/api/fo/cohort-compliance-sync",
            params={"district": "Buxar", "fo_name": "Santosh Kumar", "pin": "0000"},
        )
        assert res_bad_pin.status_code == 401


def test_cohort_sync_full_mode_cross_month_and_nikshay():
    """Verify FULL sync aggregates 3 rolling months, cross-month follow-ups, and Nikshay records."""
    fixed_now = datetime(2026, 11, 12, 14, 0, tzinfo=IST)

    rep_rows = [
        {"id": 101, "date_of_reporting": "2026-09-15", "sync_ts": "2026-10-01T09:00:00+00:00"},
        {"id": 102, "date_of_reporting": "2026-10-10", "sync_ts": "2026-10-12T09:00:00+00:00"},
        {"id": 103, "date_of_reporting": "2026-11-05", "sync_ts": "2026-11-06T09:00:00+00:00"},
    ]
    kpi_rows = [
        # Sept cohort
        {"report_id": 101, "category": "notification_ids", "patient_id": "100003"},
        # Oct cohort: 100001 notified in Oct, HIV done in Oct, UDST done later in Nov (cross-month!)
        {"report_id": 102, "category": "notification_ids", "patient_id": "100001"},
        {"report_id": 102, "category": "hiv_dm_ids", "patient_id": "100001"},
        # Nov report: 100002 notified in Nov, AND 100001 UDST completed in Nov
        {"report_id": 103, "category": "notification_ids", "patient_id": "100002"},
        {"report_id": 103, "category": "sample_tested_ids", "patient_id": "100001"},
    ]
    nik_rows = [
        {
            "patient_id": "100001",
            "patient_name": "Ramesh Kumar",
            "phone": "9876543210",
            "hiv_tested": False,
            "dm_tested": False,
            "bank_validated": True,   # DBT via Nikshay portal
            "udst_done": False,
            "contact_tracing_done": False,
            "last_reconciled_at": "2026-11-07T08:00:00+00:00",
        }
    ]

    with patch("backend.routers.travel_allowance.authenticate_fo_or_admin", return_value={"role": "FIELD_OFFICER"}), \
         patch.object(reports_router, "get_ist_now", return_value=fixed_now), \
         patch.object(reports_router, "resolve_staff_and_district_ids", return_value=(12, 3)), \
         patch.object(reports_router, "pg_execute_raw", side_effect=_make_pg_mock(rep_rows, kpi_rows, nik_rows)):

        res = client.get(
            "/api/fo/cohort-compliance-sync?district=Buxar&fo_name=Santosh%20Kumar&pin=1234",
            headers={"Authorization": "Bearer 1234"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["mode"] == "FULL"
        assert data["months"] == ["2026-11", "2026-10", "2026-09"]
        assert data["server_kpi_count"] == 5

        oct_patients = data["months_data"]["2026-10"]["patients"]
        assert "100001" in oct_patients
        p1 = oct_patients["100001"]
        assert p1["name"] == "Ramesh Kumar"
        assert p1["phone"] == "9876543210"
        assert p1["hiv"] is True   # DFY MIS Oct
        assert p1["udst"] is True  # DFY MIS Nov cross-month!
        assert p1["dbt"] is True   # Nikshay verified
        assert p1["ct"] is False

        assert "100002" in data["months_data"]["2026-11"]["patients"]
        assert "100003" in data["months_data"]["2026-09"]["patients"]


def test_cohort_sync_no_change_and_delta_plus_one():
    """Verify NO_CHANGE when cursor is fresh and DELTA (+1) returns ONLY newly touched patient."""
    fixed_now = datetime(2026, 11, 12, 14, 0, tzinfo=IST)
    cursor = "2026-11-12T10:00:00+00:00"

    base_reps = [
        {"id": 101, "date_of_reporting": "2026-09-15", "sync_ts": "2026-10-01T09:00:00+00:00"},
        {"id": 102, "date_of_reporting": "2026-10-10", "sync_ts": "2026-10-12T09:00:00+00:00"},
    ]
    base_kpis = [
        {"report_id": 101, "category": "notification_ids", "patient_id": "100003"},
        {"report_id": 102, "category": "notification_ids", "patient_id": "100001"},
        {"report_id": 102, "category": "hiv_dm_ids", "patient_id": "100001"},
    ]

    # Case 1: Nothing changed since cursor -> NO_CHANGE (~80 bytes)
    with patch("backend.routers.travel_allowance.authenticate_fo_or_admin", return_value={"role": "FIELD_OFFICER"}), \
         patch.object(reports_router, "get_ist_now", return_value=fixed_now), \
         patch.object(reports_router, "resolve_staff_and_district_ids", return_value=(12, 3)), \
         patch.object(reports_router, "pg_execute_raw", side_effect=_make_pg_mock(base_reps, base_kpis, [])):

        res = client.get(
            "/api/fo/cohort-compliance-sync",
            params={
                "district": "Buxar",
                "fo_name": "Santosh Kumar",
                "since": cursor,
                "known_months": "2026-11,2026-10,2026-09",
                "known_kpi_count": 3,
            },
            headers={"Authorization": "Bearer 1234"},
        )
        assert res.status_code == 200
        no_chg = res.json()
        assert no_chg["mode"] == "NO_CHANGE"
        assert "months_data" not in no_chg

    # Case 2: 1 new follow-up report after cursor completes Contact Tracing for Oct patient 100001
    updated_reps = base_reps + [
        {"id": 104, "date_of_reporting": "2026-11-12", "sync_ts": "2026-11-12T11:15:00+00:00"},
    ]
    updated_kpis = base_kpis + [
        {"report_id": 104, "category": "contact_tracing_ids", "patient_id": "100001"},
    ]

    with patch("backend.routers.travel_allowance.authenticate_fo_or_admin", return_value={"role": "FIELD_OFFICER"}), \
         patch.object(reports_router, "get_ist_now", return_value=fixed_now), \
         patch.object(reports_router, "resolve_staff_and_district_ids", return_value=(12, 3)), \
         patch.object(reports_router, "pg_execute_raw", side_effect=_make_pg_mock(updated_reps, updated_kpis, [])):

        res2 = client.get(
            "/api/fo/cohort-compliance-sync",
            params={
                "district": "Buxar",
                "fo_name": "Santosh Kumar",
                "since": cursor,
                "known_months": "2026-11,2026-10,2026-09",
                "known_kpi_count": 3,
            },
            headers={"Authorization": "Bearer 1234"},
        )
        assert res2.status_code == 200
        delta = res2.json()
        assert delta["mode"] == "DELTA"
        assert delta["server_kpi_count"] == 4
        assert len(delta["updated_patients"]) == 1
        assert delta["updated_patients"][0]["id"] == "100001"
        assert delta["updated_patients"][0]["month"] == "2026-10"
        assert delta["updated_patients"][0]["ct"] is True


def test_cohort_sync_deletion_and_rollover_fall_back_to_full():
    """Verify deleted KPI entries or month rollover force safe FULL re-baseline."""
    fixed_now = datetime(2026, 11, 12, 14, 0, tzinfo=IST)
    cursor = "2026-11-12T10:00:00+00:00"
    rep_rows = [{"id": 101, "date_of_reporting": "2026-10-10", "sync_ts": "2026-10-12T09:00:00+00:00"}]
    kpi_rows = [{"report_id": 101, "category": "notification_ids", "patient_id": "100001"}]

    with patch("backend.routers.travel_allowance.authenticate_fo_or_admin", return_value={"role": "FIELD_OFFICER"}), \
         patch.object(reports_router, "get_ist_now", return_value=fixed_now), \
         patch.object(reports_router, "resolve_staff_and_district_ids", return_value=(12, 3)), \
         patch.object(reports_router, "pg_execute_raw", side_effect=_make_pg_mock(rep_rows, kpi_rows, [])):

        # Deletion check: client had 5 KPI rows, server now has 1 -> FULL
        res_del = client.get(
            f"/api/fo/cohort-compliance-sync?district=Buxar&fo_name=Santosh%20Kumar&since={cursor}"
            "&known_months=2026-11,2026-10,2026-09&known_kpi_count=5",
            headers={"Authorization": "Bearer 1234"},
        )
        assert res_del.status_code == 200
        assert res_del.json()["mode"] == "FULL"

        # Rollover check: client had old month window -> FULL
        res_roll = client.get(
            f"/api/fo/cohort-compliance-sync?district=Buxar&fo_name=Santosh%20Kumar&since={cursor}"
            "&known_months=2026-10,2026-09,2026-08&known_kpi_count=1",
            headers={"Authorization": "Bearer 1234"},
        )
        assert res_roll.status_code == 200
        assert res_roll.json()["mode"] == "FULL"


def test_admin_cohort_compliance_3m_super_admin_and_sub_admin_rbac():
    """Verify Super Admin receives all districts while Sub-Admin is strictly scoped to allowed_districts."""
    from backend.core.security import get_current_admin

    fixed_now = datetime(2026, 11, 12, 14, 0, tzinfo=IST)
    rep_rows = [
        {"id": 201, "working_place": "Buxar", "fo_name": "Santosh Kumar", "date_of_reporting": "2026-10-10"},
        {"id": 202, "working_place": "Patna", "fo_name": "Amit Singh", "date_of_reporting": "2026-10-12"},
        {"id": 203, "working_place": "Buxar", "fo_name": "Santosh Kumar", "date_of_reporting": "2026-11-05"},
    ]
    kpi_rows = [
        {"report_id": 201, "category": "notification_ids", "patient_id": "200001"},
        {"report_id": 201, "category": "notification_ids", "patient_id": "200002"},
        {"report_id": 201, "category": "hiv_dm_ids", "patient_id": "200001"},
        # Cross-month UDST completed in Nov for Oct patient 200001
        {"report_id": 203, "category": "sample_tested_ids", "patient_id": "200001"},
        # Patna patient
        {"report_id": 202, "category": "notification_ids", "patient_id": "300001"},
    ]
    nik_rows = [
        {
            "patient_id": "200001",
            "patient_name": "Sunil Das",
            "phone": "9988776655",
            "hiv_tested": False,
            "dm_tested": False,
            "bank_validated": True,
            "udst_done": False,
            "contact_tracing_done": False,
        }
    ]

    # 1. Unauthenticated Admin call -> 401/403
    unauth = client.get("/api/admin/cohort-compliance-3m")
    assert unauth.status_code in (401, 403)

    # 2. Super Admin -> sees BOTH Buxar & Patna
    main.app.dependency_overrides[get_current_admin] = lambda: {"role": "SUPER_ADMIN", "username": "root"}
    with patch.object(reports_router, "get_ist_now", return_value=fixed_now), \
         patch.object(reports_router, "pg_execute_raw", side_effect=_make_pg_mock(rep_rows, kpi_rows, nik_rows)):
        res_super = client.get("/api/admin/cohort-compliance-3m?months=3&force_refresh=true")
        assert res_super.status_code == 200
        body = res_super.json()
        assert body["success"] is True
        dist_names = [d["district"] for d in body["districts"]]
        assert "Buxar" in dist_names
        assert "Patna" in dist_names

        buxar_fo = next(o for o in body["officers"] if o["district"] == "Buxar")
        oct_stats = buxar_fo["months"]["2026-10"]
        assert oct_stats["total_notified"] == 2
        assert oct_stats["target_75"] == 2
        assert oct_stats["indicators"]["hiv"]["done"] == 1
        assert oct_stats["indicators"]["udst"]["done"] == 1  # Nov cross-month
        assert oct_stats["indicators"]["dbt"]["done"] == 1   # Nikshay verified
        assert oct_stats["pending_by_indicator"]["ct"][0]["id"] == "200001"
        assert oct_stats["pending_by_indicator"]["ct"][0]["name"] == "Sunil Das"

    # 3. Sub-Admin restricted to Buxar only -> Patna filtered out + 403 on Patna param
    main.app.dependency_overrides[get_current_admin] = lambda: {
        "role": "SUB_ADMIN",
        "username": "buxar_coord",
        "allowed_districts": ["Buxar"],
    }
    with patch.object(reports_router, "get_ist_now", return_value=fixed_now), \
         patch.object(reports_router, "pg_execute_raw", side_effect=_make_pg_mock(rep_rows, kpi_rows, nik_rows)):
        res_sub = client.get("/api/admin/cohort-compliance-3m?months=3&force_refresh=true")
        assert res_sub.status_code == 200
        sub_body = res_sub.json()
        assert [d["district"] for d in sub_body["districts"]] == ["Buxar"]
        assert all(o["district"] == "Buxar" for o in sub_body["officers"])

        res_cross = client.get("/api/admin/cohort-compliance-3m?district=Patna")
        assert res_cross.status_code == 403

