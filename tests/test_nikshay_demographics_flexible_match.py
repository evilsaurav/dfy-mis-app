import io
from pathlib import Path
import sys
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import pandas as pd
import pytest
from unittest.mock import MagicMock, patch
from backend.routers.nikshay import (
    is_name_header,
    is_phone_header,
    sync_nikshay_cumulative_ledger_sync,
)

def test_flexible_name_header_detection():
    # Various real-world Nikshay column naming styles
    assert is_name_header("Patient Name") == True
    assert is_name_header("Name of Patient") == True
    assert is_name_header("Name of the Patient") == True
    assert is_name_header("Beneficiary Name") == True
    assert is_name_header("Case Name") == True
    assert is_name_header("Client Name") == True
    assert is_name_header("patient_name") == True
    assert is_name_header("Name") == True
    
    # Non-name headers
    assert is_name_header("District") == False
    assert is_name_header("Notification Date") == False
    assert is_name_header("HIV Status") == False

def test_flexible_phone_header_detection():
    assert is_phone_header("Primary Phone") == True
    assert is_phone_header("Primary Phone Number") == True
    assert is_phone_header("Mobile No.") == True
    assert is_phone_header("Mobile Number") == True
    assert is_phone_header("Contact No") == True
    assert is_phone_header("Contact Number") == True
    assert is_phone_header("phone") == True
    assert is_phone_header("Cell") == True
    assert is_phone_header("Primary Contact") == True
    
    # Non-phone headers
    assert is_phone_header("Address") == False
    assert is_phone_header("Patient Name") == False


class FakeDocSnapshot:
    def __init__(self, doc_id: str, data: dict, exists: bool = True):
        self.id = doc_id
        self._data = data
        self.exists = exists

    def to_dict(self):
        return self._data


def test_monotonic_retention_name_and_phone():
    """Verify that existing non-empty patient_name and phone are NEVER overwritten by blank strings."""
    mock_db = MagicMock()

    existing_snap = FakeDocSnapshot("PT_DEMO_01", {
        "patient_id": "PT_DEMO_01",
        "patient_name": "Anita Devi",
        "phone": "9876543210",
        "district": "Patna",
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

    with patch("backend.routers.nikshay.db", mock_db):
        # Current record arrives with blank name and blank phone (e.g. from DFY report only)
        # but with new indicator (udst_done = True)
        patients_to_sync = {
            "PT_DEMO_01": {
                "name": "",
                "patient_name": "",
                "phone": "",
                "district": "Patna",
                "notification_verified": True,
                "hiv_tested": True,
                "dm_tested": False,
                "hiv_dm_tested": True,
                "bank_validated": True,
                "udst_done": True,
                "contact_tracing_done": False,
                "outcome": ""
            }
        }
        res = sync_nikshay_cumulative_ledger_sync(patients_to_sync, "admin_test")
        assert res["written"] == 1
        assert batch_mock.set.called

        saved_record = batch_mock.set.call_args[0][1]
        # Must retain Anita Devi and 9876543210!
        assert saved_record["patient_name"] == "Anita Devi"
        assert saved_record["phone"] == "9876543210"
        assert saved_record["udst_done"] is True


@pytest.mark.asyncio
async def test_reconcile_nikshay_enriches_dfy_only_records_with_demographics():
    """Verify that patients reported in DFY but diagnosed outside the selected month still get demographics from upload."""
    import httpx
    from main import app, create_access_token

    token = create_access_token({
        "user_id": "test_admin",
        "username": "test_admin",
        "role": "SUPER_ADMIN",
        "allowed_districts": ["All"]
    })

    # Uploaded excel has 2 patients:
    # 1. PT_CURR: in selected month 2026-09
    # 2. PT_PREV: in previous month 2026-07 (so filtered out of nikshay_patients when month=2026-09)
    df = pd.DataFrame({
        "Episode ID": ["PT_CURR_101", "PT_PREV_202"],
        "Name of the Patient": ["Current Patient", "Previous Month Patient"],
        "Primary Contact Number": ["+91 9111111111", "+91 9222222222"],
        "District": ["Patna", "Patna"],
        "Date of Notification": ["2026-09-10", "2026-07-15"],
        "HIV Tested": ["Yes", "Yes"],
    })
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    buf.seek(0)

    # DFY MIS reports PT_CURR_101 in notifications and PT_PREV_202 with DBT service in September
    fake_dfy_doc = FakeDocSnapshot("dfy_rep_1", {
        "working_place": "Patna",
        "fo_name": "FO Ramesh",
        "date_of_reporting": "2026-09-05",
        "notification_ids": ["PT_CURR_101"],
        "dbt_ids": ["PT_PREV_202"],
    })

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        files = {"file": ("nikshay_export.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        headers = {"Authorization": f"Bearer {token}"}
        
        with patch("main.sync_nikshay_cumulative_ledger_sync") as mock_sync:
            mock_sync.return_value = {"total_processed": 2, "written": 2, "unchanged": 0}
            with patch("main.db.collection") as mock_col:
                mock_col.return_value.where.return_value.where.return_value.stream.return_value = [fake_dfy_doc]
                res = await ac.post("/admin/reconcile-nikshay?month=2026-09&district=Patna", files=files, headers=headers)
                assert res.status_code == 200, f"Error: {res.text}"

                assert mock_sync.called
                patients_to_sync = mock_sync.call_args[0][0]
                
                # PT_CURR_101 was matched/synced directly
                assert "PT_CURR_101" in patients_to_sync
                assert patients_to_sync["PT_CURR_101"]["name"] == "Current Patient"
                assert patients_to_sync["PT_CURR_101"]["phone"] == "9111111111"

                # PT_PREV_202 was outside month=2026-09, but DFY reported it.
                # It MUST have its name and phone enriched from nikshay_demographics_lookup!
                assert "PT_PREV_202" in patients_to_sync
                assert patients_to_sync["PT_PREV_202"]["name"] == "Previous Month Patient"
                assert patients_to_sync["PT_PREV_202"]["phone"] == "9222222222"

