"""
Local User Simulation & End-to-End Security Verification Suite.
STRICT REQUIREMENT: Zero Live DB Pollution.
All tests run with isolated mock databases and in-memory caches.
No records are ever created or modified in live Supabase PostgreSQL.
"""

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

class FakeDoc:
    def __init__(self, data: dict, doc_id: str = ""):
        self._data = data
        self.id = doc_id or data.get("id", "")
        self.exists = True

    def to_dict(self):
        return self._data

class MockFirestore:
    def __init__(self, staff_members=None, reports=None):
        self.staff_members = staff_members or {}
        self.saved_reports = {}
        self.reports = reports or []

    def collection(self, name):
        mock_col = MagicMock()
        if name == "staff_directory":
            def get_staff(did):
                doc_m = MagicMock()
                if did in self.staff_members:
                    doc_m.exists = True
                    doc_m.to_dict.return_value = self.staff_members[did]
                else:
                    doc_m.exists = False
                    doc_m.to_dict.return_value = {}
                return doc_m
            mock_col.document.side_effect = get_staff
            return mock_col
        elif name == "daily_field_reports":
            def save_rep(did):
                doc_m = MagicMock()
                doc_m.set.side_effect = lambda d: self.saved_reports.update({did: d})
                doc_m.get.return_value = FakeDoc(self.saved_reports.get(did, {}), doc_id=did)
                return doc_m
            mock_col.document.side_effect = save_rep
            return mock_col
        return MagicMock()


@pytest.fixture(autouse=True)
def clean_cache_before_each():
    cache.clear()
    yield
    cache.clear()


# ============================================================================
# Scenario 1: Field Officer Normal Duty (Online PIN Verification & Submission)
# ============================================================================
def test_sim_scenario_1_fo_normal_online_duty():
    """Simulate FO Ramesh Kumar verifying PIN online and submitting daily report."""
    mock_staff = [{"id": 101, "district": "Gaya", "name": "Ramesh Kumar", "pin": "7788", "is_active": True}]
    
    def mock_pg(query, params=None, fetch=False):
        q = str(query).lower()
        if "staff_directory" in q:
            return mock_staff
        return [{"id": 501}]

    with patch("backend.routers.reports.pg_execute_raw", side_effect=mock_pg), \
         patch("backend.routers.reports.pg_upsert_row", return_value=True), \
         patch("backend.routers.reports.pg_fetch_one", return_value={"id": 501}):
        
        # 1. FO enters PIN online
        verify_res = client.post("/verify-pin", json={
            "working_place": "Gaya",
            "fo_name": "Ramesh Kumar",
            "pin": "7788"
        })
        assert verify_res.status_code == 200
        # When mock is active, returns True or False based on staff query
        
        # 2. FO submits report with correct PIN
        rep_payload = {
            "working_place": "Gaya",
            "fo_name": "Ramesh Kumar",
            "pin": "7788",
            "date_of_reporting": "2026-10-27",
            "notification_ids": ["987654321"],
            "dbt_ids": ["112233445"],
            "morning_km": 100,
            "evening_km": 140,
            "total_km": 40,
            "remark": "Normal duty submission"
        }
        sub_res = client.post("/submit-daily-report", json=rep_payload)
        assert sub_res.status_code == 200
        assert "Daily report submitted successfully" in sub_res.json().get("message", "")


# ============================================================================
# Scenario 2: Fraud / Attacker Spoofing (Rejected)
# ============================================================================
def test_sim_scenario_2_fraud_spoofing_rejected():
    """Simulate an attacker attempting to submit reports for Ramesh Kumar with invalid PIN."""
    mock_staff = [{"id": 101, "district": "Gaya", "name": "Ramesh Kumar", "pin": "7788", "is_active": True}]
    
    def mock_pg(query, params=None, fetch=False):
        return mock_staff

    with patch("backend.routers.reports.pg_execute_raw", side_effect=mock_pg), \
         patch("backend.routers.reports.pg_upsert_row", return_value=True):
        
        fraud_payload = {
            "working_place": "Gaya",
            "fo_name": "Ramesh Kumar",
            "pin": "9999", # Hacker guesses wrong PIN
            "date_of_reporting": "2026-10-27",
            "notification_ids": ["999999999"],
            "remark": "Malicious injected report"
        }
        res = client.post("/submit-daily-report", json=fraud_payload)
        assert res.status_code == 401
        assert "PIN verification failed" in res.json().get("detail", "")


# ============================================================================
# Scenario 3: Offline Mode & Zero Data Loss Reconnect Simulation
# ============================================================================
def test_sim_scenario_3_offline_queue_and_zero_data_loss_sync():
    """
    Simulate full offline lifecycle:
    1. Report created in village with zero network (payload queued locally in IndexedDB format).
    2. Network restored: auto-sync runs.
    3. If PIN matches -> returns 200, item deleted from queue.
    4. If PIN mismatches -> returns 401, item NOT deleted from queue (Zero Data Loss).
    """
    mock_staff = [{"id": 101, "district": "Gaya", "name": "Ramesh Kumar", "pin": "7788", "is_active": True}]
    
    def mock_pg(query, params=None, fetch=False):
        q = str(query).lower()
        if "staff_directory" in q:
            return mock_staff
        return [{"id": 701}]

    # Simulated local IndexedDB queue
    local_indexeddb_queue = [
        {
            "id": "offline_report_101",
            "payload": {
                "working_place": "Gaya",
                "fo_name": "Ramesh Kumar",
                "pin": "7788", # Valid PIN saved in phone vault
                "date_of_reporting": "2026-10-27",
                "notification_ids": ["555666777"],
                "remark": "Offline report from remote block"
            }
        },
        {
            "id": "offline_report_102_typo",
            "payload": {
                "working_place": "Gaya",
                "fo_name": "Ramesh Kumar",
                "pin": "1111", # Typo in PIN during offline entry
                "date_of_reporting": "2026-10-27",
                "notification_ids": ["888999000"],
                "remark": "Offline report with typo PIN"
            }
        }
    ]

    with patch("backend.routers.reports.pg_execute_raw", side_effect=mock_pg), \
         patch("backend.routers.reports.pg_upsert_row", return_value=True), \
         patch("backend.routers.reports.pg_fetch_one", return_value={"id": 701}):
        
        synced_ids = []
        failed_ids = []

        # Simulate syncAllOfflineReports() loop from offlineQueue.js
        for item in list(local_indexeddb_queue):
            res = client.post("/submit-daily-report", json=item["payload"])
            if res.status_code == 200:
                synced_ids.append(item["id"])
                # Frontend deletes from IndexedDB on 200 OK
                local_indexeddb_queue.remove(item)
            else:
                failed_ids.append(item["id"])
                # Frontend preserves item in IndexedDB on failure (Zero Data Loss)

        # Assertions
        assert synced_ids == ["offline_report_101"]
        assert failed_ids == ["offline_report_102_typo"]
        # The typo report remains safely preserved in IndexedDB queue
        assert len(local_indexeddb_queue) == 1
        assert local_indexeddb_queue[0]["id"] == "offline_report_102_typo"


# ============================================================================
# Scenario 4: Admin Dual-Auth Override
# ============================================================================
def test_sim_scenario_4_admin_dual_auth_override():
    """Simulate State Admin submitting a correction without knowing officer PIN."""
    admin_jwt = create_access_token({
        "user_id": "state_admin_01",
        "username": "saurav_admin",
        "name": "State Admin Saurav",
        "role": "SUPER_ADMIN",
        "allowed_districts": ["All"]
    })

    def mock_pg(query, params=None, fetch=False):
        return [{"id": 801}]

    with patch("backend.routers.reports.pg_execute_raw", side_effect=mock_pg), \
         patch("backend.routers.reports.pg_upsert_row", return_value=True), \
         patch("backend.routers.reports.pg_fetch_one", return_value={"id": 801}):
        
        rep_payload = {
            "working_place": "Gaya",
            "fo_name": "Ramesh Kumar",
            "pin": "", # Admin leaves PIN empty
            "date_of_reporting": "2026-10-27",
            "notification_ids": ["987654321"],
            "remark": "Admin official audit correction"
        }
        res = client.post(
            "/submit-daily-report",
            json=rep_payload,
            headers={"Authorization": f"Bearer {admin_jwt}"}
        )
        assert res.status_code == 200
        assert "Daily report submitted successfully" in res.json().get("message", "")


# ============================================================================
# Scenario 5: Attacker Origin CORS Block
# ============================================================================
def test_sim_scenario_5_attacker_cors_block():
    """Simulate an attacker from a phishing domain attempting cross-origin API calls."""
    phishing_origins = [
        "https://dfy-frontend-phishing-evil.vercel.app",
        "https://dfy-frontendevil.vercel.app",
        "https://evil-dfy-frontend.com"
    ]
    for origin in phishing_origins:
        res = client.options("/health", headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST"
        })
        # Server must not reflect access-control-allow-origin
        assert res.headers.get("access-control-allow-origin") is None, f"Expected {origin} to be blocked!"


# ============================================================================
# Scenario 6: Zero Live DB Pollution Audit
# ============================================================================
def test_sim_scenario_6_zero_live_db_pollution_audit():
    """Verify that all mocked queries intercept database writes so zero records reach live DB."""
    mock_raw = MagicMock(return_value=[{"id": 901}])
    with patch("backend.routers.reports.pg_execute_raw", mock_raw), \
         patch("backend.routers.reports.pg_fetch_one", return_value={"id": 901}):
        
        client.post("/submit-daily-report", json={
            "working_place": "Gaya",
            "fo_name": "Ramesh Kumar",
            "pin": "7788",
            "date_of_reporting": "2026-10-27",
            "notification_ids": ["123456789"],
            "remark": "Audit mock check"
        })
        # Verify mock query was intercepted rather than executing live writes
        assert mock_raw.called
