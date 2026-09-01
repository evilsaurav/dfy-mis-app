import firebase_admin
from firebase_admin import credentials, firestore
import os, json

if not firebase_admin._apps:
    if os.path.exists("firebase_key.json"):
        cred = credentials.Certificate("firebase_key.json")
    else:
        firebase_creds_env = os.environ.get("FIREBASE_CREDENTIALS")
        if firebase_creds_env:
            cred_dict = json.loads(firebase_creds_env)
            cred = credentials.Certificate(cred_dict)
            
    firebase_admin.initialize_app(cred)

db = firestore.client()

# Fetch latest reports to salvage PINs
docs = db.collection("daily_field_reports").order_by("date_of_reporting", direction=firestore.Query.DESCENDING).limit(100).stream()

recovered_pins = {}
for doc in docs:
    data = doc.to_dict()
    fo = data.get("fo_name", "")
    pin = data.get("pin", "")
    if fo and pin:
        recovered_pins[fo] = pin

print("Recovered PINs from reports:")
print(recovered_pins)

# Update staff_directory with custom IDs that match main.py expectation, and set PINs
staff_docs = list(db.collection("staff_directory").stream())
count = 0
for doc in staff_docs:
    data = doc.to_dict()
    name = data.get("name", "")
    dist = data.get("district", "")
    
    # Expected doc_id in main.py:
    expected_doc_id = f"{dist}_{name}".replace(" ", "").lower()
    
    # Default PIN is 1234, or use recovered
    pin = recovered_pins.get(name, "1234")
    
    # Save to the CORRECT doc_id
    db.collection("staff_directory").document(expected_doc_id).set({
        "name": name,
        "district": dist,
        "designation": data.get("designation", ""),
        "pin": pin
    })
    
    # Delete the old wrong doc_id if it's different
    if doc.id != expected_doc_id:
        doc.reference.delete()
        
    count += 1

print(f"Fixed {count} staff records with correct IDs and PINs.")
