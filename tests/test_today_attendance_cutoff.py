import pytest
import asyncio
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch
from pathlib import Path
import sys
import httpx

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import main
from main import app, cache, create_access_token, IST_TIMEZONE

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

    def get(self):
        snap = MagicMock()
        exists = self.coll_name in self.store and self.doc_id in self.store[self.coll_name]
        snap.exists = exists
        snap.id = self.doc_id
        snap.to_dict.return_value = self.store.get(self.coll_name, {}).get(self.doc_id, {})
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
                if op == "==" and data.get(field) != val:
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
def clear_attendance_cache():
    cache.clear()
    yield
    cache.clear()

@pytest.mark.asyncio
async def test_today_attendance_excludes_before_10am_on_target_date():
    """
    Reports submitted before 10 AM on target_date do NOT appear in target_date submitted list.
    They belong to yesterday (target_date - 1).
    """
    mock_db = MockFirestore()
    
    # 1. Staff roster in Muzaffarpur
    mock_db.store["staff_directory"] = {
        "muz_ramesh": {
            "name": "Ramesh Kumar",
            "district": "Muzaffarpur",
            "designation": "Field Officer",
            "is_active": True
        },
        "muz_suresh": {
            "name": "Suresh Singh",
            "district": "Muzaffarpur",
            "designation": "Field Officer",
            "is_active": True
        }
    }
    
    # 2. Ramesh submitted at 08:30 AM on 2026-09-25 (< 10 AM)
    # Suresh submitted at 11:30 AM on 2026-09-25 (>= 10 AM)
    ts_ramesh = datetime(2026, 9, 25, 8, 30, tzinfo=IST_TIMEZONE)
    ts_suresh = datetime(2026, 9, 25, 11, 30, tzinfo=IST_TIMEZONE)
    
    mock_db.store["daily_field_reports"] = {
        "muzaffarpur_ramesh_kumar_2026-09-25": {
            "fo_name": "Ramesh Kumar",
            "working_place": "Muzaffarpur",
            "date_of_reporting": "2026-09-25",
            "timestamp_completed": ts_ramesh,
            "submission_count": 1,
            "notification_ids": ["111111111"]
        },
        "muzaffarpur_suresh_singh_2026-09-25": {
            "fo_name": "Suresh Singh",
            "working_place": "Muzaffarpur",
            "date_of_reporting": "2026-09-25",
            "timestamp_completed": ts_suresh,
            "submission_count": 1,
            "notification_ids": ["222222222"]
        }
    }
    mock_db.store["daily_staff_leaves"] = {}

    token = make_admin_token(role="SUPER_ADMIN")
    headers = {"Authorization": f"Bearer {token}"}

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get(
                "/admin/today-attendance?date=2026-09-25&districts=Muzaffarpur&force_refresh=true",
                headers=headers
            )
            assert res.status_code == 200
            data = res.json()
            
            # Suresh must be in submitted list
            submitted_names = [fo["fo_name"] for fo in data["submitted_fos"]]
            assert "Suresh Singh" in submitted_names
            suresh_info = next(fo for fo in data["submitted_fos"] if fo["fo_name"] == "Suresh Singh")
            assert suresh_info.get("is_next_day") is False
            
            # Ramesh (< 10 AM on 2026-09-25) must NOT be in 2026-09-25 submitted list
            assert "Ramesh Kumar" not in submitted_names
            missing_names = [fo["fo_name"] for fo in data["missing_fos"]]
            assert "Ramesh Kumar" in missing_names
            assert data["submitted_count"] == 1
            assert data["missing_count"] == 1


@pytest.mark.asyncio
async def test_today_attendance_includes_next_day_morning_submission():
    """
    Reports submitted before 10 AM on the next day (target_date + 1) for target_date
    DO appear in target_date submitted list with is_next_day: True.
    """
    mock_db = MockFirestore()
    
    mock_db.store["staff_directory"] = {
        "muz_ramesh": {
            "name": "Ramesh Kumar",
            "district": "Muzaffarpur",
            "designation": "Field Officer",
            "is_active": True
        }
    }
    
    # Ramesh submitted on 2026-09-25 at 08:30 AM for date 2026-09-24
    ts_ramesh_morning = datetime(2026, 9, 25, 8, 30, tzinfo=IST_TIMEZONE)
    mock_db.store["daily_field_reports"] = {
        "muzaffarpur_ramesh_kumar_2026-09-24": {
            "fo_name": "Ramesh Kumar",
            "working_place": "Muzaffarpur",
            "date_of_reporting": "2026-09-24",
            "timestamp_completed": ts_ramesh_morning,
            "submission_count": 1,
            "notification_ids": ["111111111"],
            "is_next_day_submission": True,
            "submitted_morning_time": "08:30 AM",
            "morning_submission_label": "Next day morning 08:30 AM"
        }
    }
    mock_db.store["daily_staff_leaves"] = {}

    token = make_admin_token(role="SUPER_ADMIN")
    headers = {"Authorization": f"Bearer {token}"}

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get(
                "/admin/today-attendance?date=2026-09-24&districts=Muzaffarpur&force_refresh=true",
                headers=headers
            )
            assert res.status_code == 200
            data = res.json()
            
            submitted_names = [fo["fo_name"] for fo in data["submitted_fos"]]
            assert "Ramesh Kumar" in submitted_names
            
            ramesh_info = next(fo for fo in data["submitted_fos"] if fo["fo_name"] == "Ramesh Kumar")
            assert ramesh_info.get("is_next_day") is True
            assert ramesh_info.get("submitted_time") == "08:30 AM"
            assert ramesh_info.get("submitted_label") == "Next day morning 08:30 AM"
            assert ramesh_info.get("time_classification") == "Next Day Morning (< 10 AM)"
            assert data["submitted_count"] == 1
            assert data["missing_count"] == 0


@pytest.mark.asyncio
async def test_today_attendance_next_day_report_queried_from_subsequent_date():
    """
    If a report was saved with date_of_reporting=2026-09-25 but completed at 08:15 AM (< 10 AM),
    querying target_date=2026-09-24 must attribute it to 2026-09-24 with is_next_day: True.
    """
    mock_db = MockFirestore()
    
    mock_db.store["staff_directory"] = {
        "muz_shashi": {
            "name": "Shashi Ranjan",
            "district": "Muzaffarpur",
            "designation": "Field Officer",
            "is_active": True
        }
    }
    
    ts_shashi = datetime(2026, 9, 25, 8, 15, tzinfo=IST_TIMEZONE)
    # Stored with date_of_reporting = 2026-09-25 (e.g. unmigrated morning report)
    mock_db.store["daily_field_reports"] = {
        "muzaffarpur_shashi_ranjan_2026-09-25": {
            "fo_name": "Shashi Ranjan",
            "working_place": "Muzaffarpur",
            "date_of_reporting": "2026-09-25",
            "timestamp_completed": ts_shashi,
            "submission_count": 1,
            "notification_ids": ["333333333"]
        }
    }
    mock_db.store["daily_staff_leaves"] = {}

    token = make_admin_token(role="SUPER_ADMIN")
    headers = {"Authorization": f"Bearer {token}"}

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Query for 2026-09-24: Shashi Ranjan should appear as submitted next morning
            res24 = await ac.get(
                "/admin/today-attendance?date=2026-09-24&districts=Muzaffarpur&force_refresh=true",
                headers=headers
            )
            assert res24.status_code == 200
            d24 = res24.json()
            assert "Shashi Ranjan" in [fo["fo_name"] for fo in d24["submitted_fos"]]
            shashi24 = next(fo for fo in d24["submitted_fos"] if fo["fo_name"] == "Shashi Ranjan")
            assert shashi24.get("is_next_day") is True
            assert shashi24.get("time_classification") == "Next Day Morning (< 10 AM)"
            
            # 2. Query for 2026-09-25: Shashi Ranjan should NOT appear as submitted (belongs to 24th)
            res25 = await ac.get(
                "/admin/today-attendance?date=2026-09-25&districts=Muzaffarpur&force_refresh=true",
                headers=headers
            )
            assert res25.status_code == 200
            d25 = res25.json()
            assert "Shashi Ranjan" not in [fo["fo_name"] for fo in d25["submitted_fos"]]
            assert "Shashi Ranjan" in [fo["fo_name"] for fo in d25["missing_fos"]]
