#!/usr/bin/env python3
"""
Standalone utility to generate Google Drive OAuth 2.0 refresh token
and create the DFY-MIS-Backups root folder under drive.file scope.

Usage:
    python scripts/generate_google_drive_token.py --client-secret path/to/client_secret_xxxx.json

Scope:
    https://www.googleapis.com/auth/drive.file (least-privilege: only files/folders created by this app)
"""

import os
import sys
import json
import argparse
from pathlib import Path

SCOPES = ["https://www.googleapis.com/auth/drive.file"]


def extract_client_credentials(secret_file_path: Path) -> tuple[str, str]:
    """Reads client_id and client_secret from the OAuth credentials JSON file."""
    with open(secret_file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Google credentials files typically wrap keys under "installed" or "web"
    root_key = "installed" if "installed" in data else ("web" if "web" in data else None)
    if not root_key:
        raise ValueError(
            f"Invalid client secrets file structure. Expected top-level 'installed' or 'web' key. Found: {list(data.keys())}"
        )

    client_id = data[root_key].get("client_id")
    client_secret = data[root_key].get("client_secret")

    if not client_id or not client_secret:
        raise ValueError("client_id or client_secret missing in secrets file.")

    return client_id, client_secret


def main():
    parser = argparse.ArgumentParser(
        description="Generate Google Drive OAuth refresh token and create DFY-MIS-Backups folder."
    )
    parser.add_argument(
        "--client-secret",
        required=True,
        help="Path to the downloaded Google OAuth client secret JSON file.",
    )
    args = parser.parse_args()

    secret_path = Path(args.client_secret).resolve()
    if not secret_path.is_file():
        print(f"ERROR: Client secret file not found at: {secret_path}", file=sys.stderr)
        sys.exit(1)

    try:
        client_id, client_secret = extract_client_credentials(secret_path)
    except Exception as e:
        print(f"ERROR: Failed to parse client secrets file: {e}", file=sys.stderr)
        sys.exit(1)

    print("=" * 70)
    print(" Google Drive OAuth 2.0 Token Generation Utility")
    print("=" * 70)
    print(f"Client Secret File: {secret_path}")
    print(f"Client ID:          {client_id}")
    print(f"Requested Scope:    {SCOPES[0]}")
    print("-" * 70)
    print("Launching local web server for authorization...")
    print("Please approve access in the browser that opens automatically.\n")

    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
        from googleapiclient.discovery import build
    except ImportError as e:
        print(f"ERROR: Missing required dependency: {e}", file=sys.stderr)
        print("Please run: pip install google-auth-oauthlib google-api-python-client", file=sys.stderr)
        sys.exit(1)

    try:
        flow = InstalledAppFlow.from_client_secrets_file(
            str(secret_path),
            scopes=SCOPES,
        )
        # prompt='consent' and access_type='offline' are required to obtain a refresh_token
        creds = flow.run_local_server(
            port=0,
            prompt="consent",
            access_type="offline",
        )
    except Exception as auth_err:
        print(f"\nERROR: Authentication failed: {auth_err}", file=sys.stderr)
        sys.exit(1)

    if not creds or not creds.refresh_token:
        print("\nWARNING: No refresh token returned by Google OAuth server.", file=sys.stderr)
        print("Possible cause: If you previously authorized this client, Google may omit the refresh token.", file=sys.stderr)
        print("Try removing app access at https://myaccount.google.com/permissions and re-running.", file=sys.stderr)
        sys.exit(1)

    print("\nAuthorization successful! Creating 'DFY-MIS-Backups' folder on Google Drive...")

    folder_id = None
    try:
        drive_service = build("drive", "v3", credentials=creds)
        folder_metadata = {
            "name": "DFY-MIS-Backups",
            "mimeType": "application/vnd.google-apps.folder",
        }
        folder = drive_service.files().create(body=folder_metadata, fields="id, name").execute()
        folder_id = folder.get("id")
    except Exception as drive_err:
        print(f"ERROR: Failed to create Google Drive folder: {drive_err}", file=sys.stderr)
        sys.exit(1)

    print("\n" + "=" * 70)
    print(" CREDENTIALS & BACKUP FOLDER GENERATED SUCCESSFULLY")
    print("=" * 70)
    print("Copy the values below into your environment configuration:\n")
    print(f"GDRIVE_CLIENT_ID:      {client_id}")
    print(f"GDRIVE_CLIENT_SECRET:  {client_secret}")
    print(f"GDRIVE_REFRESH_TOKEN:  {creds.refresh_token}")
    print(f"GDRIVE_FOLDER_ID:      {folder_id}")
    print("=" * 70)
    print("NOTE: No secrets or tokens have been saved to disk.")
    print("Keep this terminal output secure and do not share these tokens.")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    main()
