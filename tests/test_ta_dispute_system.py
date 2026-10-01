import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from datetime import datetime, timedelta
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

class _DbProxy:
    def __getattr__(self, name):
        return getattr(main.db, name)

db = _DbProxy()

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
async def test_ta_dispute_24h_window_and_resolution():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        incharge_token = main.create_access_token({
            "user_id": "test_gaya_incharge",
            "name": "Dr. Incharge",
            "role": "MAIN_INCHARGE",
            "allowed_districts": ["Gaya"]
        })

        month = "2026-09"
        district = "Gaya"
        staff_key = "fo_dispute_tester"

        # Seed staff directory entry for PIN validation
        doc_ref = db.collection("staff_directory").document("gaya_fo_dispute_tester")
        doc_ref.set({
            "id": "gaya_fo_dispute_tester",
            "name": "FO Dispute Tester",
            "district": "Gaya",
            "pin": "4321",
            "status": "Active"
        })

        # Seed approved TA log approved 2 hours ago
        ta_doc_id = build_ta_doc_id(month, district, staff_key)
        recent_approval = (datetime.now() - timedelta(hours=2)).strftime("%Y-%m-%d %H:%M:%S")
        db.collection("travel_allowance_logs").document(ta_doc_id).set({
            "month": month,
            "district": district,
            "staff_key": staff_key,
            "staff_name": "FO Dispute Tester",
            "status": "APPROVED",
            "approved_at": recent_approval,
            "approved_by": "Dr. Incharge",
            "total_km": 100,
            "gross_amount": 400.0,
            "deduction_amount": 100.0,
            "final_payable_amount": 300.0
        })

        # FO files dispute within 24h -> Must succeed (200)
        dispute_res = await ac.post("/api/ta/dispute", json={
            "month": month,
            "district": district,
            "staff_key": staff_key,
            "pin": "4321",
            "reason": "100 Rs deduction is incorrect; duty slip attached"
        })
        assert dispute_res.status_code == 200
        assert dispute_res.json().get("success") is True

        # Incharge resolves dispute with 'accept' -> reverts to DRAFT for MIS
        resolve_res = await ac.post("/api/ta/resolve-dispute", json={
            "month": month,
            "district": district,
            "staff_key": staff_key,
            "resolution": "accept",
            "resolution_note": "Reverted to MIS to remove 100 Rs deduction"
        }, headers={"Authorization": f"Bearer {incharge_token}"})
        assert resolve_res.status_code == 200

        # Verify state reverted to DRAFT and dispute is marked ACCEPTED
        updated_doc = db.collection("travel_allowance_logs").document(ta_doc_id).get().to_dict()
        assert updated_doc.get("status") == "DRAFT"
        assert updated_doc.get("dispute", {}).get("status") == "ACCEPTED"
        assert updated_doc.get("revert_reason") == "Reverted to MIS to remove 100 Rs deduction"

        # Seed an old approval 25 hours ago -> Dispute must fail with 400 Expired
        old_approval = (datetime.now() - timedelta(hours=25)).strftime("%Y-%m-%d %H:%M:%S")
        db.collection("travel_allowance_logs").document(ta_doc_id).update({
            "status": "APPROVED",
            "approved_at": old_approval,
            "dispute": {"is_disputed": False, "status": "NONE"}
        })
        expired_res = await ac.post("/api/ta/dispute", json={
            "month": month,
            "district": district,
            "staff_key": staff_key,
            "pin": "4321",
            "reason": "Late dispute attempt"
        })
        assert expired_res.status_code == 400
        assert "expired" in expired_res.json().get("detail", "").lower()

@pytest.mark.asyncio
async def test_ta_dispute_rejection_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        incharge_token = main.create_access_token({
            "user_id": "test_gaya_incharge",
            "name": "Dr. Incharge",
            "role": "MAIN_INCHARGE",
            "allowed_districts": ["Gaya"]
        })

        month = "2026-09"
        district = "Gaya"
        staff_key = "fo_dispute_rejectee"

        doc_ref = db.collection("staff_directory").document("gaya_fo_dispute_rejectee")
        doc_ref.set({
            "id": "gaya_fo_dispute_rejectee",
            "name": "FO Dispute Rejectee",
            "district": "Gaya",
            "pin": "9999",
            "status": "Active"
        })

        ta_doc_id = build_ta_doc_id(month, district, staff_key)
        recent_approval = (datetime.now() - timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")
        db.collection("travel_allowance_logs").document(ta_doc_id).set({
            "month": month,
            "district": district,
            "staff_key": staff_key,
            "staff_name": "FO Dispute Rejectee",
            "status": "APPROVED",
            "approved_at": recent_approval,
            "total_km": 80,
            "gross_amount": 320.0,
            "deduction_amount": 40.0,
            "final_payable_amount": 280.0
        })

        # File dispute
        dispute_res = await ac.post("/api/ta/dispute", json={
            "month": month,
            "district": district,
            "staff_key": staff_key,
            "pin": "9999",
            "reason": "Deduction of 40 Rs unjustified"
        })
        assert dispute_res.status_code == 200

        # Reject dispute
        resolve_res = await ac.post("/api/ta/resolve-dispute", json={
            "month": month,
            "district": district,
            "staff_key": staff_key,
            "resolution": "reject",
            "resolution_note": "No supporting log slip submitted for 10 KM on 12th Sep"
        }, headers={"Authorization": f"Bearer {incharge_token}"})
        assert resolve_res.status_code == 200

        # State must be restored to APPROVED and dispute status REJECTED
        updated_doc = db.collection("travel_allowance_logs").document(ta_doc_id).get().to_dict()
        assert updated_doc.get("status") == "APPROVED"
        assert updated_doc.get("dispute", {}).get("status") == "REJECTED"
        assert updated_doc.get("dispute", {}).get("resolution_note") == "No supporting log slip submitted for 10 KM on 12th Sep"

@pytest.mark.asyncio
async def test_ta_dispute_invalid_pin_and_non_approved():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        month = "2026-09"
        district = "Gaya"
        staff_key = "fo_dispute_pin_test"

        doc_ref = db.collection("staff_directory").document("gaya_fo_dispute_pin_test")
        doc_ref.set({
            "id": "gaya_fo_dispute_pin_test",
            "name": "FO PIN Test",
            "district": "Gaya",
            "pin": "1234",
            "status": "Active"
        })

        ta_doc_id = build_ta_doc_id(month, district, staff_key)
        db.collection("travel_allowance_logs").document(ta_doc_id).set({
            "month": month,
            "district": district,
            "staff_key": staff_key,
            "status": "DRAFT"
        })

        # Wrong PIN -> 401
        wrong_pin_res = await ac.post("/api/ta/dispute", json={
            "month": month,
            "district": district,
            "staff_key": staff_key,
            "pin": "9999",
            "reason": "Test"
        })
        assert wrong_pin_res.status_code == 401

        # Correct PIN but status is DRAFT -> 400
        draft_dispute_res = await ac.post("/api/ta/dispute", json={
            "month": month,
            "district": district,
            "staff_key": staff_key,
            "pin": "1234",
            "reason": "Cannot dispute draft"
        })
        assert draft_dispute_res.status_code == 400

@pytest.mark.asyncio
async def test_ta_carryover_polish_district_isolation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        incharge_token = main.create_access_token({
            "user_id": "test_gaya_incharge",
            "name": "Dr. Incharge",
            "role": "MAIN_INCHARGE",
            "allowed_districts": ["Gaya"]
        })
        mis_token = main.create_access_token({
            "user_id": "test_gaya_mis",
            "name": "Test Gaya MIS",
            "role": "MIS",
            "allowed_districts": ["Gaya"]
        })

        month = "2026-09"
        district = "Gaya"
        staff_key = "fo_revert_reset_tester"
        ta_doc_id = build_ta_doc_id(month, district, staff_key)

        # 1. Seed document with revert_reason
        db.collection("travel_allowance_logs").document(ta_doc_id).set({
            "month": month,
            "district": district,
            "staff_key": staff_key,
            "staff_name": "FO Revert Reset",
            "status": "REVERTED",
            "revert_reason": "Fix meter readings on 1st Sep"
        })

        # When MIS submits, revert_reason should be reset to empty
        submit_res = await ac.post("/api/ta/district-action", json={
            "month": month,
            "district": district,
            "action": "submit",
            "staff_keys": [staff_key]
        }, headers={"Authorization": f"Bearer {mis_token}"})
        assert submit_res.status_code == 200
        doc_after_submit = db.collection("travel_allowance_logs").document(ta_doc_id).get().to_dict()
        assert doc_after_submit.get("status") == "SUBMITTED"
        assert doc_after_submit.get("revert_reason") == ""

        # When Incharge approves, revert_reason should be empty
        approve_res = await ac.post("/api/ta/district-action", json={
            "month": month,
            "district": district,
            "action": "approve",
            "staff_keys": [staff_key]
        }, headers={"Authorization": f"Bearer {incharge_token}"})
        assert approve_res.status_code == 200
        doc_after_approve = db.collection("travel_allowance_logs").document(ta_doc_id).get().to_dict()
        assert doc_after_approve.get("status") == "APPROVED"
        assert doc_after_approve.get("revert_reason") == ""

        # 2. District isolation on prefill for MIS outside Gaya -> 403
        prefill_res = await ac.post("/api/ta-logs/prefill-from-reports?month=2026-09&district=Patna&staff_name=Test", headers={
            "Authorization": f"Bearer {mis_token}"
        })
        assert prefill_res.status_code == 403

        # 3. District isolation on analytics for MIS outside Gaya -> 403
        analytics_res = await ac.get("/api/ta-logs/analytics?month=2026-09&district=Patna", headers={
            "Authorization": f"Bearer {mis_token}"
        })
        assert analytics_res.status_code == 403

        # 4. District isolation on export-excel for MIS outside Gaya -> 403
        export_res = await ac.get("/api/ta-logs/export-excel?month=2026-09&district=Patna", headers={
            "Authorization": f"Bearer {mis_token}"
        })
        assert export_res.status_code == 403


@pytest.mark.asyncio
async def test_ta_dispute_rejection_locking():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        incharge_token = main.create_access_token({
            "user_id": "test_gaya_incharge",
            "name": "Dr. Incharge",
            "role": "MAIN_INCHARGE",
            "allowed_districts": ["Gaya"]
        })

        month = "2026-09"
        district = "Gaya"
        staff_key = "fo_reject_lock_tester"
        ta_doc_id = build_ta_doc_id(month, district, staff_key)

        # Seed staff directory entry
        db.collection("staff_directory").document("gaya_fo_reject_lock_tester").set({
            "id": "gaya_fo_reject_lock_tester",
            "name": "FO Reject Lock Tester",
            "district": "Gaya",
            "pin": "7788",
            "status": "Active"
        })

        # Seed approved log
        db.collection("travel_allowance_logs").document(ta_doc_id).set({
            "month": month,
            "district": district,
            "staff_key": staff_key,
            "staff_name": "FO Reject Lock Tester",
            "status": "APPROVED",
            "approved_at": main.get_ist_now().strftime("%Y-%m-%d %H:%M:%S"),
            "approved_by": "Dr. Incharge",
            "total_km": 100,
            "gross_amount": 400.0,
            "deduction_amount": 50.0,
            "final_payable_amount": 350.0
        })

        # 1. FO disputes -> 200
        dispute_res = await ac.post("/api/ta/dispute", json={
            "month": month,
            "district": district,
            "staff_key": staff_key,
            "pin": "7788",
            "reason": "Deduction is wrong"
        })
        assert dispute_res.status_code == 200

        # 2. Incharge rejects dispute -> 200
        resolve_res = await ac.post("/api/ta/resolve-dispute", json={
            "month": month,
            "district": district,
            "staff_key": staff_key,
            "resolution": "reject",
            "resolution_note": "Deduction verified with GPS route logs"
        }, headers={"Authorization": f"Bearer {incharge_token}"})
        assert resolve_res.status_code == 200

        # 3. FO attempts to re-dispute an already rejected dispute -> 400
        redispute_res = await ac.post("/api/ta/dispute", json={
            "month": month,
            "district": district,
            "staff_key": staff_key,
            "pin": "7788",
            "reason": "Trying again"
        })
        assert redispute_res.status_code == 400
        assert "rejected" in redispute_res.json().get("detail", "").lower()

