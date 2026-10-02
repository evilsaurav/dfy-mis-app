import os
import json
import firebase_admin
from firebase_admin import credentials, firestore, storage

ENABLE_IN_MEMORY_DERIVATION: bool = os.getenv("ENABLE_IN_MEMORY_DERIVATION", "true").lower() in ("true", "1", "yes")

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

if not firebase_admin._apps:
    firebase_admin.initialize_app(cred, {
        'storageBucket': f'{project_id}.appspot.com'
    })

db_id = os.environ.get("FIRESTORE_DATABASE_ID")
if db_id:
    _real_db = firestore.client(database_id=db_id)
elif project_id == "dfy-reporting-mis-18b9a":
    _real_db = firestore.client(database_id="default")
else:
    _real_db = firestore.client()

class _DatabaseProxy:
    def __getattr__(self, name):
        import sys
        main_mod = sys.modules.get("main")
        if main_mod and hasattr(main_mod, "db"):
            active = getattr(main_mod, "db")
            if active is not self and active is not None:
                return getattr(active, name)
        return getattr(_real_db, name)

db = _DatabaseProxy()

def check_in_memory_derivation() -> bool:
    import sys
    main_mod = sys.modules.get("main")
    if main_mod and hasattr(main_mod, "ENABLE_IN_MEMORY_DERIVATION"):
        val = getattr(main_mod, "ENABLE_IN_MEMORY_DERIVATION")
        if val is not None:
            return bool(val)
    return ENABLE_IN_MEMORY_DERIVATION

