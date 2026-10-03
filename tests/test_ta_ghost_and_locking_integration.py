import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pytest
import asyncio
from backend.routers.travel_allowance import (
    get_district_ta_roster,
    submit_district_ta_roster,
    unlock_staff_record,
    save_travel_allowance_log,
    TaSubmitRosterReq,
    TaUnlockStaffReq,
    TaLogSaveReq
)
from fastapi import HTTPException

@pytest.mark.asyncio
async def test_sammer_arya_ghost_data_and_locking_workflow():
    admin_user = {"username": "superadmin", "role": "SUPER_ADMIN", "name": "Super Admin"}
    subadmin_user = {"username": "jehanabad_sub", "role": "SUB_ADMIN", "allowed_districts": ["Jehanabad"], "name": "Jehanabad Subadmin"}
    incharge_user = {"username": "main_incharge", "role": "MAIN_INCHARGE", "name": "Main Incharge"}

    # 1. Inspect Roster for Jehanabad 2026-10
    roster_res = await get_district_ta_roster(month="2026-10", district="Jehanabad", force_refresh=True, current_user=admin_user)
    assert roster_res["status"] == "success"
    roster = roster_res["roster"]
    assert len(roster) >= 3

    sammer = next((s for s in roster if "sammer" in str(s.get("staff_name", "")).lower() or "sammer" in str(s.get("staff_key", "")).lower()), None)
    assert sammer is not None, "Sammer Arya should exist in Jehanabad roster"

    # Verify no phantom numbers: total_km matches daily logs
    assert sammer.get("total_km") == 304.0
    assert sammer.get("gross_amount") == 1216.0
    assert sammer.get("active_days") == 6

    # Verify days is a list of 31 dicts
    days = sammer.get("days")
    assert isinstance(days, list)
    assert len(days) == 31
    active_days = [d for d in days if float(d.get("total_km") or 0) > 0]
    assert len(active_days) == 6
    assert active_days[0]["total_km"] == 24.0
    assert active_days[5]["total_km"] == 100.0

    # 2. Test Submission & Locking
    sub_res = submit_district_ta_roster(
        TaSubmitRosterReq(month="2026-10", district="Jehanabad", staff_keys=[sammer["staff_key"]]),
        current_user=subadmin_user
    )
    assert sub_res["status"] == "success"

    roster_res2 = await get_district_ta_roster(month="2026-10", district="Jehanabad", force_refresh=True, current_user=admin_user)
    sammer2 = next((s for s in roster_res2["roster"] if "sammer" in str(s.get("staff_name", "")).lower()), None)
    assert sammer2["status"] == "SUBMITTED"
    assert sammer2["is_locked"] is True

    # Sub-admin edit blocked while SUBMITTED/locked
    with pytest.raises(HTTPException) as exc_info:
        save_travel_allowance_log(TaLogSaveReq(
            month="2026-10",
            district="Jehanabad",
            staff_name=sammer2["staff_name"],
            staff_key=sammer2["staff_key"],
            days=sammer2["days"]
        ), current_user=subadmin_user)
    assert exc_info.value.status_code in (403, 423)

    # 3. Incharge Unlocks record
    unlock_res = unlock_staff_record(
        TaUnlockStaffReq(month="2026-10", district="Jehanabad", staff_key=sammer2["staff_key"]),
        current_user=incharge_user
    )
    assert unlock_res["status"] == "success"

    roster_res3 = await get_district_ta_roster(month="2026-10", district="Jehanabad", force_refresh=True, current_user=admin_user)
    sammer3 = next((s for s in roster_res3["roster"] if "sammer" in str(s.get("staff_name", "")).lower()), None)
    assert sammer3["status"] == "REVERTED"
    assert sammer3["is_locked"] is False
