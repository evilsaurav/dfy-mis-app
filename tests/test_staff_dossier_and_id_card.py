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
