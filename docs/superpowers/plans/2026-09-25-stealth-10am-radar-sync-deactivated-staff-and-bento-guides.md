# Stealth 10 AM Radar Sync, Deactivated Staff Roster Defense, Master Table Cohort Docs & Native Bento Visual Flowcharts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement unconditional stealth 10 AM reporting cutoff with next-day morning radar attribution, robust consonant-collapsed deactivation defense for staff rosters, Current vs Previous month cohort tracking for the Documents column in the detailed master table, and convert all topics in both the Field Officer App Guide and the Admin Panel SOP into 100% Native Bento Visual Flowcharts while enforcing zero-leakage privacy.

**Architecture:**
- Backend: Unconditional routing before 10 AM IST to yesterday ($D-1$), with next-day metadata tags in `main.py`. Target-date attendance segregation filtering out < 10 AM reports from today and including them in yesterday's radar. Dual-sheet attendance Excel generator appending `(Next Day Morning)` note in Sheet 1 remarks.
- Data Defense: Dual-defense consonant-collapsed key normalization (`replace(/(.)\1+/g, '$1')`) and direct `staffList` active check preventing deactivated staff (e.g. Purushotam Kumar) from appearing in defaulter or missing lists.
- Cohort Analytics: `tableData` memo tracks `documents_cur` and `documents_prev` for every row, rendering `C:X | P:Y` with full sorting and filter support under `masterTableCohortFilter`.
- Native Bento Flowcharts: Overhaul of `FoHelpGuide` in `App.jsx` and `showAppGuideModal` in `AdminDashboard.jsx` into modular bento cards, step-by-step sequences, color-coded badges, and SVG connectors.
- Privacy & Safety: Zero mention of the 10 AM cutoff in FO Guide. Backward compatibility, anti-double-tap locks, and version bump to `v2.8.3`.

**Tech Stack:**
- Backend: Python 3.14 / FastAPI / Google Cloud Firestore / openpyxl / pytest
- Frontend: React 19 / Vite / Tailwind CSS / Lucide React / Canvas Confetti
- Testing: pytest / TestClient / Node.js ESM test runners

**Spec:** `docs/superpowers/specs/2026-09-25-stealth-10am-radar-sync-deactivated-staff-and-bento-guides-design.md`

## Global Constraints
- Production Environment: Bihar TB MIS is live in production. Zero runtime crashes, white screens, data corruption, or untested deployments.
- Compilation & Lint: `python -m py_compile main.py` must exit 0; `npm --prefix dfy-frontend run lint` must have 0 syntax errors; `npm --prefix dfy-frontend run build` must exit 0.
- Temporal Dead Zone (TDZ): Never reference state or derived variables before their lexical declaration.
- ZERO-LEAKAGE PRIVACY CONSTRAINT: Stealth 10:00 AM cutoff mechanics are strictly internal backend & Admin SOP; NEVER mention 10 AM cutoff in `App.jsx` or FO Guide.
- Anti-Double-Tap & Concurrency: Loading/disabled states on all mutation buttons; `attendance_excel_semaphore = asyncio.Semaphore(1)` and `gc.collect()` on heavy exports.

---

### Task 1: Backend Stealth 10 AM Cutoff Unconditional Routing & Morning Metadata

**Files:**
- Modify: `main.py:1051-1103` (update `resolve_effective_reporting_date`)
- Modify: `main.py:1300-1375` (update `submit_daily_report` to stamp next-day morning metadata)
- Test: `tests/test_stealth_10am_cutoff.py`

**Interfaces:**
- Consumes: `get_ist_now()` from `main.py`
- Produces: `resolve_effective_reporting_date` returning `yesterday_str` unconditionally before 10 AM IST; `submit_daily_report` recording `is_next_day_submission`, `submitted_morning_time`, and `morning_submission_label`

- [ ] **Step 1: Write the failing tests**
  Add unit tests in `tests/test_stealth_10am_cutoff.py` asserting:
  1. Even if yesterday's report document already exists in `daily_field_reports`, submission before 10:00 AM IST returns `yesterday_str`.
  2. Submissions at or after 10:00 AM IST return `today_str`.
  3. Historical edits older than yesterday (e.g. 5 days ago) remain unchanged.
  4. Integration test asserting `submit_daily_report` stamps `is_next_day_submission: True`, `submitted_morning_time: "08:25 AM"`, and `morning_submission_label: "Next day morning 08:25 AM"` when submitted before 10:00 AM IST.

- [ ] **Step 2: Run the test to confirm failure**
  Run: `pytest tests/test_stealth_10am_cutoff.py -v` (assert failure due to existing `if not exists` check).

- [ ] **Step 3: Implement unconditional cutoff and metadata in `main.py`**
  - In `resolve_effective_reporting_date`: Remove the `if not exists` restriction. If `now_ist.hour < 10`, return `yesterday_str` unconditionally.
  - In `submit_daily_report`: If `now_ist.hour < 10` and `report.date_of_reporting == yesterday_str`, stamp `is_next_day_submission = True`, `submitted_morning_time = format_to_ist_time(now_ist)`, and `morning_submission_label = f"Next day morning {submitted_morning_time}"`.

- [ ] **Step 4: Run the test to confirm pass**
  Run: `pytest tests/test_stealth_10am_cutoff.py -v` (must pass 100%).
  Run: `python -m py_compile main.py` (must exit 0).

- [ ] **Step 5: Commit changes**
  Run: `git add main.py tests/test_stealth_10am_cutoff.py; git commit -m "feat(backend): unconditional stealth 10am reporting cutoff with next-day morning metadata"`

---

### Task 2: Backend Attendance Radar Segregation & Excel Generator Next-Day Morning Tag

**Files:**
- Modify: `main.py:2819-3050` (update `/admin/today-attendance` to segregate next-day reports)
- Modify: `main.py:3200-3450` (update `/admin/export-staff-attendance` to tag Sheet 1 remarks)
- Test: `tests/test_today_attendance_cutoff.py`
- Test: `tests/test_staff_attendance_export.py`

**Interfaces:**
- Consumes: `daily_field_reports` documents with timestamps and `is_next_day_submission`
- Produces: `/admin/today-attendance` payload with `is_next_day: True` and `submitted_label: "Next day morning HH:MM AM"`; `/admin/export-staff-attendance` Sheet 1 remarks containing `Submitted next morning (HH:MM AM)`

- [ ] **Step 1: Write the failing tests**
  Create `tests/test_today_attendance_cutoff.py` and update `tests/test_staff_attendance_export.py` asserting:
  1. A report submitted on date $D$ at 08:30 AM IST does NOT appear in date $D$'s submitted list.
  2. A report submitted on date $D+1$ at 08:30 AM IST for date $D$ DOES appear in date $D$'s submitted list, with `is_next_day: True` and `submitted_label: "Next day morning 08:30 AM"`.
  3. In `/admin/export-staff-attendance`, Sheet 1 remarks cell appends `Submitted next morning (08:30 AM)`.

- [ ] **Step 2: Run tests to confirm failure**
  Run: `pytest tests/test_today_attendance_cutoff.py tests/test_staff_attendance_export.py -v`.

- [ ] **Step 3: Implement attendance radar segregation and Excel tag in `main.py`**
  - In `/admin/today-attendance`: Query reports for `target_date`. If a report's timestamp was completed before 10:00 AM on `target_date`, exclude it from today's submitted list (it belongs to `target_date - 1`). Also query reports for `target_date` that were submitted on the next morning before 10:00 AM, and include them with `is_next_day = True` and formatted label.
  - In `/admin/export-staff-attendance`: When building Sheet 1 rows, if `is_next_day_submission` is True, append `Submitted next morning ({morning_time})` to the remarks string.

- [ ] **Step 4: Run tests to confirm pass**
  Run: `pytest tests/test_today_attendance_cutoff.py tests/test_staff_attendance_export.py -v` (must pass 100%).
  Run: `python -m py_compile main.py` (must exit 0).

- [ ] **Step 5: Commit changes**
  Run: `git add main.py tests/test_today_attendance_cutoff.py tests/test_staff_attendance_export.py; git commit -m "feat(backend): segregate attendance radar by 10am cutoff and add next-day notes to excel export"`

---

### Task 3: Backend & Frontend Deactivated Staff Consonant-Collapsed Defense

**Files:**
- Modify: `main.py:2857-2928` (enhance `/admin/today-attendance` inactive filtering)
- Modify: `dfy-frontend/src/AdminDashboard.jsx:1580-1645` (update `chronicDefaulters` and `filteredMissing`)
- Test: `tests/test_deactivated_staff_alias.py`
- Test: `tests/test_deactivated_staff_ui.mjs`

**Interfaces:**
- Consumes: `staffDirectory` and `staffList` with potentially mismatched spellings (`Purushottam Kumar` vs `Purushotam Kumar`)
- Produces: Deterministic exclusion of deactivated staff from chronic defaulters and missing lists

- [ ] **Step 1: Write the failing tests**
  1. `tests/test_deactivated_staff_alias.py`: Assert that an inactive officer with single 't' in directory and double 't' in `staff_directory` is excluded from `missing_fos`.
  2. `tests/test_deactivated_staff_ui.mjs`: Node.js script asserting that `chronicDefaulters` in `AdminDashboard.jsx` excludes `sitamarhi_purushotamkumar` when `sitamarhi_purushottamkumar` is inactive.

- [ ] **Step 2: Run tests to confirm failure**
  Run: `pytest tests/test_deactivated_staff_alias.py -v` and `node tests/test_deactivated_staff_ui.mjs`.

- [ ] **Step 3: Implement consonant-collapsed normalization & staffList active check**
  - In `AdminDashboard.jsx`: Add `normalizeStaffKey(dist, name)` collapsing repeated characters (`replace(/(.)\1+/g, '$1')`).
  - Index `inactiveCutoffMap` by both exact key and normalized key.
  - In `chronicDefaulters`: If `inactiveCutoffMap[foKey]` or `inactiveCutoffMap[normKey]` is defined and `attendanceDate >= cutoff`, return early.
  - Also build an `inactiveStaffNamesSet` from `staffList` filtering for `s.is_active === false || s.status === 'inactive'`. If `normKey` is in `inactiveStaffNamesSet`, exclude immediately.
  - In `main.py`: In `/admin/today-attendance`, apply normalized alias matching on `staff_list`.

- [ ] **Step 4: Run tests to confirm pass**
  Run: `pytest tests/test_deactivated_staff_alias.py -v`.
  Run: `node tests/test_deactivated_staff_ui.mjs` (must pass 100%).
  Run: `npm --prefix dfy-frontend run lint` (0 syntax errors).

- [ ] **Step 5: Commit changes**
  Run: `git add main.py dfy-frontend/src/AdminDashboard.jsx tests/test_deactivated_staff_alias.py tests/test_deactivated_staff_ui.mjs; git commit -m "fix(staff): implement consonant-collapsed deactivation defense preventing inactive staff from appearing in defaulters"`

---

### Task 4: Master Table Documents Current & Previous Month Cohort Breakdown

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx:3820-3915` (update `tableData` memo)
- Modify: `dfy-frontend/src/AdminDashboard.jsx:6440-6450` (update `Docs` table cell rendering)
- Test: `tests/test_master_table_cohort_ui.mjs`

**Interfaces:**
- Consumes: `documents_ids` from daily records and `currentMonthNotifIdSet`
- Produces: `documents_cur` and `documents_prev` fields in `tableData` rows; UI rendering `C:X | P:Y` with sorting and cohort filter support

- [ ] **Step 1: Write the failing UI test**
  Create `tests/test_master_table_cohort_ui.mjs` asserting:
  1. `tableData` initializes and computes `documents_cur` and `documents_prev`.
  2. Sorting `getVal` handles `sortKey === 'documents'` for `current_cohort` and `backlog`.
  3. The `Docs` column renders `C:{row.documents_cur} | P:{row.documents_prev}` and responds to `masterTableCohortFilter`.

- [ ] **Step 2: Run test to confirm failure**
  Run: `node tests/test_master_table_cohort_ui.mjs`.

- [ ] **Step 3: Implement documents cohort calculation and cell rendering**
  - In `AdminDashboard.jsx:tableData`:
    - Initialize `documents_cur: 0`, `documents_prev: 0`.
    - Iterate `(r.documents_ids || [])` and classify into `documents_cur` if in `currentMonthNotifIdSet`, else `documents_prev`.
    - In `getVal`: add handling for `sortKey === 'documents'`.
  - In `AdminDashboard.jsx:6443-6445`:
    - Replace the flat `{row.documents > 0 ? row.documents : '-'}` with the standard 3-way conditional rendering matching `tests` and `hiv_dm`, showing `C:{row.documents_cur} | P:{row.documents_prev}` when not filtered.

- [ ] **Step 4: Run test to confirm pass**
  Run: `node tests/test_master_table_cohort_ui.mjs` (must pass 100%).
  Run: `npm --prefix dfy-frontend run lint` (0 syntax errors).
  Run: `npm --prefix dfy-frontend run build` (must exit 0).

- [ ] **Step 5: Commit changes**
  Run: `git add dfy-frontend/src/AdminDashboard.jsx tests/test_master_table_cohort_ui.mjs; git commit -m "feat(ui): add current and previous cohort breakdown to master table documents column"`

---

### Task 5: Frontend Attendance Radar Next-Day Morning Badge & Morning Reports Migration Script

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx:1495-1555` (update `getSubmissionTimeClassification`)
- Modify: `dfy-frontend/src/AdminDashboard.jsx:10625-10685` (render `⏰ Next day morning HH:MM AM` badge in submitted cards)
- Create: `scripts/migrate_morning_reports.py` (one-time migration for Sept 25 morning reports)
- Test: `tests/test_attendance_radar_morning_badge_ui.mjs`

**Interfaces:**
- Consumes: `fo.is_next_day`, `fo.submitted_label`, `fo.submitted_morning_time`
- Produces: Prominent amber/indigo `⏰ Next day morning HH:MM AM` badge in Attendance Radar; safe migration of morning reports into Sept 24

- [ ] **Step 1: Write the failing test**
  Create `tests/test_attendance_radar_morning_badge_ui.mjs` asserting:
  1. `getSubmissionTimeClassification` recognizes `fo.is_next_day` and returns `Next Day Morning` bracket and styling.
  2. Submitted card in Attendance Radar renders `fo.submitted_label || "Next day morning " + fo.submitted_time` when `fo.is_next_day` is true.

- [ ] **Step 2: Run test to confirm failure**
  Run: `node tests/test_attendance_radar_morning_badge_ui.mjs`.

- [ ] **Step 3: Implement radar badge and migration script**
  - In `AdminDashboard.jsx:getSubmissionTimeClassification`: If `isNextDay` is true, return `{ bracket: 'next_day', label: 'Next Day Morning (< 10 AM)', shortLabel: 'Next Day Morning', badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-bold' }`.
  - In `AdminDashboard.jsx`: Render the next-day badge prominently on the submitted card.
  - Create `scripts/migrate_morning_reports.py`: Query `daily_field_reports` for `2026-09-25` where `timestamp_completed` was before 10:00 AM IST (Shashi Ranjan, Ram Prakash, Munna Kumar, Nilkamal Kumar, Diwakar Kumar). Merge their data into `2026-09-24` documents, mark `is_next_day_submission = True`, and delete the duplicate `2026-09-25` documents.

- [ ] **Step 4: Run test to confirm pass**
  Run: `node tests/test_attendance_radar_morning_badge_ui.mjs` (must pass 100%).
  Run: `python -m py_compile scripts/migrate_morning_reports.py` (must exit 0).
  Run: `npm --prefix dfy-frontend run lint` (0 syntax errors).

- [ ] **Step 5: Commit changes**
  Run: `git add dfy-frontend/src/AdminDashboard.jsx scripts/migrate_morning_reports.py tests/test_attendance_radar_morning_badge_ui.mjs; git commit -m "feat(ui): add next-day morning badge to attendance radar and script to migrate morning reports"`

---

### Task 6: Complete Native Bento Visual Flowcharts in FO App Guide (`App.jsx`) with Zero-Leakage Privacy

**Files:**
- Modify: `dfy-frontend/src/App.jsx:1725-2350` (overhaul all `FoHelpGuide` topics into Native Bento Flowcharts)
- Test: `tests/test_fo_guide_bento_ui.mjs`

**Interfaces:**
- Consumes: FO App user view (`currentView === 'guide'`)
- Produces: 100% Native Bento Visual Flowcharts across all guide topics with zero text walls; ZERO mention of 10 AM cutoff

- [ ] **Step 1: Write the failing test**
  Create `tests/test_fo_guide_bento_ui.mjs` asserting:
  1. All guide topics (Daily Reporting, Duplicate Rules, Offline Sync, 24h Edits, Patient Tracker, Ergonomics, Attendance Roster) contain native Bento flowchart cards (CSS grid, sequence badges 1➔2➔3, SVG arrows).
  2. STRICT ZERO-LEAKAGE PRIVACY CONSTRAINT: `App.jsx` and `FoHelpGuide` contain ZERO occurrences of "10:00 AM", "10 AM cutoff", or "next morning cutoff".

- [ ] **Step 2: Run test to confirm failure**
  Run: `node tests/test_fo_guide_bento_ui.mjs`.

- [ ] **Step 3: Implement Native Bento Visual Flowcharts in `FoHelpGuide`**
  - In `App.jsx:FoHelpGuide`:
    - Daily Reporting: 4-card bento sequence with status pills, numeric step icons, and quick-tip callouts.
    - Duplicate vs Repeat Visit: Dual-card bento with Red (Hard Block) vs Amber (Repeat Legitimate Visit) side-by-side comparison.
    - Offline Mode: 3-card architecture diagram showing IndexedDB Vault ➔ Network Detection ➔ Cloud Sync with Zero-Loss guarantee shield.
    - 24-Hour Self-Correction: 3-step visual ladder (Profile Tab ➔ Select Date ➔ Pencil Edit / Cross Delete).
    - Patient Tracker: 3-tier visual status progression ladder (Green Shield Verified ➔ Blue Under Review ➔ Gray Pending).
    - Ergonomics: 4-card interactive feature bento (Quick-Jump Pills, Numeric Dialpad, Live 9-Digit Badge, Removable Tag Chips).
    - Attendance Roster: 6-tile color key grid for P, ML, CL, OD, A, WO with supervisor remark card.
  - Verify zero leakage of the 10 AM cutoff anywhere in `App.jsx`.

- [ ] **Step 4: Run test to confirm pass**
  Run: `node tests/test_fo_guide_bento_ui.mjs` (must pass 100%).
  Run: `npm --prefix dfy-frontend run lint` (0 syntax errors).
  Run: `npm --prefix dfy-frontend run build` (must exit 0).

- [ ] **Step 5: Commit changes**
  Run: `git add dfy-frontend/src/App.jsx tests/test_fo_guide_bento_ui.mjs; git commit -m "feat(ui): overhaul fo help guide into 100% native bento visual flowcharts with zero cutoff leakage"`

---

### Task 7: Complete Native Bento Visual Flowcharts in Admin SOP (`AdminDashboard.jsx`) & Version Bump to v2.8.3

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx:13040-13680` (overhaul all Admin SOP topics into Native Bento Flowcharts)
- Modify: `dfy-frontend/src/changelogData.js` (bump version to v2.8.3 and document changes)
- Test: `tests/test_admin_sop_bento_ui.mjs`

**Interfaces:**
- Consumes: Admin SOP modal (`showAppGuideModal`)
- Produces: 100% Native Bento Flowcharts across all 10 Admin SOP topics; version updated to `2.8.3`

- [ ] **Step 1: Write the failing test**
  Create `tests/test_admin_sop_bento_ui.mjs` asserting:
  1. All 10 topics in `showAppGuideModal` render native Bento flowchart structures with sequence steps and micro-cards.
  2. `APP_VERSION` in `changelogData.js` is `"2.8.3"`.
  3. Changelog records v2.8.3 with details on 10 AM radar sync, deactivated staff defense, master table cohort docs, and bento guides.

- [ ] **Step 2: Run test to confirm failure**
  Run: `node tests/test_admin_sop_bento_ui.mjs`.

- [ ] **Step 3: Implement Native Bento Flowcharts in Admin SOP and bump version**
  - In `AdminDashboard.jsx:showAppGuideModal`:
    - Daily Notification Tray: 4-stage flowchart (Open Tray ➔ Filter Canonical District ➔ 1-Click 24-Col Excel Copy ➔ Mark Done in Nikshay).
    - Nikshay Reconciler: 4-step data pipeline (State Monthly Dump Upload ➔ 5-Indicator Reconciliation ➔ Permanent Cumulative Ledger ➔ Auto-Update Patient Journey).
    - Attendance Radar & Overrides: 5-step visual flow including the Stealth 10 AM Cutoff explanation, radar monitoring, defaulter streaks, WhatsApp bulletin, and retroactive leave/remark modal.
    - Target Pacing: 4-card bento (Monthly Target ➔ Daily Pace Calculation ➔ Sunday & Holiday Buffer ➔ Month-End Forecast Model).
    - Staff Directory & PINs: 3-step credential security flow (Onboard Officer ➔ Generate 4-Digit Duty PIN ➔ Offline Vault Sync & Reset).
    - Duplicate Radar: 3-step detection & 1-click prune flow.
    - Multi-District Attendance Excel: 4-step dual-sheet export workflow.
    - RBAC: Dual-column Sub-Admin vs Super Admin boundary comparison.
    - Field FAQs: Bento card grid with quick troubleshooting answers.
  - In `changelogData.js`:
    - Update `APP_VERSION = "2.8.3"`.
    - Prepend `v2.8.3` entry with full change description.

- [ ] **Step 4: Run test to confirm pass**
  Run: `node tests/test_admin_sop_bento_ui.mjs` (must pass 100%).
  Run: `npm --prefix dfy-frontend run lint` (0 syntax errors).
  Run: `npm --prefix dfy-frontend run build` (must exit 0).

- [ ] **Step 5: Commit changes**
  Run: `git add dfy-frontend/src/AdminDashboard.jsx dfy-frontend/src/changelogData.js tests/test_admin_sop_bento_ui.mjs; git commit -m "feat(ui): complete 100% native bento flowcharts in admin sop and bump to v2.8.3"`

---

### Task 8: Full Verification Battery, Migration Execution & Push Approval Gate

**Files:**
- Execute: Verification battery across all backend and frontend test suites
- Execute: `scripts/migrate_morning_reports.py` (if approved or run against local/staging)
- Audit: Git diff line-by-line

- [ ] **Step 1: Execute Python compilation**
  Run: `python -m py_compile main.py` (Must exit code 0).

- [ ] **Step 2: Execute backend automated tests**
  Run: `pytest tests/test_stealth_10am_cutoff.py tests/test_today_attendance_cutoff.py tests/test_staff_attendance_export.py tests/test_retroactive_attendance_remarks.py tests/test_deactivated_staff_alias.py -v` (Must pass 100%).

- [ ] **Step 3: Execute frontend automated tests**
  Run: `node tests/test_deactivated_staff_ui.mjs`
  Run: `node tests/test_master_table_cohort_ui.mjs`
  Run: `node tests/test_attendance_radar_morning_badge_ui.mjs`
  Run: `node tests/test_fo_guide_bento_ui.mjs`
  Run: `node tests/test_admin_sop_bento_ui.mjs`

- [ ] **Step 4: Execute frontend build & lint**
  Run: `npm --prefix dfy-frontend run lint` (0 syntax errors).
  Run: `npm --prefix dfy-frontend run build` (Must exit code 0).

- [ ] **Step 5: Temporal Dead Zone & Scope Safety Audit**
  Audit `AdminDashboard.jsx` and `App.jsx` to verify all state and derived variables are declared before use.

- [ ] **Step 6: Git Diff Audit & Summary for User**
  Inspect `git diff` to confirm only planned changes are included. Provide comprehensive summary and request user approval before `git push`.
