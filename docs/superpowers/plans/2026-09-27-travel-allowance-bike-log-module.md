# Travel Allowance (TA) & Bike Log Management Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a complete, tamper-proof, and audit-ready Travel Allowance (TA) & Bike Log Management module with strict RBAC, 1-click pre-fill from daily reports, ₹4.00/KM rate, admin month-end deductions, multi-sheet Excel (.xlsx) export, and presentation-ready mobility analytics.

**Architecture:** Data is stored in Firestore under atomic monthly staff documents (`travel_allowance_logs/{year_month}_{district}_{staff_key}`). FastAPI backend provides RBAC-guarded endpoints for saving, calculating, pre-filling, and generating multi-sheet Excel workbooks with `openpyxl` under concurrency semaphores. React frontend provides a full Admin TA Studio in `AdminDashboard.jsx` and a strictly Read-Only ledger in `App.jsx` for Field Officers.

**Tech Stack:** Python 3.14, FastAPI, Firestore, openpyxl, React 19, Tailwind CSS, Lucide icons, Vite, PWA.

**Spec:** `docs/superpowers/specs/2026-09-27-travel-allowance-bike-log-module-design.md`

## Global Constraints
- Target Version: v2.8.5.
- Fixed Rate: Strictly ₹4.00 / KM.
- Immutability: FOs have 100% Read-Only access. All inputs strictly disabled in FO view.
- Sub-Admin Isolation: Sub-Admins cannot view, mutate, or export TA logs outside permitted districts.
- Memory & Concurrency: Multi-sheet Excel generation must be guarded by `asyncio.Semaphore(1)` and explicit `gc.collect()`.
- Production Stability: Zero runtime crashes, white screens, data corruption, or TDZ reference errors.
- Branch Isolation: All work developed on `feat/travel-allowance-bike-log` branch, kept isolated from `main` until October 1st rollout.

---

### Task 1: Backend TA Data Models, Calculation Engine & CRUD Endpoints in `main.py`

**Files:**
- Create: `tests/test_travel_allowance_backend.py`
- Modify: `main.py`

**Interfaces:**
- Consumes: `get_current_admin`, `get_optional_admin`, `canonicalize_district`, `log_admin_activity`, `cache`.
- Produces:
  - Models: `DailyTaEntry`, `SaveTaLogRequest`.
  - Endpoints:
    - `GET /api/ta-logs`
    - `POST /api/ta-logs/save`
    - `POST /api/ta-logs/prefill-from-reports`
    - `GET /api/ta-logs/analytics`

- [x] **Step 1: Write the failing test for TA backend endpoints**
  Create `tests/test_travel_allowance_backend.py` asserting:
  - TA calculation at ₹4.00/KM with manual override support.
  - Month-end deductions and net payable calculation (`gross - deduction`).
  - Sub-Admin district RBAC validation.
  - Pre-fill synthesis from `daily_field_reports` (`morning_km`, `evening_km`, `visited_names`).
  - Analytics calculation (YTD project KM, avg daily KM/FO, approved TA amount).

- [x] **Step 2: Run test to confirm failure**
  Run `pytest tests/test_travel_allowance_backend.py -v` (expect 404 / missing endpoints).

- [x] **Step 3: Implement Pydantic models & endpoints in `main.py`**
  - Add `DailyTaEntry` and `SaveTaLogRequest`.
  - Implement `GET /api/ta-logs`, `POST /api/ta-logs/save`, `POST /api/ta-logs/prefill-from-reports`, and `GET /api/ta-logs/analytics`.
  - Enforce Sub-Admin allowed districts and log admin mutations.

- [x] **Step 4: Run tests to verify passing**
  Run `pytest tests/test_travel_allowance_backend.py -v` (must pass 100%).
  Run `python -m py_compile main.py` (must exit code 0).

- [x] **Step 5: Commit changes**
  `git commit -m "feat(backend): implement travel allowance data models, calculation engine, and api endpoints"`

---

### Task 2: Multi-Sheet Excel Engine (`/api/ta-logs/export-excel`) in `main.py`

**Files:**
- Create: `tests/test_travel_allowance_excel_export.py`
- Modify: `main.py`

**Interfaces:**
- Consumes: `openpyxl`, `asyncio.Semaphore(1)`, `gc.collect()`, `travel_allowance_logs`.
- Produces: `GET /api/ta-logs/export-excel` returning `.xlsx` stream.

- [x] **Step 1: Write the failing test for Excel export**
  Create `tests/test_travel_allowance_excel_export.py` asserting:
  - Sheet 1 is named "DASHBOARD" with correct columns (`Sl. No`, `Employee Name`, `Designation`, `Type of TA`, `Total KM`, `Gross Amount`, `Deductions`, `Deduction Reason`, `Final Payable Amount`).
  - Grand total formula row at bottom.
  - Individual sheets created for each active staff member with day-by-day readings and summary box.
  - Sub-Admin district authorization enforcement.

- [x] **Step 2: Run test to confirm failure**
  Run `pytest tests/test_travel_allowance_excel_export.py -v`.

- [x] **Step 3: Implement `export_travel_allowance_workbook` in `main.py`**
  - Build multi-sheet workbook with `openpyxl`.
  - Apply professional DFY branding, clean borders, header styling, and `=SUM(...)` formulas.
  - Wrap in `asyncio.Semaphore(1)` with explicit `gc.collect()`.

- [x] **Step 4: Run tests to verify passing**
  Run `pytest tests/test_travel_allowance_excel_export.py -v` (must pass 100%).

- [x] **Step 5: Commit changes**
  `git commit -m "feat(excel): add multi-sheet district bike log and ta payroll workbook export"`

---

### Task 3: Admin TA Management Studio & Month-End Reconciliation in `AdminDashboard.jsx`

**Files:**
- Create: `tests/test_admin_ta_studio_ui.mjs`
- Modify: `dfy-frontend/src/AdminDashboard.jsx`

**Interfaces:**
- Consumes: `/api/ta-logs`, `/api/ta-logs/save`, `/api/ta-logs/prefill-from-reports`, `/api/ta-logs/export-excel`.
- Produces: Navigation sub-tab "🛵 Travel & Bike TA Studio", 31-day editable table, Pre-fill button, Month-End Reconciliation card, and Excel download button.

- [x] **Step 1: Write the failing UI test**
  Create `tests/test_admin_ta_studio_ui.mjs` asserting presence of:
  - TA Studio navigation tab and container.
  - District, Month, and Staff dropdown filters.
  - "⚡ Pre-fill from Daily Reports" button.
  - 31-day table with initial/final reading, total KM, override toggle, locations, purpose.
  - Month-End Reconciliation Card with gross, deduction input, deduction reason, net amount, and admin remarks.
  - "Export District TA Workbook (.xlsx)" download button.

- [x] **Step 2: Run UI test to confirm failure**
  Run `node tests/test_admin_ta_studio_ui.mjs`.

- [x] **Step 3: Implement TA Studio in `AdminDashboard.jsx`**
  - Add state hooks for TA data, selected staff, active month, and deduction fields.
  - Build the interactive 31-day table with live calculation (`KM * 4.00`).
  - Add the 1-click pre-fill handler.
  - Add save handler with anti-double-tap loading state and toast feedback.
  - Add Excel download handler.

- [x] **Step 4: Run UI test, lint, and build**
  Run `node tests/test_admin_ta_studio_ui.mjs` (must pass 100%).
  Run `npm --prefix dfy-frontend run lint` (0 syntax errors).
  Run `npm --prefix dfy-frontend run build` (must exit 0).

- [x] **Step 5: Commit changes**
  `git commit -m "feat(ui): add admin travel allowance studio and month-end deduction reconciliation"`

---

### Task 4: Field Officer Read-Only Travel & TA Ledger in `App.jsx`

**Files:**
- Create: `tests/test_fo_ta_readonly_ledger_ui.mjs`
- Modify: `dfy-frontend/src/App.jsx`

**Interfaces:**
- Consumes: `/api/ta-logs?month=...&district=...&staff_key=...`.
- Produces: Read-Only "🛵 My Travel & TA Log" inside `MyProfileDashboard`.

- [x] **Step 1: Write the failing UI test**
  Create `tests/test_fo_ta_readonly_ledger_ui.mjs` asserting:
  - "My Travel & TA Log" card/section present in `MyProfileDashboard`.
  - Month picker for historical inspection.
  - Summary metrics: Total KM, Gross TA, Deductions (with reason), and Net Approved Payout.
  - All input/edit elements strictly disabled (read-only guarantee).

- [x] **Step 2: Run UI test to confirm failure**
  Run `node tests/test_fo_ta_readonly_ledger_ui.mjs`.

- [x] **Step 3: Implement Read-Only TA Ledger in `App.jsx`**
  - Add fetch hook for FO TA record using `formData.working_place`, `formData.fo_name`, and `formData.pin`.
  - Render summary cards and timeline of verified daily travels.
  - Display admin deductions and notes with 100% transparency.

- [x] **Step 4: Run UI test, lint, and build**
  Run `node tests/test_fo_ta_readonly_ledger_ui.mjs` (must pass 100%).
  Run `npm --prefix dfy-frontend run lint` (0 syntax errors).
  Run `npm --prefix dfy-frontend run build` (must exit 0).

- [x] **Step 5: Commit changes**
  `git commit -m "feat(fo): add tamper-proof read-only travel and ta ledger in field officer profile"`

---

### Task 5: Presentation-Ready Mobility Analytics Cards in `AdminDashboard.jsx`

**Files:**
- Create: `tests/test_mobility_analytics_ui.mjs`
- Modify: `dfy-frontend/src/AdminDashboard.jsx`

**Interfaces:**
- Consumes: `/api/ta-logs/analytics`.
- Produces: 3 presentation KPI cards: Total Project KM (YTD), Avg Daily KM / FO, and Total TA Approved (₹).

- [x] **Step 1: Write the failing UI test**
  Create `tests/test_mobility_analytics_ui.mjs` asserting presence of:
  - Project Mobility (YTD) cumulative card.
  - FO Daily Travel Average card.
  - Total TA Approved card.

- [x] **Step 2: Run UI test to confirm failure**
  Run `node tests/test_mobility_analytics_ui.mjs`.

- [x] **Step 3: Implement mobility analytics in `AdminDashboard.jsx`**
  - Fetch analytics data from `/api/ta-logs/analytics`.
  - Render responsive Bento KPI cards in the executive metrics row.

- [x] **Step 4: Run UI test, lint, and build**
  Run `node tests/test_mobility_analytics_ui.mjs` (must pass 100%).
  Run `npm --prefix dfy-frontend run lint` (0 syntax errors).
  Run `npm --prefix dfy-frontend run build` (must exit 0).

- [x] **Step 5: Commit changes**
  `git commit -m "feat(analytics): add presentation-ready frontline mobility and travel allowance kpi cards"`

---

### Task 6: Full Verification Battery, Guide Flowcharts & Version Bump to v2.8.5

**Files:**
- Modify: `dfy-frontend/src/changelogData.js`
- Modify: `dfy-frontend/src/App.jsx` (FO Guide Topic 11)
- Modify: `dfy-frontend/src/AdminDashboard.jsx` (Admin SOP Topic 12)

**Interfaces:**
- Consumes: All completed components.
- Produces: Version 2.8.5, updated changelog, guide flowcharts explaining TA module.

- [x] **Step 1: Bump version to 2.8.5 and add changelog entry**
  Update `dfy-frontend/src/changelogData.js`.

- [x] **Step 2: Add visual Bento flowcharts in Guides**
  - FO Guide: Topic 11 explaining Travel & TA Log inspection.
  - Admin SOP: Topic 12 explaining Bike Log entry, Pre-fill, Deductions, and Excel Export.

- [x] **Step 3: Execute complete Golden Rule verification battery**
  - `python -m py_compile main.py` (Exit code 0).
  - Run all backend test suites (`pytest tests/ -v`).
  - Run all frontend UI test suites (`node tests/...`).
  - `npm --prefix dfy-frontend run lint` (0 syntax errors).
  - `npm --prefix dfy-frontend run build` (Exit code 0).

- [x] **Step 4: Commit changes on branch**
  `git commit -m "chore: complete travel allowance module with guide flowcharts and bump to v2.8.5"`
