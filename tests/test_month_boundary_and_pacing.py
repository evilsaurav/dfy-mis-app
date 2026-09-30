import pytest
from datetime import datetime, date
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient
from pathlib import Path
import sys

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from main import (
    app,
    cache,
    get_reporting_cutoff_hour,
    get_active_operational_month,
    create_access_token,
)

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

def test_reporting_cutoff_hour_day_1_vs_other_days():
    # Day 1 yields 12 (Noon)
    dt_day1 = datetime(2026, 10, 1, 9, 30)
    assert get_reporting_cutoff_hour(dt_day1) == 12

    # Other days yield 11 (11 AM)
    dt_day15 = datetime(2026, 10, 15, 9, 30)
    assert get_reporting_cutoff_hour(dt_day15) == 11

def test_get_active_operational_month():
    # Oct 1 at 09:00 AM -> September (grace window)
    dt_morning = datetime(2026, 10, 1, 9, 0)
    assert get_active_operational_month(dt_morning) == "2026-09"

    # Oct 1 at 12:00 PM -> October
    dt_noon = datetime(2026, 10, 1, 12, 0)
    assert get_active_operational_month(dt_noon) == "2026-10"

    # Oct 15 at 09:00 AM -> October
    dt_mid_month = datetime(2026, 10, 15, 9, 0)
    assert get_active_operational_month(dt_mid_month) == "2026-10"

    # Jan 1 at 11:59 AM -> Previous year December
    dt_jan1 = datetime(2027, 1, 1, 11, 59)
    assert get_active_operational_month(dt_jan1) == "2026-12"

    # None defaults to get_ist_now()
    with patch("main.get_ist_now", return_value=datetime(2026, 10, 1, 8, 30)):
        assert get_active_operational_month() == "2026-09"

def test_check_today_status_at_10_30_am_on_day_1():
    # On Oct 1 at 10:30 AM (between 10 AM and 12 PM), check_today_status should look up yesterday's doc
    req_body = {
        "working_place": "Sitamarhi",
        "fo_name": "ALOK KUMAR",
        "date": "2026-10-01"
    }

    with patch("main.get_ist_now", return_value=datetime(2026, 10, 1, 10, 30)), \
         patch("main.db") as mock_db:
        # Today doc does not exist, but yesterday's doc exists
        def mock_doc_impl(doc_id):
            doc = MagicMock()
            if "2026-09-30" in doc_id:
                doc.exists = True
                doc.to_dict.return_value = {
                    "date_of_reporting": "2026-09-30",
                    "status": "completed",
                    "timestamp_completed": "2026-10-01T10:15:00"
                }
            else:
                doc.exists = False
                doc.to_dict.return_value = {}
            return doc

        mock_db.collection.return_value.document.side_effect = mock_doc_impl

        res = client.post("/check-today-status", json=req_body)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "completed"

def test_statewide_top_performers_operational_month_fallback():
    # On Oct 1 at 09:00 AM, querying without month should default to operational month (2026-09)
    token = make_admin_token()
    headers = {"Authorization": f"Bearer {token}"}

    dt_oct1_morning = datetime(2026, 10, 1, 9, 0)
    with patch("main.datetime") as mock_dt, \
         patch("main.get_targets", new=AsyncMock(return_value={"targets": []})), \
         patch("main.get_raw_monthly_reports", new=AsyncMock(return_value=[])):
        # Ensure utcnow + 5:30 yields Oct 1 09:00 AM
        mock_dt.utcnow.return_value = datetime(2026, 10, 1, 3, 30)
        mock_dt.now = datetime.now

        res = client.get("/api/statewide-top-performers", headers=headers)
        assert res.status_code == 200
        assert res.json().get("month") == "2026-09"

def test_my_profile_stats_past_current_future_working_days():
    # Test past month calculation: remaining_working_days == 0, required_run_rate == 0.0
    mock_reports = [
        MagicMock(to_dict=lambda: {
            "date_of_reporting": "2026-08-15",
            "working_place": "Sitamarhi",
            "fo_name": "ALOK KUMAR",
            "status": "completed",
            "notification_ids": ["N1", "N2"],
            "total_km": 20
        })
    ]

    with patch("main.get_ist_now", return_value=datetime(2026, 10, 1, 14, 0)), \
         patch("main.db") as mock_db:
        mock_db.collection.return_value.document.return_value.get.return_value = MagicMock(exists=False)
        mock_db.collection.return_value.where.return_value.where.return_value.where.return_value.stream.return_value = mock_reports

        # Query past month (2026-08)
        payload_past = {
            "working_place": "Sitamarhi",
            "fo_name": "ALOK KUMAR",
            "pin": "1234",
            "month": "2026-08"
        }
        res_past = client.post("/my-profile-stats", json=payload_past)
        assert res_past.status_code == 200
        data_past = res_past.json()
        pwd_info = data_past["working_days_info"]
        assert pwd_info["remaining_working_days"] == 0
        assert pwd_info["required_run_rate"] == 0.0
        assert pwd_info["elapsed_working_days"] == pwd_info["total_working_days"]

        # Query future month (2026-11)
        payload_future = {
            "working_place": "Sitamarhi",
            "fo_name": "ALOK KUMAR",
            "pin": "1234",
            "month": "2026-11"
        }
        res_future = client.post("/my-profile-stats", json=payload_future)
        assert res_future.status_code == 200
        data_future = res_future.json()
        fwd_info = data_future["working_days_info"]
        assert fwd_info["elapsed_working_days"] == 0
        assert fwd_info["remaining_working_days"] == fwd_info["total_working_days"]
