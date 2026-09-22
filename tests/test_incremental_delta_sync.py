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
