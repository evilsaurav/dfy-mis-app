import pytest
from unittest.mock import patch, MagicMock
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
        snap.to_dict.return_value = dict(self.store.get(self.coll_name, {}).get(self.doc_id, {}))
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
                yield snap

@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()

def test_save_and_get_ta_log_admin_flow():
    store = {
        "admin_users": {
            "dc_gaya": {
                "name": "DC Gaya",
                "role": "SUB_ADMIN",
                "allowed_districts": ["Gaya"]
            }
        },
        "travel_allowance_logs": {}
    }

    mock_db = MagicMock()
    mock_db.collection.side_effect = lambda c: MockCollection(c, store)

    token = create_access_token({
        "sub": "dc_gaya",
        "role": "SUB_ADMIN",
        "name": "DC Gaya",
        "allowed_districts": ["Gaya"]
    })
    headers = {"Authorization": f"Bearer {token}"}

    with patch("main.db", mock_db):
        payload = {
            "month": "2026-09",
            "district": "Gaya",
            "staff_name": "Ramesh Kumar",
            "staff_key": "gaya_rameshkumar",
            "designation": "Field Officer",
            "daily_logs": {
                "2026-09-01": {
                    "initial_reading": 1000,
                    "final_reading": 1030,
                    "total_km": 30,
                    "is_override": False,
                    "from_location": "Sadar",
                    "to_location": "Bodhgaya",
                    "purpose": "Sample Collection",
                    "remarks": ""
                },
                "2026-09-02": {
                    "initial_reading": 1030,
                    "final_reading": 1030,
                    "total_km": 20,
                    "is_override": True,
                    "from_location": "Tekari",
                    "to_location": "Konch",
                    "purpose": "Doctor Visit",
                    "remarks": "Broken meter override"
                }
            },
            "deduction_amount": 50.0,
            "deduction_reason": "Excess fuel voucher claim",
            "admin_final_remarks": "Approved by DC"
        }

        # 1. Save TA Log
        res = client.post("/api/ta-logs/save", json=payload, headers=headers)
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["success"] is True
        assert data["total_km"] == 50
        assert data["gross_amount"] == 200.0  # 50 * 4.0
        assert data["deduction_amount"] == 50.0
        assert data["final_payable_amount"] == 150.0  # 200 - 50

        # Verify saved in Firestore store
        doc_id = "2026-09_gaya_rameshkumar"
        assert doc_id in store["travel_allowance_logs"]
        saved = store["travel_allowance_logs"][doc_id]
        assert saved["total_km"] == 50
        assert saved["gross_amount"] == 200.0
        assert saved["final_payable_amount"] == 150.0

        # 2. Query TA Log via GET
        get_res = client.get("/api/ta-logs?month=2026-09&district=Gaya", headers=headers)
        assert get_res.status_code == 200
        get_data = get_res.json()
        assert get_data["success"] is True
        assert len(get_data["logs"]) >= 1
        assert get_data["logs"][0]["staff_name"] == "Ramesh Kumar"

def test_save_ta_log_subadmin_isolation_forbidden():
    store = {
        "admin_users": {
            "dc_gaya": {
                "name": "DC Gaya",
                "role": "SUB_ADMIN",
                "allowed_districts": ["Gaya"]
            }
        },
        "travel_allowance_logs": {}
    }

    mock_db = MagicMock()
    mock_db.collection.side_effect = lambda c: MockCollection(c, store)

    token = create_access_token({
        "sub": "dc_gaya",
        "role": "SUB_ADMIN",
        "name": "DC Gaya",
        "allowed_districts": ["Gaya"]
    })
    headers = {"Authorization": f"Bearer {token}"}

    with patch("main.db", mock_db):
        # Attempt to save for Patna
        payload = {
            "month": "2026-09",
            "district": "Patna",
            "staff_name": "Suresh Kumar",
            "staff_key": "patna_sureshkumar",
            "daily_logs": {}
        }
        res = client.post("/api/ta-logs/save", json=payload, headers=headers)
        assert res.status_code == 403
        assert "not authorized" in res.text.lower() or "forbidden" in res.text.lower() or "denied" in res.text.lower()

def test_fo_readonly_inspection_with_pin():
    store = {
        "staff_directory": {
            "gaya_rameshkumar": {
                "district": "Gaya",
                "name": "Ramesh Kumar",
                "pin": "1234",
                "status": "Active"
            }
        },
        "travel_allowance_logs": {
            "2026-09_gaya_rameshkumar": {
                "month": "2026-09",
                "district": "Gaya",
                "staff_name": "Ramesh Kumar",
                "staff_key": "gaya_rameshkumar",
                "total_km": 100,
                "gross_amount": 400.0,
                "deduction_amount": 20.0,
                "deduction_reason": "Late arrival fine",
                "final_payable_amount": 380.0,
                "admin_final_remarks": "Approved with deduction",
                "daily_logs": {}
            }
        }
    }

    mock_db = MagicMock()
    mock_db.collection.side_effect = lambda c: MockCollection(c, store)

    with patch("main.db", mock_db):
        # 1. Access with valid PIN
        res = client.get("/api/ta-logs?month=2026-09&district=Gaya&staff_key=gaya_rameshkumar&pin=1234")
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["success"] is True
        assert len(data["logs"]) == 1
        assert data["logs"][0]["final_payable_amount"] == 380.0

        # 2. Access with invalid PIN
        res_bad = client.get("/api/ta-logs?month=2026-09&district=Gaya&staff_key=gaya_rameshkumar&pin=9999")
        assert res_bad.status_code == 401

        # 3. Access without PIN or token
        res_unauth = client.get("/api/ta-logs?month=2026-09&district=Gaya&staff_key=gaya_rameshkumar")
        assert res_unauth.status_code == 401

def test_prefill_from_reports():
    store = {
        "admin_users": {
            "superadmin": {
                "name": "Admin",
                "role": "SUPER_ADMIN"
            }
        },
        "daily_field_reports": {
            "rep_1": {
                "working_place": "Gaya",
                "fo_name": "Ramesh Kumar",
                "date": "2026-09-05",
                "morning_km": 1500,
                "evening_km": 1545,
                "total_km": 45,
                "visited_names": "Tekari PHC, Konch PHC"
            },
            "rep_2": {
                "working_place": "Gaya",
                "fo_name": "Ramesh Kumar",
                "date": "2026-09-06",
                "morning_km": 1545,
                "evening_km": 1570,
                "total_km": 25,
                "visited_names": "Bodhgaya Clinic"
            },
            # Report from another month shouldn't be included
            "rep_3": {
                "working_place": "Gaya",
                "fo_name": "Ramesh Kumar",
                "date": "2026-08-30",
                "morning_km": 1400,
                "evening_km": 1450,
                "total_km": 50,
                "visited_names": "Old August Visit"
            }
        }
    }

    mock_db = MagicMock()
    mock_db.collection.side_effect = lambda c: MockCollection(c, store)

    token = create_access_token({
        "sub": "superadmin",
        "role": "SUPER_ADMIN",
        "name": "Admin"
    })
    headers = {"Authorization": f"Bearer {token}"}

    with patch("main.db", mock_db):
        res = client.post(
            "/api/ta-logs/prefill-from-reports?month=2026-09&district=Gaya&staff_name=Ramesh%20Kumar",
            headers=headers
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["success"] is True
        daily_logs = data["daily_logs"]
        assert "2026-09-05" in daily_logs
        assert daily_logs["2026-09-05"]["initial_reading"] == 1500
        assert daily_logs["2026-09-05"]["final_reading"] == 1545
        assert daily_logs["2026-09-05"]["total_km"] == 45
        assert daily_logs["2026-09-05"]["amount"] == 180.0
        assert "Tekari PHC" in daily_logs["2026-09-05"]["purpose"]

        assert "2026-09-06" in daily_logs
        assert daily_logs["2026-09-06"]["total_km"] == 25
        assert "2026-08-30" not in daily_logs
        assert data["total_km"] == 70
        assert data["gross_amount"] == 280.0

def test_ta_analytics():
    store = {
        "admin_users": {
            "superadmin": {
                "name": "Admin",
                "role": "SUPER_ADMIN"
            }
        },
        "travel_allowance_logs": {
            "2026-08_gaya_rameshkumar": {
                "month": "2026-08",
                "district": "Gaya",
                "total_km": 500,
                "gross_amount": 2000.0,
                "deduction_amount": 0.0,
                "final_payable_amount": 2000.0,
                "daily_logs": {"2026-08-01": {"total_km": 20}}
            },
            "2026-09_gaya_rameshkumar": {
                "month": "2026-09",
                "district": "Gaya",
                "total_km": 600,
                "gross_amount": 2400.0,
                "deduction_amount": 100.0,
                "final_payable_amount": 2300.0,
                "daily_logs": {"2026-09-01": {"total_km": 25}, "2026-09-02": {"total_km": 35}}
            },
            "2026-09_patna_sureshkumar": {
                "month": "2026-09",
                "district": "Patna",
                "total_km": 400,
                "gross_amount": 1600.0,
                "deduction_amount": 50.0,
                "final_payable_amount": 1550.0,
                "daily_logs": {"2026-09-01": {"total_km": 30}}
            }
        }
    }

    mock_db = MagicMock()
    mock_db.collection.side_effect = lambda c: MockCollection(c, store)

    token = create_access_token({
        "sub": "superadmin",
        "role": "SUPER_ADMIN",
        "name": "Admin"
    })
    headers = {"Authorization": f"Bearer {token}"}

    with patch("main.db", mock_db):
        res = client.get("/api/ta-logs/analytics?month=2026-09&district=All", headers=headers)
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["success"] is True
        # YTD KM across all months: 500 + 600 + 400 = 1500
        assert data["total_project_km_ytd"] == 1500
        # Sept KM: 600 + 400 = 1000
        assert data["month_total_km"] == 1000
        assert data["total_ta_gross"] == 4000.0
        assert data["total_ta_deductions"] == 150.0
        assert data["total_ta_final_payable"] == 3850.0

def test_get_ta_logs_empty_district_does_not_stream_state():
    store = {
        "admin_users": {
            "superadmin": {
                "name": "Admin",
                "role": "SUPER_ADMIN"
            }
        },
        "travel_allowance_logs": {
            "2026-09_gaya_rameshkumar": {
                "month": "2026-09",
                "district": "Gaya",
                "staff_name": "Ramesh Kumar",
                "staff_key": "gaya_rameshkumar",
                "total_km": 100
            }
        }
    }
    mock_db = MagicMock()
    mock_db.collection.side_effect = lambda c: MockCollection(c, store)

    token = create_access_token({
        "sub": "superadmin",
        "role": "SUPER_ADMIN",
        "name": "Admin"
    })
    headers = {"Authorization": f"Bearer {token}"}

    with patch("main.db", mock_db):
        cache.clear()
        res = client.get("/api/ta-logs?month=2026-09&district=Sheohar", headers=headers)
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["success"] is True
        # Sheohar has 0 logs, should return [] without returning Gaya's doc
        assert data["logs"] == []
        # Verify it was cached
        cached = cache.get("ta_roster_2026-09_sheohar")
        assert cached == []

def test_ta_analytics_cached_behavior():
    store = {
        "admin_users": {
            "superadmin": {
                "name": "Admin",
                "role": "SUPER_ADMIN"
            }
        },
        "travel_allowance_logs": {
            "2026-09_gaya_rameshkumar": {
                "month": "2026-09",
                "district": "Gaya",
                "total_km": 600,
                "gross_amount": 2400.0,
                "deduction_amount": 100.0,
                "final_payable_amount": 2300.0,
                "daily_logs": {"2026-09-01": {"total_km": 25}}
            }
        }
    }
    mock_db = MagicMock()
    mock_db.collection.side_effect = lambda c: MockCollection(c, store)

    token = create_access_token({
        "sub": "superadmin",
        "role": "SUPER_ADMIN",
        "name": "Admin"
    })
    headers = {"Authorization": f"Bearer {token}"}

    with patch("main.db", mock_db):
        cache.clear()
        res = client.get("/api/ta-logs/analytics?month=2026-09&district=Gaya", headers=headers)
        assert res.status_code == 200
        data1 = res.json()
        assert data1["success"] is True
        assert data1["district"] == "Gaya"
        assert data1["month_total_km"] == 600

        # Now wipe mock db store. The second call should hit the 900s TTL cache with 0 DB reads
        store["travel_allowance_logs"] = {}
        res2 = client.get("/api/ta-logs/analytics?month=2026-09&district=Gaya", headers=headers)
        assert res2.status_code == 200
        data2 = res2.json()
        assert data2["month_total_km"] == 600


def test_ta_district_action_rbac_and_lifecycle():
    store = {
        "travel_allowance_logs": {
            "2026-10_gaya_fo1": {
                "month": "2026-10",
                "district": "Gaya",
                "staff_key": "fo1",
                "staff_name": "Field Officer 1",
                "total_km": 100,
                "status": "DRAFT"
            }
        },
        "admin_audit_logs": {}
    }
    mock_db = MagicMock()
    mock_db.collection.side_effect = lambda c: MockCollection(c, store)
    mock_batch = MagicMock()
    mock_db.batch.return_value = mock_batch

    subadmin_gaya_token = create_access_token({
        "sub": "sub_gaya",
        "username": "sub_gaya",
        "role": "SUB_ADMIN",
        "allowed_districts": ["Gaya"],
        "permissions": {} # default: can_manage_ta not specified, should be allowed
    })
    subadmin_rohtas_token = create_access_token({
        "sub": "sub_rohtas",
        "username": "sub_rohtas",
        "role": "SUB_ADMIN",
        "allowed_districts": ["Rohtas"],
        "permissions": {}
    })
    subadmin_revoked_token = create_access_token({
        "sub": "sub_revoked",
        "username": "sub_revoked",
        "role": "SUB_ADMIN",
        "allowed_districts": ["Gaya"],
        "permissions": {"can_manage_ta": False}
    })
    incharge_token = create_access_token({
        "sub": "logistics",
        "username": "logistics",
        "role": "MAIN_INCHARGE",
        "allowed_districts": ["All"]
    })
    superadmin_token = create_access_token({
        "sub": "admin",
        "username": "admin",
        "role": "SUPER_ADMIN",
        "allowed_districts": ["All"]
    })

    with patch("main.db", mock_db):
        cache.clear()

        # 1. Sub-Admin outside district cannot submit
        res_cross = client.post("/api/ta/district-action", json={
            "month": "2026-10",
            "district": "Gaya",
            "action": "submit"
        }, headers={"Authorization": f"Bearer {subadmin_rohtas_token}"})
        assert res_cross.status_code == 403

        # 2. Sub-Admin with revoked can_manage_ta cannot submit
        res_revoked = client.post("/api/ta/district-action", json={
            "month": "2026-10",
            "district": "Gaya",
            "action": "submit"
        }, headers={"Authorization": f"Bearer {subadmin_revoked_token}"})
        assert res_revoked.status_code == 403

        # 3. Permitted Sub-Admin CAN submit
        res_sub_submit = client.post("/api/ta/district-action", json={
            "month": "2026-10",
            "district": "Gaya",
            "action": "submit"
        }, headers={"Authorization": f"Bearer {subadmin_gaya_token}"})
        assert res_sub_submit.status_code == 200
        assert res_sub_submit.json()["success"] is True

        # 4. Sub-Admin CANNOT approve
        res_sub_appr = client.post("/api/ta/district-action", json={
            "month": "2026-10",
            "district": "Gaya",
            "action": "approve"
        }, headers={"Authorization": f"Bearer {subadmin_gaya_token}"})
        assert res_sub_appr.status_code == 403

        # 5. Main Incharge CAN approve
        res_incharge_appr = client.post("/api/ta/district-action", json={
            "month": "2026-10",
            "district": "Gaya",
            "action": "approve"
        }, headers={"Authorization": f"Bearer {incharge_token}"})
        assert res_incharge_appr.status_code == 200
        assert res_incharge_appr.json()["success"] is True

        # 6. Super Admin CAN revert
        res_super_rev = client.post("/api/ta/district-action", json={
            "month": "2026-10",
            "district": "Gaya",
            "action": "revert",
            "revert_reason": "Odometer correction required on Day 5"
        }, headers={"Authorization": f"Bearer {superadmin_token}"})
        assert res_super_rev.status_code == 200
        assert res_super_rev.json()["success"] is True

