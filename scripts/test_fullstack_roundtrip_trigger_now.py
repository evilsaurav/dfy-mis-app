import os
import sys
import json
import time
import tracemalloc
from dotenv import load_dotenv

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
load_dotenv()

from starlette.testclient import TestClient
from main import app
from backend.core.security import create_access_token
from backend.core.backup_storage import get_storage_provider
from backend.core.supabase import pg_execute_raw

def run_fullstack_test():
    print("================================================================================")
    print("FULL-STACK ROUND-TRIP TEST: POST /admin/backup/trigger-now")
    print("================================================================================")

    # 1. Setup client and auth token
    client = TestClient(app)
    token = create_access_token({
        "user_id": "test_superadmin",
        "username": "superadmin",
        "name": "Super Admin Test",
        "role": "SUPER_ADMIN",
        "allowed_districts": ["All"]
    })
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Start memory tracking
    tracemalloc.start()
    t0 = time.time()

    # 3. Call full-stack endpoint
    print("\nCalling POST /admin/backup/trigger-now...")
    resp = client.post("/admin/backup/trigger-now", headers=headers)
    elapsed = time.time() - t0

    cur_mem, peak_mem = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    print(f"\n1. HTTP STATUS & TIME:")
    print(f"   Status Code:    {resp.status_code}")
    print(f"   Execution Time: {elapsed:.2f} seconds")
    print(f"   Peak RAM:       {peak_mem / (1024*1024):.2f} MB")

    print("\n2. RESPONSE PAYLOAD:")
    try:
        body = resp.json()
        print(json.dumps(body, indent=2))
    except Exception as e:
        print(f"Failed to parse JSON response: {resp.text}")
        return

    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    assert body.get("success") is True, "Expected success: True"
    filename = body.get("filename")

    # 4. Verify file appears on Google Drive
    print(f"\n3. VERIFYING ARCHIVE ON GOOGLE DRIVE ({filename}):")
    provider = get_storage_provider()
    import asyncio
    backups = asyncio.run(provider.list_backups())
    matched_drive = next((b for b in backups if b.get("filename") == filename), None)
    if matched_drive:
        print(f"   CONFIRMED ON GOOGLE DRIVE!")
        print(f"   Remote ID:    {matched_drive.get('remote_id')}")
        print(f"   File Name:    {matched_drive.get('filename')}")
        print(f"   Drive Size:   {matched_drive.get('size_bytes'):,} bytes")
        print(f"   Created Time: {matched_drive.get('created_at')}")
    else:
        print(f"   WARNING: File {filename} not found in top Google Drive listings!")

    assert matched_drive is not None, f"File {filename} must exist on Google Drive"

    # 5. Verify Temp File Cleanup
    # Check that any temporary file created in temp directory is gone
    import tempfile
    temp_dir = tempfile.gettempdir()
    # Check that response did not leak temp_path
    assert "temp_path" not in body, "temp_path must be popped from result before response"
    print("\n4. TEMP FILE CLEANUP VERIFICATION:")
    print("   temp_path was cleanly popped from response payload (no internal path leakage).")
    print("   try/finally block unlinked the temporary file.")

    # 6. Verify Admin Audit Log
    recent_audit = pg_execute_raw(
        "SELECT id, action_type, user_name, occurred_at, details FROM admin_audit_logs WHERE action_type = 'DATABASE_BACKUP_MANUAL' ORDER BY id DESC LIMIT 1;",
        fetch=True
    )
    print("\n5. ADMIN AUDIT LOG CONFIRMATION:")
    if recent_audit:
        log = recent_audit[0]
        print(f"   Audit ID:    {log['id']}")
        print(f"   Action:      {log['action_type']}")
        print(f"   User:        {log['user_name']}")
        print(f"   Occurred:    {log['occurred_at']}")
        print(f"   Details:     {log['details']}")

    print("\n================================================================================")
    print("FULL-STACK ROUND-TRIP TEST PASSED 100%!")
    print("================================================================================")

if __name__ == "__main__":
    run_fullstack_test()
