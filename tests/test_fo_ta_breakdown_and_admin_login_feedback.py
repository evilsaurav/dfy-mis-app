import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
import main

client = TestClient(main.app)

@pytest.fixture(autouse=True)
def cleanup():
    main.app.dependency_overrides.clear()
    from backend.core.cache import cache
    cache.clear()
    yield
    main.app.dependency_overrides.clear()
    cache.clear()

def test_fo_monthly_summary_returns_days_and_deduction_details():
    """Verify that /fo/ta/monthly-summary returns days array and deduction details when approved."""
    mock_user = {"uid": "fo123", "role": "FIELD_OFFICER", "name": "Santosh Kumar"}
    
    mock_record = {
        "id": "2026-10_buxar_santosh_kumar",
        "month": "2026-10",
        "district": "Buxar",
        "staff_name": "Santosh Kumar",
        "staff_key": "santosh_kumar",
        "designation": "Field Officer",
        "rate_per_km": 4.0,
        "total_km": 150.0,
        "gross_amount": 600.0,
        "deduction_amount": 50.0,
        "deduction_reason": "Late attendance on 2 days",
        "final_payable_amount": 550.0,
        "admin_remarks": "Approved with deduction",
        "status": "APPROVED",
        "approved_at": "2026-10-31T12:00:00",
        "days": [
            {
                "day": 1,
                "date": "2026-10-01",
                "morning_km": 1000.0,
                "evening_km": 1025.0,
                "total_km": 25.0,
                "visited_names": "Sadar Hospital",
                "purpose": "TB Patient Visit",
                "is_manual_override": False,
                "admin_remarks": ""
            }
        ]
    }

    with patch("backend.core.security.get_current_user", return_value=mock_user):
        with patch("backend.routers.travel_allowance.pg_execute_raw") as mock_pg:
            mock_pg.return_value = [mock_record]
            
            res = client.get(
                "/fo/ta/monthly-summary?month=2026-10&district=Buxar&fo_name=Santosh Kumar",
                headers={"Authorization": "Bearer 1234"}
            )
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "APPROVED"
            assert data["data"]["deduction_amount"] == 50.0
            assert data["data"]["deduction_reason"] == "Late attendance on 2 days"
            assert data["data"]["gross_amount"] == 600.0
            assert data["data"]["final_payable_amount"] == 550.0
            assert len(data["data"]["days"]) == 31  # October has 31 days
            assert data["data"]["days"][0]["day"] == 1
            assert data["data"]["days"][0]["total_km"] == 25.0
            assert data["data"]["days"][0]["visited_names"] == "Sadar Hospital"

def test_fo_monthly_summary_under_review_masks_data():
    """Verify that unapproved record masks financial details and returns UNDER_REVIEW."""
    mock_user = {"uid": "fo123", "role": "FIELD_OFFICER", "name": "Santosh Kumar"}
    
    mock_record = {
        "id": "2026-10_buxar_santosh_kumar",
        "month": "2026-10",
        "district": "Buxar",
        "staff_name": "Santosh Kumar",
        "status": "SUBMITTED",
        "total_km": 150.0,
        "final_payable_amount": 550.0
    }

    with patch("backend.core.security.get_current_user", return_value=mock_user):
        with patch("backend.routers.travel_allowance.pg_execute_raw") as mock_pg:
            mock_pg.return_value = [mock_record]
            
            res = client.get(
                "/fo/ta/monthly-summary?month=2026-10&district=Buxar&fo_name=Santosh Kumar",
                headers={"Authorization": "Bearer 1234"}
            )
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "UNDER_REVIEW"
            assert data["data"] is None
