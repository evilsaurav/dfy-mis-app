import asyncio
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from backend.core.database import db
from backend.core.cache import cache
from backend.core.security import get_current_admin
from backend.core.helpers import (
    canonicalize_district,
    is_officer_name_match,
    get_previous_month,
    evict_officer_profile_cache,
    log_admin_activity
)
from backend.core.master_ledger import (
    get_cached_staff_targets_for_month,
    get_directory,
    invalidate_staff_directory_cache
)

router = APIRouter(tags=["targets"])

class TargetUpdate(BaseModel):
    district: str
    fo_name: str
    target: int
    month: Optional[str] = None

class DistrictTargetUpdate(BaseModel):
    month: Optional[str] = None
    district: str
    official_target: int

class BulkDistrictTargetUpdate(BaseModel):
    month: Optional[str] = None
    targets: List[DistrictTargetUpdate]

class BulkStaffTargetUpdate(BaseModel):
    month: Optional[str] = None
    targets: List[TargetUpdate]

@router.get("/targets")
@router.get("/get-targets")
@router.get("/admin/targets")
async def get_targets(district: Optional[str] = None, month: Optional[str] = None, districts: Optional[str] = None):
    try:
        if not month:
            month = datetime.now().strftime("%Y-%m")
            
        allowed_dist_set = None
        if districts and districts.strip() and districts.strip() != "All":
            allowed_dist_set = set([d.strip() for d in districts.split(",") if d.strip()])

        cache_key = f"targets_{month}_{district or 'all'}_{districts or 'all'}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        target_records = await get_cached_staff_targets_for_month(month)
        prev_month = get_previous_month(month)
        
        month_targets = {}
        historical_staff_targets = {}
        default_targets = {}
        
        for data in target_records:
            if not isinstance(data, dict):
                continue
            d_dist = data.get("district")
            d_name = data.get("fo_name")
            d_target = int(data.get("target", 50)) if str(data.get("target", "")).isdigit() else 50
            d_month = data.get("month")
            
            if not d_dist or not d_name:
                continue
                
            key = f"{d_dist}_{d_name}".lower()
            
            if d_month == month:
                month_targets[key] = {
                    "fo_name": d_name,
                    "district": d_dist,
                    "target": d_target,
                    "month": month
                }
            elif d_month and d_month < month:
                if key not in historical_staff_targets or d_month > historical_staff_targets[key]["source_month"]:
                    historical_staff_targets[key] = {
                        "fo_name": d_name,
                        "district": d_dist,
                        "target": d_target,
                        "month": month,
                        "source_month": d_month
                    }
            elif not d_month:
                default_targets[key] = {
                    "fo_name": d_name,
                    "district": d_dist,
                    "target": d_target,
                    "month": month
                }

        dir_dict = await get_directory()
        targets = []
        
        for s_dist, names in dir_dict.items():
            if allowed_dist_set and s_dist not in allowed_dist_set:
                continue
            if district and district != "All" and s_dist != district:
                continue
            for s_name in names:
                if not s_name:
                    continue
                key = f"{s_dist}_{s_name}".lower()
                is_inherited = False
                source_m = None
                if key in month_targets:
                    t_val = month_targets[key]["target"]
                elif key in historical_staff_targets:
                    t_val = historical_staff_targets[key]["target"]
                    is_inherited = True
                    source_m = historical_staff_targets[key]["source_month"]
                elif key in default_targets:
                    t_val = default_targets[key]["target"]
                else:
                    # Resilient alias lookup
                    t_val = None
                    for mt_key, mt_obj in month_targets.items():
                        if canonicalize_district(mt_obj.get("district", "")) == canonicalize_district(s_dist) and is_officer_name_match(mt_obj.get("fo_name"), s_name, s_dist):
                            t_val = mt_obj.get("target")
                            break
                    if t_val is None and historical_staff_targets:
                        for ht_key, ht_obj in historical_staff_targets.items():
                            if canonicalize_district(ht_obj.get("district", "")) == canonicalize_district(s_dist) and is_officer_name_match(ht_obj.get("fo_name"), s_name, s_dist):
                                t_val = ht_obj.get("target")
                                is_inherited = True
                                source_m = ht_obj.get("source_month")
                                break
                    if t_val is None:
                        for dt_key, dt_obj in default_targets.items():
                            if canonicalize_district(dt_obj.get("district", "")) == canonicalize_district(s_dist) and is_officer_name_match(dt_obj.get("fo_name"), s_name, s_dist):
                                t_val = dt_obj.get("target")
                                break
                    if t_val is None:
                        t_val = 50
                    
                target_entry = {
                    "fo_name": s_name,
                    "district": s_dist,
                    "target": t_val,
                    "month": month
                }
                if is_inherited:
                    target_entry["inherited_from"] = source_m
                targets.append(target_entry)
            
        targets.sort(key=lambda x: (x["district"], x["fo_name"]))
        res = {"success": True, "month": month, "targets": targets}

        # Dual-Target Resolution: Official Target vs. Frontline Operational Stretch
        if district and district != "All":
            clean_dist = canonicalize_district(district.strip())
            dt_doc_id = f"{month}_{clean_dist}".replace(" ", "").lower()
            dt_doc = await asyncio.to_thread(lambda: db.collection("district_targets").document(dt_doc_id).get())
            official_target = None
            inherited_from_month = None
            if dt_doc and getattr(dt_doc, "exists", False) is True:
                raw_val = dt_doc.to_dict().get("official_target") if hasattr(dt_doc, "to_dict") and callable(dt_doc.to_dict) and dt_doc.to_dict() else None
                if isinstance(raw_val, (int, float)) and raw_val > 0:
                    official_target = int(raw_val)

            # Fallback 1: Previous month (last month)
            if (official_target is None or official_target <= 0) and prev_month:
                prev_doc_id = f"{prev_month}_{clean_dist}".replace(" ", "").lower()
                prev_doc = await asyncio.to_thread(lambda: db.collection("district_targets").document(prev_doc_id).get())
                if prev_doc and getattr(prev_doc, "exists", False) is True:
                    raw_val = prev_doc.to_dict().get("official_target") if hasattr(prev_doc, "to_dict") and callable(prev_doc.to_dict) and prev_doc.to_dict() else None
                    if isinstance(raw_val, (int, float)) and raw_val > 0:
                        official_target = int(raw_val)
                        inherited_from_month = prev_month

            # Fallback 2: Generic fallback doc
            if official_target is None or official_target <= 0:
                fallback_doc_id = clean_dist.replace(" ", "").lower()
                fallback_doc = await asyncio.to_thread(lambda: db.collection("district_targets").document(fallback_doc_id).get())
                if fallback_doc and getattr(fallback_doc, "exists", False) is True:
                    raw_val = fallback_doc.to_dict().get("official_target") if hasattr(fallback_doc, "to_dict") and callable(fallback_doc.to_dict) and fallback_doc.to_dict() else None
                    if isinstance(raw_val, (int, float)) and raw_val > 0:
                        official_target = int(raw_val)
            
            staff_targets_sum = sum(t["target"] for t in targets)
            if official_target is None or official_target <= 0:
                official_target = staff_targets_sum
                
            buffer_count = max(0, staff_targets_sum - official_target)
            buffer_percent = round((buffer_count / max(1, official_target)) * 100, 1) if official_target > 0 else 0.0

            res["official_district_target"] = official_target
            res["staff_targets_sum"] = staff_targets_sum
            res["buffer_percent"] = buffer_percent
            res["buffer_count"] = buffer_count
            if inherited_from_month:
                res["inherited_from_month"] = inherited_from_month
        else:
            staff_targets_sum = sum(t["target"] for t in targets)
            dt_docs = await asyncio.to_thread(lambda: list(db.collection("district_targets").stream()))
            dist_map = {}
            historical_dist_map = {} # c_dist -> (month, tgt_val)
            default_dist_map = {}
            for d in dt_docs:
                dd = d.to_dict() if hasattr(d, "to_dict") and callable(d.to_dict) and d.to_dict() else {}
                d_m = dd.get("month")
                d_dist = dd.get("district")
                if not d_dist or not isinstance(d_dist, str):
                    continue
                c_dist = canonicalize_district(d_dist)
                raw_tgt = dd.get("official_target")
                tgt_val = int(raw_tgt) if isinstance(raw_tgt, (int, float)) else 0
                if tgt_val <= 0:
                    continue
                if d_m == month:
                    dist_map[c_dist] = tgt_val
                elif d_m and d_m < month:
                    if c_dist not in historical_dist_map or d_m > historical_dist_map[c_dist][0]:
                        historical_dist_map[c_dist] = (d_m, tgt_val)
                elif not d_m:
                    default_dist_map[c_dist] = tgt_val
            
            official_targets_by_dist = {}
            staff_sums_by_dist = {}
            for t in targets:
                c_d = canonicalize_district(t["district"])
                staff_sums_by_dist[c_d] = staff_sums_by_dist.get(c_d, 0) + t["target"]
            
            total_official = 0
            for c_d, s_sum in staff_sums_by_dist.items():
                off_t = dist_map.get(c_d)
                if off_t is None or off_t <= 0:
                    if c_d in historical_dist_map:
                        off_t = historical_dist_map[c_d][1]
                if off_t is None or off_t <= 0:
                    off_t = default_dist_map.get(c_d)
                if off_t is None or off_t <= 0:
                    off_t = s_sum
                official_targets_by_dist[c_d] = off_t
                total_official += off_t
            
            buffer_count = max(0, staff_targets_sum - total_official)
            buffer_percent = round((buffer_count / max(1, total_official)) * 100, 1) if total_official > 0 else 0.0
            
            res["official_district_target"] = total_official
            res["official_targets_by_district"] = official_targets_by_dist
            res["staff_targets_sum"] = staff_targets_sum
            res["buffer_percent"] = buffer_percent
            res["buffer_count"] = buffer_count

        cache.set(cache_key, res, ttl=1800) # 30 min cache
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/update-target")
async def update_target(data: TargetUpdate, admin: dict = Depends(get_current_admin)):
    try:
        month = data.month or datetime.now().strftime("%Y-%m")
        clean_dist = canonicalize_district(data.district.strip())
        if admin.get("role") == "SUB_ADMIN":
            allowed = admin.get("allowed_districts", [])
            if "All" not in allowed and clean_dist not in allowed:
                raise HTTPException(status_code=403, detail=f"Permission denied. You cannot update targets in district '{clean_dist}'.")
        clean_name = data.fo_name.strip()
        
        # 1. Month-scoped document
        month_doc_id = f"{month}_{clean_dist}_{clean_name}".replace(" ", "").lower()
        await asyncio.to_thread(lambda: db.collection("staff_targets").document(month_doc_id).set({
            "month": month,
            "district": clean_dist,
            "fo_name": clean_name,
            "target": int(data.target),
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }, merge=True))
        
        # 2. General fallback document
        fallback_doc_id = f"{clean_dist}_{clean_name}".replace(" ", "").lower()
        await asyncio.to_thread(lambda: db.collection("staff_targets").document(fallback_doc_id).set({
            "district": clean_dist,
            "fo_name": clean_name,
            "target": int(data.target),
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }, merge=True))
        
        # 3. Synchronize alias documents if applicable
        if clean_dist.lower() == "muzaffarpur" and clean_name.lower() in ("vinay prakash", "vinay kumar", "vinay kumar lt"):
            for alias in ("Vinay Prakash", "Vinay Kumar"):
                if alias.lower() != clean_name.lower():
                    a_mid = f"{month}_{clean_dist}_{alias}".replace(" ", "").lower()
                    a_fid = f"{clean_dist}_{alias}".replace(" ", "").lower()
                    await asyncio.to_thread(lambda: db.collection("staff_targets").document(a_mid).set({
                        "month": month,
                        "district": clean_dist,
                        "fo_name": alias,
                        "target": int(data.target),
                        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    }, merge=True))
                    await asyncio.to_thread(lambda: db.collection("staff_targets").document(a_fid).set({
                        "district": clean_dist,
                        "fo_name": alias,
                        "target": int(data.target),
                        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    }, merge=True))
        
        cache.delete_prefix("targets_")
        cache.delete_prefix("staff_targets_raw_")
        evict_officer_profile_cache(clean_dist, clean_name, month)
        cache.delete_prefix("statewide_top_")
        invalidate_staff_directory_cache()
        actor_name = admin.get("name") or admin.get("username", "Admin")
        actor_id = admin.get("user_id") or admin.get("username", "admin")
        actor_role = admin.get("role", "SUB_ADMIN")
        await log_admin_activity(
            action_type="TARGET_UPDATED",
            details=f"Updated target for {clean_name} ({clean_dist}) to {data.target} for month {month}",
            user_name=actor_name,
            user_id=actor_id,
            role=actor_role,
            district=clean_dist,
            target_officer=clean_name,
            diff={"month": month, "target": int(data.target)}
        )
        return {"success": True, "month": month, "message": f"Target for {month} successfully updated!"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/update-district-target")
async def update_district_target(data: DistrictTargetUpdate, admin: dict = Depends(get_current_admin)):
    try:
        month = data.month or datetime.now().strftime("%Y-%m")
        clean_dist = canonicalize_district(data.district.strip())
        if admin.get("role") == "SUB_ADMIN":
            allowed = admin.get("allowed_districts", [])
            if "All" not in allowed and clean_dist not in allowed:
                raise HTTPException(status_code=403, detail=f"Permission denied. Cross-district target modification forbidden for '{clean_dist}'.")
        
        target_val = int(data.official_target)
        if target_val < 0:
            raise HTTPException(status_code=400, detail="Official target cannot be negative.")

        actor_name = admin.get("name") or admin.get("username", "Admin")
        actor_id = admin.get("user_id") or admin.get("username", "admin")
        actor_role = admin.get("role", "SUB_ADMIN")
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # 1. Month-scoped document: {month}_{clean_dist}
        month_doc_id = f"{month}_{clean_dist}".replace(" ", "").lower()
        await asyncio.to_thread(lambda: db.collection("district_targets").document(month_doc_id).set({
            "month": month,
            "district": clean_dist,
            "official_target": target_val,
            "updated_at": now_str,
            "updated_by": actor_name,
            "updated_by_role": actor_role
        }, merge=True))

        # 2. General fallback document: {clean_dist}
        fallback_doc_id = clean_dist.replace(" ", "").lower()
        await asyncio.to_thread(lambda: db.collection("district_targets").document(fallback_doc_id).set({
            "district": clean_dist,
            "official_target": target_val,
            "updated_at": now_str,
            "updated_by": actor_name,
            "updated_by_role": actor_role
        }, merge=True))

        cache.delete_prefix("targets_")
        cache.delete_prefix(f"district_targets_{month}_{clean_dist}".lower())
        cache.delete_prefix(f"pacing_settings_{month}")
        cache.delete_prefix("statewide_top_")

        await log_admin_activity(
            action_type="DISTRICT_TARGET_UPDATED",
            details=f"Updated official district target for {clean_dist} to {target_val} for month {month}",
            user_name=actor_name,
            user_id=actor_id,
            role=actor_role,
            district=clean_dist,
            diff={"month": month, "official_target": target_val}
        )
        return {
            "success": True, 
            "month": month, 
            "district": clean_dist, 
            "official_target": target_val, 
            "message": f"Official target for {clean_dist} ({month}) updated to {target_val}!"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/update-district-targets-bulk")
async def update_district_targets_bulk(data: BulkDistrictTargetUpdate, admin: dict = Depends(get_current_admin)):
    try:
        month = data.month or datetime.now().strftime("%Y-%m")
        actor_name = admin.get("name") or admin.get("username", "Admin")
        actor_id = admin.get("user_id") or admin.get("username", "admin")
        actor_role = admin.get("role", "SUB_ADMIN")
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        allowed = None
        if admin.get("role") == "SUB_ADMIN":
            allowed = admin.get("allowed_districts", [])

        valid_items = []
        for item in data.targets:
            clean_dist = canonicalize_district(item.district.strip())
            if allowed is not None and "All" not in allowed and clean_dist not in allowed:
                raise HTTPException(status_code=403, detail=f"Permission denied. Cross-district target modification forbidden for '{clean_dist}'.")
            target_val = int(item.official_target)
            if target_val < 0:
                raise HTTPException(status_code=400, detail=f"Official target for '{clean_dist}' cannot be negative.")
            valid_items.append((clean_dist, target_val))

        def _batch_district_write():
            try:
                batch = db.batch()
                for cd, tv in valid_items:
                    m_id = f"{month}_{cd}".replace(" ", "").lower()
                    f_id = cd.replace(" ", "").lower()
                    batch.set(db.collection("district_targets").document(m_id), {
                        "month": month,
                        "district": cd,
                        "official_target": tv,
                        "updated_at": now_str,
                        "updated_by": actor_name,
                        "updated_by_role": actor_role
                    }, merge=True)
                    batch.set(db.collection("district_targets").document(f_id), {
                        "district": cd,
                        "official_target": tv,
                        "updated_at": now_str,
                        "updated_by": actor_name,
                        "updated_by_role": actor_role
                    }, merge=True)
                batch.commit()
            except Exception:
                for cd, tv in valid_items:
                    m_id = f"{month}_{cd}".replace(" ", "").lower()
                    f_id = cd.replace(" ", "").lower()
                    db.collection("district_targets").document(m_id).set({
                        "month": month,
                        "district": cd,
                        "official_target": tv,
                        "updated_at": now_str,
                        "updated_by": actor_name,
                        "updated_by_role": actor_role
                    }, merge=True)
                    db.collection("district_targets").document(f_id).set({
                        "district": cd,
                        "official_target": tv,
                        "updated_at": now_str,
                        "updated_by": actor_name,
                        "updated_by_role": actor_role
                    }, merge=True)

        if valid_items:
            await asyncio.to_thread(_batch_district_write)

        updated_districts = [cd for cd, _ in valid_items]

        cache.delete_prefix("targets_")
        cache.delete_prefix(f"district_targets_{month}".lower())
        cache.delete_prefix(f"pacing_settings_{month}")
        cache.delete_prefix("statewide_top_")

        await log_admin_activity(
            action_type="DISTRICT_TARGETS_BULK_UPDATED",
            details=f"Bulk updated official district targets for {len(updated_districts)} districts for month {month}",
            user_name=actor_name,
            user_id=actor_id,
            role=actor_role,
            diff={"month": month, "districts": updated_districts}
        )
        return {
            "success": True, 
            "month": month, 
            "count": len(updated_districts),
            "updated_districts": updated_districts,
            "message": f"Successfully updated official targets for {len(updated_districts)} districts!"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/update-targets-bulk")
async def update_targets_bulk(data: BulkStaffTargetUpdate, admin: dict = Depends(get_current_admin)):
    try:
        month = data.month or datetime.now().strftime("%Y-%m")
        actor_name = admin.get("name") or admin.get("username", "Admin")
        actor_id = admin.get("user_id") or admin.get("username", "admin")
        actor_role = admin.get("role", "SUB_ADMIN")
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        allowed = None
        if admin.get("role") == "SUB_ADMIN":
            allowed = admin.get("allowed_districts", [])

        valid_items = []
        for t in data.targets:
            if not t.fo_name or not t.district:
                continue
            clean_dist = canonicalize_district(t.district.strip())
            if allowed is not None and "All" not in allowed and clean_dist not in allowed:
                continue
            t_val = int(t.target)
            if t_val < 0:
                raise HTTPException(status_code=400, detail=f"Target for {t.fo_name} cannot be negative.")
            valid_items.append((clean_dist, t.fo_name.strip(), t_val))

        def _batch_staff_write():
            try:
                for i in range(0, len(valid_items), 200):
                    chunk = valid_items[i:i + 200]
                    batch = db.batch()
                    for c_dist, c_name, val in chunk:
                        m_id = f"{month}_{c_dist}_{c_name}".replace(" ", "").lower()
                        f_id = f"{c_dist}_{c_name}".replace(" ", "").lower()
                        batch.set(db.collection("staff_targets").document(m_id), {
                            "month": month,
                            "district": c_dist,
                            "fo_name": c_name,
                            "target": val,
                            "updated_at": now_str
                        }, merge=True)
                        batch.set(db.collection("staff_targets").document(f_id), {
                            "district": c_dist,
                            "fo_name": c_name,
                            "target": val,
                            "updated_at": now_str
                        }, merge=True)
                        if c_dist.lower() == "muzaffarpur" and c_name.lower() in ("vinay prakash", "vinay kumar", "vinay kumar lt"):
                            for alias in ("Vinay Prakash", "Vinay Kumar"):
                                if alias.lower() != c_name.lower():
                                    a_mid = f"{month}_{c_dist}_{alias}".replace(" ", "").lower()
                                    a_fid = f"{c_dist}_{alias}".replace(" ", "").lower()
                                    batch.set(db.collection("staff_targets").document(a_mid), {
                                        "month": month, "district": c_dist, "fo_name": alias, "target": val, "updated_at": now_str
                                    }, merge=True)
                                    batch.set(db.collection("staff_targets").document(a_fid), {
                                        "district": c_dist, "fo_name": alias, "target": val, "updated_at": now_str
                                    }, merge=True)
                    batch.commit()
            except Exception:
                for c_dist, c_name, val in valid_items:
                    m_id = f"{month}_{c_dist}_{c_name}".replace(" ", "").lower()
                    f_id = f"{c_dist}_{c_name}".replace(" ", "").lower()
                    db.collection("staff_targets").document(m_id).set({
                        "month": month,
                        "district": c_dist,
                        "fo_name": c_name,
                        "target": val,
                        "updated_at": now_str
                    }, merge=True)
                    db.collection("staff_targets").document(f_id).set({
                        "district": c_dist,
                        "fo_name": c_name,
                        "target": val,
                        "updated_at": now_str
                    }, merge=True)
                    if c_dist.lower() == "muzaffarpur" and c_name.lower() in ("vinay prakash", "vinay kumar", "vinay kumar lt"):
                        for alias in ("Vinay Prakash", "Vinay Kumar"):
                            if alias.lower() != c_name.lower():
                                a_mid = f"{month}_{c_dist}_{alias}".replace(" ", "").lower()
                                a_fid = f"{c_dist}_{alias}".replace(" ", "").lower()
                                db.collection("staff_targets").document(a_mid).set({
                                    "month": month, "district": c_dist, "fo_name": alias, "target": val, "updated_at": now_str
                                }, merge=True)
                                db.collection("staff_targets").document(a_fid).set({
                                    "district": c_dist, "fo_name": alias, "target": val, "updated_at": now_str
                                }, merge=True)

        if valid_items:
            await asyncio.to_thread(_batch_staff_write)

        cache.delete_prefix("targets_")
        cache.delete_prefix("staff_targets_raw_")
        cache.delete_prefix("statewide_top_")
        cache.delete_prefix("profile_")
        invalidate_staff_directory_cache()

        await log_admin_activity(
            action_type="TARGETS_BULK_UPDATED",
            details=f"Bulk updated frontline targets for {len(valid_items)} staff across Bihar for month {month}",
            user_name=actor_name,
            user_id=actor_id,
            role=actor_role,
            diff={"month": month, "updated_count": len(valid_items)}
        )
        return {
            "success": True, 
            "month": month, 
            "count": len(valid_items),
            "message": f"Successfully updated targets for {len(valid_items)} staff members!"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
