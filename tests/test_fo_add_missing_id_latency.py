import sys
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch
import httpx

import main
from main import app, hash_password


class FakeDoc:
    def __init__(self, data_dict, doc_id="fake_id", exists=True):
        self._data = data_dict or {}
        self.id = doc_id
        self.exists = exists

    def to_dict(self):
        return dict(self._data)

    def get(self, key=None, default=None):
        if key is None:
            return self
        return self._data.get(key, default)

    @property
    def reference(self):
        return self

    def update(self, fields):
        self._data.update(fields)


class MockFirestore:
    def __init__(self, reports=None, staff_members=None):
        self.reports = reports or []
        self.staff_members = staff_members or {}
        self.added_logs = []
        self.rollups = {}

    def collection(self, name):
        mock_col = MagicMock()
        if name == "staff_directory":
            def get_staff_doc(doc_id):
                doc_mock = MagicMock()
                if doc_id in self.staff_members:
                    data = self.staff_members[doc_id]
                    doc_mock.exists = True
                    doc_mock.to_dict.return_value = data
                else:
                    doc_mock.exists = False
                    doc_mock.to_dict.return_value = {}
                return doc_mock
            mock_col.document.side_effect = lambda did: MagicMock(get=lambda: get_staff_doc(did))
            return mock_col

        elif name == "daily_field_reports":
            def get_report_doc(doc_id):
                for r in self.reports:
                    if r.id == doc_id and r.exists:
                        return r
                return FakeDoc({}, doc_id=doc_id, exists=False)

            mock_col.document.side_effect = lambda did: get_report_doc(did)
            return mock_col

        elif name in ("id_edit_logs", "admin_audit_logs"):
            mock_col.add.side_effect = lambda item: self.added_logs.append((name, item))
            return mock_col

        elif name == "daily_district_rollups":
            def get_rollup(doc_id):
                mock_r = MagicMock()
                mock_r.update.side_effect = lambda u: self.rollups.setdefault(doc_id, {}).update(u)
                return mock_r
            mock_col.document.side_effect = get_rollup
            return mock_col

        return MagicMock()


@pytest.mark.asyncio
async def test_fo_add_missing_id_latency_under_100ms():
    """
    TASK 1 & TASK 4 Verification:
    Field Officer uses 'Add Missing ID' on POST /api/reports/edit-id.
    Must succeed with 200 OK and complete in < 100ms with zero remote Firestore stream hanging.
    """
    now_utc = datetime.now(timezone.utc)
    recent_ts = (now_utc - timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")

    doc_id = "patna_saurav_kumar_2026-10-04"
    report_doc = FakeDoc({
        "working_place": "Patna",
        "fo_name": "Saurav Kumar",
        "date_of_reporting": "2026-10-04",
        "timestamp_completed": recent_ts,
        "notification_ids": ["100000001", "100000002"],
        "notifications": 2
    }, doc_id=doc_id, exists=True)

    staff_dict = {
        "patna_sauravkumar": {
            "pin": "1234",
            "name": "Saurav Kumar",
            "district": "Patna"
        }
    }

    mock_db = MockFirestore(reports=[report_doc], staff_members=staff_dict)

    payload = {
        "working_place": "Patna",
        "fo_name": "Saurav Kumar",
        "date": "2026-10-04",
        "category": "notification_ids",
        "action": "add",
        "new_id": "999111222",
        "pin": "1234",
        "edited_by": "FO"
    }

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            # Warm up ASGI routing once
            await ac.get("/api/health")

            start_t = time.perf_counter()
            res = await ac.post("/api/reports/edit-id", json=payload)
            elapsed_ms = (time.perf_counter() - start_t) * 1000.0

            assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
            data = res.json()
            assert data["success"] is True
            assert "999111222" in data["updated_ids"]
            assert len(data["updated_ids"]) == 3
            # Strict latency guarantee: < 100ms
            assert elapsed_ms < 100.0, f"FO Add Missing ID took {elapsed_ms:.2f}ms, expected < 100ms!"


@pytest.mark.asyncio
async def test_fo_add_missing_id_with_space_in_fo_name():
    """
    Bug verification: Spaces in fo_name ('Saurav Kumar') must not cause
    'No report found for this date and officer' due to regex space stripping.
    """
    now_utc = datetime.now(timezone.utc)
    recent_ts = (now_utc - timedelta(hours=2)).strftime("%Y-%m-%d %H:%M:%S")

    doc_id = "muzaffarpur_rahul_kumar_2026-10-04"
    report_doc = FakeDoc({
        "working_place": "Muzaffarpur",
        "fo_name": "Rahul Kumar",
        "date_of_reporting": "2026-10-04",
        "timestamp_completed": recent_ts,
        "sample_tested_ids": [],
        "sample_tested": 0
    }, doc_id=doc_id, exists=True)

    staff_dict = {
        "muzaffarpur_rahulkumar": {
            "pin": "5678",
            "name": "Rahul Kumar",
            "district": "Muzaffarpur"
        }
    }

    mock_db = MockFirestore(reports=[report_doc], staff_members=staff_dict)

    payload = {
        "working_place": "Muzaffarpur",
        "fo_name": "Rahul Kumar",
        "date": "2026-10-04",
        "category": "sample_tested_ids",
        "action": "add",
        "new_id": "777888999",
        "pin": "5678",
        "edited_by": "FO"
    }

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post("/api/reports/edit-id", json=payload)
            assert res.status_code == 200, f"Failed with {res.status_code}: {res.text}"
            data = res.json()
            assert data["success"] is True
            assert "777888999" in data["updated_ids"]


@pytest.mark.asyncio
async def test_missing_report_fails_fast_404_under_50ms():
    """
    Latency & Hang Elimination Verification:
    When a report does not exist, the API must fail fast with HTTP 404 in < 50ms,
    WITHOUT dropping into 30s Firestore stream hanging.
    """
    staff_dict = {
        "patna_sauravkumar": {
            "pin": "1234",
            "name": "Saurav Kumar",
            "district": "Patna"
        }
    }

    # No report exists in database
    mock_db = MockFirestore(reports=[], staff_members=staff_dict)

    payload = {
        "working_place": "Patna",
        "fo_name": "Saurav Kumar",
        "date": "2026-10-04",
        "category": "notification_ids",
        "action": "add",
        "new_id": "999111222",
        "pin": "1234",
        "edited_by": "FO"
    }

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            start_t = time.perf_counter()
            res = await ac.post("/api/reports/edit-id", json=payload)
            elapsed_ms = (time.perf_counter() - start_t) * 1000.0

            assert res.status_code == 404
            assert "No report found for this date and officer." in res.json()["detail"]
            assert elapsed_ms < 50.0, f"404 lookup took {elapsed_ms:.2f}ms, expected < 50ms!"


@pytest.mark.asyncio
async def test_fo_invalid_pin_rejected_under_30ms():
    """
    PIN Auth Verification:
    Invalid PIN must be rejected with 401 in < 30ms.
    """
    doc_id = "patna_saurav_kumar_2026-10-04"
    report_doc = FakeDoc({
        "working_place": "Patna",
        "fo_name": "Saurav Kumar",
        "date_of_reporting": "2026-10-04",
        "notification_ids": ["100000001"]
    }, doc_id=doc_id, exists=True)

    staff_dict = {
        "patna_sauravkumar": {
            "pin": "1234",
            "name": "Saurav Kumar",
            "district": "Patna"
        }
    }

    mock_db = MockFirestore(reports=[report_doc], staff_members=staff_dict)

    payload = {
        "working_place": "Patna",
        "fo_name": "Saurav Kumar",
        "date": "2026-10-04",
        "category": "notification_ids",
        "action": "add",
        "new_id": "999111222",
        "pin": "0000",  # Incorrect PIN
        "edited_by": "FO"
    }

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            start_t = time.perf_counter()
            res = await ac.post("/api/reports/edit-id", json=payload)
            elapsed_ms = (time.perf_counter() - start_t) * 1000.0

            assert res.status_code == 401
            assert "Invalid PIN" in res.json()["detail"]
            assert elapsed_ms < 30.0, f"PIN check took {elapsed_ms:.2f}ms, expected < 30ms!"
