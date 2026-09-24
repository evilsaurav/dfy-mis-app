import pytest
import asyncio
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch
from pathlib import Path
import sys

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

@pytest.fixture(autouse=True)
def clean_cache():
    main.cache.clear()
    yield
    main.cache.clear()

@pytest.mark.asyncio
async def test_resolve_effective_reporting_date_before_10am_missing_yesterday():
    mock_db = MockDB()
    original_db = main.db
    main.db = mock_db
    try:
        mock_now = datetime(2026, 9, 25, 8, 30, tzinfo=main.IST_TIMEZONE)
        with patch("main.get_ist_now", return_value=mock_now):
            # Yesterday doc muzaffarpur_raja_kumar_2026-09-24 does NOT exist
            resolved = await main.resolve_effective_reporting_date(
                fo_name="Raja Kumar",
                working_place="Muzaffarpur",
                requested_date="2026-09-25"
            )
            assert resolved == "2026-09-24"
    finally:
        main.db = original_db

@pytest.mark.asyncio
async def test_resolve_effective_reporting_date_before_10am_existing_yesterday():
    mock_db = MockDB()
    original_db = main.db
    main.db = mock_db
    try:
        # Yesterday doc exists
        mock_db.reports["muzaffarpur_raja_kumar_2026-09-24"] = {
            "fo_name": "Raja Kumar",
            "working_place": "Muzaffarpur",
            "date_of_reporting": "2026-09-24",
            "status": "completed"
        }
        mock_now = datetime(2026, 9, 25, 8, 30, tzinfo=main.IST_TIMEZONE)
        with patch("main.get_ist_now", return_value=mock_now):
            resolved = await main.resolve_effective_reporting_date(
                fo_name="Raja Kumar",
                working_place="Muzaffarpur",
                requested_date="2026-09-25"
            )
            assert resolved == "2026-09-25"
    finally:
        main.db = original_db

@pytest.mark.asyncio
async def test_resolve_effective_reporting_date_after_10am():
    mock_db = MockDB()
    original_db = main.db
    main.db = mock_db
    try:
        # Yesterday doc does NOT exist, but time is 10:15 AM
        mock_now = datetime(2026, 9, 25, 10, 15, tzinfo=main.IST_TIMEZONE)
        with patch("main.get_ist_now", return_value=mock_now):
            resolved = await main.resolve_effective_reporting_date(
                fo_name="Raja Kumar",
                working_place="Muzaffarpur",
                requested_date="2026-09-25"
            )
            assert resolved == "2026-09-25"
    finally:
        main.db = original_db

@pytest.mark.asyncio
async def test_resolve_effective_reporting_date_respects_explicit_historical_date():
    mock_db = MockDB()
    original_db = main.db
    main.db = mock_db
    try:
        # Even before 10 AM, historical date (e.g. 5 days ago) is preserved
        mock_now = datetime(2026, 9, 25, 8, 30, tzinfo=main.IST_TIMEZONE)
        with patch("main.get_ist_now", return_value=mock_now):
            resolved = await main.resolve_effective_reporting_date(
                fo_name="Raja Kumar",
                working_place="Muzaffarpur",
                requested_date="2026-09-20"
            )
            assert resolved == "2026-09-20"
    finally:
        main.db = original_db

@pytest.mark.asyncio
async def test_submit_daily_report_stealth_cutoff_integration():
    mock_db = MockDB()
    original_db = main.db
    main.db = mock_db
    try:
        # 8:30 AM, yesterday missing, report submitted with date_of_reporting="2026-09-25"
        mock_now = datetime(2026, 9, 25, 8, 30, tzinfo=main.IST_TIMEZONE)
        with patch("main.get_ist_now", return_value=mock_now):
            report = main.DailyActivityReport(
                working_place="Muzaffarpur",
                fo_name="Raja Kumar",
                date_of_reporting="2026-09-25",
                pin="1234",
                notification_ids=["999888777"],
                morning_km=15
            )
            res = await main.submit_daily_report(report)
            assert res["message"] == "Daily report submitted successfully"

            # Should be mapped to yesterday (2026-09-24)
            yesterday_doc_id = "muzaffarpur_raja_kumar_2026-09-24"
            assert yesterday_doc_id in mock_db.reports
            assert "muzaffarpur_raja_kumar_2026-09-25" not in mock_db.reports
            saved = mock_db.reports[yesterday_doc_id]
            assert saved["date_of_reporting"] == "2026-09-24"
            assert saved["notification_ids"] == ["999888777"]

            # Rollup should also be mapped to yesterday
            rollup_id = "2026-09-24_muzaffarpur"
            assert rollup_id in mock_db.rollups
    finally:
        main.db = original_db

@pytest.mark.asyncio
async def test_check_today_status_before_10am_yesterday_submitted_today():
    mock_db = MockDB()
    original_db = main.db
    main.db = mock_db
    try:
        # Yesterday doc exists, but its timestamp_completed indicates it was submitted TODAY at 8:30 AM
        mock_db.reports["muzaffarpur_raja_kumar_2026-09-24"] = {
            "fo_name": "Raja Kumar",
            "working_place": "Muzaffarpur",
            "date_of_reporting": "2026-09-24",
            "status": "completed",
            "timestamp_completed": "2026-09-25 08:30:00",
            "submission_count": 1
        }
        mock_now = datetime(2026, 9, 25, 8, 35, tzinfo=main.IST_TIMEZONE)
        with patch("main.get_ist_now", return_value=mock_now):
            req = main.CheckStatusRequest(
                working_place="Muzaffarpur",
                fo_name="Raja Kumar",
                date="2026-09-25"
            )
            status_res = await main.check_today_status(req)
            assert status_res["status"] == "completed"
            assert status_res["submission_count"] == 1
            assert status_res["data"]["date_of_reporting"] == "2026-09-24"
    finally:
        main.db = original_db

@pytest.mark.asyncio
async def test_check_today_status_before_10am_yesterday_submitted_yesterday():
    mock_db = MockDB()
    original_db = main.db
    main.db = mock_db
    try:
        # Yesterday doc exists, and its timestamp_completed was YESTERDAY
        mock_db.reports["muzaffarpur_raja_kumar_2026-09-24"] = {
            "fo_name": "Raja Kumar",
            "working_place": "Muzaffarpur",
            "date_of_reporting": "2026-09-24",
            "status": "completed",
            "timestamp_completed": "2026-09-24 18:30:00",
            "submission_count": 1
        }
        mock_now = datetime(2026, 9, 25, 8, 35, tzinfo=main.IST_TIMEZONE)
        with patch("main.get_ist_now", return_value=mock_now):
            req = main.CheckStatusRequest(
                working_place="Muzaffarpur",
                fo_name="Raja Kumar",
                date="2026-09-25"
            )
            status_res = await main.check_today_status(req)
            # Since yesterday was submitted yesterday, today is genuinely not started
            assert status_res["status"] == "not_started"
    finally:
        main.db = original_db
