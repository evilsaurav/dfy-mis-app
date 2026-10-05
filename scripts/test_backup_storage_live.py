#!/usr/bin/env python3
"""
Standalone verification script to test live Google Drive backup storage operations.

Performs a full round-trip verification:
1. Uploads a small unique test payload.
2. Lists the backups in the folder and verifies the uploaded file is present.
3. Downloads the payload by remote_id and asserts exact byte equality.
4. Downloads the payload by filename and asserts exact byte equality.
5. Deletes the test file and confirms removal from the folder.
6. Enforces guaranteed cleanup via try...finally.

PRIMARY USAGE (Recommended):
    Add your Google Drive credentials to your local .env file (which is gitignored):
        GDRIVE_CLIENT_ID=your_client_id
        GDRIVE_CLIENT_SECRET=your_client_secret
        GDRIVE_REFRESH_TOKEN=your_refresh_token
        GDRIVE_FOLDER_ID=your_folder_id

    Then run:
        python scripts/test_backup_storage_live.py

SECONDARY / CI USAGE:
    Pass credentials via CLI arguments:
        python scripts/test_backup_storage_live.py \
            --client-id "YOUR_CLIENT_ID" \
            --client-secret "YOUR_CLIENT_SECRET" \
            --refresh-token "YOUR_REFRESH_TOKEN" \
            --folder-id "YOUR_FOLDER_ID"
"""

import os
import sys
import uuid
import asyncio
import argparse
from pathlib import Path
from datetime import datetime, timezone

# Prevent pytest from collecting this manual verification script
__test__ = False

# Ensure project root is in sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# Attempt to load local .env file via python-dotenv by default
try:
    from dotenv import load_dotenv
    env_path = BASE_DIR / ".env"
    if env_path.is_file():
        load_dotenv(dotenv_path=env_path)
    else:
        load_dotenv()
except ImportError:
    pass

from backend.core.backup_storage import GoogleDriveProvider, BackupStorageError


async def run_live_verification(
    client_id: str,
    client_secret: str,
    refresh_token: str,
    folder_id: str,
) -> bool:
    print("=" * 72)
    print(" Google Drive Backup Storage Live Round-Trip Verification")
    print("=" * 72)
    print(f"Folder ID:    {folder_id}")
    print(f"Client ID:    {client_id[:12]}...{client_id[-8:] if len(client_id) > 20 else ''}")
    print(f"Scope:        https://www.googleapis.com/auth/drive.file")
    print("-" * 72)

    try:
        provider = GoogleDriveProvider(
            client_id=client_id,
            client_secret=client_secret,
            refresh_token=refresh_token,
            folder_id=folder_id,
        )
    except Exception as init_err:
        print(f"❌ Failed to initialize GoogleDriveProvider: {init_err}", file=sys.stderr)
        return False

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    unique_marker = uuid.uuid4().hex[:12]
    filename = f"dfy_backup_probe_{timestamp}_{unique_marker}.txt"
    payload = (
        f"DFY-MIS-BACKUP-VERIFICATION\n"
        f"Timestamp: {timestamp}\n"
        f"Probe-ID:  {unique_marker}\n"
        f"Status:    HEALTHY\n"
    ).encode("utf-8")

    remote_id = None
    success = False

    try:
        # STEP 1: Upload
        print(f"[1/5] Uploading test archive '{filename}' ({len(payload)} bytes)...")
        remote_id = await provider.upload(
            file_bytes=payload,
            filename=filename,
            metadata={"probe": "true", "timestamp": timestamp, "marker": unique_marker},
        )
        print(f"      ✅ Upload succeeded! Remote File ID: {remote_id}")

        # STEP 2: List and confirm presence
        print(f"[2/5] Listing folder backups to verify presence...")
        backups = await provider.list_backups()
        matching = [b for b in backups if b.get("remote_id") == remote_id]
        if not matching:
            print(f"      ❌ File ID {remote_id} not found in folder backup list!", file=sys.stderr)
            return False
        found_meta = matching[0]
        print(f"      ✅ File found in folder: '{found_meta['filename']}' ({found_meta['size_bytes']} bytes)")

        # STEP 3: Download by remote_id and assert exact content
        print(f"[3/5] Downloading archive by remote_id ({remote_id})...")
        downloaded_by_id = await provider.download(remote_id)
        if downloaded_by_id != payload:
            print(f"      ❌ Downloaded payload mismatch! Expected {len(payload)} bytes, got {len(downloaded_by_id)}", file=sys.stderr)
            return False
        print(f"      ✅ Download by remote_id verified (exact byte match).")

        # STEP 4: Download by filename and assert exact content
        print(f"[4/5] Downloading archive by filename ('{filename}')...")
        downloaded_by_name = await provider.download(filename)
        if downloaded_by_name != payload:
            print(f"      ❌ Download by filename mismatch!", file=sys.stderr)
            return False
        print(f"      ✅ Download by filename verified (exact byte match).")

        # STEP 5: Delete and confirm removal
        print(f"[5/5] Deleting test archive ({remote_id})...")
        del_result = await provider.delete(remote_id)
        if not del_result:
            print(f"      ❌ Deletion returned False!", file=sys.stderr)
            return False
        print(f"      ✅ File deleted successfully from Google Drive.")

        # Re-list to confirm file is truly gone
        backups_after = await provider.list_backups()
        still_present = [b for b in backups_after if b.get("remote_id") == remote_id]
        if still_present:
            print(f"      ❌ Warning: File {remote_id} still listed in folder after deletion!", file=sys.stderr)
            return False
        print(f"      ✅ Deletion confirmed (file absent from folder listing).")

        success = True

    except BackupStorageError as bse:
        print(f"\n❌ BackupStorageError during operation '{bse.operation}': {bse.message}", file=sys.stderr)
        if bse.original_error:
            print(f"   Underlying error: {type(bse.original_error).__name__}: {bse.original_error}", file=sys.stderr)
        return False
    except Exception as err:
        print(f"\n❌ Unexpected error: {type(err).__name__}: {err}", file=sys.stderr)
        return False
    finally:
        # Guaranteed cleanup: if remote_id exists and test did not finish cleanly, attempt delete
        if remote_id and not success:
            print(f"\n[CLEANUP] Attempting to clean up leftover probe file {remote_id}...")
            try:
                await provider.delete(remote_id)
                print("          ✅ Cleanup successful.")
            except Exception as clean_err:
                print(f"          ⚠️ Could not clean up probe file: {clean_err}", file=sys.stderr)

    print("-" * 72)
    print(" 🎉 ALL 5 LIVE STORAGE VERIFICATION CHECKS PASSED PERFECTLY!")
    print("=" * 72)
    return True


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Verify live Google Drive backup storage operations (upload, list, download, delete).\n"
            "PRIMARY METHOD: Loads GDRIVE_* credentials automatically from local .env file.\n"
            "SECONDARY METHOD: Pass credentials explicitly via command-line arguments."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--client-id", default="", help="[Secondary/CI] Google OAuth Client ID (default: reads GDRIVE_CLIENT_ID from .env)")
    parser.add_argument("--client-secret", default="", help="[Secondary/CI] Google OAuth Client Secret (default: reads GDRIVE_CLIENT_SECRET from .env)")
    parser.add_argument("--refresh-token", default="", help="[Secondary/CI] Google OAuth Refresh Token (default: reads GDRIVE_REFRESH_TOKEN from .env)")
    parser.add_argument("--folder-id", default="", help="[Secondary/CI] Google Drive Folder ID (default: reads GDRIVE_FOLDER_ID from .env)")

    args = parser.parse_args()

    client_id = (args.client_id or os.environ.get("GDRIVE_CLIENT_ID", "")).strip()
    client_secret = (args.client_secret or os.environ.get("GDRIVE_CLIENT_SECRET", "")).strip()
    refresh_token = (args.refresh_token or os.environ.get("GDRIVE_REFRESH_TOKEN", "")).strip()
    folder_id = (args.folder_id or os.environ.get("GDRIVE_FOLDER_ID", "")).strip()

    missing = []
    if not client_id:
        missing.append("GDRIVE_CLIENT_ID")
    if not client_secret:
        missing.append("GDRIVE_CLIENT_SECRET")
    if not refresh_token:
        missing.append("GDRIVE_REFRESH_TOKEN")
    if not folder_id:
        missing.append("GDRIVE_FOLDER_ID")

    if missing:
        print("ERROR: Missing required Google Drive credentials to run live verification.\n", file=sys.stderr)
        print("PRIMARY METHOD (Recommended):", file=sys.stderr)
        print("Add the following variables to your local .env file (which is gitignored):\n", file=sys.stderr)
        for m in missing:
            print(f"  {m}=your_value_here", file=sys.stderr)
        print("\nThen simply execute:", file=sys.stderr)
        print("  python scripts/test_backup_storage_live.py\n", file=sys.stderr)
        print("SECONDARY / CI METHOD:", file=sys.stderr)
        print("Pass values via command-line flags:", file=sys.stderr)
        print("  python scripts/test_backup_storage_live.py --client-id <id> --client-secret <sec> --refresh-token <tok> --folder-id <fid>", file=sys.stderr)
        sys.exit(1)

    ok = asyncio.run(
        run_live_verification(
            client_id=client_id,
            client_secret=client_secret,
            refresh_token=refresh_token,
            folder_id=folder_id,
        )
    )
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
