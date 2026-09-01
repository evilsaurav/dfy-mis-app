from main import app
from fastapi.testclient import TestClient

client = TestClient(app)
res = client.post("/admin/dashboard-data", json={"month_prefix": "2026-09"})
data = res.json()
records = data.get("records", [])

print(f"Total rawRecords returned: {len(records)}")
for r in records:
    if "prince" in r.get("fo_name", "").lower():
        print("Prince Kumar record found:")
        print(f"  date: {r.get('date')}")
        print(f"  fo_name: '{r.get('fo_name')}'")
        print(f"  working_place: '{r.get('working_place')}'")
        print(f"  notifications: {r.get('notifications')}")
        print(f"  notification_ids: {r.get('notification_ids')}")
