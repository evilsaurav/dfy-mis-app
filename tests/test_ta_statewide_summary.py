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
from backend.core.cache import cache

client = TestClient(main.app)

@pytest.fixture(autouse=True)
def cleanup():
    main.app.dependency_overrides.clear()
    cache.clear()
    yield
    main.app.dependency_overrides.clear()
    cache.clear()


def test_statewide_summary_unauthenticated_and_rbac():
    # 1. Unauthenticated request rejected
    res = client.get("/admin/ta/statewide-summary?month=2026-10")
    assert res.status_code == 401

    # 2. SUB_ADMIN rejected with 403 Forbidden
    with patch("backend.core.security.get_current_user", return_value={"uid": "u_sub", "role": "SUB_ADMIN", "allowed_districts": ["Patna"]}):
        res = client.get("/admin/ta/statewide-summary?month=2026-10", headers={"Authorization": "Bearer mock"})
        assert res.status_code == 403
        assert "Only Super Admin and Main Incharge" in res.json()["detail"]


def test_statewide_summary_allowed_for_super_admin_and_incharge():
    # Mock database records returned by PostgreSQL aggregation
    mock_db_rows = [
        {
            "district": "Patna",
            "total_officers": 3,
            "total_km": 1500.0,
            "total_gross": 6000.0,
            "total_deductions": 100.0,
            "total_payable": 5900.0,
            "approved_count": 3,
            "submitted_count": 0,
            "reverted_count": 0,
            "draft_count": 0,
            "dispute_count": 0,
            "last_updated_at": "2026-10-07T12:00:00Z"
        },
        {
            "district": "Gaya",
            "total_officers": 2,
            "total_km": 800.0,
            "total_gross": 3200.0,
            "total_deductions": 0.0,
            "total_payable": 3200.0,
            "approved_count": 1,
            "submitted_count": 1,
            "reverted_count": 0,
            "draft_count": 0,
            "dispute_count": 1,
            "last_updated_at": "2026-10-07T14:00:00Z"
        }
    ]

    with patch("backend.core.security.get_current_user", return_value={"uid": "u_sup", "role": "SUPER_ADMIN"}), \
         patch("backend.routers.travel_allowance.pg_execute_raw", return_value=mock_db_rows), \
         patch("backend.routers.travel_allowance.get_current_ta_rate_value", return_value=4.0):

        res = client.get("/admin/ta/statewide-summary?month=2026-10", headers={"Authorization": "Bearer mock"})
        assert res.status_code == 200
        data = res.json()

        assert data["month"] == "2026-10"
        assert data["rate_per_km"] == 4.0
        assert "summary" in data
        assert "districts" in data

        summary = data["summary"]
        assert summary["total_districts"] == 2
        assert summary["total_officers"] == 5
        assert summary["total_km"] == 2300.0
        assert summary["total_gross"] == 9200.0
        assert summary["total_deductions"] == 100.0
        assert summary["total_payable"] == 9100.0
        assert summary["approved_districts"] == 1  # Only Patna is 3/3 approved
        assert summary["pending_districts"] == 1   # Gaya has submitted_count > 0
        assert summary["disputed_districts"] == 1  # Gaya has dispute_count > 0
        assert len(data["districts"]) == 2

        # Check district 1 (Patna)
        patna = data["districts"][0]
        assert patna["district"] == "Patna"
        assert patna["completion_pct"] == 100.0
        assert patna["status"] == "APPROVED"

        # Check district 2 (Gaya)
        gaya = data["districts"][1]
        assert gaya["district"] == "Gaya"
        assert gaya["completion_pct"] == 50.0
        assert gaya["status"] == "SUBMITTED"

    # MAIN_INCHARGE should also have access
    with patch("backend.core.security.get_current_user", return_value={"uid": "u_inc", "role": "MAIN_INCHARGE"}), \
         patch("backend.routers.travel_allowance.pg_execute_raw", return_value=mock_db_rows), \
         patch("backend.routers.travel_allowance.get_current_ta_rate_value", return_value=4.0):

        res = client.get("/admin/ta/statewide-summary?month=2026-10", headers={"Authorization": "Bearer mock"})
        assert res.status_code == 200


def test_statewide_summary_cache_and_invalidation():
    mock_db_rows = [
        {
            "district": "Patna",
            "total_officers": 1,
            "total_km": 100.0,
            "total_gross": 400.0,
            "total_deductions": 0.0,
            "total_payable": 400.0,
            "approved_count": 1,
            "submitted_count": 0,
            "reverted_count": 0,
            "draft_count": 0,
            "dispute_count": 0,
            "last_updated_at": "2026-10-07T12:00:00Z"
        }
    ]

    cache_key = "ta_statewide_summary_2026-10"
    cache.clear()

    with patch("backend.core.security.get_current_user", return_value={"uid": "u_sup", "role": "SUPER_ADMIN"}), \
         patch("backend.routers.travel_allowance.pg_execute_raw", return_value=mock_db_rows) as mock_sql, \
         patch("backend.routers.travel_allowance.get_current_ta_rate_value", return_value=4.0):

        # First request hits DB and populates cache
        res1 = client.get("/admin/ta/statewide-summary?month=2026-10", headers={"Authorization": "Bearer mock"})
        assert res1.status_code == 200
        assert mock_sql.call_count == 1
        assert cache.get(cache_key) is not None

        # Second request hits cache, no DB call
        res2 = client.get("/admin/ta/statewide-summary?month=2026-10", headers={"Authorization": "Bearer mock"})
        assert res2.status_code == 200
        assert mock_sql.call_count == 1

        # Cache invalidation works
        cache.delete(cache_key)
        assert cache.get(cache_key) is None
