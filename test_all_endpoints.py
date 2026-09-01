import os
import openpyxl
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

print("=== 1. Testing GET /staff-directory ===")
res = client.get("/staff-directory")
print("Status:", res.status_code)
if res.status_code == 200:
    data = res.json()
    print("Districts count:", len(data.get("data", {})))
else:
    print("Failed:", res.text)

print("\n=== 2. Testing POST /verify-pin ===")
# Test with a dummy / real FO if available
res = client.post("/verify-pin", json={"working_place": "Jamui", "fo_name": "Test User", "pin": "9999"})
print("Status:", res.status_code, "Response:", res.json())

print("\n=== 3. Testing POST /check-today-status ===")
res = client.post("/check-today-status", json={"working_place": "Jamui", "fo_name": "Test User", "date": "2026-09-01"})
print("Status:", res.status_code, "Response:", res.json())

print("\n=== 4. Testing GET /get-targets ===")
res = client.get("/get-targets")
print("Status:", res.status_code, "Response keys:", list(res.json().keys()) if res.status_code == 200 else res.text)

print("\n=== 5. Testing POST /admin/dashboard-data ===")
res = client.post("/admin/dashboard-data", json={"month_prefix": "2026-09"})
print("Status:", res.status_code, "Records count:", len(res.json().get("records", [])) if res.status_code == 200 else res.text)

print("\n=== 6. Testing KPI Workbook downloads for all districts ===")
districts = ["Aurangabad", "Bhojpur", "Buxar", "Jamui", "Jehanabad", "Kaimur", "Lakhisarai", "Munger", "Nawada", "Sheikhpura"]
for d in districts:
    res = client.get(f"/download-kpi-workbook?district={d}")
    print(f"District {d}: Status {res.status_code}, Length: {len(res.content)} bytes")
    if res.status_code != 200:
        print(f"ERROR on {d}: {res.text}")

print("\n=== ALL TESTS COMPLETED ===")
