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

        # 2. Verify Top LT (Lab Technicians ranked by tests)
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

        # 3. Verify Top SCT (SCT Agents ranked by samples_collected)
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

        # 4. Deactivated officer must be completely excluded
        all_staff_names = [s["fo_name"] for s in top_fo + top_lt + top_sct]
        assert "Inactive Person" not in all_staff_names

        # 5. Backward compatibility alias top_staff == top_fo
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

    with patch("main.db", mock_db), patch("main.get_raw_monthly_reports", new=AsyncMock(return_value=mock_reports)):
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
        assert cache.get("statewide_top_2026-09_monthly") is not None

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
        assert cache.get("statewide_top_2026-09_monthly") is None

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
