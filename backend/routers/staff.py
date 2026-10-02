import os
import io
import re
import json
import asyncio
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import pandas as pd
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from backend.core.database import db
from backend.core.cache import cache
from backend.core.security import get_current_admin, require_super_admin
from backend.core.helpers import (
    get_ist_now,
    DEFAULT_BIHAR_DISTRICTS,
    canonicalize_district,
    load_baseline_staff_directory,
    evict_officer_profile_cache,
    log_admin_activity
)
from backend.core.master_ledger import (
    get_cached_staff_directory_raw,
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

router = APIRouter(tags=["staff"])


@router.get("/staff-directory")
@router.get("/admin/directory")
@router.get("/get-directory")
async def get_staff_directory():
    try:
        cached = cache.get("staff_directory_list")
        if cached is not None and isinstance(cached, dict) and len(cached) == len(DEFAULT_BIHAR_DISTRICTS):
            return {"status": "success", "data": cached}

        try:
            records = await get_cached_staff_directory_raw()
            directory = {d: [] for d in DEFAULT_BIHAR_DISTRICTS}
            for data in records:
                if data.get("is_active") is False or data.get("status") == "inactive":
                    continue
                district = canonicalize_district(data.get("district"))
                name = data.get("name")
                if district in directory and name:
                    if name not in directory[district]:
                        directory[district].append(name)
            
            for d in directory:
                directory[d] = sorted(directory[d])

            # Save snapshot to disk
            try:
                with open("staff_directory_snapshot.json", "w", encoding="utf-8") as f:
                    json.dump(directory, f, indent=2)
            except Exception:
                pass
                
            cache.set("staff_directory_list", directory, ttl=3600) # 1 hour cache
            return {"status": "success", "data": directory}
        except Exception as fe:
            print(f"Firestore staff-directory query notice (quota/network): {fe}")
            fallback_dir = load_baseline_staff_directory()
            cache.set("staff_directory_list", fallback_dir, ttl=300)
            return {"status": "success", "data": fallback_dir, "fallback": True}
    except Exception as e:
        fallback_dir = load_baseline_staff_directory()
        return {"status": "success", "data": fallback_dir, "fallback": True}



# --- Admin Staff & PIN Management Suite ---
class AddStaffReq(BaseModel):
    district: str
    name: str
    pin: str
    designation: Optional[str] = "Field Officer"
    target: Optional[int] = 50

class UpdatePinReq(BaseModel):
    district: str
    name: str
    new_pin: str

class UpdateStaffDetailsReq(BaseModel):
    district: str
    name: str
    new_pin: Optional[str] = None
    designation: Optional[str] = None
    target: Optional[int] = None

class DeleteStaffReq(BaseModel):
    district: str
    name: str

class ToggleStaffStatusReq(BaseModel):
    district: str
    fo_name: str
    status: str  # "active" | "inactive"
    effective_date: Optional[str] = None  # YYYY-MM-DD

@router.get("/admin/staff/list")
@router.get("/admin/staff-list")
async def get_staff_full_list(
    districts: Optional[str] = None,
    status_filter: Optional[str] = "active",
    admin: dict = Depends(get_current_admin)
):
    try:
        norm_status = (status_filter or "active").strip().lower()
        if norm_status not in ["active", "inactive", "all"]:
            norm_status = "active"
        cache_key = f"admin_staff_full_list_{districts or 'all'}_{norm_status}"
        cached = cache.get(cache_key)
        if cached is not None and isinstance(cached, dict):
            return cached

        allowed_dist_set = None
        if districts and districts.strip() and districts.strip() != "All":
            allowed_dist_set = set([d.strip() for d in districts.split(",") if d.strip()])

        records = await get_cached_staff_directory_raw()
        staff = []
        for d in records:
            is_active = d.get("is_active") is not False and d.get("status") != "inactive"
            if norm_status == "active" and not is_active:
                continue
            elif norm_status == "inactive" and is_active:
                continue
            # If norm_status == "all", include both

            dist = d.get("district")
            if dist and d.get("name"):
                if allowed_dist_set and dist not in allowed_dist_set:
                    continue
                staff.append({
                    "id": d.get("id", ""),
                    "district": dist,
                    "name": d.get("name"),
                    "pin": str(d.get("pin", "")),
                    "designation": d.get("designation", "Field Officer"),
                    "created_at": d.get("created_at", ""),
                    "status": "active" if is_active else "inactive",
                    "is_active": is_active,
                    "inactive_since": d.get("inactive_since")
                })
        staff.sort(key=lambda s: (s["district"], s["name"]))
        res = {"success": True, "staff": staff}
        cache.set(cache_key, res, ttl=1800) # 30-minute cache
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/staff/add")
async def add_staff_member(req: AddStaffReq, admin: dict = Depends(get_current_admin)):
    try:
        clean_dist = canonicalize_district(req.district.strip())
        if admin.get("role") == "SUB_ADMIN":
            allowed = admin.get("allowed_districts", [])
            if "All" not in allowed and clean_dist not in allowed:
                raise HTTPException(status_code=403, detail=f"Permission denied. You cannot manage staff in district '{clean_dist}'.")
        clean_name = req.name.strip()
        clean_pin = str(req.pin).strip()
        
        if not clean_dist or not clean_name:
            raise HTTPException(status_code=400, detail="District and Officer Name are required.")
            
        if not clean_pin.isdigit() or len(clean_pin) != 4:
            raise HTTPException(status_code=400, detail="PIN must be exactly 4 digits.")
            
        doc_id = f"{clean_dist}_{clean_name}".replace(" ", "").lower()
        doc_ref = db.collection("staff_directory").document(doc_id)
        
        existing = await asyncio.to_thread(doc_ref.get)
        if existing.exists:
            ex_data = existing.to_dict() or {}
            if ex_data.get("is_active") is not False and ex_data.get("status") != "inactive":
                raise HTTPException(status_code=400, detail=f"Officer '{clean_name}' already exists in '{clean_dist}'.")
            
        payload = {
            "district": clean_dist,
            "name": clean_name,
            "pin": clean_pin,
            "designation": req.designation or "Field Officer",
            "status": "active",
            "is_active": True,
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        await asyncio.to_thread(lambda: doc_ref.set(payload))
        
        target_val = int(req.target) if req.target is not None and str(req.target).strip() != "" else 50
        current_month = get_ist_now().strftime("%Y-%m")
        # 1. Month-scoped document
        month_doc_id = f"{current_month}_{clean_dist}_{clean_name}".replace(" ", "").lower()
        await asyncio.to_thread(lambda: db.collection("staff_targets").document(month_doc_id).set({
            "month": current_month,
            "district": clean_dist,
            "fo_name": clean_name,
            "target": target_val,
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }, merge=True))

        # 2. General fallback document
        target_doc_id = f"{clean_dist}_{clean_name}".replace(" ", "").lower()
        await asyncio.to_thread(lambda: db.collection("staff_targets").document(target_doc_id).set({
            "district": clean_dist,
            "fo_name": clean_name,
            "target": target_val,
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }, merge=True))

        # Update disk snapshot
        if os.path.exists("staff_directory_snapshot.json"):
            try:
                with open("staff_directory_snapshot.json", "r", encoding="utf-8") as f:
                    snap = json.load(f)
                if snap and isinstance(snap, dict):
                    if clean_dist not in snap:
                        snap[clean_dist] = []
                    if clean_name not in snap[clean_dist]:
                        snap[clean_dist].append(clean_name)
                        snap[clean_dist].sort()
                    with open("staff_directory_snapshot.json", "w", encoding="utf-8") as f:
                        json.dump(snap, f, indent=2)
            except Exception as se:
                print(f"Failed to update staff_directory_snapshot.json: {se}")
        
        invalidate_staff_directory_cache()
        cache.delete_prefix("statewide_top_")
        cache.delete_prefix("attendance_")
        cache.delete_prefix("targets_")
        cache.delete_prefix("staff_targets_raw_")
        evict_officer_profile_cache(clean_dist, clean_name, get_ist_now().strftime("%Y-%m"))
        
        actor_name = admin.get("name") or admin.get("username", "Admin")
        actor_id = admin.get("user_id") or admin.get("username", "admin")
        actor_role = admin.get("role", "SUB_ADMIN")
        await log_admin_activity(
            action_type="STAFF_ADDED",
            details=f"Admin {actor_name} added officer '{clean_name}' ({req.designation or 'Field Officer'}) to {clean_dist} with target {req.target or 50}",
            district=clean_dist,
            target_officer=clean_name,
            user_name=actor_name,
            user_id=actor_id,
            role=actor_role,
            diff={"designation": req.designation or "Field Officer", "target": req.target or 50}
        )
        
        return {"success": True, "message": f"Officer '{clean_name}' added successfully to {clean_dist}!"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/staff/update-pin")
async def update_staff_pin(req: UpdatePinReq, admin: dict = Depends(get_current_admin)):
    try:
        clean_dist = canonicalize_district(req.district.strip())
        if admin.get("role") == "SUB_ADMIN":
            allowed = admin.get("allowed_districts", [])
            if "All" not in allowed and clean_dist not in allowed:
                raise HTTPException(status_code=403, detail=f"Permission denied. You cannot update PINs in district '{clean_dist}'.")
        clean_name = req.name.strip()
        clean_pin = str(req.new_pin).strip()
        
        if not clean_pin.isdigit() or len(clean_pin) != 4:
            raise HTTPException(status_code=400, detail="New PIN must be exactly 4 digits.")
            
        doc_id = f"{clean_dist}_{clean_name}".replace(" ", "").lower()
        doc_ref = db.collection("staff_directory").document(doc_id)
        
        doc = await asyncio.to_thread(doc_ref.get)
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Staff record not found.")
            
        await asyncio.to_thread(lambda: doc_ref.update({
            "pin": clean_pin,
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }))
        
        cache.delete(f"pin_{doc_id}")
        invalidate_staff_directory_cache()
        
        actor_name = admin.get("name") or admin.get("username", "Admin")
        actor_id = admin.get("user_id") or admin.get("username", "admin")
        actor_role = admin.get("role", "SUB_ADMIN")
        await log_admin_activity(
            action_type="PIN_RESET",
            details=f"Admin {actor_name} reset PIN for officer '{clean_name}' in {clean_dist}",
            district=clean_dist,
            target_officer=clean_name,
            user_name=actor_name,
            user_id=actor_id,
            role=actor_role,
            diff={"district": clean_dist, "target_officer": clean_name}
        )
        
        return {"success": True, "message": f"PIN for '{clean_name}' successfully updated to {clean_pin}!"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/staff/update-details")
async def update_staff_details(req: UpdateStaffDetailsReq, admin: dict = Depends(get_current_admin)):
    try:
        clean_dist = canonicalize_district(req.district.strip())
        if admin.get("role") == "SUB_ADMIN":
            allowed = admin.get("allowed_districts", [])
            if "All" not in allowed and clean_dist not in allowed:
                raise HTTPException(status_code=403, detail=f"Permission denied. You cannot update staff in district '{clean_dist}'.")
        clean_name = req.name.strip()
        current_month = get_ist_now().strftime("%Y-%m")
        
        doc_id = f"{clean_dist}_{clean_name}".replace(" ", "").lower()
        doc_ref = db.collection("staff_directory").document(doc_id)
        
        doc = await asyncio.to_thread(doc_ref.get)
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Staff record not found.")
            
        update_data = {
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        diff_info = {"district": clean_dist, "target_officer": clean_name}
        
        if req.new_pin is not None and str(req.new_pin).strip():
            clean_pin = str(req.new_pin).strip()
            if not clean_pin.isdigit() or len(clean_pin) != 4:
                raise HTTPException(status_code=400, detail="New PIN must be exactly 4 digits.")
            update_data["pin"] = clean_pin
            diff_info["pin_updated"] = True
            
        if req.designation is not None and str(req.designation).strip():
            clean_desig = str(req.designation).strip()
            update_data["designation"] = clean_desig
            diff_info["designation"] = clean_desig
            
        await asyncio.to_thread(lambda: doc_ref.update(update_data))
        
        if req.target is not None and str(req.target).strip() != "" and int(req.target) >= 0:
            target_val = int(req.target)
            current_month = get_ist_now().strftime("%Y-%m")
            # 1. Month-scoped document
            month_doc_id = f"{current_month}_{clean_dist}_{clean_name}".replace(" ", "").lower()
            await asyncio.to_thread(lambda: db.collection("staff_targets").document(month_doc_id).set({
                "month": current_month,
                "district": clean_dist,
                "fo_name": clean_name,
                "target": target_val,
                "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }, merge=True))

            # 2. General fallback document
            target_doc_id = f"{clean_dist}_{clean_name}".replace(" ", "").lower()
            await asyncio.to_thread(lambda: db.collection("staff_targets").document(target_doc_id).set({
                "district": clean_dist,
                "fo_name": clean_name,
                "target": target_val,
                "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }, merge=True))

            # 3. Synchronize alias documents if applicable (e.g. Vinay Prakash <-> Vinay Kumar in Muzaffarpur)
            if clean_dist.lower() == "muzaffarpur" and clean_name.lower() in ("vinay prakash", "vinay kumar", "vinay kumar lt"):
                for alias in ("Vinay Prakash", "Vinay Kumar"):
                    if alias.lower() != clean_name.lower():
                        a_mid = f"{current_month}_{clean_dist}_{alias}".replace(" ", "").lower()
                        a_fid = f"{clean_dist}_{alias}".replace(" ", "").lower()
                        await asyncio.to_thread(lambda: db.collection("staff_targets").document(a_mid).set({
                            "month": current_month,
                            "district": clean_dist,
                            "fo_name": alias,
                            "target": target_val,
                            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        }, merge=True))
                        await asyncio.to_thread(lambda: db.collection("staff_targets").document(a_fid).set({
                            "district": clean_dist,
                            "fo_name": alias,
                            "target": target_val,
                            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        }, merge=True))

            diff_info["target"] = target_val
            diff_info["month"] = current_month
            
        cache.delete(f"pin_{doc_id}")
        invalidate_staff_directory_cache()
        cache.delete_prefix("statewide_top_")
        cache.delete_prefix("attendance_")
        cache.delete_prefix("targets_")
        cache.delete_prefix("staff_targets_raw_")
        evict_officer_profile_cache(clean_dist, clean_name, current_month)
        
        actor_name = admin.get("name") or admin.get("username", "Admin")
        actor_id = admin.get("user_id") or admin.get("username", "admin")
        actor_role = admin.get("role", "SUB_ADMIN")
        await log_admin_activity(
            action_type="STAFF_DETAILS_UPDATED",
            details=f"Admin {actor_name} updated details for '{clean_name}' in {clean_dist}",
            district=clean_dist,
            target_officer=clean_name,
            user_name=actor_name,
            user_id=actor_id,
            role=actor_role,
            diff=diff_info
        )
        
        return {"success": True, "message": f"Staff details for '{clean_name}' successfully updated!"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/staff/delete")
async def delete_staff_member(req: DeleteStaffReq, admin: dict = Depends(get_current_admin)):
    try:
        clean_dist = canonicalize_district(req.district.strip())
        if admin.get("role") == "SUB_ADMIN":
            allowed = admin.get("allowed_districts", [])
            if "All" not in allowed and clean_dist not in allowed:
                raise HTTPException(status_code=403, detail=f"Permission denied. You cannot delete staff in district '{clean_dist}'.")
        clean_name = req.name.strip()
        
        doc_id = f"{clean_dist}_{clean_name}".replace(" ", "").lower()
        doc_ref = db.collection("staff_directory").document(doc_id)
        
        doc = await asyncio.to_thread(doc_ref.get)
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Staff record not found.")
            
        today_str = get_ist_now().strftime("%Y-%m-%d")
        now_str = get_ist_now().strftime("%Y-%m-%d %H:%M:%S")
        await asyncio.to_thread(lambda: doc_ref.update({
            "status": "inactive",
            "is_active": False,
            "deleted_at": today_str,
            "updated_at": now_str
        }))

        # Update disk snapshot
        if os.path.exists("staff_directory_snapshot.json"):
            try:
                with open("staff_directory_snapshot.json", "r", encoding="utf-8") as f:
                    snap = json.load(f)
                if snap and isinstance(snap, dict) and clean_dist in snap:
                    snap[clean_dist] = [n for n in snap[clean_dist] if n.strip().lower() != clean_name.lower()]
                    with open("staff_directory_snapshot.json", "w", encoding="utf-8") as f:
                        json.dump(snap, f, indent=2)
            except Exception as se:
                print(f"Failed to update staff_directory_snapshot.json: {se}")
        
        cache.delete(f"pin_{doc_id}")
        invalidate_staff_directory_cache()
        cache.delete_prefix("statewide_top_")
        cache.delete_prefix("attendance_")
        
        actor_name = admin.get("name") or admin.get("username", "Admin")
        actor_id = admin.get("user_id") or admin.get("username", "admin")
        actor_role = admin.get("role", "SUB_ADMIN")
        await log_admin_activity(
            action_type="STAFF_DELETED",
            details=f"Admin {actor_name} soft-deleted officer '{clean_name}' from {clean_dist} (effective {today_str})",
            district=clean_dist,
            target_officer=clean_name,
            user_name=actor_name,
            user_id=actor_id,
            role=actor_role,
            diff={"district": clean_dist, "deleted_officer": clean_name, "deleted_at": today_str}
        )
        
        return {"success": True, "message": f"Officer '{clean_name}' removed from directory."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/staff/toggle-status")
async def toggle_staff_status(req: ToggleStaffStatusReq, admin: dict = Depends(get_current_admin)):
    try:
        clean_dist = canonicalize_district(req.district.strip()) if req.district else ""
        if not clean_dist:
            raise HTTPException(status_code=400, detail="District is required.")
        clean_fo = req.fo_name.strip() if req.fo_name else ""
        if not clean_fo:
            raise HTTPException(status_code=400, detail="Staff name is required.")

        # Sub-admin RBAC check
        if admin.get("role") == "SUB_ADMIN":
            allowed = admin.get("allowed_districts", []) or admin.get("districts", [])
            allowed_c = [canonicalize_district(d).lower() for d in allowed if d]
            if "All" not in allowed and "all" not in allowed_c and clean_dist.lower() not in allowed_c and clean_dist not in allowed:
                raise HTTPException(status_code=403, detail=f"Permission denied. You cannot manage staff in district '{clean_dist}'.")

        # Candidate doc IDs resolution
        clean_fo_alpha = re.sub(r'[^a-zA-Z0-9]', '', clean_fo).lower()
        candidate_ids = [
            f"{clean_dist}_{clean_fo}".replace(" ", "").lower(),
            f"{req.district.strip()}_{clean_fo}".replace(" ", "").lower(),
            f"{clean_dist.replace(' ', '')}_{clean_fo_alpha}".lower()
        ]
        if "aurangabad" in clean_dist.lower():
            candidate_ids.extend([f"aurangabad_{clean_fo_alpha}", f"aurangabad_{clean_fo}".replace(" ", "").lower()])
        if "champaran" in clean_dist.lower():
            candidate_ids.extend([f"eastchamparan_{clean_fo_alpha}", f"east_champaran_{clean_fo_alpha}"])
        if "bhojpur" in clean_dist.lower():
            candidate_ids.extend([f"bhojpur_{clean_fo_alpha}"])

        candidate_ids = list(dict.fromkeys(candidate_ids))
        primary_id = candidate_ids[0]

        target_doc = None
        target_ref = None
        target_doc_id = None
        for cid in candidate_ids:
            doc_ref = db.collection("staff_directory").document(cid)
            doc_snap = await asyncio.to_thread(doc_ref.get)
            if doc_snap.exists:
                target_doc = doc_snap
                target_ref = doc_ref
                target_doc_id = cid
                break

        if not target_doc:
            raise HTTPException(status_code=404, detail=f"Staff record for '{clean_fo}' in '{clean_dist}' not found.")

        today_str = get_ist_now().strftime("%Y-%m-%d")
        now_str = get_ist_now().strftime("%Y-%m-%d %H:%M:%S")

        status_norm = req.status.strip().lower()
        if status_norm == "inactive":
            is_active = False
            status_val = "inactive"
            inactive_since = req.effective_date.strip() if req.effective_date and req.effective_date.strip() else today_str
            update_data = {
                "is_active": False,
                "status": "inactive",
                "inactive_since": inactive_since,
                "updated_at": now_str
            }
        elif status_norm == "active":
            is_active = True
            status_val = "active"
            inactive_since = None
            update_data = {
                "is_active": True,
                "status": "active",
                "inactive_since": None,
                "updated_at": now_str
            }
        else:
            raise HTTPException(status_code=400, detail="Invalid status. Must be 'active' or 'inactive'.")

        await asyncio.to_thread(lambda: target_ref.set(update_data, merge=True))

        # Sync staff_directory_snapshot.json (remove if inactive, add if active)
        if os.path.exists("staff_directory_snapshot.json"):
            try:
                with open("staff_directory_snapshot.json", "r", encoding="utf-8") as f:
                    snap = json.load(f)
                if snap and isinstance(snap, dict):
                    if clean_dist not in snap:
                        snap[clean_dist] = []
                    existing_names_lower = [n.strip().lower() for n in snap[clean_dist]]
                    if not is_active:
                        snap[clean_dist] = [n for n in snap[clean_dist] if n.strip().lower() != clean_fo.lower()]
                    else:
                        if clean_fo.lower() not in existing_names_lower:
                            snap[clean_dist].append(clean_fo)
                            snap[clean_dist].sort()
                    with open("staff_directory_snapshot.json", "w", encoding="utf-8") as f:
                        json.dump(snap, f, indent=2)
            except Exception as se:
                print(f"Failed to update staff_directory_snapshot.json: {se}")

        # Invalidate caches
        cache.delete(f"pin_{target_doc_id}")
        cache.delete(f"pin_{primary_id}")
        invalidate_staff_directory_cache()
        cache.delete_prefix("statewide_top_")
        cache.delete_prefix("attendance_")

        # Admin Activity Logging
        actor_name = admin.get("name") or admin.get("username", "Admin")
        actor_id = admin.get("user_id") or admin.get("username", "admin")
        actor_role = admin.get("role", "SUB_ADMIN")
        await log_admin_activity(
            action_type="STAFF_STATUS_TOGGLED",
            details=f"Admin {actor_name} set status of officer '{clean_fo}' in {clean_dist} to {status_val}",
            district=clean_dist,
            target_officer=clean_fo,
            user_name=actor_name,
            user_id=actor_id,
            role=actor_role,
            diff={
                "district": clean_dist,
                "target_officer": clean_fo,
                "status": status_val,
                "is_active": is_active,
                "inactive_since": inactive_since
            }
        )

        return {"success": True, "message": f"Staff '{req.fo_name}' status set to {req.status}."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/admin/staff/export-pins")
async def export_staff_pins(district: Optional[str] = "All", districts: Optional[str] = None, admin: dict = Depends(require_super_admin)):
    try:
        allowed_dist_set = None
        if districts and districts.strip() and districts.strip() != "All":
            allowed_dist_set = set([d.strip() for d in districts.split(",") if d.strip()])

        records = await get_cached_staff_directory_raw()
        rows = []
        s_no = 1
        for d in records:
            dist = d.get("district", "")
            name = d.get("name", "")
            if allowed_dist_set and dist not in allowed_dist_set:
                continue
            if district != "All" and dist != district:
                continue
            if dist and name:
                rows.append({
                    "S.No": s_no,
                    "District": dist,
                    "Officer Name": name,
                    "Designation": d.get("designation", "Field Officer"),
                    "4-Digit PIN": str(d.get("pin", "")),
                    "Status": "Active"
                })
                s_no += 1
                
        rows.sort(key=lambda r: (r["District"], r["Officer Name"]))
        for idx, r in enumerate(rows):
            r["S.No"] = idx + 1
            
        df = pd.DataFrame(rows)
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            sheet_title = f"PINs {district}" if len(district) < 20 else "Staff PINs"
            df.to_excel(writer, index=False, sheet_name=sheet_title[:31])
            ws = writer.sheets[sheet_title[:31]]
            style_excel_worksheet(ws, header_fill_color="1E3A8A")
                
        output.seek(0)
        filename = f"DFY_Staff_PIN_Directory_{district}_{datetime.now().strftime('%Y-%m-%d')}.xlsx"
        return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename={filename}"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Predictive Cascade & Dropout Alerts Engine (Mission Critical Priority) ---
