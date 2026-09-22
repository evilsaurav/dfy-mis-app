import pytest
import tempfile
import time
import os
import httpx
from unittest.mock import patch, MagicMock
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from main import (
    app, 
    cache, 
    record_report_mutation, 
    SimpleTTLCache, 
    canonicalize_district,
    create_access_token
)

def make_admin_token(role="SUPER_ADMIN", username="superadmin", allowed_districts=None):
    return create_access_token({
        "user_id": "test_admin_123",
        "username": username,
        "role": role,
        "name": "Super Admin Test",
        "allowed_districts": allowed_districts or ["All"]
    })

def test_scoped_cache_invalidation():
    # 1. Populate multiple districts and dates in cache
    cache.set("dist_notif_registry_Aurangabad_2026-09_3", {"aurangabad": True})
    cache.set("dist_notif_registry_Gaya_2026-09_3", {"gaya": True})
    cache.set("dist_notif_registry_Patna_2026-09_3", {"patna": True})

    cache.set("shared_raw_month_2026-09", [{"doc": "sep"}])
    cache.set("shared_raw_month_2026-08", [{"doc": "aug"}])

    cache.set("attendance_2026-09-22_all", {"att": "today"})
    cache.set("attendance_2026-09-21_all", {"att": "yesterday"})

    cache.set("cascade_alerts_Aurangabad_All", {"alerts": []})
    cache.set("cascade_alerts_Gaya_All", {"alerts": []})

    # 2. Mutate report in Aurangabad on 2026-09-22
    record_report_mutation(
        action="submit",
        doc_id="aurangabad_test_1",
        district="Aurangabad",
        date="2026-09-22"
    )

    # 3. Verify Scoped Invalidation
    # Aurangabad should be invalidated
    assert cache.get("dist_notif_registry_Aurangabad_2026-09_3") is None
    assert cache.get("cascade_alerts_Aurangabad_All") is None

    # Gaya and Patna MUST REMAIN CACHED (No statewide nuclear purge!)
    assert cache.get("dist_notif_registry_Gaya_2026-09_3") == {"gaya": True}
    assert cache.get("dist_notif_registry_Patna_2026-09_3") == {"patna": True}
    assert cache.get("cascade_alerts_Gaya_All") == {"alerts": []}

    # Month scoping: September invalidated, August preserved
    assert cache.get("shared_raw_month_2026-09") is None
    assert cache.get("shared_raw_month_2026-08") == [{"doc": "aug"}]

    # Date scoping: Today invalidated, Yesterday preserved
    assert cache.get("attendance_2026-09-22_all") is None
    assert cache.get("attendance_2026-09-21_all") == {"att": "yesterday"}

def test_district_change_invalidates_both_old_and_new():
    cache.set("dist_notif_registry_Aurangabad_2026-09_3", {"aurangabad": True})
    cache.set("dist_notif_registry_Gaya_2026-09_3", {"gaya": True})
    cache.set("dist_notif_registry_Patna_2026-09_3", {"patna": True})

    # Mutate with district change from Aurangabad to Gaya
    record_report_mutation(
        action="edit",
        doc_id="doc_transfer",
        district="Gaya",
        date="2026-09-22",
        old_district="Aurangabad"
    )

    # Both old and new districts must be invalidated
    assert cache.get("dist_notif_registry_Aurangabad_2026-09_3") is None
    assert cache.get("dist_notif_registry_Gaya_2026-09_3") is None

    # Unrelated district Patna remains cached
    assert cache.get("dist_notif_registry_Patna_2026-09_3") == {"patna": True}

def test_l2_disk_cache_hydration_across_instances():
    with tempfile.TemporaryDirectory() as tmp_dir:
        # Instance 1: Saves to disk
        c1 = SimpleTTLCache(default_ttl=300, disk_persist_dir=tmp_dir)
        c1.set("staff_directory_dict", {"Gaya": ["Ramesh Kumar"]}, ttl=3600, persist=True)
        time.sleep(0.3) # Allow background flush to write

        # Instance 2: Starts with empty memory, hydrates from disk
        c2 = SimpleTTLCache(default_ttl=300, disk_persist_dir=tmp_dir)
        loaded_val = c2.get("staff_directory_dict")

        assert loaded_val is not None
        assert loaded_val.get("Gaya") == ["Ramesh Kumar"]

@pytest.mark.asyncio
async def test_get_today_attendance_uses_cached_directory():
    token = make_admin_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    # Put staff directory in cache
    test_dir = {
        "Aurangabad": ["Cached Officer A"],
        "Gaya": ["Cached Officer B"]
    }
    cache.set("staff_directory_dict", test_dir, ttl=3600)
    
    # Mock daily_field_reports stream to return empty (no attendance reports yet)
    with patch("main.db") as mock_db:
        mock_coll = MagicMock()
        mock_db.collection.return_value = mock_coll
        mock_q = MagicMock()
        mock_coll.where.return_value = mock_q
        mock_q.stream.return_value = iter([])
        
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.get("/admin/today-attendance?date=2026-09-22&districts=Aurangabad", headers=headers)
            assert res.status_code == 200
            data = res.json()
            assert data.get("missing_count") == 1
            missing = data.get("missing_fos", [])
            assert len(missing) == 1
            assert missing[0]["fo_name"] == "Cached Officer A"
