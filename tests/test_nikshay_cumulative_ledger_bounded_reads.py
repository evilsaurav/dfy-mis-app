import pytest
import asyncio
from unittest.mock import MagicMock, patch
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

def test_exact_episode_id_search_uses_single_get():
    """Verify that searching for an exact Episode ID executes a direct document get, not stream()."""
    token = make_admin_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    with patch("main.db") as mock_db:
        mock_doc = MagicMock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {
            "patient_id": "12345678",
            "patient_name": "Ramesh Kumar",
            "phone": "9876543210",
            "district": "Patna",
            "hiv_dm_tested": True,
            "bank_validated": True,
            "udst_done": False,
            "contact_tracing_done": True,
            "notification_verified": True
        }
        mock_doc_ref = MagicMock()
        mock_doc_ref.get.return_value = mock_doc
        mock_col = MagicMock()
        mock_col.document.return_value = mock_doc_ref
        mock_db.collection.return_value = mock_col
        
        response = client.get("/admin/nikshay/cumulative-ledger?search=12345678", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["patients"]) == 1
        assert data["patients"][0]["patient_id"] == "12345678"
        # Verify collection.stream was NOT called
        assert not mock_col.stream.called
        # Verify document("12345678").get() was called
        mock_col.document.assert_called_with("12345678")

def test_paginated_query_enforces_limit_and_schema():
    """Verify that browsing pages enforces limit and returns all required frontend schema fields."""
    token = make_admin_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    with patch("main.db") as mock_db:
        mock_query = MagicMock()
        mock_doc1 = MagicMock()
        mock_doc1.to_dict.return_value = {
            "patient_id": "P001",
            "patient_name": "Patient One",
            "district": "Patna",
            "hiv_dm_tested": True,
            "bank_validated": True,
            "udst_done": False,
            "contact_tracing_done": False
        }
        mock_query.stream.return_value = [mock_doc1]
        mock_query.limit.return_value = mock_query
        mock_query.offset.return_value = mock_query
        mock_query.order_by.return_value = mock_query
        mock_query.where.return_value = mock_query
        
        mock_col = MagicMock()
        mock_col.order_by.return_value = mock_query
        mock_col.where.return_value = mock_query
        mock_col.limit.return_value = mock_query
        mock_db.collection.return_value = mock_col
        
        response = client.get("/admin/nikshay/cumulative-ledger?district=Patna&page=1&limit=30", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "total_records" in data
        assert "page" in data
        assert data["page"] == 1
        assert "limit" in data
        assert data["limit"] == 30
        assert "metrics" in data
        assert "total_verified" in data["metrics"]
        assert "hiv_dm_verified" in data["metrics"]
        assert "bank_validated" in data["metrics"]
        assert "udst_done" in data["metrics"]
        assert "contact_tracing_done" in data["metrics"]
        assert "patients" in data
        assert len(data["patients"]) >= 1

def test_subadmin_rbac_isolation_cumulative_ledger():
    """Verify that Sub-Admins cannot access unauthorized districts."""
    # Sub-admin allowed ONLY Gaya
    token = make_admin_token(role="SUB_ADMIN", allowed=["Gaya"])
    headers = {"Authorization": f"Bearer {token}"}
    
    # Attempt to query Patna
    response = client.get("/admin/nikshay/cumulative-ledger?district=Patna", headers=headers)
    assert response.status_code == 403
    assert "Permission denied" in response.json()["detail"]
    
    # Query Gaya (allowed)
    with patch("main.db") as mock_db:
        mock_query = MagicMock()
        mock_query.stream.return_value = []
        mock_query.limit.return_value = mock_query
        mock_query.offset.return_value = mock_query
        mock_query.order_by.return_value = mock_query
        mock_query.where.return_value = mock_query
        mock_col = MagicMock()
        mock_col.where.return_value = mock_query
        mock_col.limit.return_value = mock_query
        mock_db.collection.return_value = mock_col
        
        ok_response = client.get("/admin/nikshay/cumulative-ledger?district=Gaya", headers=headers)
        assert ok_response.status_code == 200
