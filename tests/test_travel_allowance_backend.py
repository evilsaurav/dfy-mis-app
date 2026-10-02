import os
import sys
from pathlib import Path
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import main
from backend.routers.travel_allowance import calculate_log_totals

client = TestClient(main.app)

@pytest.fixture(autouse=True)
def cleanup():
    main.app.dependency_overrides.clear()
    from backend.core.cache import cache
    cache.clear()
    yield
    main.app.dependency_overrides.clear()
    cache.clear()

def test_calculate_log_totals():
    # 1. Normal day readings
    days = [
        {"day": 1, "morning_km": 100.0, "evening_km": 125.0, "total_km": 25.0},
        {"day": 2, "morning_km": 125.0, "evening_km": 150.0, "total_km": 25.0},
    ]
    totals = calculate_log_totals(days, rate_per_km=4.0, deduction_amount=20.0)
    assert totals["total_km"] == 50.0
    assert totals["gross_amount"] == 200.0
    assert totals["deduction_amount"] == 20.0
    assert totals["final_payable_amount"] == 180.0

    # 2. Without total_km explicit key (auto-calculated from evening - morning)
    days_auto = [
        {"day": 1, "morning_km": 1000.0, "evening_km": 1030.5},
        {"day": 2, "morning_km": 1030.5, "evening_km": 1050.0},
    ]
    totals_auto = calculate_log_totals(days_auto, rate_per_km=5.0, deduction_amount=10.0)
    assert totals_auto["total_km"] == 50.0
    assert totals_auto["gross_amount"] == 250.0
    assert totals_auto["final_payable_amount"] == 240.0

    # 3. Deduction exceeds gross -> should floor at 0.0, not negative
    totals_floored = calculate_log_totals(days, rate_per_km=4.0, deduction_amount=300.0)
    assert totals_floored["total_km"] == 50.0
    assert totals_floored["gross_amount"] == 200.0
    assert totals_floored["final_payable_amount"] == 0.0

def test_ta_rate_endpoints_and_rbac():
    # 1. Unauthenticated request rejected with 401
    res = client.get("/admin/ta/rate")
    assert res.status_code == 401

    # 2. Authenticated GET default rate
    with patch("backend.core.security.get_current_user", return_value={"uid": "u1", "role": "SUPER_ADMIN", "allowed_districts": ["All"]}):
        with patch("backend.core.database.db.collection") as mock_coll:
            mock_doc = MagicMock()
            mock_doc.get.return_value.exists = False
            mock_coll.return_value.document.return_value = mock_doc
            
            res = client.get("/admin/ta/rate")
            assert res.status_code == 200
            data = res.json()
            assert data.get("rate_per_km") == 4.0

    # 3. Sub-Admin forbidden from updating rate (403)
    with patch("backend.core.security.get_current_user", return_value={"uid": "u2", "role": "SUB_ADMIN", "allowed_districts": ["Gaya"]}):
        res = client.post("/admin/ta/rate", json={"rate_per_km": 5.0})
        assert res.status_code == 403

    # 4. Super Admin or Main Incharge can update rate
    with patch("backend.core.security.get_current_user", return_value={"uid": "u1", "role": "SUPER_ADMIN", "allowed_districts": ["All"]}):
        with patch("backend.core.database.db.collection") as mock_coll:
            mock_doc = MagicMock()
            mock_coll.return_value.document.return_value = mock_doc
            
            res = client.post("/admin/ta/rate", json={"rate_per_km": 4.5})
            assert res.status_code == 200
            assert res.json()["rate_per_km"] == 4.5
            mock_doc.set.assert_called_once()

    # 5. Invalid rate (<= 0) rejected with 400
    with patch("backend.core.security.get_current_user", return_value={"uid": "u1", "role": "MAIN_INCHARGE", "allowed_districts": ["All"]}):
        res = client.post("/admin/ta/rate", json={"rate_per_km": -2.0})
        assert res.status_code == 400

def test_ta_roster_query_and_subadmin_rbac():
    # 1. Sub-Admin for Gaya requesting Patna -> 403
    with patch("backend.core.security.get_current_user", return_value={"uid": "u_sub", "role": "SUB_ADMIN", "allowed_districts": ["Gaya"]}):
        res = client.get("/admin/ta/roster?month=2026-09&district=Patna")
        assert res.status_code == 403

    # 2. Sub-Admin for Gaya requesting Gaya -> 200
    with patch("backend.core.security.get_current_user", return_value={"uid": "u_sub", "role": "SUB_ADMIN", "allowed_districts": ["Gaya"]}):
        with patch("backend.routers.travel_allowance.get_cached_staff_directory_raw", return_value=[
            {"name": "Ramesh Kumar", "district": "Gaya", "is_active": True, "designation": "Field Officer"},
            {"name": "Suresh Singh", "district": "Gaya", "is_active": True, "designation": "Field Officer"}
        ]):
            with patch("backend.core.database.db.collection") as mock_coll:
                mock_query = MagicMock()
                mock_query.stream.return_value = []
                mock_coll.return_value.where.return_value.where.return_value = mock_query

                res = client.get("/admin/ta/roster?month=2026-09&district=Gaya")
                assert res.status_code == 200
                data = res.json()
                assert data["status"] == "success"
                assert data["district"] == "Gaya"
                assert len(data["roster"]) == 2
                assert data["roster"][0]["staff_name"] in ["Ramesh Kumar", "Suresh Singh"]

def test_ta_save_log_and_locking():
    save_payload = {
        "month": "2026-09",
        "district": "Gaya",
        "staff_name": "Ramesh Kumar",
        "staff_key": "ramesh_kumar",
        "designation": "Field Officer",
        "deduction_amount": 50.0,
        "deduction_reason": "Personal travel",
        "admin_remarks": "Verified",
        "days": [
            {"day": 1, "date": "2026-09-01", "morning_km": 100.0, "evening_km": 150.0, "total_km": 50.0}
        ]
    }

    # 1. Sub-Admin saving draft record -> 200
    with patch("backend.core.security.get_current_user", return_value={"uid": "u_sub", "role": "SUB_ADMIN", "allowed_districts": ["Gaya"]}):
        with patch("backend.core.database.db.collection") as mock_coll:
            mock_doc = MagicMock()
            # Existing doc is not locked
            mock_doc.get.return_value.exists = True
            mock_doc.get.return_value.to_dict.return_value = {"is_locked": False, "status": "DRAFT"}
            mock_coll.return_value.document.return_value = mock_doc

            res = client.post("/admin/ta/save-log", json=save_payload)
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "success"
            saved = data["data"]
            assert saved["total_km"] == 50.0
            assert saved["gross_amount"] == 200.0  # 50 km * 4.0
            assert saved["deduction_amount"] == 50.0
            assert saved["final_payable_amount"] == 150.0

    # 2. Locked record rejects Sub-Admin mutation with 423
    with patch("backend.core.security.get_current_user", return_value={"uid": "u_sub", "role": "SUB_ADMIN", "allowed_districts": ["Gaya"]}):
        with patch("backend.core.database.db.collection") as mock_coll:
            mock_doc = MagicMock()
            mock_doc.get.return_value.exists = True
            mock_doc.get.return_value.to_dict.return_value = {"is_locked": True, "status": "APPROVED"}
            mock_coll.return_value.document.return_value = mock_doc

            res = client.post("/admin/ta/save-log", json=save_payload)
            assert res.status_code == 423
            assert "locked" in res.json()["detail"].lower()

def test_ta_prefill_from_daily_reports():
    prefill_req = {
        "month": "2026-09",
        "district": "Gaya",
        "staff_name": "Ramesh Kumar"
    }

    mock_reports = [
        MagicMock(to_dict=lambda: {
            "fo_name": "Ramesh Kumar",
            "working_place": "Gaya",
            "date_of_reporting": "2026-09-01",
            "morning_km": 2000,
            "evening_km": 2045,
            "visited_names": ["PHC Bodhgaya", "Clinic 1"]
        }),
        MagicMock(to_dict=lambda: {
            "fo_name": "Ramesh Kumar",
            "working_place": "Gaya",
            "date_of_reporting": "2026-09-02",
            "morning_km": 2045,
            "evening_km": 2075,
            "visited_names": "Dr. Sharma Clinic"
        })
    ]

    with patch("backend.core.security.get_current_user", return_value={"uid": "u_sub", "role": "SUB_ADMIN", "allowed_districts": ["Gaya"]}):
        with patch("backend.core.database.db.collection") as mock_coll:
            # Existing doc in travel_allowance_logs
            mock_log_doc = MagicMock()
            mock_log_doc.get.return_value.exists = False
            
            # Query for daily_field_reports
            mock_reports_query = MagicMock()
            mock_reports_query.where.return_value.where.return_value.stream.return_value = mock_reports
            
            def coll_router(name):
                if name == "travel_allowance_logs":
                    mock_c = MagicMock()
                    mock_c.document.return_value = mock_log_doc
                    return mock_c
                return mock_reports_query

            mock_coll.side_effect = coll_router

            res = client.post("/admin/ta/prefill", json=prefill_req)
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "success"
            days = data["data"]["days"]
            assert len(days) >= 2
            
            day1 = next(d for d in days if d["date"] == "2026-09-01")
            assert day1["morning_km"] == 2000
            assert day1["evening_km"] == 2045
            assert day1["total_km"] == 45.0
            assert "PHC Bodhgaya" in day1["visited_names"]
