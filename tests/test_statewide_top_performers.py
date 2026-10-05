import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient
from main import app, cache, create_access_token

client = TestClient(app)

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
def clear_leaderboard_caches():
    cache.delete_prefix("statewide_top_")
    cache.delete("staff_directory_map")
    cache.delete("staff_directory")
    cache.delete("inactive_staff_keys")
    yield
    cache.delete_prefix("statewide_top_")
    cache.delete("staff_directory_map")
    cache.delete("staff_directory")
    cache.delete("inactive_staff_keys")

@pytest.fixture
def super_admin_token():
    return create_access_token({
        "user_id": "admin",
        "username": "admin",
        "name": "Super Admin",
        "role": "SUPER_ADMIN",
        "allowed_districts": ["All"]
    })

@pytest.fixture
def sub_admin_token():
    return create_access_token({
        "user_id": "sub_gaya",
        "username": "gaya_coord",
        "name": "Gaya Coordinator",
        "role": "SUB_ADMIN",
        "allowed_districts": ["Gaya"]
    })

def test_statewide_top_performers_super_and_subadmin_access(super_admin_token, sub_admin_token):
    mock_reports = [
        {
            "doc_id": "patna_fo1_2026-09-25",
            "working_place": "Patna",
            "fo_name": "Ravi Kumar",
            "date_of_reporting": "2026-09-25",
            "notification_ids": ["N1", "N2", "N3", "N4", "N5"],
        },
        {
            "doc_id": "gaya_fo2_2026-09-24",
            "working_place": "Gaya",
            "fo_name": "Amit Singh",
            "date_of_reporting": "2026-09-24",
            "notification_ids": ["N6", "N7", "N8"],
        },
        {
            "doc_id": "aurangabad_fo3_2026-09-20",
            "working_place": "Aurangabad",
            "fo_name": "Prince Kumar",
            "date_of_reporting": "2026-09-20",
            "notification_ids": ["N9", "N10", "N11", "N12", "N13", "N14"],
        },
        {
            "doc_id": "sitamarhi_inactive_2026-09-22",
            "working_place": "Sitamarhi",
            "fo_name": "Purushotam Kumar",  # Deactivated officer
            "date_of_reporting": "2026-09-22",
            "notification_ids": ["N15", "N16", "N17", "N18"],
        }
    ]

    with patch("main.get_raw_monthly_reports", new=AsyncMock(return_value=mock_reports)):
        # 1. Super Admin access
        res_super = client.get(
            "/api/statewide-top-performers?month=2026-09&period=monthly",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert res_super.status_code == 200, res_super.text
        data_super = res_super.json()
        assert data_super["success"] is True
        assert "top_districts" in data_super
        assert "top_staff" in data_super
        assert "top_fo" in data_super
        assert "top_lt" in data_super
        assert "top_sct" in data_super
        assert len(data_super["top_districts"]) <= 5
        assert len(data_super["top_fo"]) <= 5

        # 2. Sub-Admin (Gaya only) access — MUST get identical statewide leaderboard without 403 or Gaya-only restriction
        res_sub = client.get(
            "/api/statewide-top-performers?month=2026-09&period=monthly",
            headers={"Authorization": f"Bearer {sub_admin_token}"}
        )
        assert res_sub.status_code == 200, res_sub.text
        data_sub = res_sub.json()
        assert data_sub["success"] is True
        
        # Verify sub-admin sees statewide districts (e.g. Aurangabad, Patna) despite only having Gaya RBAC
        dist_names = [d["district"] for d in data_sub["top_districts"]]
        assert "Aurangabad" in dist_names or "Patna" in dist_names

        # 3. Verify deactivated staff (Purushotam Kumar) is excluded from top_fo and top_staff
        staff_names = [s["fo_name"].lower() for s in data_sub["top_fo"]]
        assert not any("purushotam" in name or "purushottam" in name for name in staff_names)

def test_statewide_top_performers_weekly_filter(super_admin_token):
    mock_reports = [
        {
            "doc_id": "patna_fo1_recent",
            "working_place": "Patna",
            "fo_name": "Ravi Kumar",
            "date_of_reporting": "2026-09-25",
            "notification_ids": ["N1", "N2"],
        },
        {
            "doc_id": "gaya_fo2_old",
            "working_place": "Gaya",
            "fo_name": "Amit Singh",
            "date_of_reporting": "2026-09-02",  # Outside weekly range
            "notification_ids": ["N3", "N4", "N5", "N6", "N7"],
        }
    ]

    with patch("main.get_raw_monthly_reports", new=AsyncMock(return_value=mock_reports)):
        res = client.get(
            "/api/statewide-top-performers?month=2026-09&period=weekly",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        # In weekly range (past 7 days), Ravi Kumar should be #1 since Amit was on Sep 02
        if data.get("top_fo"):
            assert data["top_fo"][0]["fo_name"] == "Ravi Kumar"
        elif data.get("top_staff"):
            assert data["top_staff"][0]["fo_name"] == "Ravi Kumar"

def test_statewide_top_performers_multi_metric_designation_buckets(super_admin_token):
    mock_db = MockFirestore()
    mock_db.store["staff_directory"] = {
        "patna_ravikumar": {
            "district": "Patna",
            "name": "Ravi Kumar",
            "designation": "Field Officer",
            "is_active": True,
            "target": 50
        },
        "patna_deepakverma": {
            "district": "Patna",
            "name": "Deepak Verma",
            "designation": "Hub Agent",
            "is_active": True,
            "target": 50
        },
        "muzaffarpur_sureshsingh": {
            "district": "Muzaffarpur",
            "name": "Suresh Singh",
            "designation": "Lab Technician (LT)",
            "is_active": True,
            "target": 50
        },
        "gaya_poojakumari": {
            "district": "Gaya",
            "name": "Pooja Kumari",
            "designation": "Lab Technician",
            "is_active": True,
            "target": 50
        },
        "jamui_amitsharma": {
            "district": "Jamui",
            "name": "Amit Sharma",
            "designation": "SCT Agent",
            "is_active": True,
            "target": 50
        },
        "gaya_vikashyadav": {
            "district": "Gaya",
            "name": "Vikash Yadav",
            "designation": "Sputum Collection Agent",
            "is_active": True,
            "target": 50
        },
        "sitamarhi_inactiveperson": {
            "district": "Sitamarhi",
            "name": "Inactive Person",
            "designation": "Field Officer",
            "is_active": False,
            "status": "inactive"
        },
        "bhojpur_rahulkumar": {
            "district": "Bhojpur",
            "name": "Rahul Kumar",
            "designation": "Treatment Coordinator (TC)",
            "is_active": True,
            "target": 50
        },
        "begusarai_sonukumar": {
            "district": "Begusarai",
            "name": "Sonu Kumar",
            "designation": "TC",
            "is_active": True,
            "target": 50
        }
    }

    mock_reports = [
        {
            "doc_id": "rep_ravi",
            "working_place": "Patna",
            "fo_name": "Ravi Kumar",
            "date_of_reporting": "2026-09-10",
            "notification_ids": [f"N_R_{i}" for i in range(15)],
            "sample_tested_ids": [],
            "sample_collection_ids": []
        },
        {
            "doc_id": "rep_deepak",
            "working_place": "Patna",
            "fo_name": "Deepak Verma",
            "date_of_reporting": "2026-09-12",
            "notification_ids": [f"N_D_{i}" for i in range(25)],
            "sample_tested_ids": [],
            "sample_collection_ids": []
        },
        {
            "doc_id": "rep_suresh",
            "working_place": "Muzaffarpur",
            "fo_name": "Suresh Singh",
            "date_of_reporting": "2026-09-14",
            "notification_ids": ["N_S_1", "N_S_2"],
            "sample_tested_ids": [f"T_S_{i}" for i in range(40)],
            "sample_collection_ids": []
        },
        {
            "doc_id": "rep_pooja",
            "working_place": "Gaya",
            "fo_name": "Pooja Kumari",
            "date_of_reporting": "2026-09-15",
            "notification_ids": ["N_P_1"],
            "sample_tested_ids": [f"T_P_{i}" for i in range(25)],
            "sample_collection_ids": []
        },
        {
            "doc_id": "rep_amit",
            "working_place": "Jamui",
            "fo_name": "Amit Sharma",
            "date_of_reporting": "2026-09-16",
            "notification_ids": [f"N_A_{i}" for i in range(5)],
            "sample_tested_ids": [],
            "sample_collection_ids": [f"C_A_{i}" for i in range(30)]
        },
        {
            "doc_id": "rep_vikash",
            "working_place": "Gaya",
            "fo_name": "Vikash Yadav",
            "date_of_reporting": "2026-09-17",
            "notification_ids": [],
            "sample_tested_ids": [],
            "sample_collection_ids": [f"C_V_{i}" for i in range(18)]
        },
        {
            "doc_id": "rep_rahul",
            "working_place": "Bhojpur",
            "fo_name": "Rahul Kumar",
            "date_of_reporting": "2026-09-18",
            "notification_ids": ["N_R_1"],
            "sample_tested_ids": [],
            "sample_collection_ids": [],
            "home_visit_ids": [f"HV_R_{i}" for i in range(35)]
        },
        {
            "doc_id": "rep_sonu",
            "working_place": "Begusarai",
            "fo_name": "Sonu Kumar",
            "date_of_reporting": "2026-09-19",
            "notification_ids": ["N_S_1"],
            "sample_tested_ids": [],
            "sample_collection_ids": [],
            "home_visit_ids": [f"HV_S_{i}" for i in range(22)]
        },
        {
            "doc_id": "rep_inactive",
            "working_place": "Sitamarhi",
            "fo_name": "Inactive Person",
            "date_of_reporting": "2026-09-18",
            "notification_ids": [f"N_IN_{i}" for i in range(50)],
            "sample_tested_ids": ["T_IN"],
            "sample_collection_ids": ["C_IN"]
        }
    ]

    with patch("main.db", mock_db), patch("main.get_raw_monthly_reports", new=AsyncMock(return_value=mock_reports)):
        res = client.get(
            "/api/statewide-top-performers?month=2026-09&period=monthly",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["success"] is True

        # 1. Verify Top FO (Field Officers & Hub Agents)
        assert "top_fo" in data
        top_fo = data["top_fo"]
        assert len(top_fo) == 2
        # Rank 1: Deepak Verma (Hub Agent) with 25 notifications
        assert top_fo[0]["fo_name"] == "Deepak Verma"
        assert top_fo[0]["district"] == "Patna"
        assert top_fo[0]["designation"] == "Hub Agent"
        assert top_fo[0]["notifications"] == 25
        assert top_fo[0]["rank"] == 1
        # Rank 2: Ravi Kumar (Field Officer) with 15 notifications
        assert top_fo[1]["fo_name"] == "Ravi Kumar"
        assert top_fo[1]["district"] == "Patna"
        assert top_fo[1]["designation"] == "Field Officer"
        assert top_fo[1]["notifications"] == 15
        assert top_fo[1]["rank"] == 2

        # 2. Verify Top TC (Treatment Coordinators ranked by home visits)
        assert "top_tc" in data
        top_tc = data["top_tc"]
        assert len(top_tc) == 2
        # Rank 1: Rahul Kumar with 35 home visits
        assert top_tc[0]["fo_name"] == "Rahul Kumar"
        assert top_tc[0]["district"] == "Bhojpur"
        assert "TC" in top_tc[0]["designation"] or "Treatment" in top_tc[0]["designation"]
        assert top_tc[0]["home_visits"] == 35
        assert top_tc[0]["notifications"] == 1
        assert top_tc[0]["rank"] == 1
        # Rank 2: Sonu Kumar with 22 home visits
        assert top_tc[1]["fo_name"] == "Sonu Kumar"
        assert top_tc[1]["district"] == "Begusarai"
        assert top_tc[1]["home_visits"] == 22
        assert top_tc[1]["notifications"] == 1
        assert top_tc[1]["rank"] == 2

        # 3. Verify Top LT (Lab Technicians ranked by tests)
        assert "top_lt" in data
        top_lt = data["top_lt"]
        assert len(top_lt) == 2
        # Rank 1: Suresh Singh with 40 tests
        assert top_lt[0]["fo_name"] == "Suresh Singh"
        assert top_lt[0]["district"] == "Muzaffarpur"
        assert "LT" in top_lt[0]["designation"] or "Lab" in top_lt[0]["designation"]
        assert top_lt[0]["tests"] == 40
        assert top_lt[0]["notifications"] == 2
        assert top_lt[0]["rank"] == 1
        # Rank 2: Pooja Kumari with 25 tests
        assert top_lt[1]["fo_name"] == "Pooja Kumari"
        assert top_lt[1]["district"] == "Gaya"
        assert top_lt[1]["tests"] == 25
        assert top_lt[1]["notifications"] == 1
        assert top_lt[1]["rank"] == 2

        # 4. Verify Top SCT (SCT Agents ranked by samples_collected)
        assert "top_sct" in data
        top_sct = data["top_sct"]
        assert len(top_sct) == 2
        # Rank 1: Amit Sharma with 30 collections
        assert top_sct[0]["fo_name"] == "Amit Sharma"
        assert top_sct[0]["district"] == "Jamui"
        assert "SCT" in top_sct[0]["designation"]
        assert top_sct[0]["samples_collected"] == 30
        assert top_sct[0]["notifications"] == 5
        assert top_sct[0]["rank"] == 1
        # Rank 2: Vikash Yadav with 18 collections
        assert top_sct[1]["fo_name"] == "Vikash Yadav"
        assert top_sct[1]["district"] == "Gaya"
        assert top_sct[1]["samples_collected"] == 18
        assert top_sct[1]["rank"] == 2

        # 5. Deactivated officer must be completely excluded
        all_staff_names = [s["fo_name"] for s in top_fo + top_tc + top_lt + top_sct]
        assert "Inactive Person" not in all_staff_names
        # Ensure TC is not mixed into FO
        assert "Rahul Kumar" not in [s["fo_name"] for s in top_fo]
        assert "Sonu Kumar" not in [s["fo_name"] for s in top_fo]

        # 6. Backward compatibility alias top_staff == top_fo
        assert data["top_staff"] == top_fo

def test_staff_designation_update_evicts_cache_and_shifts_bucket(super_admin_token):
    mock_db = MockFirestore()
    mock_db.store["staff_directory"] = {
        "gaya_rohandas": {
            "district": "Gaya",
            "name": "Rohan Das",
            "designation": "Field Officer",
            "is_active": True,
            "target": 50
        }
    }

    mock_reports = [
        {
            "doc_id": "rep_rohan",
            "working_place": "Gaya",
            "fo_name": "Rohan Das",
            "date_of_reporting": "2026-09-15",
            "notification_ids": [f"N_{i}" for i in range(10)],
            "sample_tested_ids": [f"T_{i}" for i in range(35)],
            "sample_collection_ids": []
        }
    ]

    with patch("main.db", mock_db), \
         patch("main.get_raw_monthly_reports", new=AsyncMock(return_value=mock_reports)), \
         patch("backend.routers.staff.pg_update_row", return_value=True):
        # 1. Fetch initial leaderboard: Rohan Das should be in top_fo
        res1 = client.get(
            "/api/statewide-top-performers?month=2026-09&period=monthly",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert res1.status_code == 200
        d1 = res1.json()
        assert "top_fo" in d1
        assert any(s["fo_name"] == "Rohan Das" for s in d1["top_fo"])
        assert not any(s["fo_name"] == "Rohan Das" for s in d1.get("top_lt", []))

        # Verify cached state exists
        assert cache.get("statewide_top_2026-09_monthly_official") is not None

        # 2. Update staff designation to Lab Technician (LT)
        update_res = client.post(
            "/admin/staff/update-details",
            json={
                "district": "Gaya",
                "name": "Rohan Das",
                "designation": "Lab Technician (LT)"
            },
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert update_res.status_code == 200, update_res.text
        assert update_res.json()["success"] is True

        # 3. Verify caches evicted
        assert cache.get("staff_directory_map") is None
        assert cache.get("statewide_top_2026-09_monthly_official") is None

        # 4. Fetch leaderboard again: Rohan Das must now appear in top_lt and NOT in top_fo
        res2 = client.get(
            "/api/statewide-top-performers?month=2026-09&period=monthly",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert res2.status_code == 200
        d2 = res2.json()
        assert not any(s["fo_name"] == "Rohan Das" for s in d2["top_fo"])
        assert any(s["fo_name"] == "Rohan Das" and s["tests"] == 35 for s in d2["top_lt"])
        lt_entry = [s for s in d2["top_lt"] if s["fo_name"] == "Rohan Das"][0]
        assert "LT" in lt_entry["designation"] or "Lab Technician" in lt_entry["designation"]


def test_statewide_top_performers_tie_breaker_rules(super_admin_token):
    """
    Asserts exact studio tie-breaking specifications:
    1. DC: Target %, tie-breaker notifications
    2. FO: Notifications, tie-breaker target %
    3. TC: Home visits, tie-breaker composite other clinical indicators (HIV, DM, DBT, Samples, Tests), tertiary notifications
    4. LT: Tests, tie-breaker notifications
    5. SCT: Samples collected, tie-breaker notifications
    """
    mock_db = MockFirestore()
    mock_db.store["staff_directory"] = {
        # FOs with tied notifications
        "patna_foone": {"district": "Patna", "name": "FO One", "designation": "Field Officer", "is_active": True, "target": 100},
        "patna_fotwo": {"district": "Patna", "name": "FO Two", "designation": "Field Officer", "is_active": True, "target": 50},

        # TCs with tied home visits
        "gaya_tcone": {"district": "Gaya", "name": "TC One", "designation": "Treatment Coordinator (TC)", "is_active": True, "target": 50},
        "gaya_tctwo": {"district": "Gaya", "name": "TC Two", "designation": "Treatment Coordinator (TC)", "is_active": True, "target": 50},

        # LTs with tied tests
        "jamui_ltone": {"district": "Jamui", "name": "LT One", "designation": "Lab Technician (LT)", "is_active": True, "target": 50},
        "jamui_lttwo": {"district": "Jamui", "name": "LT Two", "designation": "Lab Technician (LT)", "is_active": True, "target": 50},

        # SCTs with tied sample collections
        "siwan_sctone": {"district": "Siwan", "name": "SCT One", "designation": "SCT Agent", "is_active": True, "target": 50},
        "siwan_scttwo": {"district": "Siwan", "name": "SCT Two", "designation": "SCT Agent", "is_active": True, "target": 50},
    }

    mock_reports = [
        # FO 1: 50 notifs, target 100 (50%)
        {"working_place": "Patna", "fo_name": "FO One", "notification_ids": [f"N1_{i}" for i in range(50)]},
        # FO 2: 50 notifs, target 50 (100%) -> Should beat FO 1 on tie-breaker
        {"working_place": "Patna", "fo_name": "FO Two", "notification_ids": [f"N2_{i}" for i in range(50)]},

        # TC 1: 20 home visits, 6 HIV/DM, 4 DBT, 5 samples, 5 tests -> other_clinical = 20
        {
            "working_place": "Gaya", "fo_name": "TC One",
            "home_visit_ids": [f"HV1_{i}" for i in range(20)],
            "hiv_dm_ids": [f"H1_{i}" for i in range(6)],
            "dbt_ids": [f"D1_{i}" for i in range(4)],
            "sample_collection_ids": [f"SC1_{i}" for i in range(5)],
            "sample_tested_ids": [f"ST1_{i}" for i in range(5)],
            "notification_ids": ["N_TC1"]
        },
        # TC 2: 20 home visits, 1 HIV/DM, 1 DBT, 1 samples, 1 tests -> other_clinical = 4
        {
            "working_place": "Gaya", "fo_name": "TC Two",
            "home_visit_ids": [f"HV2_{i}" for i in range(20)],
            "hiv_dm_ids": ["H2_0"],
            "dbt_ids": ["D2_0"],
            "sample_collection_ids": ["SC2_0"],
            "sample_tested_ids": ["ST2_0"],
            "notification_ids": ["N_TC2"]
        },

        # LT 1: 30 tests, 10 notifs -> Should beat LT 2 on tie-breaker
        {"working_place": "Jamui", "fo_name": "LT One", "sample_tested_ids": [f"T1_{i}" for i in range(30)], "notification_ids": [f"N_LT1_{i}" for i in range(10)]},
        # LT 2: 30 tests, 2 notifs
        {"working_place": "Jamui", "fo_name": "LT Two", "sample_tested_ids": [f"T2_{i}" for i in range(30)], "notification_ids": [f"N_LT2_{i}" for i in range(2)]},

        # SCT 1: 25 samples, 8 notifs -> Should beat SCT 2 on tie-breaker
        {"working_place": "Siwan", "fo_name": "SCT One", "sample_collection_ids": [f"C1_{i}" for i in range(25)], "notification_ids": [f"N_S1_{i}" for i in range(8)]},
        # SCT 2: 25 samples, 1 notifs
        {"working_place": "Siwan", "fo_name": "SCT Two", "sample_collection_ids": [f"C2_{i}" for i in range(25)], "notification_ids": ["N_S2_0"]},
    ]

    mock_targets = {
        "targets": [
            {"district": "Jamui", "target": 100},  # Jamui notifs: 12 -> 12%
            {"district": "Siwan", "target": 50},   # Siwan notifs: 9 -> 18%
            {"district": "Patna", "target": 100},  # Patna notifs: 100 -> 100%
            {"district": "Gaya", "target": 2},     # Gaya notifs: 2 -> 100% (tied % with Patna, but Patna has 100 notifs vs Gaya 2)
        ]
    }

    with patch("main.db", mock_db), \
         patch("main.get_raw_monthly_reports", new=AsyncMock(return_value=mock_reports)), \
         patch("main.get_targets", new=AsyncMock(return_value=mock_targets)):

        res = client.get(
            "/api/statewide-top-performers?month=2026-09&period=monthly",
            headers={"Authorization": f"Bearer {super_admin_token}"}
        )
        assert res.status_code == 200, res.text
        data = res.json()

        # 1. District tie-breaker: Patna (100 notifs, 100%) vs Gaya (2 notifs, 100%)
        dists = data["top_districts"]
        assert dists[0]["district"] == "Patna", "Patna must rank #1 over Gaya due to higher notification volume tie-breaker"
        assert dists[1]["district"] == "Gaya", "Gaya must rank #2"

        # 2. FO tie-breaker: FO Two (50 notifs, 100%) vs FO One (50 notifs, 50%)
        top_fo = data["top_fo"]
        assert top_fo[0]["fo_name"] == "FO Two", "FO Two must rank #1 on target % tie-breaker"
        assert top_fo[1]["fo_name"] == "FO One", "FO One must rank #2"

        # 3. TC tie-breaker: TC One (20 visits, other_clinical=20) vs TC Two (20 visits, other_clinical=4)
        top_tc = data["top_tc"]
        assert top_tc[0]["fo_name"] == "TC One", "TC One must rank #1 on other clinical indicators tie-breaker"
        assert top_tc[0]["other_clinical_score"] == 20
        assert top_tc[1]["fo_name"] == "TC Two"
        assert top_tc[1]["other_clinical_score"] == 4

        # 4. LT tie-breaker: LT One (30 tests, 10 notifs) vs LT Two (30 tests, 2 notifs)
        top_lt = data["top_lt"]
        assert top_lt[0]["fo_name"] == "LT One", "LT One must rank #1 on notification tie-breaker"
        assert top_lt[1]["fo_name"] == "LT Two"

        # 5. SCT tie-breaker: SCT One (25 samples, 8 notifs) vs SCT Two (25 samples, 1 notifs)
        top_sct = data["top_sct"]
        assert top_sct[0]["fo_name"] == "SCT One", "SCT One must rank #1 on notification tie-breaker"
        assert top_sct[1]["fo_name"] == "SCT Two"

