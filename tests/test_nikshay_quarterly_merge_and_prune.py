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
