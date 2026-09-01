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

old_directory = {
    "Sheikhpura": [("Dhiraj Kumar", "FC"), ("Nilkamal Kumar", "FC")],
    "Nawada": [("Devraj Kumar", "FC"), ("Rajesh Kumar", "FC"), ("Rajiv Kumar", "FC")],
    "Munger": [("Jayant Kumar", "FC"), ("Amit Kumar", "FC"), ("Saif Khan", "FC"), ("Sudhanshu Prasad", "FC"), ("Sumit Kr Singh", "FC"), ("Md. Raza Uddin", "FC"), ("Devrath Kumar", "FC"), ("Shyam Kumar Gupta", "FC")],
    "Lakhisarai": [("Ankit Kumar", "FC"), ("Ram Prakash", "FC")],
    "Jehanabad": [("Shashi Ranjan", "FC"), ("Suraj Kumar", "FC"), ("Sammer Arya", "FC")],
    "Jamui": [("Bablu Kumar", "FC"), ("Rajiv Kumar", "FC"), ("Rinki Kumari", "FC"), ("Monu Kumar", "FC")]
}

new_staff = {
    "Kaimur": [
        ("Praphull Kumar", "FC"), ("Vinit Kumar", "FC"), ("Durgesh Kumar", "FC"), ("Raushan Kumar", "FC")
    ],
    "Buxar": [
        ("Mukul Kumar", "FC"), ("Nilesh Ranjan", "FC"), ("Raj Tiwari", "FC"), 
        ("Krishna Kumar", "FC"), ("Randhir Kumar", "FC"), ("Srishty Singh", "PCE"), ("Shailesh Kumar", "TC")
    ],
    "Bhojpur": [
        ("Naveen Kumar", "FC"), ("Surya Pratap", "FC"), ("Ram Prasad", "FC"), 
        ("Ashwani Kr Keshri", "FC"), ("Mukesh Tiwari", "FC"), ("Rahul Kumar", "SCT")
    ],
    "Aurangabad": [
        ("Prince Kumar", "FC"), ("Ram Ji Singh", "FC"), ("Rishu Kumar", "FC"), ("Rahul Kumar", "TC")
    ]
}

# Merge
all_staff = {**old_directory, **new_staff}

# Clear existing staff_directory (if any)
docs = db.collection("staff_directory").stream()
for doc in docs:
    doc.reference.delete()

# Populate
count = 0
for district, staff_list in all_staff.items():
    for name, desig in staff_list:
        doc_ref = db.collection("staff_directory").document()
        doc_ref.set({
            "name": name,
            "district": district,
            "designation": desig
        })
        count += 1

print(f"Successfully added {count} staff records to Firestore.")
