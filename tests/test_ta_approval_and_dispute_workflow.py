import os
import sys
from pathlib import Path
import pytest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from fastapi.testclient import TestClient

import main
from backend.routers.travel_allowance import (
    apply_staff_status_transition,
    validate_edit_permission,
    is_dispute_window_open,
)

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def cleanup():
    main.app.dependency_overrides.clear()
    from backend.core.cache import cache
    cache.clear()
    yield
    main.app.dependency_overrides.clear()
    cache.clear()


def test_granular_per_staff_pass_and_revert():
    # 5 staff members in district
    staff_records = {
        "s1": {"status": "SUBMITTED", "is_locked": False},
        "s2": {"status": "SUBMITTED", "is_locked": False},
        "s3": {"status": "SUBMITTED", "is_locked": False},
        "s4": {"status": "SUBMITTED", "is_locked": False},
        "s5": {"status": "SUBMITTED", "is_locked": False},
    }

    # Pass 4 staff
    for sid in ["s1", "s2", "s3", "s4"]:
        res = apply_staff_status_transition(
            staff_records[sid],
            action="PASS",
            actor_role="MAIN_INCHARGE",
            actor_name="Incharge A"
        )
        assert res["status"] == "APPROVED"
        assert res["is_locked"] is True
        assert res["approved_by"] == "Incharge A"
        assert "approved_at" in res

    # Revert 1 staff with specific reason
    res5 = apply_staff_status_transition(
        staff_records["s5"],
        action="REVERT",
        actor_role="MAIN_INCHARGE",
        actor_name="Incharge A",
        reason="Mismatched Odometer on Day 12"
    )
    assert res5["status"] == "REVERTED"
    assert res5["is_locked"] is False
    assert res5["revert_reason"] == "Mismatched Odometer on Day 12"
    assert res5["reverted_by"] == "Incharge A"
    assert "reverted_at" in res5


def test_locked_record_blocks_subadmin_edits_until_unlocked():
    locked_record = {"status": "APPROVED", "is_locked": True}

    # Sub-admin rejected
    allowed, err = validate_edit_permission(locked_record, user_role="SUB_ADMIN")
    assert allowed is False
    assert "locked" in err.lower()

    # Main incharge is read-only for editing readings
    allowed_inc, err_inc = validate_edit_permission({"status": "DRAFT", "is_locked": False}, user_role="MAIN_INCHARGE")
    assert allowed_inc is False
    assert "read-only" in err_inc.lower()

    # Incharge unlocks record
    unlocked = apply_staff_status_transition(
        locked_record,
        action="UNLOCK",
        actor_role="MAIN_INCHARGE",
        actor_name="Incharge A"
    )
    assert unlocked["is_locked"] is False
    assert unlocked["status"] == "REVERTED"
    assert unlocked["unlocked_by"] == "Incharge A"
    assert "unlocked_at" in unlocked

    # Sub-admin now allowed to edit
    allowed2, _ = validate_edit_permission(unlocked, user_role="SUB_ADMIN")
    assert allowed2 is True

    # Super Admin override allowed on locked record
    allowed_sa, _ = validate_edit_permission(locked_record, user_role="SUPER_ADMIN")
    assert allowed_sa is True


def test_fo_dispute_window_24_hours():
    now = datetime.utcnow()
    # 5 hours after approval -> OPEN
    assert is_dispute_window_open(approved_at=(now - timedelta(hours=5)).isoformat(), now_dt=now) is True
    # 25 hours after approval -> CLOSED
    assert is_dispute_window_open(approved_at=(now - timedelta(hours=25)).isoformat(), now_dt=now) is False
    # None or empty -> CLOSED
    assert is_dispute_window_open(None) is False
    assert is_dispute_window_open("") is False


def test_submit_roster_endpoint():
    # 1. Sub-Admin outside district -> 403
    with patch("backend.core.security.get_current_user", return_value={"uid": "u1", "role": "SUB_ADMIN", "allowed_districts": ["Gaya"]}):
        res = client.post("/admin/ta/submit-roster", json={"month": "2026-09", "district": "Patna"})
        assert res.status_code == 403

    # 2. Sub-Admin submits valid roster
    mock_doc = MagicMock()
    mock_doc.to_dict.return_value = {
        "doc_id": "2026-09_gaya_ramesh_kumar",
        "month": "2026-09",
        "district": "Gaya",
        "staff_name": "Ramesh Kumar",
        "staff_key": "ramesh_kumar",
        "status": "DRAFT",
        "is_locked": False
    }

    with patch("backend.core.security.get_current_user", return_value={"uid": "u1", "name": "SubAdmin 1", "role": "SUB_ADMIN", "allowed_districts": ["Gaya"]}):
        with patch("backend.core.database.db.collection") as mock_coll:
            mock_query = MagicMock()
            mock_query.stream.return_value = [mock_doc]
            mock_coll.return_value.where.return_value.where.return_value = mock_query

            res = client.post("/admin/ta/submit-roster", json={"month": "2026-09", "district": "Gaya"})
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "success"
            assert data["count"] == 1


def test_pass_revert_and_unlock_staff_endpoints():
    doc_data = {
        "doc_id": "2026-09_gaya_ramesh_kumar",
        "month": "2026-09",
        "district": "Gaya",
        "staff_name": "Ramesh Kumar",
        "staff_key": "ramesh_kumar",
        "status": "SUBMITTED",
        "is_locked": False
    }

    # 1. Sub-Admin forbidden from pass/revert/unlock (403)
    with patch("backend.core.security.get_current_user", return_value={"uid": "u1", "role": "SUB_ADMIN", "allowed_districts": ["Gaya"]}):
        res = client.post("/admin/ta/pass-staff", json={"month": "2026-09", "district": "Gaya", "staff_key": "ramesh_kumar"})
        assert res.status_code == 403

    # 2. Main Incharge passes staff
    with patch("backend.core.security.get_current_user", return_value={"uid": "u2", "name": "Incharge Gaya", "role": "MAIN_INCHARGE", "allowed_districts": ["All"]}):
        with patch("backend.core.database.db.collection") as mock_coll:
            mock_ref = MagicMock()
            mock_get = MagicMock()
            mock_get.exists = True
            mock_get.to_dict.return_value = dict(doc_data)
            mock_ref.get.return_value = mock_get
            mock_coll.return_value.document.return_value = mock_ref

            res = client.post("/admin/ta/pass-staff", json={"month": "2026-09", "district": "Gaya", "staff_key": "ramesh_kumar"})
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "success"
            assert data["data"]["status"] == "APPROVED"
            assert data["data"]["is_locked"] is True

    # 3. Main Incharge reverts staff without reason -> 400
    with patch("backend.core.security.get_current_user", return_value={"uid": "u2", "name": "Incharge Gaya", "role": "MAIN_INCHARGE", "allowed_districts": ["All"]}):
        res = client.post("/admin/ta/revert-staff", json={"month": "2026-09", "district": "Gaya", "staff_key": "ramesh_kumar", "revert_reason": ""})
        assert res.status_code == 400

    # 4. Main Incharge reverts staff with reason -> 200
    with patch("backend.core.security.get_current_user", return_value={"uid": "u2", "name": "Incharge Gaya", "role": "MAIN_INCHARGE", "allowed_districts": ["All"]}):
        with patch("backend.core.database.db.collection") as mock_coll:
            mock_ref = MagicMock()
            mock_get = MagicMock()
            mock_get.exists = True
            mock_get.to_dict.return_value = dict(doc_data)
            mock_ref.get.return_value = mock_get
            mock_coll.return_value.document.return_value = mock_ref

            res = client.post("/admin/ta/revert-staff", json={
                "month": "2026-09",
                "district": "Gaya",
                "staff_key": "ramesh_kumar",
                "revert_reason": "Excess odometer on Day 5"
            })
            assert res.status_code == 200
            data = res.json()
            assert data["data"]["status"] == "REVERTED"
            assert data["data"]["is_locked"] is False
            assert data["data"]["revert_reason"] == "Excess odometer on Day 5"

    # 5. Main Incharge unlocks staff
    with patch("backend.core.security.get_current_user", return_value={"uid": "u2", "name": "Incharge Gaya", "role": "MAIN_INCHARGE", "allowed_districts": ["All"]}):
        with patch("backend.core.database.db.collection") as mock_coll:
            mock_ref = MagicMock()
            mock_get = MagicMock()
            mock_get.exists = True
            approved_data = dict(doc_data)
            approved_data["status"] = "APPROVED"
            approved_data["is_locked"] = True
            mock_get.to_dict.return_value = approved_data
            mock_ref.get.return_value = mock_get
            mock_coll.return_value.document.return_value = mock_ref

            res = client.post("/admin/ta/unlock-staff", json={"month": "2026-09", "district": "Gaya", "staff_key": "ramesh_kumar"})
            assert res.status_code == 200
            data = res.json()
            assert data["data"]["status"] == "REVERTED"
            assert data["data"]["is_locked"] is False


def test_fo_summary_and_dispute_workflow():
    now = datetime.utcnow()

    # 1. Unapproved record returns UNDER_REVIEW
    with patch("backend.core.security.get_current_user", return_value={"uid": "fo1", "role": "FIELD_OFFICER", "name": "Ramesh Kumar"}):
        with patch("backend.core.database.db.collection") as mock_coll:
            mock_ref = MagicMock()
            mock_get = MagicMock()
            mock_get.exists = True
            mock_get.to_dict.return_value = {"status": "SUBMITTED"}
            mock_ref.get.return_value = mock_get
            mock_coll.return_value.document.return_value = mock_ref

            res = client.get("/fo/ta/monthly-summary?month=2026-09&district=Gaya&fo_name=Ramesh Kumar")
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "UNDER_REVIEW"
            assert data["data"] is None

    # 2. Approved record returns full financial details
    approved_doc = {
        "doc_id": "2026-09_gaya_ramesh_kumar",
        "month": "2026-09",
        "district": "Gaya",
        "staff_name": "Ramesh Kumar",
        "status": "APPROVED",
        "is_locked": True,
        "approved_at": (now - timedelta(hours=3)).isoformat(),
        "total_km": 300.0,
        "rate_per_km": 4.0,
        "gross_amount": 1200.0,
        "deduction_amount": 50.0,
        "deduction_reason": "Detour",
        "final_payable_amount": 1150.0,
        "days": []
    }

    with patch("backend.core.security.get_current_user", return_value={"uid": "fo1", "role": "FIELD_OFFICER", "name": "Ramesh Kumar"}):
        with patch("backend.core.database.db.collection") as mock_coll:
            mock_ref = MagicMock()
            mock_get = MagicMock()
            mock_get.exists = True
            mock_get.to_dict.return_value = approved_doc
            mock_ref.get.return_value = mock_get
            mock_coll.return_value.document.return_value = mock_ref

            res = client.get("/fo/ta/monthly-summary?month=2026-09&district=Gaya&fo_name=Ramesh Kumar")
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "APPROVED"
            assert data["dispute_window_active"] is True
            assert data["data"]["final_payable_amount"] == 1150.0

    # 3. FO raises dispute within 24h -> success & notification written
    with patch("backend.core.security.get_current_user", return_value={"uid": "fo1", "role": "FIELD_OFFICER", "name": "Ramesh Kumar"}):
        with patch("backend.core.database.db.collection") as mock_coll:
            mock_ref = MagicMock()
            mock_get = MagicMock()
            mock_get.exists = True
            mock_get.to_dict.return_value = dict(approved_doc)
            mock_ref.get.return_value = mock_get
            
            mock_notif_coll = MagicMock()

            def coll_router(name):
                if name == "broadcast_notifications":
                    return mock_notif_coll
                c = MagicMock()
                c.document.return_value = mock_ref
                return c

            mock_coll.side_effect = coll_router

            res = client.post("/fo/ta/dispute", json={
                "month": "2026-09",
                "district": "Gaya",
                "fo_name": "Ramesh Kumar",
                "dispute_reason": "Day 4 kilometers were undercounted by 15 KM"
            })
            assert res.status_code == 200
            assert res.json()["status"] == "success"
            mock_notif_coll.add.assert_called_once()
            notif_data = mock_notif_coll.add.call_args[0][0]
            assert "SUB_ADMIN" in notif_data["target_roles"]
            assert "MAIN_INCHARGE" in notif_data["target_roles"]
            assert notif_data["metadata"]["type"] == "TA_DISPUTE"

    # 4. FO raises dispute after 24h -> 400
    expired_doc = dict(approved_doc)
    expired_doc["approved_at"] = (now - timedelta(hours=30)).isoformat()

    with patch("backend.core.security.get_current_user", return_value={"uid": "fo1", "role": "FIELD_OFFICER", "name": "Ramesh Kumar"}):
        with patch("backend.core.database.db.collection") as mock_coll:
            mock_ref = MagicMock()
            mock_get = MagicMock()
            mock_get.exists = True
            mock_get.to_dict.return_value = expired_doc
            mock_ref.get.return_value = mock_get
            mock_coll.return_value.document.return_value = mock_ref

            res = client.post("/fo/ta/dispute", json={
                "month": "2026-09",
                "district": "Gaya",
                "fo_name": "Ramesh Kumar",
                "dispute_reason": "Too late dispute"
            })
            assert res.status_code == 400
            assert "closed" in res.json()["detail"].lower()

    # 5. Incharge resolves dispute with ACCEPT
    with patch("backend.core.security.get_current_user", return_value={"uid": "u2", "name": "Incharge Gaya", "role": "MAIN_INCHARGE", "allowed_districts": ["All"]}):
        with patch("backend.core.database.db.collection") as mock_coll:
            mock_ref = MagicMock()
            mock_get = MagicMock()
            mock_get.exists = True
            mock_get.to_dict.return_value = dict(approved_doc)
            mock_ref.get.return_value = mock_get
            mock_coll.return_value.document.return_value = mock_ref

            res = client.post("/admin/ta/resolve-dispute", json={
                "month": "2026-09",
                "district": "Gaya",
                "staff_key": "ramesh_kumar",
                "action": "ACCEPT",
                "resolution_remarks": "Agreed, odometer photo verified"
            })
            assert res.status_code == 200
            data = res.json()["data"]
            assert data["dispute_status"] == "RESOLVED"
            assert data["is_locked"] is False
            assert data["status"] == "REVERTED"

    # 6. Incharge resolves dispute with REJECT
    with patch("backend.core.security.get_current_user", return_value={"uid": "u2", "name": "Incharge Gaya", "role": "MAIN_INCHARGE", "allowed_districts": ["All"]}):
        with patch("backend.core.database.db.collection") as mock_coll:
            mock_ref = MagicMock()
            mock_get = MagicMock()
            mock_get.exists = True
            mock_get.to_dict.return_value = dict(approved_doc)
            mock_ref.get.return_value = mock_get
            mock_coll.return_value.document.return_value = mock_ref

            res = client.post("/admin/ta/resolve-dispute", json={
                "month": "2026-09",
                "district": "Gaya",
                "staff_key": "ramesh_kumar",
                "action": "REJECT",
                "resolution_remarks": "Readings matched daily report"
            })
            assert res.status_code == 200
            data = res.json()["data"]
            assert data["dispute_status"] == "REJECTED"
            assert data["is_locked"] is True
            assert data["status"] == "APPROVED"
