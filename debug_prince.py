from main import db
import json

docs = db.collection("daily_field_reports").where("fo_name", "==", "Prince Kumar").stream()

reports = []
for doc in docs:
    data = doc.to_dict()
    reports.append({
        "id": doc.id,
        "date_of_reporting": data.get("date_of_reporting"),
        "date": data.get("date"),
        "working_place": data.get("working_place"),
        "fo_name": data.get("fo_name"),
        "notification_ids": data.get("notification_ids"),
        "notification_id": data.get("notification_id"),
        "notifications": data.get("notifications"),
        "all_keys": list(data.keys())
    })

print(f"Found {len(reports)} reports for Prince Kumar:")
print(json.dumps(reports, indent=2))
