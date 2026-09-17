# TB FDC Medicine Distribution, 8-Digit ID Clause & Staff Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement TB FDC medicine distribution logging with automated weight-band dosage calculations in FO reporting, enable 8-digit legacy ID ingestion for FDC & Outcome, build a 2-sheet Medicine Consumption Report studio, and implement soft-delete staff lifecycle synchronization with designation management.

**Architecture:** 
- Pure function `utils/fdcCalculator.js` calculates dosage reactively based on NTEP guidelines.
- Inline smart dosage expansion in `App.jsx` (`FdcBucket`) captures patient details without creating new collections (stored in `daily_field_reports.fdc_details`).
- 8-digit and 9-digit support for FDC and Outcome across `App.jsx`, `AdminDashboard.jsx`, and `main.py`.
- Semaphore-guarded Excel generation endpoint `/admin/reports/medicine-consumption` in `main.py` with Reports Studio UI in `AdminDashboard.jsx`.
- Soft-delete staff lifecycle with date-aware attendance evaluation ensuring deleted staff never appear in future defaulters while preserving historical records.

**Tech Stack:** React 19, Tailwind CSS, Vite, FastAPI, Python 3.11, Google Cloud Firestore, openpyxl.

**Spec:** [`docs/superpowers/specs/2026-09-17-fdc-medicine-distribution-design.md`](file:///d:/ignou/Mis%20field%20report/docs/superpowers/specs/2026-09-17-fdc-medicine-distribution-design.md)

## Global Constraints
- THIS APPLICATION IS LIVE IN PRODUCTION. Zero tolerance for runtime crashes, blank screens, or data loss.
- Zero Firestore read/write amplification: FDC details live inside existing `daily_field_reports.fdc_details`.
- Render RAM protection: Excel exports must use `KPI_EXCEL_SEMAPHORE = asyncio.Semaphore(1)` with explicit `gc.collect()`.
- Temporal Dead Zone (TDZ) prevention: Any new state or hook must strictly be declared after its dependencies.
- No push to `origin/main` without explicit user approval.

---

### Task 1: Standalone FDC Dosage Calculation Engine (`utils/fdcCalculator.js`)

**Files:**
- Create: `dfy-frontend/src/utils/fdcCalculator.js`
- Test: `scratch/test_fdc_calculator.js`

**Interfaces:**
- Produces: `calculateFdcDosage(patientType, weightKg, phase)` returning:
  `{ isValid, error, regimenName, weightBand, dailyDoseText, supplyIssued, dailyTablets, strips, phaseText }`

- [ ] **Step 1: Write the automated test script for all adult and pediatric weight bands**

Create `scratch/test_fdc_calculator.js` testing:
- Adult IP 28kg -> 4 FDC, 2 tabs, 4 strips
- Adult CP 42kg -> 3 FDC, 3 tabs, 12 strips
- Adult IP 55kg -> 4 FDC, 4 tabs, 8 strips
- Adult CP 70kg -> 3 FDC, 5 tabs, 20 strips
- Adult IP 80kg -> 4 FDC, 6 tabs, 12 strips
- Adult < 25kg -> Invalid error
- Pediatric IP 6kg -> 1 tab HRZ + 1 tab E, 1 strip HRZ + 1 strip E
- Pediatric CP 10kg -> 2 tabs HR + 2 tabs E, 2 strips HR + 2 strips E
- Pediatric IP 14kg -> 3 tabs HRZ + 3 tabs E, 3 strips HRZ + 3 strips E
- Pediatric CP 20kg -> 4 tabs HR + 4 tabs E, 4 strips HR + 4 strips E
- Pediatric IP 27kg -> 3 tabs HRZ + 1 Adult 4 FDC + 3 tabs E
- Pediatric CP 35kg -> 2 tabs HR + 2 Adult 3 FDC + 2 tabs E
- Pediatric < 4kg -> Invalid error

- [ ] **Step 2: Run test to verify it fails before implementation**

Run: `node scratch/test_fdc_calculator.js`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `dfy-frontend/src/utils/fdcCalculator.js`**

Implement complete pure dosage calculator conforming strictly to the NTEP matrices with zero external dependencies.

- [ ] **Step 4: Run test to verify 100% pass**

Run: `node scratch/test_fdc_calculator.js`
Expected: PASS (All test assertions match)

- [ ] **Step 5: Commit**

```bash
git add dfy-frontend/src/utils/fdcCalculator.js
git commit -m "feat: implement pure FDC dosage calculation engine for adult and pediatric weight bands"
```

---

### Task 2: FO Mobile Form Integration & 8-Digit Clause (`dfy-frontend/src/App.jsx`)

**Files:**
- Modify: `dfy-frontend/src/App.jsx`
- Test: `npm run build` & `npm run lint` in `dfy-frontend/`

**Interfaces:**
- Consumes: `calculateFdcDosage` from `./utils/fdcCalculator.js`
- Enhances:
  - `FdcBucket`: Option A inline smart card with patient name, category toggle, weight input, phase toggle, live dosage badge.
  - `FdcBucket`: Accepts both 8-digit and 9-digit numeric IDs (`\b\d{8,9}\b`).
  - `IdBucket`: Accepts prop `allow8Digit` (passed as `cat.key === 'outcome_assigned_ids'`) accepting `\b\d{8,9}\b`.

- [ ] **Step 1: Update `IdBucket` in `App.jsx` to accept `allow8Digit`**
  - Update regex to `allow8Digit ? /\b\d{8,9}\b/g : /\b\d{9}\b/g`.
  - Update single ID validator to `allow8Digit ? ((raw.length === 8 || raw.length === 9) && !isNaN(raw)) : (raw.length === 9 && !isNaN(raw))`.
  - Update placeholder and toast message dynamically.
  - Pass `allow8Digit={cat.key === 'outcome_assigned_ids'}` when rendering `group2`.

- [ ] **Step 2: Upgrade `FdcBucket` in `App.jsx` with Option A Inline Smart Card**
  - Import `calculateFdcDosage` from `./utils/fdcCalculator.js`.
  - Accept 8-digit and 9-digit IDs (`\b\d{8,9}\b` and `len in [8, 9]`).
  - Add inline smart form state: `patientName`, `patientCategory` (`adult` / `pediatric`), `weightKg`, `phase` (`IP` / `CP`).
  - Evaluate `calculateFdcDosage` reactively and display live computed dosage badge.
  - In `handleAddFdc`: Store enriched object:
    `{ id, patient_name, patient_type, weight_kg, weight_band, phase, regimen_name, daily_dose_text, supply_issued, strips }`.
  - Keep Quick Add fallback intact for fast entry.

- [ ] **Step 3: Verify frontend build and lint**

Run: `npm run build` and `npm run lint` in `dfy-frontend/`.
Expected: Exit code 0, 0 syntax errors.

- [ ] **Step 4: Commit**

```bash
git add dfy-frontend/src/App.jsx
git commit -m "feat: add inline smart FDC dosage card and 8-digit ID support in FO mobile form"
```

---

### Task 3: Backend 8-Digit Validation & Excel Medicine Consumption Export (`main.py`)

**Files:**
- Modify: `main.py`
- Test: `scratch/test_backend_fdc_and_8digit.py`

**Interfaces:**
- Updates:
  - `/admin/feed-officer-data`: Allow 8 or 9 digits for `fdc_provided_ids` and `outcome_assigned_ids`.
  - `/admin/reports/edit-day`: Allow 8 or 9 digits for `fdc_provided_ids` and `outcome_assigned_ids`.
- Produces:
  - `@app.get("/admin/reports/medicine-consumption")`: accepts `month`, `district`, `admin` dependency. Guarded by `KPI_EXCEL_SEMAPHORE`. Generates 2-sheet Excel (`Detailed Patient Consumption` + `FO & District Summary`).

- [ ] **Step 1: Write backend automated test script**

Create `scratch/test_backend_fdc_and_8digit.py` testing:
- 8-digit and 9-digit ID acceptance in `/admin/feed-officer-data`.
- 8-digit ID rejection on other categories (e.g. `notification_ids` still requires 9 digits).
- `/admin/reports/medicine-consumption` authentication guard (401/403).
- `/admin/reports/medicine-consumption` Excel generation response (200, valid application/vnd.openxmlformats-officedocument.spreadsheetml.sheet).

- [ ] **Step 2: Update validation in `main.py`**
  - In `/admin/feed-officer-data`: allow `len in [8, 9]` for `fdc_provided_ids` and `outcome_assigned_ids`.
  - In `/admin/reports/edit-day`: allow `len in [8, 9]` for `fdc_provided_ids` and `outcome_assigned_ids`.

- [ ] **Step 3: Implement `/admin/reports/medicine-consumption` in `main.py`**
  - Extract cached records from `get_shared_raw_month_records(month)`.
  - Apply Sub-Admin district RBAC filtering.
  - Build openpyxl workbook with 2 sheets:
    1. `Detailed Patient Consumption`: `Date`, `District`, `FO Name`, `Nikshay ID`, `Patient Name`, `Category`, `Weight (kg)`, `Phase`, `Regimen`, `Daily Dose`, `Strips Issued`.
    2. `FO & District Summary`: Grouped counts by FO and District.
  - Guard with `KPI_EXCEL_SEMAPHORE` and `gc.collect()`.

- [ ] **Step 4: Run test script & compilation**

Run: `python -m py_compile main.py` and `python scratch/test_backend_fdc_and_8digit.py`.
Expected: Code 0, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add main.py
git commit -m "feat: add 8-digit ID validation for FDC/Outcome and semaphore-guarded medicine consumption Excel export"
```

---

### Task 4: Admin Dashboard Medicine Consumption Studio & Modals 8-Digit Support (`dfy-frontend/src/AdminDashboard.jsx`)

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx`
- Test: `npm run build` & `npm run lint` in `dfy-frontend/`

**Interfaces:**
- Produces:
  - Tab `💊 Medicine Consumption` in Reports & Export Studio (`reportsStudioTab === "medicine_consumption"`).
  - Executive summary table & download button with `isDownloadingMedicineReport` anti-double-tap lock.
  - `EditDayModal`: Textarea parsing and live count allow 8 or 9 digits for FDC and Outcome.
  - `AdminFeedModal`: Allows 8 or 9 digits for FDC and Outcome.

- [ ] **Step 1: Update 8-digit parsing in `EditDayModal` and `AdminFeedModal`**
  - In `handleExecuteEditDay`: Allow length 8 or 9 for `fdc_provided_ids` and `outcome_assigned_ids`.
  - In `EditDayModal` preview count: Count length 8 or 9 for FDC and Outcome.
  - In `AdminFeedModal`: Validate length 8 or 9 for FDC and Outcome.

- [ ] **Step 2: Add `medicine_consumption` tab in Reports & Export Studio**
  - Add tab pill: `{ id: 'medicine_consumption', label: 'Medicine Consumption', icon: '💊' }`.
  - Add handler `handleDownloadMedicineReport`: calls `/admin/reports/medicine-consumption` with `month` and selected district, managing `isDownloadingMedicineReport` state.
  - Render on-screen summary table: `District` | `FO Name` | `Total Patients` | `Adult IP` | `Adult CP` | `Pediatric IP` | `Pediatric CP` | `Total Strips`.
  - Render export card with Download Button.

- [ ] **Step 3: Verify build, lint, and TDZ declaration safety**

Run: `npm run build` and `npm run lint` in `dfy-frontend/`.
Expected: Code 0, zero lint errors, no TDZ issues.

- [ ] **Step 4: Commit**

```bash
git add dfy-frontend/src/AdminDashboard.jsx
git commit -m "feat: add Medicine Consumption Studio in Admin Dashboard and 8-digit modal parsing"
```

---

### Task 5: Staff Lifecycle, Deletion Synchronization & Attendance Radar (`main.py` & `AdminDashboard.jsx`)

**Files:**
- Modify: `main.py`
- Modify: `dfy-frontend/src/AdminDashboard.jsx`
- Test: `scratch/test_staff_lifecycle.py`

**Interfaces:**
- Updates:
  - `/admin/staff/delete`: Marks `status = "inactive"`, `is_active = False`, `deleted_at = today_str`, updates `staff_directory_snapshot.json` on disk, purges caches.
  - `GET /staff-directory`: Streams only `is_active !== False` and `status !== "inactive"`.
  - `/admin/today-attendance` & `deriveAttendanceFromRecords(targetDate)`:
    - Exclude staff if `targetDate > staff.deleted_at`.
    - Include staff if `targetDate <= staff.deleted_at`.

- [ ] **Step 1: Write automated test for staff lifecycle**

Create `scratch/test_staff_lifecycle.py` testing:
- Soft-delete marks document as inactive with `deleted_at`.
- Active directory excludes deleted staff.
- Attendance query for date *after* `deleted_at` does NOT include officer in expected/defaulters.
- Attendance query for date *before* or *on* `deleted_at` DOES preserve officer in expected/historical logs.

- [ ] **Step 2: Implement soft-delete and snapshot sync in `main.py`**
  - Update `delete_staff_member` in `main.py` to update document with `status: "inactive"`, `is_active: False`, `deleted_at: datetime.now().strftime("%Y-%m-%d")`.
  - Re-generate `staff_directory_snapshot.json` with active staff only.
  - In `get_staff_directory` and `get_today_attendance`, filter out inactive staff where `targetDate > deleted_at`.

- [ ] **Step 3: Update `deriveAttendanceFromRecords` in `AdminDashboard.jsx`**
  - When evaluating expected roster for `targetDate`:
    Exclude staff who have `is_active === false` and `deleted_at && targetDate > deleted_at`.
    Preserve staff who were active on or before `deleted_at`.

- [ ] **Step 4: Run tests & verify**

Run: `python -m py_compile main.py` and `python scratch/test_staff_lifecycle.py`.
Run: `npm run build` in `dfy-frontend/`.
Expected: Code 0, all assertions pass.

- [ ] **Step 5: Commit**

```bash
git add main.py dfy-frontend/src/AdminDashboard.jsx
git commit -m "feat: implement soft-delete staff lifecycle with date-aware attendance defaulter exclusion"
```

---

### Task 6: Staff Designation Management (`main.py` & `AdminDashboard.jsx`)

**Files:**
- Modify: `main.py`
- Modify: `dfy-frontend/src/AdminDashboard.jsx`
- Test: `scratch/test_designation_management.py`

**Interfaces:**
- Produces:
  - Endpoint: `POST /admin/staff/update-details` (updates `pin`, `designation`, `target`).
  - Admin UI: Combined "Edit Staff Details" modal for editing both PIN and Designation.
  - Admin UI: Designation dropdown in "Add Staff" modal.
  - Table: Displays Designation badge for each staff member in Staff Directory and Attendance lists.

- [ ] **Step 1: Implement `/admin/staff/update-details` in `main.py`**
  - Pydantic model `UpdateStaffDetailsReq`: `district`, `name`, `new_pin: Optional[str]`, `designation: Optional[str]`, `target: Optional[int]`.
  - Validates Sub-Admin RBAC.
  - Updates fields in `staff_directory` document.
  - If `target` provided, updates `staff_targets` document.
  - Purges caches.

- [ ] **Step 2: Update Staff Management UI in `AdminDashboard.jsx`**
  - Add `designation` dropdown in "Add Staff" modal (`Field Officer (FO)`, `District Coordinator (DC)`, `Senior Treatment Supervisor (STS)`, `TB Health Visitor (TBHV)`, `Lab Technician`).
  - Upgrade PIN Reset modal to "Edit Staff Details" modal with Designation and PIN fields.
  - Add Designation badge column in Staff Directory table.
  - Show Designation badge in Attendance Radar cards.

- [ ] **Step 3: Verify build, lint, and compilation**

Run: `python -m py_compile main.py`.
Run: `npm run build` and `npm run lint` in `dfy-frontend/`.
Expected: Code 0, zero lint errors.

- [ ] **Step 4: Commit**

```bash
git add main.py dfy-frontend/src/AdminDashboard.jsx
git commit -m "feat: add staff designation editing and management across admin dashboard"
```

---

### Task 7: Comprehensive Production Verification Battery

- [ ] **Step 1: Python Compilation**: `python -m py_compile main.py`
- [ ] **Step 2: Backend Automated Test Scripts**: Run all scratch tests (`test_backend_fdc_and_8digit.py`, `test_staff_lifecycle.py`, etc.).
- [ ] **Step 3: Frontend Production Build**: `npm run build` in `dfy-frontend/`
- [ ] **Step 4: Frontend Linter**: `npm run lint` in `dfy-frontend/`
- [ ] **Step 5: Runtime AST & TDZ Safety Scan**: Confirm 0 variables accessed before lexical initialization.
- [ ] **Step 6: Git Diff Audit**: Inspect `git diff` against `origin/main` to confirm only intended changes are present.
- [ ] **Step 7: Present evidence to user for Push Approval**.
