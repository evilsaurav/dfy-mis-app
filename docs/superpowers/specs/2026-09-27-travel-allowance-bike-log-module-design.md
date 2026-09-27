# Design Specification: Travel Allowance (TA) & Bike Log Management Module

- **Date:** 2026-09-27
- **Target Version:** v2.8.5
- **Status:** Approved Draft
- **Authors:** DFY Engineering & Healthcare Operations Team

---

## 1. Executive Summary & Purpose

In the Bihar TB Elimination Mission operated by Doctors For You (DFY), Field Officers (FO) travel extensively across blocks, primary health centers (PHC), private practitioner clinics, and diagnostic labs on motorbikes.

This module introduces a standardized, tamper-proof, and audit-ready **Travel Allowance (TA) & Bike Log Management System** directly integrated into the DFY MIS application (FastAPI + Firestore + React).

### Key Business & Technical Objectives:
1. **Fixed Standard Rate:** Fixed reimbursement rate of **₹4.00 / KM**.
2. **Strict RBAC & Immutability:**
   - **Field Officers (FO):** 100% Read-Only inspection via a dedicated view in `App.jsx`. All inputs are disabled to prevent field manipulation.
   - **Admins & District Coordinators (DC):** Full entry, editing, manual override (for broken meters), deduction adjustments, and Excel export via `AdminDashboard.jsx`.
3. **Smart Pre-fill Intelligence:** 1-click sync from `daily_field_reports` (`morning_km`, `evening_km`, and `visited_names`) to eliminate manual data entry overhead for 30–31 days.
4. **Month-End Reconciliation & Deduction Accounting:**
   - Gross Amount (`Total KM * 4.00`).
   - Admin Deductions (`deduction_amount`) with mandatory explanation (`deduction_reason`).
   - Final Payable Amount (`gross_amount - deduction_amount`).
   - Admin Final Remarks for audit/HR.
5. **Presentation-Ready Analytics:** Grand Total Project KM (Cumulative / YTD), Average Daily KM per FO, and Total TA Approved.
6. **Executive Multi-Sheet Excel Export (.xlsx):**
   - **Sheet 1 (DASHBOARD):** Master payroll summary table with employee names, KM, gross, deductions, deduction reasons, and net payable amounts with Excel `=SUM(...)` formulas.
   - **Sheets 2..N (Staff Bike Logs):** Individual formatted bike log sheets matching the Bihar Health Mission standard format.

---

## 2. Firestore Data Model

### Collection: `travel_allowance_logs`
- **Document ID Format:** `{year_month}_{district}_{staff_key}`  
  *(Example: `2026-09_gaya_rameshkumar`)*

```json
{
  "doc_id": "2026-09_gaya_rameshkumar",
  "month": "2026-09",
  "district": "Gaya",
  "staff_name": "Ramesh Kumar",
  "staff_key": "gaya_rameshkumar",
  "designation": "Field Officer",
  "rate_per_km": 4.00,
  "total_km": 450,
  "gross_amount": 1800.00,
  "deduction_amount": 100.00,
  "deduction_reason": "Excess 25 KM travel on 2026-09-14 unverified by DC",
  "final_payable_amount": 1700.00,
  "admin_final_remarks": "Verified and passed for September accounts payment.",
  "daily_logs": {
    "2026-09-01": {
      "initial_reading": 12000,
      "final_reading": 12030,
      "total_km": 30,
      "is_override": false,
      "rate": 4.00,
      "amount": 120.00,
      "from_location": "Gaya Sadar",
      "to_location": "Bodhgaya PHC",
      "purpose": "Sample Collection & Follow-up",
      "remarks": ""
    },
    "2026-09-02": {
      "initial_reading": 12030,
      "final_reading": 12030,
      "total_km": 25,
      "is_override": true,
      "rate": 4.00,
      "amount": 100.00,
      "from_location": "Tekari",
      "to_location": "Konch",
      "purpose": "Doctor Visit",
      "remarks": "Speedometer cable damaged, verified via block route"
    }
  },
  "created_at": "2026-09-01 10:00:00",
  "last_updated_at": "2026-09-27 21:00:00",
  "last_updated_by": "DC Gaya",
  "last_updated_role": "SUB_ADMIN"
}
```

### Architectural Safeguards:
- 1 single document read per staff-month (31 days atomic).
- Sub-Admin district queries scoped strictly with `where("district", "==", canonical_district)`.
- Eliminates race conditions with atomic document updates.

---

## 3. FastAPI Backend Specification (`main.py`)

### 3.1. Models (Pydantic)
```python
class DailyTaEntry(BaseModel):
    initial_reading: Optional[int] = 0
    final_reading: Optional[int] = 0
    total_km: Optional[int] = 0
    is_override: Optional[bool] = False
    rate: Optional[float] = 4.00
    amount: Optional[float] = 0.00
    from_location: Optional[str] = ""
    to_location: Optional[str] = ""
    purpose: Optional[str] = ""
    remarks: Optional[str] = ""

class SaveTaLogRequest(BaseModel):
    month: str                         # Format: YYYY-MM
    district: str
    staff_name: str
    staff_key: str
    designation: Optional[str] = "Field Officer"
    daily_logs: Dict[str, DailyTaEntry] # Key: YYYY-MM-DD
    deduction_amount: Optional[float] = 0.00
    deduction_reason: Optional[str] = ""
    admin_final_remarks: Optional[str] = ""
```

### 3.2. Endpoints

#### 1. `GET /api/ta-logs`
- **Params:** `month: str`, `district: Optional[str] = None`, `staff_key: Optional[str] = None`
- **Auth:** `get_optional_admin` (Admin/Sub-Admin or FO via PIN).
- **Behavior:**
  - Sub-Admin users are strictly bounded to their `allowed_districts`.
  - Returns monthly TA log for specified staff or all staff in district.

#### 2. `POST /api/ta-logs/save`
- **Body:** `SaveTaLogRequest`
- **Auth:** `admin: dict = Depends(get_current_admin)` (Admin write only).
- **Behavior:**
  - Sub-Admin district isolation: verifies `district` is permitted.
  - Server recalculates totals deterministically:
    - `total_km = sum(entry.total_km for entry in daily_logs.values())`
    - `gross_amount = round(total_km * 4.00, 2)`
    - `deduction_amount = max(0.0, float(req.deduction_amount or 0))`
    - `final_payable_amount = max(0.0, round(gross_amount - deduction_amount, 2))`
  - Saves atomically to `travel_allowance_logs/{doc_id}`.
  - Invalidate TA cache keys: `ta_analytics_{district}_{month}`, `ta_logs_{month}_{district}`.
  - Logs action via `log_admin_activity`.

#### 3. `POST /api/ta-logs/prefill-from-reports`
- **Params:** `month: str`, `district: str`, `staff_name: str`
- **Auth:** `admin: dict = Depends(get_current_admin)`
- **Behavior:**
  - Scans `daily_field_reports` for that officer and month.
  - Pulls `morning_km`, `evening_km`, `total_km`, and `visited_names`.
  - Returns a synthesized `daily_logs` draft dictionary ready to inspect and save.

#### 4. `GET /api/ta-logs/analytics`
- **Params:** `month: Optional[str] = None`, `district: Optional[str] = "All"`
- **Auth:** `get_current_admin` or public view.
- **Metrics Calculated:**
  - `total_project_km_ytd`: Grand cumulative KM across all months/districts.
  - `month_total_km`: Total KM for requested month.
  - `avg_daily_km_per_fo`: Realistic average KM per active working day.
  - `total_ta_gross`: Gross TA before deductions.
  - `total_ta_deductions`: Total deductions.
  - `total_ta_final_payable`: Net payable TA disbursed.

#### 5. `GET /api/ta-logs/export-excel`
- **Params:** `month: str`, `district: str`
- **Auth:** `admin: dict = Depends(get_current_admin)`
- **Engine:** `openpyxl` guarded with `asyncio.Semaphore(1)` and `gc.collect()`.
- **Workbook Format:**
  - **Sheet 1 ("DASHBOARD"):**
    - Headers: `Sl. No`, `Employee Name`, `Designation`, `Type of TA`, `Total KM`, `Gross Amount (₹)`, `Deduction (₹)`, `Deduction Reason`, `Final Payable Amount (₹)`.
    - Data rows for all staff in district.
    - Grand Total row at the bottom with formulas `=SUM(...)`.
  - **Sheets 2..N (Named per staff, e.g. "Ramesh Kumar"):**
    - Official Title: "DOCTORS FOR YOU — BIHAR TB ELIMINATION MISSION"
    - Subtitle: "BIKE TRAVEL LOG BOOK & TA CLAIM — [MONTH]"
    - Metadata Header: Officer Name, District, Designation, Rate (₹4.00/KM).
    - Table: Date, Initial Reading, Final Reading, Total KM, Rate, Amount (₹), Route (From - To), Purpose / Remarks.
    - Summary Box: Total KM, Gross Claim, Deductions + Reason, Net Payable Amount.
    - Signatures Line: "Signature of Officer", "Verified by District Coordinator", "Approved by State Accounts".

---

## 4. Frontend UI Specification

### 4.1. Admin TA Management Studio (`dfy-frontend/src/AdminDashboard.jsx`)
- Accessible via new Navigation Tab: **"🛵 Travel & Bike TA Studio"**.
- Sub-Admin aware: District selector locked to authorized districts.
- Controls Header:
  - District dropdown.
  - Month Picker (`YYYY-MM`).
  - Staff dropdown list.
  - Action buttons:
    - `⚡ Pre-fill from Daily Reports`
    - `💾 Save TA Log` (with loading state & anti-double-tap guard)
    - `📑 Export District TA Workbook (.xlsx)`
- Interactive 31-Day Grid Table:
  - Columns: Date | Day | Initial Reading | Final Reading | Total KM | Rate (₹4.00) | Amount (₹) | From | To | Purpose & Remarks.
  - Live recalculation on every keystroke.
  - Broken Meter Toggle: Checkbox to enable manual KM input if odometer reading was unavailable.
- Month-End Reconciliation Card:
  - Gross Amount Display (`Total KM * ₹4.00`).
  - Deduction Input (₹).
  - Deduction Reason Text Input.
  - Net Payable Amount Display (`Gross - Deduction`).
  - Admin Final Remarks / Notes.

### 4.2. Field Officer Read-Only View (`dfy-frontend/src/App.jsx`)
- Inside `MyProfileDashboard`: New Section / Tab **"🛵 My Travel & TA Log"**.
- Security & Immutability:
  - Strictly Read-Only (no inputs, no save buttons).
  - Shows verified data submitted by District Coordinator / Admin.
- Summary Cards:
  - Total Monthly KM.
  - Gross TA (`₹ X,XXX`).
  - Deductions (if any): `- ₹ XXX` with the exact admin reason displayed transparently.
  - Final Approved Payout (`₹ X,XXX`).
- Day-wise Ledger List showing date, meter readings, route, KM, approved amount, and notes.

### 4.3. Presentation & Donor Review Analytics Cards
- Rendered on District & Executive Dashboards:
  - 🛵 **Total Project KM (YTD):** Grand cumulative mileage covered by DFY frontline staff in Bihar.
  - ⏱️ **FO Daily Mobility Average:** `Total KM / Active Field Days`.
  - 💰 **Disbursed TA Amount:** Total net TA payable for the month.

---

## 5. Security, RBAC & Isolation Verification Plan

1. **Sub-Admin Isolation:**
   - A Sub-Admin from Gaya cannot view, edit, or export TA logs for Patna or Bhojpur.
2. **Field Officer Read-Only Guarantee:**
   - `App.jsx` has zero write endpoints for TA logs.
   - Any attempt to POST to `/api/ta-logs/save` without Admin JWT token receives `401 Unauthorized`.
3. **Deterministic Math:**
   - Client and server compute `Total KM * 4.00 - Deduction` with zero float rounding drift (`round(..., 2)`).
4. **Render RAM & Concurrency Guard:**
   - Excel workbook generation runs under `asyncio.Semaphore(1)` with immediate `gc.collect()`.
