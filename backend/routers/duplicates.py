import re
import asyncio
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple, Set
from fastapi import APIRouter, HTTPException, Depends, Header, Query
from pydantic import BaseModel
import jwt

from backend.core.database import db
from backend.core.cache import cache
from backend.core.security import get_current_admin, JWT_SECRET, JWT_SECRET_KEY, JWT_ALGORITHM
from backend.core.supabase import (
    pg_execute_raw,
    pg_fetch_one,
    pg_update_row,
    get_active_db,
)
from backend.core.helpers import (
    get_ist_now,
    canonicalize_district,
    normalize_staff_key,
    is_officer_name_match,
    evict_officer_profile_cache,
    log_admin_activity,
    get_month_date_range
)
from backend.core.master_ledger import (
    get_raw_monthly_reports,
    record_report_mutation,
    upsert_in_memory_report
)
from backend.routers.reports import fetch_district_notification_registry

router = APIRouter(tags=["duplicates"])


@router.get("/admin/duplicate-audit")
async def duplicate_audit(month: Optional[str] = None, districts: Optional[str] = None, admin: dict = Depends(get_current_admin)):
    try:
        if not month:
            month = datetime.now().strftime("%Y-%m")
            
        cache_key = f"dupe_audit_{month}_{districts or 'all'}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        start_date, end_date = get_month_date_range(month)
        
        allowed_dist_set = None
        if districts and districts.strip() and districts.strip() != "All":
            allowed_dist_set = set([d.strip() for d in districts.split(",") if d.strip()])
        
        raw_reports = await get_raw_monthly_reports(month)
            
        id_registry = {} # id -> list of {fo_name, district, date, category}
        
        categories_map = {
            "notification_ids": "Notification",
            "hiv_dm_ids": "HIV & DM",
            "dbt_ids": "DBT",
            "sample_collection_ids": "Sample Collection",
            "sample_tested_ids": "Sample Tested",
            "outcome_assigned_ids": "Outcome Assigned",
            "home_visit_ids": "Home Visit",
            "contact_tracing_ids": "Contact Tracing",
            "follow_up_ids": "Follow Up",
            "face_to_face_ids": "Face to Face",
            "presumptive_ids": "Presumptive",
            "documents_ids": "Documents",
            "fdc_provided_ids": "FDC Provided",
            "kit_consumption_ids": "Kit Consumption",
            "differentiated_tb_ids": "Differentiated TB",
            "tpt_treatment_start_ids": "TPT Treatment Start",
            "tpt_presumptive_ids": "TPT Presumptive",
            "adhar_face_authentication_ids": "Adhar Face Auth",
            "consent_with_id_ids": "Consent with ID",
            "culture_dst_ids": "Culture / DST"
        }
        
        for doc in raw_reports:
            d = doc if isinstance(doc, dict) else doc.to_dict()
            fo = d.get("fo_name", "Unknown")
            dist = d.get("working_place", "Unknown")
            rep_date = d.get("date_of_reporting", "")
            
            for key, label in categories_map.items():
                ids = d.get(key) or []
                if isinstance(ids, list):
                    for patient_id in ids:
                        pid = str(patient_id).strip()
                        if len(pid) >= 5:
                            if pid not in id_registry:
                                id_registry[pid] = []
                            id_registry[pid].append({
                                "fo_name": fo,
                                "district": dist,
                                "date": rep_date,
                                "category": label
                            })
                            
        same_category_duplicates = []
        cross_category_history = []
        
        for pid, occurrences in id_registry.items():
            if len(occurrences) > 1:
                # If district filter is active, at least one occurrence must belong to allowed districts
                if allowed_dist_set and not any(o.get("district") in allowed_dist_set for o in occurrences):
                    continue

                # Check if any category was repeated
                cat_counts = {}
                for o in occurrences:
                    c = o['category']
                    cat_counts[c] = cat_counts.get(c, 0) + 1
                    
                is_same_category = any(cnt > 1 for cnt in cat_counts.values())
                
                entry = {
                    "patient_id": pid,
                    "occurrence_count": len(occurrences),
                    "is_same_category": is_same_category,
                    "repeated_categories": [c for c, cnt in cat_counts.items() if cnt > 1],
                    "occurrences": occurrences
                }
                
                if is_same_category:
                    same_category_duplicates.append(entry)
                else:
                    cross_category_history.append(entry)
                    
        res = {
            "status": "success",
            "month": month,
            "total_same_category_duplicates": len(same_category_duplicates),
            "total_cross_category": len(cross_category_history),
            "total_duplicate_ids": len(same_category_duplicates) + len(cross_category_history),
            "same_category_duplicates": same_category_duplicates,
            "cross_category_history": cross_category_history,
            "duplicates": same_category_duplicates + cross_category_history
        }
        cache.set(cache_key, res, ttl=180) # 180s cache avoids heavy regex/loop parsing on Render
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Admin Authentication & Secure Credential Management ---
class AdminLoginReq(BaseModel):
    password: str

class AdminChangePasswordReq(BaseModel):
    current_password: str
    new_password: str

def get_or_init_admin_auth() -> dict:
    doc_ref = db.collection("admin_config").document("auth_settings")


@router.get("/api/district-notification-registry")
async def get_district_notification_registry(
    district: str,
    months: int = 3,
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    try:
        clean_dist = canonicalize_district(district.strip()) if district else ""
        if not clean_dist:
            raise HTTPException(status_code=400, detail="Valid district is required.")

        # Sub-Admin RBAC check if credentials are provided
        raw_token = None
        if authorization and authorization.startswith("Bearer "):
            raw_token = authorization.split("Bearer ", 1)[1].strip()
        elif token:
            raw_token = token.strip()

        if raw_token:
            try:
                payload = jwt.decode(raw_token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
                admin_role = payload.get("role", "")
                allowed = payload.get("allowed_districts", []) or payload.get("districts", [])
                if admin_role == "SUB_ADMIN" and allowed and "All" not in allowed:
                    allowed_c = [canonicalize_district(a).lower() for a in allowed]
                    if clean_dist.lower() not in allowed_c:
                        raise HTTPException(status_code=403, detail=f"Permission denied for district '{district}'.")
            except HTTPException:
                raise
            except jwt.ExpiredSignatureError:
                raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
            except Exception:
                raise HTTPException(status_code=401, detail="Invalid authentication token. Access denied.")

        result = await fetch_district_notification_registry(clean_dist=clean_dist, months=months)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =========================================================================
# --- Admin Duplicate Notification Scan & Auto-Repair Endpoints (RBAC) ---
# =========================================================================

class RepairDuplicateRequest(BaseModel):
    month: str
    district: str
    instance_doc_id: str
    duplicate_ids: List[str]

@router.get("/admin/scan-duplicate-notifications")
@router.get("/admin/duplicate-scan")
async def scan_duplicate_notifications(
    month: Optional[str] = Query(None),
    districts: Optional[str] = Query(None),
    force_refresh: bool = Query(False),
    admin: dict = Depends(get_current_admin)
):
    try:
        clean_month = str(month).strip() if month and str(month).strip() else get_ist_now().strftime("%Y-%m")

        admin_role = admin.get("role", "SUB_ADMIN")
        allowed = admin.get("allowed_districts", []) or admin.get("districts", [])
        allowed_c = {canonicalize_district(d).lower() for d in allowed if d}
        is_subadmin = (admin_role == "SUB_ADMIN" and "all" not in allowed_c and "All" not in allowed)

        filter_districts = None
        if districts and districts.strip() and districts.strip().lower() != "all":
            filter_districts = {canonicalize_district(d.strip()).lower() for d in districts.split(",") if d.strip()}

        if is_subadmin:
            if filter_districts is not None:
                filter_districts = filter_districts.intersection(allowed_c)
            else:
                filter_districts = set(allowed_c)

        raw_reports = await get_raw_monthly_reports(clean_month, force=force_refresh)

        filtered_reports = []
        for d in raw_reports:
            data = d if isinstance(d, dict) else (d.to_dict() if hasattr(d, "to_dict") else {})
            wp = data.get("working_place", "") or data.get("district", "")
            c_wp = canonicalize_district(wp)
            if not c_wp:
                continue
            if filter_districts is not None and c_wp.lower() not in filter_districts:
                continue
            filtered_reports.append(data)

        # Sort reports chronologically by date_of_reporting ASC
        filtered_reports.sort(key=lambda r: str(r.get("date_of_reporting", "")).strip())

        first_seen = {}  # pid -> { "date": dt, "fo_name": fo, "doc_id": doc_id, "district": dist }
        instances_map = {}  # repeat_doc_id -> instance dict

        for d in filtered_reports:
            c_wp = canonicalize_district(d.get("working_place", "") or d.get("district", ""))
            fo = str(d.get("fo_name", "Unknown")).strip()
            dt = str(d.get("date_of_reporting", "")).strip()
            doc_id = getattr(d, "id", None) or d.get("id") or d.get("doc_id")
            if not doc_id:
                doc_id = f"{c_wp}_{fo}_{dt}".replace(" ", "_").lower()

            notifs = d.get("notification_ids", []) or []
            seen_in_this_doc = set()
            for nid in notifs:
                clean_nid = str(nid).strip()
                if not clean_nid or len(clean_nid) < 5:
                    continue
                if clean_nid in seen_in_this_doc:
                    continue
                seen_in_this_doc.add(clean_nid)

                if clean_nid in first_seen:
                    orig = first_seen[clean_nid]
                    if orig["doc_id"] != doc_id:
                        if doc_id not in instances_map:
                            instances_map[doc_id] = {
                                "district": c_wp,
                                "fo_name": fo,
                                "repeat_date": dt,
                                "repeat_doc_id": doc_id,
                                "duplicate_ids": [],
                                "original_occurrences": []
                            }
                        instances_map[doc_id]["duplicate_ids"].append(clean_nid)
                        instances_map[doc_id]["original_occurrences"].append({
                            "id": clean_nid,
                            "date": orig["date"],
                            "fo_name": orig["fo_name"]
                        })
                else:
                    first_seen[clean_nid] = {
                        "date": dt,
                        "fo_name": fo,
                        "doc_id": doc_id,
                        "district": c_wp
                    }

        instances = list(instances_map.values())
        total_inflated = sum(len(inst["duplicate_ids"]) for inst in instances)

        return {
            "status": "success",
            "month": clean_month,
            "total_instances": len(instances),
            "total_inflated_count": total_inflated,
            "instances": instances
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/repair-duplicate-notifications")
async def repair_duplicate_notifications(
    req: RepairDuplicateRequest,
    admin: dict = Depends(get_current_admin)
):
    try:
        clean_dist = canonicalize_district(req.district.strip()) if req.district else ""
        if not clean_dist:
            raise HTTPException(status_code=400, detail="Valid district is required.")
        clean_doc_id = str(req.instance_doc_id).strip() if req.instance_doc_id else ""
        if not clean_doc_id:
            raise HTTPException(status_code=400, detail="instance_doc_id is required.")

        admin_role = admin.get("role", "SUB_ADMIN")
        allowed = admin.get("allowed_districts", []) or admin.get("districts", [])
        allowed_c = [canonicalize_district(d).lower() for d in allowed if d]
        target_c = clean_dist.lower()

        if admin_role == "SUB_ADMIN":
            if "All" not in allowed and "all" not in allowed_c and target_c not in allowed_c:
                raise HTTPException(
                    status_code=403, 
                    detail=f"Permission Denied: You do not have access to repair data for district '{req.district}'."
                )

        # 1. Retrieve document instance_doc_id from daily_field_reports
        doc_ref = db.collection("daily_field_reports").document(clean_doc_id)
        doc_snap = await asyncio.to_thread(doc_ref.get)
        if not doc_snap.exists:
            raise HTTPException(status_code=404, detail=f"Report document '{clean_doc_id}' not found.")

        report_data = doc_snap.to_dict() or {}

        # 2. Verify canonical district matches
        doc_district = canonicalize_district(report_data.get("working_place", "") or report_data.get("district", ""))
        if doc_district.lower() != target_c:
            raise HTTPException(
                status_code=400,
                detail=f"District mismatch: document belongs to '{doc_district}', but request specified '{req.district}'."
            )

        if admin_role == "SUB_ADMIN" and "All" not in allowed and "all" not in allowed_c:
            if doc_district.lower() not in allowed_c:
                raise HTTPException(
                    status_code=403, 
                    detail=f"Permission Denied: You do not have access to repair data for district '{doc_district}'."
                )

        # 3. Filter notification_ids = [pid for pid in current_notifs if pid not in req.duplicate_ids]
        current_notifs = list(report_data.get("notification_ids") or [])
        dupe_set = {str(x).strip() for x in (req.duplicate_ids or []) if str(x).strip()}
        filtered = [pid for pid in current_notifs if str(pid).strip() not in dupe_set]

        # 4. Calculate removed_count = len(current_notifs) - len(filtered)
        removed_count = len(current_notifs) - len(filtered)

        # 5. Update document with filtered notification IDs (if any removed)
        if removed_count > 0:
            # PostgreSQL persistence
            pg_rep = None
            try:
                pg_rep = pg_fetch_one("daily_field_reports", filters={"id": clean_doc_id}) or pg_fetch_one("daily_field_reports", filters={"legacy_doc_id": clean_doc_id})
            except Exception:
                pass
            report_id = (pg_rep.get("id") if pg_rep else None) or clean_doc_id

            if report_id and dupe_set:
                try:
                    pg_execute_raw(
                        "DELETE FROM report_kpi_entries WHERE report_id = %s AND category IN ('notification_ids', 'notifications') AND patient_id = ANY(%s)",
                        [report_id, list(dupe_set)]
                    )
                except Exception as del_err:
                    print(f"[repair-duplicate PG child delete notice]: {del_err}")

                try:
                    pg_execute_raw(
                        "UPDATE daily_field_reports SET notifications = %s, last_repaired_at = %s, last_repaired_by = %s WHERE id = %s",
                        [len(filtered), get_ist_now().strftime("%Y-%m-%d %H:%M:%S"), admin.get("username") or admin.get("user_id") or "admin", report_id]
                    )
                except Exception as upd_err:
                    print(f"[repair-duplicate PG parent update notice]: {upd_err}")

            await asyncio.to_thread(lambda: doc_ref.update({
                "notification_ids": filtered,
                "last_repaired_at": get_ist_now().strftime("%Y-%m-%d %H:%M:%S"),
                "last_repaired_by": admin.get("username") or admin.get("user_id") or "admin"
            }))

            # 6. Decrement daily_district_rollups in PostgreSQL & mock store
            report_date = str(report_data.get("date_of_reporting") or report_data.get("date", "")).strip()
            if not report_date:
                parts = clean_doc_id.split("_")
                if len(parts) >= 3 and len(parts[-1]) == 10 and "-" in parts[-1]:
                    report_date = parts[-1]

            if report_date and doc_district:
                rollup_id = f"{report_date}_{doc_district}".replace(" ", "_").lower()
                try:
                    pg_execute_raw(
                        "UPDATE daily_district_rollups SET notifications = GREATEST(0, COALESCE(notifications, 0) - %s), last_updated = %s WHERE id = %s",
                        [removed_count, get_ist_now().strftime("%Y-%m-%d %H:%M:%S"), rollup_id]
                    )
                except Exception as roll_err:
                    print(f"[repair-duplicate PG rollup notice]: {roll_err}")

                try:
                    rollup_ref = db.collection("daily_district_rollups").document(rollup_id)
                    await asyncio.to_thread(lambda: rollup_ref.set({
                        "notifications": -removed_count,
                        "last_updated": get_ist_now().strftime("%Y-%m-%d %H:%M:%S")
                    }, merge=True))
                except Exception:
                    pass

            # 7. Log audit in admin_audit_logs
            actor_name = admin.get("name") or admin.get("username") or "Admin"
            actor_id = admin.get("user_id") or admin.get("username", "admin")
            await log_admin_activity(
                action_type="REPAIR_DUPLICATE_NOTIFICATIONS",
                details=f"Removed {removed_count} duplicate notification IDs from document {clean_doc_id} ({doc_district})",
                user_name=actor_name,
                user_id=actor_id,
                role=admin.get("role", "SUB_ADMIN"),
                district=doc_district,
                target_officer=report_data.get("fo_name", ""),
                diff={
                    "doc_id": clean_doc_id,
                    "removed_count": removed_count,
                    "duplicate_ids": req.duplicate_ids
                }
            )

            # 8. Invalidate caches (Scoped)
            report_data["notification_ids"] = filtered
            report_data["notifications"] = len(filtered)
            report_data["id"] = clean_doc_id
            report_data["doc_id"] = clean_doc_id
            report_data["last_edited_at"] = get_ist_now().strftime("%Y-%m-%d %H:%M:%S")
            record_report_mutation("repair", clean_doc_id, district=doc_district, date=report_date, report_data=report_data)
            cache.delete(f"status_{clean_doc_id}")
            evict_officer_profile_cache(doc_district, report_data.get("fo_name", ""), report_date)

        # 9. Return response
        return {
            "status": "success",
            "message": f"Successfully removed {removed_count} duplicate notification IDs.",
            "removed_count": removed_count
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


