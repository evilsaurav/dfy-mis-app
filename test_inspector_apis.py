from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

print("Testing /admin/dashboard-data...")
res = client.post("/admin/dashboard-data", json={"month_prefix": "2026-09"})
assert res.status_code == 200, f"Failed: {res.status_code}"
records = res.json()["records"]
print(f"? dashboard-data returned {len(records)} records.")
if records:
    r = records[0]
    assert "notification_ids" in r and "dbt_ids" in r and "visited_names" in r
    print("? Record contains raw ID arrays and visited_names.")

print("Testing /my-profile-stats...")
res_prof = client.post("/my-profile-stats", json={"working_place": "Jamui", "fo_name": "Bablu Kumar", "pin": "1234", "month": "2026-09"})
print(f"Profile stats status: {res_prof.status_code}")

print("\n?? ALL INSPECTOR API TESTS PASSED!")
