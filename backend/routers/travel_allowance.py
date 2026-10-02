"""
Modular Travel Allowance (TA) & Bike Log Subsystem Router
Bihar Field Operations & State Health Monitoring - Doctors For You (DFY)
"""
import calendar
import gc
import io
import re
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Union

from fastapi import APIRouter, HTTPException, Depends, Header, Query
from pydantic import BaseModel, Field

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from backend.core.styles import (
    EXCEL_HEADER_BORDER,
    EXCEL_THIN_BORDER,
    EXCEL_TOTAL_ROW_BORDER,
    safe_filename,
    ExcelStreamingResponse
)

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


class TaSubmitRosterReq(BaseModel):
    month: str
    district: str
    staff_keys: Optional[List[str]] = None


class TaPassStaffReq(BaseModel):
    month: str
    district: str
    staff_key: str
    staff_keys: Optional[List[str]] = None


class TaRevertStaffReq(BaseModel):
    month: str
    district: str
    staff_key: str
    revert_reason: str


class TaUnlockStaffReq(BaseModel):
    month: str
    district: str
    staff_key: str


class TaDisputeReq(BaseModel):
    month: str
    district: str
    fo_name: str
    dispute_reason: str


class TaResolveDisputeReq(BaseModel):
    month: str
    district: str
    staff_key: str
    action: str
    resolution_remarks: Optional[str] = ""


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
    try:
        ded = max(0.0, float(deduction_amount if deduction_amount is not None else 0.0))
    except (ValueError, TypeError):
        ded = 0.0
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


# --- Workflow Helper Functions ---

def apply_staff_status_transition(
    record: dict,
    action: str,
    actor_role: str,
    actor_name: str,
    reason: str = ""
) -> dict:
    """
    Applies state machine transitions for individual staff TA records:
    - PASS: SUBMITTED -> APPROVED, is_locked = True
    - REVERT: [SUBMITTED, APPROVED] -> REVERTED, is_locked = False
    - UNLOCK: Any -> REVERTED, is_locked = False
    - SUBMIT: [DRAFT, REVERTED] -> SUBMITTED
    """
    iso_now = datetime.utcnow().isoformat()
    rec = dict(record)
    act = (action or "").strip().upper()
    current_status = rec.get("status") or "DRAFT"

    if act == "PASS":
        if current_status != "SUBMITTED":
            raise HTTPException(
                status_code=400,
                detail=f"Cannot pass record in '{current_status}' status. Record must be SUBMITTED."
            )
        if actor_role not in ("MAIN_INCHARGE", "SUPER_ADMIN", "ADMIN"):
            raise HTTPException(
                status_code=403,
                detail="Only Incharge or Super Admin can pass staff records."
            )
        rec["status"] = "APPROVED"
        rec["is_locked"] = True
        rec["approved_at"] = iso_now
        rec["approved_by"] = actor_name
        return rec

    elif act == "REVERT":
        if current_status not in ("SUBMITTED", "APPROVED"):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot revert record in '{current_status}' status. Record must be SUBMITTED or APPROVED."
            )
        if actor_role not in ("MAIN_INCHARGE", "SUPER_ADMIN", "ADMIN"):
            raise HTTPException(
                status_code=403,
                detail="Only Incharge or Super Admin can revert staff records."
            )
        rec["status"] = "REVERTED"
        rec["is_locked"] = False
        rec["reverted_at"] = iso_now
        rec["reverted_by"] = actor_name
        rec["revert_reason"] = reason or ""
        return rec

    elif act == "UNLOCK":
        if actor_role not in ("MAIN_INCHARGE", "SUPER_ADMIN", "ADMIN"):
            raise HTTPException(
                status_code=403,
                detail="Only Incharge or Super Admin can unlock staff records."
            )
        rec["is_locked"] = False
        rec["status"] = "REVERTED"
        rec["unlocked_at"] = iso_now
        rec["unlocked_by"] = actor_name
        return rec

    elif act == "SUBMIT":
        if current_status not in ("DRAFT", "REVERTED", None, ""):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot submit record in '{current_status}' status. Only DRAFT or REVERTED records can be submitted."
            )
        if actor_role not in ("SUB_ADMIN", "SUPER_ADMIN", "ADMIN"):
            raise HTTPException(
                status_code=403,
                detail="Only Sub-Admin or Super Admin can submit staff records."
            )
        rec["status"] = "SUBMITTED"
        rec["submitted_at"] = iso_now
        rec["submitted_by"] = actor_name
        return rec

    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown transition action '{action}'."
        )


def validate_edit_permission(record: dict, user_role: str) -> tuple[bool, str]:
    """
    Enforces RBAC and record lock constraints for editing TA readings:
    - Super Admin: global override allowed.
    - Locked record: cannot be edited unless unlocked.
    - Main Incharge: read-only inspection.
    - Sub-Admin: cannot edit if record is in SUBMITTED or APPROVED state.
    """
    if user_role == "SUPER_ADMIN":
        return True, ""

    if bool(record.get("is_locked", False)):
        return False, "Record is locked by Incharge after approval. Request Incharge to unlock."

    if user_role == "MAIN_INCHARGE":
        return False, "Incharge role is read-only for inspection and approval. Edits must be made by Sub-Admin."

    status = record.get("status", "DRAFT")
    if user_role == "SUB_ADMIN" and status in ("APPROVED", "SUBMITTED"):
        return False, f"Cannot edit record in {status} state."

    return True, ""


def is_dispute_window_open(approved_at: Optional[str], now_dt: Optional[datetime] = None) -> bool:
    """
    Checks if an approved record is within the 24-hour dispute window.
    """
    if not approved_at or not str(approved_at).strip():
        return False

    try:
        clean_str = str(approved_at).strip()
        if clean_str.endswith("Z"):
            clean_str = clean_str[:-1]
        approved_dt = datetime.fromisoformat(clean_str)

        if now_dt is None:
            now_dt = datetime.utcnow()

        if approved_dt.tzinfo is not None and now_dt.tzinfo is None:
            approved_dt = approved_dt.replace(tzinfo=None)
        elif approved_dt.tzinfo is None and now_dt.tzinfo is not None:
            now_dt = now_dt.replace(tzinfo=None)

        deadline = approved_dt + timedelta(hours=24)
        return now_dt <= deadline
    except Exception as e:
        print(f"Error parsing approved_at datetime '{approved_at}': {e}")
        return False


def build_ta_excel_workbook(district_data: dict) -> bytes:
    """
    Generates a multi-sheet openpyxl Excel workbook:
    - Sheet 1: DASHBOARD - Master district payroll summary with =SUM(...) formulas.
    - Sheets 2..N: Individual formatted 31-day bike log registers per staff member.
    """
    wb = openpyxl.Workbook()
    district = district_data.get("district", "Unknown")
    month = district_data.get("month", "")
    rate_per_km = float(district_data.get("rate_per_km", 4.0))
    roster = district_data.get("roster", [])

    # 1. Master DASHBOARD Sheet
    ws_dash = wb.active
    ws_dash.title = "DASHBOARD"

    # Title Banner
    ws_dash.merge_cells("A1:I1")
    title_cell = ws_dash.cell(row=1, column=1, value="BIHAR TB ELIMINATION MISSION - TRAVEL ALLOWANCE & BIKE LOG SUMMARY")
    title_cell.font = Font(name="Calibri", size=14, bold=True, color="FFFFFF")
    title_cell.fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    title_cell.alignment = Alignment(horizontal="center", vertical="center")
    ws_dash.row_dimensions[1].height = 30

    # Subtitle Info
    ws_dash.merge_cells("A2:I2")
    sub_cell = ws_dash.cell(
        row=2, column=1,
        value=f"District: {district}  |  Month: {month}  |  Rate: ₹{rate_per_km:.2f}/KM  |  Generated on: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}"
    )
    sub_cell.font = Font(name="Calibri", size=10, italic=True, color="475569")
    sub_cell.alignment = Alignment(horizontal="center", vertical="center")
    ws_dash.row_dimensions[2].height = 20

    # Table Headers
    headers = ["SL", "Field Officer Name", "Designation", "Total KM", "Rate (₹/KM)", "Gross Amount (₹)", "Deductions (₹)", "Net Payable (₹)", "Status"]
    header_row_idx = 4
    ws_dash.row_dimensions[header_row_idx].height = 25
    for col_idx, h_text in enumerate(headers, start=1):
        c = ws_dash.cell(row=header_row_idx, column=col_idx, value=h_text)
        c.font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
        c.fill = PatternFill(start_color="4F46E5", end_color="4F46E5", fill_type="solid")
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = EXCEL_HEADER_BORDER

    # Data Rows
    start_row = 5
    for idx, staff in enumerate(roster, start=1):
        r = start_row + idx - 1
        ws_dash.row_dimensions[r].height = 20
        total_km = float(staff.get("total_km") or 0.0)
        ded = float(staff.get("deduction_amount") or 0.0)
        status = staff.get("status") or "DRAFT"

        ws_dash.cell(row=r, column=1, value=idx).alignment = Alignment(horizontal="center", vertical="center")
        ws_dash.cell(row=r, column=2, value=staff.get("staff_name", "")).alignment = Alignment(horizontal="left", vertical="center")
        ws_dash.cell(row=r, column=3, value=staff.get("designation", "Field Officer")).alignment = Alignment(horizontal="center", vertical="center")
        
        c_km = ws_dash.cell(row=r, column=4, value=total_km)
        c_km.number_format = "#,##0.00"
        c_km.alignment = Alignment(horizontal="right", vertical="center")

        c_rate = ws_dash.cell(row=r, column=5, value=rate_per_km)
        c_rate.number_format = "₹#,##0.00"
        c_rate.alignment = Alignment(horizontal="right", vertical="center")

        c_gross = ws_dash.cell(row=r, column=6, value=f"=D{r}*E{r}")
        c_gross.number_format = "₹#,##0.00"
        c_gross.alignment = Alignment(horizontal="right", vertical="center")

        c_ded = ws_dash.cell(row=r, column=7, value=ded)
        c_ded.number_format = "₹#,##0.00"
        c_ded.alignment = Alignment(horizontal="right", vertical="center")

        c_net = ws_dash.cell(row=r, column=8, value=f"=F{r}-G{r}")
        c_net.number_format = "₹#,##0.00"
        c_net.alignment = Alignment(horizontal="right", vertical="center")
        c_net.font = Font(name="Calibri", size=10, bold=True)

        c_status = ws_dash.cell(row=r, column=9, value=status)
        c_status.alignment = Alignment(horizontal="center", vertical="center")

        for col_i in range(1, 10):
            ws_dash.cell(row=r, column=col_i).border = EXCEL_THIN_BORDER

    # Total Row
    tot_r = start_row + len(roster)
    ws_dash.row_dimensions[tot_r].height = 24
    ws_dash.cell(row=tot_r, column=1, value="TOTAL").alignment = Alignment(horizontal="center", vertical="center")
    ws_dash.cell(row=tot_r, column=2, value=f"{len(roster)} Officers").alignment = Alignment(horizontal="left", vertical="center")
    ws_dash.cell(row=tot_r, column=3, value="")

    if len(roster) > 0:
        c_tot_km = ws_dash.cell(row=tot_r, column=4, value=f"=SUM(D{start_row}:D{tot_r - 1})")
        c_tot_gross = ws_dash.cell(row=tot_r, column=6, value=f"=SUM(F{start_row}:F{tot_r - 1})")
        c_tot_ded = ws_dash.cell(row=tot_r, column=7, value=f"=SUM(G{start_row}:G{tot_r - 1})")
        c_tot_net = ws_dash.cell(row=tot_r, column=8, value=f"=SUM(H{start_row}:H{tot_r - 1})")
    else:
        c_tot_km = ws_dash.cell(row=tot_r, column=4, value=0.0)
        c_tot_gross = ws_dash.cell(row=tot_r, column=6, value=0.0)
        c_tot_ded = ws_dash.cell(row=tot_r, column=7, value=0.0)
        c_tot_net = ws_dash.cell(row=tot_r, column=8, value=0.0)

    ws_dash.cell(row=tot_r, column=5, value="")
    ws_dash.cell(row=tot_r, column=9, value="")

    c_tot_km.number_format = "#,##0.00"
    c_tot_km.alignment = Alignment(horizontal="right", vertical="center")
    c_tot_gross.number_format = "₹#,##0.00"
    c_tot_gross.alignment = Alignment(horizontal="right", vertical="center")
    c_tot_ded.number_format = "₹#,##0.00"
    c_tot_ded.alignment = Alignment(horizontal="right", vertical="center")
    c_tot_net.number_format = "₹#,##0.00"
    c_tot_net.alignment = Alignment(horizontal="right", vertical="center")

    for col_i in range(1, 10):
        cell_t = ws_dash.cell(row=tot_r, column=col_i)
        cell_t.font = Font(name="Calibri", size=10, bold=True)
        cell_t.border = EXCEL_TOTAL_ROW_BORDER

    # DASHBOARD Column widths
    for col in ws_dash.columns:
        col_letter = get_column_letter(col[0].column)
        max_len = max(len(str(cell.value or '')) for cell in col if not str(cell.value or '').startswith("BIHAR"))
        ws_dash.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 35)

    # 2. Individual Staff Sheets
    used_sheet_names = {"DASHBOARD"}
    for staff in roster:
        raw_name = (staff.get("staff_name") or "Field Officer").strip()
        # Clean title for Excel constraints (max 31 chars, no special chars)
        clean_name = re.sub(r'[\[\]:*?/\\]', '_', raw_name).strip()[:24] or "Officer"
        sheet_title = clean_name
        counter = 1
        while sheet_title in used_sheet_names:
            sheet_title = f"{clean_name[:20]}_{counter}"
            counter += 1
        used_sheet_names.add(sheet_title)

        ws_staff = wb.create_sheet(title=sheet_title)

        # Title Banner
        ws_staff.merge_cells("A1:H1")
        st_title = ws_staff.cell(row=1, column=1, value=f"BIHAR TB ELIMINATION MISSION - MONTHLY BIKE LOG REGISTER ({month})")
        st_title.font = Font(name="Calibri", size=12, bold=True, color="FFFFFF")
        st_title.fill = PatternFill(start_color="065F46", end_color="065F46", fill_type="solid")
        st_title.alignment = Alignment(horizontal="center", vertical="center")
        ws_staff.row_dimensions[1].height = 28

        # Subtitle
        ws_staff.merge_cells("A2:H2")
        st_sub = ws_staff.cell(
            row=2, column=1,
            value=f"Officer: {raw_name}  |  Designation: {staff.get('designation', 'Field Officer')}  |  District: {district}  |  Status: {staff.get('status', 'DRAFT')}"
        )
        st_sub.font = Font(name="Calibri", size=10, italic=True, color="334155")
        st_sub.alignment = Alignment(horizontal="center", vertical="center")
        ws_staff.row_dimensions[2].height = 20

        # Day Headers
        day_headers = ["Day", "Date", "Morning KM", "Evening KM", "Daily KM", "Places Visited (PHC / Clinic / Field)", "Purpose / Remarks", "Manual Override"]
        ws_staff.row_dimensions[4].height = 24
        for col_idx, h_text in enumerate(day_headers, start=1):
            c = ws_staff.cell(row=4, column=col_idx, value=h_text)
            c.font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
            c.fill = PatternFill(start_color="047857", end_color="047857", fill_type="solid")
            c.alignment = Alignment(horizontal="center", vertical="center")
            c.border = EXCEL_HEADER_BORDER

        # Day rows
        days = staff.get("days") or []
        st_start_row = 5
        for d_idx, d in enumerate(days, start=1):
            dr = st_start_row + d_idx - 1
            ws_staff.row_dimensions[dr].height = 18
            d_num = d.get("day", d_idx)
            d_date = d.get("date", "")
            m_km = float(d.get("morning_km") or 0.0)
            e_km = float(d.get("evening_km") or 0.0)
            t_km = float(d.get("total_km") or 0.0)
            visited = str(d.get("visited_names") or "")
            purpose = str(d.get("purpose") or d.get("admin_remarks") or "")
            override = "YES" if d.get("is_manual_override") else "NO"

            ws_staff.cell(row=dr, column=1, value=d_num).alignment = Alignment(horizontal="center", vertical="center")
            ws_staff.cell(row=dr, column=2, value=d_date).alignment = Alignment(horizontal="center", vertical="center")
            ws_staff.cell(row=dr, column=3, value=m_km).alignment = Alignment(horizontal="right", vertical="center")
            ws_staff.cell(row=dr, column=4, value=e_km).alignment = Alignment(horizontal="right", vertical="center")
            
            c_dkm = ws_staff.cell(row=dr, column=5, value=t_km)
            c_dkm.number_format = "#,##0.00"
            c_dkm.alignment = Alignment(horizontal="right", vertical="center")

            ws_staff.cell(row=dr, column=6, value=visited).alignment = Alignment(horizontal="left", vertical="center")
            ws_staff.cell(row=dr, column=7, value=purpose).alignment = Alignment(horizontal="left", vertical="center")
            ws_staff.cell(row=dr, column=8, value=override).alignment = Alignment(horizontal="center", vertical="center")

            for col_i in range(1, 9):
                ws_staff.cell(row=dr, column=col_i).border = EXCEL_THIN_BORDER

        # Total Day Row
        st_tot_r = st_start_row + len(days)
        ws_staff.row_dimensions[st_tot_r].height = 22
        ws_staff.cell(row=st_tot_r, column=1, value="TOTAL").alignment = Alignment(horizontal="center", vertical="center")
        ws_staff.cell(row=st_tot_r, column=2, value="")
        ws_staff.cell(row=st_tot_r, column=3, value="")
        ws_staff.cell(row=st_tot_r, column=4, value="")

        if len(days) > 0:
            c_st_tot_km = ws_staff.cell(row=st_tot_r, column=5, value=f"=SUM(E{st_start_row}:E{st_tot_r - 1})")
        else:
            c_st_tot_km = ws_staff.cell(row=st_tot_r, column=5, value=float(staff.get("total_km") or 0.0))

        c_st_tot_km.number_format = "#,##0.00"
        c_st_tot_km.alignment = Alignment(horizontal="right", vertical="center")
        ws_staff.cell(row=st_tot_r, column=6, value="")
        ws_staff.cell(row=st_tot_r, column=7, value="")
        ws_staff.cell(row=st_tot_r, column=8, value="")

        for col_i in range(1, 9):
            cell_st = ws_staff.cell(row=st_tot_r, column=col_i)
            cell_st.font = Font(name="Calibri", size=10, bold=True)
            cell_st.border = EXCEL_TOTAL_ROW_BORDER

        # Summary Block Below Table
        sb_row = st_tot_r + 2
        ws_staff.cell(row=sb_row, column=1, value="ACCOUNTING SUMMARY").font = Font(name="Calibri", size=11, bold=True, color="047857")
        
        summary_rows = [
            ("Total Distance (KM)", f"{float(staff.get('total_km') or 0.0):.2f} KM"),
            ("Approved Rate", f"₹{rate_per_km:.2f} / KM"),
            ("Gross Payable Amount", f"₹{float(staff.get('gross_amount') or 0.0):.2f}"),
            ("Admin Deduction", f"₹{float(staff.get('deduction_amount') or 0.0):.2f}"),
            ("Deduction Reason", str(staff.get('deduction_reason') or "None")),
            ("Net Payable Amount", f"₹{float(staff.get('final_payable_amount') or 0.0):.2f}"),
            ("Verification Status", str(staff.get('status') or "DRAFT")),
        ]

        for s_idx, (s_label, s_val) in enumerate(summary_rows, start=1):
            curr_sb = sb_row + s_idx
            ws_staff.cell(row=curr_sb, column=1, value=s_label).font = Font(name="Calibri", size=10, bold=(s_label == "Net Payable Amount"))
            ws_staff.cell(row=curr_sb, column=2, value=s_val).font = Font(name="Calibri", size=10, bold=(s_label == "Net Payable Amount"))

        # Column widths for staff sheet
        for col in ws_staff.columns:
            col_letter = get_column_letter(col[0].column)
            max_len = max(len(str(cell.value or '')) for cell in col if not str(cell.value or '').startswith("BIHAR"))
            ws_staff.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 40)

    # Save to buffer
    output = io.BytesIO()
    wb.save(output)
    content_bytes = output.getvalue()
    output.close()
    return content_bytes


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
        if s_key in seen_keys:
            continue
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
            seen_keys.add(s_key)

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

    # Enforce locking and edit permissions check
    existing_status = "DRAFT"
    try:
        existing_doc = doc_ref.get()
        if existing_doc.exists:
            ex_data = existing_doc.to_dict() or {}
            existing_status = ex_data.get("status", "DRAFT")
            allowed, err = validate_edit_permission(ex_data, current_user.get("role", ""))
            if not allowed:
                raise HTTPException(
                    status_code=423 if "locked" in err.lower() else 403,
                    detail=err
                )
        else:
            allowed, err = validate_edit_permission({"status": "DRAFT", "is_locked": False}, current_user.get("role", ""))
            if not allowed:
                raise HTTPException(status_code=403, detail=err)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error checking locked state: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Database error during lock check: {str(e)}"
        )

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


@router.post("/admin/ta/submit-roster")
def submit_district_ta_roster(
    req: TaSubmitRosterReq,
    current_user: dict = Depends(get_current_user)
):
    """
    Submits draft or reverted staff records to Main Incharge for verification.
    Transitions records from DRAFT/REVERTED to SUBMITTED.
    """
    canon_dist = check_district_access(current_user, req.district)
    role = current_user.get("role", "")
    actor_name = current_user.get("name") or current_user.get("username") or "Sub-Admin"

    query = db.collection("travel_allowance_logs")\
        .where("month", "==", req.month)\
        .where("district", "==", canon_dist)

    docs = query.stream()
    count = 0
    for doc in docs:
        d = doc.to_dict() or {}
        s_key = d.get("staff_key") or normalize_staff_slug(d.get("staff_name") or "")
        if req.staff_keys and s_key not in req.staff_keys:
            continue

        status = d.get("status", "DRAFT")
        if status in ("DRAFT", "REVERTED", None, ""):
            updated = apply_staff_status_transition(
                d,
                action="SUBMIT",
                actor_role=role,
                actor_name=actor_name
            )
            target_ref = getattr(doc, "reference", None)
            if not target_ref or not hasattr(target_ref, "set"):
                d_id = getattr(doc, "id", None) or d.get("doc_id") or f"{req.month}_{canon_dist.lower()}_{s_key}"
                target_ref = db.collection("travel_allowance_logs").document(d_id)
            target_ref.set(updated, merge=True)
            count += 1

    cache.delete(f"ta_roster_{req.month}_{canon_dist.lower()}")
    return {
        "status": "success",
        "message": f"Successfully submitted {count} staff records for approval.",
        "count": count
    }


@router.post("/admin/ta/pass-staff")
def pass_staff_record(
    req: TaPassStaffReq,
    current_user: dict = Depends(get_current_user)
):
    """
    Granular per-staff pass/approval.
    Sets status = APPROVED, is_locked = True.
    Supports single staff or batch passing if staff_key == 'ALL' or staff_keys list provided.
    """
    role = current_user.get("role", "")
    if role not in ("MAIN_INCHARGE", "SUPER_ADMIN", "ADMIN"):
        raise HTTPException(
            status_code=403,
            detail="Access denied. Only Incharge or Super Admin can pass staff records."
        )

    canon_dist = check_district_access(current_user, req.district)
    actor_name = current_user.get("name") or current_user.get("username") or "Incharge"

    # Batch passing
    if req.staff_key.upper() == "ALL" or req.staff_keys:
        target_keys = set(req.staff_keys or [])
        query = db.collection("travel_allowance_logs")\
            .where("month", "==", req.month)\
            .where("district", "==", canon_dist)
        docs = query.stream()
        passed = []
        for doc in docs:
            d = doc.to_dict() or {}
            s_key = d.get("staff_key") or normalize_staff_slug(d.get("staff_name") or "")
            if target_keys and s_key not in target_keys:
                continue
            if d.get("status") == "SUBMITTED":
                updated = apply_staff_status_transition(d, action="PASS", actor_role=role, actor_name=actor_name)
                target_ref = getattr(doc, "reference", None)
                if not target_ref or not hasattr(target_ref, "set"):
                    d_id = getattr(doc, "id", None) or d.get("doc_id") or f"{req.month}_{canon_dist.lower()}_{s_key}"
                    target_ref = db.collection("travel_allowance_logs").document(d_id)
                target_ref.set(updated, merge=True)
                passed.append(s_key)

        cache.delete(f"ta_roster_{req.month}_{canon_dist.lower()}")
        return {
            "status": "success",
            "message": f"Successfully approved {len(passed)} staff records.",
            "passed_keys": passed
        }

    # Single staff passing
    doc_id = f"{req.month}_{canon_dist.lower()}_{req.staff_key}"
    doc_ref = db.collection("travel_allowance_logs").document(doc_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Staff TA record not found.")

    d = doc.to_dict() or {}
    updated = apply_staff_status_transition(d, action="PASS", actor_role=role, actor_name=actor_name)
    doc_ref.set(updated, merge=True)
    cache.delete(f"ta_roster_{req.month}_{canon_dist.lower()}")

    return {
        "status": "success",
        "message": f"Staff record {req.staff_key} approved.",
        "data": updated
    }


@router.post("/admin/ta/revert-staff")
def revert_staff_record(
    req: TaRevertStaffReq,
    current_user: dict = Depends(get_current_user)
):
    """
    Granular per-staff revert with mandatory reason.
    Sets status = REVERTED, is_locked = False.
    """
    role = current_user.get("role", "")
    if role not in ("MAIN_INCHARGE", "SUPER_ADMIN", "ADMIN"):
        raise HTTPException(
            status_code=403,
            detail="Access denied. Only Incharge or Super Admin can revert staff records."
        )

    if not req.revert_reason or not req.revert_reason.strip():
        raise HTTPException(
            status_code=400,
            detail="Revert reason is mandatory."
        )

    canon_dist = check_district_access(current_user, req.district)
    actor_name = current_user.get("name") or current_user.get("username") or "Incharge"

    doc_id = f"{req.month}_{canon_dist.lower()}_{req.staff_key}"
    doc_ref = db.collection("travel_allowance_logs").document(doc_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Staff TA record not found.")

    d = doc.to_dict() or {}
    updated = apply_staff_status_transition(
        d,
        action="REVERT",
        actor_role=role,
        actor_name=actor_name,
        reason=req.revert_reason.strip()
    )
    doc_ref.set(updated, merge=True)
    cache.delete(f"ta_roster_{req.month}_{canon_dist.lower()}")

    return {
        "status": "success",
        "message": f"Staff record {req.staff_key} reverted.",
        "data": updated
    }


@router.post("/admin/ta/unlock-staff")
def unlock_staff_record(
    req: TaUnlockStaffReq,
    current_user: dict = Depends(get_current_user)
):
    """
    Unlocks an approved/locked staff record so Sub-Admin can edit and resubmit.
    Sets is_locked = False, status = REVERTED.
    """
    role = current_user.get("role", "")
    if role not in ("MAIN_INCHARGE", "SUPER_ADMIN", "ADMIN"):
        raise HTTPException(
            status_code=403,
            detail="Access denied. Only Incharge or Super Admin can unlock staff records."
        )

    canon_dist = check_district_access(current_user, req.district)
    actor_name = current_user.get("name") or current_user.get("username") or "Incharge"

    doc_id = f"{req.month}_{canon_dist.lower()}_{req.staff_key}"
    doc_ref = db.collection("travel_allowance_logs").document(doc_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Staff TA record not found.")

    d = doc.to_dict() or {}
    updated = apply_staff_status_transition(
        d,
        action="UNLOCK",
        actor_role=role,
        actor_name=actor_name
    )
    doc_ref.set(updated, merge=True)
    cache.delete(f"ta_roster_{req.month}_{canon_dist.lower()}")

    return {
        "status": "success",
        "message": f"Staff record {req.staff_key} unlocked.",
        "data": updated
    }


@router.get("/fo/ta/monthly-summary")
def get_fo_monthly_summary(
    month: str = Query(..., description="Target month YYYY-MM"),
    district: str = Query(..., description="Officer district"),
    fo_name: str = Query(..., description="Officer full name"),
    current_user: dict = Depends(get_current_user)
):
    """
    Field Officer mobile monthly TA summary.
    If record is not approved, returns UNDER_REVIEW with amounts masked.
    If approved, returns full financial breakdown and dispute window status.
    """
    canon_dist = canonicalize_district(district)
    staff_key = normalize_staff_slug(fo_name)
    doc_id = f"{month}_{canon_dist.lower()}_{staff_key}"

    doc = db.collection("travel_allowance_logs").document(doc_id).get()
    if not doc.exists:
        return {
            "status": "UNDER_REVIEW",
            "message": "Monthly TA verification in progress",
            "data": None
        }

    data = doc.to_dict() or {}
    if data.get("status") != "APPROVED":
        return {
            "status": "UNDER_REVIEW",
            "message": "Monthly TA verification in progress",
            "data": None
        }

    dispute_active = is_dispute_window_open(data.get("approved_at"))
    return {
        "status": "APPROVED",
        "dispute_window_active": dispute_active,
        "data": {
            "doc_id": data.get("doc_id", doc_id),
            "month": data.get("month", month),
            "district": data.get("district", canon_dist),
            "staff_name": data.get("staff_name", fo_name),
            "staff_key": data.get("staff_key", staff_key),
            "designation": data.get("designation", "Field Officer"),
            "rate_per_km": data.get("rate_per_km", 4.0),
            "total_km": data.get("total_km", 0.0),
            "gross_amount": data.get("gross_amount", 0.0),
            "deduction_amount": data.get("deduction_amount", 0.0),
            "deduction_reason": data.get("deduction_reason", ""),
            "final_payable_amount": data.get("final_payable_amount", 0.0),
            "admin_remarks": data.get("admin_remarks", ""),
            "approved_at": data.get("approved_at"),
            "approved_by": data.get("approved_by"),
            "dispute_status": data.get("dispute_status", "NONE"),
            "days": data.get("days", [])
        }
    }


@router.post("/fo/ta/dispute")
def raise_fo_ta_dispute(
    req: TaDisputeReq,
    current_user: dict = Depends(get_current_user)
):
    """
    Allows Field Officer to raise a dispute within the 24-hour approval window.
    Dispatches dual-alert notification to Sub-Admin and Admin/Incharge.
    """
    if not req.dispute_reason or not req.dispute_reason.strip():
        raise HTTPException(status_code=400, detail="Dispute reason is mandatory.")

    canon_dist = canonicalize_district(req.district)
    staff_key = normalize_staff_slug(req.fo_name)
    doc_id = f"{req.month}_{canon_dist.lower()}_{staff_key}"

    doc_ref = db.collection("travel_allowance_logs").document(doc_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="TA record not found.")

    d = doc.to_dict() or {}
    if d.get("status") != "APPROVED":
        raise HTTPException(status_code=400, detail="Cannot dispute a record that is not approved.")

    if not is_dispute_window_open(d.get("approved_at")):
        raise HTTPException(
            status_code=400,
            detail="Dispute window has closed. Disputes must be filed within 24 hours of approval."
        )

    now_str = datetime.utcnow().isoformat()
    reason_clean = req.dispute_reason.strip()

    d["dispute_status"] = "PENDING"
    d["dispute_reason"] = reason_clean
    d["disputed_at"] = now_str
    d["updated_at"] = now_str

    doc_ref.set(d, merge=True)

    # Dispatch dual alert notification
    try:
        notif_payload = {
            "title": f"TA Dispute: {req.fo_name} ({canon_dist})",
            "message": f"{req.fo_name} raised a dispute for {req.month} TA: {reason_clean}",
            "type": "TA_DISPUTE",
            "target_roles": ["SUB_ADMIN", "ADMIN", "SUPER_ADMIN", "MAIN_INCHARGE"],
            "target_district": canon_dist,
            "metadata": {
                "month": req.month,
                "district": canon_dist,
                "staff_name": req.fo_name,
                "staff_key": staff_key,
                "dispute_reason": reason_clean,
                "type": "TA_DISPUTE"
            },
            "created_at": now_str,
            "is_read": False
        }
        db.collection("broadcast_notifications").add(notif_payload)
    except Exception as e:
        print(f"Error dispatching TA dispute notification: {e}")

    return {
        "status": "success",
        "message": "Dispute submitted successfully to Incharge and Sub-Admin.",
        "data": d
    }


@router.post("/admin/ta/resolve-dispute")
def resolve_ta_dispute(
    req: TaResolveDisputeReq,
    current_user: dict = Depends(get_current_user)
):
    """
    Main Incharge resolves a pending FO dispute:
    - ACCEPT: Unlocks record (is_locked = False, status = REVERTED) for Sub-Admin correction.
    - REJECT: Closes dispute (dispute_status = REJECTED, status = APPROVED, is_locked = True).
    """
    role = current_user.get("role", "")
    if role not in ("MAIN_INCHARGE", "SUPER_ADMIN", "ADMIN"):
        raise HTTPException(status_code=403, detail="Access denied. Only Incharge or Super Admin can resolve disputes.")

    action = req.action.upper().strip()
    if action not in ("ACCEPT", "REJECT"):
        raise HTTPException(status_code=400, detail="Action must be either ACCEPT or REJECT.")

    canon_dist = check_district_access(current_user, req.district)
    actor_name = current_user.get("name") or current_user.get("username") or "Incharge"

    doc_id = f"{req.month}_{canon_dist.lower()}_{req.staff_key}"
    doc_ref = db.collection("travel_allowance_logs").document(doc_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Staff TA record not found.")

    d = doc.to_dict() or {}
    now_str = datetime.utcnow().isoformat()

    if action == "ACCEPT":
        d["is_locked"] = False
        d["status"] = "REVERTED"
        d["dispute_status"] = "RESOLVED"
    else:
        d["dispute_status"] = "REJECTED"
        d["is_locked"] = True
        d["status"] = "APPROVED"

    d["dispute_resolved_at"] = now_str
    d["dispute_resolved_by"] = actor_name
    d["dispute_resolution_remarks"] = req.resolution_remarks or ""
    d["updated_at"] = now_str

    doc_ref.set(d, merge=True)
    cache.delete(f"ta_roster_{req.month}_{canon_dist.lower()}")

    return {
        "status": "success",
        "message": f"Dispute {action.lower()}ed successfully.",
        "data": d
    }


@router.get("/admin/ta/export-excel")
async def export_travel_allowance_excel(
    month: str = Query(..., description="Target month in YYYY-MM format"),
    district: str = Query(..., description="Target district name"),
    current_user: dict = Depends(get_current_user)
):
    """
    Generates and streams multi-sheet openpyxl Excel workbook for district TA payroll.
    Protected by Sub-Admin district scope check.
    Uses garbage collection to prevent memory spikes.
    """
    canon_dist = check_district_access(current_user, district)

    # Retrieve current roster data
    roster_res = await get_district_ta_roster(
        month=month,
        district=canon_dist,
        force_refresh=True,
        current_user=current_user
    )

    wb_bytes = build_ta_excel_workbook(roster_res)
    gc.collect()

    filename = f"TA_{safe_filename(canon_dist)}_{month}.xlsx"
    return ExcelStreamingResponse(
        wb_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

