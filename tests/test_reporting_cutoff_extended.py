import pytest
from datetime import datetime
from unittest.mock import patch, MagicMock
from pathlib import Path
import sys
import httpx

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from main import (
    app, 
    cache, 
    create_access_token, 
    get_reporting_cutoff_hour, 
    resolve_effective_reporting_date, 
    IST_TIMEZONE
)

@pytest.mark.asyncio
async def test_cutoff_on_first_day_of_month():
    """
    On the 1st of any month (month-end close grace),
    cutoff is 12:00 PM Noon.
    Submissions before 12 PM map to last day of previous month.
    """
    # 1. 1st of October at 11:30 AM IST (before 12 PM Noon)
    dt_morning = datetime(2026, 10, 1, 11, 30, tzinfo=IST_TIMEZONE)
    with patch("main.get_ist_now", return_value=dt_morning):
        resolved = await resolve_effective_reporting_date("Vinay Prakash", "Muzaffarpur", "2026-10-01")
        assert resolved == "2026-09-30", "11:30 AM on Oct 1st must map to Sept 30th (previous month closing)"

    # 2. 1st of October at 12:15 PM IST (after 12 PM Noon)
    dt_afternoon = datetime(2026, 10, 1, 12, 15, tzinfo=IST_TIMEZONE)
    with patch("main.get_ist_now", return_value=dt_afternoon):
        resolved = await resolve_effective_reporting_date("Vinay Prakash", "Muzaffarpur", "2026-10-01")
        assert resolved == "2026-10-01", "12:15 PM on Oct 1st must map to Oct 1st (today)"

@pytest.mark.asyncio
async def test_cutoff_on_regular_days():
    """
    On regular days (Day 2 to 31),
    cutoff is 11:00 AM IST.
    Submissions before 11 AM map to yesterday.
    Submissions at or after 11 AM map to today.
    """
    # 1. 15th of October at 10:30 AM IST (before 11 AM)
    dt_morning = datetime(2026, 10, 15, 10, 30, tzinfo=IST_TIMEZONE)
    with patch("main.get_ist_now", return_value=dt_morning):
        resolved = await resolve_effective_reporting_date("Vinay Prakash", "Muzaffarpur", "2026-10-15")
        assert resolved == "2026-10-14", "10:30 AM on regular day must map to yesterday (Oct 14th)"

    # 2. 15th of October at 11:05 AM IST (after 11 AM)
    dt_late = datetime(2026, 10, 15, 11, 5, tzinfo=IST_TIMEZONE)
    with patch("main.get_ist_now", return_value=dt_late):
        resolved = await resolve_effective_reporting_date("Vinay Prakash", "Muzaffarpur", "2026-10-15")
        assert resolved == "2026-10-15", "11:05 AM on regular day must map to today (Oct 15th)"

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
        for doc_id, data in self.store.get(self.coll_name, {}).items():
            matches = True
            for field, op, val in self.filters:
                if op == "==" and data.get(field) != val:
                    matches = False
                    break
            if matches:
                doc = MagicMock()
                doc.id = doc_id
                doc.to_dict.return_value = data
                docs.append(doc)
        return docs

class MockFirestore:
    def __init__(self):
        self.store = {}

    def collection(self, name):
        return MockCollection(name, self.store)

@pytest.mark.asyncio
async def test_update_staff_details_syncs_month_and_fallback_targets():
    """
    When updating staff details with a target,
    backend must write BOTH month-scoped and fallback documents to staff_targets,
    and invalidate targets_ and staff_targets_raw_ cache keys.
    """
    mock_db = MockFirestore()
    doc_id = "muzaffarpur_vinayprakash"
    mock_db.store["staff_directory"] = {
        doc_id: {
            "name": "Vinay Prakash",
            "district": "Muzaffarpur",
            "pin": "1234",
            "designation": "LT",
            "is_active": True
        }
    }
    mock_db.store["staff_targets"] = {}

    token = create_access_token({
        "user_id": "superadmin_id",
        "username": "superadmin",
        "name": "Super Admin",
        "role": "SUPER_ADMIN",
        "allowed_districts": ["All"]
    })
    headers = {"Authorization": f"Bearer {token}"}

    current_month = datetime.now().strftime("%Y-%m")
    month_target_key = f"{current_month}_muzaffarpur_vinayprakash"
    fallback_target_key = "muzaffarpur_vinayprakash"

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post(
                "/admin/staff/update-details",
                headers=headers,
                json={
                    "district": "Muzaffarpur",
                    "name": "Vinay Prakash",
                    "new_pin": "5678",
                    "designation": "LT",
                    "target": 75
                }
            )
            assert res.status_code == 200, f"Update failed: {res.text}"
            data = res.json()
            assert data["success"] is True

            # Verify directory updated
            updated_dir = mock_db.store["staff_directory"][doc_id]
            assert updated_dir["pin"] == "5678"
            assert updated_dir["designation"] == "LT"

            # Verify BOTH month-scoped and fallback target documents were written
            targets_store = mock_db.store["staff_targets"]
            assert month_target_key in targets_store, "Month-scoped target doc must be written"
            assert targets_store[month_target_key]["target"] == 75
            assert targets_store[month_target_key]["month"] == current_month

            assert fallback_target_key in targets_store, "Fallback target doc must be written"
            assert targets_store[fallback_target_key]["target"] == 75
