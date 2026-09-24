import asyncio
from unittest.mock import MagicMock, patch
import httpx
import pytest
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import main
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
    cache.delete_prefix("shared_raw_month_")
    yield
    cache.delete_prefix("profile_")
    cache.delete_prefix("attendance_")
    cache.delete_prefix("shared_raw_month_")


@pytest.mark.asyncio
async def test_add_attendance_remark_only():
    mock_db = MockFirestore()
    # Seed a submitted report in daily_field_reports
    report_doc_id = "muzaffarpur_rahulkumar_2026-09-20"
    mock_db.store["daily_field_reports"] = {
        report_doc_id: {
            "working_place": "Muzaffarpur",
            "fo_name": "Rahul Kumar",
            "date_of_reporting": "2026-09-20",
            "submission_count": 1,
            "total_km": 15,
            "notification_ids": ["12345678"]
        }
    }

    mock_admin = {"username": "admin", "name": "Admin Saurav", "role": "SUPER_ADMIN", "user_id": "admin_1"}

    req = main.AttendanceRemarkReq(
        district="Muzaffarpur",
        fo_name="Rahul Kumar",
        date="2026-09-20",
        action="remark",
        remark="Field checked with Dr. Sharma. 4 IDs verified."
    )

    with patch("main.db", mock_db):
        res = await main.add_attendance_remark(req, admin=mock_admin)
        assert res.get("success") is True
        assert "recorded" in res.get("message", "").lower()

        # Check daily_field_reports updated
        rep_doc = mock_db.store["daily_field_reports"][report_doc_id]
        assert rep_doc.get("admin_remark") == "Field checked with Dr. Sharma. 4 IDs verified."
        assert rep_doc.get("admin_remark_by") == "Admin Saurav"

        # Check daily_staff_leaves also has the inspection remark
        leave_doc_id = "2026-09-20_Muzaffarpur_rahulkumar"
        assert leave_doc_id in mock_db.store.get("daily_staff_leaves", {})
        leave_doc = mock_db.store["daily_staff_leaves"][leave_doc_id]
        assert leave_doc.get("is_inspection_remark") is True
        assert leave_doc.get("admin_remark") == "Field checked with Dr. Sharma. 4 IDs verified."


@pytest.mark.asyncio
async def test_override_attendance_to_leave():
    mock_db = MockFirestore()
    mock_admin = {"username": "admin", "name": "Admin Saurav", "role": "SUPER_ADMIN", "user_id": "admin_1"}

    req = main.AttendanceRemarkReq(
        district="Muzaffarpur",
        fo_name="Rahul Kumar",
        date="2026-09-20",
        action="override_leave",
        remark="Staff reported sick on phone",
        status="leave",
        reason_type="Medical"
    )

    with patch("main.db", mock_db):
        res = await main.add_attendance_remark(req, admin=mock_admin)
        assert res.get("success") is True
        assert "overridden" in res.get("message", "").lower()

        leave_doc_id = "2026-09-20_Muzaffarpur_rahulkumar"
        assert leave_doc_id in mock_db.store.get("daily_staff_leaves", {})
        leave_doc = mock_db.store["daily_staff_leaves"][leave_doc_id]
        assert leave_doc.get("is_override") is True
        assert leave_doc.get("status") == "leave"
        assert leave_doc.get("reason_type") == "Medical"
        assert leave_doc.get("remark") == "Staff reported sick on phone"


@pytest.mark.asyncio
async def test_subadmin_rbac_isolation():
    mock_db = MockFirestore()
    mock_subadmin = {
        "username": "subadmin_buxar",
        "name": "Buxar Lead",
        "role": "SUB_ADMIN",
        "allowed_districts": ["Buxar"]
    }

    req = main.AttendanceRemarkReq(
        district="Muzaffarpur",
        fo_name="Rahul Kumar",
        date="2026-09-20",
        action="remark",
        remark="Unauthorized attempt"
    )

    with patch("main.db", mock_db):
        with pytest.raises(main.HTTPException) as excinfo:
            await main.add_attendance_remark(req, admin=mock_subadmin)
        assert excinfo.value.status_code == 403
        assert "Permission denied" in excinfo.value.detail


@pytest.mark.asyncio
async def test_profile_stats_hydrates_admin_remark():
    mock_db = MockFirestore()

    # Seed staff directory for PIN verification
    mock_db.store["staff_directory"] = {
        "muzaffarpur_rahulkumar": {
            "name": "Rahul Kumar",
            "district": "Muzaffarpur",
            "pin": "1234"
        }
    }

    # Seed submitted report with admin remark
    report_doc_id = "muzaffarpur_rahulkumar_2026-09-15"
    mock_db.store["daily_field_reports"] = {
        report_doc_id: {
            "working_place": "Muzaffarpur",
            "fo_name": "Rahul Kumar",
            "date_of_reporting": "2026-09-15",
            "submission_count": 1,
            "total_km": 20,
            "notification_ids": ["98765432"],
            "admin_remark": "Verified 2 patients in field",
            "admin_remark_by": "State Admin"
        }
    }

    # Seed overridden day in daily_staff_leaves for 2026-09-18
    leave_doc_id = "2026-09-18_Muzaffarpur_rahulkumar"
    mock_db.store["daily_staff_leaves"] = {
        leave_doc_id: {
            "date": "2026-09-18",
            "district": "Muzaffarpur",
            "fo_name": "Rahul Kumar",
            "status": "leave",
            "reason_type": "Medical",
            "remark": "Approved medical leave by admin",
            "marked_by_name": "Admin Saurav",
            "marked_at": "2026-09-18 10:00:00",
            "is_override": True
        }
    }

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post("/my-profile-stats", json={
                "working_place": "Muzaffarpur",
                "fo_name": "Rahul Kumar",
                "pin": "1234",
                "month": "2026-09"
            })
            assert res.status_code == 200, res.text
            data = res.json()
            assert data["success"] is True
            daily_history = data.get("daily_history", {})

            # 1. Submitted day should contain admin_remark
            assert "2026-09-15" in daily_history
            day_15 = daily_history["2026-09-15"]
            assert day_15.get("submitted") is True
            assert day_15.get("admin_remark") == "Verified 2 patients in field"
            assert day_15.get("admin_remark_by") == "State Admin"

            # 2. Overridden day should contain is_leave=True and admin_remark
            assert "2026-09-18" in daily_history
            day_18 = daily_history["2026-09-18"]
            assert day_18.get("is_leave") is True
            assert day_18.get("status") == "leave"
            assert day_18.get("reason_type") == "Medical"
            assert day_18.get("admin_remark") == "Approved medical leave by admin"
