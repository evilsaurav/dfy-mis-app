import pytest
import io
import json
import gzip
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from unittest.mock import MagicMock, patch, AsyncMock
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException
from httpx import AsyncClient, ASGITransport

from main import app, create_access_token
from backend.routers.nikshay import (
    sync_nikshay_cumulative_ledger_sync,
    purge_old_nikshay_records,
)
from backend.core.backup_storage import BackupStorageError


@pytest.fixture
def super_admin_token():
    return create_access_token({
        "user_id": "test_super_admin",
        "username": "superadmin",
        "role": "SUPER_ADMIN",
    })


@pytest.fixture
def regular_fo_token():
    return create_access_token({
        "user_id": "fo_user",
        "username": "fo_user",
        "role": "FIELD_OFFICER",
    })


# =========================================================================
# PART 1 TESTS: Upsert Bug Fix & Conflict Column Restrictions
# =========================================================================

def test_sync_ledger_omits_id_and_uses_patient_id_conflict():
    """Verify merged_record does not include 'id' and calls pg_upsert_row with patient_id conflict."""
    patients_to_sync = {
        "331109479": {
            "name": "Ramesh Kumar",
            "phone": "9876543210",
            "district": "Patna",
            "notification_verified": True,
            "hiv_tested": True,
            "dm_tested": False,
            "hiv_dm_tested": True,
            "bank_validated": True,
            "udst_done": False,
            "contact_tracing_done": False,
            "outcome": "Cured"
        }
    }

    with patch("backend.routers.nikshay.pg_execute_raw", return_value=[]) as mock_pg_exec, \
         patch("backend.routers.nikshay.pg_upsert_row", return_value=True) as mock_upsert:

        res = sync_nikshay_cumulative_ledger_sync(patients_to_sync, "admin_test")

        assert res["written"] == 1
        assert res["total_processed"] == 1

        # Check lookup query used patient_id = ANY(%s), NOT id = ANY(%s)
        assert mock_pg_exec.called
        query_sql, query_params = mock_pg_exec.call_args[0]
        assert "WHERE patient_id = ANY(%s)" in query_sql
        assert query_params == [["331109479"]]

        # Check pg_upsert_row call
        assert mock_upsert.called
        call_table, call_data = mock_upsert.call_args[0][:2]
        call_kwargs = mock_upsert.call_args[1]

        assert call_table == "nikshay_verified_patients"
        # CRITICAL: "id" must NOT be in the data dict (PostgreSQL identity column)
        assert "id" not in call_data
        assert call_data["patient_id"] == "331109479"

        # Conflict resolution must use patient_id
        assert call_kwargs["conflict_columns"] == ["patient_id"]

        # Conflict update columns must be strictly whitelisted
        expected_update_cols = [
            "notification_verified",
            "hiv_tested",
            "dm_tested",
            "bank_validated",
            "udst_done",
            "contact_tracing_done",
            "treatment_outcome",
            "last_reconciled_at",
            "reconciled_by",
        ]
        assert call_kwargs["update_columns"] == expected_update_cols


def test_sync_ledger_only_increments_total_written_on_confirmed_success():
    """Verify total_written does not increment if pg_upsert_row returns False."""
    patients_to_sync = {
        "123456789": {
            "name": "Failed Patient",
            "phone": "9999999999",
            "district": "Gaya",
            "notification_verified": True,
            "hiv_tested": False,
            "dm_tested": False,
            "bank_validated": False,
            "udst_done": False,
            "contact_tracing_done": False,
            "outcome": ""
        }
    }

    with patch("backend.routers.nikshay.pg_execute_raw", return_value=[]), \
         patch("backend.routers.nikshay.pg_upsert_row", return_value=False) as mock_upsert:

        res = sync_nikshay_cumulative_ledger_sync(patients_to_sync, "admin_test")

        assert mock_upsert.called
        # Must report 0 written because database write failed!
        assert res["written"] == 0
        assert res["total_processed"] == 1


# =========================================================================
# PART 2 TESTS: DFY-Reported ID Floating-Point Normalization
# =========================================================================

@pytest.mark.asyncio
async def test_dfy_reported_id_float_suffix_stripping(super_admin_token):
    """Verify that DFY-reported IDs with .0 suffix are normalized to match integer Nikshay IDs."""
    import pandas as pd

    # Mock DFY monthly report with floating-point formatted IDs (e.g. from Excel export)
    mock_dfy_reports = [
        {
            "working_place": "Jehanabad",
            "fo_name": "Test Officer",
            "date_of_reporting": "2026-10-05",
            "notification_ids": ["331109479.0"],  # Has .0 float suffix!
            "hiv_dm_ids": ["331109479.0"],
            "dbt_ids": [],
            "sample_tested_ids": [],
            "sample_collection_ids": [],
            "contact_tracing_ids": [],
            "differentiated_tb_ids": []
        }
    ]

    # Excel file uploaded by admin has integer Episode ID
    excel_data = {
        "Episode ID": [331109479],
        "Patient Name": ["Sammer Arya"],
        "Contact No": ["9876543210"],
        "District": ["Jehanabad"],
        "HIV Status": ["Yes"],
        "Diabetes Status": ["No"],
        "Bank Details Status": ["Validated"],
    }
    df = pd.DataFrame(excel_data)
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    buf.seek(0)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        with patch("backend.routers.nikshay.get_raw_monthly_reports", return_value=mock_dfy_reports), \
             patch("backend.routers.nikshay.sync_nikshay_cumulative_ledger_sync") as mock_sync:
            mock_sync.return_value = {"total_processed": 1, "written": 1, "unchanged": 0}

            files = {"file": ("nikshay_jehanabad.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
            headers = {"Authorization": f"Bearer {super_admin_token}"}

            res = await ac.post("/admin/reconcile-nikshay", files=files, headers=headers)
            assert res.status_code == 200, res.text
            data = res.json()
            summary = data["summary"]

            # Matched count must be 1 because 331109479.0 was normalized to 331109479!
            assert summary["matched_count"] == 1
            assert summary["only_in_dfy_count"] == 0
            assert summary["match_rate_pct"] == 100.0


# =========================================================================
# PART 3 TESTS: 6-Month Retention Google Drive Backup & Manual Purge
# =========================================================================

@pytest.mark.asyncio
async def test_purge_endpoint_requires_super_admin(regular_fo_token):
    """Verify /admin/nikshay/purge-old-records is protected and rejects non-superadmin."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.post(
            "/admin/nikshay/purge-old-records",
            headers={"Authorization": f"Bearer {regular_fo_token}"}
        )
        assert res.status_code == 403


@pytest.mark.asyncio
async def test_purge_dry_run_preview_mode(super_admin_token):
    """Verify dry_run=True returns preview without uploading or deleting rows."""
    fake_old_rows = [
        {"id": 1, "patient_id": "PT_OLD_01", "last_reconciled_at": datetime(2026, 1, 1, tzinfo=timezone.utc)},
        {"id": 2, "patient_id": "PT_OLD_02", "last_reconciled_at": datetime(2026, 1, 15, tzinfo=timezone.utc)},
    ]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        with patch("backend.routers.nikshay.pg_execute_raw", return_value=fake_old_rows) as mock_sql, \
             patch("backend.routers.nikshay.get_storage_provider") as mock_storage:

            res = await ac.post(
                "/admin/nikshay/purge-old-records?dry_run=true",
                headers={"Authorization": f"Bearer {super_admin_token}"}
            )
            assert res.status_code == 200
            data = res.json()

            assert data["dry_run"] is True
            assert data["status"] == "preview"
            assert data["matched_count"] == 2
            assert data["sample_patient_ids"] == ["PT_OLD_01", "PT_OLD_02"]

            # Storage upload must NOT be called in dry run
            mock_storage.assert_not_called()


@pytest.mark.asyncio
async def test_purge_live_execution_backs_up_and_deletes(super_admin_token):
    """Verify dry_run=false backs up to Drive, deletes exact matched rows, and returns link."""
    fake_old_rows = [
        {
            "id": 101,
            "patient_id": "900000001",
            "patient_name": "Old Patient 1",
            "district": "Patna",
            "notification_verified": True,
            "last_reconciled_at": datetime(2026, 1, 10, tzinfo=timezone.utc)
        },
        {
            "id": 102,
            "patient_id": "900000002",
            "patient_name": "Old Patient 2",
            "district": "Patna",
            "notification_verified": False,
            "last_reconciled_at": datetime(2026, 1, 12, tzinfo=timezone.utc)
        }
    ]

    mock_provider = AsyncMock()
    mock_provider.upload.return_value = "drive_file_abc123"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1st call to pg_execute_raw is SELECT, 2nd call is DELETE RETURNING
        def mock_pg(sql, params=None, fetch=False):
            if "SELECT" in sql:
                return fake_old_rows
            if "DELETE" in sql:
                return [{"id": 101}, {"id": 102}]
            return []

        with patch("backend.routers.nikshay.pg_execute_raw", side_effect=mock_pg) as mock_sql, \
             patch("backend.routers.nikshay.get_storage_provider", return_value=mock_provider), \
             patch("backend.routers.nikshay.log_admin_activity") as mock_audit:

            res = await ac.post(
                "/admin/nikshay/purge-old-records?dry_run=false",
                headers={"Authorization": f"Bearer {super_admin_token}"}
            )
            assert res.status_code == 200, res.text
            data = res.json()

            assert data["dry_run"] is False
            assert data["status"] == "success"
            assert data["records_backed_up"] == 2
            assert data["records_deleted"] == 2
            assert data["counts_match"] is True
            assert data["drive_file_id"] == "drive_file_abc123"
            assert "https://drive.google.com/file/d/drive_file_abc123/view" in data["drive_file_link"]

            # Confirm upload was called with compressed bytes
            assert mock_provider.upload.called
            upload_args = mock_provider.upload.call_args[0]
            uploaded_bytes = upload_args[0]
            # Decompress and verify content
            decompressed = gzip.decompress(uploaded_bytes).decode("utf-8")
            payload = json.loads(decompressed)
            assert payload["total_records"] == 2
            assert payload["records"][0]["patient_id"] == "900000001"


@pytest.mark.asyncio
async def test_purge_aborts_deletion_if_drive_upload_fails(super_admin_token):
    """Verify that if Google Drive upload fails, zero records are deleted."""
    fake_old_rows = [
        {"id": 1, "patient_id": "PT_OLD_01", "last_reconciled_at": datetime(2026, 1, 1, tzinfo=timezone.utc)}
    ]

    mock_provider = AsyncMock()
    mock_provider.upload.side_effect = BackupStorageError("upload", "gdrive", "Google Drive network error")

    delete_called = False

    def mock_pg(sql, params=None, fetch=False):
        nonlocal delete_called
        if "SELECT" in sql:
            return fake_old_rows
        if "DELETE" in sql:
            delete_called = True
            return [{"id": 1}]
        return []

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        with patch("backend.routers.nikshay.pg_execute_raw", side_effect=mock_pg), \
             patch("backend.routers.nikshay.get_storage_provider", return_value=mock_provider):

            res = await ac.post(
                "/admin/nikshay/purge-old-records?dry_run=false",
                headers={"Authorization": f"Bearer {super_admin_token}"}
            )
            assert res.status_code == 502
            assert "Google Drive backup failed" in res.json()["detail"]
            # CRITICAL: DELETE must NOT have been called!
            assert delete_called is False
