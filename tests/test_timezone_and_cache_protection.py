import pytest
from datetime import datetime, timezone, timedelta
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import main

def test_normalize_timestamp_str_utc_to_ist():
    # 02:35:19 UTC should convert to 08:05:19 IST
    utc_dt = datetime(2026, 9, 29, 2, 35, 19, tzinfo=timezone.utc)
    res = main.normalize_timestamp_str(utc_dt)
    assert res == "2026-09-29 08:05:19", f"Expected '2026-09-29 08:05:19' but got '{res}'"

def test_normalize_timestamp_str_utc_iso_string_to_ist():
    iso_utc_str = "2026-09-29T02:35:19.253000Z"
    res = main.normalize_timestamp_str(iso_utc_str)
    assert res == "2026-09-29 08:05:19", f"Expected '2026-09-29 08:05:19' but got '{res}'"

def test_normalize_timestamp_str_naive_ist_string():
    ist_str = "2026-09-29 14:30:00"
    res = main.normalize_timestamp_str(ist_str)
    assert res == "2026-09-29 14:30:00"

def test_simple_ttl_cache_excludes_shared_raw_month_from_disk_persist(tmp_path):
    # Verify SimpleTTLCache does not flush shared_raw_month_ to disk
    cache = main.SimpleTTLCache(default_ttl=300, disk_persist_dir=str(tmp_path))
    
    # 1. Set staff_directory (should be persisted)
    cache.set("staff_directory", {"fo1": "active"}, ttl=300)
    
    # 2. Set shared_raw_month_ (should NOT be persisted to disk to avoid 512MB Render RAM spike)
    cache.set("shared_raw_month_2026-09", [{"doc": "massive_report"}] * 100, ttl=3600)
    
    # Wait for background thread flush to complete
    import time
    time.sleep(0.3)
    
    disk_file = tmp_path / "l2_persistent_cache.json"
    assert disk_file.exists(), "l2_persistent_cache.json should be created"
    
    import json
    with open(disk_file, "r", encoding="utf-8") as f:
        persisted = json.load(f)
    
    assert "staff_directory" in persisted, "staff_directory should be persisted to disk"
    assert "shared_raw_month_2026-09" not in persisted, "shared_raw_month_ must NOT be written to disk (Render anti-OOM protection)"
