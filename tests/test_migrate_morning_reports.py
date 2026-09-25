# -*- coding: utf-8 -*-
"""
tests/test_migrate_morning_reports.py

Unit test suite verifying scripts/migrate_morning_reports.py:
1. Dynamic merging of any array ending with _ids or visited_names (e.g. sample_tested_ids, home_visit_ids).
2. Explicit scalar counter mapping via SCALAR_COUNTER_MAP (tests, notifications, doctor_visits, etc.).
3. Merging of fdc_details by id.
4. Metadata preservation when yesterday_data is None or empty.
5. Case- and whitespace-insensitive matching helper.
"""

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import pytest
from scripts.migrate_morning_reports import (
    merge_report_data,
    normalize_for_match,
    SCALAR_COUNTER_MAP,
    TARGET_YESTERDAY_DATE
)


def test_merge_report_data_dynamic_arrays_and_scalar_counters():
    yesterday = {
        "fo_name": "Shashi Ranjan",
        "working_place": "Patna",
        "date_of_reporting": TARGET_YESTERDAY_DATE,
        "notification_ids": ["N-101", "N-102"],
        "notifications": 2,
        "sample_tested_ids": ["T-101"],
        "tests": 1,
        "sample_collection_ids": ["SC-101"],
        "home_visit_ids": ["HV-101"],
        "follow_up_ids": ["FU-101"],
        "outcome_assigned_ids": ["OA-101"],
        "fdc_provided_ids": ["FDC-101"],
        "kit_consumption_ids": ["KC-101"],
        "differentiated_tb_ids": ["DTB-101"],
        "presumptive_ids": ["P-101"],
        "presumptive": 1,
        "hiv_dm_ids": ["H-101"],
        "hiv_dm": 1,
        "dbt_ids": ["D-101"],
        "dbt": 1,
        "contact_tracing_ids": ["CT-101"],
        "contact_tracing": 1,
        "visited_names": ["Dr. Sharma"],
        "doctor_visits": 1,
        "custom_metric_ids": ["CM-1"],
        "total_km": 15,
        "remark": "Field rounds in block A",
        "submission_count": 1
    }

    morning = {
        "fo_name": "Shashi Ranjan",
        "working_place": "Patna",
        "date_of_reporting": "2026-09-25",
        "notification_ids": ["N-102", "N-103", "N-104"],  # N-102 is dupe, N-103 & N-104 new
        "sample_tested_ids": ["T-101", "T-102", "T-103"], # T-101 dupe, T-102 & T-103 new
        "sample_collection_ids": ["SC-102"],
        "home_visit_ids": ["HV-101", "HV-102"],
        "follow_up_ids": ["FU-102"],
        "outcome_assigned_ids": ["OA-102"],
        "fdc_provided_ids": ["FDC-102"],
        "kit_consumption_ids": ["KC-102"],
        "differentiated_tb_ids": ["DTB-102"],
        "presumptive_ids": ["P-102"],
        "hiv_dm_ids": ["H-102"],
        "dbt_ids": ["D-102"],
        "contact_tracing_ids": ["CT-102"],
        "visited_names": ["Dr. Sharma", "Dr. Verma"],     # Dr. Sharma dupe
        "custom_metric_ids": ["CM-2"],
        "total_km": 28,
        "remark": "Morning sync follow-up",
        "duty_pin": "4421"
    }

    merged = merge_report_data(yesterday, morning, formatted_time="08:45 AM")

    # 1. Dynamic arrays merged without duplicates
    assert merged["notification_ids"] == ["N-101", "N-102", "N-103", "N-104"]
    assert merged["sample_tested_ids"] == ["T-101", "T-102", "T-103"]
    assert merged["sample_collection_ids"] == ["SC-101", "SC-102"]
    assert merged["home_visit_ids"] == ["HV-101", "HV-102"]
    assert merged["follow_up_ids"] == ["FU-101", "FU-102"]
    assert merged["outcome_assigned_ids"] == ["OA-101", "OA-102"]
    assert merged["fdc_provided_ids"] == ["FDC-101", "FDC-102"]
    assert merged["kit_consumption_ids"] == ["KC-101", "KC-102"]
    assert merged["differentiated_tb_ids"] == ["DTB-101", "DTB-102"]
    assert merged["presumptive_ids"] == ["P-101", "P-102"]
    assert merged["hiv_dm_ids"] == ["H-101", "H-102"]
    assert merged["dbt_ids"] == ["D-101", "D-102"]
    assert merged["contact_tracing_ids"] == ["CT-101", "CT-102"]
    assert merged["visited_names"] == ["Dr. Sharma", "Dr. Verma"]
    assert merged["custom_metric_ids"] == ["CM-1", "CM-2"]

    # 2. SCALAR_COUNTER_MAP accurate mapping
    assert merged["notifications"] == 4
    assert merged["tests"] == 3               # Must be 'tests', NOT 'test'!
    assert merged["presumptive"] == 2
    assert merged["hiv_dm"] == 2
    assert merged["dbt"] == 2
    assert merged["contact_tracing"] == 2
    assert merged["doctor_visits"] == 2        # From visited_names

    # 3. Travel KM and Remarks
    assert merged["total_km"] == 28.0
    assert "Morning Update: Morning sync follow-up" in merged["remark"]

    # 4. Next-day morning stamps
    assert merged["date_of_reporting"] == TARGET_YESTERDAY_DATE
    assert merged["is_next_day_submission"] is True
    assert merged["submitted_morning_time"] == "08:45 AM"
    assert merged["morning_submission_label"] == "Next day morning 08:45 AM"
    assert merged["submission_count"] == 2

    # 5. Metadata preserved from morning
    assert merged["duty_pin"] == "4421"


def test_merge_report_data_fdc_details():
    yesterday = {
        "fdc_details": [
            {"id": "PAT-1", "tablets": 4, "batch": "B1"},
            {"id": "PAT-2", "tablets": 3, "batch": "B2"}
        ]
    }
    morning = {
        "fdc_details": [
            {"id": "PAT-2", "tablets": 5, "batch": "B2-UPDATED"},
            {"id": "PAT-3", "tablets": 2, "batch": "B3"}
        ]
    }

    merged = merge_report_data(yesterday, morning, formatted_time="09:10 AM")
    fdc = merged["fdc_details"]
    assert len(fdc) == 3
    f_map = {item["id"]: item for item in fdc}
    assert f_map["PAT-1"]["tablets"] == 4
    assert f_map["PAT-2"]["tablets"] == 5
    assert f_map["PAT-2"]["batch"] == "B2-UPDATED"
    assert f_map["PAT-3"]["tablets"] == 2


def test_merge_report_data_when_yesterday_is_none():
    morning = {
        "fo_name": "Ram Prakash",
        "working_place": "Gaya",
        "date_of_reporting": "2026-09-25",
        "sample_tested_ids": ["T-201", "T-202"],
        "duty_pin": "9934",
        "device_uuid": "xyz-phone-123",
        "coordinates": {"lat": 24.79, "lng": 85.00}
    }

    merged = merge_report_data(None, morning, formatted_time="08:25 AM")

    # All morning metadata must be preserved
    assert merged["fo_name"] == "Ram Prakash"
    assert merged["working_place"] == "Gaya"
    assert merged["duty_pin"] == "9934"
    assert merged["device_uuid"] == "xyz-phone-123"
    assert merged["coordinates"] == {"lat": 24.79, "lng": 85.00}
    assert merged["tests"] == 2
    assert merged["date_of_reporting"] == TARGET_YESTERDAY_DATE
    assert merged["is_next_day_submission"] is True
    assert merged["submitted_morning_time"] == "08:25 AM"
    assert merged["morning_submission_label"] == "Next day morning 08:25 AM"
    assert merged["submission_count"] == 1


def test_normalize_for_match_case_and_whitespace():
    assert normalize_for_match("  Shashi   Ranjan  ") == "shashiranjan"
    assert normalize_for_match("shashi ranjan") == "shashiranjan"
    assert normalize_for_match("East Champaran") == "eastchamparan"
    assert normalize_for_match("East-Champaran_BI") == "eastchamparanbi"
    assert normalize_for_match(None) == ""
