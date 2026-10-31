import os
import sys
from pathlib import Path
import pytest

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from backend.core.supabase import pg_execute_raw


def test_diagnosis_date_column_exists(monkeypatch):
    """Verify that column 'diagnosis_date' (data type: date) exists on table 'nikshay_verified_patients'."""
    monkeypatch.setenv("TEST_LIVE_DB", "1")
    
    cols = pg_execute_raw(
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = %s",
        ["nikshay_verified_patients"],
        fetch=True,
    )
    assert cols is not None, "Failed to query information_schema.columns"
    col_dict = {c["column_name"]: c["data_type"] for c in cols}
    assert "diagnosis_date" in col_dict, "Column 'diagnosis_date' does not exist on table nikshay_verified_patients"
    assert col_dict["diagnosis_date"] == "date", f"Expected type 'date' for diagnosis_date, got {col_dict.get('diagnosis_date')}"


def test_monotonic_smart_merge_logic(monkeypatch):
    monkeypatch.setenv("TEST_LIVE_DB", "1")
    from backend.routers.nikshay import sync_nikshay_cumulative_ledger_sync
    from backend.core.supabase import pg_fetch_one, pg_execute_raw

    test_pid = "TEST_MERGE_999999"
    # Clean up test row if exists
    pg_execute_raw("DELETE FROM nikshay_verified_patients WHERE patient_id = %s;", [test_pid])

    # Round 1: Ingest patient with HIV only
    p1 = {
        test_pid: {
            "name": "Ramesh Kumar",
            "phone": "9876543210",
            "district": "Patna",
            "diagnosis_date": "2026-08-15",
            "notification_verified": True,
            "hiv_tested": True,
            "dm_tested": False,
            "hiv_dm_tested": True,
            "bank_validated": False,
            "udst_done": False,
            "contact_tracing_done": False,
            "outcome": ""
        }
    }
    res1 = sync_nikshay_cumulative_ledger_sync(p1, "TestAdmin")
    assert res1["written"] >= 1

    row1 = pg_fetch_one("nikshay_verified_patients", filters={"patient_id": test_pid})
    assert row1["hiv_tested"] is True
    assert row1["udst_done"] is False
    assert str(row1["diagnosis_date"]) == "2026-08-15"

    # Round 2: Ingest same patient with UDST only (HIV not mentioned/False in new sheet)
    p2 = {
        test_pid: {
            "name": "Ramesh Kumar",
            "phone": "9876543210",
            "district": "Patna",
            "diagnosis_date": "2026-08-15",
            "notification_verified": True,
            "hiv_tested": False,
            "dm_tested": False,
            "hiv_dm_tested": False,
            "bank_validated": True,
            "udst_done": True,
            "contact_tracing_done": False,
            "outcome": ""
        }
    }
    res2 = sync_nikshay_cumulative_ledger_sync(p2, "TestAdmin")

    # Verify monotonic accumulation: HIV stayed True, UDST became True, Bank became True
    row2 = pg_fetch_one("nikshay_verified_patients", filters={"patient_id": test_pid})
    assert row2["hiv_tested"] is True, "HIV must remain True (monotonic retention)"
    assert row2["udst_done"] is True, "UDST must be updated to True"
    assert row2["bank_validated"] is True, "Bank must be updated to True"

    # Verify zero duplicates
    counts = pg_execute_raw("SELECT COUNT(*) as c FROM nikshay_verified_patients WHERE patient_id = %s;", [test_pid], fetch=True)
    assert counts[0]["c"] == 1, "Must be exactly 1 row (zero duplicate IDs)"

    # Clean up test row
    pg_execute_raw("DELETE FROM nikshay_verified_patients WHERE patient_id = %s;", [test_pid])

