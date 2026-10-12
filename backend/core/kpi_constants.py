# -*- coding: utf-8 -*-
"""
backend/core/kpi_constants.py
Core shared constants and ordinal tab naming helpers for District KPI workbooks.
Extracted from backend/routers/kpi.py to eliminate circular imports with kpi_template_builder.
"""

import re

# 17 Standard KPI Categories Definition (Exact Master Blueprint)
EXCEL_KPI_CATEGORIES = [
    ("NOTIFICATION", "notification_ids", 3),
    ("HIV & DM", "hiv_dm_ids", 4),
    ("DBT", "dbt_ids", 5),
    ("SAMPLE COLLECTION", "sample_collection_ids", 6),
    ("SAMPLE TESTED", "sample_tested_ids", 7),
    ("Outcome Assigned", "outcome_assigned_ids", 8),
    ("Home Visit", "home_visit_ids", 9),
    ("Contact Tracing", "contact_tracing_ids", 10),
    ("Follow Up", "follow_up_ids", 11),
    ("Face to Face", "face_to_face_ids", 12),
    ("Presumptive", "presumptive_ids", 13),
    ("Documents", "documents_ids", 14),
    ("FDC Provided", "fdc_provided_ids", 15),
    ("Kit Consumption", "kit_consumption_ids", 16),
    ("DIFF TB", "differentiated_tb_ids", 17),
    ("TPT START", "tpt_treatment_start_ids", 18),
    ("TPT PRESUMTIVE", "tpt_presumptive_ids", 19)
]


def get_kpi_tab_name(day: int) -> str:
    if day == 1:
        return "1ST"
    elif day == 2:
        return "2nd"
    elif day == 3:
        return "3rd"
    elif day in [21, 31]:
        return f"{day}st"
    elif day == 22:
        return "22nd"
    elif day == 23:
        return "23rd"
    else:
        return f"{day}th"


def normalize_staff_name(name: str) -> str:
    """
    Normalizes a staff name by collapsing whitespace and lowercasing.
    Single shared source of truth across all KPI workbook generation and matching.
    """
    return re.sub(r'\s+', ' ', str(name)).strip().lower()
