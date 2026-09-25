#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/migrate_morning_reports.py

Migration script for Stealth 10 AM Cutoff:
Migrates daily field reports submitted on the morning of 2026-09-25 (< 10:00 AM IST)
into the corresponding 2026-09-24 documents, setting:
  - is_next_day_submission = True
  - submitted_morning_time = formatted_time
  - morning_submission_label = f"Next day morning {formatted_time}"
  - Merges IDs and array metrics without duplicates
  - Deletes the duplicate 2026-09-25 documents
  - Invalidates attendance & reporting caches
"""

import os
import sys
import json
import re
import argparse
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Set, Optional

# Ensure project root is on sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

TARGET_MORNING_DATE = "2026-09-25"
TARGET_YESTERDAY_DATE = "2026-09-24"
CUTOFF_HOUR_IST = 10

TARGET_FO_NAMES = {
    "shashi ranjan",
    "ram prakash",
    "munna kumar",
    "nilkamal kumar",
    "diwakar kumar"
}

ALL_ARRAY_FIELDS = [
    "notification_ids", "test_ids", "presumptive_ids", "hiv_dm_ids", "dbt_ids",
    "tpt_treatment_start_ids", "tpt_presumptive_ids", "doctor_visits_ids",
    "documents_ids", "contact_tracing_ids", "community_meeting_ids",
    "daily_meeting_ids", "private_doctor_meeting_ids", "chemist_meeting_ids",
    "ayush_doctor_meeting_ids", "rhp_doctor_meeting_ids", "active_case_finding_ids",
    "drtb_patient_counseling_ids", "weight_band_ids", "adhar_face_authentication_ids",
    "consent_with_id_ids", "culture_dst_ids", "visited_names"
]

IST_TIMEZONE = timezone(timedelta(hours=5, minutes=30))


def get_ist_now() -> datetime:
    return datetime.now(IST_TIMEZONE)


def parse_to_ist_datetime(raw_ts: Any) -> Optional[datetime]:
    if not raw_ts:
        return None
    try:
        if isinstance(raw_ts, datetime):
            if raw_ts.tzinfo is None:
                dt_utc = raw_ts.replace(tzinfo=timezone.utc)
            else:
                dt_utc = raw_ts
            return dt_utc.astimezone(IST_TIMEZONE)
        
        str_ts = str(raw_ts).strip().replace("Z", "+00:00")
        if "T" in str_ts or "+" in str_ts or "-" in str_ts:
            dt = datetime.fromisoformat(str_ts)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(IST_TIMEZONE)
        else:
            dt = datetime.strptime(str_ts, "%Y-%m-%d %H:%M:%S")
            dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(IST_TIMEZONE)
    except Exception:
        return None


def format_to_ist_time(raw_ts: Any) -> str:
    dt = parse_to_ist_datetime(raw_ts)
    if dt:
        return dt.strftime("%I:%M %p")
    return str(raw_ts)[:16] if raw_ts else ""


def initialize_firestore():
    """Initializes Firestore client using firebase_key.json or env credentials."""
    import firebase_admin
    from firebase_admin import credentials, firestore

    if not firebase_admin._apps:
        firebase_creds_env = os.environ.get("FIREBASE_CREDENTIALS")
        if firebase_creds_env:
            cred_dict = json.loads(firebase_creds_env)
            cred = credentials.Certificate(cred_dict)
            project_id = cred_dict.get("project_id", "dfy-reporting-mis-18b9a")
        else:
            key_path = os.path.join(PROJECT_ROOT, "firebase_key.json")
            if os.path.exists(key_path):
                cred = credentials.Certificate(key_path)
                try:
                    with open(key_path, "r", encoding="utf-8") as f:
                        project_id = json.load(f).get("project_id", "dfy-reporting-mis-18b9a")
                except Exception:
                    project_id = "dfy-reporting-mis-18b9a"
            else:
                raise RuntimeError(f"Cannot find Firebase credentials at {key_path} or in FIREBASE_CREDENTIALS env.")

        firebase_admin.initialize_app(cred, {
            'storageBucket': f'{project_id}.appspot.com'
        })
    else:
        app = firebase_admin.get_app()
        project_id = app.project_id if hasattr(app, "project_id") else "dfy-reporting-mis-18b9a"

    db_id = os.environ.get("FIRESTORE_DATABASE_ID")
    if db_id:
        return firestore.client(database_id=db_id)
    elif project_id == "dfy-reporting-mis-18b9a":
        return firestore.client(database_id="default")
    else:
        return firestore.client()


def invalidate_caches():
    """Invalidates attendance and reporting caches on disk and in memory."""
    print("[*] Invalidating attendance and shared caches...")
    
    # 1. In-memory cache from main.py if accessible
    try:
        import main
        if hasattr(main, "cache"):
            main.cache.delete_prefix(f"attendance_{TARGET_MORNING_DATE}")
            main.cache.delete_prefix(f"attendance_{TARGET_YESTERDAY_DATE}")
            main.cache.delete_prefix("attendance_")
            main.cache.delete_prefix("shared_raw_month_2026-09")
            main.cache.delete_prefix("status_")
            print("    [✓] In-memory cache keys evicted from main.cache.")
    except Exception as e:
        print(f"    [!] Note: in-memory cache eviction bypassed ({e}).")

    # 2. L2 Persistent Disk Cache
    disk_cache_path = os.path.join(PROJECT_ROOT, "cache", "l2_persistent_cache.json")
    if os.path.exists(disk_cache_path):
        try:
            with open(disk_cache_path, "r", encoding="utf-8") as f:
                disk_data = json.load(f)
            
            keys_to_delete = [
                k for k in disk_data.keys()
                if k.startswith("attendance_") or
                   k.startswith("shared_raw_month_2026-09") or
                   k.startswith("status_")
            ]
            for k in keys_to_delete:
                disk_data.pop(k, None)
            
            with open(disk_cache_path, "w", encoding="utf-8") as f:
                json.dump(disk_data, f)
            print(f"    [✓] Cleared {len(keys_to_delete)} keys from L2 persistent disk cache.")
        except Exception as de:
            print(f"    [!] Note: Disk cache pruning notice: {de}")


def merge_report_data(yesterday_data: Dict[str, Any], morning_data: Dict[str, Any], formatted_time: str) -> Dict[str, Any]:
    """Merges morning data into yesterday's document payload cleanly."""
    merged = dict(yesterday_data)

    # 1. Merge all array fields without duplicates
    for arr_field in ALL_ARRAY_FIELDS:
        arr_y = yesterday_data.get(arr_field) or []
        arr_m = morning_data.get(arr_field) or []
        if arr_y or arr_m:
            combined = list(dict.fromkeys(list(arr_y) + list(arr_m)))
            merged[arr_field] = combined
            
            # Recalculate scalar counters if applicable (e.g. notification_ids -> notifications)
            if arr_field.endswith("_ids"):
                scalar_field = arr_field[:-4]
                merged[scalar_field] = len(combined)

    # 2. Preserve / merge remarks
    rem_y = (yesterday_data.get("remark") or "").strip()
    rem_m = (morning_data.get("remark") or "").strip()
    if rem_y and rem_m and rem_m not in rem_y:
        merged["remark"] = f"{rem_y} | Morning Update: {rem_m}"
    elif rem_m:
        merged["remark"] = rem_m

    # 3. Handle travel km
    km_y = yesterday_data.get("total_km") or 0
    km_m = morning_data.get("total_km") or 0
    merged["total_km"] = max(km_y, km_m)

    # 4. Stamp next-day morning metadata
    merged["date_of_reporting"] = TARGET_YESTERDAY_DATE
    merged["date"] = TARGET_YESTERDAY_DATE
    merged["is_next_day_submission"] = True
    merged["submitted_morning_time"] = formatted_time
    merged["morning_submission_label"] = f"Next day morning {formatted_time}"
    merged["submission_count"] = yesterday_data.get("submission_count", 1) + 1
    merged["status"] = "completed"

    return merged


def run_migration(dry_run: bool = False) -> Dict[str, Any]:
    """
    Executes the morning reports migration.
    Returns a summary dict with processed, merged, deleted counts.
    """
    print("=" * 70)
    print("[*] DFY TB MIS: Live Morning Reports Migration Engine")
    print(f"[*] Target Morning: {TARGET_MORNING_DATE} (< {CUTOFF_HOUR_IST}:00 AM IST)")
    print(f"[*] Target Merge Date: {TARGET_YESTERDAY_DATE}")
    print(f"[*] Dry Run: {dry_run}")
    print("=" * 70)

    db = initialize_firestore()
    print("[✓] Connected to Firestore database.")

    # 1. Query daily_field_reports for 2026-09-25
    col_ref = db.collection("daily_field_reports")
    docs_25 = list(col_ref.where("date_of_reporting", "==", TARGET_MORNING_DATE).stream())
    if not docs_25:
        docs_25 = list(col_ref.where("date", "==", TARGET_MORNING_DATE).stream())

    print(f"[*] Found {len(docs_25)} total document(s) for date {TARGET_MORNING_DATE}.")

    candidates_to_migrate = []
    for doc in docs_25:
        data = doc.to_dict() or {}
        fo_name = (data.get("fo_name") or "").strip()
        clean_fo_name = fo_name.lower()
        raw_ts = data.get("timestamp_completed") or data.get("timestamp") or data.get("submitted_at")
        dt_ist = parse_to_ist_datetime(raw_ts)

        is_candidate = False
        reason = ""

        # Condition 1: FO Name matches targeted staff
        if clean_fo_name in TARGET_FO_NAMES:
            is_candidate = True
            reason = f"Officer '{fo_name}' in targeted morning staff list"
        # Condition 2: Completed before 10:00 AM IST on Sept 25
        elif dt_ist and dt_ist.date().strftime("%Y-%m-%d") == TARGET_MORNING_DATE and dt_ist.hour < CUTOFF_HOUR_IST:
            is_candidate = True
            reason = f"Timestamp {dt_ist.strftime('%I:%M %p')} is before {CUTOFF_HOUR_IST}:00 AM IST"

        if is_candidate:
            candidates_to_migrate.append((doc, data, reason, raw_ts))

    print(f"[*] Identified {len(candidates_to_migrate)} document(s) matching morning cutoff criteria.")

    summary = {
        "found_morning_docs": len(docs_25),
        "candidates": len(candidates_to_migrate),
        "merged": 0,
        "deleted": 0,
        "details": []
    }

    if not candidates_to_migrate:
        print("[✓] No candidate documents require migration. Already migrated or no records found.")
        invalidate_caches()
        return summary

    for doc, morning_data, reason, raw_ts in candidates_to_migrate:
        morning_doc_id = doc.id
        fo_name = (morning_data.get("fo_name") or "").strip()
        working_place = (morning_data.get("working_place") or "").strip()
        formatted_time = format_to_ist_time(raw_ts) or morning_data.get("submitted_morning_time") or "08:30 AM"

        print(f"\n--> Processing [{morning_doc_id}] ({fo_name} - {working_place})")
        print(f"    Reason: {reason}")
        print(f"    Morning Submission Time: {formatted_time}")

        # Form candidate document IDs for yesterday
        yesterday_doc_id = f"{working_place}_{fo_name}_{TARGET_YESTERDAY_DATE}".replace(" ", "_").lower()
        yesterday_ref = col_ref.document(yesterday_doc_id)
        yesterday_snap = yesterday_ref.get()

        # If not found by primary key, query by fo_name and date_of_reporting
        target_ref = yesterday_ref
        yesterday_data = {}
        if yesterday_snap.exists:
            yesterday_data = yesterday_snap.to_dict() or {}
            print(f"    [+] Found existing yesterday document: {yesterday_doc_id}")
        else:
            q_ydocs = list(col_ref.where("fo_name", "==", fo_name).where("date_of_reporting", "==", TARGET_YESTERDAY_DATE).stream())
            if not q_ydocs:
                q_ydocs = list(col_ref.where("fo_name", "==", fo_name).where("date", "==", TARGET_YESTERDAY_DATE).stream())
            
            if q_ydocs:
                target_ref = q_ydocs[0].reference
                yesterday_data = q_ydocs[0].to_dict() or {}
                print(f"    [+] Found alternative yesterday document: {target_ref.id}")
            else:
                print(f"    [+] No existing yesterday document found; will create new at {yesterday_doc_id}")

        # Build merged document
        merged_payload = merge_report_data(yesterday_data, morning_data, formatted_time)
        merged_payload["working_place"] = working_place
        merged_payload["fo_name"] = fo_name

        if not dry_run:
            # 1. Write / Update yesterday's document
            target_ref.set(merged_payload, merge=True)
            print(f"    [✓] Successfully merged into yesterday's document: {target_ref.id}")

            # 2. Delete the duplicate morning document
            doc.reference.delete()
            print(f"    [✓] Deleted duplicate morning document: {morning_doc_id}")

        summary["merged"] += 1
        summary["deleted"] += 1
        summary["details"].append({
            "morning_doc_id": morning_doc_id,
            "target_yesterday_id": target_ref.id,
            "fo_name": fo_name,
            "morning_time": formatted_time
        })

    # Cache eviction
    if not dry_run:
        invalidate_caches()

    print("\n" + "=" * 70)
    print(f"[✓] Migration Complete! Merged: {summary['merged']}, Deleted: {summary['deleted']}")
    print("=" * 70)
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="DFY MIS: Migrate 2026-09-25 Morning Reports to 2026-09-24")
    parser.add_argument("--dry-run", action="store_true", help="Inspect candidates without mutating Firestore")
    args = parser.parse_args()

    try:
        run_migration(dry_run=args.dry_run)
    except Exception as ex:
        print(f"[ERROR] Migration failed: {ex}")
        sys.exit(1)
