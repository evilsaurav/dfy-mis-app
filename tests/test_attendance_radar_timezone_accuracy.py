import pytest
from datetime import datetime, timezone, timedelta
from pathlib import Path
import sys

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from backend.core.helpers import (
    format_to_ist_time,
    parse_to_ist_datetime,
    IST_TIMEZONE,
)
from backend.routers.attendance import format_attendance_response


def test_format_to_ist_time_naive_space_separated_string():
    """Naive string from get_ist_now().strftime('%Y-%m-%d %H:%M:%S') must not add +5:30."""
    result = format_to_ist_time("2026-10-04 12:45:00")
    assert result == "12:45 PM", f"Expected '12:45 PM' but got '{result}' (bug: added 5:30?)"


def test_format_to_ist_time_naive_iso_string():
    """Naive ISO string without offset must be treated as IST."""
    result = format_to_ist_time("2026-10-04T12:45:00")
    assert result == "12:45 PM", f"Expected '12:45 PM' but got '{result}'"


def test_format_to_ist_time_naive_datetime():
    """Naive datetime generated in IST must be stamped with IST tzinfo."""
    dt_naive = datetime(2026, 10, 4, 12, 45, 0)
    result = format_to_ist_time(dt_naive)
    assert result == "12:45 PM", f"Expected '12:45 PM' but got '{result}'"


def test_format_to_ist_time_utc_iso_string():
    """UTC ISO string with 'Z' must be converted from UTC to IST (+5:30)."""
    result = format_to_ist_time("2026-10-04T07:15:00Z")
    assert result == "12:45 PM", f"Expected '12:45 PM' but got '{result}'"


def test_format_to_ist_time_utc_datetime_aware():
    """Timezone-aware UTC datetime must be converted to IST."""
    dt_utc = datetime(2026, 10, 4, 7, 15, 0, tzinfo=timezone.utc)
    result = format_to_ist_time(dt_utc)
    assert result == "12:45 PM", f"Expected '12:45 PM' but got '{result}'"


def test_format_to_ist_time_already_ist_offset_string():
    """String with explicit +05:30 offset."""
    result = format_to_ist_time("2026-10-04T12:45:00+05:30")
    assert result == "12:45 PM", f"Expected '12:45 PM' but got '{result}'"


def test_format_to_ist_time_preformatted_12hour_strings():
    """Pre-formatted 12-hour strings should be preserved."""
    assert format_to_ist_time("12:45 PM") == "12:45 PM"
    assert format_to_ist_time("12:45 pm") == "12:45 PM"
    assert format_to_ist_time("06:15 AM") == "06:15 AM"
    assert format_to_ist_time("8:30 AM") == "08:30 AM"


def test_format_to_ist_time_empty_and_none():
    assert format_to_ist_time("") == ""
    assert format_to_ist_time(None) == ""


def test_parse_to_ist_datetime_accuracy():
    """Verify parse_to_ist_datetime returns timezone-aware IST datetimes."""
    dt1 = parse_to_ist_datetime("2026-10-04 12:45:00")
    assert dt1 is not None
    assert dt1.hour == 12
    assert dt1.minute == 45
    assert dt1.tzinfo == IST_TIMEZONE

    dt2 = parse_to_ist_datetime("2026-10-04T07:15:00Z")
    assert dt2 is not None
    assert dt2.hour == 12
    assert dt2.minute == 45
    assert dt2.tzinfo == IST_TIMEZONE

    dt3 = parse_to_ist_datetime(datetime(2026, 10, 4, 12, 45, 0))
    assert dt3 is not None
    assert dt3.hour == 12
    assert dt3.minute == 45
    assert dt3.tzinfo == IST_TIMEZONE


def test_format_attendance_response_radar_accuracy():
    """Verify attendance radar formats submitted_time and timestamp_raw in IST without double-offset."""
    staff_list = [
        {"district": "Muzaffarpur", "fo_name": "Raja Kumar", "designation": "Field Officer"}
    ]
    candidate_docs = [
        {
            "working_place": "Muzaffarpur",
            "fo_name": "Raja Kumar",
            "date_of_reporting": "2026-10-04",
            "timestamp_completed": "2026-10-04 12:45:00",
            "status": "completed",
            "notifications": 3,
            "sample_tested": 2,
            "total_km": 15,
        }
    ]

    res = format_attendance_response(
        staff_list=staff_list,
        all_candidate_docs=candidate_docs,
        leave_docs=[],
        target_date="2026-10-04",
        next_date="2026-10-05",
    )

    submitted = res["submitted_fos"]
    assert len(submitted) == 1
    fo = submitted[0]
    assert fo["fo_name"] == "Raja Kumar"
    assert fo["submitted_time"] == "12:45 PM"
    assert fo["timestamp_raw"] == "2026-10-04T12:45:00+05:30"
    assert fo["time_classification"] == "Mid-Day (< 5 PM)"
