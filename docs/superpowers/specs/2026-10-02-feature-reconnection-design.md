# DFY MIS Admin Dashboard — Feature Reconnection Design Spec

**Date:** 2026-10-02  
**Status:** Approved  
**Reference Commit (Production Monolith):** `9852808`

---

## Overview

The admin dashboard was refactored from a monolith (`AdminDashboard.jsx` ~7000 lines) into a modular architecture. During refactoring, several prop-name mismatches, missing wiring, and disconnected state flows broke production-critical features. This spec documents the exact breaks and the fix contract for each — no new features, no merging back to monolith.

**Goal:** Every feature must behave identically to the production monolith at commit `9852808`.

---

## Architecture (Do Not Change)

```
AdminDashboard.jsx (orchestrator, ~1020 lines)
  ├── useAdminAttendance.js   (Attendance Radar Engine)
  ├── useAdminAnalytics.js    (Cohort & Pacing Engine)
  ├── useReportDownloads.js   (Excel/ZIP report handlers)
  ├── useAdminModals.js       (ALL 24 modal states + handlers, returns ~200 keys)
  ├── AdminHeader.jsx         (Command Deck — all button triggers)
  ├── AdminModals.jsx         (Renders all 24 modal components via props)
  └── [Tab Components]        (OverviewTab, StaffPacingTab, DistrictBenchmarksTab)
```

**Fix protocol:** Wire correct prop names between files. Do NOT merge files back together.

---

## Feature Break Inventory (7 Phases)

### Phase 1 — Admin Feed Modal (Fill Field Officer ID for Any Date)

**Symptom:** Clicking "Admin Feed" in the header opens the modal but the district, FO name, date, category inputs, and remarks are NOT pre-filled when triggered from the header button or from an FO's drill-down row.

**Root Cause (confirmed by diff):** `AdminDashboard.jsx` lines 820–824 pass wrong prop names to `AdminHeader`:

| Line | Current (WRONG) | Correct |
|------|-----------------|---------|
| 820 | `modals.setDate` | `modals.setFeedDate` |
| 823 | `modals.setCategoryInputs` | `modals.setFeedCategoryInputs` |
| 824 | `modals.setRemarks` | `modals.setFeedRemarks` |

**Fix:** Update 3 prop references in `AdminDashboard.jsx` lines 820, 823, 824.

**Test:** Click the "Feed ID" button in the header → modal opens → district defaults to `availableKpiDistricts[0]`, date defaults to today's date, category inputs are blank, remarks blank. Then drill-down from FO Inspector → trigger "Direct Feed" → remarks must pre-fill with `"Direct feed for <fo_name>"`.

---

### Phase 2 — Daily Notification Tray (showNotifTrayModal)

**Symptom:** Notification Tray modal opens (button works) but shows 0 IDs / empty list even when FOs have submitted reports with notification IDs.

**Root Cause:** `notifTrayData` in `useAdminModals.js` line 749 correctly reads `r.notification_ids` from `rawRecords`. This works IF `rawRecords` contains the raw ID arrays. The previous session already fixed `format_dashboard_record` in `backend/core/master_ledger.py` to restore raw ID arrays. If the cache still has old data (no `notification_ids`), the tray will be empty.

**Fix Required:**
1. The `hasValidIds` cache validation already exists in `AdminDashboard.jsx` line 494–495 (added in commit `e14dfeb`). This auto-bypasses stale cache.
2. Verify `notifTrayData` is correctly passed to `NotifTrayModal` via `AdminModals` → check `AdminModals.jsx` for `NotifTrayModal` props.
3. Verify `AdminHeader` receives `notifTrayData` correctly (currently `notifTrayData={modals.notifTrayData}` at line 830 — this is correct).

**Additional gap in `build24ColTsv`:** The TSV builder at `useAdminModals.js` line 724–740 hardcodes only `id`, `fo_name`, `date_formatted`, `district` in row. Columns 5–24 are empty strings. In production monolith, all 24 fields were populated from the record's category counts. This should be verified against production.

**Test:** 
- After hard refresh (force clear cache), load dashboard. Open NotifTray. IDs must appear matching rawRecords count.
- Export TSV — verify columns.

---

### Phase 3 — Nikshay Reconciler (showNikshayModal)

**Symptom:** Modal opens. File upload and reconcile button may work, but the `nikshaySyncStatus` auto-fetch on modal open may be broken.

**Root Cause:** In the production monolith, there was a `useEffect` watching `showNikshayModal` to call `fetchNikshaySyncStatus()` on open. In current `useAdminModals.js`:
- Line 185: `showNikshayModal` state exists ✓
- `fetchNikshaySyncStatus` must exist and be called in a `useEffect` watching `showNikshayModal`

**Verify in `useAdminModals.js`:** Does a `useEffect([showNikshayModal, fetchNikshaySyncStatus])` exist? If not, add it.

**Backend endpoint:** `GET /admin/nikshay/sync-status?month=YYYY-MM` — verify this route exists in `backend/routers/nikshay.py`.

**Test:** Open Nikshay modal → `nikshaySyncStatus` loads showing last sync timestamp and match stats. Upload a file → reconcile → results appear.

---

### Phase 4 — Patient Journey Tracker (showJourneyModal)

**Symptom:** Modal opens. Search for a patient ID → nothing returns or error shown.

**Root Cause:** `handleFetchJourney` in `useAdminModals.js` line 347 calls `/api/nikshay/patient-journey?patient_id=...`. This endpoint must exist in `backend/routers/nikshay.py`.

**Verify:**
- `handleFetchJourney` is returned by `useAdminModals` and accessible as `modals.handleFetchJourney`
- It IS in the return at line... (check return — not explicitly listed in the return block seen above, must verify)
- `JourneyModal` receives `handleFetchJourney` prop via `AdminModals`

**Test:** Open Journey modal → enter a valid patient ID → click search → journey timeline appears.

---

### Phase 5 — Cascade Alerts (showCascadeModal)

**Symptom:** Modal opens but may show empty data or fail to auto-fetch on open.

**Root Cause:** Button in AdminHeader correctly calls `fetchCascadeAlerts` then `setShowCascadeModal(true)`. Let's verify:
- Line 807: `fetchCascadeAlerts={modals.fetchCascadeAlerts}` ✓ (correct)
- Line 838: `setShowCascadeModal={modals.setShowCascadeModal}` ✓ (correct)
- `AdminModals.jsx` line 49: `CascadeAlertsModal` receives `fetchCascadeAlerts={props.fetchCascadeAlerts}` ✓

**Likely OK.** Verify the cascade alerts backend endpoint is wired.

**Test:** Click "Cascade Alerts" in header → data loads showing districts at risk.

---

### Phase 6 — FO Inspector Drill-Down (kisi staff ka click karne pe data nahi)

**Symptom:** Clicking an FO's name in the staff pacing table or overview opens `FoInspectorModal` but no records appear.

**Root Cause (partially fixed):**
1. `format_dashboard_record` now returns raw ID arrays (commit `e14dfeb`) ✓
2. `FoInspectorModal` name matching hardened with lowercase fallback (commit `e14dfeb`) ✓
3. `FoInspectorModal` receives `rawRecords` via `AdminModals` → verify `AdminModals.jsx` passes `rawRecords` to `FoInspectorModal`

**Remaining gap:** When `selectedDistrict === 'All'`, `inspectingFO.district` must be set correctly. In `StaffPacingTab`, the `setInspectingFO` call at `AdminDashboard.jsx:958` passes `{ fo_name: officer.name, district: selectedDistrict }` — when `selectedDistrict === 'All'`, the FO Inspector will try to find the FO's district from `rawRecords` itself.

**Verify:** `FoInspectorModal.jsx` filtering logic handles `inspectingFO.district === 'All'` by scanning all records for matching `fo_name`.

**Test:** On "All" district view, click any officer → their monthly records appear. On specific district view → same.

---

### Phase 7 — Firestore Cutoff Rules & Cohort Filter (Master Table)

**Symptom:** Cohort filter buttons (All Total / Current Month / Previous Month Backlog) show 0 for Current Month and Backlog even when data exists.

**Root Cause:** `useAdminAnalytics.js` cohort engine requires `notification_ids` arrays in `rawRecords`. Previously fixed in `e14dfeb`. The `currentMonthNotifIdSet` is built from records where `date_of_reporting` starts with the current `month`. Records submitted in the grace period (Day 1 of next month before noon) must be classified as previous month.

**Verify:** `useAdminAnalytics.js` correctly uses `month` prop to build `currentMonthNotifIdSet`. The `getOperationalMonth()` utility handles the Day 1 grace period.

**Test:** With data spanning two months, switch cohort filter to "Current Month" — only current month IDs counted. Switch to "Previous Month Backlog" — only prior month IDs.

---

## Prop-Name Mismatch Registry (Complete)

All confirmed mismatches between `AdminDashboard.jsx` and `useAdminModals` return:

| AdminDashboard passes | AdminHeader/Hook expects | Fix |
|---|---|---|
| `modals.setDate` | `modals.setFeedDate` | Change to `modals.setFeedDate` |
| `modals.setCategoryInputs` | `modals.setFeedCategoryInputs` | Change to `modals.setFeedCategoryInputs` |
| `modals.setRemarks` | `modals.setFeedRemarks` | Change to `modals.setFeedRemarks` |

---

## Files Modified (Strictly Bounded)

1. `dfy-frontend/src/AdminDashboard.jsx` — Fix 3 prop-name mismatches (Phase 1)
2. `dfy-frontend/src/hooks/useAdminModals.js` — Verify/add `useEffect` for Nikshay sync-status on modal open (Phase 3); verify `handleFetchJourney` is in return object (Phase 4)
3. `dfy-frontend/src/components/Admin/AdminModals.jsx` — Verify all 7 modal components receive correct props (Phase 2–7 audit)
4. `dfy-frontend/src/components/Admin/modals/FoInspectorModal.jsx` — Handle `district === 'All'` gracefully (Phase 6)
5. `dfy-frontend/src/components/Admin/modals/JourneyModal.jsx` — Verify `handleFetchJourney` prop is used correctly (Phase 4)
6. `backend/routers/nikshay.py` — Verify `/sync-status` and `/patient-journey` endpoints exist (Phase 3, 4)

---

## Global Constraints

- **Production is LIVE** — zero crashes, blank screens, data corruption
- **No monolith merge** — fix connections only, preserve modular architecture  
- **No new features** — restore original behavior only
- **Zero-push rule** — commit locally, await user approval before `git push`
- **TDZ order** — useState → useMemo → useCallback → useEffect (never reverse)
- **Anti-double-tap** — all mutation buttons disabled during in-flight operations
- **Test before marking done** — Python compile, npm build, npm lint must all pass

---

## Testing Contract

Each phase has a runtime test script. All scripts live in `tests/` as `.mjs` or `.py`.

- Phase 1 `AdminFeed`: `tests/test_admin_feed_prop_wiring.mjs`
- Phase 2 `NotifTray`: `tests/test_notif_tray_data_flow.mjs`
- Phase 3 `Nikshay`: `tests/test_nikshay_modal_sync.mjs`
- Phase 4 `Journey`: `tests/test_journey_modal_handler.mjs`
- Phase 5 `Cascade`: `tests/test_cascade_alerts_wiring.mjs`
- Phase 6 `FO Inspector`: `tests/test_fo_inspector_all_district.mjs`
- Phase 7 `Cohort`: existing `tests/test_master_table_cohort_ui.mjs`
