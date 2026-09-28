import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from unittest.mock import patch, MagicMock
from httpx import AsyncClient, ASGITransport
import main
from main import app, build_ta_doc_id, canonicalize_district, cache

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

class MockBatch:
    def __init__(self, store: dict):
        self.store = store
        self.ops = []

    def set(self, ref, data, merge=True):
        self.ops.append(('set', ref, data, merge))
        return self

    def update(self, ref, data):
        self.ops.append(('update', ref, data))
        return self

    def commit(self):
        for op in self.ops:
            if op[0] == 'set':
                op[1].set(op[2], merge=op[3])
            elif op[0] == 'update':
                op[1].update(op[2])
        self.ops.clear()

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
        docs = self.store.get(self.coll_name, {})
        for doc_id, data in docs.items():
            matches = True
            for field, op, val in self.filters:
                doc_val = data.get(field)
                if op == "==" and doc_val != val:
                    matches = False
                    break
            if matches:
                snap = MagicMock()
                snap.exists = True
                snap.id = doc_id
                snap.to_dict.return_value = dict(data)
                snap.reference = MockDocRef(self.coll_name, doc_id, self.store)
                yield snap

@pytest.fixture(autouse=True)
def mock_firestore():
    store = {
        "admin_users": {},
        "travel_allowance_logs": {},
        "staff_directory": {}
    }
    mock_db = MagicMock()
    mock_db.collection.side_effect = lambda c: MockCollection(c, store)
    mock_db.batch.side_effect = lambda: MockBatch(store)
    cache.clear()
    with patch("main.db", mock_db):
        yield store
    cache.clear()

@pytest.mark.asyncio
async def test_ta_district_action_mis_submit():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Login as Super Admin to create MIS and Incharge test tokens
        mis_token = main.create_access_token({
            "user_id": "test_gaya_mis",
            "name": "Test Gaya MIS",
            "role": "MIS",
            "allowed_districts": ["Gaya"]
        })
        incharge_token = main.create_access_token({
            "user_id": "test_gaya_incharge",
            "name": "Dr. Incharge",
            "role": "MAIN_INCHARGE",
            "allowed_districts": ["Gaya"]
        })

        # Save an initial draft log
        save_res = await ac.post("/api/ta-logs/save", json={
            "month": "2026-09",
            "district": "Gaya",
            "staff_key": "officer_test_1",
            "staff_name": "Officer Test 1",
            "designation": "Field Officer",
            "daily_logs": {
                "2026-09-01": {"initial_reading": 1000, "final_reading": 1050, "total_km": 50, "rate": 4.0, "amount": 200.0}
            },
            "deduction_amount": 0.0,
            "deduction_reason": "",
            "admin_remarks": ""
        }, headers={"Authorization": f"Bearer {mis_token}"})
        assert save_res.status_code == 200

        # MIS submits the district roster
        submit_res = await ac.post("/api/ta/district-action", json={
            "month": "2026-09",
            "district": "Gaya",
            "action": "submit"
        }, headers={"Authorization": f"Bearer {mis_token}"})
        assert submit_res.status_code == 200
        assert submit_res.json().get("success") is True

        # Verify state is now SUBMITTED
        log_res = await ac.get("/admin/ta/log?month=2026-09&district=Gaya", headers={"Authorization": f"Bearer {incharge_token}"})
        assert log_res.status_code == 200
        logs = log_res.json().get("logs", [])
        matched = [l for l in logs if l.get("staff_key") == "officer_test_1"]
        assert len(matched) == 1
        assert matched[0].get("status") == "SUBMITTED"

@pytest.mark.asyncio
async def test_ta_district_action_incharge_approve_and_revert():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        mis_token = main.create_access_token({
            "user_id": "test_gaya_mis",
            "name": "Test Gaya MIS",
            "role": "MIS",
            "allowed_districts": ["Gaya"]
        })
        incharge_token = main.create_access_token({
            "user_id": "test_gaya_incharge",
            "name": "Dr. Incharge",
            "role": "MAIN_INCHARGE",
            "allowed_districts": ["Gaya"]
        })

        # MIS cannot call approve (must be 403 Forbidden)
        forbidden_res = await ac.post("/api/ta/district-action", json={
            "month": "2026-09",
            "district": "Gaya",
            "action": "approve"
        }, headers={"Authorization": f"Bearer {mis_token}"})
        assert forbidden_res.status_code == 403

        # Incharge reverts with remarks
        revert_res = await ac.post("/api/ta/district-action", json={
            "month": "2026-09",
            "district": "Gaya",
            "action": "revert",
            "revert_reason": "Sherghati PHC meter reading needs correction"
        }, headers={"Authorization": f"Bearer {incharge_token}"})
        assert revert_res.status_code == 200

        # Incharge approves district
        approve_res = await ac.post("/api/ta/district-action", json={
            "month": "2026-09",
            "district": "Gaya",
            "action": "approve"
        }, headers={"Authorization": f"Bearer {incharge_token}"})
        assert approve_res.status_code == 200
        assert approve_res.json().get("success") is True

@pytest.mark.asyncio
async def test_ta_district_action_unauthorized_roles_and_district_isolation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        subadmin_token = main.create_access_token({
            "user_id": "test_gaya_subadmin",
            "name": "Sub Admin",
            "role": "SUB_ADMIN",
            "allowed_districts": ["Gaya"]
        })
        mis_token = main.create_access_token({
            "user_id": "test_gaya_mis",
            "name": "Test Gaya MIS",
            "role": "MIS",
            "allowed_districts": ["Gaya"]
        })

        # SUB_ADMIN without can_manage_ta cannot perform district-action (403)
        sub_res = await ac.post("/api/ta/district-action", json={
            "month": "2026-09",
            "district": "Gaya",
            "action": "submit"
        }, headers={"Authorization": f"Bearer {subadmin_token}"})
        assert sub_res.status_code == 403

        # SUB_ADMIN with can_manage_ta permission CAN submit (200)
        subadmin_ta_token = main.create_access_token({
            "user_id": "test_gaya_subadmin_ta",
            "name": "Sub Admin With TA",
            "role": "SUB_ADMIN",
            "allowed_districts": ["Gaya"],
            "permissions": {"can_manage_ta": True}
        })
        sub_ta_res = await ac.post("/api/ta/district-action", json={
            "month": "2026-09",
            "district": "Gaya",
            "action": "submit"
        }, headers={"Authorization": f"Bearer {subadmin_ta_token}"})
        assert sub_ta_res.status_code == 200

        # SUB_ADMIN with can_manage_ta: False cannot save TA log (403)
        subadmin_blocked_ta_token = main.create_access_token({
            "user_id": "test_gaya_subadmin_blocked",
            "name": "Sub Admin Blocked TA",
            "role": "SUB_ADMIN",
            "allowed_districts": ["Gaya"],
            "permissions": {"can_manage_ta": False}
        })
        save_blocked_res = await ac.post("/api/ta-logs/save", json={
            "month": "2026-09",
            "district": "Gaya",
            "staff_key": "officer_subadmin_test",
            "staff_name": "Officer SubAdmin Test",
            "daily_logs": {
                "2026-09-01": {"initial_reading": 100, "final_reading": 150, "total_km": 50, "rate": 4.0, "amount": 200.0}
            }
        }, headers={"Authorization": f"Bearer {subadmin_blocked_ta_token}"})
        assert save_blocked_res.status_code == 403

        # SUB_ADMIN with can_manage_ta: True can save TA log (200)
        save_allowed_res = await ac.post("/api/ta-logs/save", json={
            "month": "2026-09",
            "district": "Gaya",
            "staff_key": "officer_subadmin_test",
            "staff_name": "Officer SubAdmin Test",
            "daily_logs": {
                "2026-09-01": {"initial_reading": 100, "final_reading": 150, "total_km": 50, "rate": 4.0, "amount": 200.0}
            }
        }, headers={"Authorization": f"Bearer {subadmin_ta_token}"})
        assert save_allowed_res.status_code == 200

        # Sub Admin cannot submit outside allowed district (403)
        iso_res = await ac.post("/api/ta/district-action", json={
            "month": "2026-09",
            "district": "Patna",
            "action": "submit"
        }, headers={"Authorization": f"Bearer {subadmin_ta_token}"})
        assert iso_res.status_code == 403

@pytest.mark.asyncio
async def test_ta_cache_ttl_and_invalidation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        mis_token = main.create_access_token({
            "user_id": "test_gaya_mis",
            "name": "Test Gaya MIS",
            "role": "MIS",
            "allowed_districts": ["Gaya"]
        })
        incharge_token = main.create_access_token({
            "user_id": "test_gaya_incharge",
            "name": "Dr. Incharge",
            "role": "MAIN_INCHARGE",
            "allowed_districts": ["Gaya"]
        })

        # Save an initial log
        await ac.post("/api/ta-logs/save", json={
            "month": "2026-09",
            "district": "Gaya",
            "staff_key": "officer_cached",
            "staff_name": "Officer Cached",
            "daily_logs": {
                "2026-09-01": {"initial_reading": 100, "final_reading": 150, "total_km": 50, "rate": 4.0, "amount": 200.0}
            }
        }, headers={"Authorization": f"Bearer {mis_token}"})

        # Cache key should initially be populated upon first GET
        cache_key = "ta_roster_2026-09_gaya"
        res1 = await ac.get("/admin/ta/log?month=2026-09&district=Gaya", headers={"Authorization": f"Bearer {incharge_token}"})
        assert res1.status_code == 200
        cached_data = cache.get(cache_key)
        assert cached_data is not None
        assert len(cached_data) == 1
        assert cached_data[0]["staff_key"] == "officer_cached"
        assert cached_data[0]["status"] == "DRAFT"

        # Action invalidates the 300s TTL cache
        act_res = await ac.post("/api/ta/district-action", json={
            "month": "2026-09",
            "district": "Gaya",
            "action": "submit"
        }, headers={"Authorization": f"Bearer {mis_token}"})
        assert act_res.status_code == 200
        # Cache must have been cleared
        assert cache.get(cache_key) is None

        # Re-fetching repopulates cache with updated state
        res2 = await ac.get("/admin/ta/log?month=2026-09&district=Gaya", headers={"Authorization": f"Bearer {incharge_token}"})
        assert res2.status_code == 200
        cached_after = cache.get(cache_key)
        assert cached_after is not None
        assert cached_after[0]["status"] == "SUBMITTED"

@pytest.mark.asyncio
async def test_ta_district_action_individual_staff_pass_and_hold():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        incharge_token = main.create_access_token({
            "user_id": "test_gaya_incharge",
            "name": "Dr. Incharge",
            "role": "MAIN_INCHARGE",
            "allowed_districts": ["Gaya"]
        })
        subadmin_ta_token = main.create_access_token({
            "user_id": "test_gaya_subadmin_ta",
            "name": "Gaya SubAdmin TA",
            "role": "SUB_ADMIN",
            "allowed_districts": ["Gaya"],
            "permissions": {"can_manage_ta": True}
        })

        # 1. Save logs for two staff in Gaya
        for skey in ["officer_pass", "officer_hold"]:
            await ac.post("/api/ta-logs/save", json={
                "month": "2026-09",
                "district": "Gaya",
                "staff_key": skey,
                "staff_name": skey.replace("_", " ").title(),
                "daily_logs": {
                    "2026-09-01": {"initial_reading": 100, "final_reading": 150, "total_km": 50, "rate": 4.0, "amount": 200.0}
                }
            }, headers={"Authorization": f"Bearer {subadmin_ta_token}"})

        # 2. Sub Admin submits district roster
        submit_res = await ac.post("/api/ta/district-action", json={
            "month": "2026-09",
            "district": "Gaya",
            "action": "submit"
        }, headers={"Authorization": f"Bearer {subadmin_ta_token}"})
        assert submit_res.status_code == 200

        # 3. Incharge passes (approves) only officer_pass
        pass_res = await ac.post("/api/ta/district-action", json={
            "month": "2026-09",
            "district": "Gaya",
            "action": "approve",
            "staff_keys": ["officer_pass"]
        }, headers={"Authorization": f"Bearer {incharge_token}"})
        assert pass_res.status_code == 200
        assert "1 officer(s)" in pass_res.json().get("message", "")

        # 4. Incharge holds (reverts) only officer_hold with remarks
        hold_res = await ac.post("/api/ta/district-action", json={
            "month": "2026-09",
            "district": "Gaya",
            "action": "revert",
            "staff_keys": ["officer_hold"],
            "revert_reason": "Meter photo blur on 1st Sept"
        }, headers={"Authorization": f"Bearer {incharge_token}"})
        assert hold_res.status_code == 200

        # 5. Verify district roster state: officer_pass is APPROVED, officer_hold is REVERTED
        roster_res = await ac.get("/admin/ta/log?month=2026-09&district=Gaya", headers={"Authorization": f"Bearer {incharge_token}"})
        assert roster_res.status_code == 200
        logs = roster_res.json().get("logs", [])
        pass_log = next(l for l in logs if l.get("staff_key") == "officer_pass")
        hold_log = next(l for l in logs if l.get("staff_key") == "officer_hold")

        assert pass_log.get("status") == "APPROVED"
        assert hold_log.get("status") == "REVERTED"
        assert hold_log.get("revert_reason") == "Meter photo blur on 1st Sept"


