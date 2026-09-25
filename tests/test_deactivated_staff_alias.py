import asyncio
from unittest.mock import MagicMock, patch
import httpx
import pytest
import re
from pathlib import Path
import sys

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

    def add(self, data):
        return (None, MockDocRef(self.coll_name, "auto_id", self.store))

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
    cache.delete_prefix("attendance_")
    cache.delete_prefix("staff_directory")
    yield
    cache.delete_prefix("attendance_")
    cache.delete_prefix("staff_directory")

@pytest.mark.asyncio
async def test_today_attendance_excludes_purushotam_when_purushottam_is_inactive():
    """
    Test that when 'sitamarhi_purushottamkumar' (double 'tt', 'mm') is marked inactive in Firestore,
    an active entry with single 't' or spelling variation 'Purushotam Kumar' in Sitamarhi
    is strictly excluded from missing_fos, staff_list, and defaulters due to consonant-collapsed defense.
    """
    mock_db = MockFirestore()
    token = make_admin_token(role="SUPER_ADMIN")
    headers = {"Authorization": f"Bearer {token}"}

    # In staff_directory:
    # 1. Purushottam Kumar is deactivated in Sitamarhi
    # 2. Avinash Kumar is active in Sitamarhi
    # 3. Purushotam Kumar (spelling variant with single 't') is also present as active or in directory
    mock_db.store["staff_directory"] = {
        "sitamarhi_purushottamkumar": {
            "district": "Sitamarhi",
            "name": "Purushottam Kumar",
            "pin": "1111",
            "designation": "Field Officer",
            "status": "inactive",
            "is_active": False,
            "inactive_since": "2026-09-01"
        },
        "sitamarhi_purushotamkumar": {
            "district": "Sitamarhi",
            "name": "Purushotam Kumar",
            "pin": "1111",
            "designation": "Field Officer",
            "status": "active",
            "is_active": True
        },
        "sitamarhi_avinashkumar": {
            "district": "Sitamarhi",
            "name": "Avinash Kumar",
            "pin": "2222",
            "designation": "Field Officer",
            "status": "active",
            "is_active": True
        }
    }

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get(
                "/admin/today-attendance?date=2026-09-25&districts=Sitamarhi&force_refresh=true",
                headers=headers
            )
            assert res.status_code == 200, res.text
            data = res.json()

            missing_names = [fo["fo_name"].lower() for fo in data.get("missing_fos", [])]
            submitted_names = [fo["fo_name"].lower() for fo in data.get("submitted_fos", [])]
            all_names = missing_names + submitted_names

            # Avinash Kumar must be present
            assert any("avinash" in name for name in missing_names), "Avinash Kumar should be in missing_fos"

            # Purushotam / Purushottam Kumar must NOT be in any list
            for name in all_names:
                assert "purushot" not in name and "purushott" not in name, (
                    f"Deactivated officer '{name}' should not appear in today attendance"
                )
