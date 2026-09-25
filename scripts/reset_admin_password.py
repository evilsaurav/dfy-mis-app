"""
CLI Tool to safely reset any Admin / Super Admin password directly in Firestore.

Usage:
    python scripts/reset_admin_password.py <username> <new_password>

Example:
    python scripts/reset_admin_password.py admin MyNewSecretPassword2026
"""

import sys
import os
import json
import bcrypt
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime

def hash_password(plain: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(str(plain).encode('utf-8'), salt).decode('utf-8')

def init_firestore():
    if not firebase_admin._apps:
        firebase_creds_env = os.environ.get("FIREBASE_CREDENTIALS")
        if firebase_creds_env:
            cred_dict = json.loads(firebase_creds_env)
            cred = credentials.Certificate(cred_dict)
            project_id = cred_dict.get("project_id", "dfy-reporting-mis-18b9a")
        else:
            cred = credentials.Certificate("firebase_key.json")
            try:
                with open("firebase_key.json", "r", encoding="utf-8") as f:
                    project_id = json.load(f).get("project_id", "dfy-reporting-mis-18b9a")
            except Exception:
                project_id = "dfy-reporting-mis-18b9a"

        firebase_admin.initialize_app(cred, {
            'storageBucket': f'{project_id}.appspot.com'
        })
    
    db_id = os.environ.get("FIRESTORE_DATABASE_ID")
    if db_id:
        return firestore.client(database_id=db_id)
    return firestore.client()

def main():
    if len(sys.argv) < 3:
        print("Usage: python scripts/reset_admin_password.py <username> <new_password>")
        sys.exit(1)

    username = sys.argv[1].strip().lower()
    new_password = sys.argv[2].strip()

    if len(new_password) < 6:
        print("Error: Password must be at least 6 characters long.")
        sys.exit(1)

    db = init_firestore()
    hashed = hash_password(new_password)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Update in admin_users collection
    user_ref = db.collection("admin_users").document(username)
    user_doc = user_ref.get()

    if user_doc.exists:
        user_ref.update({
            "password": hashed,
            "last_password_change": now_str
        })
        print(f"✓ Successfully updated password for user '{username}' in 'admin_users' collection.")
    else:
        # Fallback check by username field
        query = list(db.collection("admin_users").where("username", "==", username).stream())
        if query:
            query[0].reference.update({
                "password": hashed,
                "last_password_change": now_str
            })
            print(f"✓ Successfully updated password for user '{username}' (doc ID: {query[0].id}) in 'admin_users'.")
        else:
            print(f"Notice: User '{username}' not found in 'admin_users'. Creating new document...")
            user_ref.set({
                "user_id": username,
                "username": username,
                "name": "Super Admin" if username == "admin" else username.title(),
                "password": hashed,
                "role": "SUPER_ADMIN" if username == "admin" else "SUB_ADMIN",
                "allowed_districts": ["All"] if username == "admin" else [],
                "status": "ACTIVE",
                "created_at": now_str,
                "last_password_change": now_str
            })
            print(f"✓ Created user '{username}' with new password.")

    # If updating root admin, also update admin_config/auth_settings
    if username in ["admin", "superadmin", "dfyadmin"]:
        cfg_ref = db.collection("admin_config").document("auth_settings")
        cfg_ref.set({
            "password": hashed,
            "last_updated": now_str
        }, merge=True)
        print("✓ Synced new password with 'admin_config/auth_settings'.")

    print(f"\n🎉 Password reset complete for '{username}'. You can now log in with the new password.")

if __name__ == "__main__":
    main()
