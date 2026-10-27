import sys
from pathlib import Path
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from main import app, cache, create_access_token

client = TestClient(app)

def make_admin_token(role="SUPER_ADMIN", allowed_districts=None):
    return create_access_token({
        "user_id": "test_admin",
        "username": "test_admin",
        "name": "Super Admin",
        "role": role,
        "allowed_districts": allowed_districts or ["All"]
    })

def test_submit_report_with_correct_pin_succeeds():
    """Verify that an active Field Officer with their correct PIN submits successfully."""
    cache.clear()
    mock_staff = [{"id": 101, "district": "Patna", "name": "Ramesh Kumar", "pin": "5678", "is_active": True}]
    mock_report = [{"id": 201}]
    
    def mock_pg(query, params=None, fetch=False):
        q = str(query).lower()
        if "staff_directory" in q:
            return mock_staff
        if "daily_field_reports" in q:
            return mock_report
        return [{"id": 201}]

    with patch("backend.routers.reports.pg_execute_raw", side_effect=mock_pg), \
         patch("backend.routers.reports.pg_upsert_row", return_value=True), \
         patch("backend.routers.reports.pg_fetch_one", return_value={"id": 201}):
        
        payload = {
            "working_place": "Patna",
            "fo_name": "Ramesh Kumar",
            "pin": "5678",
            "date_of_reporting": "2026-10-27",
            "notification_ids": ["123456789"],
            "remark": "Test submission"
        }
        res = client.post("/submit-daily-report", json=payload)
        assert res.status_code == 200, f"Expected 200, got: {res.status_code} - {res.text}"
        data = res.json()
        assert "Daily report submitted successfully" in data.get("message", "")

def test_submit_report_with_wrong_pin_fails():
    """Verify that submitting a report with an incorrect PIN is strictly rejected with 401."""
    cache.clear()
    mock_staff = [{"id": 101, "district": "Patna", "name": "Ramesh Kumar", "pin": "5678", "is_active": True}]
    
    with patch("backend.routers.reports.pg_execute_raw", return_value=mock_staff), \
         patch("backend.routers.reports.pg_fetch_one", return_value=None):
        
        payload = {
            "working_place": "Patna",
            "fo_name": "Ramesh Kumar",
            "pin": "0000", # Wrong PIN
            "date_of_reporting": "2026-10-27",
            "notification_ids": ["123456789"],
            "remark": "Test submission"
        }
        res = client.post("/submit-daily-report", json=payload)
        assert res.status_code == 401, f"Expected 401 Unauthorized for wrong PIN, got: {res.status_code} - {res.text}"
        assert "PIN verification failed" in res.json().get("detail", "")

def test_submit_report_with_missing_pin_fails():
    """Verify that submitting a report with empty PIN is rejected with 401."""
    cache.clear()
    payload = {
        "working_place": "Patna",
        "fo_name": "Ramesh Kumar",
        "pin": "",
        "date_of_reporting": "2026-10-27",
        "notification_ids": ["123456789"],
        "remark": "Test submission"
    }
    res = client.post("/submit-daily-report", json=payload)
    assert res.status_code == 401
    assert "PIN authorization is required" in res.json().get("detail", "")

def test_submit_report_admin_token_override():
    """Verify that an authenticated Admin with dual-auth token can submit on behalf of FO without PIN."""
    cache.clear()
    admin_token = make_admin_token(role="SUPER_ADMIN")
    mock_report = [{"id": 301}]
    
    def mock_pg(query, params=None, fetch=False):
        return mock_report

    with patch("backend.routers.reports.pg_execute_raw", side_effect=mock_pg), \
         patch("backend.routers.reports.pg_upsert_row", return_value=True), \
         patch("backend.routers.reports.pg_fetch_one", return_value={"id": 301}):
        
        payload = {
            "working_place": "Patna",
            "fo_name": "Ramesh Kumar",
            "pin": "", # Admin override
            "date_of_reporting": "2026-10-27",
            "notification_ids": ["123456789"],
            "remark": "Admin override entry"
        }
        res = client.post(
            "/submit-daily-report",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert res.status_code == 200, f"Expected 200 for Admin override, got: {res.status_code} - {res.text}"
