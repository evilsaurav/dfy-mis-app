import firebase_admin
from firebase_admin import credentials, firestore
import random

cred = credentials.Certificate("firebase_key.json")
if not firebase_admin._apps:
    firebase_admin.initialize_app(cred)
db = firestore.client()

# Teri master list
raw_data = {
    "Sheikhpura": [("Dhiraj Kumar", "FC"), ("Nilkamal Kumar", "FC")],
    "Nawada": [("Devraj Kumar", "FC"), ("Rajesh Kumar", "FC"), ("Rajiv kumar", "DC")],
    "Munger": [("Jayant Kumar", "FO"), ("Amit Kumar", "FC"), ("Saif Khan", "FO"), ("Sudhanshu Prasad", "FO"), ("Sumit Kr Singh", "FO"), ("Md. Raza Uddin", "FO"), ("Devrath Kumar", "SCT"), ("Shyam Kumar Gupta", "DC")],
    "Lakhisarai": [("Ankit Kumar", "FC"), ("Ram Prakash", "FC")],
    "Jehanabad": [("Shashi Ranjan", "FC"), ("Suraj Kumar", "FC"), ("Sammer Arya", "ADC")],
    "Jamui": [("Bablu Kumar", "FO"), ("Rajiv Kumar", "FO"), ("Rinki Kumari", "ADC"), ("Monu Kumar", "FC")]
}

print("Uploading to Firebase and generating PINs...\n")

for district, staff_list in raw_data.items():
    for name, desig in staff_list:
        pin = str(random.randint(1000, 9999)) # 4 digit random PIN
        
        # ID aisi banegi: jamui_surajkumar
        doc_id = f"{district}_{name}".replace(" ", "").lower()
        
        db.collection("staff_directory").document(doc_id).set({
            "name": name,
            "designation": desig,
            "district": district,
            "pin": pin
        })
        print(f"[{district}] {name} -> PIN: {pin}")

print("\nDone. Database set. In PINs ko screenshot leke rakh le.")