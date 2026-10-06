import os
import sys

# Ensure repository root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import json
import gzip
import re
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

from starlette.testclient import TestClient
from main import app
from backend.core.security import create_access_token
from backend.core.supabase import pg_execute_raw


def main():
    print("=" * 80)
    print("STARTING LIVE BACKUP ROUND-TRIP VERIFICATION BATTERY")
    print("=" * 80)

    client = TestClient(app)
    token = create_access_token({
        "user_id": "test_superadmin",
        "username": "superadmin",
        "role": "SUPER_ADMIN",
        "allowed_districts": ["All"]
    })
    headers = {"Authorization": f"Bearer {token}"}

    # STEP 1: Manual backup trigger
    print("\n--- STEP 1: POST /admin/backup/trigger-now ---")
    resp_step1 = client.post("/admin/backup/trigger-now", headers=headers)
    print(f"Status Code: {resp_step1.status_code}")
    print("Raw Response JSON:")
    print(resp_step1.text)
    if resp_step1.status_code != 200:
        print(f"ERROR: Step 1 failed with status {resp_step1.status_code}")
        sys.exit(1)

    step1_data = resp_step1.json()
    filename = step1_data.get("filename")
    print(f"\nExtracted filename: {filename}")

    # Verify filename pattern: backup_manual_{YYYY-MM-DD}_{HHMMSS}.json.gz
    match = re.match(r"^backup_manual_\d{4}-\d{2}-\d{2}_\d{6}\.json\.gz$", filename)
    print(f"Filename pattern check: {'PASSED' if match else 'FAILED'}")
    if not match:
        print(f"ERROR: Filename '{filename}' does not match pattern backup_manual_{{YYYY-MM-DD}}_{{HHMMSS}}.json.gz")
        sys.exit(1)

    # STEP 2: Status endpoint verify
    print("\n--- STEP 2: GET /admin/backup/status ---")
    resp_step2 = client.get("/admin/backup/status", headers=headers)
    print(f"Status Code: {resp_step2.status_code}")
    print("Raw Response JSON:")
    print(resp_step2.text)
    if resp_step2.status_code != 200:
        print(f"ERROR: Step 2 failed with status {resp_step2.status_code}")
        sys.exit(1)

    step2_data = resp_step2.json()
    backups = step2_data.get("backups", [])
    matching_backup = next((b for b in backups if b.get("filename") == filename), None)
    print(f"\n(a) Manual backup present in list: {matching_backup is not None}")
    if not matching_backup:
        print(f"ERROR: Created backup {filename} not found in backups list")
        sys.exit(1)

    source_val = matching_backup.get("source")
    print(f"(b) Source field value: '{source_val}' (expected 'manual_superadmin')")
    if source_val != "manual_superadmin":
        print(f"ERROR: Expected source 'manual_superadmin', got '{source_val}'")
        sys.exit(1)

    today_backup_exists = step2_data.get("today_backup_exists")
    print(f"(c) today_backup_exists: {today_backup_exists} (expected False if no automated backup run today)")

    # STEP 3: Download verify
    print(f"\n--- STEP 3: GET /admin/backup/download/{filename} ---")
    resp_step3 = client.get(f"/admin/backup/download/{filename}", headers=headers)
    print(f"Status Code: {resp_step3.status_code}")
    print(f"Downloaded content-length: {len(resp_step3.content)} bytes")
    if resp_step3.status_code != 200:
        print(f"ERROR: Step 3 failed with status {resp_step3.status_code}: {resp_step3.text}")
        sys.exit(1)

    decompressed = gzip.decompress(resp_step3.content).decode("utf-8")
    snapshot = json.loads(decompressed)
    metadata = snapshot.get("metadata", {})
    tables = snapshot.get("tables", {})

    print(f"\n(a) Metadata version: '{metadata.get('version')}' (expected '2.0')")
    if metadata.get("version") != "2.0":
        print(f"ERROR: Expected version '2.0', got '{metadata.get('version')}'")
        sys.exit(1)

    print(f"(b) Tables dict keys count: {len(tables)} (expected 19)")
    table_keys = list(tables.keys())
    print(f"Table keys: {table_keys}")
    if len(tables) != 19:
        print(f"ERROR: Expected 19 tables, got {len(tables)}")
        sys.exit(1)

    print(f"(c) Checking non-empty table data:")
    for check_t in ["admin_users", "districts"]:
        t_rows = tables.get(check_t, [])
        print(f"Table '{check_t}' row count in archive: {len(t_rows)}")
        if t_rows:
            sample = t_rows[0].copy()
            if "password_hash" in sample:
                sample["password_hash"] = "[REDACTED]"
            print(f"Sample record from '{check_t}': {sample}")

    # STEP 4: Restore DRY-RUN ONLY verify
    print(f"\n--- STEP 4: POST /admin/backup/restore?dry_run=true ---")
    count_pre = pg_execute_raw("SELECT COUNT(*) as count FROM admin_users;", fetch=True)[0]["count"]
    print(f"LIVE DB Pre-Restore Row Count for 'admin_users': {count_pre}")

    resp_step4 = client.post(
        "/admin/backup/restore?dry_run=true",
        json={"filename": filename, "confirmation_code": "IRRELEVANT_IN_DRY_RUN"},
        headers=headers
    )
    print(f"Status Code: {resp_step4.status_code}")
    print("Raw Response JSON:")
    print(resp_step4.text)
    if resp_step4.status_code != 200:
        print(f"ERROR: Step 4 failed with status {resp_step4.status_code}")
        sys.exit(1)

    count_post = pg_execute_raw("SELECT COUNT(*) as count FROM admin_users;", fetch=True)[0]["count"]
    print(f"LIVE DB Post-Restore Row Count for 'admin_users': {count_post}")
    print(f"Zero-Write Verification: count_pre ({count_pre}) == count_post ({count_post}) -> {count_pre == count_post}")
    if count_pre != count_post:
        print(f"ERROR: Discrepancy in admin_users count! Pre: {count_pre}, Post: {count_post}")
        sys.exit(1)

    step4_data = resp_step4.json()
    ready_flag = step4_data.get("ready_for_execution")
    print(f"ready_for_execution: {ready_flag} (expected True)")
    if ready_flag is not True:
        print(f"ERROR: Expected ready_for_execution True, got {ready_flag}")
        sys.exit(1)

    print("\n" + "=" * 80)
    print("ALL 4 VERIFICATION STEPS PASSED SUCCESSFULLY!")
    print("=" * 80)


if __name__ == "__main__":
    main()
