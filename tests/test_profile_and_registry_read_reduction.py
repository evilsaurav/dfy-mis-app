import os
import sys
from pathlib import Path
from datetime import datetime
from unittest.mock import patch, MagicMock, AsyncMock
import pytest

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import main
from main import (
    app,
    cache,
    my_profile_stats,
    submit_daily_report,
    ProfileStatsRequest,
    DailyActivityReport,
    canonicalize_district
)

@pytest.fixture(autouse=True)
def clear_test_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.mark.asyncio
async def test_my_profile_stats_zero_firestore_reads():
    """
    Verify my_profile_stats derives profile information from cached staff directory,
    cached monthly targets, and in-memory master ledger reports without triggering
    collection streams or document reads against Firestore.
    """
    cache.clear()
    req = ProfileStatsRequest(working_place="Patna", fo_name="Amit Kumar", pin="1234", month="2026-09")

    mock_reports = [
        {
            "id": "patna_amitkumar_2026-09-10",
            "working_place": "Patna",
            "fo_name": "Amit Kumar",
            "date_of_reporting": "2026-09-10",
            "notification_ids": ["N1", "N2", "N3"],
            "total_km": 25,
            "submission_count": 1
        }
    ]

    with patch("main.get_raw_monthly_reports", new_callable=AsyncMock) as mock_raw, \
         patch("main.get_cached_staff_directory_raw", new_callable=AsyncMock) as mock_staff, \
         patch("main.get_cached_staff_targets_for_month", new_callable=AsyncMock) as mock_targets, \
         patch("main.db") as mock_db:

        mock_raw.return_value = mock_reports
        mock_staff.return_value = [{"district": "Patna", "name": "Amit Kumar", "pin": "1234", "is_active": True}]
        mock_targets.return_value = [{"district": "Patna", "fo_name": "Amit Kumar", "target": 60, "month": "2026-09"}]
        
        # Ensure direct Firestore queries are NOT triggered
        mock_db.collection.return_value.document.return_value.get.side_effect = AssertionError("Firestore .document.get should not be called!")
        mock_db.collection.return_value.where.return_value.where.return_value.stream.side_effect = AssertionError("Firestore .stream should not be called!")

        res = await my_profile_stats(req)
        assert res["success"] is True
        assert res["target"] == 60
        assert res["breakdown"]["notification"] == 3
        assert res["total_km"] == 25
        assert mock_raw.called
        assert mock_staff.called

        # Verify cached with expected TTL
        cached_entry = cache.get("profile_patna_amit_kumar_2026-09")
        assert cached_entry is not None
        assert cached_entry["target"] == 60


@pytest.mark.asyncio
async def test_submit_report_scoped_profile_eviction_only():
    """
    Verify report submission evicts ONLY the submitting officer's profile cache,
    leaving other officers' warmed caches intact.
    """
    cache.clear()
    cache.set("profile_patna_amit_kumar_2026-09", {"stats": "cached_amit"})
    cache.set("profile_patna_rohit_kumar_2026-09", {"stats": "cached_rohit"})

    sub = DailyActivityReport(
        working_place="Patna",
        fo_name="Amit Kumar",
        pin="1234",
        date_of_reporting="2026-09-15",
        notification_ids=["10001"]
    )

    with patch("main.db") as mock_db, \
         patch("main.get_district_90day_notified_ids", new_callable=AsyncMock) as mock_notifs:
        mock_notifs.return_value = set()
        mock_doc = MagicMock()
        mock_doc.exists = False
        mock_db.collection.return_value.document.return_value.get.return_value = mock_doc
        mock_db.collection.return_value.document.return_value.set.return_value = None

        await submit_daily_report(sub)

        # Amit's cache should be evicted
        assert cache.get("profile_patna_amit_kumar_2026-09") is None
        # Rohit's cache MUST be preserved!
        assert cache.get("profile_patna_rohit_kumar_2026-09") is not None
        assert cache.get("profile_patna_rohit_kumar_2026-09") == {"stats": "cached_rohit"}


@pytest.mark.asyncio
async def test_registry_append_warmup_fallback_on_empty_cache():
    """
    Verify that if the notification registry cache is empty (e.g. after container restart),
    submit_daily_report warms it up via fetch_district_notification_registry before appending.
    """
    cache.clear()
    sub = DailyActivityReport(
        working_place="Gaya",
        fo_name="Rajesh Singh",
        pin="1234",
        date_of_reporting="2026-09-16",
        notification_ids=["20001"]
    )

    with patch("main.db") as mock_db, \
         patch("main.get_district_90day_notified_ids", new_callable=AsyncMock) as mock_notifs, \
         patch("main.fetch_district_notification_registry", new_callable=AsyncMock) as mock_fetch_reg:

        mock_notifs.return_value = set()
        mock_doc = MagicMock()
        mock_doc.exists = False
        mock_db.collection.return_value.document.return_value.get.return_value = mock_doc
        mock_db.collection.return_value.document.return_value.set.return_value = None
        mock_fetch_reg.return_value = {"status": "success", "registry": {}, "total_count": 0}

        await submit_daily_report(sub)

        # Warmup fallback must have been called
        assert mock_fetch_reg.called
        month_str = datetime.now().strftime("%Y-%m")
        reg_key = f"dist_notif_registry_gaya_{month_str}_3"
        cached_reg = cache.get(reg_key)
        assert cached_reg is not None
        assert "20001" in cached_reg["registry"]
