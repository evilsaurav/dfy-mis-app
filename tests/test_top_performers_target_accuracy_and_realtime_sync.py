import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from pathlib import Path
import sys

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from main import app, cache, create_access_token

client = TestClient(app)

def make_admin_token(role="SUPER_ADMIN", allowed=None):
    return create_access_token({
        "user_id": "test_admin",
        "username": "test_admin",
        "role": role,
        "allowed_districts": allowed or ["All"]
    })

@pytest.fixture(autouse=True)
def clean_cache():
    cache.clear()
    yield
    cache.clear()

def test_sitamarhi_and_zero_target_staff_accuracy():
    """Verify Sitamarhi district target is exactly 411 (not 461) when a staff member has target 0."""
    token = make_admin_token()
    headers = {"Authorization": f"Bearer {token}"}

    mock_targets = {
        "success": True,
        "month": "2026-09",
        "targets": [
            {"fo_name": "ALOK KUMAR", "district": "Sitamarhi", "target": 0, "month": "2026-09"},
            {"fo_name": "AVINASH KUMAR", "district": "Sitamarhi", "target": 65, "month": "2026-09"},
            {"fo_name": "AYUSH KUMAR", "district": "Sitamarhi", "target": 65, "month": "2026-09"},
            {"fo_name": "CHANDAN KUMAR", "district": "Sitamarhi", "target": 25, "month": "2026-09"},
            {"fo_name": "DEEPAK KUMAR", "district": "Sitamarhi", "target": 25, "month": "2026-09"},
            {"fo_name": "DILIP KUMAR", "district": "Sitamarhi", "target": 65, "month": "2026-09"},
            {"fo_name": "MANIBUSHAN KUMAR", "district": "Sitamarhi", "target": 65, "month": "2026-09"},
            {"fo_name": "PURUSHOTTAM KUMAR", "district": "Sitamarhi", "target": 12, "month": "2026-09"},
            {"fo_name": "RUNJHUN KUMAR AKELA", "district": "Sitamarhi", "target": 12, "month": "2026-09"},
            {"fo_name": "SATYENDRA KUMAR", "district": "Sitamarhi", "target": 12, "month": "2026-09"},
            {"fo_name": "SUJAY KUMAR", "district": "Sitamarhi", "target": 65, "month": "2026-09"}
        ]
    }

    mock_reports = [
        {
            "doc_id": "sitamarhi_avinash_2026-09-20",
            "working_place": "Sitamarhi",
            "fo_name": "AVINASH KUMAR",
            "date_of_reporting": "2026-09-20",
            "notification_ids": [f"NOTIF_{i}" for i in range(100)] # 100 notifs
        }
    ]

    with patch("main.get_targets", new=AsyncMock(return_value=mock_targets)), \
         patch("main.get_raw_monthly_reports", new=AsyncMock(return_value=mock_reports)):

        response = client.get("/api/statewide-top-performers?month=2026-09&period=monthly", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True

        sitamarhi_entry = next((d for d in data["top_districts"] if d["district"] == "Sitamarhi"), None)
        assert sitamarhi_entry is not None, "Sitamarhi should be in top_districts"
        # Must be exactly 411, NOT 461!
        assert sitamarhi_entry["target"] == 411, f"Expected Sitamarhi target to be 411, got {sitamarhi_entry['target']}"
        # Percentage must be based on 411: 100 / 411 * 100 = 24.3%
        expected_pct = round((100 / 411.0) * 100, 1)
        assert sitamarhi_entry["percentage"] == expected_pct

def test_update_target_invalidates_statewide_top_cache_realtime():
    """Verify that updating a target immediately evicts statewide_top_ cache for real-time leaderboard sync."""
    token = make_admin_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Seed statewide top cache
    cache.set("statewide_top_2026-09_monthly", {"cached": True, "top_districts": []}, ttl=180)
    assert cache.get("statewide_top_2026-09_monthly") is not None

    update_payload = {
        "district": "Sitamarhi",
        "fo_name": "AVINASH KUMAR",
        "target": 70,
        "month": "2026-09"
    }

    with patch("main.db") as mock_db, \
         patch("main.log_admin_activity", new=AsyncMock()):
        mock_doc = mock_db.collection.return_value.document.return_value
        mock_doc.set = AsyncMock()

        res = client.post("/update-target", json=update_payload, headers=headers)
        assert res.status_code == 200

        # statewide_top_ cache MUST be invalidated immediately!
        assert cache.get("statewide_top_2026-09_monthly") is None, "statewide_top_ cache was NOT invalidated by /update-target!"

def test_all_districts_zero_target_staff_no_inflation():
    """Verify across all districts that staff with target 0 do not inflate district targets by 50."""
    token = make_admin_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Simulate 5 districts where some staff have target 0
    mock_targets = {
        "success": True,
        "month": "2026-09",
        "targets": [
            # Sitamarhi (411 expected)
            {"fo_name": "ALOK KUMAR", "district": "Sitamarhi", "target": 0, "month": "2026-09"},
            {"fo_name": "AVINASH KUMAR", "district": "Sitamarhi", "target": 411, "month": "2026-09"},
            # Gaya (expected 615, 2 staff with 0)
            {"fo_name": "GAYA FO 1", "district": "Gaya", "target": 0, "month": "2026-09"},
            {"fo_name": "GAYA FO 2", "district": "Gaya", "target": 0, "month": "2026-09"},
            {"fo_name": "GAYA FO 3", "district": "Gaya", "target": 615, "month": "2026-09"},
            # Begusarai (expected 500, 1 staff with 0)
            {"fo_name": "BEGU FO 1", "district": "Begusarai", "target": 0, "month": "2026-09"},
            {"fo_name": "BEGU FO 2", "district": "Begusarai", "target": 500, "month": "2026-09"},
            # Muzaffarpur (expected 630, 1 staff with 0)
            {"fo_name": "MUZ FO 1", "district": "Muzaffarpur", "target": 0, "month": "2026-09"},
            {"fo_name": "MUZ FO 2", "district": "Muzaffarpur", "target": 630, "month": "2026-09"},
            # Buxar (expected 400, 2 staff with 0)
            {"fo_name": "BUX FO 1", "district": "Buxar", "target": 0, "month": "2026-09"},
            {"fo_name": "BUX FO 2", "district": "Buxar", "target": 0, "month": "2026-09"},
            {"fo_name": "BUX FO 3", "district": "Buxar", "target": 400, "month": "2026-09"},
        ]
    }

    mock_reports = [
        {"doc_id": "r1", "working_place": "Sitamarhi", "fo_name": "AVINASH KUMAR", "date": "2026-09-10", "notification_ids": ["N1"]},
        {"doc_id": "r2", "working_place": "Gaya", "fo_name": "GAYA FO 3", "date": "2026-09-10", "notification_ids": ["N2"]},
        {"doc_id": "r3", "working_place": "Begusarai", "fo_name": "BEGU FO 2", "date": "2026-09-10", "notification_ids": ["N3"]},
        {"doc_id": "r4", "working_place": "Muzaffarpur", "fo_name": "MUZ FO 2", "date": "2026-09-10", "notification_ids": ["N4"]},
        {"doc_id": "r5", "working_place": "Buxar", "fo_name": "BUX FO 3", "date": "2026-09-10", "notification_ids": ["N5"]},
    ]

    with patch("main.get_targets", new=AsyncMock(return_value=mock_targets)), \
         patch("main.get_raw_monthly_reports", new=AsyncMock(return_value=mock_reports)):

        response = client.get("/api/statewide-top-performers?month=2026-09&period=monthly", headers=headers)
        assert response.status_code == 200
        data = response.json()
        d_map = {d["district"]: d["target"] for d in data["top_districts"]}

        assert d_map["Sitamarhi"] == 411, f"Sitamarhi target should be 411, got {d_map['Sitamarhi']}"
        assert d_map["Gaya"] == 615, f"Gaya target should be 615, got {d_map['Gaya']}"
        assert d_map["Begusarai"] == 500, f"Begusarai target should be 500, got {d_map['Begusarai']}"
        assert d_map["Muzaffarpur"] == 630, f"Muzaffarpur target should be 630, got {d_map['Muzaffarpur']}"
        assert d_map["Buxar"] == 400, f"Buxar target should be 400, got {d_map['Buxar']}"

def test_fo_month_specific_target_binding():
    """Verify FO individual target reflects month-specific target in staff_month_targets."""
    token = make_admin_token()
    headers = {"Authorization": f"Bearer {token}"}

    mock_targets = {
        "success": True,
        "month": "2026-09",
        "targets": [
            {"fo_name": "KAVITA KUMARI", "district": "Patna", "target": 85, "month": "2026-09"}
        ]
    }

    mock_reports = [
        {
            "doc_id": "patna_kavita_1",
            "working_place": "Patna",
            "fo_name": "KAVITA KUMARI",
            "date": "2026-09-15",
            "notification_ids": [f"N_{i}" for i in range(85)]
        }
    ]

    with patch("main.get_targets", new=AsyncMock(return_value=mock_targets)), \
         patch("main.get_raw_monthly_reports", new=AsyncMock(return_value=mock_reports)):

        response = client.get("/api/statewide-top-performers?month=2026-09&period=monthly", headers=headers)
        assert response.status_code == 200
        data = response.json()
        top_fo = data["top_fo"]
        assert len(top_fo) > 0
        kavita = next((s for s in top_fo if "KAVITA" in s["fo_name"].upper()), None)
        assert kavita is not None
        # Target must be 85, so 85 notifications / 85 target = 100.0%
        assert kavita["percentage"] == 100.0

def test_record_report_mutation_invalidates_statewide_top_cache():
    """Verify report mutation (submit, edit, delete) immediately clears statewide leaderboard cache."""
    from main import record_report_mutation
    
    # Set cache entries
    cache.set("statewide_top_2026-09_monthly", {"cached": True}, ttl=180)
    cache.set("statewide_top_2026-09_weekly", {"cached": True}, ttl=180)
    assert cache.get("statewide_top_2026-09_monthly") is not None

    # Call record_report_mutation with date
    record_report_mutation(action="submit", date="2026-09-22", district="Sitamarhi")

    # Both must be evicted
    assert cache.get("statewide_top_2026-09_monthly") is None
    assert cache.get("statewide_top_2026-09_weekly") is None

