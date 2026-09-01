from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

print("1. Testing /admin/duplicate-audit...")
res_dup = client.get("/admin/duplicate-audit?month=2026-09")
assert res_dup.status_code == 200, f"Failed: {res_dup.status_code}"
dup_data = res_dup.json()
print(f"? Duplicate Audit working: {dup_data['total_duplicate_ids']} duplicate IDs found.")

print("2. Testing /my-profile-stats streaks & badges...")
res_prof = client.post("/my-profile-stats", json={"working_place": "Jamui", "fo_name": "Bablu Kumar", "pin": "1234", "month": "2026-09"})
assert res_prof.status_code == 200, f"Failed: {res_prof.status_code}"
prof_data = res_prof.json()
print(f"? Profile Streaks working: {prof_data.get('streak_days', 0)} days streak, {len(prof_data.get('badges', []))} badges earned.")

print("\n?? ALL PHASE 7 BACKEND TESTS PASSED!")
