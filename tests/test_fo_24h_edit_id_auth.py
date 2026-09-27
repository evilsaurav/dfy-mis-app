import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import pytest
import asyncio
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch
import httpx
import jwt

import main
from main import app, JWT_SECRET_KEY, JWT_ALGORITHM, hash_password


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

            # Query chaining: where(...).where(...).stream()
            def query_stream():
                return [r for r in self.reports if r.exists]

            q_mock = MagicMock()
            q_mock.where.return_value = q_mock
            q_mock.stream.side_effect = query_stream
            mock_col.where.return_value = q_mock
            return mock_col

        elif name == "id_edit_logs" or name == "admin_audit_logs":
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


def make_admin_token(role="SUPER_ADMIN", allowed_districts=None, username="test_admin"):
    payload = {
        "user_id": username,
        "username": username,
        "name": "Test Admin",
        "role": role,
        "allowed_districts": allowed_districts or ["All"],
        "exp": datetime.now(timezone.utc) + timedelta(days=1),
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


@pytest.mark.asyncio
async def test_fo_edit_id_without_admin_token_with_valid_pin_succeeds():
    """FO must be able to edit/add/delete patient IDs within 24h using their 4-digit PIN, with NO admin token."""
    now_utc = datetime.now(timezone.utc)
    recent_ts = (now_utc - timedelta(hours=2)).strftime("%Y-%m-%d %H:%M:%S")

    doc_id = "gaya_ramesh_kumar_2026-09-27"
    report_doc = FakeDoc({
        "working_place": "Gaya",
        "fo_name": "Ramesh Kumar",
        "date_of_reporting": "2026-09-27",
        "timestamp_completed": recent_ts,
        "notification_ids": ["111222333"],
        "notifications": 1
    }, doc_id=doc_id, exists=True)

    staff_dict = {
        "gaya_rameshkumar": {"pin": hash_password("4321"), "name": "Ramesh Kumar", "district": "Gaya"}
    }

    mock_db = MockFirestore(reports=[report_doc], staff_members=staff_dict)

    payload = {
        "working_place": "Gaya",
        "fo_name": "Ramesh Kumar",
        "date": "2026-09-27",
        "category": "notification_ids",
        "action": "replace",
        "old_id": "111222333",
        "new_id": "999888777",
        "pin": "4321",
        "edited_by": "FO"
    }

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        # Note: headers has NO Authorization header!
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post("/api/reports/edit-id", json=payload)
            assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
            data = res.json()
            assert data["success"] is True
            assert "999888777" in data["updated_ids"]
            assert "111222333" not in data["updated_ids"]


@pytest.mark.asyncio
async def test_fo_edit_id_without_pin_fails_with_401():
    """FO calling edit-id without a PIN must receive 401."""
    now_utc = datetime.now(timezone.utc)
    recent_ts = (now_utc - timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")

    doc_id = "gaya_ramesh_kumar_2026-09-27"
    report_doc = FakeDoc({
        "working_place": "Gaya",
        "fo_name": "Ramesh Kumar",
        "date_of_reporting": "2026-09-27",
        "timestamp_completed": recent_ts,
        "notification_ids": ["111222333"],
        "notifications": 1
    }, doc_id=doc_id, exists=True)

    mock_db = MockFirestore(reports=[report_doc])

    payload = {
        "working_place": "Gaya",
        "fo_name": "Ramesh Kumar",
        "date": "2026-09-27",
        "category": "notification_ids",
        "action": "replace",
        "old_id": "111222333",
        "new_id": "999888777",
        "pin": "",  # Missing PIN
        "edited_by": "FO"
    }

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post("/api/reports/edit-id", json=payload)
            assert res.status_code == 401


@pytest.mark.asyncio
async def test_fo_edit_id_with_invalid_pin_fails_with_401():
    """FO calling edit-id with wrong PIN must receive 401."""
    now_utc = datetime.now(timezone.utc)
    recent_ts = (now_utc - timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")

    doc_id = "gaya_ramesh_kumar_2026-09-27"
    report_doc = FakeDoc({
        "working_place": "Gaya",
        "fo_name": "Ramesh Kumar",
        "date_of_reporting": "2026-09-27",
        "timestamp_completed": recent_ts,
        "notification_ids": ["111222333"],
        "notifications": 1
    }, doc_id=doc_id, exists=True)

    staff_dict = {
        "gaya_rameshkumar": {"pin": hash_password("4321"), "name": "Ramesh Kumar", "district": "Gaya"}
    }

    mock_db = MockFirestore(reports=[report_doc], staff_members=staff_dict)

    payload = {
        "working_place": "Gaya",
        "fo_name": "Ramesh Kumar",
        "date": "2026-09-27",
        "category": "notification_ids",
        "action": "replace",
        "old_id": "111222333",
        "new_id": "999888777",
        "pin": "9999",  # Wrong PIN
        "edited_by": "FO"
    }

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post("/api/reports/edit-id", json=payload)
            assert res.status_code == 401
            assert "Invalid PIN" in res.json()["detail"] or "PIN" in res.json()["detail"]


@pytest.mark.asyncio
async def test_fo_edit_id_after_24h_fails_with_403():
    """FO editing a report past 24 hours must be rejected with 403."""
    now_utc = datetime.now(timezone.utc)
    old_ts = (now_utc - timedelta(hours=30)).strftime("%Y-%m-%d %H:%M:%S")

    doc_id = "gaya_ramesh_kumar_2026-09-25"
    report_doc = FakeDoc({
        "working_place": "Gaya",
        "fo_name": "Ramesh Kumar",
        "date_of_reporting": "2026-09-25",
        "timestamp_completed": old_ts,
        "notification_ids": ["111222333"],
        "notifications": 1
    }, doc_id=doc_id, exists=True)

    staff_dict = {
        "gaya_rameshkumar": {"pin": hash_password("4321"), "name": "Ramesh Kumar", "district": "Gaya"}
    }

    mock_db = MockFirestore(reports=[report_doc], staff_members=staff_dict)

    payload = {
        "working_place": "Gaya",
        "fo_name": "Ramesh Kumar",
        "date": "2026-09-25",
        "category": "notification_ids",
        "action": "replace",
        "old_id": "111222333",
        "new_id": "999888777",
        "pin": "4321",
        "edited_by": "FO"
    }

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post("/api/reports/edit-id", json=payload)
            assert res.status_code == 403
            assert "24 hours limit" in res.json()["detail"]


@pytest.mark.asyncio
async def test_admin_edit_id_without_token_fails_with_401():
    """Claiming edited_by='Admin' without a valid admin token must be rejected with 401."""
    doc_id = "gaya_ramesh_kumar_2026-09-20"
    report_doc = FakeDoc({
        "working_place": "Gaya",
        "fo_name": "Ramesh Kumar",
        "date_of_reporting": "2026-09-20",
        "notification_ids": ["111222333"]
    }, doc_id=doc_id, exists=True)

    mock_db = MockFirestore(reports=[report_doc])

    payload = {
        "working_place": "Gaya",
        "fo_name": "Ramesh Kumar",
        "date": "2026-09-20",
        "category": "notification_ids",
        "action": "replace",
        "old_id": "111222333",
        "new_id": "999888777",
        "edited_by": "Admin"
    }

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post("/api/reports/edit-id", json=payload)
            assert res.status_code == 401
            assert "administrator" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_admin_edit_id_with_valid_token_bypasses_24h_window_and_succeeds():
    """An admin with valid JWT token can edit reports older than 24h."""
    now_utc = datetime.now(timezone.utc)
    old_ts = (now_utc - timedelta(days=10)).strftime("%Y-%m-%d %H:%M:%S")

    doc_id = "gaya_ramesh_kumar_2026-09-10"
    report_doc = FakeDoc({
        "working_place": "Gaya",
        "fo_name": "Ramesh Kumar",
        "date_of_reporting": "2026-09-10",
        "timestamp_completed": old_ts,
        "notification_ids": ["111222333"],
        "notifications": 1
    }, doc_id=doc_id, exists=True)

    mock_db = MockFirestore(reports=[report_doc])

    token = make_admin_token(role="SUPER_ADMIN")
    payload = {
        "working_place": "Gaya",
        "fo_name": "Ramesh Kumar",
        "date": "2026-09-10",
        "category": "notification_ids",
        "action": "replace",
        "old_id": "111222333",
        "new_id": "999888777",
        "edited_by": "Admin"
    }

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post(
                "/api/reports/edit-id", 
                json=payload, 
                headers={"Authorization": f"Bearer {token}"}
            )
            assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
            assert res.json()["success"] is True


@pytest.mark.asyncio
async def test_subadmin_edit_id_enforces_district_rbac():
    """Sub-Admin with access only to Patna cannot edit reports in Gaya."""
    doc_id = "gaya_ramesh_kumar_2026-09-20"
    report_doc = FakeDoc({
        "working_place": "Gaya",
        "fo_name": "Ramesh Kumar",
        "date_of_reporting": "2026-09-20",
        "notification_ids": ["111222333"]
    }, doc_id=doc_id, exists=True)

    mock_db = MockFirestore(reports=[report_doc])

    token = make_admin_token(role="SUB_ADMIN", allowed_districts=["Patna"])
    payload = {
        "working_place": "Gaya",
        "fo_name": "Ramesh Kumar",
        "date": "2026-09-20",
        "category": "notification_ids",
        "action": "replace",
        "old_id": "111222333",
        "new_id": "999888777",
        "edited_by": "Admin"
    }

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post(
                "/api/reports/edit-id", 
                json=payload, 
                headers={"Authorization": f"Bearer {token}"}
            )
            assert res.status_code == 403
            assert "Permission denied" in res.json()["detail"]
