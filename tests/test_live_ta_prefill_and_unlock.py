import urllib.request
import json

BASE = "http://127.0.0.1:8000"

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.core.security import create_access_token

token = create_access_token({"role": "SUPER_ADMIN", "username": "admin", "allowed_districts": ["All"]})

# 2. Check Jehanabad roster for exactly 3 records and no duplicates
roster_req = urllib.request.Request(
    f"{BASE}/admin/ta/roster?month=2026-10&district=Jehanabad&force_refresh=true",
    headers={"Authorization": f"Bearer {token}"}
)
res_roster = json.loads(urllib.request.urlopen(roster_req).read().decode("utf-8"))
assert res_roster["status"] == "success", "Roster fetch failed"
roster = res_roster.get("roster") or res_roster.get("data", {}).get("roster", [])
print(f"Roster count: {len(roster)}")
for idx, r in enumerate(roster):
    print(f"  {idx+1}: doc_id={r.get('doc_id')}, staff_name={r.get('staff_name')}, staff_key={r.get('staff_key')}, status={r.get('status')}")
assert len(roster) == 3, f"Expected 3 officers for Jehanabad, got {len(roster)}"
staff_names = [r["staff_name"] for r in roster]
print(f"Officers in roster: {staff_names}")

# 3. Test Unlock endpoint for Jehanabad staff
unlock_req = urllib.request.Request(
    f"{BASE}/admin/ta/unlock-staff",
    data=json.dumps({
        "month": "2026-10",
        "district": "Jehanabad",
        "staff_key": "jehanabad_shashiranjan"
    }).encode("utf-8"),
    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
)
res_unlock = json.loads(urllib.request.urlopen(unlock_req).read().decode("utf-8"))
print(f"Unlock result: {res_unlock['message']}")
assert res_unlock["status"] == "success"

# 4. Test Pre-fill endpoint for Shashi Ranjan
prefill_req = urllib.request.Request(
    f"{BASE}/admin/ta/prefill",
    data=json.dumps({
        "month": "2026-10",
        "district": "Jehanabad",
        "staff_name": "Shashi Ranjan",
        "staff_key": "jehanabad_shashiranjan"
    }).encode("utf-8"),
    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
)
res_prefill = json.loads(urllib.request.urlopen(prefill_req).read().decode("utf-8"))
print(f"Prefill result status: {res_prefill['status']}")
assert res_prefill["status"] == "success"
assert "days" in res_prefill["data"]
assert len(res_prefill["data"]["days"]) == 31

# 5. Test FO daily report submission with morning & evening KM, then verify TA prefill picks it up
submit_req = urllib.request.Request(
    f"{BASE}/submit-daily-report",
    data=json.dumps({
        "working_place": "Jehanabad",
        "fo_name": "Suraj Kumar",
        "pin": "1234",
        "date_of_reporting": "2026-10-02",
        "morning_km": 15000,
        "evening_km": 15038,
        "visited_names": ["Sadikpur PHC"]
    }).encode("utf-8"),
    headers={"Content-Type": "application/json"}
)
res_submit = json.loads(urllib.request.urlopen(submit_req).read().decode("utf-8"))
print(f"Submit report result: {res_submit.get('message')}")

# Now call prefill for Suraj Kumar
prefill_suraj_req = urllib.request.Request(
    f"{BASE}/admin/ta/prefill",
    data=json.dumps({
        "month": "2026-10",
        "district": "Jehanabad",
        "staff_name": "Suraj Kumar",
        "staff_key": "jehanabad_surajkumar"
    }).encode("utf-8"),
    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
)
res_prefill_suraj = json.loads(urllib.request.urlopen(prefill_suraj_req).read().decode("utf-8"))
day2 = next(d for d in res_prefill_suraj["data"]["days"] if d["day"] == 2)
print(f"Day 2 prefilled: morning={day2['morning_km']}, evening={day2['evening_km']}, total={day2['total_km']}")
assert day2["morning_km"] == 15000.0, f"Expected 15000.0, got {day2['morning_km']}"
assert day2["evening_km"] == 15038.0, f"Expected 15038.0, got {day2['evening_km']}"
assert day2["total_km"] == 38.0, f"Expected 38.0, got {day2['total_km']}"

print("[OK] Live TA prefill and unlock verified successfully!")
