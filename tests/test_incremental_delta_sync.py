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

