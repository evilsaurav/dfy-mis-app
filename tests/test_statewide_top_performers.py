import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock
from main import app, create_access_token

client = TestClient(app)

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
        assert len(data_super["top_districts"]) <= 5
        assert len(data_super["top_staff"]) <= 5

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

        # 3. Verify deactivated staff (Purushotam Kumar) is excluded from top_staff
        staff_names = [s["fo_name"].lower() for s in data_sub["top_staff"]]
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
        if data["top_staff"]:
            assert data["top_staff"][0]["fo_name"] == "Ravi Kumar"
