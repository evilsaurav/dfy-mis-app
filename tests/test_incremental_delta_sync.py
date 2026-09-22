import pytest
import asyncio
from unittest.mock import MagicMock
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import main

def test_upsert_in_memory_report_appends_and_updates():
    month_prefix = "2026-09"
    cache_key = f"shared_raw_month_{month_prefix}"
    main.cache.delete(cache_key)

    # Initial list in cache
    initial_reports = [
        {"id": "gaya_fo1_2026-09-01", "fo_name": "FO 1", "working_place": "Gaya", "notifications": [101]},
        {"id": "buxar_fo2_2026-09-01", "fo_name": "FO 2", "working_place": "Buxar", "notifications": [102]},
    ]
    main.cache.set(cache_key, list(initial_reports), ttl=3600)

    # 1. Update existing report
    updated_report = {
        "id": "gaya_fo1_2026-09-01", 
        "fo_name": "FO 1", 
        "working_place": "Gaya", 
        "notifications": [101, 103], 
        "last_edited_at": "2026-09-22 22:30:00"
    }
    main.upsert_in_memory_report(month_prefix, updated_report, action="submit")

    cached_after_update = main.cache.get(cache_key)
    assert len(cached_after_update) == 2
    assert cached_after_update[0]["notifications"] == [101, 103]
    assert cached_after_update[0]["last_edited_at"] == "2026-09-22 22:30:00"

    # 2. Append new report
    new_report = {
        "id": "patna_fo3_2026-09-02", 
        "fo_name": "FO 3", 
        "working_place": "Patna", 
        "notifications": [104], 
        "submitted_at": "2026-09-22 22:31:00"
    }
    main.upsert_in_memory_report(month_prefix, new_report, action="submit")

    cached_after_append = main.cache.get(cache_key)
    assert len(cached_after_append) == 3
    assert cached_after_append[2]["id"] == "patna_fo3_2026-09-02"

    # 3. Delete report
    main.upsert_in_memory_report(month_prefix, {"id": "buxar_fo2_2026-09-01"}, action="delete")
    cached_after_delete = main.cache.get(cache_key)
    assert len(cached_after_delete) == 2
    assert all(r["id"] != "buxar_fo2_2026-09-01" for r in cached_after_delete)

@pytest.mark.asyncio
async def test_dashboard_data_delta_response_returns_only_modified_records():
    month_prefix = "2026-09"
    cache_key = f"shared_raw_month_{month_prefix}"
    main.cache.delete(cache_key)

    mock_raw = [
        {
            "id": "gaya_fo1_2026-09-01",
            "working_place": "Gaya",
            "fo_name": "FO 1",
            "date_of_reporting": "2026-09-01",
            "submitted_at": "2026-09-22 10:00:00",
            "notification_ids": ["111"]
        },
        {
            "id": "gaya_fo2_2026-09-02",
            "working_place": "Gaya",
            "fo_name": "FO 2",
            "date_of_reporting": "2026-09-02",
            "submitted_at": "2026-09-22 18:00:00",
            "last_edited_at": "2026-09-22 22:10:00",
            "notification_ids": ["222", "333"]
        }
    ]
    main.cache.set(cache_key, mock_raw, ttl=3600)
    main.LAST_REPORTS_MODIFIED_TS = 1790100000.0 # future mutation

    # Query with since = "2026-09-22 12:00:00"
    # Only report 2 has last_edited_at / submitted_at after 12:00:00!
    req = main.DashboardRequest(
        month_prefix=month_prefix,
        since="2026-09-22 12:00:00",
        cached_count=1,
        districts="Gaya",
        force_refresh=False
    )
    admin_ctx = {"role": "SUPER_ADMIN", "allowed_districts": ["All"], "user_id": "test_admin"}

    res = await main.get_dashboard_data(req, admin=admin_ctx)
    assert res["status"] == "success"
    assert res["mode"] == "DELTA"
    assert len(res["records"]) == 1
    assert res["records"][0]["fo_name"] in ["FO 2", "Fo 2"]
    assert res["records"][0]["notifications"] == 2

@pytest.mark.asyncio
async def test_subadmin_cold_query_scoped_to_district():
    month_prefix = "2026-09"
    # Ensure cache is completely empty
    main.cache.delete(f"shared_raw_month_{month_prefix}")
    main.cache.delete_prefix(f"shared_raw_month_{month_prefix}_")

    # Mock db to verify that query filter is called with working_place == "Sitamarhi"
    mock_coll = MagicMock()
    mock_query = MagicMock()
    mock_query.where.return_value = mock_query
    
    fake_doc = MagicMock()
    fake_doc.id = "sitamarhi_fo1_2026-09-01"
    fake_doc.to_dict.return_value = {
        "id": "sitamarhi_fo1_2026-09-01",
        "working_place": "Sitamarhi",
        "fo_name": "Sitamarhi FO",
        "date_of_reporting": "2026-09-01",
        "notification_ids": ["999"]
    }
    mock_query.stream.return_value = [fake_doc]
    mock_coll.where.return_value = mock_query

    original_db = main.db
    try:
        mock_db = MagicMock()
        mock_db.collection.return_value = mock_coll
        main.db = mock_db

        req = main.DashboardRequest(
            month_prefix=month_prefix,
            districts="Sitamarhi",
            force_refresh=True
        )
        subadmin_ctx = {
            "role": "SUB_ADMIN",
            "allowed_districts": ["Sitamarhi"],
            "user_id": "sub_sitamarhi"
        }

        res = await main.get_dashboard_data(req, admin=subadmin_ctx)
        assert res["status"] == "success"
        assert len(res["records"]) == 1
        assert res["records"][0]["working_place"] == "Sitamarhi"

        # Verify that mock_coll.where was invoked with working_place
        where_calls = [call[0] for call in mock_coll.where.call_args_list] + [call[0] for call in mock_query.where.call_args_list]
        has_district_filter = any(len(c) >= 3 and c[0] in ["working_place", "district"] and c[2] == "Sitamarhi" for c in where_calls)
        assert has_district_filter is True
    finally:
        main.db = original_db

def test_upsert_synchronizes_statewide_and_district_partitioned_caches():
    month_prefix = "2026-09"
    state_key = f"shared_raw_month_{month_prefix}"
    dist_key = f"shared_raw_month_{month_prefix}_gaya"
    
    main.cache.delete(state_key)
    main.cache.delete(dist_key)
    
    # Pre-populate both caches
    main.cache.set(state_key, [{"id": "gaya_fo1", "working_place": "Gaya", "notifications": [1]}], ttl=3600)
    main.cache.set(dist_key, [{"id": "gaya_fo1", "working_place": "Gaya", "notifications": [1]}], ttl=3600)
    
    # 1. Update report
    new_report = {"id": "gaya_fo1", "working_place": "Gaya", "notifications": [1, 2], "date": "2026-09-01"}
    main.upsert_in_memory_report(month_prefix, new_report, action="submit")
    
    cached_state = main.cache.get(state_key)
    cached_dist = main.cache.get(dist_key)
    assert cached_state[0]["notifications"] == [1, 2]
    assert cached_dist[0]["notifications"] == [1, 2]
    
    # 2. Append new report in Gaya
    fo2_report = {"id": "gaya_fo2", "working_place": "Gaya", "notifications": [3], "date": "2026-09-02"}
    main.upsert_in_memory_report(month_prefix, fo2_report, action="submit")
    
    assert len(main.cache.get(state_key)) == 2
    assert len(main.cache.get(dist_key)) == 2

def test_record_report_mutation_preserves_cache_when_report_data_provided():
    month_prefix = "2026-09"
    state_key = f"shared_raw_month_{month_prefix}"
    
    main.cache.delete(state_key)
    main.cache.set(state_key, [{"id": "existing_doc", "working_place": "Patna"}], ttl=3600)
    
    # Calling mutation with report_data should NOT wipe the cache!
    new_data = {"id": "new_doc", "working_place": "Patna", "date_of_reporting": "2026-09-15"}
    main.record_report_mutation("submit", "new_doc", district="Patna", date="2026-09-15", report_data=new_data)
    
    cached = main.cache.get(state_key)
    assert cached is not None
    assert len(cached) == 2
    assert any(r["id"] == "new_doc" for r in cached)

@pytest.mark.asyncio
async def test_subadmin_tombstone_isolation():
    month_prefix = "2026-09"
    main.DELETED_REPORTS_TOMBSTONES.clear()
    
    # Add a deletion in Gaya and a deletion in Buxar
    main.record_report_mutation("delete", "gaya_doc_del", district="Gaya", date="2026-09-01")
    main.record_report_mutation("delete", "buxar_doc_del", district="Buxar", date="2026-09-01")
    
    # Sub-Admin for Gaya queries delta
    req = main.DashboardRequest(
        month_prefix=month_prefix,
        since="2026-09-01 00:00:00",
        cached_count=1,
        districts="Gaya",
        force_refresh=False
    )
    subadmin_ctx = {
        "role": "SUB_ADMIN",
        "allowed_districts": ["Gaya"],
        "user_id": "sub_gaya"
    }
    
    res = await main.get_dashboard_data(req, admin=subadmin_ctx)
    assert res["status"] == "success"
    # Sub-Admin must ONLY see their district's tombstone!
    assert "gaya_doc_del" in res["deleted_ids"]
    assert "buxar_doc_del" not in res["deleted_ids"]



