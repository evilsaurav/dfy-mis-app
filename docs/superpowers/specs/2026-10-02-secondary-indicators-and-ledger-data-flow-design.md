# Design Spec: Secondary Indicators, Cohort Breakdown, Cumulative Ledger & Cloud Resource Load Audit

## 1. Problem Statement & Scope

During local testing of the admin dashboard, the following issues were identified:
1. **Secondary Clinical & Operational Indicators (Home Visits & Follow Ups)**: Home visits and follow-ups displayed 0 in the overview cards and detailed master table.
2. **Detailed Master Table Cohort Filter**: Switching between "All (Total)", "Current Month Cohort", and "Previous Month Backlog" showed empty counts because client-side cohort calculations rely on `notification_ids` and category ID arrays that were either missing in stale client caches or fell back to 0 due to property naming differences.
3. **Daily Notification Tray in Local Testing**: Displayed "No records" when loaded with zero-ID cached payloads.
4. **Permanent Cumulative Ledger**: In the Nikshay Reconciler, the Permanent Cumulative Ledger tab displayed "No permanently verified patients recorded yet for this filter" despite 50 verified patients existing in the backend Firestore collection `nikshay_verified_patients`.
5. **Infrastructure & Cloud Resource Load Audit**: Provide a technical load comparison report detailing the load on Render (RAM/CPU/dynos), Vercel (Edge/Bandwidth), and Firestore (Reads/Writes/Quotas) and how the new in-memory master ledger and lazy-tab engine reduced this load.

---

## 2. Root Cause Analysis

### BUG A: Cumulative Ledger Data Ingestion Disconnect
- **File**: `dfy-frontend/src/hooks/useAdminModals.js:776`
- **Root Cause**: `fetchCumulativeLedger` executed:
  ```javascript
  const data = await res.json();
  setLedgerData(data.records || []);
  ```
- **Backend Contract** (`backend/routers/nikshay.py:975-990`): Returns:
  ```json
  {
    "success": true,
    "total_records": 50,
    "page": 1,
    "limit": 50,
    "total_pages": 1,
    "metrics": { ... },
    "patients": [ ... ]
  }
  ```
- **Consumer Contract** (`dfy-frontend/src/components/Admin/modals/NikshayModal.jsx:886, 921, 996`): Consumes `ledgerData?.metrics`, `ledgerData?.patients`, `ledgerData?.page`, and `ledgerData?.total_records`.
- **Effect**: `data.records` is `undefined`, so `setLedgerData([])` sets `ledgerData` to an empty array without `.patients` or `.metrics`, rendering the ledger empty.
- **Fix Contract**: Set `setLedgerData(data || { patients: [], metrics: {}, total_records: 0, total_pages: 1 })`.

---

### BUG B: Home Visits & Follow Ups Plural/Singular Fallback Disconnect
- **File**: `dfy-frontend/src/hooks/useAdminAnalytics.js:63-70, 410-415`
- **Root Cause**: `aggregate(records)` and `tableData` mapping accessed `curr[key]` or `r[k]`. In Firestore and historical submissions, documents may store `home_visit` (singular) or `home_visits` (plural), and `follow_up` (singular) or `follow_ups` (plural), or only the raw ID arrays `home_visit_ids` and `follow_up_ids`.
- **Effect**: If a record has `home_visit` instead of `home_visits`, `r['home_visits']` evaluates to `undefined` (0), causing the secondary indicators and master table to display 0.
- **Fix Contract**:
  ```javascript
  const getHomeVisits = (r) => (r.home_visits || r.home_visit || (r.home_visit_ids ? r.home_visit_ids.length : 0) || 0);
  const getFollowUps = (r) => (r.follow_ups || r.follow_up || (r.follow_up_ids ? r.follow_up_ids.length : 0) || 0);
  ```

---

### BUG C: Stale Zero-ID Client Cache Trapping Delta Sync
- **File**: `dfy-frontend/src/AdminDashboard.jsx:494, 517-520, 539-542`
- **Root Cause**: When the frontend had cached a dashboard payload from before raw ID arrays were returned by the backend:
  1. `hasValidIds` was false, skipping initial state population.
  2. Line 517 sent `payload.since = cachedData.synced_at` to the backend.
  3. The backend checked `since >= last_mut_str` and returned `mode: "NO_CHANGE"`, with `records: []`.
  4. Line 539 handled `NO_CHANGE` by doing nothing, leaving `rawRecords` empty `[]`.
- **Effect**: The dashboard remained trapped with 0 records, 0 IDs, empty notification tray, and broken cohort breakdown.
- **Fix Contract**:
  - If `cachedData` exists but `hasValidIds` is false:
    1. Immediately purge stale cache from IndexedDB and localStorage.
    2. Do NOT send `since` in payload — force a clean `FULL` sync.
  - If `data.mode === 'NO_CHANGE'`, set `rawRecords` from `cachedData.records` if `rawRecords` is currently empty and `hasValidIds` is true.

---

## 3. Infrastructure & Cloud Resource Load Architecture Audit

The technical report will detail:
1. **Firestore (Google Cloud)**:
   - Reads Before: 5,000+ reads/day per admin session from un-cached attendance, eager multi-tab queries, 22-district bulk KPI Excel generation (4,400+ reads per run), and statewide profile cache evictions.
   - Reads Now: In-memory master ledger (`get_raw_monthly_reports`), targeted single-officer cache eviction, in-memory KPI Excel generation, and client-side Delta Sync reduces daily Firestore reads by **90-95%**.
2. **Render (FastAPI Python Backend)**:
   - Memory & CPU Before: Unbounded in-memory monthly cache, concurrent openpyxl processes triggering OOM crashes past 512MB RAM ceiling, sync blocking event loop.
   - Memory & CPU Now: LRU 2-Month Memory Bound with RAM Watchdog, `KPI_EXCEL_SEMAPHORE(1)`, threadpool async offloading, anti-OOM temporary file spooling, garbage collection.
3. **Vercel (React Frontend)**:
   - Bandwidth & Edge Before: Eager monolithic mount waterfall, 6 simultaneous API calls on cold start, 504 gateway timeouts.
   - Bandwidth & Edge Now: Dynamic code-split bundle, IndexedDB instant local first-paint, on-demand lazy tab loading.
