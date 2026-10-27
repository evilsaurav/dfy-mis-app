import sys
from pathlib import Path
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from main import app
from backend.core.cache import cache

client = TestClient(app)

def test_verify_pin_unregistered_officer_rejected():
    """Verify that an unregistered officer name with any 4-digit PIN is strictly rejected."""
    cache.clear()
    with patch("backend.routers.auth.get_active_db", return_value=None), \
         patch("backend.routers.auth.pg_execute_raw", return_value=[]), \
         patch("backend.routers.auth.load_baseline_staff_directory", return_value={"Patna": ["Ramesh Kumar"]}):
        
        # Unregistered officer name
        res = client.post("/verify-pin", json={
            "working_place": "Patna",
            "fo_name": "Unknown Fake Officer",
            "pin": "1234"
        })
        assert res.status_code == 200
        data = res.json()
        assert data.get("valid") is False, f"Expected valid: False for unknown officer, got: {data}"

def test_verify_pin_registered_officer_correct_pin():
    """Verify that a registered officer with their correct PIN returns valid: True."""
    cache.clear()
    mock_row = [{"id": 101, "district_id": 1, "name": "Ramesh Kumar", "pin": "4321", "is_active": True}]
    with patch("backend.routers.auth.get_active_db", return_value=None), \
         patch("backend.routers.auth.pg_execute_raw", return_value=mock_row):
        
        res = client.post("/verify-pin", json={
            "working_place": "Patna",
            "fo_name": "Ramesh Kumar",
            "pin": "4321"
        })
        assert res.status_code == 200
        data = res.json()
        assert data.get("valid") is True

def test_verify_pin_registered_officer_wrong_pin():
    """Verify that a registered officer with a wrong PIN returns valid: False."""
    cache.clear()
    mock_row = [{"id": 101, "district_id": 1, "name": "Ramesh Kumar", "pin": "4321", "is_active": True}]
    with patch("backend.routers.auth.get_active_db", return_value=None), \
         patch("backend.routers.auth.pg_execute_raw", return_value=mock_row):
        
        res = client.post("/verify-pin", json={
            "working_place": "Patna",
            "fo_name": "Ramesh Kumar",
            "pin": "9999"
        })
        assert res.status_code == 200
        data = res.json()
        assert data.get("valid") is False

def test_verify_pin_no_universal_4digit_bypass():
    """Verify that when an officer is not in DB, entering a random 4-digit PIN does NOT grant fallback access."""
    cache.clear()
    with patch("backend.routers.auth.get_active_db", return_value=None), \
         patch("backend.routers.auth.pg_execute_raw", return_value=[]), \
         patch("backend.routers.auth.load_baseline_staff_directory", return_value={}):
        
        res = client.post("/verify-pin", json={
            "working_place": "Patna",
            "fo_name": "Ramesh Kumar",
            "pin": "9999"
        })
        assert res.status_code == 200
        data = res.json()
        assert data.get("valid") is False, f"Universal 4-digit bypass triggered! Got: {data}"
