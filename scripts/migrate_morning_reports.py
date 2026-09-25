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
  - Merges IDs and array metrics dynamically without duplicates
  - Merges fdc_details by ID
  - Accurately maps scalar counters via SCALAR_COUNTER_MAP
  - Preserves all metadata if yesterday document does not exist
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

SCALAR_COUNTER_MAP = {
    "notification_ids": "notifications",
    "sample_tested_ids": "tests",
    "test_ids": "tests",
    "presumptive_ids": "presumptive",
    "hiv_dm_ids": "hiv_dm",
    "dbt_ids": "dbt",
    "contact_tracing_ids": "contact_tracing",
    "visited_names": "doctor_visits"
}

IST_TIMEZONE = timezone(timedelta(hours=5, minutes=30))


def get_ist_now() -> datetime:
    return datetime.now(IST_TIMEZONE)


def normalize_for_match(text: Any) -> str:
    """Strips whitespace, punctuation and converts to lowercase for resilient matching."""
    if text is None:
        return ""
    return re.sub(r'[^a-z0-9]', '', str(text).lower())


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


def merge_report_data(yesterday_data: Optional[Dict[str, Any]], morning_data: Dict[str, Any], formatted_time: str) -> Dict[str, Any]:
    """
    Merges morning data into yesterday's document payload cleanly.
    - If yesterday_data is empty/None, starts with dict(morning_data) to preserve all metadata.
    - Dynamically merges all array fields ending in _ids or visited_names without data loss.
    - Merges fdc_details by item id.
    - Accurately maps scalar counters using SCALAR_COUNTER_MAP and fallback.
    """
    if not yesterday_data:
        merged = dict(morning_data)
    else:
        merged = dict(yesterday_data)
        # Preserve any metadata from morning_data not in yesterday_data (PIN, coords, etc.)
        for k, v in morning_data.items():
            if k not in merged:
                merged[k] = v

    all_keys = set((yesterday_data or {}).keys()).union(morning_data.keys())

    # 1. Dynamic merge for any array ending with _ids or visited_names
    for k in all_keys:
        if k.endswith("_ids") or k == "visited_names":
            arr_y = (yesterday_data or {}).get(k) or []
            arr_m = morning_data.get(k) or []
            if isinstance(arr_y, list) or isinstance(arr_m, list):
                list_y = list(arr_y) if isinstance(arr_y, list) else []
                list_m = list(arr_m) if isinstance(arr_m, list) else []
                combined = list(dict.fromkeys(list_y + list_m))
                merged[k] = combined

    # 2. Merge fdc_details by id or combine
    if "fdc_details" in all_keys:
        old_fdc = (yesterday_data or {}).get("fdc_details") or []
        new_fdc = morning_data.get("fdc_details") or []
        if isinstance(old_fdc, list) or isinstance(new_fdc, list):
            list_old = old_fdc if isinstance(old_fdc, list) else []
            list_new = new_fdc if isinstance(new_fdc, list) else []
            f_map = {}
            for item in list_old:
                if isinstance(item, dict) and item.get("id"):
                    f_map[item.get("id")] = item
                elif isinstance(item, dict):
                    f_map[str(item)] = item
            for item in list_new:
                if isinstance(item, dict) and item.get("id"):
                    f_map[item.get("id")] = item
                elif isinstance(item, dict):
                    f_map[str(item)] = item
            merged["fdc_details"] = list(f_map.values())

    # 3. Update scalar counters using explicit SCALAR_COUNTER_MAP
    for k, scalar_field in SCALAR_COUNTER_MAP.items():
        if k in merged and isinstance(merged[k], list):
            merged[scalar_field] = len(merged[k])

    # Reconcile tests if either sample_tested_ids or test_ids exist
    if "sample_tested_ids" in merged or "test_ids" in merged:
        merged["tests"] = max(
            len(merged.get("sample_tested_ids") or []) if isinstance(merged.get("sample_tested_ids"), list) else 0,
            len(merged.get("test_ids") or []) if isinstance(merged.get("test_ids"), list) else 0
        )

    # Fallback scalar update for other _ids fields (e.g. documents_ids -> documents)
    for k in all_keys:
        if k.endswith("_ids") and k not in SCALAR_COUNTER_MAP:
            scalar_cand = k[:-4]
            if scalar_cand in merged and isinstance(merged.get(k), list):
                merged[scalar_cand] = len(merged[k])

    # 4. Preserve / merge remarks
    rem_y = str((yesterday_data or {}).get("remark") or "").strip()
    rem_m = str(morning_data.get("remark") or "").strip()
    if rem_y and rem_m and rem_m not in rem_y:
        merged["remark"] = f"{rem_y} | Morning Update: {rem_m}"
    elif rem_m:
        merged["remark"] = rem_m

    # 5. Travel KM
    km_y = (yesterday_data or {}).get("total_km") or 0
    km_m = morning_data.get("total_km") or 0
    try:
        merged["total_km"] = max(float(km_y), float(km_m))
    except (ValueError, TypeError):
        pass

    # 6. Stamp next-day morning metadata
    merged["date_of_reporting"] = TARGET_YESTERDAY_DATE
    merged["date"] = TARGET_YESTERDAY_DATE
    merged["is_next_day_submission"] = True
    merged["submitted_morning_time"] = formatted_time
    merged["morning_submission_label"] = f"Next day morning {formatted_time}"
    prev_count = (yesterday_data or {}).get("submission_count", 1) if yesterday_data else 0
    merged["submission_count"] = prev_count + 1
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
        norm_fo_name = normalize_for_match(fo_name)
        raw_ts = data.get("timestamp_completed") or data.get("timestamp") or data.get("submitted_at")
        dt_ist = parse_to_ist_datetime(raw_ts)

        is_candidate = False
        reason = ""

        # Condition 1: FO Name matches targeted staff (case/whitespace-insensitive)
        if any(normalize_for_match(t) == norm_fo_name for t in TARGET_FO_NAMES):
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

    # Pre-fetch candidate documents for yesterday to perform case/whitespace-insensitive matching
    all_ydocs = list(col_ref.where("date_of_reporting", "==", TARGET_YESTERDAY_DATE).stream())
    if not all_ydocs:
        all_ydocs = list(col_ref.where("date", "==", TARGET_YESTERDAY_DATE).stream())

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

        target_ref = yesterday_ref
        yesterday_data = None

        if yesterday_snap.exists:
            yesterday_data = yesterday_snap.to_dict() or {}
            print(f"    [+] Found existing yesterday document by primary ID: {yesterday_doc_id}")
        else:
            # Case/whitespace-insensitive fallback matching
            norm_fo = normalize_for_match(fo_name)
            norm_wp = normalize_for_match(working_place)

            matched_ydoc = None
            for ydoc in all_ydocs:
                yd = ydoc.to_dict() or {}
                if normalize_for_match(yd.get("fo_name")) == norm_fo:
                    matched_ydoc = ydoc
                    if normalize_for_match(yd.get("working_place")) == norm_wp:
                        break

            if matched_ydoc:
                target_ref = matched_ydoc.reference
                yesterday_data = matched_ydoc.to_dict() or {}
                print(f"    [+] Found case/whitespace-insensitive match for yesterday: {target_ref.id}")
            else:
                print(f"    [+] No existing yesterday document found; will create new at {yesterday_doc_id}")
                yesterday_data = None

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
