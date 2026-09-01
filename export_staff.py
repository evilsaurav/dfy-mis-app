import firebase_admin
from firebase_admin import credentials, firestore
import csv
import json
import os

if not firebase_admin._apps:
    if os.path.exists("firebase_key.json"):
        cred = credentials.Certificate("firebase_key.json")
    else:
        firebase_creds_env = os.environ.get("FIREBASE_CREDENTIALS")
        if firebase_creds_env:
            cred_dict = json.loads(firebase_creds_env)
            cred = credentials.Certificate(cred_dict)
        else:
            print("Error: No firebase_key.json found.")
            exit(1)
            
    firebase_admin.initialize_app(cred)

db = firestore.client()

docs = db.collection("staff_directory").stream()

staff_data = []
for doc in docs:
    data = doc.to_dict()
    district = data.get("district", "").strip()
    name = data.get("name", "").strip()
    desig = data.get("designation", "FC").strip()
    if district and name:
        staff_data.append((district, name, desig))

with open("staff_master.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["District", "Name", "Designation"])
    for row in sorted(staff_data):
        writer.writerow(row)

print(f"Exported {len(staff_data)} staff records to staff_master.csv.")
