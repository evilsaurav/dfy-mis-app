import pytest
import asyncio
from unittest.mock import MagicMock, patch
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import main

class MockDocRef:
    def __init__(self, doc_id, store):
        self.id = doc_id
        self.store = store

    def get(self):
        snap = MagicMock()
        if self.id in self.store:
            snap.exists = True
            snap.to_dict.return_value = dict(self.store[self.id])
        else:
            snap.exists = False
            snap.to_dict.return_value = {}
        return snap

    def set(self, data, merge=True):
        if merge and self.id in self.store:
            self.store[self.id].update(data)
        else:
            self.store[self.id] = dict(data)

class MockCollection:
    def __init__(self, store):
        self.store = store

    def document(self, doc_id):
        return MockDocRef(doc_id, self.store)

class MockDB:
    def __init__(self):
        self.reports = {}
        self.rollups = {}

    def collection(self, name):
        if name == "daily_field_reports":
            return MockCollection(self.reports)
        elif name == "daily_district_rollups":
            return MockCollection(self.rollups)
        return MockCollection({})

@pytest.mark.asyncio
async def test_same_day_incremental_submission_appends_and_preserves_km():
    mock_db = MockDB()
    original_db = main.db
    main.db = mock_db

    try:
        # Seed shared monthly cache to test in-memory upsert tracking
        month_prefix = "2026-09"
        main.cache.set(f"shared_raw_month_{month_prefix}", [])

        # 1. First submission (Morning): 2 notification IDs, morning_km = 12
        morning_report = main.DailyActivityReport(
            working_place="Muzaffarpur",
            fo_name="Raja Kumar",
            date_of_reporting="2026-09-22",
            pin="1234",
            notification_ids=["111111111", "222222222"],
            morning_km=12,
            morning_km_photo_url="https://photo.url/morning.jpg"
        )
        res1 = await main.submit_daily_report(morning_report)
        assert res1["message"] == "Daily report submitted successfully"

        doc_id = "muzaffarpur_raja_kumar_2026-09-22"
        assert doc_id in mock_db.reports
        saved = mock_db.reports[doc_id]
        assert saved["notification_ids"] == ["111111111", "222222222"]
        assert saved["morning_km"] == 12

        # Clear submission lock
        main.cache.delete(f"submitting_{doc_id}")

        # 2. Second submission (Afternoon): 1 new notification ID ("333333333"),
        #    1 overlapping ID ("111111111"), 1 DBT ID ("444444444"),
        #    morning_km is omitted (or 0), evening_km = 28
        afternoon_report = main.DailyActivityReport(
            working_place="Muzaffarpur",
            fo_name="Raja Kumar",
            date_of_reporting="2026-09-22",
            pin="1234",
            notification_ids=["111111111", "333333333"],
            dbt_ids=["444444444"],
            evening_km=28,
            evening_km_photo_url="https://photo.url/evening.jpg"
        )
        res2 = await main.submit_daily_report(afternoon_report)
        assert res2["message"] == "Daily report submitted successfully"

        # Verify merged document
        merged = mock_db.reports[doc_id]
        # Overlapping ID "111111111" must NOT duplicate!
        assert merged["notification_ids"] == ["111111111", "222222222", "333333333"]
        assert merged["dbt_ids"] == ["444444444"]
        # Morning KM must be preserved!
        assert merged["morning_km"] == 12
        assert merged["morning_km_photo_url"] == "https://photo.url/morning.jpg"
        # Evening KM must be recorded!
        assert merged["evening_km"] == 28

        # 3. Check cached report in memory
        month_prefix = "2026-09"
        cached_reports = main.cache.get(f"shared_raw_month_{month_prefix}")
        assert cached_reports is not None
        cached_doc = next(r for r in cached_reports if r["id"] == doc_id)
        assert cached_doc["notification_ids"] == ["111111111", "222222222", "333333333"]
        assert cached_doc["morning_km"] == 12
        assert cached_doc["evening_km"] == 28
    finally:
        main.db = original_db
