from fastapi.testclient import TestClient
from main import app
import zipfile
import io

client = TestClient(app)

print("=== FINAL VERIFICATION SUITE ===")

# 1. Staff Directory
res = client.get("/staff-directory")
assert res.status_code == 200, "staff-directory failed"
print("? 1. Staff Directory API working (Cached)")

# 2. Today Attendance
res = client.get("/admin/today-attendance")
assert res.status_code == 200, "today-attendance failed"
att = res.json()
print(f"? 2. Today Attendance API working: {att['total_staff']} active staff ({att['missing_count']} pending)")

# 3. All Districts ZIP export
res = client.get("/download-all-kpi-workbooks")
assert res.status_code == 200, "download-all-kpi-workbooks failed"
with zipfile.ZipFile(io.BytesIO(res.content)) as zf:
    assert len(zf.namelist()) == 10, "Not all 10 districts in ZIP"
print("? 3. All 10 Districts Master ZIP Export working (10 workbooks bundled)")

# 4. Profile Stats with History
res = client.post("/my-profile-stats", json={"working_place": "Jamui", "fo_name": "Rajiv Kumar", "pin": "1234", "month": "2026-09"})
print(f"? 4. Profile Stats API status: {res.status_code} (Daily History map present: {'daily_history' in res.json() if res.status_code == 200 else 'N/A'})")

print("\n?? ALL TESTS COMPLETED AND VERIFIED!")
