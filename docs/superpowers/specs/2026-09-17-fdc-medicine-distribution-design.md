# Technical Design Specification: TB FDC Medicine Distribution Module

**Date**: 2026-09-17  
**Status**: Approved (Brainstorming Complete)  
**Target Modules**: `dfy-frontend` (FO MIS & Admin Dashboard), `main.py` (FastAPI backend)  

---

## 1. Executive Summary & Constraints

### 1.1 Goal
Provide a streamlined, error-proof TB Fixed Dose Combination (FDC) medicine distribution logging and consumption tracking system for Field Officers (FOs) and State Coordinators across Bihar.

### 1.2 Core Constraints
1. **Zero Database Disruption**:
   - No modifications to existing collections schemas or queries.
   - Zero extra Firestore read/write costs by storing enriched FDC details within the existing `daily_field_reports.fdc_details` document payload.
2. **Zero Server Load / Crash Protection**:
   - Render Starter Tier RAM protection: Excel consumption reports generation strictly serialized via `KPI_EXCEL_SEMAPHORE` with per-record garbage collection.
   - Frontend anti-double-tap button locks to prevent staff duplicate requests.
3. **Medical Safety & Auto-Calculation**:
   - Field Officers never manually guess regimen or strip counts. Dosage is 100% automated based on National TB Elimination Program (NTEP) adult and pediatric weight-band matrices.
4. **8-Digit Legacy ID Clause (FDC & Outcome)**:
   - Older/legacy patients registered in Nikshay carry **8-digit IDs**, whereas modern registrations carry **9-digit IDs**.
   - Both **FDC Provided** (`fdc_provided_ids` & `fdc_details`) and **Outcome Assigned** (`outcome_assigned_ids`) MUST officially accept both 8-digit and 9-digit numeric IDs across FO Mobile Form, Admin Feed Data, Admin Edit Day, and Backend APIs. All other categories remain 9-digit strictly.

---

## 2. Architecture & Component Blueprint

```
dfy-frontend/src/
├── utils/
│   └── fdcCalculator.js               # Standalone pure calculation engine (0 dependencies)
├── App.jsx                            # Enhanced FdcBucket with Option A (Inline Smart Card)
└── AdminDashboard.jsx                 # Medicine Consumption Studio tab + Excel export + FO Breakdown

backend/
└── main.py                            # Endpoint: /admin/reports/medicine-consumption with Semaphore guard
```

---

## 3. Calculation Matrix Engine (`utils/fdcCalculator.js`)

Pure JavaScript function: `calculateFdcDosage(patientType, weightKg, phase)` returning structured metadata:
- `isValid: boolean`
- `error: string | null`
- `regimenName: string`
- `weightBand: string`
- `dailyDoseText: string`
- `supplyIssued: string`
- `dailyTablets: number`
- `strips: number`
- `phaseText: string`

### 3.1 Adult Logic Matrix ($\ge 18\text{ years}$ or Type = `adult`)
*Validation*: If $\text{weightKg} < 25$, `isValid = false`, error = "Adult weight must be at least 25 kg. Please refer to Medical Officer."

| Weight Band | Phase | Regimen | Daily Dose | Supply to Issue | Strips Count |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **25–34 kg** | IP<br>CP | 4 FDC (HRZE)<br>3 FDC (HRE) | 2 tabs daily<br>2 tabs daily | 4 strips (28 days)<br>8 strips (56 days) | 4<br>8 |
| **35–49 kg** | IP<br>CP | 4 FDC (HRZE)<br>3 FDC (HRE) | 3 tabs daily<br>3 tabs daily | 6 strips (28 days)<br>12 strips (56 days) | 6<br>12 |
| **50–64 kg** | IP<br>CP | 4 FDC (HRZE)<br>3 FDC (HRE) | 4 tabs daily<br>4 tabs daily | 8 strips (28 days)<br>16 strips (56 days) | 8<br>16 |
| **65–75 kg** | IP<br>CP | 4 FDC (HRZE)<br>3 FDC (HRE) | 5 tabs daily<br>5 tabs daily | 10 strips (28 days)<br>20 strips (56 days) | 10<br>20 |
| **> 75 kg** | IP<br>CP | 4 FDC (HRZE)<br>3 FDC (HRE) | 6 tabs daily<br>6 tabs daily | 12 strips (28 days)<br>24 strips (56 days) | 12<br>24 |

### 3.2 Pediatric Logic Matrix ($< 18\text{ years}$ or Type = `pediatric`)
*Validation*: If $\text{weightKg} < 4$, `isValid = false`, error = "Pediatric weight must be at least 4 kg."

| Weight Band | Phase | Regimen & Daily Dose | Recommended Supply | Strips Count |
| :--- | :--- | :--- | :--- | :--- |
| **4–7 kg** | IP<br>CP | 1 tab HRZ (3 FDC-P) + 1 tab E (100mg)<br>1 tab HR (2 FDC-P) + 1 tab E (100mg) | 1 strip HRZ + 1 strip E<br>1 strip HR + 1 strip E | 2<br>2 |
| **8–11 kg** | IP<br>CP | 2 tabs HRZ (3 FDC-P) + 2 tabs E (100mg)<br>2 tabs HR (2 FDC-P) + 2 tabs E (100mg) | 2 strips HRZ + 2 strips E<br>2 strips HR + 2 strips E | 4<br>4 |
| **12–15 kg** | IP<br>CP | 3 tabs HRZ (3 FDC-P) + 3 tabs E (100mg)<br>3 tabs HR (2 FDC-P) + 3 tabs E (100mg) | 3 strips HRZ + 3 strips E<br>3 strips HR + 3 strips E | 6<br>6 |
| **16–24 kg** | IP<br>CP | 4 tabs HRZ (3 FDC-P) + 4 tabs E (100mg)<br>4 tabs HR (2 FDC-P) + 4 tabs E (100mg) | 4 strips HRZ + 4 strips E<br>4 strips HR + 4 strips E | 8<br>8 |
| **25–29 kg** | IP<br>CP | 3 tabs (3 FDC-P) + 1 Adult 4 FDC + 3 tabs E<br>3 tabs (2 FDC-P) + 1 Adult 3 FDC + 3 tabs E | Combination pediatric + adult strip pack | 7<br>7 |
| **30–39 kg** | IP<br>CP | 2 tabs (3 FDC-P) + 2 Adult 4 FDC + 2 tabs E<br>2 tabs (2 FDC-P) + 2 Adult 3 FDC + 2 tabs E | Combination pediatric + adult strip pack | 6<br>6 |
| **$\ge 40$ kg** | IP<br>CP | Adult standard dosage regimen recommended | Refer to Adult dosage chart | Same as Adult |

---

## 4. FO Reporting Integration: Option A (Inline Smart Card in `App.jsx`)

### 4.1 Component Flow in `FdcBucket`:
1. **Input Fields**:
   - **Nikshay ID**: Accepts both **8-digit and 9-digit numeric IDs** (`\b\d{8,9}\b`, `raw.length === 8 || raw.length === 9`). Supports single entry or selection from `Today's Notified IDs` chips.
   - When a valid 8 or 9-digit ID is typed or a chip is clicked:
     - The inline card automatically expands smoothly.
2. **Inline Smart Dosage Configuration**:
   - **Patient Name**: Text input (e.g., "Ramesh Kumar").
   - **Patient Category Toggle**: Pills for `Adult` (default) and `Pediatric (< 18 yrs)`.
   - **Weight (kg)**: Numeric input (step 0.5, e.g. 45.0).
   - **Phase Toggle**: Pills for `Intensive Phase (IP)` and `Continuation Phase (CP)`.
3. **Reactive Live Dosage Badge**:
   - Displays real-time computed dosage pill:
     - 💊 **Regimen:** `4 FDC (HRZE)`
     - ⚖️ **Weight Band:** `35–49 kg`
     - 📋 **Daily Dose:** `3 tablets daily`
     - 📦 **Supply Issued:** `6 strips (28 days)`
4. **Action Buttons**:
   - **"Add to FDC Distribution"**: Validates and adds entry to `formData.fdc_details` and `formData.fdc_provided_ids`.
   - **"Quick Add (Default)"**: Fallback for fast entry if patient weight is pending, defaulting to standard Adult IP 1 strip.
5. **Entry List**:
   - Each added patient entry displays a compact badge showing:
     `#12345678 - Ramesh Kumar | 4 FDC (6 Strips) | IP (45kg)`
   - Includes an edit button (re-opens details in card) and delete button (`&times;`).

### 4.2 Outcome Assigned (`outcome_assigned_ids`) 8-Digit Clause:
- In `IdBucket`, pass `allow8Digit={cat.key === 'outcome_assigned_ids'}`.
- When `allow8Digit` is true:
  - Regex allows both 8 and 9 digits (`\b\d{8,9}\b` for multi-paste).
  - Single ID validator accepts `(raw.length === 8 || raw.length === 9) && !isNaN(raw)`.
  - Placeholder dynamically reads: `"Enter or paste 8 or 9-digit ID"`.
  - Ready badge activates for length 8 or 9.
  - Toast message on invalid length: `"ID 8 ya 9 digit ki honi chahiye bhai!"`.

---

## 5. Backend Storage & Zero-Load Guarantee (`main.py`)

### 5.1 Enriched Document Schema inside `daily_field_reports`:
No new collection is needed during regular daily submission. The `fdc_details` array inside the day's existing `daily_field_reports` document receives:
```json
{
  "id": "12345678",
  "patient_name": "Ramesh Kumar",
  "patient_type": "adult",
  "weight_kg": 45.0,
  "weight_band": "35–49 kg",
  "phase": "IP",
  "regimen_name": "4 FDC (HRZE)",
  "daily_dose_text": "3 tablets daily",
  "supply_issued": "6 strips (28 days)",
  "strips": 6,
  "tu_name": "Sadar"
}
```

### 5.2 Zero-Load Read Strategy:
- When the dashboard is opened or reports are requested, `main.py` uses existing monthly cached snapshots (`get_shared_raw_month_records`).
- **Cost**: 0 additional Firestore read operations.

### 5.3 Backend API 8-Digit Validation Updates:
- `/admin/feed-officer-data`:
  ```python
  is_valid_len = (len(s) in [8, 9]) if cat in ["fdc_provided_ids", "outcome_assigned_ids"] else (len(s) == 9)
  if not (s.isdigit() and is_valid_len):
      invalid_ids.append(s)
  ```
- `/admin/reports/edit-day`:
  ```python
  is_valid_len = (len(cid) in [8, 9]) if cat_key in ["fdc_provided_ids", "outcome_assigned_ids"] else (len(cid) == 9)
  if cid.isdigit() and is_valid_len and cid not in clean_new_ids:
      clean_new_ids.append(cid)
  ```
- `/submit-daily-report`:
  Already takes `List[str]` for `outcome_assigned_ids` and `fdc_provided_ids`, so 8-digit IDs are natively stored with zero friction.

### 5.4 Dedicated Excel Generation Endpoint:
- `@app.get("/admin/reports/medicine-consumption")`:
  - Query parameters: `month` (e.g. `2026-09`), `district` (e.g. `Buxar` or `All`), `format` (`xlsx` or `csv`).
  - Guarded by `asyncio.Semaphore(1)` (`KPI_EXCEL_SEMAPHORE`).
  - Sub-Admin RBAC filtering enforced.
  - Builds two sheets in the workbook:
    1. **Detailed Patient Consumption**: Line-by-line patient entries (`Date`, `District`, `FO Name`, `Nikshay ID (8 or 9 digits)`, `Patient Name`, `Category`, `Weight`, `Phase`, `Regimen`, `Daily Dose`, `Strips`).
    2. **FO & District Summary**: Aggregated strips and patient counts per FO and per district.
  - Releases workbook memory immediately via `gc.collect()`.

---

## 6. Admin Dashboard Integration (`AdminDashboard.jsx`)

### 6.1 Reports & Export Studio:
- Add tab **`💊 Medicine Consumption`** alongside `kpi_workbooks`, `state_matrix`, etc.
- **Controls**:
  - Month picker (`month`).
  - District selector (Single, Multi-district, or Permitted).
  - Download Button with `isDownloadingMedicineReport` loading lock.
- **On-Screen Executive Summary Table**:
  - Table displaying: `District` | `FO Name` | `Total Patients Given FDC` | `Adult IP` | `Adult CP` | `Pediatric IP` | `Pediatric CP` | `Total Strips Distributed`.

### 6.2 Admin Modals (Edit Day & Feed Data) 8-Digit Support:
- `EditDayModal`: Textarea parsing and live preview count accept both 8 and 9 digits for `fdc_provided_ids` and `outcome_assigned_ids`.
- `AdminFeedModal`: Validation accepts 8 and 9-digit numbers for `fdc_provided_ids` and `outcome_assigned_ids`.

---

## 7. Staff Lifecycle, Deletion Synchronization & Attendance Radar Protection

### 7.1 The Problem Solved:
Previously, deleting a staff member in `/admin/staff/delete` performed a raw `doc.delete()`. However:
1. `staff_directory_snapshot.json` on disk was not updated, causing deleted staff to intermittently revive upon server restart or cache expiry.
2. In the **Attendance Radar**, when calculating expected rosters for days *after* deletion, deleted staff were still expected or treated as missing/defaulters indefinitely, while their past reports risked being orphaned if historical lookups relied on the live directory.

### 7.2 Solution Architecture:
1. **Soft-Delete Lifecycle Model in Firestore `staff_directory`**:
   - Instead of blind hard-deletion, deactivating an officer marks:
     ```json
     {
       "status": "inactive",
       "is_active": false,
       "deleted_at": "YYYY-MM-DD",
       "deleted_by": "admin_username",
       "updated_at": "YYYY-MM-DD HH:MM:SS"
     }
     ```
2. **Attendance Radar Date-Aware Evaluation**:
   - In both `/admin/today-attendance` and client-side `deriveAttendanceFromRecords(targetDate)`:
     - When inspecting attendance for a given `targetDate`:
       * If `staff.is_active === false` and `staff.deleted_at`:
         - **If `targetDate > staff.deleted_at`**: The officer is **EXCLUDED** from the expected staff roster. They will NEVER appear as a Defaulter/Missing FO on any future date after their deactivation!
         - **If `targetDate <= staff.deleted_at`**: The officer was active on that date. Their past attendance is preserved 100%. If they submitted a report, it is counted as submitted.
3. **Synchronized Disk Snapshot & Cache Purge**:
   - Whenever a staff member is added, edited, or deactivated:
     - In-memory caches `staff_directory_list`, `admin_staff_full_list_*`, and `attendance_*` are immediately purged.
     - `staff_directory_snapshot.json` is re-written on disk with ONLY currently active staff.
     - Mobile `/staff-directory` only streams records where `is_active !== false` and `status !== "inactive"`.

---

## 8. Staff Designation Management

### 8.1 Schema & Field Requirements:
- Every staff record stores:
  - `designation`: `str` (e.g., `Field Officer (FO)`, `District Coordinator (DC)`, `Senior Treatment Supervisor (STS)`, `TB Health Visitor (TBHV)`, `Lab Technician`). Default: `"Field Officer (FO)"`.
- When creating a new staff member via `/admin/staff/add`:
  - `designation` is a selectable dropdown with standard NTEP roles + custom text option.

### 8.2 Edit Designation & PIN in Admin Dashboard:
- Update existing PIN Reset modal to a combined **"Edit Staff Details"** modal:
  - Edit **Designation** (Dropdown: `Field Officer (FO)`, `District Coordinator (DC)`, `Senior Treatment Supervisor (STS)`, `TB Health Visitor (TBHV)`, etc.).
  - Edit **PIN** (4-digit numeric).
  - Edit **Target** (optional monthly notification target).
- Backend endpoint:
  - `/admin/staff/update-details`:
    - Validates Sub-Admin district RBAC.
    - Updates `designation`, `pin`, `target`, and `updated_at`.
    - Purges relevant cache keys.
- Staff Directory & PIN Management table displays:
  - Columns: `District` | `Officer Name` | `Designation (Badge)` | `PIN` | `Status (Active)` | `Actions` (`✏️ Edit Details`, `🗑️ Deactivate`).

---

## 9. Verification & Safety Battery

Following the project's **`GEMINI.md` Golden Rules**:
1. **Python Compilation**: `python -m py_compile main.py` (Exit code 0).
2. **Backend Unit Tests**: Automated script testing:
   - `/admin/reports/medicine-consumption` Excel export.
   - 8-digit ID ingestion in `/admin/feed-officer-data` and `/admin/reports/edit-day`.
   - Staff deactivation: verifies deleted staff is excluded from future attendance dates but preserved in past dates.
   - Staff designation update endpoint.
3. **Frontend Production Build**: `npm run build` in `dfy-frontend/` (Exit code 0).
4. **ESLint**: `npm run lint` in `dfy-frontend/` (0 errors).
5. **Runtime TDZ & Scope Safety Check**: Ensure all new hooks and calculations are declared strictly after base states and dependencies.
6. **Git Audit**: Detailed `git diff` review before requesting user push approval.
