# Implementation Plan: Secondary Indicators, Cohort Breakdown, Cumulative Ledger & Cloud Resource Load Audit

- **Date**: 2026-10-02
- **Spec**: `docs/superpowers/specs/2026-10-02-secondary-indicators-and-ledger-data-flow-design.md`
- **Goal**: Restore Cumulative Ledger data display, ensure Secondary Indicators and Cohort Breakdown handle all record schemas, prevent stale cache trapping, produce infrastructure load report, and verify with full regression battery.

---

## Task 1: Cumulative Ledger Data Ingestion Fix in `useAdminModals.js`
- **Files**: `dfy-frontend/src/hooks/useAdminModals.js:776`
- **Action**: Replace `setLedgerData(data.records || [])` with `setLedgerData(data || { patients: [], metrics: {}, total_records: 0, total_pages: 1 })`.
- **Test**: `tests/test_cumulative_ledger_ingestion.mjs` verifying that `fetchCumulativeLedger` preserves `data.patients`, `data.metrics`, `data.total_records`, and `data.total_pages`.

---

## Task 2: Home Visits & Follow Ups Plural/Singular Fallback in `useAdminAnalytics.js`
- **Files**: `dfy-frontend/src/hooks/useAdminAnalytics.js:63-70, 410-415`
- **Action**:
  - In `aggregate(records)`: Map `home_visits` to `curr.home_visits || curr.home_visit || (curr.home_visit_ids ? curr.home_visit_ids.length : 0) || 0`.
  - In `aggregate(records)`: Map `follow_ups` to `curr.follow_ups || curr.follow_up || (curr.follow_up_ids ? curr.follow_up_ids.length : 0) || 0`.
  - In `tableData`: Accrue `home_visits` and `follow_ups` using the same multi-key fallback.
- **Test**: `tests/test_secondary_indicators_fallback.mjs` verifying that records with singular `home_visit` / `follow_up` or raw ID arrays are aggregated correctly.

---

## Task 3: Zero-ID Stale Cache Invalidation & Delta Sync Guard in `AdminDashboard.jsx`
- **Files**: `dfy-frontend/src/AdminDashboard.jsx:490-520, 539-545`
- **Action**:
  - If `cachedData` exists and has records, but `hasValidIds` is false: purge the cache from IndexedDB and localStorage immediately, and do not send `since` to backend.
  - If backend returns `mode === 'NO_CHANGE'` and `rawRecords` is empty while `cachedData` has valid IDs: populate `rawRecords` from `cachedData.records`.
- **Test**: `tests/test_dashboard_stale_cache_invalidation.mjs` verifying that stale cache with 0 IDs is cleared and triggers a full fetch.

---

## Task 4: Infrastructure & Cloud Resource Load Architecture Audit Report
- **Files**: `docs/audits/2026-10-02-cloud-infrastructure-and-load-reduction-report.md`
- **Action**: Generate a comprehensive architecture load report quantifying Render RAM/CPU, Vercel Edge Bandwidth, and Firestore Read/Write reductions with exact formulas and audit evidence.

---

## Task 5: Full System Regression Gate & End-to-End Verification
- **Checks**:
  - `node tests/test_cumulative_ledger_ingestion.mjs`
  - `node tests/test_secondary_indicators_fallback.mjs`
  - `node tests/test_dashboard_stale_cache_invalidation.mjs`
  - All existing 8 node test suites
  - `pytest tests/` (182+ tests)
  - `npm --prefix dfy-frontend run lint` (0 syntax errors)
  - `npm --prefix dfy-frontend run build` (exit 0)
  - `python -m py_compile main.py` (exit 0)
