import pytest
import os
import json
from unittest.mock import MagicMock, patch
import sys
from pathlib import Path
from starlette.testclient import TestClient

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import main

class MockDocSnap:
    def __init__(self, doc_id, data):
        self.id = doc_id
        self._data = data

    def to_dict(self):
        return dict(self._data)

class MockQuery:
    def __init__(self, docs):
        self._docs = docs

    def where(self, field, op, val):
        filtered = []
        for d in self._docs:
            data = d.to_dict()
            if op == ">=" and data.get(field, "") >= val:
                filtered.append(d)
            elif op == "<=" and data.get(field, "") <= val:
                filtered.append(d)
            elif op == "==" and data.get(field, "") == val:
                filtered.append(d)
        return MockQuery(filtered)

    def stream(self):
        return iter(self._docs)

class MockCollection:
    def __init__(self, docs):
        self._docs = docs

    def where(self, field, op, val):
        return MockQuery(self._docs).where(field, op, val)

class MockDB:
    def __init__(self, docs):
        self._docs = docs

    def collection(self, name):
        return MockCollection(self._docs)

@pytest.mark.asyncio
async def test_subadmin_query_retrieves_district_variants_without_dropping():
    # Setup reports with district name variants: "Purbi Champaran" vs "East Champaran"
    raw_docs = [
        MockDocSnap("doc1", {
            "working_place": "Purbi Champaran",
            "fo_name": "Ramesh",
            "date_of_reporting": "2026-09-10",
            "notification_ids": ["111111111"]
        }),
        MockDocSnap("doc2", {
            "working_place": "East Champaran",
            "fo_name": "Suresh",
            "date_of_reporting": "2026-09-12",
            "notification_ids": ["222222222"]
        }),
        MockDocSnap("doc3", {
            "working_place": "Gaya",
            "fo_name": "Mahesh",
            "date_of_reporting": "2026-09-15",
            "notification_ids": ["333333333"]
        })
    ]
    orig_db = main.db
    main.db = MockDB(raw_docs)
    main.cache.delete_prefix("shared_raw_month_")

    try:
        # Sub-Admin with permission for "East Champaran"
        allowed = {"East Champaran"}
        reports = await main.get_raw_monthly_reports("2026-09", force=True, district_filter=allowed)
        
        # Both "Purbi Champaran" and "East Champaran" must be returned!
        doc_ids = [r["id"] for r in reports]
        assert "doc1" in doc_ids
        assert "doc2" in doc_ids
        assert "doc3" not in doc_ids
    finally:
        main.db = orig_db

@pytest.mark.asyncio
async def test_subadmin_query_does_not_overwrite_statewide_disk_snapshot():
    # Setup test file
    os.makedirs("cache", exist_ok=True)
    snap_path = "cache/dash_2026-09.json"
    statewide_records = [{"id": "statewide_1", "working_place": "Patna"}]
    with open(snap_path, "w", encoding="utf-8") as f:
        json.dump(statewide_records, f)

    try:
        # Call get_dashboard_data as Sub-Admin
        sub_admin_user = {
            "user_id": "subadmin_muzaffarpur",
            "username": "subadmin_muz",
            "role": "SUB_ADMIN",
            "allowed_districts": ["Muzaffarpur"]
        }
        req = main.DashboardRequest(month_prefix="2026-09", force_refresh=False)
        
        # Mock get_raw_monthly_reports to return only Muzaffarpur
        with patch("main.get_raw_monthly_reports") as mock_get_raw:
            mock_get_raw.return_value = [{"id": "muz_1", "working_place": "Muzaffarpur", "date_of_reporting": "2026-09-01"}]
            await main.get_dashboard_data(req, admin=sub_admin_user)

        # Verify statewide snapshot was NOT overwritten!
        with open(snap_path, "r", encoding="utf-8") as f:
            persisted = json.load(f)
        assert len(persisted) == 1
        assert persisted[0]["id"] == "statewide_1"
    finally:
        if os.path.exists(snap_path):
            os.remove(snap_path)

def test_system_version_endpoint():
    client = TestClient(main.app)
    response = client.get("/api/system-version")
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "success"
    assert data.get("version") == "2.8.1"
    assert data.get("min_supported_version") == "2.8.0"
