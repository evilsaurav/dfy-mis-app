import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import pytest
from backend.routers.travel_allowance import (
    calculate_log_totals,
    normalize_days_to_list
)

def test_calculate_log_totals_when_total_km_is_zero_with_meter_readings():
    """
    Regression test:
    When a staff log has morning_km=45.0, evening_km=95.0, but total_km=0.0
    (as happens when a client sends uncomputed total_km in the day object),
    calculate_log_totals must calculate the delta (95 - 45 = 50.0 km)
    instead of collapsing gross to 0.0.
    """
    days = [
        {
            "day": 1,
            "morning_km": 45.0,
            "evening_km": 95.0,
            "total_km": 0.0,
            "is_manual_override": True
        }
    ]
    totals = calculate_log_totals(days, rate_per_km=4.0, deduction_amount=50.0)

    assert totals["total_km"] == 50.0
    assert totals["gross_amount"] == 200.0
    assert totals["deduction_amount"] == 50.0
    assert totals["final_payable_amount"] == 150.0


def test_normalize_days_to_list_computes_delta_when_total_km_zero():
    """
    Regression test:
    normalize_days_to_list must compute total_km from evening_km - morning_km
    when total_km is 0 or unprovided, so active_days and summary totals match the drilldown.
    """
    raw_days = [
        {
            "day": 1,
            "date": "2026-10-01",
            "morning_km": 45.0,
            "evening_km": 95.0,
            "total_km": 0.0,
            "is_manual_override": True
        }
    ]
    normalized = normalize_days_to_list(raw_days, month="2026-10")

    day_1 = next(d for d in normalized if d["day"] == 1)
    assert day_1["morning_km"] == 45.0
    assert day_1["evening_km"] == 95.0
    assert day_1["total_km"] == 50.0
