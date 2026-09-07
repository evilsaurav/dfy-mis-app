# -*- coding: utf-8 -*-
"""
Firebase Data Migration Engine: Old -> New Firebase Project
Migrates all Firestore collections (records, staff, targets, accounts, logs)
with 100% schema and document ID fidelity.
"""
import sys
import time
import firebase_admin
from firebase_admin import credentials, firestore

OLD_KEY_PATH = "firebase_key.json"
NEW_KEY_PATH = "new_firebase_key.json"

COLLECTIONS_TO_MIGRATE = [
    "admin_config",
    "admin_users",
    "staff_directory",
    "staff_targets",
    "daily_field_reports",
    "admin_audit_logs",
    "id_edit_logs",
    "broadcast_alerts"
]

def run_migration():
    print("=" * 70)
    print("[*] DFY TB MIS: Dual-Project Firebase Data Migration")
    print("=" * 70)

    # 1. Initialize Old Firebase App
    print(f"[*] Initializing source (OLD) Firebase from: {OLD_KEY_PATH}")
    try:
        old_cred = credentials.Certificate(OLD_KEY_PATH)
        old_app = firebase_admin.initialize_app(old_cred, name="old_source_app")
        old_db = firestore.client(app=old_app)
        print(f"    Connected to OLD project: {old_cred.project_id}")
    except Exception as e:
        print(f"[ERROR] Failed to connect to old Firebase project: {e}")
        return

    # 2. Initialize New Firebase App
    print(f"[*] Initializing target (NEW) Firebase from: {NEW_KEY_PATH}")
    try:
        new_cred = credentials.Certificate(NEW_KEY_PATH)
        new_app = firebase_admin.initialize_app(new_cred, name="new_target_app")
        try:
            new_db = firestore.client(app=new_app, database_id="default")
        except Exception:
            new_db = firestore.client(app=new_app)
        print(f"    Connected to NEW project: {new_cred.project_id}")
    except Exception as e:
        print(f"[ERROR] Failed to connect to new Firebase project: {e}")
        return

    start_time = time.time()
    migration_summary = {}

    print("\n" + "-" * 70)
    print("[*] Migrating Collections (Preserving Document IDs, Arrays & Timestamps)...")
    print("-" * 70)

    for col_name in COLLECTIONS_TO_MIGRATE:
        print(f"\n--> Processing Collection: '{col_name}'...")
        try:
            old_docs = list(old_db.collection(col_name).stream())
            total_docs = len(old_docs)
            print(f"    Found {total_docs} document(s) in source project.")
            
            if total_docs == 0:
                migration_summary[col_name] = {"source": 0, "migrated": 0, "status": "EMPTY"}
                continue

            # Batch write to new project (up to 300 writes per batch)
            batch = new_db.batch()
            batch_count = 0
            migrated_count = 0

            for doc in old_docs:
                doc_id = doc.id
                doc_data = doc.to_dict()

                target_ref = new_db.collection(col_name).document(doc_id)
                batch.set(target_ref, doc_data)
                batch_count += 1
                migrated_count += 1

                # Commit batch every 250 operations
                if batch_count >= 250:
                    batch.commit()
                    batch = new_db.batch()
                    batch_count = 0
                    print(f"    ... committed {migrated_count}/{total_docs} docs")

            if batch_count > 0:
                batch.commit()
                print(f"    ... committed final batch. Total: {migrated_count}/{total_docs} docs")

            migration_summary[col_name] = {
                "source": total_docs,
                "migrated": migrated_count,
                "status": "SUCCESS"
            }

        except Exception as e:
            print(f"    [!] Error migrating '{col_name}': {e}")
            migration_summary[col_name] = {
                "source": "UNKNOWN",
                "migrated": 0,
                "status": f"FAILED: {e}"
            }

    # 3. Post-Migration Verification
    print("\n" + "=" * 70)
    print("[*] Post-Migration Verification & Comparison Table")
    print("=" * 70)
    print(f"{'Collection Name':<25} | {'Old Project':<12} | {'New Project':<12} | {'Status':<10}")
    print("-" * 70)

    all_verified = True
    for col_name in COLLECTIONS_TO_MIGRATE:
        src_cnt = migration_summary.get(col_name, {}).get("source", 0)
        try:
            target_cnt = len(list(new_db.collection(col_name).stream()))
        except Exception:
            target_cnt = "ERR"

        match = (src_cnt == target_cnt) and (target_cnt != "ERR")
        if not match and src_cnt != 0:
            all_verified = False

        status_str = "MATCH" if match else ("EMPTY" if src_cnt == 0 else "MISMATCH")
        print(f"{col_name:<25} | {str(src_cnt):<12} | {str(target_cnt):<12} | {status_str:<10}")

    elapsed = round(time.time() - start_time, 2)
    print("-" * 70)
    if all_verified:
        print(f"[OK] SUCCESS: 100% of data successfully migrated in {elapsed}s!")
    else:
        print(f"[!] Notice: Some collections had mismatches or errors. Check logs above.")
    print("=" * 70)

if __name__ == "__main__":
    run_migration()
