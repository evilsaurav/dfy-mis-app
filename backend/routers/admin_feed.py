import os
import re
import json
import asyncio
import calendar
import logging
from datetime import datetime, timedelta, date as dt_date, timezone
from typing import Optional, List, Dict, Any, Tuple, Set
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
import sys
from google.cloud import firestore

from backend.core.database import db
from backend.core.cache import cache
from backend.core.security import get_current_admin, get_optional_admin, require_super_admin, verify_password
from backend.core.helpers import (
    get_ist_now,
    canonicalize_district,
    canonicalize_fo_name,
    normalize_staff_key,
    is_officer_name_match,
    evict_officer_profile_cache,
    log_admin_activity,
    format_to_ist_time
)
from backend.core.master_ledger import (
    get_cached_staff_directory_raw,
    upsert_in_memory_report,
    record_report_mutation,
    DELETED_REPORTS_TOMBSTONES,
    get_raw_monthly_reports
)
from backend.routers.reports import get_district_90day_notified_ids

router = APIRouter(tags=["admin_feed"])
logger = logging.getLogger("admin_feed")


# --- Patient ID Correction & Editing Suite ---
class EditIdRequest(BaseModel):
    working_place: str
    fo_name: str
    date: str
    category: str # e.g. "notification_ids" or "notification"
    action: str   # "replace", "delete", "add"
    old_id: Optional[str] = ""
    new_id: Optional[str] = ""
    edited_by: Optional[str] = "FO" # "FO" or "Admin"
    pin: Optional[str] = ""

@router.post("/api/reports/edit-id")
async def edit_patient_id(req: EditIdRequest, admin: Optional[dict] = Depends(get_optional_admin)):
    try:
        c_wp = canonicalize_district(req.working_place)
        is_admin = admin is not None

        # Dual-Authentication & Authorization Enforcement
        if req.edited_by == "Admin":
            if not is_admin:
                raise HTTPException(
                    status_code=401, 
                    detail="Authentication token required. Please log in as an administrator."
                )
            if admin.get("role") == "SUB_ADMIN":
                allowed = admin.get("allowed_districts", [])
                allowed_c = [canonicalize_district(a).lower() for a in allowed]
                if "All" not in allowed and c_wp.lower() not in allowed_c and req.working_place.lower() not in allowed_c:
                    raise HTTPException(status_code=403, detail=f"Permission denied. You cannot edit IDs in district '{req.working_place}'.")
        else:
            # Field Officer Authentication (PIN required)
            if not req.pin or not str(req.pin).strip():
                raise HTTPException(status_code=401, detail="PIN authorization is required for Field Officers.")

            clean_fo = re.sub(r'[^a-zA-Z0-9]', '', req.fo_name).lower()
            candidate_pin_ids = [
                f"{c_wp}_{req.fo_name}".replace(" ", "").lower(),
                f"{req.working_place}_{req.fo_name}".replace(" ", "").lower(),
                f"{c_wp.replace(' ', '')}_{clean_fo}".lower()
            ]
            if "aurangabad" in c_wp.lower():
                candidate_pin_ids.extend([f"aurangabad_{clean_fo}", f"aurangabad_{req.fo_name}".replace(" ", "").lower()])
            if "champaran" in c_wp.lower():
                candidate_pin_ids.extend([f"eastchamparan_{clean_fo}", f"east_champaran_{clean_fo}"])
            if "bhojpur" in c_wp.lower():
                candidate_pin_ids.extend([f"bhojpur_{clean_fo}"])
            candidate_pin_ids = list(dict.fromkeys(candidate_pin_ids))

            pin_match = False
            staff_found = False
            for pid in candidate_pin_ids:
                try:
                    staff_doc = await asyncio.to_thread(db.collection("staff_directory").document(pid).get)
                    if staff_doc.exists:
                        staff_found = True
                        real_p = str(staff_doc.to_dict().get("pin", ""))
                        if verify_password(str(req.pin), real_p) or str(req.pin) == real_p:
                            pin_match = True
                            break
                except Exception:
                    pass
            if staff_found and not pin_match:
                raise HTTPException(status_code=401, detail="Invalid PIN authorization.")
            if not pin_match and not (str(req.pin).isdigit() and len(str(req.pin)) == 4):
                raise HTTPException(status_code=401, detail="Invalid PIN authorization.")

        cat_key = req.category if req.category.endswith("_ids") else f"{req.category}_ids"
        
        if req.action not in ["replace", "delete", "add"]:
            raise HTTPException(status_code=400, detail="Invalid action. Must be 'replace', 'delete', or 'add'.")
            
        if req.action in ["replace", "add"]:
            clean_new_id = str(req.new_id).strip()
            valid_lens = [8, 9] if cat_key in ["fdc_provided_ids", "outcome_assigned_ids"] else [9]
            if not clean_new_id.isdigit() or len(clean_new_id) not in valid_lens:
                lens_desc = "8 or 9" if 8 in valid_lens else "9"
                raise HTTPException(status_code=400, detail=f"Invalid Patient ID '{clean_new_id}'. Must be exactly {lens_desc} digits.")
            req.new_id = clean_new_id

        candidate_doc_ids = [
            f"{c_wp}_{req.fo_name}_{req.date}".replace(" ", "_").lower(),
            f"{req.working_place}_{req.fo_name}_{req.date}".replace(" ", "_").lower()
        ]
        doc_ref = None
        data = None
        for cid in candidate_doc_ids:
            cand_ref = db.collection("daily_field_reports").document(cid)
            doc_snap = await asyncio.to_thread(cand_ref.get)
            if doc_snap.exists:
                doc_ref = cand_ref
                data = doc_snap.to_dict()
                doc_id = cid
                break
        
        if not doc_ref:
            docs = await asyncio.to_thread(lambda: list(db.collection("daily_field_reports")
                .where("fo_name", "==", req.fo_name)
                .where("date_of_reporting", "==", req.date)
                .stream()))
            # STRICT: Only match documents in the SAME district. Never edit a different district's record.
            matching_docs = [d for d in docs if canonicalize_district(d.to_dict().get("working_place", "")) == c_wp]
            if not matching_docs:
                raise HTTPException(status_code=404, detail="No report found for this date and officer.")
            # Deterministic selection: sort by doc ID so canonical format (district_fo_date) is always picked first
            if len(matching_docs) > 1:
                matching_docs.sort(key=lambda d: d.id)
            doc_ref = matching_docs[0].reference
            data = matching_docs[0].to_dict()
            doc_id = matching_docs[0].id

        # 🛡️ Strict 24-Hour Editing Window Rule for Field Officers
        if not is_admin or req.edited_by == "FO":
            is_expired = False
            evaluated = False

            # 1. Check timestamp_completed (primary), timestamp, or submitted_at
            sub_ts = data.get("timestamp_completed") or data.get("timestamp") or data.get("submitted_at")
            if sub_ts:
                try:
                    now_utc = datetime.now(timezone.utc)
                    # Case A: Firestore DatetimeWithNanoseconds or python datetime
                    if isinstance(sub_ts, datetime):
                        sub_utc = sub_ts if sub_ts.tzinfo is not None else sub_ts.replace(tzinfo=timezone.utc)
                        hours_diff = (now_utc - sub_utc).total_seconds() / 3600.0
                        if hours_diff > 24.0:
                            is_expired = True
                        evaluated = True
                    # Case B: String representation of timestamp
                    elif isinstance(sub_ts, str) and sub_ts.strip():
                        clean_ts = sub_ts.strip().replace("Z", "+00:00")
                        if " " in clean_ts and "T" not in clean_ts:
                            clean_ts = clean_ts.replace(" ", "T")
                        sub_dt = datetime.fromisoformat(clean_ts)
                        sub_utc = sub_dt if sub_dt.tzinfo is not None else sub_dt.replace(tzinfo=timezone.utc)
                        hours_diff = (now_utc - sub_utc).total_seconds() / 3600.0
                        if hours_diff > 24.0:
                            is_expired = True
                        evaluated = True
                except Exception as e:
                    logger.warning(f"Error parsing edit window timestamp '{sub_ts}': {e}")

            # 2. Fallback check against date_of_reporting in Indian Standard Time (IST = UTC + 5:30)
            if not evaluated and not is_expired:
                try:
                    now_ist = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
                    today_ist = now_ist.date()
                    yesterday_ist = today_ist - timedelta(days=1)
                    rep_date = datetime.strptime(req.date, "%Y-%m-%d").date()
                    # Only lock if report is older than yesterday in IST (2 or more calendar days ago)
                    if rep_date < yesterday_ist:
                        is_expired = True
                except Exception:
                    pass

            if is_expired:
                raise HTTPException(
                    status_code=403, 
                    detail="Field Officer edit window expired (24 hours limit). 24 ghante beet chuke hain. Kripya badlav ke liye District Admin ya State MIS se sampark karein."
                )
            
        current_list = list(data.get(cat_key, []))
        old_id_clean = str(req.old_id).strip()
        
        if cat_key == "notification_ids" and req.action in ["replace", "add"]:
            clean_new_id = str(req.new_id).strip()
            main_mod = sys.modules.get("main")
            get_90day = getattr(main_mod, "get_district_90day_notified_ids", get_district_90day_notified_ids) if main_mod else get_district_90day_notified_ids
            existing_notified_set = await get_90day(
                clean_dist=c_wp,
                exclude_doc_id=doc_id,
                exclude_doc_ids=candidate_doc_ids,
                months=3
            )
            if clean_new_id in existing_notified_set:
                raise HTTPException(
                    status_code=400,
                    detail=f"Patient ID {clean_new_id} is already notified in a different report."
                )

        if req.action == "replace":
            if old_id_clean not in current_list:
                raise HTTPException(status_code=404, detail=f"Old ID '{old_id_clean}' not found in category '{cat_key}'.")
            idx = current_list.index(old_id_clean)
            current_list[idx] = req.new_id
            
        elif req.action == "delete":
            if old_id_clean not in current_list:
                raise HTTPException(status_code=404, detail=f"ID '{old_id_clean}' not found in category '{cat_key}'.")
            current_list.remove(old_id_clean)
            
        elif req.action == "add":
            if req.new_id in current_list:
                raise HTTPException(status_code=400, detail=f"ID '{req.new_id}' is already present in this category.")
            current_list.append(req.new_id)

        count_key = cat_key.replace("_ids", "")
        doc_update = {
            cat_key: current_list,
            count_key: len(current_list),
            "last_edited_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "last_edited_by": req.edited_by
        }
        if cat_key == "notification_ids":
            doc_update["notifications"] = len(current_list)

        await asyncio.to_thread(lambda: doc_ref.update(doc_update))

        # Atomic adjustment to daily_district_rollups if applicable
        if req.action in ["delete", "add"]:
            try:
                metric_map = {
                    "notification_ids": "notifications",
                    "sample_tested_ids": "tests",
                    "hiv_dm_ids": "hiv_dm",
                    "dbt_ids": "dbt",
                    "contact_tracing_ids": "contact_tracing",
                    "differentiated_tb_ids": "diff_tb"
                }
                if cat_key in metric_map:
                    delta = -1 if req.action == "delete" else 1
                    rollup_id = f"{req.date}_{c_wp}".replace(" ", "_").lower()
                    rollup_ref = db.collection("daily_district_rollups").document(rollup_id)
                    await asyncio.to_thread(lambda: rollup_ref.update({
                        metric_map[cat_key]: firestore.Increment(delta),
                        "last_updated": firestore.SERVER_TIMESTAMP
                    }))
            except Exception:
                pass
        
        log_entry = {
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "working_place": req.working_place,
            "fo_name": req.fo_name,
            "date": req.date,
            "category": cat_key,
            "action": req.action,
            "old_id": req.old_id,
            "new_id": req.new_id,
            "edited_by": req.edited_by
        }
        await asyncio.to_thread(lambda: db.collection("id_edit_logs").add(log_entry))
        if admin:
            actor_name = admin.get("name") or admin.get("username") or "Admin"
            actor_id = admin.get("user_id") or admin.get("username", "admin")
            actor_role = admin.get("role", "SUB_ADMIN")
        else:
            actor_name = req.fo_name
            actor_id = f"{c_wp}_{req.fo_name}".replace(" ", "_").lower()
            actor_role = "FIELD_OFFICER"
        await log_admin_activity(
            action_type=f"PATIENT_ID_{req.action.upper()}",
            details=f"{actor_name} ({actor_role}) {req.action}d ID in {cat_key} for {req.fo_name} on {req.date} (Old: {req.old_id}, New: {req.new_id})",
            district=req.working_place,
            target_officer=req.fo_name,
            user_name=actor_name,
            user_id=actor_id,
            role=actor_role,
            diff={"category": cat_key, "action": req.action, "old_id": req.old_id, "new_id": req.new_id}
        )
        data.update(doc_update)
        data["id"] = doc_id
        data["doc_id"] = doc_id
        data["last_edited_at"] = get_ist_now().strftime("%Y-%m-%d %H:%M:%S")
        record_report_mutation("edit", doc_id, district=c_wp, date=req.date, report_data=data)
        cache.delete(f"status_{doc_id}")
        evict_officer_profile_cache(c_wp, req.fo_name, req.date)

        try:
            month_pfx = req.date[:7]
            snap_path = f"cache/dash_{month_pfx}.json"
            if os.path.exists(snap_path):
                os.remove(snap_path)
        except Exception:
            pass
        
        return {
            "success": True,
            "message": f"Patient ID successfully {req.action}d!",
            "category": cat_key,
            "updated_ids": current_list
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =========================================================================
# --- Admin & Sub-Admin Data Feeding & Backdated ID Entry Suite ---
# =========================================================================
class AdminFeedDataRequest(BaseModel):
    district: str
    fo_name: str
    date_of_reporting: str  # YYYY-MM-DD
    notification_ids: Optional[List[str]] = []
    hiv_dm_ids: Optional[List[str]] = []
    dbt_ids: Optional[List[str]] = []
    sample_tested_ids: Optional[List[str]] = []
    sample_collection_ids: Optional[List[str]] = []
    contact_tracing_ids: Optional[List[str]] = []
    differentiated_tb_ids: Optional[List[str]] = []
    outcome_assigned_ids: Optional[List[str]] = []
    home_visit_ids: Optional[List[str]] = []
    follow_up_ids: Optional[List[str]] = []
    face_to_face_ids: Optional[List[str]] = []
    presumptive_ids: Optional[List[str]] = []
    documents_ids: Optional[List[str]] = []
    fdc_provided_ids: Optional[List[str]] = []
    fdc_details: Optional[List[Dict[str, Any]]] = []
    kit_consumption_ids: Optional[List[str]] = []
    tpt_treatment_start_ids: Optional[List[str]] = []
    tpt_presumptive_ids: Optional[List[str]] = []
    adhar_face_authentication_ids: Optional[List[str]] = []
    consent_with_id_ids: Optional[List[str]] = []
    culture_dst_ids: Optional[List[str]] = []
    remark: Optional[str] = ""

@router.post("/admin/feed-officer-data")
async def admin_feed_officer_data(
    req: AdminFeedDataRequest,
    admin: dict = Depends(get_current_admin)
):
    try:
        admin_role = admin.get("role", "SUB_ADMIN")
        admin_user = admin.get("name") or admin.get("username", "Admin")
        admin_id = admin.get("user_id") or admin.get("username", "admin")
        allowed_dists = admin.get("allowed_districts", [])

        clean_wp = canonicalize_district(req.district.strip())
        clean_fo = canonicalize_fo_name(req.fo_name, clean_wp)
        if not clean_wp or not clean_fo:
            raise HTTPException(status_code=400, detail="District and Field Officer name are required.")

        # 1. RBAC check: Sub-Admin can only feed data for permitted districts
        if admin_role == "SUB_ADMIN":
            allowed_c = [canonicalize_district(a).lower() for a in allowed_dists]
            if allowed_dists and not ("All" in allowed_dists or clean_wp.lower() in allowed_c or req.district.strip().lower() in allowed_c):
                raise HTTPException(
                    status_code=403, 
                    detail=f"Permission denied: You do not have access to feed data for {req.district} district."
                )

        # 2. Date validation (accepts any valid YYYY-MM-DD date)
        try:
            clean_date = datetime.strptime(req.date_of_reporting.strip(), "%Y-%m-%d").strftime("%Y-%m-%d")
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid date format. Expected YYYY-MM-DD.")

        # 3. Clean & validate all IDs (must be 9 digits)
        categories = [
            "notification_ids", "hiv_dm_ids", "dbt_ids", "sample_tested_ids",
            "sample_collection_ids", "contact_tracing_ids", "differentiated_tb_ids",
            "outcome_assigned_ids", "home_visit_ids", "follow_up_ids",
            "face_to_face_ids", "presumptive_ids", "documents_ids", "fdc_provided_ids",
            "kit_consumption_ids", "tpt_treatment_start_ids", "tpt_presumptive_ids",
            "adhar_face_authentication_ids", "consent_with_id_ids", "culture_dst_ids"
        ]

        cleaned_payload = {}
        total_ids_added = 0
        invalid_ids = []

        for cat in categories:
            raw_list = getattr(req, cat, []) or []
            clean_list = []
            for pid in raw_list:
                s = str(pid).strip()
                if not s:
                    continue
                is_valid_len = (len(s) in (8, 9)) if cat in ["fdc_provided_ids", "outcome_assigned_ids"] else (len(s) == 9)
                if not (s.isdigit() and is_valid_len):
                    invalid_ids.append(s)
                else:
                    clean_list.append(s)
            clean_list = list(dict.fromkeys(clean_list)) # deduplicate within input
            cleaned_payload[cat] = clean_list
            total_ids_added += len(clean_list)

        if invalid_ids:
            sample_invalids = ", ".join(invalid_ids[:5])
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid Patient IDs detected (must be 8 or 9 digits for FDC/Outcome, 9 digits for others): {sample_invalids}"
            )

        if total_ids_added == 0 and not req.remark.strip():
            raise HTTPException(status_code=400, detail="Please enter at least one valid patient ID or remark.")

        # 4. Target Report Document with alias candidate search
        candidate_doc_ids = [
            f"{clean_wp}_{clean_fo}_{clean_date}".replace(" ", "_").lower(),
            f"{req.district}_{clean_fo}_{clean_date}".replace(" ", "_").lower()
        ]

        doc_ref = None
        doc_snap = None
        doc_id = candidate_doc_ids[0]

        for cid in candidate_doc_ids:
            cand_ref = db.collection("daily_field_reports").document(cid)
            snap = await asyncio.to_thread(cand_ref.get)
            if snap.exists:
                doc_ref = cand_ref
                doc_snap = snap
                doc_id = cid
                break

        if not doc_ref:
            # Fallback search by fo_name and date_of_reporting in case of spacing/casing variations
            # STRICT: Only match documents in the SAME district. Never cross-merge across districts.
            try:
                query_docs = await asyncio.to_thread(lambda: list(db.collection("daily_field_reports")
                    .where("fo_name", "==", clean_fo)
                    .where("date_of_reporting", "==", clean_date)
                    .stream()))
                matching = [d for d in query_docs if canonicalize_district(d.to_dict().get("working_place", "")) == clean_wp]
                if matching:
                    # Deterministic selection: sort by doc ID so canonical format is always picked first
                    if len(matching) > 1:
                        matching.sort(key=lambda d: d.id)
                    doc_ref = matching[0].reference
                    doc_snap = matching[0]
                    doc_id = matching[0].id
            except Exception as qe:
                print(f"[Admin Feed Fallback Notice] {qe}")

        if not doc_ref:
            doc_id = candidate_doc_ids[0]
            doc_ref = db.collection("daily_field_reports").document(doc_id)
            new_report_created = True
        else:
            new_report_created = False

        # 4b. Duplicate Notification Protection (Scoped with resolved doc exclusion)
        if cleaned_payload.get("notification_ids"):
            existing_day_notifs = set()
            if not new_report_created and doc_snap and hasattr(doc_snap, "to_dict"):
                existing_day_notifs = set(doc_snap.to_dict().get("notification_ids", []) or [])

            # Only check IDs that are genuinely NEW to this report
            new_notifs_to_check = [pid for pid in cleaned_payload["notification_ids"] if pid not in existing_day_notifs]

            if new_notifs_to_check:
                resolved_exclude_docs = list(set(candidate_doc_ids + ([doc_id] if doc_id else [])))
                existing_notified_set = await get_district_90day_notified_ids(
                    clean_dist=clean_wp,
                    exclude_doc_ids=resolved_exclude_docs,
                    months=3
                )
                dupe_notifs = [pid for pid in new_notifs_to_check if pid in existing_notified_set]
                if dupe_notifs:
                    sample_dupes = ", ".join(dupe_notifs[:5])
                    raise HTTPException(
                        status_code=400,
                        detail=f"Duplicate notification IDs detected in {clean_wp}: {sample_dupes}. Notification IDs cannot be re-used across reports."
                    )

        now_iso = datetime.utcnow().isoformat()
        feed_note = f"Fed by {admin_user} ({admin_role}) on {datetime.now().strftime('%d %b %Y, %I:%M %p')}"
        if req.remark and req.remark.strip():
            feed_note += f": {req.remark.strip()}"

        delta_counts = {}
        if new_report_created:
            for cat in categories:
                delta_counts[cat] = len(cleaned_payload[cat])
            # Create a brand new daily report
            doc_data = {
                "working_place": clean_wp,
                "fo_name": clean_fo,
                "date_of_reporting": clean_date,
                "date": clean_date,
                "pin": "ADMIN_FEED",
                "status": "completed",
                "timestamp": now_iso,
                "timestamp_completed": firestore.SERVER_TIMESTAMP,
                "submission_count": 1,
                "admin_fed": True,
                "fed_by": admin_user,
                "remark": feed_note,
                "fdc_details": req.fdc_details or [],
                **cleaned_payload
            }
            for cat in categories:
                count_key = cat.replace("_ids", "")
                doc_data[count_key] = len(cleaned_payload[cat])
            doc_data["notifications"] = len(cleaned_payload.get("notification_ids", []))
            
            await asyncio.to_thread(lambda: doc_ref.set(doc_data))
        else:
            # Merge with existing daily report (monotonic union)
            existing_data = doc_snap.to_dict()
            for cat in categories:
                existing_set = set(existing_data.get(cat, []))
                delta_counts[cat] = len(set(cleaned_payload[cat]) - existing_set)

            update_data = {
                "status": "completed",
                "admin_fed": True,
                "last_fed_by": admin_user,
                "last_fed_at": now_iso
            }
            old_remark = existing_data.get("remark", "")
            update_data["remark"] = f"{old_remark} | {feed_note}".strip(" |")

            for cat in categories:
                combined = existing_data.get(cat, []) + cleaned_payload[cat]
                merged_list = list(dict.fromkeys(combined))
                update_data[cat] = merged_list
                count_key = cat.replace("_ids", "")
                update_data[count_key] = len(merged_list)
            update_data["notifications"] = len(update_data.get("notification_ids", []))

            if req.fdc_details:
                old_fdc = existing_data.get("fdc_details", [])
                f_map = {item.get("id"): item for item in old_fdc if isinstance(item, dict) and item.get("id")}
                for item in req.fdc_details:
                    if isinstance(item, dict) and item.get("id"):
                        f_map[item.get("id")] = item
                update_data["fdc_details"] = list(f_map.values())
            
            await asyncio.to_thread(lambda: doc_ref.set(update_data, merge=True))

        # 5. Atomic Update to Daily District Rollups
        try:
            rollup_id = f"{clean_date}_{clean_wp}".replace(" ", "_").lower()
            rollup_ref = db.collection("daily_district_rollups").document(rollup_id)
            rollup_update = {
                "date": clean_date,
                "district": clean_wp,
                "submitted_fos": firestore.ArrayUnion([clean_fo]),
                "last_updated": firestore.SERVER_TIMESTAMP
            }
            if new_report_created:
                rollup_update["submission_count"] = firestore.Increment(1)

            metric_map = {
                "notification_ids": "notifications",
                "sample_tested_ids": "tests",
                "hiv_dm_ids": "hiv_dm",
                "dbt_ids": "dbt",
                "contact_tracing_ids": "contact_tracing",
                "differentiated_tb_ids": "diff_tb"
            }
            for cat_k, rollup_k in metric_map.items():
                d_cnt = delta_counts.get(cat_k, 0)
                if d_cnt > 0:
                    rollup_update[rollup_k] = firestore.Increment(d_cnt)

            await asyncio.to_thread(lambda: rollup_ref.set(rollup_update, merge=True))
        except Exception as rollup_err:
            print(f"[Admin Feed Rollup Notice] Non-fatal error: {rollup_err}")

        # 6. Immutable Audit Trail
        summary_items = [f"{cat.replace('_ids', '')}: {len(cleaned_payload[cat])}" for cat in categories if cleaned_payload[cat]]
        summary_str = ", ".join(summary_items) if summary_items else "Remark only"
        await log_admin_activity(
            action_type="ADMIN_DATA_FEED",
            details=f"Admin {admin_user} ({admin_role}) fed data for {clean_fo} ({clean_wp}) on date {clean_date}: {summary_str}",
            district=clean_wp,
            target_officer=clean_fo,
            user_name=admin_user,
            user_id=admin_id,
            role=admin_role,
            diff={"date": clean_date, "created_new_report": new_report_created, "summary": summary_str}
        )

        if new_report_created:
            feed_cached = dict(doc_data)
            feed_cached["timestamp_completed"] = get_ist_now().strftime("%Y-%m-%d %H:%M:%S")
            feed_cached["submitted_at"] = feed_cached["timestamp_completed"]
        else:
            feed_cached = dict(existing_data)
            feed_cached.update(update_data)

        feed_cached["id"] = doc_id
        feed_cached["doc_id"] = doc_id
        feed_cached["last_edited_at"] = get_ist_now().strftime("%Y-%m-%d %H:%M:%S")
        record_report_mutation("feed", doc_id, district=clean_wp, date=clean_date, report_data=feed_cached)
        if doc_id:
            cache.delete(f"status_{doc_id}")
        cache.delete(f"status_{clean_wp}_{clean_fo}_{clean_date}".replace(" ", "_").lower())
        evict_officer_profile_cache(clean_wp, clean_fo, clean_date)

        return {
            "success": True,
            "message": f"Successfully {'created report & credited' if new_report_created else 'merged'} {total_ids_added} IDs for {clean_fo} on {clean_date}.",
            "created_new_report": new_report_created,
            "district": clean_wp,
            "fo_name": clean_fo,
            "date": clean_date,
            "ids_credited": {cat: len(cleaned_payload[cat]) for cat in categories if cleaned_payload[cat]}
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to feed officer data: {str(e)}")

# --- Admin Delete Full Day Report Feature ---
class DeleteDayReportReq(BaseModel):
    district: str
    fo_name: str
    date: str # YYYY-MM-DD

@router.post("/admin/reports/delete-day")
async def admin_delete_day_report(
    req: DeleteDayReportReq,
    admin: dict = Depends(get_current_admin)
):
    try:
        admin_role = admin.get("role", "SUB_ADMIN")
        admin_user = admin.get("name") or admin.get("username", "Admin")
        admin_id = admin.get("user_id") or admin.get("username", "admin")
        allowed_dists = admin.get("allowed_districts", [])

        clean_wp = canonicalize_district(req.district.strip())
        import re
        clean_fo = re.sub(r'\s+', ' ', req.fo_name).strip()
        clean_date = req.date.strip()

        if not clean_wp or not clean_fo or not clean_date:
            raise HTTPException(status_code=400, detail="District, Field Officer name, and Date are required.")

        # 1. RBAC Guard: Sub-Admin can only delete data in permitted districts
        if admin_role == "SUB_ADMIN":
            allowed_c = [canonicalize_district(a).lower() for a in allowed_dists]
            if allowed_dists and not ("All" in allowed_dists or clean_wp.lower() in allowed_c or req.district.strip().lower() in allowed_c):
                raise HTTPException(
                    status_code=403, 
                    detail=f"Permission denied: You cannot delete reports for {req.district} district."
                )

        # 2. Locate all candidate documents in daily_field_reports
        candidate_doc_ids = [
            f"{clean_wp}_{clean_fo}_{clean_date}".replace(" ", "_").lower(),
            f"{req.district.strip()}_{clean_fo}_{clean_date}".replace(" ", "_").lower(),
            f"{clean_wp}_{clean_fo}__{clean_date}".replace(" ", "_").lower()
        ]

        matching_docs = []
        seen_doc_ids = set()
        for cid in candidate_doc_ids:
            cand_ref = db.collection("daily_field_reports").document(cid)
            snap = await asyncio.to_thread(cand_ref.get)
            if snap.exists and cid not in seen_doc_ids:
                matching_docs.append(snap)
                seen_doc_ids.add(cid)
        # Note: No break — collect ALL alias matches to prevent zombie documents

        if not matching_docs:
            query_docs = await asyncio.to_thread(lambda: list(db.collection("daily_field_reports")
                .where("date_of_reporting", "==", clean_date)
                .stream()))
            for d in query_docs:
                d_dict = d.to_dict()
                d_fo = str(d_dict.get("fo_name", "")).strip().lower()
                d_wp = canonicalize_district(d_dict.get("working_place", "")).lower()
                if d_fo == clean_fo.lower() and d_wp == clean_wp.lower():
                    matching_docs.append(d)

        if not matching_docs:
            raise HTTPException(status_code=404, detail=f"No report found for {clean_fo} ({clean_wp}) on {clean_date}.")

        # 3. Calculate metrics to rollback from rollups
        total_deleted_ids = 0
        deleted_metrics = {
            "notifications": 0, "tests": 0, "hiv_dm": 0, "dbt": 0,
            "contact_tracing": 0, "diff_tb": 0
        }

        for doc_snap in matching_docs:
            d_dict = doc_snap.to_dict()
            total_deleted_ids += sum(len(v) for k, v in d_dict.items() if isinstance(v, list) and k.endswith("_ids"))
            deleted_metrics["notifications"] += len(d_dict.get("notification_ids", []))
            deleted_metrics["tests"] += len(d_dict.get("sample_tested_ids", []))
            deleted_metrics["hiv_dm"] += len(d_dict.get("hiv_dm_ids", []))
            deleted_metrics["dbt"] += len(d_dict.get("dbt_ids", []))
            deleted_metrics["contact_tracing"] += len(d_dict.get("contact_tracing_ids", []))
            deleted_metrics["diff_tb"] += len(d_dict.get("differentiated_tb_ids", []))
            # Delete document
            await asyncio.to_thread(doc_snap.reference.delete)

        # 4. Atomic Rollback in daily_district_rollups
        try:
            rollup_id = f"{clean_date}_{clean_wp}".replace(" ", "_").lower()
            rollup_ref = db.collection("daily_district_rollups").document(rollup_id)
            r_snap = await asyncio.to_thread(rollup_ref.get)
            if r_snap.exists:
                rollup_update = {
                    "submission_count": firestore.Increment(-len(matching_docs)),
                    "last_updated": firestore.SERVER_TIMESTAMP
                }
                for m_key, m_val in deleted_metrics.items():
                    if m_val > 0:
                        rollup_update[m_key] = firestore.Increment(-m_val)
                r_dict = r_snap.to_dict()
                old_fos = r_dict.get("submitted_fos", [])
                new_fos = [f for f in old_fos if f.strip().lower() != clean_fo.lower()]
                rollup_update["submitted_fos"] = new_fos
                await asyncio.to_thread(lambda: rollup_ref.update(rollup_update))
        except Exception as r_err:
            print(f"[Delete Day Rollup Notice] {r_err}")

        # 5. Invalidate caches and record tombstones (Scoped)
        for doc_snap in matching_docs:
            record_report_mutation("delete", doc_snap.id, district=clean_wp, date=clean_date)
            cache.delete(f"status_{doc_snap.id}")
        # Also invalidate all candidate alias IDs (covers fallback-found docs)
        for cid in candidate_doc_ids:
            cache.delete(f"status_{cid}")
        cache.delete(f"status_{clean_wp}_{clean_fo}_{clean_date}".replace(" ", "_").lower())
        evict_officer_profile_cache(clean_wp, clean_fo, clean_date)

        month_pfx = clean_date[:7]
        try:
            snap_path = f"cache/dash_{month_pfx}.json"
            if os.path.exists(snap_path):
                os.remove(snap_path)
        except Exception:
            pass

        # 6. Immutable Audit Trail
        await log_admin_activity(
            action_type="DELETE_DAILY_REPORT",
            details=f"Admin {admin_user} deleted full day report for {clean_fo} ({clean_wp}) on {clean_date} ({total_deleted_ids} IDs deleted)",
            district=clean_wp,
            target_officer=clean_fo,
            user_name=admin_user,
            user_id=admin_id,
            role=admin_role,
            diff={"date": clean_date, "deleted_docs": len(matching_docs), "total_ids": total_deleted_ids}
        )

        return {
            "success": True,
            "message": f"Successfully deleted report for {clean_fo} on {clean_date} ({total_deleted_ids} IDs removed).",
            "district": clean_wp,
            "fo_name": clean_fo,
            "date": clean_date,
            "deleted_ids_count": total_deleted_ids
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete day report: {str(e)}")

# --- Admin Edit Full Day Report Feature ---
class EditDayReportReq(BaseModel):
    district: str
    fo_name: str
    date: str  # YYYY-MM-DD
    morning_km: Optional[int] = None
    evening_km: Optional[int] = None
    travel_expenses: Optional[int] = None
    visited_names: Optional[List[str]] = None
    remark: Optional[str] = None
    category_ids: Optional[Dict[str, List[str]]] = None

@router.post("/admin/reports/edit-day")
async def admin_edit_day_report(
    req: EditDayReportReq,
    admin: dict = Depends(get_current_admin)
):
    try:
        admin_role = admin.get("role", "SUB_ADMIN")
        admin_user = admin.get("name") or admin.get("username", "Admin")
        admin_id = admin.get("user_id") or admin.get("username", "admin")
        allowed_dists = admin.get("allowed_districts", [])

        clean_wp = canonicalize_district(req.district.strip())
        import re
        clean_fo = re.sub(r'\s+', ' ', req.fo_name).strip()
        clean_date = req.date.strip()

        if not clean_wp or not clean_fo or not clean_date:
            raise HTTPException(status_code=400, detail="District, Field Officer name, and Date are required.")

        # 1. RBAC Guard: Sub-Admin can only edit data in permitted districts
        if admin_role == "SUB_ADMIN":
            allowed_c = [canonicalize_district(a).lower() for a in allowed_dists]
            if allowed_dists and not ("All" in allowed_dists or clean_wp.lower() in allowed_c or req.district.strip().lower() in allowed_c):
                raise HTTPException(
                    status_code=403, 
                    detail=f"Permission denied: You cannot edit reports for {req.district} district."
                )

        # 2. Locate all candidate documents in daily_field_reports
        candidate_doc_ids = [
            f"{clean_wp}_{clean_fo}_{clean_date}".replace(" ", "_").lower(),
            f"{req.district.strip()}_{clean_fo}_{clean_date}".replace(" ", "_").lower(),
            f"{clean_wp}_{clean_fo}__{clean_date}".replace(" ", "_").lower()
        ]

        matching_docs = []
        seen_doc_ids = set()
        for cid in candidate_doc_ids:
            cand_ref = db.collection("daily_field_reports").document(cid)
            snap = await asyncio.to_thread(cand_ref.get)
            if snap.exists and cid not in seen_doc_ids:
                matching_docs.append(snap)
                seen_doc_ids.add(cid)

        if not matching_docs:
            query_docs = await asyncio.to_thread(lambda: list(db.collection("daily_field_reports")
                .where("date_of_reporting", "==", clean_date)
                .stream()))
            for d in query_docs:
                d_dict = d.to_dict()
                d_fo = str(d_dict.get("fo_name", "")).strip().lower()
                d_wp = canonicalize_district(d_dict.get("working_place", "")).lower()
                if d_fo == clean_fo.lower() and d_wp == clean_wp.lower():
                    matching_docs.append(d)
                    seen_doc_ids.add(d.id)

        if not matching_docs:
            raise HTTPException(status_code=404, detail=f"No report found for {clean_fo} ({clean_wp}) on {clean_date}.")

        target_snap = matching_docs[0]
        doc_ref = target_snap.reference
        old_data = target_snap.to_dict()

        # 3. Calculate category deltas and prepare updates
        VALID_CATEGORIES = [
            "notification_ids", "hiv_dm_ids", "dbt_ids", "sample_collection_ids",
            "sample_tested_ids", "outcome_assigned_ids", "home_visit_ids",
            "contact_tracing_ids", "follow_up_ids", "face_to_face_ids",
            "presumptive_ids", "documents_ids", "fdc_provided_ids",
            "kit_consumption_ids", "differentiated_tb_ids", "tpt_treatment_start_ids",
            "tpt_presumptive_ids", "adhar_face_authentication_ids", "consent_with_id_ids",
            "culture_dst_ids"
        ]

        metric_map = {
            "notification_ids": "notifications",
            "sample_tested_ids": "tests",
            "hiv_dm_ids": "hiv_dm",
            "dbt_ids": "dbt",
            "contact_tracing_ids": "contact_tracing",
            "differentiated_tb_ids": "diff_tb"
        }

        doc_update = {
            "last_edited_at": get_ist_now().strftime("%Y-%m-%d %H:%M:%S"),
            "last_edited_by": admin_user,
            "last_edited_role": admin_role
        }

        if req.morning_km is not None:
            doc_update["morning_km"] = max(0, int(req.morning_km))
        if req.evening_km is not None:
            doc_update["evening_km"] = max(0, int(req.evening_km))
        if req.travel_expenses is not None:
            doc_update["travel_expenses"] = max(0, int(req.travel_expenses))
            doc_update["total_km"] = doc_update["travel_expenses"]
        elif req.morning_km is not None and req.evening_km is not None:
            calc_km = max(0, int(req.evening_km) - int(req.morning_km))
            doc_update["travel_expenses"] = calc_km
            doc_update["total_km"] = calc_km

        if req.visited_names is not None:
            clean_names = [str(v).strip() for v in req.visited_names if str(v).strip()]
            doc_update["visited_names"] = clean_names
            doc_update["doctor_store_visits_count"] = len(clean_names)

        if req.remark is not None:
            doc_update["remark"] = req.remark.strip()

        metric_deltas = {}
        all_added_ids = []
        all_deleted_ids = []

        if req.category_ids is not None:
            for cat_key in VALID_CATEGORIES:
                if cat_key in req.category_ids:
                    raw_ids = req.category_ids[cat_key]
                    clean_new_ids = []
                    for rid in raw_ids:
                        cid = str(rid).strip()
                        is_valid_len = (len(cid) in (8, 9)) if cat_key in ["fdc_provided_ids", "outcome_assigned_ids"] else (len(cid) == 9)
                        if cid.isdigit() and is_valid_len and cid not in clean_new_ids:
                            clean_new_ids.append(cid)
                    
                    old_ids = list(old_data.get(cat_key, []))
                    doc_update[cat_key] = clean_new_ids
                    count_key = cat_key.replace("_ids", "")
                    doc_update[count_key] = len(clean_new_ids)
                    if cat_key == "notification_ids":
                        doc_update["notifications"] = len(clean_new_ids)

                    added = [x for x in clean_new_ids if x not in old_ids]
                    deleted = [x for x in old_ids if x not in clean_new_ids]

                    all_added_ids.extend([{"cat": cat_key, "id": x} for x in added])
                    all_deleted_ids.extend([{"cat": cat_key, "id": x} for x in deleted])

                    # Log each ID addition/deletion to id_edit_logs
                    now_str = get_ist_now().strftime("%Y-%m-%d %H:%M:%S")
                    for aid in added:
                        log_entry = {
                            "timestamp": now_str,
                            "working_place": clean_wp,
                            "district": clean_wp,
                            "fo_name": clean_fo,
                            "date": clean_date,
                            "category": cat_key,
                            "action": "add",
                            "old_id": "",
                            "new_id": aid,
                            "edited_by": f"{admin_user} ({admin_role})"
                        }
                        await asyncio.to_thread(lambda l=log_entry: db.collection("id_edit_logs").add(l))

                    for did in deleted:
                        log_entry = {
                            "timestamp": now_str,
                            "working_place": clean_wp,
                            "district": clean_wp,
                            "fo_name": clean_fo,
                            "date": clean_date,
                            "category": cat_key,
                            "action": "delete",
                            "old_id": did,
                            "new_id": "",
                            "edited_by": f"{admin_user} ({admin_role})"
                        }
                        await asyncio.to_thread(lambda l=log_entry: db.collection("id_edit_logs").add(l))

                    if cat_key in metric_map:
                        diff = len(clean_new_ids) - len(old_ids)
                        if diff != 0:
                            metric_deltas[metric_map[cat_key]] = diff

        # 4. Commit document updates
        await asyncio.to_thread(lambda: doc_ref.update(doc_update))

        # 5. Atomic adjustments in daily_district_rollups
        if metric_deltas:
            try:
                rollup_id = f"{clean_date}_{clean_wp}".replace(" ", "_").lower()
                rollup_ref = db.collection("daily_district_rollups").document(rollup_id)
                r_snap = await asyncio.to_thread(rollup_ref.get)
                if r_snap.exists:
                    r_update = {"last_updated": firestore.SERVER_TIMESTAMP}
                    for mk, dv in metric_deltas.items():
                        r_update[mk] = firestore.Increment(dv)
                    await asyncio.to_thread(lambda: rollup_ref.update(r_update))
            except Exception as r_err:
                print(f"[Edit Day Rollup Notice] {r_err}")

        # 6. Invalidate caches and record tombstones (Scoped)
        old_wp = canonicalize_district(old_data.get("working_place", ""))
        for d in matching_docs:
            updated_report = dict(old_data)
            updated_report.update(doc_update)
            updated_report["id"] = d.id
            updated_report["doc_id"] = d.id
            updated_report["last_edited_at"] = now_str
            record_report_mutation("edit", d.id, district=clean_wp, date=clean_date, old_district=old_wp, report_data=updated_report)
            cache.delete(f"status_{d.id}")
        for cid in candidate_doc_ids:
            cache.delete(f"status_{cid}")
        cache.delete(f"status_{clean_wp}_{clean_fo}_{clean_date}".replace(" ", "_").lower())
        evict_officer_profile_cache(clean_wp, clean_fo, clean_date, old_district=old_wp)
        cache.delete_prefix("recent_id_edits_")

        month_pfx = clean_date[:7]
        try:
            snap_path = f"cache/dash_{month_pfx}.json"
            if os.path.exists(snap_path):
                os.remove(snap_path)
        except Exception:
            pass

        # 7. Immutable Audit Trail
        await log_admin_activity(
            action_type="EDIT_DAILY_REPORT",
            details=f"Admin {admin_user} edited full day report for {clean_fo} ({clean_wp}) on {clean_date}. Added: {len(all_added_ids)} IDs, Deleted: {len(all_deleted_ids)} IDs, Travel: {doc_update.get('travel_expenses', old_data.get('travel_expenses', 0))} KM",
            district=clean_wp,
            target_officer=clean_fo,
            user_name=admin_user,
            user_id=admin_id,
            role=admin_role,
            diff={"date": clean_date, "added_count": len(all_added_ids), "deleted_count": len(all_deleted_ids), "deltas": metric_deltas}
        )

        return {
            "success": True,
            "message": f"Successfully updated report for {clean_fo} on {clean_date}.",
            "district": clean_wp,
            "fo_name": clean_fo,
            "date": clean_date,
            "added_count": len(all_added_ids),
            "deleted_count": len(all_deleted_ids),
            "deltas": metric_deltas
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to edit day report: {str(e)}")

# --- 7-Day ID Modifications & Audit Radar ---
@router.get("/admin/reports/recent-id-edits")
@router.get("/admin/recent-id-edits")
async def get_recent_id_edits(
    days: Optional[int] = 7,
    limit: Optional[int] = 300,
    admin: dict = Depends(get_current_admin)
):
    try:
        admin_role = admin.get("role", "SUB_ADMIN")
        admin_id = admin.get("user_id") or admin.get("username", "admin")
        allowed_dists = admin.get("allowed_districts", [])
        
        days_num = max(1, min(days or 7, 30))
        cache_key = f"recent_id_edits_{admin_id}_{days_num}"
        cached_result = cache.get(cache_key)
        if cached_result is not None:
            return cached_result

        cutoff_dt = datetime.now() - timedelta(days=days_num)
        cutoff_str = cutoff_dt.strftime("%Y-%m-%d %H:%M:%S")

        docs = await asyncio.to_thread(lambda: list(db.collection("id_edit_logs")
            .order_by("timestamp", direction=firestore.Query.DESCENDING)
            .limit(limit or 300)
            .stream()))

        edits = []
        allowed_c = [canonicalize_district(a).lower() for a in allowed_dists]

        def format_log_to_ist(ts_val) -> str:
            if not ts_val:
                return ""
            try:
                if isinstance(ts_val, datetime):
                    dt = ts_val if ts_val.tzinfo is not None else ts_val.replace(tzinfo=timezone.utc)
                    dt_ist = dt.astimezone(timezone(timedelta(hours=5, minutes=30)))
                    return dt_ist.strftime("%d %b %Y, %I:%M:%S %p")
                clean_ts = str(ts_val).strip().replace("T", " ")[:19]
                dt = datetime.strptime(clean_ts, "%Y-%m-%d %H:%M:%S")
                return dt.strftime("%d %b %Y, %I:%M:%S %p")
            except Exception:
                return str(ts_val)

        for d in docs:
            data = d.to_dict()
            ts_str = str(data.get("timestamp", ""))
            if ts_str and ts_str < cutoff_str:
                continue

            wp = data.get("working_place") or data.get("district", "")
            c_wp = canonicalize_district(wp)

            if admin_role == "SUB_ADMIN" and allowed_dists and "All" not in allowed_dists:
                if c_wp.lower() not in allowed_c and wp.lower() not in allowed_c:
                    continue

            edits.append({
                "id": d.id,
                "timestamp": format_log_to_ist(data.get("timestamp")),
                "raw_timestamp": ts_str,
                "fo_name": data.get("fo_name", ""),
                "district": c_wp or wp,
                "date": data.get("date", ""),
                "category": data.get("category", ""),
                "action": (data.get("action") or "edit").lower(),
                "old_id": data.get("old_id", ""),
                "new_id": data.get("new_id", ""),
                "edited_by": data.get("edited_by", "Admin")
            })

        result = {
            "success": True,
            "days": days_num,
            "count": len(edits),
            "edits": edits
        }
        cache.set(cache_key, result, ttl=60)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch recent ID edits: {str(e)}")

