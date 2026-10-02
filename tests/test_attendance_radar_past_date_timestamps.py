import pytest
from datetime import datetime, timezone, timedelta
from main import format_dashboard_record, format_to_ist_time

def test_format_dashboard_record_includes_timestamps_and_total_ids():
    """Verify format_dashboard_record includes timestamp_completed, submitted_time, and accurate total_ids."""
    sample_doc = {
        "id": "aurangabad_prince_kumar_2026-09-25",
        "doc_id": "aurangabad_prince_kumar_2026-09-25",
        "working_place": "Aurangabad",
        "fo_name": "Prince Kumar",
        "date_of_reporting": "2026-09-25",
        "timestamp_completed": datetime(2026, 9, 25, 12, 6, 24, 955000, tzinfo=timezone.utc),
        "notification_ids": ["N1"],
        "sample_tested_ids": ["T1"],
        "hiv_dm_ids": ["H1"],
        "dbt_ids": ["D1"],
        "differentiated_tb_ids": ["DF1"],
        "tpt_treatment_start_ids": ["TP1", "TP2", "TP3", "TP4"],
        "sample_collection_ids": ["SC1"],
        "contact_tracing_ids": ["CT1"],
        "face_to_face_ids": ["FF1"],
        "documents_ids": ["DOC1"],
        "visited_names": ["Dr. Test"] * 10,
        "is_next_day_submission": False,
        "submitted_morning_time": ""
    }

    record = format_dashboard_record(sample_doc)
    assert record is not None
    assert "timestamp_completed" in record, "timestamp_completed must be included in formatted dashboard record"
    assert "submitted_time" in record, "submitted_time must be included in formatted dashboard record"
    assert record["submitted_time"] == "05:36 PM", f"Expected '05:36 PM', got {record['submitted_time']}"
    assert "total_ids" in record, "total_ids must be computed in format_dashboard_record"
    # Total IDs = 1 (notif) + 1 (test) + 1 (hiv) + 1 (dbt) + 1 (diff) + 4 (tpt) + 1 (sample) + 1 (contact) + 1 (face) + 1 (doc) = 13
    assert record["total_ids"] == 13, f"Expected 13 total IDs, got {record['total_ids']}"
    assert record["is_next_day_submission"] is False


def test_format_dashboard_record_preserves_raw_ids_and_cohort_arrays():
    """Verify format_dashboard_record preserves raw ID lists and visited_names for FO inspection and cohort engine."""
    sample_doc = {
        "id": "patna_test_fo_2026-10-01",
        "working_place": "Patna",
        "fo_name": "Test Officer",
        "date_of_reporting": "2026-10-01",
        "notification_ids": ["N-101", "N-102"],
        "sample_tested_ids": ["T-101"],
        "hiv_dm_ids": ["H-101"],
        "dbt_ids": ["D-101", "D-102"],
        "home_visit_ids": ["HV-101"],
        "contact_tracing_ids": ["CT-101"],
        "follow_up_ids": ["FU-101"],
        "documents_ids": ["DOC-101"],
        "differentiated_tb_ids": ["DF-101"],
        "visited_names": ["Dr. Sharma Clinic", "City Pharmacy"],
        "is_override_used": True
    }

    record = format_dashboard_record(sample_doc)
    assert record is not None
    assert record["notification_ids"] == ["N-101", "N-102"]
    assert record["sample_tested_ids"] == ["T-101"]
    assert record["hiv_dm_ids"] == ["H-101"]
    assert record["dbt_ids"] == ["D-101", "D-102"]
    assert record["home_visit_ids"] == ["HV-101"]
    assert record["contact_tracing_ids"] == ["CT-101"]
    assert record["follow_up_ids"] == ["FU-101"]
    assert record["documents_ids"] == ["DOC-101"]
    assert record["differentiated_tb_ids"] == ["DF-101"]
    assert record["visited_names"] == ["Dr. Sharma Clinic", "City Pharmacy"]
    assert record["home_visits"] == 1
    assert record["follow_ups"] == 1
    assert record["is_override"] is True

