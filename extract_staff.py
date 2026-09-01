import firebase_admin
from firebase_admin import credentials, firestore
import csv
import json
import os

if not firebase_admin._apps:
    if os.path.exists("firebase_key.json"):
        cred = credentials.Certificate("firebase_key.json")
    else:
        # Check env var if local file missing
        firebase_creds_env = os.environ.get("FIREBASE_CREDENTIALS")
        if firebase_creds_env:
            cred_dict = json.loads(firebase_creds_env)
            cred = credentials.Certificate(cred_dict)
        else:
            print("Error: No firebase_key.json found.")
            exit(1)
            
    firebase_admin.initialize_app(cred)

db = firestore.client()

docs = db.collection("daily_field_reports").stream()

staff_data = set()
for doc in docs:
    data = doc.to_dict()
    district = data.get("working_place", "").strip()
    fo_name = data.get("fo_name", "").strip()
    if district and fo_name:
        fo_name = fo_name.title()
        staff_data.add((district, fo_name, "Field Officer"))

with open("staff_master.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["District", "Name", "Designation"])
    for row in sorted(staff_data):
        writer.writerow(row)

print(f"Extracted {len(staff_data)} unique staff records from Firestore.")
