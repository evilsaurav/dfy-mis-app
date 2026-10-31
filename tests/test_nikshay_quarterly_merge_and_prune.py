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
        supabase._postgres_pool = None


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


def test_quarterly_multi_month_detection():
    """Verify that extract_months_from_date_series parses dates spanning July, August, September
    (handling None, NaT, formatted strings, timestamps) and returns sorted ['2026-07', '2026-08', '2026-09']."""
    import pandas as pd
    from datetime import datetime
    from backend.routers.nikshay import extract_months_from_date_series

    dates = pd.Series([
        "2026-07-01",
        "2026-07-15",
        "15/08/2026",
        "2026-09-30 10:00:00",
        None,
        pd.NaT,
        "invalid_date",
        datetime(2026, 8, 20),
        pd.Timestamp("2026-07-25"),
    ])

    months = extract_months_from_date_series(dates)
    assert months == ["2026-07", "2026-08", "2026-09"], f"Expected ['2026-07', '2026-08', '2026-09'], got {months}"


def test_target_reconcile_column_filter():
    """Verify that is_target_reconcile_column accepts target reconciliation columns and rejects unrelated ones."""
    from backend.routers.nikshay import is_target_reconcile_column

    assert is_target_reconcile_column("Episode ID") is True
    assert is_target_reconcile_column("Spectrum_Diagnosis_Date") is True
    assert is_target_reconcile_column("Patient Name") is True
    assert is_target_reconcile_column("PrimaryPhone") is True
    assert is_target_reconcile_column("District") is True
    assert is_target_reconcile_column("HIV_Tested") is True
    assert is_target_reconcile_column("Bank_Validated") is True
    assert is_target_reconcile_column("UDST_Done") is True
    assert is_target_reconcile_column("Contact_Tracing_Done") is True
    assert is_target_reconcile_column("Treatment_Outcome") is True

    # Irrelevant / heavy metadata columns should be filtered out to save RAM
    assert is_target_reconcile_column("Random_Comments_Column") is False
    assert is_target_reconcile_column("Blood_Pressure_Reading") is False
    assert is_target_reconcile_column("Internal_Facility_Hierarchy_Code") is False


@pytest.mark.asyncio
async def test_reconcile_nikshay_multi_month_and_telemetry(monkeypatch):
    """Verify reconcile_nikshay handles multi-month detection, passes diagnosis_date, and logs telemetry to nikshay_sync_runs."""
    monkeypatch.setenv("TEST_LIVE_DB", "1")
    import io
    from unittest.mock import patch, AsyncMock
    from fastapi import UploadFile
    from backend.routers.nikshay import reconcile_nikshay
    from backend.core.supabase import pg_execute_raw

    csv_content = (
        "Episode ID,Patient Name,PrimaryPhone,District,Spectrum_Diagnosis_Date,HIV_Tested\n"
        "9998881,Patient One,9876543210,Patna,2026-07-15,Yes\n"
        "9998882,Patient Two,9876543211,Patna,2026-08-20,No\n"
    ).encode("utf-8")

    upload_file = UploadFile(filename="nikshay_q3_test.csv", file=io.BytesIO(csv_content))

    # Clean up prior test data if exists
    pg_execute_raw("DELETE FROM nikshay_sync_runs WHERE filename = %s;", ["nikshay_q3_test.csv"])
    pg_execute_raw("DELETE FROM nikshay_verified_patients WHERE patient_id IN ('9998881', '9998882');")

    with patch("backend.routers.nikshay.get_raw_monthly_reports", new_callable=AsyncMock) as mock_get_reports:
        mock_get_reports.return_value = []

        res = await reconcile_nikshay(
            file=upload_file,
            month="All",
            district="Patna",
            admin={"username": "TestReconcileAdmin", "role": "SUPER_ADMIN", "user_id": "test_recon_1"}
        )

        assert res["success"] is True
        summary = res["summary"]
        assert summary["is_quarterly"] is True
        assert "2026-07" in summary["target_months"]
        assert "2026-08" in summary["target_months"]
        assert summary["total_nikshay_uploaded"] == 2

        # Check telemetry logged into nikshay_sync_runs table
        runs = pg_execute_raw(
            "SELECT * FROM nikshay_sync_runs WHERE filename = %s ORDER BY id DESC LIMIT 1;",
            ["nikshay_q3_test.csv"],
            fetch=True
        )
        assert len(runs) == 1
        assert runs[0]["synced_by"] == "TestReconcileAdmin"
        assert str(runs[0]["report_month"]) == "2026-07-01"

        # Check patient ledger has diagnosis_date stored
        pt_rows = pg_execute_raw(
            "SELECT patient_id, diagnosis_date FROM nikshay_verified_patients WHERE patient_id IN ('9998881', '9998882') ORDER BY patient_id;",
            fetch=True
        )
        assert len(pt_rows) == 2
        assert str(pt_rows[0]["diagnosis_date"]) == "2026-07-15"
        assert str(pt_rows[1]["diagnosis_date"]) == "2026-08-20"

        # Clean up telemetry run and test patients
        pg_execute_raw("DELETE FROM nikshay_sync_runs WHERE filename = %s;", ["nikshay_q3_test.csv"])
        pg_execute_raw("DELETE FROM nikshay_verified_patients WHERE patient_id IN ('9998881', '9998882');")



