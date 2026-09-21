import asyncio
from datetime import datetime
from unittest.mock import MagicMock, patch
import httpx
import pytest
import jwt

import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from main import app, cache, record_report_mutation, create_access_token

def make_admin_token(role: str = "SUPER_ADMIN", allowed_districts=None):
    return create_access_token({
        "user_id": "test_admin",
        "username": "test_admin",
        "role": role,
        "allowed_districts": allowed_districts or ["All"]
    })

class FakeDoc:
    def __init__(self, data: dict):
        self._data = data

    def to_dict(self):
        return self._data

@pytest.fixture(autouse=True)
def clear_registry_cache():
    cache.delete_prefix("dist_notif_registry_")
    yield
    cache.delete_prefix("dist_notif_registry_")

@pytest.mark.asyncio
async def test_district_notification_registry_endpoint_basic():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/district-notification-registry?district=Aurangabad&months=3")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert "registry" in data
        assert isinstance(data["registry"], dict)
        assert data["district"] == "Aurangabad"
        assert "total_count" in data
        assert "cached_at" in data

@pytest.mark.asyncio
async def test_district_notification_registry_empty_district():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/district-notification-registry?district=&months=3")
        assert res.status_code == 400

@pytest.mark.asyncio
async def test_district_notification_registry_deduplication_earliest_date():
    mock_docs = [
        FakeDoc({
            "working_place": "Aurangabad",
            "date_of_reporting": "2026-09-10",
            "fo_name": "Ramesh Late",
            "notification_ids": ["987654321", "111222333"]
        }),
        FakeDoc({
            "working_place": "aurangabad", # tests case insensitivity
            "date_of_reporting": "2026-08-05",
            "fo_name": "Ramesh Early",
            "notification_ids": ["987654321"] # duplicate ID with earlier date
        }),
        FakeDoc({
            "working_place": "Gaya", # different district
            "date_of_reporting": "2026-08-01",
            "fo_name": "Other District FO",
            "notification_ids": ["999999999"]
        })
    ]

    with patch("main.db") as mock_db:
        mock_coll = MagicMock()
        mock_db.collection.return_value = mock_coll
        mock_query1 = MagicMock()
        mock_coll.where.return_value = mock_query1
        mock_query2 = MagicMock()
        mock_query1.where.return_value = mock_query2
        mock_query2.stream.return_value = iter(mock_docs)

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get("/api/district-notification-registry?district=Aurangabad&months=3")
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "success"
            assert data["district"] == "Aurangabad"
            assert data["total_count"] == 2
            
            # Earliest date should be chosen
            assert "987654321" in data["registry"]
            assert data["registry"]["987654321"]["date"] == "2026-08-05"
            assert data["registry"]["987654321"]["fo_name"] == "Ramesh Early"

            # Second ID in Aurangabad
            assert "111222333" in data["registry"]
            assert data["registry"]["111222333"]["date"] == "2026-09-10"

            # Other district ID should NOT be in Aurangabad registry
            assert "999999999" not in data["registry"]

@pytest.mark.asyncio
async def test_district_notification_registry_caching_and_invalidation():
    mock_docs = [
        FakeDoc({
            "working_place": "Aurangabad",
            "date_of_reporting": "2026-09-01",
            "fo_name": "Test FO",
            "notification_ids": ["123456789"]
        })
    ]

    with patch("main.db") as mock_db:
        mock_coll = MagicMock()
        mock_db.collection.return_value = mock_coll
        mock_query1 = MagicMock()
        mock_coll.where.return_value = mock_query1
        mock_query2 = MagicMock()
        mock_query1.where.return_value = mock_query2
        mock_query2.stream.return_value = iter(mock_docs)

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            # 1. First call populates cache
            res1 = await ac.get("/api/district-notification-registry?district=Aurangabad&months=3")
            assert res1.status_code == 200
            assert mock_coll.where.call_count == 1

            # 2. Second call should hit cache, no new DB queries
            res2 = await ac.get("/api/district-notification-registry?district=Aurangabad&months=3")
            assert res2.status_code == 200
            assert mock_coll.where.call_count == 1 # still 1

            # 3. Trigger mutation to invalidate cache
            record_report_mutation("submit", "doc_123")

            # 4. Third call should re-query DB because cache was invalidated
            res3 = await ac.get("/api/district-notification-registry?district=Aurangabad&months=3")
            assert res3.status_code == 200
            assert mock_coll.where.call_count == 2

@pytest.mark.asyncio
async def test_district_notification_registry_subadmin_rbac():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        # Sub-Admin with access only to Gaya
        gaya_token = make_admin_token(role="SUB_ADMIN", allowed_districts=["Gaya"])
        headers = {"Authorization": f"Bearer {gaya_token}"}

        # Sub-Admin attempts to access Aurangabad -> 403 Forbidden
        res_forbidden = await ac.get("/api/district-notification-registry?district=Aurangabad", headers=headers)
        assert res_forbidden.status_code == 403

        # Sub-Admin accesses permitted district Gaya -> 200 OK
        res_permitted = await ac.get("/api/district-notification-registry?district=Gaya", headers=headers)
        assert res_permitted.status_code == 200

        # Super Admin accesses Aurangabad -> 200 OK
        super_token = make_admin_token(role="SUPER_ADMIN", allowed_districts=["All"])
        super_headers = {"Authorization": f"Bearer {super_token}"}
        res_super = await ac.get("/api/district-notification-registry?district=Aurangabad", headers=super_headers)
        assert res_super.status_code == 200

@pytest.mark.asyncio
async def test_district_notification_registry_normalization_and_short_id_filtering():
    mock_docs = [
        FakeDoc({
            "working_place": "motihari", # canonicalized to "East Champaran"
            "date_of_reporting": "2026-09-02",
            "fo_name": "Test FO Champaran",
            "notification_ids": ["12345", "12", "", "ABCDEF123"] # "12" and "" should be filtered (< 5 chars)
        })
    ]

    with patch("main.db") as mock_db:
        mock_coll = MagicMock()
        mock_db.collection.return_value = mock_coll
        mock_query1 = MagicMock()
        mock_coll.where.return_value = mock_query1
        mock_query2 = MagicMock()
        mock_query1.where.return_value = mock_query2
        mock_query2.stream.return_value = iter(mock_docs)

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get("/api/district-notification-registry?district=motihari&months=3")
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "success"
            assert data["district"] == "East Champaran" # Canonical name
            assert "12345" in data["registry"]
            assert "ABCDEF123" in data["registry"]
            assert "12" not in data["registry"]
            assert "" not in data["registry"]
            assert data["total_count"] == 2

@pytest.mark.asyncio
async def test_district_notification_registry_invalid_token():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        headers = {"Authorization": "Bearer invalid_token_12345"}
        res = await ac.get("/api/district-notification-registry?district=Aurangabad", headers=headers)
        assert res.status_code == 401

if __name__ == "__main__":
    pytest.main(["-v", __file__])

