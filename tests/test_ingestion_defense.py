import asyncio
from datetime import datetime
from unittest.mock import MagicMock, patch
import httpx
import pytest
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from main import app, cache, record_report_mutation, create_access_token

def make_admin_token(role: str = "SUPER_ADMIN", allowed_districts=None):
    return create_access_token({
        "user_id": "test_admin",
        "username": "test_admin",
        "role": role,
        "allowed_districts": allowed_districts or ["All"]
    })

class FakeDoc:
    def __init__(self, data: dict, doc_id: str = ""):
        self._data = data
        self.id = doc_id or data.get("id", "")

    def to_dict(self):
        return self._data

class MockDocRef:
    def __init__(self, doc_id: str, coll_name: str, store: "MockFirestore"):
        self.id = doc_id
        self.coll_name = coll_name
        self.store = store

    def get(self):
        if self.coll_name == "daily_field_reports" and self.id in self.store.existing_docs:
            d = self.store.existing_docs[self.id]
            snap = MagicMock()
            snap.exists = True
            snap.id = self.id
            snap.to_dict.return_value = d
            snap.reference = self
            return snap
        snap = MagicMock()
        snap.exists = False
        snap.id = self.id
        snap.to_dict.return_value = {}
        snap.reference = self
        return snap

    def set(self, data, merge=True):
        if self.coll_name == "daily_field_reports":
            self.store.saved_reports[self.id] = data
        elif self.coll_name == "daily_district_rollups":
            self.store.saved_rollups[self.id] = data
        return None

    def update(self, data):
        if self.coll_name == "daily_field_reports":
            if self.id in self.store.existing_docs:
                self.store.existing_docs[self.id].update(data)
            self.store.saved_reports[self.id] = data
        elif self.coll_name == "daily_district_rollups":
            self.store.saved_rollups[self.id] = data
        return None

class MockQuery:
    def __init__(self, store: "MockFirestore", docs=None):
        self.store = store
        self._docs = docs if docs is not None else store.reports

    def where(self, field, op, val):
        return self

    def stream(self):
        return iter(self._docs)

class MockCollection:
    def __init__(self, name: str, store: "MockFirestore"):
        self.name = name
        self.store = store

    def document(self, doc_id: str):
        return MockDocRef(doc_id, self.name, self.store)

    def where(self, field, op, val):
        return MockQuery(self.store).where(field, op, val)

    def add(self, data):
        return (MagicMock(), MagicMock())

class MockFirestore:
    def __init__(self, reports=None, existing_docs=None):
        self.reports = reports or []
        self.existing_docs = existing_docs or {}
        self.saved_reports = {}
        self.saved_rollups = {}

    def collection(self, name: str):
        return MockCollection(name, self)

@pytest.fixture(autouse=True)
def clear_caches():
    cache.delete_prefix("dist_notif_registry_")
    cache.delete_prefix("submitting_")
    cache.delete_prefix("status_")
    yield
    cache.delete_prefix("dist_notif_registry_")
    cache.delete_prefix("submitting_")
    cache.delete_prefix("status_")


# =========================================================================
# 1. Tests for /submit-daily-report Ingestion Defense Gate
# =========================================================================

@pytest.mark.asyncio
async def test_submit_daily_report_auto_prunes_duplicate_notifications():
    # Setup: 5-day-old report in Aurangabad already notified '123456789'
    historical_reports = [
        FakeDoc({
            "working_place": "Aurangabad",
            "date_of_reporting": "2026-09-15",
            "fo_name": "Ramesh Kumar",
            "notification_ids": ["123456789"]
        }, doc_id="aurangabad_ramesh_kumar_2026-09-15")
    ]
    mock_store = MockFirestore(reports=historical_reports)

    submission_payload = {
        "working_place": "Aurangabad",
        "fo_name": "Ramesh Kumar",
        "pin": "1234",
        "date_of_reporting": "2026-09-20",
        "notification_ids": ["123456789", "987654321"], # '123456789' is duplicate, '987654321' is new
        "dbt_ids": ["111222333"],
        "sample_tested_ids": ["444555666"],
        "remark": "Field testing auto-prune"
    }

    with patch("main.db", mock_store):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post("/submit-daily-report", json=submission_payload)
            assert res.status_code == 200
            data = res.json()
            
            # Response contract check
            assert data["message"] == "Daily report submitted successfully"
            assert data["pruned_duplicate_notifications"] == ["123456789"]
            assert data["pruned_count"] == 1

            # Check saved document
            doc_id = "aurangabad_ramesh_kumar_2026-09-20"
            assert doc_id in mock_store.saved_reports
            saved = mock_store.saved_reports[doc_id]
            # Notification IDs must only contain the valid new notification
            assert saved["notification_ids"] == ["987654321"]
            # Other indicators must be 100% preserved
            assert saved["dbt_ids"] == ["111222333"]
            assert saved["sample_tested_ids"] == ["444555666"]
            assert saved["remark"] == "Field testing auto-prune"

            # Rollup increment check
            rollup_id = "2026-09-20_aurangabad"
            assert rollup_id in mock_store.saved_rollups
            rollup = mock_store.saved_rollups[rollup_id]
            # notifications increment must be 1 (for 987654321), not 2
            notif_inc = rollup.get("notifications")
            assert getattr(notif_inc, "value", None) == 1 or notif_inc == 1

@pytest.mark.asyncio
async def test_submit_daily_report_allows_same_doc_update_without_false_pruning():
    # Setup: Today's document already exists with ID '111222333'
    doc_id = "aurangabad_ramesh_kumar_2026-09-20"
    existing_today_doc = {
        "working_place": "Aurangabad",
        "fo_name": "Ramesh Kumar",
        "date_of_reporting": "2026-09-20",
        "notification_ids": ["111222333"],
        "dbt_ids": []
    }
    today_fake_doc = FakeDoc(existing_today_doc, doc_id=doc_id)
    mock_store = MockFirestore(reports=[today_fake_doc], existing_docs={doc_id: existing_today_doc})

    # Resubmission adds '444555666' while repeating today's '111222333'
    submission_payload = {
        "working_place": "Aurangabad",
        "fo_name": "Ramesh Kumar",
        "pin": "1234",
        "date_of_reporting": "2026-09-20",
        "notification_ids": ["111222333", "444555666"],
        "dbt_ids": ["999000111"]
    }

    with patch("main.db", mock_store):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post("/submit-daily-report", json=submission_payload)
            assert res.status_code == 200
            data = res.json()
            
            # None of today's own IDs should be pruned
            assert data["pruned_duplicate_notifications"] == []
            assert data["pruned_count"] == 0

            # Rollup increment should only count delta (+1 for 444555666)
            rollup_id = "2026-09-20_aurangabad"
            assert rollup_id in mock_store.saved_rollups
            rollup = mock_store.saved_rollups[rollup_id]
            notif_inc = rollup.get("notifications")
            assert getattr(notif_inc, "value", None) == 1 or notif_inc == 1


# =========================================================================
# 2. Tests for /admin/feed-officer-data Duplicate Rejection
# =========================================================================

@pytest.mark.asyncio
async def test_feed_officer_data_rejects_duplicate_notification_with_400():
    # Setup: Gaya has an existing notification '999888777' from 10 days ago
    historical_reports = [
        FakeDoc({
            "working_place": "Gaya",
            "date_of_reporting": "2026-09-10",
            "fo_name": "Suresh FO",
            "notification_ids": ["999888777"]
        }, doc_id="gaya_suresh_fo_2026-09-10")
    ]
    mock_store = MockFirestore(reports=historical_reports)

    token = make_admin_token(role="SUPER_ADMIN")
    feed_payload = {
        "district": "Gaya",
        "fo_name": "New FO",
        "date_of_reporting": "2026-09-20",
        "notification_ids": ["999888777", "111222333"], # 999888777 is duplicate
        "remark": "Feeding batch"
    }

    with patch("main.db", mock_store):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post("/admin/feed-officer-data", json=feed_payload, headers={"Authorization": f"Bearer {token}"})
            assert res.status_code == 400
            err_detail = res.json()["detail"]
            assert "999888777" in err_detail
            assert "Duplicate notification" in err_detail or "already notified" in err_detail

@pytest.mark.asyncio
async def test_feed_officer_data_accepts_valid_unique_notifications():
    # Setup: No duplicates in Gaya
    mock_store = MockFirestore(reports=[])

    token = make_admin_token(role="SUPER_ADMIN")
    feed_payload = {
        "district": "Gaya",
        "fo_name": "New FO",
        "date_of_reporting": "2026-09-20",
        "notification_ids": ["123456789"],
        "remark": "Valid feeding"
    }

    with patch("main.db", mock_store):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post("/admin/feed-officer-data", json=feed_payload, headers={"Authorization": f"Bearer {token}"})
            assert res.status_code == 200
            assert res.json()["success"] is True


# =========================================================================
# 3. Tests for /api/reports/edit-id Duplicate Rejection
# =========================================================================

@pytest.mark.asyncio
async def test_edit_patient_id_replace_rejects_duplicate_notification_with_400():
    # Setup: Target report on 2026-09-20 in Aurangabad has old ID '111222333'.
    # Another report on 2026-09-12 in Aurangabad already has '888777666'.
    target_doc_id = "aurangabad_ramesh_kumar_2026-09-20"
    target_doc_data = {
        "working_place": "Aurangabad",
        "fo_name": "Ramesh Kumar",
        "date_of_reporting": "2026-09-20",
        "notification_ids": ["111222333"]
    }
    other_doc = FakeDoc({
        "working_place": "Aurangabad",
        "date_of_reporting": "2026-09-12",
        "fo_name": "Other FO",
        "notification_ids": ["888777666"]
    }, doc_id="aurangabad_other_fo_2026-09-12")

    mock_store = MockFirestore(
        reports=[other_doc, FakeDoc(target_doc_data, doc_id=target_doc_id)],
        existing_docs={target_doc_id: target_doc_data}
    )

    token = make_admin_token(role="SUPER_ADMIN")
    edit_payload = {
        "working_place": "Aurangabad",
        "fo_name": "Ramesh Kumar",
        "date": "2026-09-20",
        "category": "notification_ids",
        "action": "replace",
        "old_id": "111222333",
        "new_id": "888777666", # already notified in other_doc
        "edited_by": "Admin"
    }

    with patch("main.db", mock_store):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post("/api/reports/edit-id", json=edit_payload, headers={"Authorization": f"Bearer {token}"})
            assert res.status_code == 400
            assert res.json()["detail"] == "Patient ID 888777666 is already notified in a different report."

@pytest.mark.asyncio
async def test_edit_patient_id_add_rejects_duplicate_notification_with_400():
    # Setup: Target report on 2026-09-20 in Aurangabad.
    # Another report on 2026-09-12 in Aurangabad already has '888777666'.
    target_doc_id = "aurangabad_ramesh_kumar_2026-09-20"
    target_doc_data = {
        "working_place": "Aurangabad",
        "fo_name": "Ramesh Kumar",
        "date_of_reporting": "2026-09-20",
        "notification_ids": ["111222333"]
    }
    other_doc = FakeDoc({
        "working_place": "Aurangabad",
        "date_of_reporting": "2026-09-12",
        "fo_name": "Other FO",
        "notification_ids": ["888777666"]
    }, doc_id="aurangabad_other_fo_2026-09-12")

    mock_store = MockFirestore(
        reports=[other_doc, FakeDoc(target_doc_data, doc_id=target_doc_id)],
        existing_docs={target_doc_id: target_doc_data}
    )

    token = make_admin_token(role="SUPER_ADMIN")
    edit_payload = {
        "working_place": "Aurangabad",
        "fo_name": "Ramesh Kumar",
        "date": "2026-09-20",
        "category": "notification_ids",
        "action": "add",
        "old_id": "",
        "new_id": "888777666", # already notified in other_doc
        "edited_by": "Admin"
    }

    with patch("main.db", mock_store):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post("/api/reports/edit-id", json=edit_payload, headers={"Authorization": f"Bearer {token}"})
            assert res.status_code == 400
            assert res.json()["detail"] == "Patient ID 888777666 is already notified in a different report."


# =========================================================================
# 4. Tests for record_report_mutation Cache Invalidation
# =========================================================================

def test_record_report_mutation_invalidates_all_relevant_cache_prefixes():
    cache.set("dist_notif_registry_Aurangabad_2026-09", {"sample": 1})
    cache.set("shared_raw_month_2026-09", [{"sample": 2}])
    cache.set("dash_2026-09_all_admin", {"sample": 3})
    cache.set("attendance_2026-09", {"sample": 4})
    cache.set("dupe_audit_2026-09", {"sample": 5})
    cache.set("cascade_alerts_2026-09", {"sample": 6})

    record_report_mutation("submit", "doc_test_123")

    assert cache.get("dist_notif_registry_Aurangabad_2026-09") is None
    assert cache.get("shared_raw_month_2026-09") is None
    assert cache.get("dash_2026-09_all_admin") is None
    assert cache.get("attendance_2026-09") is None
    assert cache.get("dupe_audit_2026-09") is None
    assert cache.get("cascade_alerts_2026-09") is None

if __name__ == "__main__":
    pytest.main(["-v", __file__])
