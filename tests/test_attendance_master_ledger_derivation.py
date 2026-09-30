import pytest
import asyncio
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch, call
from pathlib import Path
import sys
import httpx

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import main
from main import app, cache, create_access_token, IST_TIMEZONE, canonicalize_district

def make_admin_token(role: str = "SUPER_ADMIN", allowed_districts=None, user_id="test_admin_id", username="test_admin"):
    return create_access_token({
        "user_id": user_id,
        "username": username,
        "name": "Test Admin",
        "role": role,
        "allowed_districts": allowed_districts if allowed_districts is not None else ["All"]
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
        snap.to_dict.return_value = dict(self.store.get(self.coll_name, {}).get(self.doc_id, {}))
        snap.reference = self
        return snap

class MockCollection:
    def __init__(self, coll_name: str, store: dict, filters=None, stream_spy=None):
        self.coll_name = coll_name
        self.store = store
        self.filters = filters or []
        self.stream_spy = stream_spy

    def document(self, doc_id: str):
        return MockDocRef(self.coll_name, doc_id, self.store)

    def where(self, field, op, val):
        new_filters = list(self.filters) + [(field, op, val)]
        return MockCollection(self.coll_name, self.store, new_filters, self.stream_spy)

    def stream(self):
        if self.stream_spy is not None:
            self.stream_spy(self.coll_name, self.filters)
        docs = []
        for doc_id, data in list(self.store.get(self.coll_name, {}).items()):
            match = True
            for field, op, val in self.filters:
                doc_val = data.get(field)
                if op == "==" and doc_val != val:
                    match = False
                    break
                elif op == ">=" and (doc_val is None or doc_val < val):
                    match = False
                    break
                elif op == "<=" and (doc_val is None or doc_val > val):
                    match = False
                    break
            if match:
                docs.append(MockDocRef(self.coll_name, doc_id, self.store).get())
        return docs

class MockFirestore:
    def __init__(self):
        self.store = {}
        self.stream_calls = []

    def _record_stream(self, coll_name, filters):
        self.stream_calls.append((coll_name, filters))

    def collection(self, name: str):
        return MockCollection(name, self.store, stream_spy=self._record_stream)

@pytest.fixture(autouse=True)
def clear_attendance_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.mark.asyncio
async def test_zero_read_master_ledger_derivation():
    """
    Verify get_today_attendance derives data from get_raw_monthly_reports and
    does NOT call db.collection('daily_field_reports').where(...).stream() with exact date matches.
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
    ts = datetime(2026, 9, 25, 14, 30, tzinfo=IST_TIMEZONE)
    mock_db.store["daily_field_reports"] = {
        "muzaffarpur_ramesh_kumar_2026-09-25": {
            "fo_name": "Ramesh Kumar",
            "working_place": "Muzaffarpur",
            "date_of_reporting": "2026-09-25",
            "timestamp_completed": ts,
            "submission_count": 1,
            "notification_ids": ["N100"]
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
            assert data["submitted_count"] == 1
            assert data["submitted_fos"][0]["fo_name"] == "Ramesh Kumar"

            # Check stream calls: There must be NO stream calls where op == "==" on date_of_reporting/date
            # The only daily_field_reports stream allowed is the monthly date range (>= and <=) from get_raw_monthly_reports.
            for coll_name, filters in mock_db.stream_calls:
                if coll_name == "daily_field_reports":
                    ops = [f[1] for f in filters]
                    assert "==" not in ops, f"Found prohibited exact match stream on daily_field_reports: {filters}"


@pytest.mark.asyncio
async def test_month_end_boundary_day30_includes_next_month_morning():
    """
    Day 30 (>= 28): Next-day morning submission on Day 1 of the following month (< 10 AM)
    must be fetched across the month boundary and attributed to Day 30 with is_next_day: True.
    """
    mock_db = MockFirestore()
    mock_db.store["staff_directory"] = {
        "muz_amit": {
            "name": "Amit Kumar",
            "district": "Muzaffarpur",
            "designation": "Field Officer",
            "is_active": True
        }
    }
    # Submitted on 2026-10-01 at 08:15 AM IST (Next day morning submission for 2026-09-30)
    ts_oct1_morning = datetime(2026, 10, 1, 8, 15, tzinfo=IST_TIMEZONE)
    mock_db.store["daily_field_reports"] = {
        "muzaffarpur_amit_kumar_2026-09-30": {
            "fo_name": "Amit Kumar",
            "working_place": "Muzaffarpur",
            "date_of_reporting": "2026-09-30",
            "timestamp_completed": ts_oct1_morning,
            "submission_count": 1,
            "notification_ids": ["N999"],
            "is_next_day_submission": True,
            "submitted_morning_time": "08:15 AM",
            "morning_submission_label": "Next day morning 08:15 AM"
        }
    }
    mock_db.store["daily_staff_leaves"] = {}

    token = make_admin_token(role="SUPER_ADMIN")
    headers = {"Authorization": f"Bearer {token}"}

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get(
                "/admin/today-attendance?date=2026-09-30&districts=Muzaffarpur&force_refresh=true",
                headers=headers
            )
            assert res.status_code == 200
            data = res.json()
            assert data["submitted_count"] == 1
            fo_sub = data["submitted_fos"][0]
            assert fo_sub["fo_name"] == "Amit Kumar"
            assert fo_sub["is_next_day"] is True
            assert fo_sub["time_classification"] == "Next Day Morning (< 10 AM)"


@pytest.mark.asyncio
async def test_month_end_boundary_day1_loads_prev_month():
    """
    Day 1 (<= 2): If target_date is 2026-10-01, master ledger must inspect both 2026-10 and 2026-09.
    Submissions on 2026-10-01 before cutoff (< 10 AM) must NOT count toward 2026-10-01.
    """
    mock_db = MockFirestore()
    mock_db.store["staff_directory"] = {
        "muz_deepak": {
            "name": "Deepak Kumar",
            "district": "Muzaffarpur",
            "designation": "Field Officer",
            "is_active": True
        }
    }
    ts_morning = datetime(2026, 10, 1, 8, 45, tzinfo=IST_TIMEZONE)
    mock_db.store["daily_field_reports"] = {
        "muzaffarpur_deepak_kumar_2026-10-01": {
            "fo_name": "Deepak Kumar",
            "working_place": "Muzaffarpur",
            "date_of_reporting": "2026-10-01",
            "timestamp_completed": ts_morning,
            "submission_count": 1,
            "notification_ids": ["N123"]
        }
    }
    mock_db.store["daily_staff_leaves"] = {}

    token = make_admin_token(role="SUPER_ADMIN")
    headers = {"Authorization": f"Bearer {token}"}

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get(
                "/admin/today-attendance?date=2026-10-01&districts=Muzaffarpur&force_refresh=true",
                headers=headers
            )
            assert res.status_code == 200
            data = res.json()
            # 8:45 AM on Oct 1 belongs to Sept 30, so Deepak is MISSING on Oct 1
            assert data["submitted_count"] == 0
            assert data["missing_count"] == 1
            assert data["missing_fos"][0]["fo_name"] == "Deepak Kumar"


@pytest.mark.asyncio
async def test_sub_admin_rbac_cache_key_isolation_and_boundary_enforcement():
    """
    Verify:
    1. Sub-Admin and Super Admin cache keys do not collide (user_scope is bound into cache key).
    2. Sub-Admin strictly receives only staff and reports from their allowed_districts.
    3. Cache TTL is 600s.
    """
    mock_db = MockFirestore()
    mock_db.store["staff_directory"] = {
        "gaya_anil": {
            "name": "Anil Sharma",
            "district": "Gaya",
            "designation": "Field Officer",
            "is_active": True
        },
        "patna_vikas": {
            "name": "Vikas Verma",
            "district": "Patna",
            "designation": "Field Officer",
            "is_active": True
        }
    }
    ts_gaya = datetime(2026, 9, 25, 14, 0, tzinfo=IST_TIMEZONE)
    ts_patna = datetime(2026, 9, 25, 15, 0, tzinfo=IST_TIMEZONE)
    mock_db.store["daily_field_reports"] = {
        "gaya_anil_sharma_2026-09-25": {
            "fo_name": "Anil Sharma",
            "working_place": "Gaya",
            "date_of_reporting": "2026-09-25",
            "timestamp_completed": ts_gaya,
            "submission_count": 1,
            "notification_ids": ["G1"]
        },
        "patna_vikas_verma_2026-09-25": {
            "fo_name": "Vikas Verma",
            "working_place": "Patna",
            "date_of_reporting": "2026-09-25",
            "timestamp_completed": ts_patna,
            "submission_count": 1,
            "notification_ids": ["P1"]
        }
    }
    mock_db.store["daily_staff_leaves"] = {}

    super_token = make_admin_token(role="SUPER_ADMIN", user_id="super_user_1", username="superadmin")
    sub_token = make_admin_token(role="SUB_ADMIN", allowed_districts=["Gaya"], user_id="sub_user_42", username="sub_gaya")

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Super Admin queries attendance (no district filter -> all)
            super_res = await ac.get(
                "/admin/today-attendance?date=2026-09-25",
                headers={"Authorization": f"Bearer {super_token}"}
            )
            assert super_res.status_code == 200
            super_data = super_res.json()
            assert super_data["total_staff"] == 2
            assert super_data["submitted_count"] == 2

            # Verify Super Admin cache key exists with _super suffix
            super_cache_key = "attendance_2026-09-25_all_super"
            assert cache.get(super_cache_key) is not None, f"Expected cache key {super_cache_key} to be set"

            # 2. Sub-Admin queries attendance
            sub_res = await ac.get(
                "/admin/today-attendance?date=2026-09-25",
                headers={"Authorization": f"Bearer {sub_token}"}
            )
            assert sub_res.status_code == 200
            sub_data = sub_res.json()
            # Must strictly contain ONLY Gaya
            assert sub_data["total_staff"] == 1
            assert sub_data["submitted_count"] == 1
            assert sub_data["submitted_fos"][0]["district"] == "Gaya"
            assert sub_data["submitted_fos"][0]["fo_name"] == "Anil Sharma"

            # Verify Sub-Admin cache key exists with _sub_<id> suffix and did not collide with super
            sub_cache_key = "attendance_2026-09-25_gaya_sub_sub_user_42"
            assert cache.get(sub_cache_key) is not None, f"Expected cache key {sub_cache_key} to be set"
            # Ensure super cache was NOT overwritten by sub-admin
            assert cache.get(super_cache_key)["total_staff"] == 2


@pytest.mark.asyncio
async def test_sub_admin_empty_allowed_districts_isolation_and_403():
    """
    Sub-Admin with empty allowed_districts ([]):
    1. Querying without districts param must return 0 staff and 0 submissions (zero leakage).
    2. Cache key must use '_none_' instead of '_all_'.
    3. Querying with ?districts=Patna must raise HTTP 403 Forbidden.
    """
    mock_db = MockFirestore()
    mock_db.store["staff_directory"] = {
        "patna_vikas": {
            "name": "Vikas Verma",
            "district": "Patna",
            "designation": "Field Officer",
            "is_active": True
        }
    }
    ts_patna = datetime(2026, 9, 25, 15, 0, tzinfo=IST_TIMEZONE)
    mock_db.store["daily_field_reports"] = {
        "patna_vikas_verma_2026-09-25": {
            "fo_name": "Vikas Verma",
            "working_place": "Patna",
            "date_of_reporting": "2026-09-25",
            "timestamp_completed": ts_patna,
            "submission_count": 1,
            "notification_ids": ["P1"]
        }
    }
    mock_db.store["daily_staff_leaves"] = {}

    sub_empty_token = make_admin_token(
        role="SUB_ADMIN",
        allowed_districts=[],
        user_id="sub_empty_99",
        username="sub_empty"
    )

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Querying without params
            res = await ac.get(
                "/admin/today-attendance?date=2026-09-25",
                headers={"Authorization": f"Bearer {sub_empty_token}"}
            )
            assert res.status_code == 200
            data = res.json()
            assert data["total_staff"] == 0
            assert data["submitted_count"] == 0
            assert data["submitted_fos"] == []
            assert data["missing_fos"] == []

            # Check cache key has 'none'
            expected_key = "attendance_2026-09-25_none_sub_sub_empty_99"
            assert cache.get(expected_key) is not None

            # 2. Querying forbidden district ?districts=Patna
            res_forbidden = await ac.get(
                "/admin/today-attendance?date=2026-09-25&districts=Patna",
                headers={"Authorization": f"Bearer {sub_empty_token}"}
            )
            assert res_forbidden.status_code == 403


@pytest.mark.asyncio
async def test_get_raw_monthly_reports_empty_filter():
    """
    get_raw_monthly_reports with district_filter=set() must immediately return [] without querying Firestore.
    """
    mock_db = MockFirestore()
    with patch("main.db", mock_db):
        res = await main.get_raw_monthly_reports("2026-09", district_filter=set())
        assert res == []
        assert len(mock_db.stream_calls) == 0

