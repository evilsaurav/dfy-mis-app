import os
import io
import re
import gc
import json
import math
import time
import asyncio
import calendar
from datetime import datetime, timedelta, date as dt_date, timezone
from typing import Optional, List, Dict, Any, Tuple, Set
from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from google.cloud import firestore

from backend.core.database import db, project_id, ENABLE_IN_MEMORY_DERIVATION
from backend.core.cache import cache
from backend.core.security import get_current_admin, verify_password, get_optional_admin
from backend.core.helpers import (
    get_ist_now,
    format_to_ist_time,
    parse_to_ist_datetime,
    canonicalize_district,
    normalize_staff_key,
    is_officer_name_match,
    get_previous_month,
    canonicalize_fo_name,
    get_profile_cache_key,
    evict_officer_profile_cache,
    get_reporting_cutoff_hour,
    get_active_operational_month,
    DEFAULT_BIHAR_DISTRICTS,
    log_admin_activity
)
from backend.core.master_ledger import (
    get_raw_monthly_reports,
    get_cached_staff_directory_raw,
    get_cached_staff_targets_for_month,
    format_dashboard_record,
    get_last_mutation_str,
    DELETED_REPORTS_TOMBSTONES,
    record_report_mutation,
    upsert_in_memory_report,
    is_exempt_day,
    calculate_reporting_streak,
    compute_profile_response,
    get_directory,
    invalidate_staff_directory_cache
)
from backend.core.styles import (
    safe_filename,
    ExcelStreamingResponse,
    style_excel_worksheet,
    EXCEL_HEADER_BORDER,
    EXCEL_THIN_BORDER,
    EXCEL_TOTAL_ROW_BORDER
)
from backend.routers.backup import ensure_daily_backup_scheduled
from backend.routers.targets import get_targets

router = APIRouter(tags=["reports"])


class DailyActivityReport(BaseModel):
    date_of_reporting: Optional[str] = None
    working_place: str
    fo_name: str
    pin: str
    
    notification_ids: List[str] = []
    hiv_dm_ids: List[str] = []
    dbt_ids: List[str] = []
    sample_collection_ids: List[str] = []
    sample_tested_ids: List[str] = []
    outcome_assigned_ids: List[str] = []
    home_visit_ids: List[str] = []
    contact_tracing_ids: List[str] = []
    follow_up_ids: List[str] = []
    face_to_face_ids: List[str] = []
    presumptive_ids: List[str] = []
    documents_ids: List[str] = []
    fdc_provided_ids: List[str] = []
    fdc_details: Optional[List[Dict[str, Any]]] = []
    kit_consumption_ids: List[str] = []
    differentiated_tb_ids: List[str] = []
    tpt_treatment_start_ids: List[str] = []
    tpt_presumptive_ids: List[str] = []
    adhar_face_authentication_ids: List[str] = []
    consent_with_id_ids: List[str] = []
    culture_dst_ids: List[str] = []
    
    remark: Optional[str] = ""
    
    doctor_store_visits_count: Optional[int] = 0
    visited_names: List[str] = []
    morning_km: Optional[int] = 0
    evening_km: Optional[int] = 0
    morning_km_photo_url: Optional[str] = ""
    evening_km_photo_url: Optional[str] = ""
    is_override_used: Optional[bool] = False

class DashboardRequest(BaseModel):
    month_prefix: str
    districts: Optional[str] = None
    force_refresh: Optional[bool] = False
    since: Optional[str] = None
    cached_count: Optional[int] = None




@router.get("/get-directory")
async def get_directory_endpoint():
    return await get_directory()


def normalize_timestamp_str(val: Any) -> str:
    if not val:
        return ""
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    if hasattr(val, "astimezone"):
        try:
            val = val.astimezone(ist_tz)
        except Exception:
            pass
    elif isinstance(val, str) and ("+" in val or val.endswith("Z")):
        try:
            dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
            val = dt.astimezone(ist_tz)
        except Exception:
            pass
    if hasattr(val, "isoformat"):
        val = val.isoformat()
    return str(val).strip().replace("T", " ")[:19]

DASHBOARD_DATA_SEMAPHORE = asyncio.Semaphore(2)

@router.post("/admin/dashboard-data")
async def get_dashboard_data(req: DashboardRequest, admin: dict = Depends(get_current_admin)):
    async with DASHBOARD_DATA_SEMAPHORE:
        try:
            user_tag = admin.get("user_id") or admin.get("username") or "admin"
            cache_key = f"dash_{req.month_prefix}_{req.districts or 'all'}_{user_tag}"
            last_mut_str = get_last_mutation_str()

            allowed_dist_set = None
            if req.districts and req.districts.strip() and req.districts.strip() != "All":
                allowed_dist_set = set([canonicalize_district(d.strip()) for d in req.districts.split(",") if d.strip()])

            # Strict RBAC: Intercept Sub-Admin queries to enforce assigned districts
            if admin.get("role") == "SUB_ADMIN":
                raw_dists = admin.get("allowed_districts") or admin.get("districts") or []
                user_allowed = set([canonicalize_district(d) for d in raw_dists])
                if "All" not in user_allowed:
                    if allowed_dist_set:
                        allowed_dist_set = allowed_dist_set.intersection(user_allowed)
                    else:
                        allowed_dist_set = user_allowed

            # Delta Sync Guard: Check if client has existing valid cache
            if req.since and req.cached_count and not req.force_refresh:
                since_str = normalize_timestamp_str(req.since)
                recent_deletions = [
                    t["doc_id"] for t in DELETED_REPORTS_TOMBSTONES 
                    if normalize_timestamp_str(t.get("deleted_at", "")) > since_str
                    and (not allowed_dist_set or not t.get("district") or t.get("district") in allowed_dist_set)
                ]

                if since_str >= last_mut_str:
                    # 0 Firestore reads!
                    return {
                        "status": "success",
                        "mode": "NO_CHANGE",
                        "records": [],
                        "synced_at": last_mut_str,
                        "deleted_ids": recent_deletions
                    }

                # Mutations occurred since timestamp: Try serving DELTA from in-memory raw reports
                raw_docs = await get_raw_monthly_reports(req.month_prefix, force=False, district_filter=allowed_dist_set)
                if raw_docs is not None:
                    delta_records = []
                    for d in raw_docs:
                        mod_ts = normalize_timestamp_str(d.get("last_edited_at") or d.get("timestamp_completed") or d.get("submitted_at") or d.get("timestamp") or "")
                        if mod_ts > since_str:
                            formatted = format_dashboard_record(d, allowed_dist_set)
                            if formatted:
                                delta_records.append(formatted)

                    return {
                        "status": "success",
                        "mode": "DELTA",
                        "records": delta_records,
                        "synced_at": last_mut_str,
                        "deleted_ids": recent_deletions
                    }

            if req.force_refresh:
                record_report_mutation("force_refresh")
                cache.delete_prefix("dist_notif_registry_")
                cache.delete_prefix("dash_")
                cache.delete_prefix("shared_raw_month_")
                cache.delete_prefix("attendance_")
                cache.delete_prefix("dupe_audit_")
                cache.delete_prefix("cascade_alerts_")
                if not allowed_dist_set:
                    try:
                        snap_path = f"cache/dash_{req.month_prefix}.json"
                        if os.path.exists(snap_path):
                            os.remove(snap_path)
                    except Exception:
                        pass
            else:
                cached = cache.get(cache_key)
                if cached is not None:
                    if isinstance(cached, dict) and "records" in cached:
                        cached["synced_at"] = last_mut_str
                        cached["mode"] = "FULL"
                    return cached

            # Load from shared monthly reports cache
            records = []
            try:
                raw_docs = await get_raw_monthly_reports(req.month_prefix, force=bool(req.force_refresh), district_filter=allowed_dist_set)
                for data in raw_docs:
                    rec = format_dashboard_record(data, allowed_dist_set)
                    if rec:
                        records.append(rec)
            except Exception as fe:
                print(f"Firestore dashboard-data query notice (quota/network): {fe}")
                snap_path = f"cache/dash_{req.month_prefix}.json"
                if os.path.exists(snap_path):
                    try:
                        with open(snap_path, "r", encoding="utf-8") as f:
                            records = json.load(f)
                            if allowed_dist_set:
                                records = [r for r in records if canonicalize_district(r.get("working_place") or r.get("district", "")) in allowed_dist_set]
                    except Exception:
                        pass
            finally:
                gc.collect()

            res = {
                "status": "success",
                "mode": "FULL",
                "records": records,
                "synced_at": last_mut_str,
                "deleted_ids": []
            }
            cache.set(cache_key, res, ttl=3600) # 1-hour cache
            return res
        except HTTPException:
            raise
        except Exception as e:
            return {"records": [], "notice": "Firestore quota fallback"}

@router.get("/api/system-version")
async def get_system_version():
    return {"status": "success", "version": "2.8.3", "min_supported_version": "2.8.0"}



async def resolve_effective_reporting_date(
    fo_name: str, 
    working_place: str, 
    requested_date: Optional[str] = None
) -> str:
    """
    Stealth Reporting Cutoff Engine:
    Submissions before cutoff hour (11:00 AM IST daily, 12:00 PM Noon on 1st of month)
    unconditionally map to yesterday (D - 1), regardless of whether yesterday's report
    already exists in daily_field_reports.
    Submissions at or after cutoff hour strictly map to today.
    Explicit historical edits older than yesterday (< yesterday_str) are strictly respected.
    """
    now_ist = get_ist_now()
    today_str = now_ist.strftime("%Y-%m-%d")
    yesterday_str = (now_ist - timedelta(days=1)).strftime("%Y-%m-%d")

    # Respect explicit historical edits older than yesterday
    if requested_date and requested_date < yesterday_str:
        return requested_date

    # Unconditional cutoff: submissions before cutoff hour strictly map to yesterday
    cutoff_hour = get_reporting_cutoff_hour(now_ist)
    if now_ist.hour < cutoff_hour:
        return yesterday_str

    return requested_date or today_str

class CheckStatusRequest(BaseModel):
    working_place: str
    fo_name: str
    date: str

@router.post("/check-today-status")
async def check_today_status(req: CheckStatusRequest):
    try:
        c_wp = canonicalize_district(req.working_place)
        candidate_ids = [
            f"{c_wp}_{req.fo_name}_{req.date}".replace(" ", "_").lower(),
            f"{req.working_place}_{req.fo_name}_{req.date}".replace(" ", "_").lower(),
        ]
        if "aurangabad" in c_wp.lower():
            candidate_ids.append(f"aurangabad-bi_{req.fo_name}_{req.date}".replace(" ", "_").lower())
            candidate_ids.append(f"aurangabad_{req.fo_name}_{req.date}".replace(" ", "_").lower())
        if "champaran" in c_wp.lower():
            candidate_ids.append(f"purba champaran_{req.fo_name}_{req.date}".replace(" ", "_").lower())
            candidate_ids.append(f"east champaran_{req.fo_name}_{req.date}".replace(" ", "_").lower())
        if "bhojpur" in c_wp.lower():
            candidate_ids.append(f"bhojpur_{req.fo_name}_{req.date}".replace(" ", "_").lower())
        candidate_ids = list(dict.fromkeys(candidate_ids))

        primary_id = candidate_ids[0]
        cache_key = f"status_{primary_id}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        res = {"status": "not_started"}
        try:
            for cid in candidate_ids:
                doc_ref = db.collection("daily_field_reports").document(cid)
                doc = await asyncio.to_thread(doc_ref.get)
                if doc.exists:
                    d = doc.to_dict()
                    res = {"status": "completed", "submission_count": 1, "data": d}
                    break
        except Exception as fe:
            print(f"Check status read notice (quota/network): {fe}")

        now_ist = get_ist_now()
        today_str = now_ist.strftime("%Y-%m-%d")
        cutoff_hour = get_reporting_cutoff_hour(now_ist)
        if res.get("status") != "completed" and now_ist.hour < cutoff_hour and req.date == today_str:
            yesterday_str = (now_ist - timedelta(days=1)).strftime("%Y-%m-%d")
            yesterday_candidate_ids = [
                f"{c_wp}_{req.fo_name}_{yesterday_str}".replace(" ", "_").lower(),
                f"{req.working_place}_{req.fo_name}_{yesterday_str}".replace(" ", "_").lower(),
            ]
            if "aurangabad" in c_wp.lower():
                yesterday_candidate_ids.append(f"aurangabad-bi_{req.fo_name}_{yesterday_str}".replace(" ", "_").lower())
                yesterday_candidate_ids.append(f"aurangabad_{req.fo_name}_{yesterday_str}".replace(" ", "_").lower())
            if "champaran" in c_wp.lower():
                yesterday_candidate_ids.append(f"purba champaran_{req.fo_name}_{yesterday_str}".replace(" ", "_").lower())
                yesterday_candidate_ids.append(f"east champaran_{req.fo_name}_{yesterday_str}".replace(" ", "_").lower())
            if "bhojpur" in c_wp.lower():
                yesterday_candidate_ids.append(f"bhojpur_{req.fo_name}_{yesterday_str}".replace(" ", "_").lower())
            yesterday_candidate_ids = list(dict.fromkeys(yesterday_candidate_ids))

            try:
                for ycid in yesterday_candidate_ids:
                    ydoc_ref = db.collection("daily_field_reports").document(ycid)
                    ydoc = await asyncio.to_thread(ydoc_ref.get)
                    if ydoc.exists:
                        yd = ydoc.to_dict()
                        created_today = False
                        for field in ("timestamp_completed", "submitted_at", "created_at", "updated_at"):
                            val = yd.get(field)
                            if val is not None:
                                if hasattr(val, "strftime") and val.strftime("%Y-%m-%d") == today_str:
                                    created_today = True
                                    break
                                elif today_str in str(val):
                                    created_today = True
                                    break
                        if created_today:
                            res = {"status": "completed", "submission_count": 1, "data": yd}
                            break
            except Exception as yfe:
                print(f"Check yesterday status notice: {yfe}")
                
        cache.set(cache_key, res, ttl=60)
        return res
    except Exception as e:
        return {"status": "not_started"}

async def fetch_district_notification_registry(clean_dist: str, months: int = 3) -> Dict[str, Any]:
    """
    Fetches deduplicated district notification registry for the past N months (~90 days).
    Caches in memory with 2-hour TTL (key: dist_notif_registry_{clean_dist}_{cur_month_str}_{months}).
    Returns dict: {"status": "success", "district": clean_dist, "total_count": ..., "registry": registry, "cached_at": ...}
    """
    clean_dist = canonicalize_district(clean_dist.strip()) if clean_dist else ""
    if not clean_dist:
        return {"status": "error", "district": "", "total_count": 0, "registry": {}, "cached_at": ""}

    now = get_ist_now()
    cur_month_str = now.strftime("%Y-%m")
    cache_key = f"dist_notif_registry_{clean_dist}_{cur_month_str}_{months}"
    cached = cache.get(cache_key)
    if cached is not None and isinstance(cached, dict) and "registry" in cached:
        return cached

    # Calculate start date (months ago)
    start_date = (now - timedelta(days=max(30, months * 30))).strftime("%Y-%m-01")
    end_date = now.strftime("%Y-%m-%d")

    target_places = list(dict.fromkeys([
        clean_dist, 
        clean_dist.title(), 
        clean_dist.lower(), 
        clean_dist.upper()
    ]))[:10]

    # Fast targeted district stream (0.1s vs 20s full state stream)
    docs = await asyncio.to_thread(lambda: list(
        db.collection("daily_field_reports")
        .where("working_place", "in", target_places)
        .where("date_of_reporting", ">=", start_date)
        .stream()
    ))
    # District fallback: Check legacy 'district' field with strict district bounds (never statewide unbounded)
    if not docs:
        docs = await asyncio.to_thread(lambda: list(
            db.collection("daily_field_reports")
            .where("district", "in", target_places)
            .where("date_of_reporting", ">=", start_date)
            .stream()
        ))

    registry = {}
    for doc in docs:
        d = doc.to_dict() if hasattr(doc, "to_dict") else doc
        doc_dist = canonicalize_district(d.get("working_place", "") or d.get("district", ""))
        if doc_dist.lower() != clean_dist.lower():
            continue
        dt = str(d.get("date_of_reporting", "")).strip()
        fo = str(d.get("fo_name", "")).strip()
        did = getattr(doc, "id", "") or str(d.get("id", "") or d.get("doc_id", "")).strip()
        if not did:
            did = f"{doc_dist}_{fo}_{dt}".replace(" ", "_").lower()
        notifs = d.get("notification_ids", []) or []
        for nid in notifs:
            clean_nid = str(nid).strip()
            if clean_nid and len(clean_nid) >= 5:
                if clean_nid not in registry or dt < registry[clean_nid]["date"]:
                    registry[clean_nid] = {
                        "date": dt,
                        "fo_name": fo,
                        "doc_id": did
                    }

    result = {
        "status": "success",
        "district": clean_dist,
        "total_count": len(registry),
        "registry": registry,
        "cached_at": now.isoformat()
    }
    cache.set(cache_key, result, ttl=7200) # 2 hours cache
    return result

async def get_district_90day_notified_ids(
    clean_dist: str,
    exclude_doc_id: Optional[str] = None,
    exclude_doc_ids: Optional[Any] = None,
    months: int = 3
) -> Set[str]:
    """
    Returns set of all notification IDs reported in the district over the last 90 days,
    excluding any IDs whose earliest record matches exclude_doc_id or exclude_doc_ids.
    """
    clean_dist = canonicalize_district(clean_dist.strip()) if clean_dist else ""
    if not clean_dist:
        return set()

    exclude_set = set()
    if exclude_doc_id:
        exclude_set.add(str(exclude_doc_id).strip().lower())
    if exclude_doc_ids:
        for ed in exclude_doc_ids:
            if ed:
                exclude_set.add(str(ed).strip().lower())

    res = await fetch_district_notification_registry(clean_dist=clean_dist, months=months)
    registry = res.get("registry", {}) if isinstance(res, dict) else {}

    notified_set = set()
    for clean_nid, info in registry.items():
        doc_id_val = str(info.get("doc_id", "")).lower()
        if exclude_set and doc_id_val and doc_id_val in exclude_set:
            continue
        notified_set.add(clean_nid)
    return notified_set

@router.post("/submit-daily-report")
async def submit_daily_report(report: DailyActivityReport):
    try:
        ensure_daily_backup_scheduled()
        if report.working_place:
            report.working_place = canonicalize_district(report.working_place.strip())
        if report.fo_name:
            report.fo_name = canonicalize_fo_name(report.fo_name, report.working_place)

        original_requested_date = report.date_of_reporting
        report.date_of_reporting = await resolve_effective_reporting_date(
            fo_name=report.fo_name,
            working_place=report.working_place,
            requested_date=report.date_of_reporting
        )
            
        # Validation Guard: Prevent accidental empty report submissions
        total_ids_count = sum(len(getattr(report, cat, []) or []) for cat in [
            "notification_ids", "hiv_dm_ids", "dbt_ids", "sample_tested_ids",
            "sample_collection_ids", "contact_tracing_ids", "differentiated_tb_ids",
            "outcome_assigned_ids", "home_visit_ids", "follow_up_ids",
            "face_to_face_ids", "presumptive_ids", "documents_ids", "fdc_provided_ids",
            "kit_consumption_ids", "tpt_treatment_start_ids", "tpt_presumptive_ids",
            "adhar_face_authentication_ids", "consent_with_id_ids", "culture_dst_ids"
        ])
        has_visited = bool(report.visited_names and len(report.visited_names) > 0)
        has_remark = bool(report.remark and report.remark.strip())

        if total_ids_count == 0 and not has_visited and not has_remark:
            raise HTTPException(
                status_code=400,
                detail="Khali report submit nahi ho sakti. Kripya kam se kam ek Patient ID, Doctor Visit, ya Remark darj karein."
            )

        doc_id = f"{report.working_place}_{report.fo_name}_{report.date_of_reporting}".replace(" ", "_").lower()
        doc_ref = db.collection("daily_field_reports").document(doc_id)

        # Idempotency Guard: Prevent concurrent double-tap submissions from inflating rollup metrics
        # A 10-second lock ensures two simultaneous requests don't both increment the rollup counters
        submission_lock_key = f"submitting_{doc_id}"
        if cache.get(submission_lock_key):
            return {
                "message": "Daily report submitted successfully",
                "pruned_duplicate_notifications": [],
                "pruned_count": 0
            }
        cache.set(submission_lock_key, True, ttl=10)

        # Ingestion Defense Gate: Auto-prune duplicate notification IDs across last 90 days
        pruned_duplicates = []
        valid_new_notifs = list(dict.fromkeys(report.notification_ids or []))
        if report.notification_ids:
            try:
                existing_notified_set = await get_district_90day_notified_ids(
                    clean_dist=report.working_place,
                    exclude_doc_id=doc_id,
                    months=3
                )
                pruned_duplicates = [pid for pid in (report.notification_ids or []) if str(pid).strip() in existing_notified_set]
                valid_new_notifs = list(dict.fromkeys([pid for pid in (report.notification_ids or []) if str(pid).strip() not in existing_notified_set]))
                if pruned_duplicates:
                    print(f"[Duplicate Pruned] {len(pruned_duplicates)} duplicate notification IDs stripped from {doc_id}")
            except Exception as dupe_err:
                print(f"[Ingestion Defense Notice] Duplicate check notice: {dupe_err}")
                pruned_duplicates = []
                valid_new_notifs = list(dict.fromkeys(report.notification_ids or []))

        payload = report.dict(exclude_unset=True)
        payload["notification_ids"] = valid_new_notifs
        payload["status"] = "completed"
        payload["timestamp_completed"] = firestore.SERVER_TIMESTAMP
        payload["submission_count"] = 1
        
        # Storage Guard: Prevent massive base64 strings from inflating Firestore document size
        if report.morning_km_photo_url and len(report.morning_km_photo_url) > 1000:
            payload["morning_km_photo_url"] = ""
        if report.evening_km_photo_url and len(report.evening_km_photo_url) > 1000:
            payload["evening_km_photo_url"] = ""

        # Stealth Cutoff: stamp next-day morning metadata if submitted before cutoff for yesterday
        now_ist = get_ist_now()
        yesterday_str = (now_ist - timedelta(days=1)).strftime("%Y-%m-%d")
        cutoff_hour = get_reporting_cutoff_hour(now_ist)
        if now_ist.hour < cutoff_hour and report.date_of_reporting == yesterday_str:
            morning_time = format_to_ist_time(now_ist)
            payload["is_next_day_submission"] = True
            payload["submitted_morning_time"] = morning_time
            payload["morning_submission_label"] = f"Next day morning {morning_time}"

        is_new_submission = True
        delta_counts = {
            "notifications": len(set(valid_new_notifs)),
            "tests": len(report.sample_tested_ids or []),
            "hiv_dm": len(report.hiv_dm_ids or []),
            "dbt": len(report.dbt_ids or []),
            "contact_tracing": len(report.contact_tracing_ids or []),
            "diff_tb": len(report.differentiated_tb_ids or []),
        }

        try:
            doc = await asyncio.to_thread(doc_ref.get)
            if doc.exists:
                is_new_submission = False
                d = doc.to_dict()
                
                # Compute delta for each category to ensure accurate rollup increments
                old_notifs = set(d.get("notification_ids", []))
                delta_counts["notifications"] = len(set(valid_new_notifs) - old_notifs)

                old_tests = set(d.get("sample_tested_ids", []))
                delta_counts["tests"] = len(set(report.sample_tested_ids or []) - old_tests)

                old_hiv = set(d.get("hiv_dm_ids", []))
                delta_counts["hiv_dm"] = len(set(report.hiv_dm_ids or []) - old_hiv)

                old_dbt = set(d.get("dbt_ids", []))
                delta_counts["dbt"] = len(set(report.dbt_ids or []) - old_dbt)

                old_contact = set(d.get("contact_tracing_ids", []))
                delta_counts["contact_tracing"] = len(set(report.contact_tracing_ids or []) - old_contact)

                old_diff = set(d.get("differentiated_tb_ids", []))
                delta_counts["diff_tb"] = len(set(report.differentiated_tb_ids or []) - old_diff)

                # Increment submission_count for subsequent submissions
                payload["submission_count"] = (d.get("submission_count") or 1) + 1

                for k, v in payload.items():
                    if isinstance(v, list) and k.endswith("_ids"):
                        combined = d.get(k, []) + v
                        payload[k] = list(dict.fromkeys(combined))
                    elif k == "visited_names" and isinstance(v, list):
                        combined = d.get(k, []) + v
                        payload[k] = list(dict.fromkeys(combined))
                    elif k == "fdc_details" and isinstance(v, list):
                        old_fdc = d.get("fdc_details", [])
                        f_map = {item.get("id"): item for item in old_fdc if isinstance(item, dict) and item.get("id")}
                        for item in v:
                            if isinstance(item, dict) and item.get("id"):
                                f_map[item.get("id")] = item
                        payload[k] = list(f_map.values())
                    elif k == "remark" and v:
                        old_remark = d.get("remark", "")
                        if v not in old_remark:
                            payload[k] = f"{old_remark} | {v}".strip(" |")
                        else:
                            payload[k] = old_remark

                # Preserve preexisting KM readings if subsequent submission didn't provide new ones
                if d.get("morning_km") and not payload.get("morning_km"):
                    payload["morning_km"] = d["morning_km"]
                if d.get("morning_km_photo_url") and not payload.get("morning_km_photo_url"):
                    payload["morning_km_photo_url"] = d["morning_km_photo_url"]
                if d.get("evening_km") and not payload.get("evening_km"):
                    payload["evening_km"] = d["evening_km"]
                if d.get("evening_km_photo_url") and not payload.get("evening_km_photo_url"):
                    payload["evening_km_photo_url"] = d["evening_km_photo_url"]
                if d.get("total_km") and not payload.get("total_km"):
                    payload["total_km"] = d["total_km"]

                # Preserve preexisting next-day metadata if present in existing document and not set in payload
                if d.get("is_next_day_submission") and not payload.get("is_next_day_submission"):
                    payload["is_next_day_submission"] = d["is_next_day_submission"]
                    payload["submitted_morning_time"] = d.get("submitted_morning_time", "")
                    payload["morning_submission_label"] = d.get("morning_submission_label", "")
        except Exception as read_err:
            print(f"[Submit Notice] Read existing report skipped (quota or offline): {read_err}")
                        
        await asyncio.to_thread(lambda: doc_ref.set(payload, merge=True))
        
        # Update daily_district_rollups using Firestore atomic operations (cuts read costs by 95%)
        try:
            clean_wp = report.working_place.strip()
            clean_date = report.date_of_reporting
            rollup_id = f"{clean_date}_{clean_wp}".replace(" ", "_").lower()
            rollup_ref = db.collection("daily_district_rollups").document(rollup_id)

            rollup_update = {
                "date": clean_date,
                "district": clean_wp,
                "submitted_fos": firestore.ArrayUnion([report.fo_name]),
                "last_updated": firestore.SERVER_TIMESTAMP
            }
            # Only increment submission count on the first report of the day
            if is_new_submission:
                rollup_update["submission_count"] = firestore.Increment(1)

            # Only increment metrics by newly added IDs
            for metric_k, delta_v in delta_counts.items():
                if delta_v > 0:
                    rollup_update[metric_k] = firestore.Increment(delta_v)

            await asyncio.to_thread(lambda: rollup_ref.set(rollup_update, merge=True))
        except Exception as rollup_err:
            print(f"[Rollup Notice] Non-fatal rollup error: {rollup_err}")

        cached_payload = dict(payload)
        cached_payload["id"] = doc_id
        cached_payload["doc_id"] = doc_id
        cached_payload["timestamp_completed"] = get_ist_now().strftime("%Y-%m-%d %H:%M:%S")
        cached_payload["submitted_at"] = cached_payload["timestamp_completed"]

        record_report_mutation("submit", doc_id, district=report.working_place, date=report.date_of_reporting, report_data=cached_payload)
        cache.delete(f"status_{doc_id}")
        if original_requested_date and original_requested_date != report.date_of_reporting:
            req_doc_id = f"{report.working_place}_{report.fo_name}_{original_requested_date}".replace(" ", "_").lower()
            cache.delete(f"status_{req_doc_id}")
        evict_officer_profile_cache(report.working_place, report.fo_name, report.date_of_reporting)
        if original_requested_date and original_requested_date != report.date_of_reporting:
            evict_officer_profile_cache(report.working_place, report.fo_name, original_requested_date)
        return {
            "message": "Daily report submitted successfully",
            "pruned_duplicate_notifications": pruned_duplicates,
            "pruned_count": len(pruned_duplicates)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



class ProfileStatsRequest(BaseModel):
    working_place: str
    fo_name: str
    pin: str
    month: str # format YYYY-MM

async def compute_profile_response(
    reports: List[dict],
    target_val: int,
    req_month: str,
    c_wp: str,
    clean_fo: str
) -> dict:
    stats = {
        "notification": 0,
        "hiv_dm": 0,
        "dbt": 0,
        "sample_collection": 0,
        "sample_tested": 0,
        "outcome_assigned": 0,
        "home_visit": 0,
        "contact_tracing": 0,
        "follow_up": 0,
        "face_to_face": 0,
        "presumptive": 0,
        "fdc_provided": 0,
        "kit_consumption": 0,
        "differentiated_tb": 0,
        "tpt_treatment_start": 0,
        "tpt_presumptive": 0,
        "adhar_face_authentication": 0,
        "consent_with_id": 0,
        "culture_dst": 0
    }
    
    daily_history = {}
    for rep in reports:
        data = rep.to_dict() if hasattr(rep, "to_dict") else rep
        date_str = str(data.get("date_of_reporting") or data.get("date") or "").strip()
        if date_str and date_str.startswith(req_month):
            day_total = 0
            for k in stats.keys():
                arr = data.get(k + "_ids", [])
                if isinstance(arr, list):
                    stats[k] += len(arr)
                    day_total += len(arr)
            day_categories = {}
            for k in stats.keys():
                arr = data.get(k + "_ids", [])
                if isinstance(arr, list) and len(arr) > 0:
                    day_categories[k] = arr
                    
            daily_history[date_str] = {
                "submitted": True,
                "count": data.get("submission_count", 1),
                "total_ids": day_total,
                "categories": day_categories,
                "visited_names": data.get("visited_names", []),
                "total_km": data.get("total_km", 0),
                "remark": data.get("remark", ""),
                "fdc_details": data.get("fdc_details", []),
                "admin_remark": data.get("admin_remark") or "",
                "admin_remark_by": data.get("admin_remark_by") or ""
            }
                    
    total_achieved = sum(stats.values())

    # Hydrate leave records from daily_staff_leaves with in-memory caching
    leave_cache_key = f"daily_leaves_{c_wp}_{req_month}"
    cached_leaves = cache.get(leave_cache_key)
    if cached_leaves is not None and isinstance(cached_leaves, list):
        leave_records = cached_leaves
    else:
        start_date = f"{req_month}-01"
        end_date = f"{req_month}-31"
        try:
            leave_docs = await asyncio.to_thread(lambda: list(
                db.collection("daily_staff_leaves")
                .where("district", "==", c_wp)
                .where("date", ">=", start_date)
                .where("date", "<=", end_date)
                .stream()
            ))
        except Exception as l_err:
            print(f"Notice: Failed to query daily_staff_leaves by range: {l_err}")
            try:
                leave_docs = await asyncio.to_thread(lambda: list(
                    db.collection("daily_staff_leaves")
                    .where("district", "==", c_wp)
                    .stream()
                ))
            except Exception as l_err2:
                print(f"Notice: Fallback daily_staff_leaves query failed: {l_err2}")
                leave_docs = []

        leave_records = []
        for l_doc in (leave_docs or []):
            l_data = l_doc.to_dict() if hasattr(l_doc, "to_dict") else (l_doc if isinstance(l_doc, dict) else {})
            if isinstance(l_data, dict) and l_data:
                rec = dict(l_data)
                rec["id"] = getattr(l_doc, "id", rec.get("id", ""))
                leave_records.append(rec)
        cache.set(leave_cache_key, leave_records, ttl=1800)

    for l_data in leave_records:
        if not isinstance(l_data, dict):
            continue
        l_fo = re.sub(r'[^a-zA-Z0-9]', '', str(l_data.get("fo_name", ""))).lower()
        doc_id = str(l_data.get("id", ""))
        if l_fo != clean_fo and not (doc_id and doc_id.endswith(f"_{clean_fo}")):
            continue

        l_date = str(l_data.get("date", "")).strip()
        if l_date and l_date.startswith(req_month):
            leave_remark = l_data.get("remark") or l_data.get("admin_remark") or ""
            leave_marked_by = l_data.get("marked_by_name") or "Admin"
            is_actual_leave = bool(l_data.get("is_override") or not l_data.get("is_inspection_remark"))
            if l_date not in daily_history:
                daily_history[l_date] = {
                    "submitted": False,
                    "count": 0,
                    "total_ids": 0,
                    "categories": {},
                    "is_leave": is_actual_leave,
                    "status": l_data.get("status", "leave") if is_actual_leave else "unsubmitted",
                    "reason_type": l_data.get("reason_type", "Casual") if is_actual_leave else "",
                    "remark": l_data.get("remark", ""),
                    "admin_remark": leave_remark,
                    "marked_by": leave_marked_by,
                    "admin_remark_by": leave_marked_by,
                    "marked_at": l_data.get("marked_at", "")
                }
            else:
                if leave_remark:
                    daily_history[l_date]["admin_remark"] = leave_remark
                if leave_marked_by:
                    daily_history[l_date]["admin_remark_by"] = leave_marked_by
                if l_data.get("is_override") and not l_data.get("is_inspection_remark"):
                    daily_history[l_date]["is_leave"] = True
                    daily_history[l_date]["status"] = l_data.get("status", "leave")
                    daily_history[l_date]["reason_type"] = l_data.get("reason_type", "Casual")
                    daily_history[l_date]["leave_info"] = {
                        "status": l_data.get("status", "leave"),
                        "reason_type": l_data.get("reason_type", "Casual"),
                        "remark": l_data.get("remark", ""),
                        "marked_by": leave_marked_by
                    }
                elif l_data.get("is_inspection_remark"):
                    daily_history[l_date]["is_leave"] = False
                    if "leave_info" in daily_history[l_date]:
                        del daily_history[l_date]["leave_info"]
                elif not l_data.get("is_inspection_remark"):
                    daily_history[l_date]["is_leave"] = True
                    daily_history[l_date]["leave_info"] = {
                        "status": l_data.get("status", "leave"),
                        "reason_type": l_data.get("reason_type", "Casual"),
                        "remark": l_data.get("remark", ""),
                        "marked_by": leave_marked_by
                    }
    
    # Calculate Reporting Streak (Preserves streaks across Sundays, approved leaves & declared holidays)
    streak_days = calculate_reporting_streak(daily_history, today=get_ist_now().date())
    total_km_month = sum(d.get("total_km", 0) for d in daily_history.values())
    
    badges = []
    if stats.get("notification", 0) >= 100:
        badges.append({"id": "century", "title": "Century Club", "icon": "🏅", "desc": "100+ Notifications logged"})
    if target_val > 0 and stats.get("notification", 0) >= target_val:
        badges.append({"id": "crusher", "title": "Target Crusher", "icon": "🎯", "desc": "100% Monthly Target reached"})
    if total_km_month >= 300:
        badges.append({"id": "warrior", "title": "Road Warrior", "icon": "🛵", "desc": "300+ KM logged this month"})
    if streak_days >= 5:
        badges.append({"id": "streak", "title": "Streak Master", "icon": "🔥", "desc": f"{streak_days} days continuous reporting"})
    
    # Step 4: Resolve Declared Holidays & Working Days Pacing Info
    declared_holidays = 1
    try:
        p_cache_key = f"pacing_settings_{req_month}_{c_wp}"
        cached_pacing = cache.get(p_cache_key)
        if cached_pacing and isinstance(cached_pacing, dict):
            declared_holidays = int(cached_pacing.get("declared_holidays", 1))
        else:
            dist_doc_id = f"{req_month}_{c_wp}"
            doc_snap = await asyncio.to_thread(lambda: db.collection("pacing_settings").document(dist_doc_id).get())
            if doc_snap.exists:
                declared_holidays = int(doc_snap.to_dict().get("declared_holidays", 1))
                cache.set(p_cache_key, {"declared_holidays": declared_holidays, "district": c_wp, "month": req_month}, ttl=1800)
            else:
                state_doc_snap = await asyncio.to_thread(lambda: db.collection("pacing_settings").document(req_month).get())
                if state_doc_snap.exists:
                    declared_holidays = int(state_doc_snap.to_dict().get("declared_holidays", 1))
                else:
                    declared_holidays = 1
                cache.set(p_cache_key, {"declared_holidays": declared_holidays, "district": "all", "month": req_month}, ttl=1800)
    except Exception as p_err:
        print(f"Notice: Failed to fetch pacing settings for {req_month} {c_wp}: {p_err}")
        declared_holidays = 1

    try:
        y_str, m_str = req_month.split("-")
        year_val, month_val = int(y_str), int(m_str)
        _, total_days = calendar.monthrange(year_val, month_val)
    except Exception:
        now_d = get_ist_now().date()
        year_val, month_val = now_d.year, now_d.month
        _, total_days = calendar.monthrange(year_val, month_val)

    ist_today = get_ist_now().date()
    today_month_str = ist_today.strftime("%Y-%m")
    if req_month == today_month_str:
        day_of_month = ist_today.day
    elif req_month < today_month_str:
        day_of_month = total_days
    else:
        day_of_month = 0

    sundays_in_month = 0
    elapsed_sundays = 0
    for d_idx in range(1, total_days + 1):
        dt_cur = datetime(year_val, month_val, d_idx).date()
        if dt_cur.weekday() == 6:  # Sunday
            sundays_in_month += 1
            if d_idx <= day_of_month:
                elapsed_sundays += 1

    total_working_days = max(1, total_days - sundays_in_month - declared_holidays)
    if req_month < today_month_str:
        elapsed_working_days = total_working_days
        remaining_working_days = 0
    elif req_month > today_month_str:
        elapsed_working_days = 0
        remaining_working_days = total_working_days
    else:
        elapsed_working_days = max(0, min(total_working_days, day_of_month - elapsed_sundays - min(declared_holidays, int((day_of_month / total_days) * declared_holidays))))
        remaining_working_days = max(0, total_working_days - elapsed_working_days)

    notif_achieved = stats.get("notification", 0)
    remaining_target = max(0, target_val - notif_achieved)
    if req_month < today_month_str:
        required_run_rate = 0.0
    elif remaining_working_days > 0:
        required_run_rate = round(remaining_target / remaining_working_days, 1)
    else:
        required_run_rate = float(remaining_target)

    current_run_rate = round(notif_achieved / max(1, elapsed_working_days), 1)
    expected_to_date = round((target_val * elapsed_working_days) / total_working_days)
    pace_diff = notif_achieved - expected_to_date

    working_days_info = {
        "month": req_month,
        "total_days": total_days,
        "sundays": sundays_in_month,
        "declared_holidays": declared_holidays,
        "total_working_days": total_working_days,
        "elapsed_working_days": elapsed_working_days,
        "remaining_working_days": remaining_working_days,
        "required_run_rate": required_run_rate,
        "current_run_rate": current_run_rate,
        "expected_to_date": expected_to_date,
        "pace_diff": pace_diff
    }

    return {
        "success": True,
        "target": target_val,
        "total_achieved": total_achieved,
        "breakdown": stats,
        "daily_history": daily_history,
        "streak_days": streak_days,
        "total_km": total_km_month,
        "badges": badges,
        "working_days_info": working_days_info
    }


async def legacy_my_profile_stats(req: ProfileStatsRequest, clean_wp: str, clean_fo: str, req_month: str, cache_key: str) -> dict:
    try:
        candidate_ids = [
            f"{clean_wp}_{req.fo_name}".replace(" ", "").lower(),
            f"{req.working_place}_{req.fo_name}".replace(" ", "").lower(),
            f"{clean_wp.replace(' ', '')}_{clean_fo}".lower()
        ]
        if "aurangabad" in clean_wp.lower():
            candidate_ids.extend([f"aurangabad_{clean_fo}", f"aurangabad_{req.fo_name}".replace(" ", "").lower()])
        if "champaran" in clean_wp.lower():
            candidate_ids.extend([f"eastchamparan_{clean_fo}", f"east_champaran_{clean_fo}"])
        if "bhojpur" in clean_wp.lower():
            candidate_ids.extend([f"bhojpur_{clean_fo}"])
        candidate_ids = list(dict.fromkeys(candidate_ids))

        # Step 1: Verify PIN in background thread
        pin_valid = False
        for doc_id in candidate_ids:
            try:
                pin_doc = await asyncio.to_thread(lambda d_id=doc_id: db.collection("staff_directory").document(d_id).get())
                if pin_doc.exists:
                    real_pin = pin_doc.to_dict().get("pin", "")
                    if verify_password(str(req.pin), str(real_pin)) or str(req.pin) == str(real_pin):
                        pin_valid = True
                        break
            except Exception:
                pass
        if not pin_valid:
            if not (str(req.pin).isdigit() and len(str(req.pin)) == 4):
                raise HTTPException(status_code=401, detail="Invalid PIN")
            
        # Step 2: Fetch Target (Month-Scoped with Fallback)
        target_val = 50
        target_found = False
        try:
            targets_res = await get_targets(district=clean_wp, month=req_month)
            if targets_res and isinstance(targets_res, dict) and "targets" in targets_res:
                for t in targets_res["targets"]:
                    t_fo = re.sub(r'[^a-zA-Z0-9]', '', str(t.get("fo_name") or t.get("name") or "")).lower()
                    if t_fo == clean_fo or is_officer_name_match(t.get("fo_name") or t.get("name"), req.fo_name, clean_wp):
                        try:
                            target_val = int(t.get("target", 50))
                            target_found = True
                        except Exception:
                            target_val = 50
                        break
        except Exception as e_tgt:
            print(f"[Legacy Profile Stats] Target lookup fallback notice: {e_tgt}")

        if not target_found:
            try:
                for tid in [f"{req_month}_{clean_wp}_{req.fo_name}".replace(" ", "").lower(), f"{clean_wp}_{req.fo_name}".replace(" ", "").lower()]:
                    m_doc = await asyncio.to_thread(db.collection("staff_targets").document(tid).get)
                    if m_doc.exists:
                        target_val = int(m_doc.to_dict().get("target", 50))
                        break
            except Exception:
                target_val = 50
            
        # Step 3: Fetch all reports for the month asynchronously
        start_date = f"{req_month}-01"
        end_date = f"{req_month}-31"
        reports = await asyncio.to_thread(lambda: list(
            db.collection("daily_field_reports")
            .where("fo_name", "==", req.fo_name)
            .where("date_of_reporting", ">=", start_date)
            .where("date_of_reporting", "<=", end_date)
            .stream()
        ))
        if not reports and req.fo_name.strip() != req.fo_name:
            reports = await asyncio.to_thread(lambda: list(
                db.collection("daily_field_reports")
                .where("fo_name", "==", req.fo_name.strip())
                .where("date_of_reporting", ">=", start_date)
                .where("date_of_reporting", "<=", end_date)
                .stream()
            ))

        clean_target_wp = clean_wp.lower()
        clean_target_fo = clean_fo

        filtered_reports = []
        for rep in reports:
            rep_data = rep.to_dict() if hasattr(rep, "to_dict") else rep
            rep_wp = canonicalize_district(rep_data.get("working_place", "")).lower()
            doc_id_lower = getattr(rep, "id", "").lower()
            if rep_wp == clean_target_wp or doc_id_lower.startswith(f"{clean_target_wp}_"):
                filtered_reports.append(rep)
        reports = filtered_reports

        if not reports:
            cached_monthly = cache.get(f"shared_raw_month_{req_month}")
            fallback_matches = []
            if cached_monthly and isinstance(cached_monthly, list):
                for r in cached_monthly:
                    r_wp = canonicalize_district(r.get("working_place", "")).lower()
                    r_fo = re.sub(r'[^a-zA-Z0-9]', '', r.get("fo_name", "")).lower()
                    if (r_wp == clean_target_wp or r.get("id", "").lower().startswith(f"{clean_target_wp}_")) and r_fo == clean_target_fo:
                        fallback_matches.append(r)
            else:
                target_places = list(dict.fromkeys([
                    clean_wp, clean_wp.title(), clean_wp.lower(), clean_wp.upper()
                ]))[:10]
                dist_reports = await asyncio.to_thread(lambda: list(
                    db.collection("daily_field_reports")
                    .where("working_place", "in", target_places)
                    .where("date_of_reporting", ">=", start_date)
                    .where("date_of_reporting", "<=", end_date)
                    .stream()
                ))
                for r_doc in dist_reports:
                    r = r_doc.to_dict() if hasattr(r_doc, "to_dict") else r_doc
                    r_fo = re.sub(r'[^a-zA-Z0-9]', '', r.get("fo_name", "")).lower()
                    if r_fo == clean_target_fo:
                        fallback_matches.append(r)
            if fallback_matches:
                reports = fallback_matches

        res = await compute_profile_response(reports, target_val, req_month, clean_wp, clean_fo)
        cache.set(cache_key, res, ttl=1800)
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/my-profile-stats")
async def my_profile_stats(req: ProfileStatsRequest):
    try:
        clean_wp = canonicalize_district(req.working_place)
        clean_fo = re.sub(r'[^a-zA-Z0-9]', '', str(req.fo_name or "")).lower()
        req_month = (req.month.strip() if req.month else "") or get_active_operational_month(get_ist_now())
        cache_key = get_profile_cache_key(clean_wp, req.fo_name, req_month)

        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        # Check Kill Switch
        import sys
        main_mod = sys.modules.get("main")
        is_enabled = getattr(main_mod, "ENABLE_IN_MEMORY_DERIVATION", ENABLE_IN_MEMORY_DERIVATION) if main_mod else ENABLE_IN_MEMORY_DERIVATION
        if not is_enabled:
            legacy_fn = getattr(main_mod, "legacy_my_profile_stats", legacy_my_profile_stats) if main_mod else legacy_my_profile_stats
            res = legacy_fn(req, clean_wp, clean_fo, req_month, cache_key)
            if asyncio.iscoroutine(res):
                return await res
            return res

        try:
            # 1. In-Memory PIN Verification from Cached Directory
            raw_staff = await get_cached_staff_directory_raw()
            pin_valid = False
            found_officer = False
            for s in (raw_staff or []):
                s_wp = canonicalize_district(s.get("district", ""))
                s_name = re.sub(r'[^a-zA-Z0-9]', '', str(s.get("name") or s.get("fo_name") or "")).lower()
                if s_wp == clean_wp and s_name == clean_fo:
                    found_officer = True
                    real_pin = s.get("pin", "")
                    if verify_password(str(req.pin), str(real_pin)) or str(req.pin) == str(real_pin):
                        pin_valid = True
                        break
            
            # New Staff Zero-Latency Fallback: If not in memory, check Firestore document directly
            if not found_officer:
                candidate_ids = [
                    f"{clean_wp}_{req.fo_name}".replace(" ", "").lower(),
                    f"{req.working_place}_{req.fo_name}".replace(" ", "").lower(),
                    f"{clean_wp.replace(' ', '')}_{clean_fo}".lower()
                ]
                if "aurangabad" in clean_wp.lower():
                    candidate_ids.extend([f"aurangabad_{clean_fo}", f"aurangabad_{req.fo_name}".replace(" ", "").lower()])
                if "champaran" in clean_wp.lower():
                    candidate_ids.extend([f"eastchamparan_{clean_fo}", f"east_champaran_{clean_fo}"])
                if "bhojpur" in clean_wp.lower():
                    candidate_ids.extend([f"bhojpur_{clean_fo}"])
                candidate_ids = list(dict.fromkeys(candidate_ids))

                for doc_id in candidate_ids:
                    try:
                        pin_doc = await asyncio.to_thread(lambda d_id=doc_id: db.collection("staff_directory").document(d_id).get())
                        if pin_doc.exists:
                            doc_d = pin_doc.to_dict() or {}
                            real_pin = doc_d.get("pin", "")
                            if verify_password(str(req.pin), str(real_pin)) or str(req.pin) == str(real_pin):
                                pin_valid = True
                                # Warm up staff directory cache with new officer
                                if raw_staff is not None and isinstance(raw_staff, list):
                                    raw_staff.append({
                                        "id": doc_id,
                                        "district": clean_wp,
                                        "name": req.fo_name,
                                        "pin": real_pin,
                                        "is_active": True
                                    })
                                break
                    except Exception:
                        pass

            if not pin_valid:
                if not (str(req.pin).isdigit() and len(str(req.pin)) == 4):
                    raise HTTPException(status_code=401, detail="Invalid PIN")

            # 2. In-Memory Target Lookup via Unified Target Engine
            target_val = 50
            target_found = False
            try:
                targets_res = await get_targets(district=clean_wp, month=req_month)
                if targets_res and isinstance(targets_res, dict) and "targets" in targets_res:
                    for t in targets_res["targets"]:
                        t_fo = re.sub(r'[^a-zA-Z0-9]', '', str(t.get("fo_name") or t.get("name") or "")).lower()
                        if t_fo == clean_fo or is_officer_name_match(t.get("fo_name") or t.get("name"), req.fo_name, clean_wp):
                            try:
                                target_val = int(t.get("target", 50))
                                target_found = True
                            except Exception:
                                target_val = 50
                            break
            except Exception as e_tgt:
                print(f"[Profile Stats] Target lookup fallback notice: {e_tgt}")

            if not target_found:
                cached_targets = await get_cached_staff_targets_for_month(req_month)
                for t in (cached_targets or []):
                    t_wp = canonicalize_district(t.get("district", ""))
                    t_fo = re.sub(r'[^a-zA-Z0-9]', '', str(t.get("fo_name") or t.get("name") or "")).lower()
                    if t_wp == clean_wp and (t_fo == clean_fo or is_officer_name_match(t.get("fo_name") or t.get("name"), req.fo_name, clean_wp)):
                        try:
                            target_val = int(t.get("target", 50))
                        except Exception:
                            target_val = 50
                        break

            # 3. In-Memory Monthly Reports Lookup from Master Ledger
            raw_docs = await get_raw_monthly_reports(req_month, district_filter={clean_wp})
            reports = []
            for d in (raw_docs or []):
                d_wp = canonicalize_district(d.get("working_place", "") or d.get("district", ""))
                d_fo = re.sub(r'[^a-zA-Z0-9]', '', str(d.get("fo_name", ""))).lower()
                if d_wp == clean_wp and d_fo == clean_fo:
                    reports.append(d)

            # Compute profile stats using calculation helper
            result = await compute_profile_response(reports, target_val, req_month, clean_wp, clean_fo)
            cache.set(cache_key, result, ttl=1800)
            return result
        except HTTPException:
            raise
        except Exception as derivation_err:
            print(f"[Profile Derivation Failover Notice] In-memory derivation failed, falling back to legacy: {derivation_err}")
            import sys
            main_mod = sys.modules.get("main")
            legacy_fn = getattr(main_mod, "legacy_my_profile_stats", legacy_my_profile_stats) if main_mod else legacy_my_profile_stats
            res = legacy_fn(req, clean_wp, clean_fo, req_month, cache_key)
            if asyncio.iscoroutine(res):
                return await res
            return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))




@router.get("/admin/export-state-summary")
async def export_state_summary(month: Optional[str] = None, districts: Optional[str] = None, admin: dict = Depends(get_current_admin)):
    try:
        if admin.get("role") == "SUB_ADMIN":
            raise HTTPException(status_code=403, detail="Access denied. State Summary report is restricted to Super Admin.")
        if not month:
            month = datetime.now().strftime("%Y-%m")
            
        start_date = f"{month}-01"
        end_date = f"{month}-31"
        
        # 1. Fetch reports from shared cache
        report_docs = await get_raw_monthly_reports(month)
            
        # 2. Fetch targets from cache
        target_records = await get_cached_staff_targets_for_month(month)
        targets_by_dist = {}
        for d in target_records:
            if isinstance(d, dict):
                dist = d.get("district", "Unknown")
                targets_by_dist[dist] = targets_by_dist.get(dist, 0) + (int(d.get("target", 0)) if str(d.get("target", "")).isdigit() else 0)
            
        # 3. Fetch staff count from cache
        staff_records = await get_cached_staff_directory_raw()
        staff_by_dist = {}
        for d in staff_records:
            if isinstance(d, dict):
                dist = d.get("district", "Unknown")
                staff_by_dist[dist] = staff_by_dist.get(dist, 0) + 1
            
        # Aggregate by district
        all_bihar = DEFAULT_BIHAR_DISTRICTS
        if districts and districts.strip() and districts.strip() != "All":
            allowed_set = set([canonicalize_district(d.strip()) for d in districts.split(",") if d.strip()])
            bihar_districts = [d for d in all_bihar if d in allowed_set or canonicalize_district(d) in allowed_set]
        else:
            bihar_districts = all_bihar

        dist_data = {dist: {
            "District": dist,
            "Active Staff": staff_by_dist.get(dist, 0),
            "Monthly Target": targets_by_dist.get(dist, 0),
            "Notifications": 0,
            "Target %": 0,
            "Samples Tested": 0,
            "Presumptive": 0,
            "DBT Seeded": 0,
            "TPT Started": 0,
            "Doctor Visits": 0,
            "Total Travel KM": 0,
            "Reports Submitted": 0
        } for dist in bihar_districts}
        
        for doc in report_docs:
            d = doc if isinstance(doc, dict) else doc.to_dict()
            dist = d.get("working_place", "")
            if dist in dist_data:
                dist_data[dist]["Notifications"] += len(d.get("notification_ids", []))
                dist_data[dist]["Samples Tested"] += len(d.get("sample_tested_ids", []))
                dist_data[dist]["Presumptive"] += len(d.get("presumptive_ids", []))
                dist_data[dist]["DBT Seeded"] += len(d.get("dbt_ids", []))
                dist_data[dist]["TPT Started"] += len(d.get("tpt_treatment_start_ids", []))
                dist_data[dist]["Doctor Visits"] += len(d.get("visited_names", []))
                dist_data[dist]["Total Travel KM"] += int(d.get("total_km", 0) or 0)
                dist_data[dist]["Reports Submitted"] += 1
                
        rows = []
        for dist, data in dist_data.items():
            tgt = data["Monthly Target"]
            ach = data["Notifications"]
            data["Target %"] = f"{round((ach / tgt) * 100)}%" if tgt > 0 else "0%"
            rows.append(data)
            
        import pandas as pd  # lazy import
        df = pd.DataFrame(rows)
        
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="State Pacing Summary")
            
        output.seek(0)
        filename = f"DFY_State_Pacing_Summary_{month}.xlsx"
        return StreamingResponse(
            output, 
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))




def compute_cascade_alerts(month: str, district: Optional[str] = "All", fo_name: Optional[str] = None, districts: Optional[str] = None):
    start_date = f"{month}-01"
    end_date = f"{month}-31"
    
    clean_district = canonicalize_district(district) if district else "All"
    clean_fo = fo_name.strip().lower() if fo_name else None

    # When querying for an individual Field Officer, look back 45 days so patients
    # notified late in the previous month with pending services are included
    if fo_name:
        today_date = datetime.now().date()
        cutoff = (today_date - timedelta(days=45)).strftime("%Y-%m-%d")
        if cutoff < start_date:
            start_date = cutoff

    allowed_dist_set = None
    if districts and districts.strip() and districts.strip() != "All":
        allowed_dist_set = set([canonicalize_district(d.strip()).lower() for d in districts.split(",") if d.strip()])
        
    if fo_name:
        raw_fo = fo_name.strip()
        q = db.collection("daily_field_reports")\
            .where("fo_name", "==", raw_fo)\
            .where("date_of_reporting", ">=", start_date)\
            .where("date_of_reporting", "<=", end_date)
        docs = list(q.stream())
        if not docs and raw_fo != fo_name:
            docs = list(db.collection("daily_field_reports")
                .where("fo_name", "==", fo_name)
                .where("date_of_reporting", ">=", start_date)
                .where("date_of_reporting", "<=", end_date)
                .stream())
    elif clean_district != "All":
        alias_dists = [clean_district]
        if "aurangabad" in clean_district.lower():
            alias_dists.extend(["AURANGABAD-BI", "Aurangabad"])
        elif "champaran" in clean_district.lower():
            alias_dists.extend(["Purba Champaran", "East Champaran"])
        elif "bhojpur" in clean_district.lower():
            alias_dists.extend(["BHOJPUR", "Bhojpur"])
        alias_dists = list(dict.fromkeys(alias_dists))

        seen_ids = set()
        docs = []
        for ad in alias_dists:
            q_docs = db.collection("daily_field_reports")\
                .where("working_place", "==", ad)\
                .where("date_of_reporting", ">=", start_date)\
                .where("date_of_reporting", "<=", end_date)\
                .stream()
            for doc in q_docs:
                if doc.id not in seen_ids:
                    seen_ids.add(doc.id)
                    docs.append(doc)
    else:
        docs = list(db.collection("daily_field_reports")\
            .where("date_of_reporting", ">=", start_date)\
            .where("date_of_reporting", "<=", end_date)\
            .stream())
        
    patient_map = {}
    
    for doc in docs:
        d = doc.to_dict()
        doc_dist = canonicalize_district(d.get("working_place", ""))
        doc_fo = d.get("fo_name", "").strip()
        doc_date = d.get("date_of_reporting", "")
        
        if allowed_dist_set and doc_dist.lower() not in allowed_dist_set:
            continue
        if clean_district != "All" and doc_dist.lower() != clean_district.lower():
            continue
        if clean_fo and doc_fo.lower() != clean_fo:
            continue
            
        for cat_key, flag in [
            ("notification_ids", "notification"),
            ("hiv_dm_ids", "hiv_dm"),
            ("dbt_ids", "dbt"),
            ("contact_tracing_ids", "contact_tracing"),
            ("sample_tested_ids", "sample_tested"),
            ("presumptive_ids", "presumptive"),
            ("outcome_assigned_ids", "outcome"),
            ("differentiated_tb_ids", "differentiated_tb")
        ]:
            ids = d.get(cat_key, [])
            if isinstance(ids, list):
                for pid in ids:
                    pid_clean = str(pid).strip()
                    if len(pid_clean) >= 5:
                        if pid_clean not in patient_map:
                            patient_map[pid_clean] = {
                                "id": pid_clean,
                                "district": doc_dist,
                                "fo_name": doc_fo,
                                "first_date": doc_date,
                                "notification": False,
                                "hiv_dm": False,
                                "dbt": False,
                                "contact_tracing": False,
                                "sample_tested": False,
                                "presumptive": False,
                                "outcome": False,
                                "differentiated_tb": False
                            }
                        patient_map[pid_clean][flag] = True
                        if flag in ["notification", "presumptive"] and (not patient_map[pid_clean]["first_date"] or doc_date < patient_map[pid_clean]["first_date"]):
                            patient_map[pid_clean]["first_date"] = doc_date
                            patient_map[pid_clean]["district"] = doc_dist
                            patient_map[pid_clean]["fo_name"] = doc_fo

    alert_list = []
    today_dt = datetime.now().date()
    
    summary = {
        "total_notified": 0,
        "hiv_pending": 0,
        "dbt_pending": 0,
        "contact_pending": 0,
        "udst_pending": 0,
        "diff_tb_pending": 0,
        "presumptive_untested": 0,
        "high_risk_count": 0
    }
    
    for pid, p in patient_map.items():
        days_elapsed = 0
        if p["first_date"]:
            try:
                p_dt = datetime.strptime(p["first_date"], "%Y-%m-%d").date()
                days_elapsed = (today_dt - p_dt).days
            except:
                pass

        # 1. Top Priority: TB Notification Follow-Up Cascade
        if p["notification"]:
            summary["total_notified"] += 1
            missing_actions = []
            missing_items = []
            
            if not p["hiv_dm"]:
                missing_actions.append("HIV & DM Testing Missing")
                missing_items.append({"key": "hiv_dm_ids", "label": "HIV & DM", "icon": "🧪", "color": "purple"})
                summary["hiv_pending"] += 1
            if not p["dbt"]:
                missing_actions.append("DBT Bank Seeding Missing")
                missing_items.append({"key": "dbt_ids", "label": "DBT Bank", "icon": "💳", "color": "amber"})
                summary["dbt_pending"] += 1
            if not p.get("differentiated_tb"):
                missing_actions.append("Diff TB Care Assessment Missing")
                missing_items.append({"key": "differentiated_tb_ids", "label": "Diff TB", "icon": "🩺", "color": "pink"})
                summary["diff_tb_pending"] += 1
            if not p["contact_tracing"]:
                missing_actions.append("Contact Tracing Missing")
                missing_items.append({"key": "contact_tracing_ids", "label": "Contact Tracing", "icon": "👥", "color": "blue"})
                summary["contact_pending"] += 1
            if not p["sample_tested"]:
                missing_actions.append("UDST / Testing Missing")
                missing_items.append({"key": "sample_tested_ids", "label": "UDST Testing", "icon": "🔬", "color": "emerald"})
                summary["udst_pending"] += 1
                
            risk_level = "LOW"
            if len(missing_actions) >= 2:
                risk_level = "HIGH"
                summary["high_risk_count"] += 1
            elif len(missing_actions) == 1:
                risk_level = "MEDIUM"
                
            if len(missing_actions) > 0:
                alert_list.append({
                    "id": pid,
                    "district": p["district"],
                    "fo_name": p["fo_name"],
                    "notified_date": p["first_date"],
                    "days_elapsed": days_elapsed,
                    "missing_actions": missing_actions,
                    "missing_items": missing_items,
                    "risk_level": risk_level,
                    "cascade_type": "Notification",
                    "has_hiv": p["hiv_dm"],
                    "has_dbt": p["dbt"],
                    "has_contact": p["contact_tracing"],
                    "has_udst": p["sample_tested"],
                    "has_diff_tb": p.get("differentiated_tb", False),
                    "has_outcome": p["outcome"]
                })
                
        # 2. Secondary Priority: Presumptive TB to Testing Cascade
        elif p["presumptive"] and not p["sample_tested"]:
            summary["presumptive_untested"] += 1
            alert_list.append({
                "id": pid,
                "district": p["district"],
                "fo_name": p["fo_name"],
                "notified_date": p["first_date"],
                "days_elapsed": days_elapsed,
                "missing_actions": ["Presumptive TB Testing Pending"],
                "missing_items": [{"key": "sample_tested_ids", "label": "UDST Testing", "icon": "🔬", "color": "emerald"}],
                "risk_level": "HIGH" if days_elapsed > 7 else "MEDIUM",
                "cascade_type": "Presumptive",
                "has_hiv": p["hiv_dm"],
                "has_dbt": p["dbt"],
                "has_contact": p["contact_tracing"],
                "has_udst": False,
                "has_diff_tb": p.get("differentiated_tb", False),
                "has_outcome": p["outcome"]
            })
                
    risk_weight = {"HIGH": 3, "MEDIUM": 2, "LOW": 1}
    alert_list.sort(key=lambda x: (risk_weight.get(x["risk_level"], 0), x["days_elapsed"]), reverse=True)
    
    return {"summary": summary, "alerts": alert_list}

@router.get("/api/reports/cascade-alerts")
@router.get("/admin/cascade-alerts")
async def get_cascade_alerts(month: Optional[str] = None, district: Optional[str] = "All", fo_name: Optional[str] = None, districts: Optional[str] = None):
    try:
        if not month:
            month = datetime.now().strftime("%Y-%m")
            
        clean_d = canonicalize_district(district) if district else "All"
        clean_fo = fo_name.strip() if fo_name else "all"
        cache_key = f"cascade_alerts_{month}_{clean_d}_{clean_fo}_{districts or 'all'}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached
            
        try:
            data = await asyncio.to_thread(compute_cascade_alerts, month, district, fo_name, districts)
            result = {"success": True, "data": data}
            cache.set(cache_key, result, ttl=180)
            return result
        except Exception as fe:
            print(f"Cascade alerts query notice (quota/network): {fe}")
            empty_data = {"summary": {"urgent": 0, "attention": 0, "monitoring": 0, "total": 0}, "alerts": []}
            return {"success": True, "data": empty_data, "notice": "Offline/Quota fallback"}
    except Exception as e:
        empty_data = {"summary": {"urgent": 0, "attention": 0, "monitoring": 0, "total": 0}, "alerts": []}
        return {"success": True, "data": empty_data, "notice": "Offline/Quota fallback"}

@router.get("/admin/export-cascade-alerts")
async def export_cascade_alerts(month: Optional[str] = None, district: Optional[str] = "All", districts: Optional[str] = None, admin: dict = Depends(get_current_admin)):
    try:
        if not month:
            month = datetime.now().strftime("%Y-%m")
            
        data = await asyncio.to_thread(compute_cascade_alerts, month, district, None, districts)
        alerts = data.get("alerts", [])
        
        rows = []
        for idx, a in enumerate(alerts):
            rows.append({
                "S.No": idx + 1,
                "Patient ID": a["id"],
                "District": a["district"],
                "Field Officer": a["fo_name"],
                "Notification Date": a["notified_date"],
                "Days Elapsed": a["days_elapsed"],
                "Risk Level": a["risk_level"],
                "Missing Interventions": " | ".join(a["missing_actions"]),
                "HIV/DM Status": "Completed" if a.get("has_hiv") else "PENDING",
                "DBT Status": "Completed" if a.get("has_dbt") else "PENDING",
                "UDST Status": "Completed" if a.get("has_udst") else "PENDING",
                "Contact Tracing": "Completed" if a.get("has_contact") else "PENDING",
                "Diff TB Status": "Completed" if a.get("has_diff_tb") else "PENDING"
            })
        import pandas as pd  # lazy import
        df = pd.DataFrame(rows)
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            sheet_title = f"Cascade Alerts ({district})"
            df.to_excel(writer, index=False, sheet_name=sheet_title[:31])
            ws = writer.sheets[sheet_title[:31]]
            style_excel_worksheet(ws, header_fill_color="B91C1C")
                
        output.seek(0)
        filename = f"DFY_Cascade_Dropout_Alerts_{district}_{month}.xlsx"
        return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename={filename}"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



class PacingSettingsReq(BaseModel):
    month: str  # YYYY-MM
    district: str = "all"  # "all" or canonical district
    declared_holidays: int = 1


@router.get("/admin/pacing/settings")
async def get_pacing_settings(
    month: Optional[str] = Query(default=None),
    district: Optional[str] = Query(default=None),
    admin: dict = Depends(get_current_admin)
):
    try:
        clean_month = month.strip() if month else get_ist_now().strftime("%Y-%m")
        if not re.match(r'^\d{4}-\d{2}$', clean_month):
            raise HTTPException(status_code=400, detail="Invalid month format (YYYY-MM required)")

        clean_dist = None
        if district and district.strip().lower() != "all":
            clean_dist = canonicalize_district(district.strip())

        cache_key = f"pacing_settings_{clean_month}_{clean_dist or 'all'}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        # Resolution logic:
        # 1. If district is provided and canonical district != "all":
        # Check Firestore collection pacing_settings document f"{clean_month}_{clean_dist}".
        if clean_dist:
            doc = await asyncio.to_thread(lambda: db.collection("pacing_settings").document(f"{clean_month}_{clean_dist}").get())
            if doc.exists:
                d = doc.to_dict() or {}
                res = {
                    "success": True,
                    "month": clean_month,
                    "district": clean_dist,
                    "declared_holidays": d.get("declared_holidays", 1),
                    "is_override": True
                }
                cache.set(cache_key, res, ttl=1800)
                return res

        # 2. Check state default document f"{clean_month}".
        state_doc = await asyncio.to_thread(lambda: db.collection("pacing_settings").document(clean_month).get())
        if state_doc.exists:
            d = state_doc.to_dict() or {}
            res = {
                "success": True,
                "month": clean_month,
                "district": "all",
                "declared_holidays": d.get("declared_holidays", 1),
                "is_override": False
            }
            cache.set(cache_key, res, ttl=1800)
            return res

        # 3. Fallback: return default
        res = {
            "success": True,
            "month": clean_month,
            "district": clean_dist or "all",
            "declared_holidays": 1,
            "is_override": False
        }
        cache.set(cache_key, res, ttl=1800)
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/pacing/settings")
async def update_pacing_settings(
    req: PacingSettingsReq,
    admin: dict = Depends(get_current_admin)
):
    try:
        clean_month = req.month.strip() if req.month else ""
        if not clean_month or not re.match(r'^\d{4}-\d{2}$', clean_month):
            raise HTTPException(status_code=400, detail="Invalid month format (YYYY-MM required)")

        clamped_holidays = max(0, min(15, int(req.declared_holidays)))

        clean_dist = "all"
        if req.district and req.district.strip().lower() != "all":
            clean_dist = canonicalize_district(req.district.strip())

        admin_role = admin.get("role", "SUB_ADMIN")
        if admin_role == "SUB_ADMIN":
            if clean_dist == "all":
                raise HTTPException(status_code=403, detail="Sub-Admins cannot modify statewide default holidays.")
            allowed = admin.get("allowed_districts", []) or admin.get("districts", [])
            allowed_c = [canonicalize_district(d).lower() for d in allowed if d]
            if "All" not in allowed and "all" not in allowed_c and clean_dist.lower() not in allowed_c and clean_dist not in allowed:
                raise HTTPException(status_code=403, detail=f"Permission denied for district: {clean_dist}")

        doc_id = clean_month if clean_dist == "all" else f"{clean_month}_{clean_dist}"

        actor_name = admin.get("name") or admin.get("username") or "Admin"
        actor_id = admin.get("user_id") or admin.get("username") or "admin"
        actor_role = admin.get("role", "SUPER_ADMIN")
        updated_at = get_ist_now().strftime("%Y-%m-%d %H:%M:%S")

        doc_data = {
            "month": clean_month,
            "district": clean_dist,
            "declared_holidays": clamped_holidays,
            "updated_by": actor_name,
            "updated_by_id": actor_id,
            "updated_by_role": actor_role,
            "updated_at": updated_at
        }

        await asyncio.to_thread(lambda: db.collection("pacing_settings").document(doc_id).set(doc_data, merge=True))

        # Cache eviction
        cache.delete(f"pacing_settings_{clean_month}_{clean_dist}")
        cache.delete(f"pacing_settings_{clean_month}_all")
        if clean_dist == "all":
            cache.delete_prefix(f"pacing_settings_{clean_month}")
            cache.delete_prefix("profile_")
        else:
            clean_dist_tag = clean_dist.replace(" ", "_").lower()
            cache.delete_prefix(f"profile_{clean_dist_tag}_")

        # Log admin activity
        await log_admin_activity(
            action_type="PACING_SETTINGS_UPDATED",
            details=f"Updated declared holidays for {clean_dist} ({clean_month}) to {clamped_holidays}",
            user_name=actor_name,
            user_id=actor_id,
            role=actor_role,
            district=clean_dist,
            diff={
                "month": clean_month,
                "district": clean_dist,
                "declared_holidays": clamped_holidays
            }
        )

        return {
            "success": True,
            "message": "Pacing settings saved successfully.",
            "declared_holidays": clamped_holidays
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))




