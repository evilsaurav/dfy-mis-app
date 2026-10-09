# Changelog

All notable changes to the Doctors For You (DFY) TB Field MIS & Analytics System will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
