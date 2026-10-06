import os
import sys

# Ensure repository root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import json
from dotenv import load_dotenv

load_dotenv()

from starlette.testclient import TestClient
from main import app
from backend.core.security import create_access_token
from backend.core.supabase import pg_execute_raw


def main():
    print("=" * 80)
    print("CATEGORY B FIX VERIFICATION TEST (NON-'admin' IDENTITY)")
    print("=" * 80)

    client = TestClient(app)

    # Issue JWT with NON-default identity (username="superadmin", NO user_id key)
    token = create_access_token({
        "username": "superadmin",
        "name": "Super Admin (Test)",
        "role": "SUPER_ADMIN",
        "allowed_districts": ["All"]
    })
    headers = {"Authorization": f"Bearer {token}"}
    filename = "backup_manual_2026-10-06_031150.json.gz"

    # Pre-count of admin_users
    pre_count = pg_execute_raw("SELECT COUNT(*) as count FROM admin_users;", fetch=True)[0]["count"]
    print(f"\n1. admin_users LIVE DB Pre-Count: {pre_count}")

    # TEST A: Call download_backup_file
    print(f"\n2. Calling GET /admin/backup/download/{filename} with token username='superadmin'...")
    resp_dl = client.get(f"/admin/backup/download/{filename}", headers=headers)
    print(f"Download Status Code: {resp_dl.status_code}")
    print(f"Downloaded Bytes: {len(resp_dl.content)}")
    assert resp_dl.status_code == 200, f"Download failed: {resp_dl.text}"

    # TEST B: Call restore_database_backup (dry_run=true)
    print(f"\n3. Calling POST /admin/backup/restore?dry_run=true with token username='superadmin'...")
    resp_restore = client.post(
        "/admin/backup/restore?dry_run=true",
        json={"filename": filename, "confirmation_code": "ANY_CODE"},
        headers=headers
    )
    print(f"Restore Dry-Run Status Code: {resp_restore.status_code}")
    assert resp_restore.status_code == 200, f"Dry-run restore failed: {resp_restore.text}"
    print(f"Restore Dry-Run Response ready_for_execution: {resp_restore.json().get('ready_for_execution')}")

    # Post-count of admin_users
    post_count = pg_execute_raw("SELECT COUNT(*) as count FROM admin_users;", fetch=True)[0]["count"]
    print(f"\n4. admin_users LIVE DB Post-Count: {post_count}")
    print(f"Zero-Write Verification: pre_count ({pre_count}) == post_count ({post_count}) -> {pre_count == post_count}")
    assert pre_count == post_count, "Database mutated during dry-run!"

    # Query recent audit log entries to inspect attribution
    print("\n5. Querying admin_audit_logs for the newly created entry...")
    recent_logs = pg_execute_raw(
        "SELECT id, action_type, user_name, user_id, role, details, occurred_at "
        "FROM admin_audit_logs ORDER BY id DESC LIMIT 3;",
        fetch=True
    )
    print("Raw admin_audit_logs records:")
    print(json.dumps([dict(r) for r in recent_logs], default=str, indent=2))

    # Verify latest record
    latest = recent_logs[0]
    assert latest["action_type"] == "DATABASE_BACKUP_DOWNLOAD", f"Unexpected action: {latest['action_type']}"
    print(f"\nVerification of latest audit entry:")
    print(f"  action_type: {latest['action_type']}")
    print(f"  user_name  : '{latest['user_name']}'")
    print(f"  user_id    : '{latest['user_id']}' (Target: 'superadmin')")
    assert latest["user_id"] == "superadmin", f"Expected user_id 'superadmin', got '{latest['user_id']}'"
    print("\n>>> CONFIRMED: user_id is now correctly 'superadmin' instead of 'admin'!")
    print("=" * 80)


if __name__ == "__main__":
    main()
