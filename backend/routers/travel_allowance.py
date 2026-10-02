"""
Modular Travel Allowance (TA) & Bike Log Subsystem Router
Bihar Field Operations & State Health Monitoring - Doctors For You (DFY)
"""
import calendar
import re
from datetime import datetime
from typing import Optional, List, Dict, Any, Union

from fastapi import APIRouter, HTTPException, Depends, Header, Query
from pydantic import BaseModel, Field

from backend.core.database import db
from backend.core.cache import cache
from backend.core import security
from backend.core.security import get_current_admin
from backend.core.helpers import (
    canonicalize_district,
    is_officer_name_match,
    get_ist_now
)
from backend.core.master_ledger import (
    get_cached_staff_directory_raw,
    get_directory
)

router = APIRouter(tags=["Travel Allowance"])


def get_current_user(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
) -> dict:
    """Dependency that delegates to backend.core.security.get_current_user."""
    return security.get_current_user(authorization=authorization, token=token)


def normalize_staff_slug(name: str) -> str:
    """Creates a URL/ID safe slug for staff names."""
    if not name:
        return ""
    return re.sub(r'[^a-z0-9]+', '_', name.strip().lower()).strip('_')


def check_district_access(admin: dict, district: str) -> str:
    """
    Validates Sub-Admin access to a specific district.
    Super Admins, Admins, and Main Incharges have statewide access.
    Returns canonical district name.
    """
    canon_dist = canonicalize_district(district)
    role = admin.get("role", "")
    if role in ("SUPER_ADMIN", "MAIN_INCHARGE", "ADMIN"):
        return canon_dist

    allowed = admin.get("allowed_districts", [])
    if "All" in allowed:
        return canon_dist

    canon_allowed = [canonicalize_district(d) for d in allowed]
    if canon_dist not in canon_allowed:
        raise HTTPException(
            status_code=403,
            detail="Access denied: You do not have permission for this district."
        )
    return canon_dist


# --- Pydantic Request/Response Models ---

class TaRateUpdateReq(BaseModel):
    rate_per_km: float


class TaDayReading(BaseModel):
    day: int
    date: str
    morning_km: float = 0.0
    evening_km: float = 0.0
    total_km: float = 0.0
    visited_names: str = ""
    purpose: str = ""
    is_manual_override: bool = False
    admin_remarks: str = ""


class TaLogSaveReq(BaseModel):
    month: str
    district: str
    staff_name: str
    staff_key: Optional[str] = ""
    designation: Optional[str] = "Field Officer"
    deduction_amount: Optional[float] = 0.0
    deduction_reason: Optional[str] = ""
    admin_remarks: Optional[str] = ""
    days: List[Dict[str, Any]] = []


class TaPrefillReq(BaseModel):
    month: str
    district: str
    staff_name: Optional[str] = None


class TaStaffActionReq(BaseModel):
    staff_key: str
    action: Optional[str] = None
    revert_reason: Optional[str] = None


# --- Financial Calculation Helper ---

def calculate_log_totals(
    days: list,
    rate_per_km: float = 4.0,
    deduction_amount: float = 0.0
) -> dict:
    """
    Computes total distance, gross allowance, deduction, and final payable amount.
    Guarantees payable amount never drops below 0.0.
    """
    total_km = 0.0
    for d in days:
        if isinstance(d, dict):
            t = d.get("total_km")
            if t is not None:
                try:
                    total_km += float(t)
                except (ValueError, TypeError):
                    pass
            else:
                m = float(d.get("morning_km") or 0.0)
                e = float(d.get("evening_km") or 0.0)
                total_km += max(0.0, e - m)
        elif hasattr(d, "total_km") and getattr(d, "total_km") is not None:
            try:
                total_km += float(getattr(d, "total_km"))
            except (ValueError, TypeError):
                pass
        else:
            m = float(getattr(d, "morning_km", 0.0) or 0.0)
            e = float(getattr(d, "evening_km", 0.0) or 0.0)
            total_km += max(0.0, e - m)

    total_km = round(total_km, 2)
    rate = float(rate_per_km if rate_per_km is not None else 4.0)
    ded = float(deduction_amount if deduction_amount is not None else 0.0)
    gross_amount = round(total_km * rate, 2)
    final_payable_amount = round(max(0.0, gross_amount - ded), 2)

    return {
        "total_km": total_km,
        "gross_amount": gross_amount,
        "deduction_amount": ded,
        "final_payable_amount": final_payable_amount
    }


def get_current_ta_rate_value() -> float:
    """Reads current dynamic rate per KM, with fallback 4.0."""
    cached = cache.get("ta_global_rate")
    if cached is not None and isinstance(cached, dict) and "rate_per_km" in cached:
        return float(cached["rate_per_km"])

    try:
        doc = db.collection("app_settings").document("travel_allowance").get()
        if doc.exists:
            data = doc.to_dict() or {}
            rate = float(data.get("rate_per_km", 4.0))
            cache.set("ta_global_rate", data, ttl=300)
            return rate
    except Exception as e:
        print(f"Error fetching TA global rate from db: {e}")

    return 4.0


# --- Endpoints ---

@router.get("/admin/ta/rate")
def get_travel_allowance_rate(current_user: dict = Depends(get_current_user)):
    """
    Returns global Travel Allowance settings including dynamic rate per KM.
    Cached for 300 seconds.
    """
    cached = cache.get("ta_global_rate")
    if cached is not None and isinstance(cached, dict):
        return cached

    default_settings = {
        "rate_per_km": 4.0,
        "default_max_daily_km": 120,
        "dispute_window_hours": 24,
        "last_updated_at": None,
        "updated_by": "System Default"
    }

    try:
        doc = db.collection("app_settings").document("travel_allowance").get()
        if doc.exists:
            data = doc.to_dict() or {}
            merged = {**default_settings, **data}
            merged["rate_per_km"] = float(merged.get("rate_per_km", 4.0))
            cache.set("ta_global_rate", merged, ttl=300)
            return merged
    except Exception as e:
        print(f"Error reading TA rate settings: {e}")

    return default_settings


@router.post("/admin/ta/rate")
def update_travel_allowance_rate(
    req: TaRateUpdateReq,
    current_user: dict = Depends(get_current_user)
):
    """
    Updates the global rate per KM.
    Restricted to SUPER_ADMIN and MAIN_INCHARGE roles.
    """
    role = current_user.get("role", "")
    if role not in ("SUPER_ADMIN", "MAIN_INCHARGE", "ADMIN"):
        raise HTTPException(
            status_code=403,
            detail="Access denied. Super Admin or Main Incharge authority required."
        )

    if req.rate_per_km <= 0:
        raise HTTPException(
            status_code=400,
            detail="Rate per KM must be greater than 0."
        )

    now_str = datetime.utcnow().isoformat()
    actor_name = current_user.get("name") or current_user.get("username") or "Admin"

    settings_data = {
        "rate_per_km": round(float(req.rate_per_km), 2),
        "default_max_daily_km": 120,
        "dispute_window_hours": 24,
        "last_updated_at": now_str,
        "updated_by": actor_name
    }

    try:
        db.collection("app_settings").document("travel_allowance").set(settings_data, merge=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to persist TA rate: {str(e)}")

    cache.delete("ta_global_rate")
    return {
        "status": "success",
        "message": f"Global TA rate updated to ₹{req.rate_per_km:.2f}/KM",
        "rate_per_km": req.rate_per_km,
        "updated_at": now_str
    }


@router.get("/admin/ta/roster")
async def get_district_ta_roster(
    month: str = Query(..., description="Target month in YYYY-MM format"),
    district: str = Query(..., description="Target district name"),
    force_refresh: Optional[bool] = Query(False),
    current_user: dict = Depends(get_current_user)
):
    """
    Retrieves monthly TA roster for all staff in a district.
    Validates Sub-Admin district scope and aggregates district-level KPIs.
    """
    canon_dist = check_district_access(current_user, district)
    cache_key = f"ta_roster_{month}_{canon_dist.lower()}"

    if not force_refresh:
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

    current_rate = get_current_ta_rate_value()

    # 1. Fetch active staff for this district
    district_staff = []
    try:
        staff_records = await get_cached_staff_directory_raw()
        for s in staff_records:
            if not isinstance(s, dict):
                continue
            if s.get("is_active") is False or s.get("status") == "inactive":
                continue
            s_dist = canonicalize_district(s.get("district") or "")
            if s_dist == canon_dist and s.get("name"):
                district_staff.append({
                    "name": s.get("name").strip(),
                    "designation": s.get("designation") or "Field Officer",
                    "key": normalize_staff_slug(s.get("name"))
                })
    except Exception as e:
        print(f"Error fetching staff directory for TA roster: {e}")

    # Fallback to directory dict if raw list was empty
    if not district_staff:
        try:
            dir_dict = await get_directory()
            names = dir_dict.get(canon_dist, [])
            for n in names:
                district_staff.append({
                    "name": str(n).strip(),
                    "designation": "Field Officer",
                    "key": normalize_staff_slug(str(n))
                })
        except Exception:
            pass

    # 2. Query saved travel allowance logs for month and district
    saved_logs = {}
    try:
        docs = db.collection("travel_allowance_logs")\
            .where("month", "==", month)\
            .where("district", "==", canon_dist)\
            .stream()
        for doc in docs:
            d = doc.to_dict()
            s_key = d.get("staff_key") or normalize_staff_slug(d.get("staff_name") or "")
            if s_key:
                saved_logs[s_key] = d
    except Exception as e:
        print(f"Error querying travel_allowance_logs: {e}")

    # 3. Build enriched roster
    roster = []
    seen_keys = set()

    for s in district_staff:
        s_key = s["key"]
        seen_keys.add(s_key)
        existing = saved_logs.get(s_key)

        if existing:
            roster.append(existing)
        else:
            # Generate default draft skeleton
            doc_id = f"{month}_{canon_dist.lower()}_{s_key}"
            skeleton = {
                "doc_id": doc_id,
                "month": month,
                "district": canon_dist,
                "staff_name": s["name"],
                "staff_key": s_key,
                "designation": s["designation"],
                "rate_per_km": current_rate,
                "total_km": 0.0,
                "gross_amount": 0.0,
                "deduction_amount": 0.0,
                "deduction_reason": "",
                "final_payable_amount": 0.0,
                "admin_remarks": "",
                "status": "DRAFT",
                "is_locked": False,
                "days": [],
                "created_at": None,
                "updated_at": None
            }
            roster.append(skeleton)

    # Also include any saved logs for staff not currently in active directory
    for s_key, log in saved_logs.items():
        if s_key not in seen_keys:
            roster.append(log)

    # 4. District KPI Aggregations
    total_km = sum(float(r.get("total_km") or 0.0) for r in roster)
    gross_amount = sum(float(r.get("gross_amount") or 0.0) for r in roster)
    deduction_amount = sum(float(r.get("deduction_amount") or 0.0) for r in roster)
    final_payable_amount = sum(float(r.get("final_payable_amount") or 0.0) for r in roster)

    approved_count = sum(1 for r in roster if r.get("status") == "APPROVED")
    reverted_count = sum(1 for r in roster if r.get("status") == "REVERTED")
    submitted_count = sum(1 for r in roster if r.get("status") == "SUBMITTED")
    draft_count = sum(1 for r in roster if r.get("status") in ("DRAFT", None, ""))

    result = {
        "status": "success",
        "month": month,
        "district": canon_dist,
        "rate_per_km": current_rate,
        "kpis": {
            "total_km": round(total_km, 2),
            "gross_amount": round(gross_amount, 2),
            "deduction_amount": round(deduction_amount, 2),
            "final_payable_amount": round(final_payable_amount, 2),
            "total_staff": len(roster),
            "approved_count": approved_count,
            "reverted_count": reverted_count,
            "submitted_count": submitted_count,
            "draft_count": draft_count
        },
        "roster": roster
    }

    cache.set(cache_key, result, ttl=120)
    return result


@router.post("/admin/ta/prefill")
def prefill_district_ta_from_reports(
    req: TaPrefillReq,
    current_user: dict = Depends(get_current_user)
):
    """
    Pre-populates meter readings and visited locations from daily_field_reports.
    Preserves manual overrides and deductions if an existing log exists.
    """
    canon_dist = check_district_access(current_user, req.district)
    current_rate = get_current_ta_rate_value()

    # Determine days in the target month
    try:
        year_str, month_str = req.month.split("-")
        year = int(year_str)
        month_num = int(month_str)
        _, num_days = calendar.monthrange(year, month_num)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid month format. Expected YYYY-MM.")

    staff_name = req.staff_name.strip() if req.staff_name else ""
    staff_key = normalize_staff_slug(staff_name) if staff_name else ""
    doc_id = f"{req.month}_{canon_dist.lower()}_{staff_key}"

    # Read existing doc to preserve manual overrides or deductions
    existing_days_map = {}
    existing_deduction = 0.0
    existing_deduction_reason = ""
    existing_admin_remarks = ""
    try:
        existing_doc = db.collection("travel_allowance_logs").document(doc_id).get()
        if existing_doc.exists:
            ex_data = existing_doc.to_dict() or {}
            existing_deduction = float(ex_data.get("deduction_amount") or 0.0)
            existing_deduction_reason = ex_data.get("deduction_reason") or ""
            existing_admin_remarks = ex_data.get("admin_remarks") or ""
            for d in ex_data.get("days", []):
                day_num = d.get("day")
                if day_num:
                    existing_days_map[int(day_num)] = d
    except Exception as e:
        print(f"Notice reading existing TA log during prefill: {e}")

    # Query daily_field_reports
    start_date = f"{req.month}-01"
    end_date = f"{req.month}-{num_days:02d}"

    reports_by_day = {}
    try:
        q = db.collection("daily_field_reports")\
            .where("working_place", "==", canon_dist)\
            .where("date_of_reporting", ">=", start_date)\
            .stream()

        for doc in q:
            r = doc.to_dict()
            r_fo = str(r.get("fo_name") or "").strip()
            if staff_name and not is_officer_name_match(r_fo, staff_name, canon_dist):
                continue

            r_date = str(r.get("date_of_reporting") or "").strip()[:10]
            if r_date.startswith(req.month):
                try:
                    d_num = int(r_date.split("-")[2])
                    reports_by_day[d_num] = r
                except Exception:
                    pass
    except Exception as e:
        print(f"Error querying daily_field_reports during prefill: {e}")

    # Build 31-day array
    days = []
    for day in range(1, num_days + 1):
        date_str = f"{year:04d}-{month_num:02d}-{day:02d}"
        ex_day = existing_days_map.get(day)

        if ex_day and ex_day.get("is_manual_override"):
            days.append(ex_day)
        else:
            rep = reports_by_day.get(day)
            if rep:
                m_km = float(rep.get("morning_km") or 0.0)
                e_km = float(rep.get("evening_km") or 0.0)
                t_km = max(0.0, e_km - m_km)
                visited = rep.get("visited_names", "")
                if isinstance(visited, list):
                    visited = ", ".join(str(v) for v in visited if v)
                purpose = str(rep.get("purpose") or rep.get("remark") or "")

                days.append({
                    "day": day,
                    "date": date_str,
                    "morning_km": m_km,
                    "evening_km": e_km,
                    "total_km": t_km,
                    "visited_names": visited,
                    "purpose": purpose,
                    "is_manual_override": False,
                    "admin_remarks": ex_day.get("admin_remarks", "") if ex_day else ""
                })
            else:
                days.append({
                    "day": day,
                    "date": date_str,
                    "morning_km": 0.0,
                    "evening_km": 0.0,
                    "total_km": 0.0,
                    "visited_names": "",
                    "purpose": "",
                    "is_manual_override": False,
                    "admin_remarks": ex_day.get("admin_remarks", "") if ex_day else ""
                })

    totals = calculate_log_totals(days, rate_per_km=current_rate, deduction_amount=existing_deduction)

    result_data = {
        "doc_id": doc_id,
        "month": req.month,
        "district": canon_dist,
        "staff_name": staff_name,
        "staff_key": staff_key,
        "rate_per_km": current_rate,
        "total_km": totals["total_km"],
        "gross_amount": totals["gross_amount"],
        "deduction_amount": totals["deduction_amount"],
        "deduction_reason": existing_deduction_reason,
        "final_payable_amount": totals["final_payable_amount"],
        "admin_remarks": existing_admin_remarks,
        "days": days
    }

    return {
        "status": "success",
        "message": f"Pre-filled {len(days)} days from daily field reports.",
        "data": result_data
    }


@router.post("/admin/ta/save-log")
def save_travel_allowance_log(
    req: TaLogSaveReq,
    current_user: dict = Depends(get_current_user)
):
    """
    Saves meter readings, remarks, and deductions for an officer's monthly log.
    Re-calculates totals and enforces record locking guard.
    """
    canon_dist = check_district_access(current_user, req.district)
    staff_key = req.staff_key or normalize_staff_slug(req.staff_name)
    if not staff_key:
        raise HTTPException(status_code=400, detail="Staff name or key is required.")

    doc_id = f"{req.month}_{canon_dist.lower()}_{staff_key}"
    doc_ref = db.collection("travel_allowance_logs").document(doc_id)

    # Enforce locking check
    existing_status = "DRAFT"
    try:
        existing_doc = doc_ref.get()
        if existing_doc.exists:
            ex_data = existing_doc.to_dict() or {}
            existing_status = ex_data.get("status", "DRAFT")
            if ex_data.get("is_locked") is True and current_user.get("role") != "SUPER_ADMIN":
                raise HTTPException(
                    status_code=423,
                    detail="Record is locked and cannot be edited. Request Main Incharge to unlock."
                )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error checking locked state: {e}")

    current_rate = get_current_ta_rate_value()
    totals = calculate_log_totals(
        req.days,
        rate_per_km=current_rate,
        deduction_amount=req.deduction_amount or 0.0
    )

    now_str = datetime.utcnow().isoformat()
    actor_name = current_user.get("name") or current_user.get("username") or "Admin"

    doc_data = {
        "doc_id": doc_id,
        "month": req.month,
        "district": canon_dist,
        "staff_name": req.staff_name.strip(),
        "staff_key": staff_key,
        "designation": req.designation or "Field Officer",
        "rate_per_km": current_rate,
        "total_km": totals["total_km"],
        "gross_amount": totals["gross_amount"],
        "deduction_amount": totals["deduction_amount"],
        "deduction_reason": req.deduction_reason or "",
        "final_payable_amount": totals["final_payable_amount"],
        "admin_remarks": req.admin_remarks or "",
        "status": existing_status,
        "is_locked": False if existing_status != "APPROVED" else True,
        "days": req.days,
        "updated_at": now_str,
        "updated_by": actor_name
    }

    try:
        doc_ref.set(doc_data, merge=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save TA log: {str(e)}")

    # Evict cached roster
    cache.delete(f"ta_roster_{req.month}_{req.district.lower()}")
    cache.delete(f"ta_roster_{req.month}_{canon_dist.lower()}")

    return {
        "status": "success",
        "message": "Travel allowance log saved successfully.",
        "data": doc_data
    }
