import asyncio
from datetime import datetime
from unittest.mock import MagicMock, patch
import httpx
import pytest
import os
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
        snap.to_dict.return_value = self.store.get(self.coll_name, {}).get(self.doc_id, {})
        snap.reference = self
        return snap

class MockFirestore:
    def __init__(self):
        self.store = {}

    def collection(self, name: str):
        coll_mock = MagicMock()
        coll_mock.document.side_effect = lambda doc_id: MockDocRef(name, doc_id, self.store)
        coll_mock.add.side_effect = lambda data: (None, MockDocRef(name, "auto_id", self.store))
        coll_mock.stream.side_effect = lambda: [
            MockDocRef(name, doc_id, self.store).get()
            for doc_id in list(self.store.get(name, {}).keys())
        ]
        coll_mock.where.side_effect = lambda *args, **kwargs: coll_mock
        return coll_mock

@pytest.fixture(autouse=True)
def clear_attendance_cache():
    cache.delete_prefix("attendance_")
    cache.delete_prefix("admin_staff_full_list")
    cache.delete_prefix("pacing_settings_")
    cache.delete_prefix("profile_")
    yield
    cache.delete_prefix("attendance_")
    cache.delete_prefix("admin_staff_full_list")
    cache.delete_prefix("pacing_settings_")
    cache.delete_prefix("profile_")

@pytest.mark.asyncio
async def test_mark_and_unmark_leave_success():
    mock_db = MockFirestore()
    token = make_admin_token(role="SUPER_ADMIN")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Pre-populate a cache key to verify cache eviction
    cache.set("attendance_2026-09-22_all", {"cached": True})

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Mark leave
            mark_payload = {
                "district": "Jamui",
                "fo_name": "Ramesh Kumar",
                "date": "2026-09-22",
                "status": "leave",
                "reason_type": "Medical",
                "remark": "Fever"
            }
            res = await ac.post("/admin/attendance/mark-leave", json=mark_payload, headers=headers)
            assert res.status_code == 200, res.text
            data = res.json()
            assert data.get("success") is True
            assert "Leave recorded successfully" in data.get("message", "")

            # Verify Firestore persistence in daily_staff_leaves
            leaves_store = mock_db.store.get("daily_staff_leaves", {})
            doc_id = "2026-09-22_Jamui_rameshkumar"
            assert doc_id in leaves_store
            saved_doc = leaves_store[doc_id]
            assert saved_doc["district"] == "Jamui"
            assert saved_doc["fo_name"] == "Ramesh Kumar"
            assert saved_doc["date"] == "2026-09-22"
            assert saved_doc["status"] == "leave"
            assert saved_doc["reason_type"] == "Medical"
            assert saved_doc["remark"] == "Fever"
            assert saved_doc["marked_by_name"] == "Test Admin"
            assert saved_doc["marked_by_role"] == "SUPER_ADMIN"
            assert "marked_at" in saved_doc

            # Verify cache eviction
            assert cache.get("attendance_2026-09-22_all") is None

            # Re-seed cache
            cache.set("attendance_2026-09-22_all", {"cached_again": True})

            # 2. Unmark leave
            unmark_payload = {
                "district": "Jamui",
                "fo_name": "Ramesh Kumar",
                "date": "2026-09-22"
            }
            unmark_res = await ac.post("/admin/attendance/unmark-leave", json=unmark_payload, headers=headers)
            assert unmark_res.status_code == 200, unmark_res.text
            unmark_data = unmark_res.json()
            assert unmark_data.get("success") is True
            assert "Leave removed successfully" in unmark_data.get("message", "")

            # Verify document deleted
            assert doc_id not in mock_db.store.get("daily_staff_leaves", {})

            # Verify cache eviction after unmark
            assert cache.get("attendance_2026-09-22_all") is None

@pytest.mark.asyncio
async def test_mark_leave_subadmin_rbac():
    mock_db = MockFirestore()
    # Sub-admin permitted only for "Jamui" and "Aurangabad"
    subadmin_token = make_admin_token(
        role="SUB_ADMIN",
        allowed_districts=["Jamui", "Aurangabad"],
        username="subadmin_jamui"
    )
    headers = {"Authorization": f"Bearer {subadmin_token}"}

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Permitted district should succeed (200)
            res_allowed = await ac.post(
                "/admin/attendance/mark-leave",
                json={
                    "district": "Jamui",
                    "fo_name": "Ramesh Kumar",
                    "date": "2026-09-22",
                    "status": "leave",
                    "reason_type": "Casual"
                },
                headers=headers
            )
            assert res_allowed.status_code == 200, res_allowed.text
            assert res_allowed.json().get("success") is True

            # 2. Canonical district alias matching (e.g. "aurangabad-bi" -> "Aurangabad") should succeed (200)
            res_alias = await ac.post(
                "/admin/attendance/mark-leave",
                json={
                    "district": "aurangabad-bi",
                    "fo_name": "Suresh Singh",
                    "date": "2026-09-22",
                    "status": "absent",
                    "reason_type": "Uninformed"
                },
                headers=headers
            )
            assert res_alias.status_code == 200, res_alias.text

            # 3. Forbidden district (Gaya) must return 403
            res_forbidden = await ac.post(
                "/admin/attendance/mark-leave",
                json={
                    "district": "Gaya",
                    "fo_name": "Sunil Kumar",
                    "date": "2026-09-22",
                    "status": "leave",
                    "reason_type": "Personal"
                },
                headers=headers
            )
            assert res_forbidden.status_code == 403
            assert "Permission denied" in res_forbidden.json().get("detail", "")

            # 4. Forbidden district unmark must also return 403
            res_unmark_forbidden = await ac.post(
                "/admin/attendance/unmark-leave",
                json={
                    "district": "Gaya",
                    "fo_name": "Sunil Kumar",
                    "date": "2026-09-22"
                },
                headers=headers
            )
            assert res_unmark_forbidden.status_code == 403
            assert "Permission denied" in res_unmark_forbidden.json().get("detail", "")


@pytest.mark.asyncio
async def test_staff_toggle_status_and_pin_block():
    mock_db = MockFirestore()
    # Pre-populate staff_directory with an active staff member in Jamui and Gaya
    jamui_doc_id = "jamui_rameshkumar"
    mock_db.store["staff_directory"] = {
        jamui_doc_id: {
            "district": "Jamui",
            "name": "Ramesh Kumar",
            "pin": "1234",
            "designation": "Field Officer",
            "status": "active",
            "is_active": True,
            "created_at": "2026-09-01 10:00:00"
        },
        "gaya_sunilkumar": {
            "district": "Gaya",
            "name": "Sunil Kumar",
            "pin": "5678",
            "designation": "Field Officer",
            "status": "active",
            "is_active": True,
            "created_at": "2026-09-01 10:00:00"
        }
    }

    superadmin_token = make_admin_token(role="SUPER_ADMIN")
    superadmin_headers = {"Authorization": f"Bearer {superadmin_token}"}

    subadmin_token = make_admin_token(
        role="SUB_ADMIN",
        allowed_districts=["Jamui"],
        username="subadmin_jamui"
    )
    subadmin_headers = {"Authorization": f"Bearer {subadmin_token}"}

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Verify active officer can verify PIN
            pin_res = await ac.post("/verify-pin", json={
                "working_place": "Jamui",
                "fo_name": "Ramesh Kumar",
                "pin": "1234"
            })
            assert pin_res.status_code == 200
            assert pin_res.json().get("valid") is True

            # 2. Toggle status to inactive with effective_date
            toggle_res = await ac.post(
                "/admin/staff/toggle-status",
                json={
                    "district": "Jamui",
                    "fo_name": "Ramesh Kumar",
                    "status": "inactive",
                    "effective_date": "2026-09-20"
                },
                headers=superadmin_headers
            )
            assert toggle_res.status_code == 200, toggle_res.text
            toggle_data = toggle_res.json()
            assert toggle_data.get("success") is True
            assert "inactive" in toggle_data.get("message", "")

            # Verify Firestore updated
            updated_doc = mock_db.store["staff_directory"][jamui_doc_id]
            assert updated_doc.get("is_active") is False
            assert updated_doc.get("status") == "inactive"
            assert updated_doc.get("inactive_since") == "2026-09-20"

            # 3. Call /verify-pin -> verify returns valid: False with deactivated error
            deact_pin_res = await ac.post("/verify-pin", json={
                "working_place": "Jamui",
                "fo_name": "Ramesh Kumar",
                "pin": "1234"
            })
            assert deact_pin_res.status_code == 200
            deact_data = deact_pin_res.json()
            assert deact_data.get("valid") is False
            assert "Account deactivated" in deact_data.get("error", "")

            # Verify fallback outage mode NEVER bypasses deactivated account
            with patch.object(mock_db, "collection", side_effect=Exception("Firestore quota exceeded")):
                outage_res = await ac.post("/verify-pin", json={
                    "working_place": "Jamui",
                    "fo_name": "Ramesh Kumar",
                    "pin": "1234"
                })
                assert outage_res.status_code == 200
                assert outage_res.json().get("valid") is False
                assert "Account deactivated" in outage_res.json().get("error", "")

            # 4. Call /admin/staff/list with status_filter
            # Filter inactive
            list_inactive_res = await ac.get("/admin/staff/list?status_filter=inactive", headers=superadmin_headers)
            assert list_inactive_res.status_code == 200
            inactive_staff = list_inactive_res.json().get("staff", [])
            assert any(s["name"] == "Ramesh Kumar" and s["status"] == "inactive" and s["is_active"] is False and s.get("inactive_since") == "2026-09-20" for s in inactive_staff)
            assert not any(s["name"] == "Sunil Kumar" for s in inactive_staff)

            # Filter active
            list_active_res = await ac.get("/admin/staff/list?status_filter=active", headers=superadmin_headers)
            assert list_active_res.status_code == 200
            active_staff = list_active_res.json().get("staff", [])
            assert not any(s["name"] == "Ramesh Kumar" for s in active_staff)
            assert any(s["name"] == "Sunil Kumar" for s in active_staff)

            # Filter all
            list_all_res = await ac.get("/admin/staff/list?status_filter=all", headers=superadmin_headers)
            assert list_all_res.status_code == 200
            all_staff = list_all_res.json().get("staff", [])
            assert any(s["name"] == "Ramesh Kumar" for s in all_staff)
            assert any(s["name"] == "Sunil Kumar" for s in all_staff)

            # 5. Toggle status back to active
            reactivate_res = await ac.post(
                "/admin/staff/toggle-status",
                json={
                    "district": "Jamui",
                    "fo_name": "Ramesh Kumar",
                    "status": "active"
                },
                headers=superadmin_headers
            )
            assert reactivate_res.status_code == 200
            assert reactivate_res.json().get("success") is True
            reactivated_doc = mock_db.store["staff_directory"][jamui_doc_id]
            assert reactivated_doc.get("is_active") is True
            assert reactivated_doc.get("status") == "active"
            assert reactivated_doc.get("inactive_since") is None

            # Verify /verify-pin succeeds after reactivation
            react_pin_res = await ac.post("/verify-pin", json={
                "working_place": "Jamui",
                "fo_name": "Ramesh Kumar",
                "pin": "1234"
            })
            assert react_pin_res.status_code == 200
            assert react_pin_res.json().get("valid") is True

            # 6. Test Sub-Admin RBAC
            # Sub-admin unauthorized for Gaya -> 403
            rbac_forbidden = await ac.post(
                "/admin/staff/toggle-status",
                json={
                    "district": "Gaya",
                    "fo_name": "Sunil Kumar",
                    "status": "inactive"
                },
                headers=subadmin_headers
            )
            assert rbac_forbidden.status_code == 403
            assert "Permission denied" in rbac_forbidden.json().get("detail", "")

            # Sub-admin authorized for Jamui -> 200
            rbac_allowed = await ac.post(
                "/admin/staff/toggle-status",
                json={
                    "district": "Jamui",
                    "fo_name": "Ramesh Kumar",
                    "status": "inactive"
                },
                headers=subadmin_headers
            )
            assert rbac_allowed.status_code == 200
            assert rbac_allowed.json().get("success") is True


@pytest.mark.asyncio
async def test_pacing_settings_and_profile_working_days():
    mock_db = MockFirestore()
    superadmin_token = make_admin_token(role="SUPER_ADMIN")
    superadmin_headers = {"Authorization": f"Bearer {superadmin_token}"}

    subadmin_token = make_admin_token(
        role="SUB_ADMIN",
        allowed_districts=["Jamui"],
        username="subadmin_jamui"
    )
    subadmin_headers = {"Authorization": f"Bearer {subadmin_token}"}

    # Pre-populate staff_directory and staff_targets for officer
    mock_db.store["staff_directory"] = {
        "jamui_rameshkumar": {
            "district": "Jamui",
            "name": "Ramesh Kumar",
            "pin": "1234",
            "status": "active",
            "is_active": True
        }
    }
    mock_db.store["staff_targets"] = {
        "2026-09_jamui_rameshkumar": {
            "target": 50
        }
    }

    with patch("main.db", mock_db):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. Super Admin sets statewide default holidays (month=2026-09, district="all", declared_holidays=3)
            res_state = await ac.post(
                "/admin/pacing/settings",
                json={"month": "2026-09", "district": "all", "declared_holidays": 3},
                headers=superadmin_headers
            )
            assert res_state.status_code == 200, res_state.text
            assert res_state.json().get("success") is True
            assert res_state.json().get("declared_holidays") == 3

            # 2. Super Admin sets district override for Jamui (declared_holidays=2)
            res_jamui_super = await ac.post(
                "/admin/pacing/settings",
                json={"month": "2026-09", "district": "Jamui", "declared_holidays": 2},
                headers=superadmin_headers
            )
            assert res_jamui_super.status_code == 200
            assert res_jamui_super.json().get("declared_holidays") == 2

            # 3. Sub-Admin for Jamui sets Jamui override (declared_holidays=4) -> HTTP 200
            res_jamui_sub = await ac.post(
                "/admin/pacing/settings",
                json={"month": "2026-09", "district": "Jamui", "declared_holidays": 4},
                headers=subadmin_headers
            )
            assert res_jamui_sub.status_code == 200
            assert res_jamui_sub.json().get("declared_holidays") == 4

            # 4. Sub-Admin for Jamui tries to set statewide "all" -> HTTP 403
            res_sub_all = await ac.post(
                "/admin/pacing/settings",
                json={"month": "2026-09", "district": "all", "declared_holidays": 1},
                headers=subadmin_headers
            )
            assert res_sub_all.status_code == 403
            assert "Sub-Admins cannot modify statewide default holidays" in res_sub_all.json().get("detail", "")

            # 5. Sub-Admin for Jamui tries to set Gaya override -> HTTP 403
            res_sub_gaya = await ac.post(
                "/admin/pacing/settings",
                json={"month": "2026-09", "district": "Gaya", "declared_holidays": 1},
                headers=subadmin_headers
            )
            assert res_sub_gaya.status_code == 403
            assert "Permission denied" in res_sub_gaya.json().get("detail", "")

            # 6. Query GET /admin/pacing/settings?month=2026-09&district=Jamui -> gets Jamui override (4 holidays, is_override=True)
            get_jamui = await ac.get("/admin/pacing/settings?month=2026-09&district=Jamui", headers=superadmin_headers)
            assert get_jamui.status_code == 200
            d_jamui = get_jamui.json()
            assert d_jamui.get("success") is True
            assert d_jamui.get("month") == "2026-09"
            assert d_jamui.get("district") == "Jamui"
            assert d_jamui.get("declared_holidays") == 4
            assert d_jamui.get("is_override") is True

            # 7. Query GET /admin/pacing/settings?month=2026-09&district=Gaya -> gets state default (3 holidays, is_override=False)
            get_gaya = await ac.get("/admin/pacing/settings?month=2026-09&district=Gaya", headers=superadmin_headers)
            assert get_gaya.status_code == 200
            d_gaya = get_gaya.json()
            assert d_gaya.get("success") is True
            assert d_gaya.get("month") == "2026-09"
            assert d_gaya.get("declared_holidays") == 3
            assert d_gaya.get("is_override") is False

            # 8. Query /my-profile-stats -> verifies working_days_info present with correct fields
            prof_res = await ac.post(
                "/my-profile-stats",
                json={
                    "working_place": "Jamui",
                    "fo_name": "Ramesh Kumar",
                    "pin": "1234",
                    "month": "2026-09"
                }
            )
            assert prof_res.status_code == 200, prof_res.text
            prof_data = prof_res.json()
            assert prof_data.get("success") is True
            assert "working_days_info" in prof_data
            winfo = prof_data["working_days_info"]
            assert winfo["month"] == "2026-09"
            assert winfo["total_days"] == 30
            assert winfo["sundays"] == 4
            assert winfo["declared_holidays"] == 4
            assert winfo["total_working_days"] == 22  # 30 - 4 - 4
            assert "elapsed_working_days" in winfo
            assert "remaining_working_days" in winfo
            assert "required_run_rate" in winfo
            assert "current_run_rate" in winfo
            assert "expected_to_date" in winfo
            assert "pace_diff" in winfo


