import os
import sys
from pathlib import Path
import pytest

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from backend.core.supabase import pg_execute_raw

@pytest.fixture(autouse=True)
def cleanup_postgres_pool():
    yield
    from backend.core import supabase
    if getattr(supabase, "_postgres_pool", None) is not None:
        try:
            supabase._postgres_pool.closeall()
        except Exception:
            pass

@pytest.mark.asyncio
async def test_staff_directory_schema_has_dossier_columns(monkeypatch):
    """Verify that staff_directory table has all required HR master dossier columns."""
    monkeypatch.setenv("TEST_LIVE_DB", "1")
    cols_raw = pg_execute_raw(
        "SELECT column_name FROM information_schema.columns WHERE table_name = %s;",
        ["staff_directory"],
        fetch=True
    ) or []
    cols = {r["column_name"] for r in cols_raw}

    expected_cols = [
        "id", "name", "district", "pin", "is_active",
        "emp_no", "email", "phone", "blood_group", "dob",
        "date_joined", "gender", "marital_status", "job_title",
        "reporting_to", "reporting_manager_emp_no", "location", "emergency_contact"
    ]

    for col in expected_cols:
        assert col in cols, f"Expected column '{col}' to exist in staff_directory, found: {cols}"

@pytest.mark.asyncio
async def test_seeded_staff_dossier_integrity(monkeypatch):
    """Verify that staff_directory records have been successfully seeded with HR attributes."""
    monkeypatch.setenv("TEST_LIVE_DB", "1")
    rows = pg_execute_raw(
        """
        SELECT id, name, district, emp_no, blood_group, job_title, reporting_to, phone, date_joined
        FROM staff_directory
        WHERE emp_no IS NOT NULL AND is_active = TRUE
        LIMIT 20;
        """,
        fetch=True
    ) or []

    assert len(rows) > 0, "Expected at least 1 staff record with populated emp_no"
    for r in rows:
        assert r["emp_no"].startswith("EP"), f"Invalid emp_no: {r['emp_no']}"
        if r["blood_group"]:
            assert r["blood_group"] in ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], f"Invalid blood_group: {r['blood_group']}"
        assert r["name"], "Staff name must not be empty"

    # Specific check for Aurangabad & Bhojpur multi-name staff
    aurangabad_staff = pg_execute_raw(
        "SELECT name, emp_no, reporting_to FROM staff_directory WHERE district = 'Aurangabad' AND is_active = TRUE;",
        fetch=True
    ) or []
    by_name = {s["name"]: s for s in aurangabad_staff}
    if "Prince Kumar" in by_name and by_name["Prince Kumar"]["emp_no"]:
        assert by_name["Prince Kumar"]["emp_no"] == "EP01898"
        assert by_name["Prince Kumar"]["reporting_to"] == "Shyamsundar Yadav"
    if "Rahul Kumar" in by_name and by_name["Rahul Kumar"]["emp_no"]:
        assert by_name["Rahul Kumar"]["emp_no"] == "EP02962"
        assert by_name["Rahul Kumar"]["reporting_to"] == "Shyamsundar Yadav"

def test_fo_profile_dossier_and_update_endpoints():
    """Verify FO profile-dossier retrieval and contact self-update endpoints."""
    from main import app
    from fastapi.testclient import TestClient
    from unittest.mock import patch

    client = TestClient(app)

    # 1. Invalid PIN should fail
    mock_staff = [{
        "id": 999,
        "name": "Saurav Test FO",
        "district": "Patna",
        "pin": "1234",
        "is_active": True,
        "emp_no": "EP99999",
        "blood_group": "O+",
        "phone": "9876543210",
        "email": "test@dfy.org",
        "job_title": "Field Coordinator",
        "reporting_to": "Supervisor Test"
    }]

    with patch("backend.routers.staff.pg_execute_raw", return_value=mock_staff):
        # Bad PIN
        res_bad_pin = client.get("/fo/profile-dossier", params={
            "district": "Patna",
            "fo_name": "Saurav Test FO",
            "pin": "9999"
        })
        assert res_bad_pin.status_code == 401

        # Good PIN
        res_good = client.get("/fo/profile-dossier", params={
            "district": "Patna",
            "fo_name": "Saurav Test FO",
            "pin": "1234"
        })
        assert res_good.status_code == 200
        data = res_good.json()
        assert data["success"] is True
        assert data["staff"]["emp_no"] == "EP99999"
        assert data["staff"]["blood_group"] == "O+"

    # 2. Validation in FO Contact update
    # Invalid phone format
    with patch("backend.routers.staff.pg_execute_raw", return_value=mock_staff):
        res_bad_phone = client.put("/fo/update-profile-contact", json={
            "district": "Patna",
            "fo_name": "Saurav Test FO",
            "pin": "1234",
            "phone": "12345" # Not 10 digits
        })
        assert res_bad_phone.status_code == 400
        assert "10-digit" in res_bad_phone.json()["detail"]

        # Invalid blood group
        res_bad_bg = client.put("/fo/update-profile-contact", json={
            "district": "Patna",
            "fo_name": "Saurav Test FO",
            "pin": "1234",
            "blood_group": "XYZ"
        })
        assert res_bad_bg.status_code == 400
        assert "blood group" in res_bad_bg.json()["detail"].lower()

    # Valid contact update: mock return with updated blood group
    updated_mock_staff = [{
        **mock_staff[0],
        "blood_group": "B+",
        "phone": "9988776655",
        "emergency_contact": "Brother - 9911223344"
    }]
    with patch("backend.routers.staff.pg_execute_raw", side_effect=[mock_staff, updated_mock_staff]):
        res_update = client.put("/fo/update-profile-contact", json={
            "district": "Patna",
            "fo_name": "Saurav Test FO",
            "pin": "1234",
            "phone": "9988776655",
            "blood_group": "B+",
            "emergency_contact": "Brother - 9911223344"
        })
        assert res_update.status_code == 200
        up_data = res_update.json()
        assert up_data["success"] is True
        assert up_data["staff"]["blood_group"] == "B+"

def test_admin_staff_dossier_update():
    """Verify Admin dossier update endpoint with RBAC check and field validation."""
    from main import app
    from fastapi.testclient import TestClient
    from unittest.mock import patch
    from backend.core.security import get_current_admin

    client = TestClient(app)
    app.dependency_overrides.clear()

    # 1. Unauthenticated should fail with 401
    res_no_auth = client.put("/admin/staff/999/update-dossier", json={
        "blood_group": "AB+"
    })
    assert res_no_auth.status_code in (401, 403)

    # 2. Super admin update success
    admin_mock = {"username": "admin", "role": "SUPER_ADMIN", "allowed_districts": ["All"]}
    mock_staff_row = [{
        "id": 999,
        "name": "Saurav Test FO",
        "district": "Patna",
        "is_active": True,
        "emp_no": "EP99999",
        "blood_group": "O+"
    }]
    updated_staff_row = [{
        "id": 999,
        "name": "Saurav Test FO",
        "district": "Patna",
        "is_active": True,
        "emp_no": "EP99999",
        "blood_group": "AB+"
    }]

    app.dependency_overrides[get_current_admin] = lambda: admin_mock
    try:
        with patch("backend.routers.staff.pg_execute_raw", side_effect=[mock_staff_row, updated_staff_row]), \
             patch("backend.routers.staff.log_admin_activity") as mock_log:
            
            res_admin = client.put("/admin/staff/999/update-dossier", json={
                "blood_group": "AB+",
                "emergency_contact": "Mother - 9876543210"
            })
            assert res_admin.status_code == 200
            data = res_admin.json()
            assert data["success"] is True
            assert data["staff"]["blood_group"] == "AB+"
            assert mock_log.called
    finally:
        app.dependency_overrides.clear()


