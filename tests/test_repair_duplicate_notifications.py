import asyncio
from datetime import datetime
from unittest.mock import MagicMock, patch
import httpx
import pytest
import os
import sys
from pathlib import Path
from google.cloud import firestore

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from main import app, cache, create_access_token

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
        self.store.added_logs.append(data)
        return (MagicMock(), MagicMock())

class MockFirestore:
    def __init__(self, reports=None, existing_docs=None):
        self.reports = reports or []
        self.existing_docs = existing_docs or {}
        self.saved_reports = {}
        self.saved_rollups = {}
        self.added_logs = []

    def collection(self, name: str):
        return MockCollection(name, self)

@pytest.fixture(autouse=True)
def clear_caches():
    cache.delete_prefix("dist_notif_registry_")
    cache.delete_prefix("shared_raw_month_")
    cache.delete_prefix("dash_")
    cache.delete_prefix("dupe_audit_")
    cache.delete_prefix("dupe_scan_")
    cache.delete_prefix("status_")
    yield
    cache.delete_prefix("dist_notif_registry_")
    cache.delete_prefix("shared_raw_month_")
    cache.delete_prefix("dash_")
    cache.delete_prefix("dupe_audit_")
    cache.delete_prefix("dupe_scan_")
    cache.delete_prefix("status_")

# =========================================================================
# 1. Tests for GET /admin/scan-duplicate-notifications
# =========================================================================

@pytest.mark.asyncio
async def test_scan_duplicate_notifications_basic():
    mock_reports = [
        FakeDoc({
            "working_place": "Aurangabad",
            "fo_name": "Ramesh Kumar",
            "date_of_reporting": "2026-09-02",
            "notification_ids": ["123456789", "111222333"]
        }, doc_id="aurangabad_ramesh_kumar_2026-09-02"),
        FakeDoc({
            "working_place": "Aurangabad",
            "fo_name": "Ramesh Kumar",
            "date_of_reporting": "2026-09-06",
            "notification_ids": ["123456789", "999888777"]
        }, doc_id="aurangabad_ramesh_kumar_2026-09-06")
    ]

    mock_fs = MockFirestore(reports=mock_reports)
    token = make_admin_token("SUPER_ADMIN", ["All"])

    with patch("main.db", mock_fs):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get(
                "/admin/scan-duplicate-notifications?month=2026-09",
                headers={"Authorization": f"Bearer {token}"}
            )
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "success"
            assert data["month"] == "2026-09"
            assert data["total_instances"] == 1
            assert data["total_inflated_count"] == 1
            assert len(data["instances"]) == 1

            inst = data["instances"][0]
            assert inst["district"] == "Aurangabad"
            assert inst["fo_name"] == "Ramesh Kumar"
            assert inst["repeat_date"] == "2026-09-06"
            assert inst["repeat_doc_id"] == "aurangabad_ramesh_kumar_2026-09-06"
            assert inst["duplicate_ids"] == ["123456789"]
            assert len(inst["original_occurrences"]) == 1
            assert inst["original_occurrences"][0]["id"] == "123456789"
            assert inst["original_occurrences"][0]["date"] == "2026-09-02"
            assert inst["original_occurrences"][0]["fo_name"] == "Ramesh Kumar"

@pytest.mark.asyncio
async def test_scan_duplicate_notifications_subadmin_rbac():
    mock_reports = [
        # Aurangabad duplicate pair
        FakeDoc({
            "working_place": "Aurangabad",
            "fo_name": "Ramesh Kumar",
            "date_of_reporting": "2026-09-01",
            "notification_ids": ["AAA111222"]
        }, doc_id="aurangabad_ramesh_kumar_2026-09-01"),
        FakeDoc({
            "working_place": "Aurangabad",
            "fo_name": "Ramesh Kumar",
            "date_of_reporting": "2026-09-05",
            "notification_ids": ["AAA111222"]
        }, doc_id="aurangabad_ramesh_kumar_2026-09-05"),

        # Gaya duplicate pair
        FakeDoc({
            "working_place": "Gaya",
            "fo_name": "Suresh Singh",
            "date_of_reporting": "2026-09-03",
            "notification_ids": ["GGG333444"]
        }, doc_id="gaya_suresh_singh_2026-09-03"),
        FakeDoc({
            "working_place": "Gaya",
            "fo_name": "Suresh Singh",
            "date_of_reporting": "2026-09-07",
            "notification_ids": ["GGG333444"]
        }, doc_id="gaya_suresh_singh_2026-09-07"),
    ]

    mock_fs = MockFirestore(reports=mock_reports)
    transport = httpx.ASGITransport(app=app)

    with patch("main.db", mock_fs):
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Sub-Admin permitted for Gaya ONLY
            gaya_token = make_admin_token("SUB_ADMIN", ["Gaya"])
            res_gaya = await ac.get(
                "/admin/scan-duplicate-notifications?month=2026-09",
                headers={"Authorization": f"Bearer {gaya_token}"}
            )
            assert res_gaya.status_code == 200
            data_gaya = res_gaya.json()
            assert data_gaya["total_instances"] == 1
            assert data_gaya["instances"][0]["district"] == "Gaya"
            assert data_gaya["instances"][0]["duplicate_ids"] == ["GGG333444"]

            # Sub-Admin should NOT see Aurangabad
            assert not any(i["district"] == "Aurangabad" for i in data_gaya["instances"])

            # 2. Super Admin sees both districts
            super_token = make_admin_token("SUPER_ADMIN", ["All"])
            res_super = await ac.get(
                "/admin/scan-duplicate-notifications?month=2026-09",
                headers={"Authorization": f"Bearer {super_token}"}
            )
            assert res_super.status_code == 200
            data_super = res_super.json()
            assert data_super["total_instances"] == 2
            districts_found = {i["district"] for i in data_super["instances"]}
            assert "Aurangabad" in districts_found
            assert "Gaya" in districts_found

@pytest.mark.asyncio
async def test_scan_duplicate_notifications_unauthenticated():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/admin/scan-duplicate-notifications?month=2026-09")
        assert res.status_code == 401

# =========================================================================
# 2. Tests for POST /admin/repair-duplicate-notifications
# =========================================================================

@pytest.mark.asyncio
async def test_repair_duplicate_notifications_success():
    clean_doc_id = "aurangabad_ramesh_kumar_2026-09-06"
    existing_reports = {
        clean_doc_id: {
            "working_place": "Aurangabad",
            "fo_name": "Ramesh Kumar",
            "date_of_reporting": "2026-09-06",
            "notification_ids": ["123456789", "999888777"]
        }
    }
    mock_fs = MockFirestore(existing_docs=existing_reports)
    token = make_admin_token("SUPER_ADMIN", ["All"])

    with patch("main.db", mock_fs):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            req_body = {
                "month": "2026-09",
                "district": "Aurangabad",
                "instance_doc_id": clean_doc_id,
                "duplicate_ids": ["123456789"]
            }
            res = await ac.post(
                "/admin/repair-duplicate-notifications",
                json=req_body,
                headers={"Authorization": f"Bearer {token}"}
            )
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "success"
            assert data["removed_count"] == 1
            assert "Successfully removed 1 duplicate notification IDs" in data["message"]

            # Verify report document updated
            assert clean_doc_id in mock_fs.saved_reports
            saved_report = mock_fs.saved_reports[clean_doc_id]
            assert saved_report["notification_ids"] == ["999888777"]
            assert "last_repaired_at" in saved_report

            # Verify atomic decrement in daily_district_rollups
            rollup_id = "2026-09-06_aurangabad"
            assert rollup_id in mock_fs.saved_rollups
            rollup_saved = mock_fs.saved_rollups[rollup_id]
            assert isinstance(rollup_saved["notifications"], firestore.Increment)
            assert rollup_saved["notifications"]._value == -1

@pytest.mark.asyncio
async def test_repair_duplicate_notifications_subadmin_rbac_forbidden():
    clean_doc_id = "aurangabad_ramesh_kumar_2026-09-06"
    existing_reports = {
        clean_doc_id: {
            "working_place": "Aurangabad",
            "fo_name": "Ramesh Kumar",
            "date_of_reporting": "2026-09-06",
            "notification_ids": ["123456789", "999888777"]
        }
    }
    mock_fs = MockFirestore(existing_docs=existing_reports)
    # Sub-Admin only has access to Gaya
    gaya_token = make_admin_token("SUB_ADMIN", ["Gaya"])

    with patch("main.db", mock_fs):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Sub-Admin tries to repair Aurangabad directly -> 403
            req_body = {
                "month": "2026-09",
                "district": "Aurangabad",
                "instance_doc_id": clean_doc_id,
                "duplicate_ids": ["123456789"]
            }
            res_forbidden = await ac.post(
                "/admin/repair-duplicate-notifications",
                json=req_body,
                headers={"Authorization": f"Bearer {gaya_token}"}
            )
            assert res_forbidden.status_code == 403
            assert "Permission Denied" in res_forbidden.json()["detail"]

            # 2. Sub-Admin attempts spoofing by passing district='Gaya' with Aurangabad document -> 400 Mismatch
            req_spoof = {
                "month": "2026-09",
                "district": "Gaya",
                "instance_doc_id": clean_doc_id,
                "duplicate_ids": ["123456789"]
            }
            res_spoof = await ac.post(
                "/admin/repair-duplicate-notifications",
                json=req_spoof,
                headers={"Authorization": f"Bearer {gaya_token}"}
            )
            assert res_spoof.status_code == 400
            assert "District mismatch" in res_spoof.json()["detail"]

@pytest.mark.asyncio
async def test_repair_duplicate_notifications_subadmin_allowed_district():
    clean_doc_id = "gaya_suresh_singh_2026-09-07"
    existing_reports = {
        clean_doc_id: {
            "working_place": "Gaya",
            "fo_name": "Suresh Singh",
            "date_of_reporting": "2026-09-07",
            "notification_ids": ["GGG333444", "GGG111222"]
        }
    }
    mock_fs = MockFirestore(existing_docs=existing_reports)
    gaya_token = make_admin_token("SUB_ADMIN", ["Gaya"])

    with patch("main.db", mock_fs):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            req_body = {
                "month": "2026-09",
                "district": "Gaya",
                "instance_doc_id": clean_doc_id,
                "duplicate_ids": ["GGG333444"]
            }
            res = await ac.post(
                "/admin/repair-duplicate-notifications",
                json=req_body,
                headers={"Authorization": f"Bearer {gaya_token}"}
            )
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "success"
            assert data["removed_count"] == 1
            assert clean_doc_id in mock_fs.saved_reports

@pytest.mark.asyncio
async def test_repair_duplicate_notifications_doc_not_found():
    mock_fs = MockFirestore(existing_docs={})
    token = make_admin_token("SUPER_ADMIN", ["All"])

    with patch("main.db", mock_fs):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            req_body = {
                "month": "2026-09",
                "district": "Aurangabad",
                "instance_doc_id": "nonexistent_doc_id",
                "duplicate_ids": ["123456789"]
            }
            res = await ac.post(
                "/admin/repair-duplicate-notifications",
                json=req_body,
                headers={"Authorization": f"Bearer {token}"}
            )
            assert res.status_code == 404
            assert "not found" in res.json()["detail"].lower()

@pytest.mark.asyncio
async def test_repair_duplicate_notifications_zero_removed_when_ids_not_present():
    clean_doc_id = "aurangabad_ramesh_kumar_2026-09-06"
    existing_reports = {
        clean_doc_id: {
            "working_place": "Aurangabad",
            "fo_name": "Ramesh Kumar",
            "date_of_reporting": "2026-09-06",
            "notification_ids": ["555555555"]
        }
    }
    mock_fs = MockFirestore(existing_docs=existing_reports)
    token = make_admin_token("SUPER_ADMIN", ["All"])

    with patch("main.db", mock_fs):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            req_body = {
                "month": "2026-09",
                "district": "Aurangabad",
                "instance_doc_id": clean_doc_id,
                "duplicate_ids": ["999999999"]
            }
            res = await ac.post(
                "/admin/repair-duplicate-notifications",
                json=req_body,
                headers={"Authorization": f"Bearer {token}"}
            )
            assert res.status_code == 200
            data = res.json()
            assert data["removed_count"] == 0
            # Rollup should not be touched
            assert len(mock_fs.saved_rollups) == 0

if __name__ == "__main__":
    pytest.main(["-v", __file__])
