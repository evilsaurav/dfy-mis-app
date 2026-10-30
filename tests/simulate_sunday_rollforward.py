import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.abspath('.'))

print("=" * 70)
print("[SIMULATION] DFY MIS - END-TO-END SUNDAY ROLL-FORWARD SIMULATION TEST")
print("Scenario: October 31 (Sat) -> November 1 (Sun) -> November 2 (Mon)")
print("=" * 70)

# Import backend helpers
from backend.core.helpers import get_active_operational_month, get_reporting_cutoff_hour

simulation_timeline = [
    # (Label, datetime, expected_month, expected_cutoff, expected_is_grace)
    (
        "1. Today (Oct 30, Friday 23:00 IST)",
        datetime(2026, 10, 30, 23, 0),
        "2026-10",
        11,
        False
    ),
    (
        "2. Month-End Last Minute (Oct 31, Saturday 23:59 IST)",
        datetime(2026, 10, 31, 23, 59),
        "2026-10",
        11,
        False
    ),
    (
        "3. Sunday Morning (Nov 1, Sunday 08:30 AM IST)",
        datetime(2026, 11, 1, 8, 30),
        "2026-10",
        12,
        True
    ),
    (
        "4. Sunday Afternoon (Nov 1, Sunday 15:00 IST)",
        datetime(2026, 11, 1, 15, 0),
        "2026-10",
        12,
        True
    ),
    (
        "5. Sunday Midnight (Nov 1, Sunday 23:45 IST)",
        datetime(2026, 11, 1, 23, 45),
        "2026-10",
        12,
        True
    ),
    (
        "6. Monday Morning Field Duty (Nov 2, Monday 09:15 AM IST)",
        datetime(2026, 11, 2, 9, 15),
        "2026-10",
        12,
        True
    ),
    (
        "7. Monday 11:30 AM (Between normal 11 AM and extended 12 PM cutoff)",
        datetime(2026, 11, 2, 11, 30),
        "2026-10",
        12,
        True
    ),
    (
        "8. Monday 11:59 AM (Last minute before grace closes)",
        datetime(2026, 11, 2, 11, 59),
        "2026-10",
        12,
        True
    ),
    (
        "9. Monday 12:00 PM Noon (Official handover to November)",
        datetime(2026, 11, 2, 12, 0),
        "2026-11",
        12,
        False
    ),
    (
        "10. Monday Afternoon (Nov 2, Monday 14:00 IST)",
        datetime(2026, 11, 2, 14, 0),
        "2026-11",
        12,
        False
    ),
    (
        "11. Tuesday Standard Duty (Nov 3, Tuesday 10:00 AM IST)",
        datetime(2026, 11, 3, 10, 0),
        "2026-11",
        11,
        False
    )
]

all_passed = True

for label, dt, exp_month, exp_cutoff, exp_grace in simulation_timeline:
    actual_month = get_active_operational_month(dt)
    actual_cutoff = get_reporting_cutoff_hour(dt)
    is_grace = (actual_month == "2026-10" and dt.month == 11)
    
    month_ok = (actual_month == exp_month)
    cutoff_ok = (actual_cutoff == exp_cutoff)
    grace_ok = (is_grace == exp_grace)

    status = "[PASS]" if (month_ok and cutoff_ok and grace_ok) else "[FAIL]"
    if not (month_ok and cutoff_ok and grace_ok):
        all_passed = False

    print(f"\n{label}")
    print(f"   Timestamp      : {dt.strftime('%A, %d %b %Y %I:%M %p')}")
    print(f"   Active Month   : {actual_month} (Expected: {exp_month}) -> {'[OK]' if month_ok else '[FAIL]'}")
    print(f"   Cutoff Hour    : {actual_cutoff}:00 (Expected: {exp_cutoff}:00) -> {'[OK]' if cutoff_ok else '[FAIL]'}")
    print(f"   Grace Period   : {'ACTIVE (Oct counts)' if is_grace else 'INACTIVE (Nov counts)'} -> {'[OK]' if grace_ok else '[FAIL]'}")
    print(f"   Status         : {status}")

print("\n" + "=" * 70)
if all_passed:
    print("[SUCCESS] SIMULATION RESULT: 100% PERFECT! ALL 11 TIMELINE PHASES PASSED.")
    print("   - Sunday (Nov 1) is 100% protected all day as October grace period.")
    print("   - Monday morning (Nov 2) until 12:00 PM is 100% protected as October grace period.")
    print("   - Reporting cutoff successfully extends to 12:00 PM Noon on both Sunday & Monday.")
    print("   - At 12:00 PM Monday, it seamlessly rolls over to November.")
else:
    print("[ERROR] SIMULATION FAILED - Errors detected above.")
print("=" * 70)
