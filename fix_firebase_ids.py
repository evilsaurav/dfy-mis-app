import firebase_admin
from firebase_admin import credentials, firestore
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

# Delete old random docs
docs = db.collection("staff_directory").stream()
old_data = []
for doc in docs:
    old_data.append(doc.to_dict())
    doc.reference.delete()

# Populate with custom IDs: "Jamui_Rajiv_Kumar"
count = 0
for data in old_data:
    dist = data.get("district", "")
    name = data.get("name", "")
    desig = data.get("designation", "")
    
    if dist and name:
        doc_id = f"{dist}_{name}".replace(" ", "_").replace(".", "")
        db.collection("staff_directory").document(doc_id).set({
            "name": name,
            "district": dist,
            "designation": desig
        })
        count += 1

print(f"Re-added {count} docs with custom IDs.")
