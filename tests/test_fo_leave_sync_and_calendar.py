import asyncio
from unittest.mock import MagicMock, patch
import httpx
import pytest
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from main import app, cache, create_access_token


def make_admin_token(role: str = "SUPER_ADMIN", allowed_districts=None, username="test_admin"):
    return create_access_token({
        "user_id": "test_admin_id",
        "username": username,
        "name": "Test Admin",
        "role": role,
        "allowed_districts": allowed_districts or ["All"]
    })


class MockDocRef:
    def __init__(self, coll_name: str, doc_id: str, store: dict):
        self.coll_name = coll_name
        self.doc_id = doc_id
        self.store = store

    def set(self, data, merge=True):
        if self.coll_name not in self.store:
            self.store[self.coll_name] = {}
        if merge and self.doc_id in self.store[self.coll_name]:
            self.store[self.coll_name][self.doc_id].update(data)
        else:
            self.store[self.coll_name][self.doc_id] = dict(data)
        return None

    def update(self, data):
        if self.coll_name not in self.store:
            self.store[self.coll_name] = {}
        if self.doc_id not in self.store[self.coll_name]:
            self.store[self.coll_name][self.doc_id] = {}
        self.store[self.coll_name][self.doc_id].update(data)
        return None

    def delete(self):
        if self.coll_name in self.store and self.doc_id in self.store[self.coll_name]:
            del self.store[self.coll_name][self.doc_id]
        return None

    def get(self):
        snap = MagicMock()
        exists = self.coll_name in self.store and self.doc_id in self.store[self.coll_name]
        snap.exists = exists
        snap.id = self.doc_id
        snap.to_dict.return_value = dict(self.store.get(self.coll_name, {}).get(self.doc_id, {}))
        snap.reference = self
        return snap


class MockCollection:
    def __init__(self, coll_name: str, store: dict, filters=None):
        self.coll_name = coll_name
        self.store = store
        self.filters = filters or []

    def document(self, doc_id: str):
        return MockDocRef(self.coll_name, doc_id, self.store)

    def where(self, field, op, val):
        new_filters = list(self.filters) + [(field, op, val)]
        return MockCollection(self.coll_name, self.store, new_filters)

    def stream(self):
        docs = []
        for doc_id, data in list(self.store.get(self.coll_name, {}).items()):
            match = True
            for field, op, val in self.filters:
                val_doc = data.get(field)
                if op == "==" and val_doc != val:
                    match = False
                    break
                elif op == ">=" and (val_doc is None or val_doc < val):
                    match = False
                    break
                elif op == "<=" and (val_doc is None or val_doc > val):
                    match = False
                    break
                elif op == "in" and val_doc not in val:
                    match = False
                    break
            if match:
                docs.append(MockDocRef(self.coll_name, doc_id, self.store).get())
        return docs


class MockFirestore:
    def __init__(self):
        self.store = {}

    def collection(self, name: str):
        return MockCollection(name, self.store)


@pytest.fixture(autouse=True)
def clear_caches():
    cache.delete_prefix("profile_")
    cache.delete_prefix("attendance_")
    cache.delete_prefix("pacing_settings_")
    yield
    cache.delete_prefix("profile_")
    cache.delete_prefix("attendance_")
    cache.delete_prefix("pacing_settings_")


@pytest.mark.asyncio
async def test_profile_stats_unsubmitted_day_leave_hydration():
    mock_db = MockFirestore()

    # Seed staff directory for PIN verification
    mock_db.store["staff_directory"] = {
        "patna_rameshkumar": {
            "name": "Ramesh Kumar",
            "district": "Patna",
            "pin": "1234"
        }
    }

    # Seed daily_staff_leaves with unsubmitted day leave
    leave_id = "2026-09-10_Patna_rameshkumar"
    mock_db.store["daily_staff_leaves"] = {
        leave_id: {
            "date": "2026-09-10",
            "district": "Patna",
            "fo_name": "Ramesh Kumar",
            "status": "leave",
            "reason_type": "Sick Leave",
            "remark": "Viral fever doctor visit",
            "marked_by_name": "Dr. Sharma",
            "marked_at": "2026-09-10 09:30:00"
        }
    }

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post("/my-profile-stats", json={
                "working_place": "Patna",
                "fo_name": "Ramesh Kumar",
                "pin": "1234",
                "month": "2026-09"
            })
            assert res.status_code == 200, res.text
            data = res.json()
            assert data["success"] is True
            daily_history = data.get("daily_history", {})
            assert "2026-09-10" in daily_history
            entry = daily_history["2026-09-10"]
            assert entry["submitted"] is False
            assert entry["is_leave"] is True
            assert entry["status"] == "leave"
            assert entry["reason_type"] == "Sick Leave"
            assert entry["remark"] == "Viral fever doctor visit"
            assert entry["marked_by"] == "Dr. Sharma"
            assert entry["marked_at"] == "2026-09-10 09:30:00"


@pytest.mark.asyncio
async def test_profile_stats_submitted_day_leave_hydration():
    mock_db = MockFirestore()

    # Seed staff directory
    mock_db.store["staff_directory"] = {
        "patna_rameshkumar": {
            "name": "Ramesh Kumar",
            "district": "Patna",
            "pin": "1234"
        }
    }

    # Seed field report for 2026-09-12
    mock_db.store["daily_field_reports"] = {
        "rep_2026-09-12_ramesh": {
            "fo_name": "Ramesh Kumar",
            "working_place": "Patna",
            "date_of_reporting": "2026-09-12",
            "submission_count": 1,
            "notification_ids": ["N101", "N102"],
            "total_km": 15,
            "remark": "Morning field survey completed"
        }
    }

    # Seed leave record for the same day (e.g. marked absent/leave after partial submission)
    leave_id = "2026-09-12_Patna_rameshkumar"
    mock_db.store["daily_staff_leaves"] = {
        leave_id: {
            "date": "2026-09-12",
            "district": "Patna",
            "fo_name": "Ramesh Kumar",
            "status": "leave",
            "reason_type": "Casual",
            "remark": "Emergency family travel",
            "marked_by_name": "District Coordinator",
            "marked_at": "2026-09-12 14:00:00"
        }
    }

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post("/my-profile-stats", json={
                "working_place": "Patna",
                "fo_name": "Ramesh Kumar",
                "pin": "1234",
                "month": "2026-09"
            })
            assert res.status_code == 200, res.text
            data = res.json()
            assert data["success"] is True
            daily_history = data.get("daily_history", {})
            assert "2026-09-12" in daily_history
            entry = daily_history["2026-09-12"]
            assert entry["submitted"] is True
            assert entry["is_leave"] is True
            assert "leave_info" in entry
            assert entry["leave_info"]["status"] == "leave"
            assert entry["leave_info"]["reason_type"] == "Casual"
            assert entry["leave_info"]["remark"] == "Emergency family travel"
            assert entry["leave_info"]["marked_by"] == "District Coordinator"
            # Submission details should be preserved
            assert entry["remark"] == "Morning field survey completed"


@pytest.mark.asyncio
async def test_profile_stats_district_isolation_and_fo_matching():
    mock_db = MockFirestore()

    mock_db.store["staff_directory"] = {
        "patna_rameshkumar": {
            "name": "Ramesh Kumar",
            "district": "Patna",
            "pin": "1234"
        }
    }

    # Leaves for other officers and other districts
    mock_db.store["daily_staff_leaves"] = {
        "2026-09-15_Patna_sureshkumar": {
            "date": "2026-09-15",
            "district": "Patna",
            "fo_name": "Suresh Kumar",
            "status": "leave",
            "reason_type": "Casual",
            "remark": "Suresh leave",
            "marked_by_name": "Admin"
        },
        "2026-09-18_Gaya_rameshkumar": {
            "date": "2026-09-18",
            "district": "Gaya",
            "fo_name": "Ramesh Kumar",
            "status": "leave",
            "reason_type": "Casual",
            "remark": "Gaya officer leave",
            "marked_by_name": "Admin"
        }
    }

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post("/my-profile-stats", json={
                "working_place": "Patna",
                "fo_name": "Ramesh Kumar",
                "pin": "1234",
                "month": "2026-09"
            })
            assert res.status_code == 200, res.text
            data = res.json()
            daily_history = data.get("daily_history", {})
            assert "2026-09-15" not in daily_history
            assert "2026-09-18" not in daily_history


@pytest.mark.asyncio
async def test_mark_and_unmark_leave_invalidates_profile_cache():
    mock_db = MockFirestore()
    token = make_admin_token(role="SUPER_ADMIN")
    headers = {"Authorization": f"Bearer {token}"}

    # Pre-populate profile cache keys
    cache.set("profile_patna_ramesh_kumar_2026-09", {"cached": True})
    cache.set("profile_gaya_sita_devi_2026-09", {"cached": True})
    cache.set("attendance_2026-09-20_all", {"cached": True})

    assert cache.get("profile_patna_ramesh_kumar_2026-09") is not None

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Mark leave -> profile cache must be invalidated
            mark_res = await ac.post("/admin/attendance/mark-leave", json={
                "district": "Patna",
                "fo_name": "Ramesh Kumar",
                "date": "2026-09-20",
                "status": "leave",
                "reason_type": "Casual",
                "remark": "Test leave"
            }, headers=headers)
            assert mark_res.status_code == 200, mark_res.text

            assert cache.get("profile_patna_ramesh_kumar_2026-09") is None
            assert cache.get("profile_gaya_sita_devi_2026-09") is None

            # Re-seed profile cache
            cache.set("profile_patna_ramesh_kumar_2026-09", {"cached_again": True})
            assert cache.get("profile_patna_ramesh_kumar_2026-09") is not None

            # 2. Unmark leave -> profile cache must be invalidated
            unmark_res = await ac.post("/admin/attendance/unmark-leave", json={
                "district": "Patna",
                "fo_name": "Ramesh Kumar",
                "date": "2026-09-20"
            }, headers=headers)
            assert unmark_res.status_code == 200, unmark_res.text

            assert cache.get("profile_patna_ramesh_kumar_2026-09") is None
