# Changelog

All notable changes to the Doctors For You (DFY) TB Field MIS & Analytics System will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.9.5] - 2026-10-30

### Added
- **Sunday Roll-Forward Month-End Grace Period Engine**:
  - Implemented automatic Sunday roll-forward resolver in `operationalMonth.js` and `backend/core/helpers.py`.
  - When Day 1 of the new month falls on Sunday (official weekly off for frontline field staff), the grace period extends through the entirety of Sunday (Day 1) and until 12:00 PM (Noon) on Monday (Day 2).
  - Extended reporting cutoff in `get_reporting_cutoff_hour` returns `12:00 PM` on both Sunday and Monday, protecting frontline staff from the standard 11:00 AM weekday cutoff.
  - At 12:00 PM on Monday, the system smoothly transitions to the new operational month and auto-dismisses the mobile grace period banner.
- **Travel Allowance Visual Prefill Highlighting & 1-Click Snapshot Undo Engine**:
  - Auto-calculated prefill rows, odometer readings, and amounts are immediately highlighted with distinct amber visual badges (`bg-amber-500/20 text-amber-300`).
  - Implemented 1-click `Undo` button backed by an in-memory deep snapshot (`taPrefillSnapshotRef`), allowing coordinators to revert all staff logs back to their exact pre-fill state with zero database mutations.
  - Maintained interactive state on the "Save All Staff" bulk button whenever valid staff logs exist in the modal, allowing coordinators to persist district logs at any stage of review.
  - Automatically clears visual highlight badges upon successful local or bulk database save.
- **TA Meter Auto-Calculation & Lock Protection**:
  - Updated meter entry inputs to automatically calculate Day KM (`end_km - start_km`) without forcing unprompted overrides on existing manual numbers.
  - Preserves verified locked audit days during district-wide prefill operations.

---

## [2.9.4] - 2026-10-27

### Added
- **High-Throughput PostgreSQL Batch Deduplication Engine**:
  - Batched 90-day duplicate checking into a single SQL query with array/tuple lookups, slashing database query volume during evening submission spikes.
  - Optimized child table insertions (presumptive cases, TB contacts, lab samples) using bulk `executemany` operations within single transactional connections.
- **Frontline PIN Vault Micro-Interactions & Double-Tap Prevention**:
  - Added animated dynamic typing dots to the 4-digit PIN verification input on the mobile PWA, providing tactile visual feedback in low-connectivity rural environments.
  - Replaced static form submit button with a reactive morphing state machine (`isSubmitting` / `disabled`), preventing duplicate report submissions from rapid double-tapping.
  - Hardened mobile PWA viewport against dynamic Android browser navigation bar resizing (100vh fix) and notch safe-areas.

---

## [2.9.3] - 2026-10-24

### Added
- **Executive Report Studio & Excel Export Author Attribution Metadata**:
  - Dynamically stamped official author attribution metadata ("Designed & Developed by Saurav Kumar, State Data & Documentation Consultant, DFY Bihar") across all Report Studio workbooks, 33-sheet KPI Excel sheets, and attendance exports.
  - Embedded author metadata into OpenPyXL core document properties (`workbook.properties.creator`, `workbook.properties.title`).

### Security
- **Admin Password Hash Sanitization**:
  - Stripped sensitive `password_hash` fields from all admin user serialization endpoints, admin lists, and `/admin/auth/me` responses, enforcing strict principle-of-least-privilege data sanitization.
- **Fail-Closed Frontline PIN Verification & Strict CORS**:
  - Hardened mobile PIN verification pipeline to fail-closed on corrupted or missing offline vault entries, preventing unauthorized duty access.
  - Restricted CORS origins to authorized production and development environments.
- **Supabase Oct 30 Data API Role Permissions**:
  - Applied explicit role grants (`GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO service_role`) across Supabase PostgreSQL tables to ensure seamless continuity through scheduled platform policy updates.

---

## [2.9.2] - 2026-10-18

### Added
- **Dynamic Live-Roster 33-Sheet KPI Workbooks (Backlog #88)**:
  - Upgraded the 33-sheet District KPI Excel generator to synthesize workbooks dynamically from the live `staff_directory` roster rather than static template files.
  - Guarantees 100% synchronization of staff names, designations, and clinical indicators across all 33 sheets.
- **Sub-Admin TA Prefill Delegated Permissions (Backlog #89)**:
  - Super Admins can delegate district prefill permissions to specific Sub-Admins via a new toggle in the admin suite.
  - Added real-time permission sync via `/admin/auth/me` so permissions take effect immediately without requiring re-login.
- **Strict Today's IST Submission Date Guard (Backlog #87)**:
  - Enforced backend validation requiring daily field report submissions to match the active IST calendar date, permanently preventing back-dated or future-dated records.
- **Staff Target Synchronization & UI Input Fix**:
  - Fixed frozen input fields in the Staff Details modal and unified monthly target persistence between the "Set Targets" matrix and the "Staff & PINs" modal.

---

## [2.9.1] - 2026-10-09

### Added
- **Travel Allowance "Save All Staff" Bulk-Save Engine (Backlog #79)**:
  - Added `POST /admin/ta/save-log-bulk` endpoint and `TaLogSaveBulkReq` schema supporting multi-staff batch persistence.
  - Added dynamic `"💾 Save All Staff (N)"` button in `TravelAllowanceModal.jsx` reflecting the real-time count of dirty tabs across the district roster.
  - Added `editedDrafts` in-memory state tracking to retain unsaved edits across visited staff tabs.
  - Added `handleSaveLogBulk` action in `useAdminTA.js`, forwarded via `AdminModals.jsx`.
- **All-or-Nothing Transactional Protection**:
  - Phase 1 upfront batch validation: validates staff existence, Sub-Admin district access, and record lock status (`validate_edit_permission`) across all entries before any write.
  - Immediate atomic rejection (HTTP 423 / 403 / 404) if any entry is locked or unauthorized, reporting the exact staff name and reason with zero rows written.
  - Single atomic PostgreSQL transaction context (`conn.cursor()` context manager) wrapping all roster upserts and daily log replacements with automatic rollback on any exception.
- **Multi-Staff Drilldown Tab Strip & Silent Auto-Saves (Backlog #74c & #79)**:
  - Top tab strip allowing rapid switching between staff members within a district drilldown.
  - Automatic silent background saving on tab switch (switching from Staff A to Staff B immediately saves Staff A).
  - Automatic silent background saving on drilldown modal close or "Back to Roster" navigation.
  - 45-second periodic debounce auto-save during continuous editing.

### Fixed
- **Staff Deactivate Multi-Click Race Fix (Backlog #78 - Bug A)**:
  - Resolved race condition where redundant post-mutation `fetchStaffList()` and `fetchDirectory()` calls clobbered optimistic local state back to stale values.
  - Held optimistic state authoritative upon HTTP 200 confirmation, retaining refetches strictly for failure-path reconciliation.
  - Added user-facing error toast alerts on toggle failure.
- **Soft-Delete Directory & Picker Leakage Elimination (Backlog #78 - Bug B)**:
  - Enforced `deleted_at IS NULL` filters in `get_staff_directory`, `get_staff_full_list`, `targets.py` target queries, and `master_ledger.py` target JOINs.
  - Permanently prevented soft-deleted personnel from appearing in active dropdowns, officer pickers, or target assignment grids.
- **Payroll & Financial Audit Integrity Exception**:
  - In `travel_allowance.py` (`get_ta_roster`), soft-deleted staff (`deleted_at IS NOT NULL`) are conditionally retained in current-month rosters if they recorded odometer readings or financial activity (`total_km > 0` or non-zero amounts), preserving historical expense reconciliation while excluding zero-activity accounts.
- **Substring Match Identity Collision Elimination (Backlog #76)**:
  - Removed risky `ILIKE %name%` substring matching across 6 authentication, lookup, and target locations to resolve identity collision vulnerabilities with Roman numeral suffixes (e.g. "I", "II") and common names.

---

## [2.9.0] - 2026-10-07

### Added
- **Relational Travel Allowance & Bike Log Subsystem**:
  - 4 normalized PostgreSQL relational tables: `travel_allowance_settings`, `travel_allowance_rosters`, `travel_allowance_daily_logs`, and `travel_allowance_permissions`.
  - Dynamic statewide reimbursement rate configuration (default ₹4.00/KM) controllable via Super Admin / Incharge modal.
  - Granular per-staff lifecycle status transitions (`DRAFT` → `SUBMITTED` → `APPROVED` / `REVERTED`).
  - Active 24-hour dispute window for frontline field officers on mobile profile card (`POST /fo/ta/dispute`).
  - Privacy guard concealing calculated financial figures while rosters are under review.
  - Multi-sheet openpyxl Excel export (`GET /admin/ta/export-excel`) with dynamic `=SUM()` formulas and per-officer odometer audit sheets.
  - Statewide Travel Allowance Executive Dashboard (`TravelAllowanceTab.jsx`) with bento KPI cards, approval stage tracking, and cached statewide summary (`GET /admin/ta/statewide-summary`).

### Fixed
- **Attendance Radar District Normalization**:
  - Normalized lookup keys across Attendance Radar, resolving defaulter collisions in multi-word district names (e.g. Purba Champaran / East Champaran) without losing streak history.

---

## [2.8.6] - 2026-09-30

### Added
- **Unified Staff Target Synchronization**:
  - Synchronized target persistence across "Set Targets" and "Staff & PINs" admin suites.
  - Integrated monthly target input inside "Edit Staff Details" modal with instant dashboard refresh.
- **Resilient Master Table & Pacing Name Matching**:
  - Alias-resilient matching engine resolving naming variations across Detailed Master Table, Performance Cards, and Staff Pacing Radar.
- **Smart 12:00 PM Month-End Reporting Cutoff**:
  - Extended daily stealth cutoff to 11:00 AM IST on regular days, and provides an extended 12:00 PM (Noon) cutoff on Day 1 of every month for late month-end field reconciliation.

---

## [2.8.5] - 2026-09-29

### Added
- **17-Indicator 33-Sheet District KPI Excel Engine**:
  - Extended 33-sheet workbook generator across all sheets (Performance Sheet, Consolidated Sheet, and Daily Sheets 1st–31st) to support Differentiated TB Care (`DIFF TB`), Preventive Therapy Treatment (`TPT START`), and Presumptive TPT (`TPT PRESUMTIVE`).
- **Render 512MB RAM Anti-OOM Disk Spooling**:
  - Disk-spooled temporary archive generation (`tempfile.NamedTemporaryFile`), 750ms queue pacing between district workbooks, and deterministic garbage collection (`gc.collect()`) under concurrency semaphores.
- **Strict Sub-Admin RBAC Download Gates & Anti-Double-Tap Guards**:
  - Sub-Admin single-district download isolation with HTTP 403 enforcement.
  - Authenticated blob streaming (`authFetch`) with active spinners and disabled states.

---

## [2.8.4] - 2026-09-26

### Added
- **Bihar Statewide 4-Role Top Performers Studio**:
  - Full-width studio architecture featuring 4 clinical role cadres: Top Districts (DC), Top Field Officers & Hub Agents, Top Lab Technicians (LT), and Top SCT Agents.
  - Added Treatment Coordinators (TC) ranked on verified patient home visits.
  - Client-side 1200x1350 4-quadrant HD Canvas poster generator and 1-click formatted WhatsApp broadcasts.

---

## [2.8.3] - 2026-09-25

### Added
- **100% Native Bento Visual Flowcharts in FO Guide & Centralized Admin SOP**:
  - Responsive Bento Grid flowcharts with sequence badges (`1➔2➔3`), SVG flow connectors, tactical micro-cards, and pro-tip callouts across 10 FO chapters and 11 Admin SOP modules.
- **Retroactive Admin Inspection Remarks & Cross-Portal Leave Sync**:
  - Supervisor notes and 5-status leave overrides directly from Attendance Radar (`POST /admin/attendance/add-remark`).
- **Stealth 10:00 AM Reporting Cutoff**:
  - Unconditional cutoff routing reports submitted before 10:00 AM IST to previous calendar day with zero leakage to field officers.
- **Dual-Sheet Staff Attendance Excel Generator**:
  - Multi-officer attendance grid (Sheet 1) and detailed chronological duty log (Sheet 2) with concurrency semaphore.