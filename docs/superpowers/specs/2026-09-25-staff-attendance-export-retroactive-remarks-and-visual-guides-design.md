# Staff Attendance Workbook, Retroactive Remarks, Bulletin Fix & Visual Flowcharts Specification

**Document Version:** 1.0.0  
**Date:** 2026-09-25  
**Author:** Antigravity Engineering  
**Status:** Approved for Implementation Planning  
**Target Branch:** `main`  

---

## 1. Overview & Business Objectives

This engineering specification details the implementation of five core enhancements to the DFY TB MIS platform:

1. **Report Studio Overhaul**: Remove the legacy "Field Officer Monthly Appraisal & TA/DA Dossier" and replace it with a comprehensive **Monthly Staff Attendance (.xlsx)** export featuring:
   - **Dual-Sheet Architecture**:
     - *Sheet 1: Monthly Attendance Matrix*: Field officers by row, Days 1..31 by column with standardized attendance codes (`P`, `ML`, `CL`, `OD`, `A`, `WO`, `H`), followed by summary counters (Total Days, Total Present, Total Leaves, Total Absent, Total Travel KM, and Admin Remarks).
     - *Sheet 2: Detailed Daily Activity Log*: Day-by-day record of each officer's reported IDs, visited facilities, travel distance, and admin notes.
   - **Queueing & Multi-District Download**: Multi-district selection deck with Scoped ZIP archive and Sequential Queue download (1 district at a time, 1s cooldown, memory guard) to protect Render cloud RAM.
2. **Retroactive Admin Attendance Remarks & Leave Overrides**:
   - Enable Admins to add inspection notes or mark leaves on **any past or present day** directly from Attendance Radar (Submitted, Defaulters, or On-Leave tabs) and the Raw Records table.
   - **Dual-Action Support**: Admin can either (A) attach an inspection note while keeping the report submitted, or (B) override the day to Leave/Absent with an explanation.
   - Immediately synchronizes to the FO App, where the officer's profile calendar displays the admin's remarks and updated color coding.
3. **Report Studio WhatsApp Bulletin Fix**:
   - Fix the broken/empty data generation by introducing `canonicalize_district` matching across raw records and targets.
   - Replace the truncated static preview box with a fully reactive preview rendering the complete state leaderboard, total indicators, and 1-tap copy/share buttons.
4. **Visual Flowcharts & Interactive Diagrams in SOPs & Guides**:
   - Transform text-heavy guides into responsive **Native Bento Flowcharts** with step connectors, status badges, and illustrated workflow nodes in:
     - **FO App Guide**: Step-by-step reporting lifecycle, Patient Journey & direct dial, Attendance color decoding.
     - **Admin SOP**: Morning/evening attendance monitoring, Nikshay Excel reconciliation, and retroactive attendance editing.
5. **Admin Changelog & FO Guide Updates**:
   - Release notes documented in `changelogData.js` (v2.8.2).
   - **Zero-Leakage Constraint**: The Stealth 10:00 AM Reporting Cutoff is strictly omitted from the FO Guide to prevent staff exploitation.

---

## 2. Technical Architecture & Interfaces

### 2.1 Backend Staff Attendance Export (`/admin/export-staff-attendance`)

#### Route Definition:
`GET /admin/export-staff-attendance`
- **Query Parameters**:
  - `month`: Format `YYYY-MM` (e.g. `2026-09`). Default: current IST month.
  - `district`: Optional single district name (e.g. `Muzaffarpur`).
  - `districts`: Optional comma-separated list of permitted districts (for Sub-Admins).
- **Security & RBAC**:
  - Requires valid Admin JWT token via `get_current_admin`.
  - Sub-Admins are strictly restricted to their `allowed_districts`. Attempting to access unauthorized districts returns HTTP 403.
- **Concurrency & Memory Safeguard**:
  - Protected by `asyncio.Semaphore(1)` to ensure only one Excel generation runs concurrently.
  - Releases raw DataFrames and runs `gc.collect()` immediately after streaming.

#### Excel Workbook Structure:

```
DFY_Staff_Attendance_<District>_<Month>.xlsx
├── Sheet 1: "Attendance Matrix"
│   ├── Headers: SL | District | Officer Name | Designation | 1 | 2 | 3 ... 31 | Total Days | Present | Leaves | Absent | Travel KM | Remarks
│   ├── Cells: P (Present) | ML (Medical) | CL (Casual) | OD (Official Duty) | A (Absent) | WO (Weekly Off) | H (Holiday)
│   └── Styles: Emerald fill for P, Amber for ML, Sky for CL, Indigo for OD, Rose for A, Slate for WO/H.
└── Sheet 2: "Daily Activity Log"
    ├── Headers: Date | District | Officer Name | Status | Total IDs | Notifications | Tests | DBT | Travel KM | Visited Doctors | Admin Remark
    └── Auto-filtered table with borders and frozen header pane.
```

### 2.2 Retroactive Admin Remarks & Leave Override Engine

#### Route Definition:
`POST /admin/attendance/add-remark`
- **Payload Schema**:
  ```json
  {
    "district": "Muzaffarpur",
    "fo_name": "Rahul Kumar",
    "date": "2026-09-22",
    "action": "remark", // "remark" or "override_leave"
    "remark": "Field verified with Dr. Sharma. 3 IDs confirmed.",
    "status": "submitted", // "submitted", "leave", "absent"
    "reason_type": "Medical" // optional if action === "override_leave"
  }
  ```
- **Execution Flow**:
  1. Canonicalize district and clean FO name. Check Sub-Admin district authorization.
  2. If `action == "remark"`:
     - Updates/creates entry in `daily_staff_leaves` or attaches `admin_remark` on the day's record in `daily_field_reports`.
     - In-memory cache update: updates `shared_raw_month_{month}` so admin UI reflects the remark instantly.
  3. If `action == "override_leave"`:
     - Writes to `daily_staff_leaves` with `status: req.status`, `reason_type: req.reason_type`, `remark: req.remark`.
  4. Cache Invalidation:
     - Purges `cache.delete_prefix("attendance_")`
     - Purges `cache.delete_prefix("profile_")`
  5. Audit Log:
     - Records activity in `admin_activity_logs` (`ATTENDANCE_REMARK_ADDED` or `ATTENDANCE_OVERRIDDEN`).

#### Profile Stats Hydration (`/my-profile-stats`):
- `daily_history[date]` receives:
  ```json
  {
    "is_leave": true,
    "status": "leave",
    "reason_type": "Casual",
    "remark": "Admin remark text",
    "marked_by": "Admin Saurav",
    "admin_remark": "Admin remark text"
  }
  ```
- If a submitted day has an admin remark without leave override:
  `daily_history[date]["admin_remark"] = remark`
  The FO profile calendar displays the remark in an alert box below the day summary.

### 2.3 Report Studio WhatsApp Bulletin Fix

#### Root Cause:
1. `AdminDashboard.jsx` previously had a static 4-line string in the bulletin preview container (`bg-slate-900`) instead of binding to the live generated text.
2. In `copyWhatsAppBulletin`, district record aggregation used strict string equality (`r.working_place === dist`) which failed for aliased or uncapped names.

#### Solution:
1. Create a reactive `useMemo` named `liveWhatsAppBulletin`:
   - Aggregates records using `canonicalizeDistrict(r.working_place) === dist`.
   - Computes state totals, targets, percentage achievements, and sorted leaderboard.
   - Generates clean WhatsApp-ready formatted text with emoji accents.
2. Render `liveWhatsAppBulletin` directly in the Report Studio preview container with scrollable viewport.
3. Provide two distinct CTAs:
   - 📋 `Copy Bulletin`: Copies formatted text to clipboard with confirmation toast.
   - 💬 `Open in WhatsApp Web`: Opens `https://wa.me/?text=...` in a new tab.

---

## 3. Visual Flowcharts & Guide Specifications

### 3.1 Field Officer Guide (`App.jsx`) - Native Bento Flowcharts

1. **Daily Field Reporting Lifecycle**:
   ```
   [Morning Field Work] ──▶ [Doctor & Patient Visit] ──▶ [Evening ID Logging]
          │                                                    │
          ▼                                                    ▼
   [Travel KM Entry] ◀─── [Duplicate Detection Guard] ◀─── [Review & Submit]
          │
          ▼
   [Instant Calendar Confirmation (Green Badge)]
   ```
2. **Patient Journey & Contact Workflow**:
   ```
   [Nikshay ID Search] ──▶ [Verification Shield (Lock Icon)] ──▶ [1-Tap 📞 Direct Call]
          │                                                            │
          ▼                                                            ▼
   [Clinical Milestones Tracked]                             [Poshan DBT Seeding Status]
   ```
3. **Leave & Attendance Color Matrix**:
   - Visual cards explaining what each color badge means on the calendar.
   - Explanation of Admin Remarks: how to read supervisor feedback and approved leave notes.

### 3.2 Admin SOP (`AdminDashboard.jsx`) - Native Bento Flowcharts

1. **Morning & Evening Attendance Monitoring**:
   ```
   [Open Attendance Radar] ──▶ [Inspect On-Time / Late Chips] ──▶ [Review Defaulters]
          │                                                            │
          ▼                                                            ▼
   [1-Click WhatsApp Reminder]                               [Add Remark / Mark Leave]
   ```
2. **Nikshay Reconciler & Direct Patient Contact**:
   ```
   [Upload Nikshay Excel] ──▶ [Automatic Header Match] ──▶ [Monotonic Ledger Sync]
          │                                                       │
          ▼                                                       ▼
   [Actionable Pending Lists]                               [1-Tap Call Patient from Drawer]
   ```
3. **Historical Attendance Corrections & Monthly Export**:
   ```
   [Select Past Date in Radar] ──▶ [Attach Remark / Leave] ──▶ [FO Calendar Live Sync]
          │
          ▼
   [Report Studio: Multi-District Queue] ──▶ [Dual-Sheet Attendance Workbook (.xlsx)]
   ```

---

## 4. Verification Battery & Testing Strategy

1. **Backend Unit & Integration Tests**:
   - `tests/test_staff_attendance_export.py`:
     - Test single district export.
     - Test Sub-Admin district permission filtering.
     - Test Dual-Sheet workbook structure: Sheet 1 (Matrix) and Sheet 2 (Activity Log).
     - Test status codes (`P`, `ML`, `CL`, `OD`, `A`, `WO`).
   - `tests/test_retroactive_attendance_remarks.py`:
     - Test adding remark to submitted day without voiding submission.
     - Test overriding submitted day to leave/absent with admin remark.
     - Test `/my-profile-stats` hydration of admin remarks.
2. **Frontend UI Tests**:
   - `tests/test_staff_attendance_ui.mjs`:
     - Verify Report Studio renders "Staff Attendance (.xlsx)" tab with district chips and queue progress.
     - Verify legacy Dossier tab is completely removed.
   - `tests/test_whatsapp_bulletin_fix.mjs`:
     - Verify reactive bulletin text contains all districts and dynamic percentages.
   - `tests/test_visual_flowcharts_ui.mjs`:
     - Verify bento flowcharts render in FO Guide and Admin SOP.
     - Verify Stealth 10 AM cutoff is **absent** from FO Guide.
3. **Production Protocol Checks**:
   - `python -m py_compile main.py` exit code 0.
   - `pytest tests/` 100% pass.
   - `npm run lint` 0 errors.
   - `npm run build` exit code 0.
