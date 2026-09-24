import asyncio
import io
import re
from datetime import datetime
from unittest.mock import MagicMock, patch
import pandas as pd
import pytest
import httpx
from pathlib import Path
import sys

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from main import (
    app,
    cache,
    create_access_token,
    sync_nikshay_cumulative_ledger_sync,
    get_patient_journey,
)

def make_admin_token(role: str = "SUPER_ADMIN", allowed_districts=None):
    return create_access_token({
        "user_id": "super_admin_test",
        "username": "super_admin_test",
        "role": role,
        "allowed_districts": allowed_districts or ["All"]
    })

class FakeDocSnapshot:
    def __init__(self, doc_id: str, data: dict, exists: bool = True):
        self.id = doc_id
        self._data = data
        self.exists = exists

    def to_dict(self):
        return self._data

@pytest.fixture(autouse=True)
def clear_caches():
    cache.delete_prefix("journey_")
    cache.delete_prefix("ledger_")
    yield
    cache.delete_prefix("journey_")
    cache.delete_prefix("ledger_")


# =========================================================================
# 1. Phone & Name Column Detection & Phone Sanitization Tests
# =========================================================================

def test_phone_sanitization_rules():
    """Verify phone sanitization strips non-digits, decimals, country codes, keeping last 10 digits."""
    test_cases = [
        ("9876543210.0", "9876543210"),
        ("+919876543210", "9876543210"),
        ("919876543210", "9876543210"),
        ("09876543210", "9876543210"),
        ("+91 98765 43210", "9876543210"),
        ("98765-43210", "9876543210"),
        ("9876543210", "9876543210"),
        (9876543210, "9876543210"),
        (9876543210.0, "9876543210"),
        ("", ""),
        (None, ""),
        ("12345", "12345"),
    ]

    for raw, expected in test_cases:
        if raw is None or pd.isna(raw):
            sanitized = ""
        else:
            sanitized = re.sub(r'\D', '', str(raw).split(".")[0])[-10:]
        assert sanitized == expected, f"Failed for {raw}: got {sanitized}, expected {expected}"


@pytest.mark.asyncio
async def test_reconcile_nikshay_column_aliases_and_phone_sanitization():
    """Verify that reconcile_nikshay detects various phone & name aliases and sanitizes phone numbers."""
    headers_variants = [
        {"id": "episode_id", "name": "beneficiary_name", "phone": "contact_no"},
        {"id": "nikshay_id", "name": "patientname", "phone": "patient_mobile"},
        {"id": "patient_id", "name": "case_name", "phone": "beneficiary_mobile"},
        {"id": "tb_id", "name": "name", "phone": "mobile"},
        {"id": "episodeid", "name": "patient", "phone": "cell"},
        {"id": "episode_id", "name": "patient_name", "phone": "contact_number"},
    ]

    token = make_admin_token()

    for idx, cols in enumerate(headers_variants):
        data = {
            cols["id"]: [f"PT99900{idx}"],
            cols["name"]: [f"Test Patient {idx}"],
            cols["phone"]: ["+91 98765 43210.0"],
            "district": ["Patna"],
            "date": ["2026-09-01"],
            "hiv_tested": ["Yes"],
            "bank_validated": ["Yes"],
        }
        df = pd.DataFrame(data)
        excel_buffer = io.BytesIO()
        df.to_excel(excel_buffer, index=False)
        excel_buffer.seek(0)

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            files = {"file": (f"test_nikshay_{idx}.xlsx", excel_buffer.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
            headers = {"Authorization": f"Bearer {token}"}
            
            with patch("main.sync_nikshay_cumulative_ledger_sync") as mock_sync:
                mock_sync.return_value = {"total_processed": 1, "written": 1, "unchanged": 0}
                with patch("main.db.collection") as mock_col:
                    mock_col.return_value.where.return_value.where.return_value.stream.return_value = []
                    res = await ac.post("/admin/reconcile-nikshay", files=files, headers=headers)
                    assert res.status_code == 200, f"Variant {cols} failed: {res.text}"
                    
                    # Verify patients_to_sync passed into sync_nikshay_cumulative_ledger_sync
                    assert mock_sync.called
                    call_args = mock_sync.call_args[0]
                    patients_to_sync = call_args[0]
                    pid = f"PT99900{idx}"
                    assert pid in patients_to_sync, f"Expected {pid} in synced patients"
                    assert patients_to_sync[pid]["name"] == f"Test Patient {idx}"
                    # Phone must be sanitized to 10 digits
                    assert patients_to_sync[pid]["phone"] == "9876543210"


# =========================================================================
# 2. Cumulative Ledger Persistence Tests (sync_nikshay_cumulative_ledger_sync)
# =========================================================================

def test_sync_ledger_detects_name_and_phone_changes_and_persists():
    """Verify sync_nikshay_cumulative_ledger_sync writes docs when name or phone changes."""
    mock_db = MagicMock()
    
    # Existing doc has old name and phone
    existing_snap = FakeDocSnapshot("PT1001", {
        "patient_id": "PT1001",
        "patient_name": "Old Name",
        "phone": "9111111111",
        "district": "Gaya",
        "notification_verified": True,
        "hiv_tested": True,
        "dm_tested": False,
        "hiv_dm_tested": True,
        "bank_validated": True,
        "udst_done": False,
        "contact_tracing_done": False,
    }, exists=True)
    
    mock_db.get_all.return_value = [existing_snap]
    batch_mock = MagicMock()
    mock_db.batch.return_value = batch_mock

    with patch("main.db", mock_db):
        patients_to_sync = {
            "PT1001": {
                "name": "New Name",
                "phone": "9999999999",
                "district": "Gaya",
                "notification_verified": True,
                "hiv_tested": True,
                "dm_tested": False,
                "hiv_dm_tested": True,
                "bank_validated": True,
                "udst_done": False,
                "contact_tracing_done": False,
                "outcome": ""
            }
        }
        res = sync_nikshay_cumulative_ledger_sync(patients_to_sync, "admin_test")
        assert res["written"] == 1
        assert res["unchanged"] == 0
        
        # Verify batch.set payload
        assert batch_mock.set.called
        set_args = batch_mock.set.call_args[0]
        saved_record = set_args[1]
        assert saved_record["patient_name"] == "New Name"
        assert saved_record["phone"] == "9999999999"


def test_sync_ledger_unchanged_when_name_and_phone_match():
    """Verify sync_nikshay_cumulative_ledger_sync skips write when name and phone already match."""
    mock_db = MagicMock()
    
    existing_snap = FakeDocSnapshot("PT1002", {
        "patient_id": "PT1002",
        "patient_name": "Same Name",
        "phone": "9876543210",
        "district": "Gaya",
        "notification_verified": True,
        "hiv_tested": True,
        "dm_tested": False,
        "hiv_dm_tested": True,
        "bank_validated": True,
        "udst_done": False,
        "contact_tracing_done": False,
    }, exists=True)
    
    mock_db.get_all.return_value = [existing_snap]
    batch_mock = MagicMock()
    mock_db.batch.return_value = batch_mock

    with patch("main.db", mock_db):
        patients_to_sync = {
            "PT1002": {
                "name": "Same Name",
                "phone": "9876543210",
                "district": "Gaya",
                "notification_verified": True,
                "hiv_tested": True,
                "dm_tested": False,
                "hiv_dm_tested": True,
                "bank_validated": True,
                "udst_done": False,
                "contact_tracing_done": False,
                "outcome": ""
            }
        }
        res = sync_nikshay_cumulative_ledger_sync(patients_to_sync, "admin_test")
        assert res["written"] == 0
        assert res["unchanged"] == 1
        assert not batch_mock.set.called


# =========================================================================
# 3. Patient Journey API Exposure Tests (get_patient_journey)
# =========================================================================

@pytest.mark.asyncio
async def test_get_patient_journey_exposes_name_and_phone():
    """Verify /api/reports/patient-journey/{patient_id} exposes patient_name and phone in metadata."""
    clean_id = "PT777001"
    
    mock_ledger_doc = FakeDocSnapshot(clean_id, {
        "patient_id": clean_id,
        "patient_name": "Ramesh Kumar",
        "phone": "9876543210",
        "district": "Patna",
        "notification_verified": True,
        "bank_validated": True,
        "hiv_tested": True,
    }, exists=True)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        with patch("main.db.collection") as mock_col:
            # Mock get for nikshay_verified_patients
            mock_doc_ref = MagicMock()
            mock_doc_ref.get.return_value = mock_ledger_doc
            mock_col.return_value.document.return_value = mock_doc_ref
            
            # Mock stream for daily_field_reports
            mock_col.return_value.where.return_value.where.return_value.stream.return_value = []
            
            res = await ac.get(f"/api/reports/patient-journey/{clean_id}")
            assert res.status_code == 200
            data = res.json()
            assert data["success"] is True
            assert "metadata" in data
            meta = data["metadata"]
            assert meta["patient_name"] == "Ramesh Kumar"
            assert meta["phone"] == "9876543210"


@pytest.mark.asyncio
async def test_get_patient_journey_empty_when_no_ledger_record():
    """Verify metadata contains patient_name and phone keys even if ledger record is absent."""
    clean_id = "PT999999"
    
    mock_ledger_doc = FakeDocSnapshot(clean_id, {}, exists=False)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        with patch("main.db.collection") as mock_col:
            mock_doc_ref = MagicMock()
            mock_doc_ref.get.return_value = mock_ledger_doc
            mock_col.return_value.document.return_value = mock_doc_ref
            
            # Mock stream for daily_field_reports
            mock_col.return_value.where.return_value.stream.return_value = []
            
            res = await ac.get(f"/api/reports/patient-journey/{clean_id}")
            assert res.status_code == 200
            data = res.json()
            assert data["success"] is True
            assert "metadata" in data
            meta = data["metadata"]
            assert "patient_name" in meta
            assert "phone" in meta
            assert meta["patient_name"] == ""
            assert meta["phone"] == ""
