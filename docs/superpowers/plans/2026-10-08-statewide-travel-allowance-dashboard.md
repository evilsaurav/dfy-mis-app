# Statewide Travel Allowance Executive Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dynamic, modern, executive-grade Statewide Travel Allowance Dashboard on the Admin Dashboard for Super Admin & Main Incharge, providing high-level KPIs, dynamic 22-district visual bento cards with progress bars, an executive table view, seamless drilldown inspection, and zero free-tier resource strain.

**Architecture:** A lightweight backend endpoint (`GET /admin/ta/statewide-summary`) executes a single SQL `GROUP BY district` query on Supabase PostgreSQL (< 3 ms) with a 60s in-memory TTL cache (< 50 KB RAM). A dedicated modular frontend tab component (`TravelAllowanceTab.jsx`) is mounted in `AdminDashboard.jsx` and navigated via `AdminHeader.jsx` alongside the 3 existing tabs, strictly gated to `SUPER_ADMIN` and `MAIN_INCHARGE`.

**Tech Stack:** FastAPI, Supabase PostgreSQL, React 18, Tailwind CSS, Lucide React, Pytest, Node.js.

**Spec:** `docs/superpowers/specs/2026-10-08-statewide-travel-allowance-dashboard-design.md`

## Global Constraints
- Target platform: Render (512MB RAM, 0.1 vCPU), Supabase PostgreSQL (Free Tier), Vercel (Static SPA).
- Strict RBAC: Accessible only by `SUPER_ADMIN` and `MAIN_INCHARGE`. Hidden from Sub-Admins and field officers.
- Zero Regression: Zero runtime crashes, no modifications to existing single-district TA logic.
- Temporal Dead Zone (TDZ): Strict lexical ordering in all React hooks and components (useState -> useMemo -> handlers).
- Production Safety: Must compile with Python exit 0, pass all pytest tests, pass npm lint (0 syntax errors), and pass npm build (exit 0).

---

### Task 1: Backend Aggregation Endpoint & Cache Invalidation

**Files:**
- Modify: `backend/routers/travel_allowance.py`
- Test: `tests/test_ta_statewide_summary.py`

**Interfaces:**
- Consumes: `travel_allowance_rosters` table, `cache` (SimpleTTLCache), `get_current_user` dependency.
- Produces: `GET /admin/ta/statewide-summary` returning summary object and district array.

- [ ] **Step 1: Write failing backend test suite**
Create `tests/test_ta_statewide_summary.py` testing:
1. `GET /admin/ta/statewide-summary` requires auth and rejects SUB_ADMIN with HTTP 403.
2. Allows `SUPER_ADMIN` and `MAIN_INCHARGE` with HTTP 200.
3. Correctly aggregates `total_km`, `gross_amount`, `deduction_amount`, `final_payable_amount`, `status_counts`, and `dispute_count`.
4. In-memory cache is invalidated when a roster mutation occurs.

- [ ] **Step 2: Run test to verify it fails**
Run: `pytest tests/test_ta_statewide_summary.py -v`
Expected: FAIL (404 endpoint not found).

- [ ] **Step 3: Implement `GET /admin/ta/statewide-summary` in `backend/routers/travel_allowance.py`**
1. Define response models or dictionary builder.
2. Add security check: `user_role in ("SUPER_ADMIN", "MAIN_INCHARGE")`. If not, raise `HTTPException(status_code=403, detail="Access denied. Only Super Admin and Main Incharge can view statewide TA.")`.
3. Check cache: `f"ta_statewide_summary_{month}"`. If cached and not `force_refresh`, return cached dict.
4. Execute SQL aggregation:
   ```sql
   SELECT 
       r.district,
       COUNT(r.id) AS total_officers,
       COALESCE(SUM(r.total_km), 0) AS total_km,
       COALESCE(SUM(r.gross_amount), 0) AS total_gross,
       COALESCE(SUM(r.deduction_amount), 0) AS total_deductions,
       COALESCE(SUM(r.final_payable_amount), 0) AS total_payable,
       COUNT(CASE WHEN r.status = 'APPROVED' THEN 1 END) AS approved_count,
       COUNT(CASE WHEN r.status = 'SUBMITTED' THEN 1 END) AS submitted_count,
       COUNT(CASE WHEN r.status = 'REVERTED' THEN 1 END) AS reverted_count,
       COUNT(CASE WHEN r.status = 'DRAFT' OR r.status IS NULL THEN 1 END) AS draft_count,
       COUNT(CASE WHEN r.has_dispute = true THEN 1 END) AS dispute_count,
       MAX(r.updated_at) AS last_updated_at
   FROM travel_allowance_rosters r
   WHERE r.month = %s
   GROUP BY r.district
   ORDER BY r.district ASC
   ```
5. Structure summary metadata (`total_districts`, `total_officers`, `total_km`, `total_gross`, `total_deductions`, `total_payable`, `approved_districts`, `pending_districts`, `disputed_districts`, `overall_completion_pct`).
6. Store in `cache.set(f"ta_statewide_summary_{month}", payload, ttl=60)`.
7. Add cache invalidation calls `cache.delete(f"ta_statewide_summary_{month}")` in mutation endpoints (`save-log`, `pass-staff`, `revert-staff`, `unlock-staff`, `submit-roster`, `resolve-dispute`).

- [ ] **Step 4: Run backend tests to verify they pass**
Run: `pytest tests/test_ta_statewide_summary.py -v`
Expected: PASS 100%.

- [ ] **Step 5: Verify Python compilation & commit**
Run: `python -m py_compile backend/routers/travel_allowance.py`
Commit: `git add backend/routers/travel_allowance.py tests/test_ta_statewide_summary.py && git commit -m "feat(ta-backend): implement statewide TA aggregation summary endpoint with RBAC and TTL caching"`

---

### Task 2: Frontend Data Hook Integration

**Files:**
- Modify: `dfy-frontend/src/hooks/useAdminTA.js`
- Modify: `dfy-frontend/src/hooks/useAdminModals.js`

**Interfaces:**
- Consumes: `GET /admin/ta/statewide-summary` via fetch.
- Produces: `statewideSummary`, `loadingStatewideSummary`, `statewideSummaryError`, `fetchStatewideSummary`.

- [ ] **Step 1: Update `useAdminTA.js`**
1. Add state:
   - `const [statewideSummary, setStatewideSummary] = useState(null);`
   - `const [loadingStatewideSummary, setLoadingStatewideSummary] = useState(false);`
   - `const [statewideSummaryError, setStatewideSummaryError] = useState('');`
2. Implement `fetchStatewideSummary(targetMonth, forceRefresh)`:
   - Fetch `/admin/ta/statewide-summary?month=${targetMonth || taMonth}${forceRefresh ? '&force_refresh=true' : ''}` with auth token.
   - Handle response, update `statewideSummary`, set error if failed.
3. Export from `useAdminTA`: `statewideSummary`, `loadingStatewideSummary`, `statewideSummaryError`, `fetchStatewideSummary`.

- [ ] **Step 2: Update `useAdminModals.js`**
1. Expose `statewideSummary`, `loadingStatewideSummary`, `statewideSummaryError`, `fetchStatewideSummary` from `useAdminModals` return object.

- [ ] **Step 3: Verification & Commit**
Run: `npm --prefix dfy-frontend run lint`
Commit: `git add dfy-frontend/src/hooks/useAdminTA.js dfy-frontend/src/hooks/useAdminModals.js && git commit -m "feat(ta-hook): add statewide summary state and fetcher to useAdminTA"`

---

### Task 3: Dedicated Statewide TA Tab Component (`TravelAllowanceTab.jsx`)

**Files:**
- Create: `dfy-frontend/src/components/Admin/tabs/TravelAllowanceTab.jsx`

**Interfaces:**
- Consumes: `activeMainTab`, `statewideSummary`, `loadingStatewideSummary`, `fetchStatewideSummary`, `month`, `setMonth`, `onInspectDistrict(district)`, `handleDownloadExcel`.
- Produces: Fully interactive tab UI with Top KPI Hero Cards, Action Bar, Dynamic Bento Cards Grid, Sortable Table View, and Inspect Roster trigger.

- [ ] **Step 1: Build `TravelAllowanceTab.jsx` structure**
1. Declare all `useState` hooks first (TDZ safety):
   - `searchQuery` (string)
   - `statusFilter` ('ALL' | 'PENDING' | 'APPROVED' | 'DISPUTES')
   - `viewMode` ('CARDS' | 'TABLE')
   - `sortField` (string)
   - `sortAsc` (boolean)
2. Add `useEffect` to trigger `fetchStatewideSummary(month)` when `activeMainTab === 'travel_allowance'` or `month` changes.
3. Compute filtered & sorted districts via `useMemo`.
4. Render:
   - **Header & Action Bar**: Month selector, search input, filter chips with counts, view switcher toggle (`🎴 Bento Cards` / `📋 Detailed Table`), Refresh button, and 1-Click "Statewide Excel Export" button.
   - **Top 4 KPI Hero Cards**: Total State Payable, Total Statewide KM, District Approval Completion Progress Bar, Attention Radar.
   - **Bento Cards Grid (Default)**: Dynamic cards for all districts (currently 22, scales to 38+) with progress bars, status badges, metrics, and "🔍 Inspect & Review Roster" button.
   - **Executive Table View (Toggleable)**: High-density sortable table with total summary row.
   - **Empty / Loading States**: Elegant skeleton loaders and empty state message when no data exists.

- [ ] **Step 2: Verification & Commit**
Run: `npm --prefix dfy-frontend run lint`
Commit: `git add dfy-frontend/src/components/Admin/tabs/TravelAllowanceTab.jsx && git commit -m "feat(ta-ui): create modern dynamic TravelAllowanceTab with bento cards and table views"`

---

### Task 4: Mount Tab in Navigation (`AdminHeader.jsx` & `AdminDashboard.jsx`)

**Files:**
- Modify: `dfy-frontend/src/components/Admin/AdminHeader.jsx`
- Modify: `dfy-frontend/src/AdminDashboard.jsx`

**Interfaces:**
- Consumes: `currentUser.role`, `activeMainTab`, `setActiveMainTab`.
- Produces: 4th tab button beside `District Benchmarks & Pacing`, mounts `TravelAllowanceTab` when active.

- [ ] **Step 1: Add Tab Button in `AdminHeader.jsx`**
1. In `AdminHeader.jsx` primary dashboard navigation tabs cluster:
   - Check condition: `(isSuperAdmin || currentUser?.role === 'MAIN_INCHARGE')`.
   - Render button:
     ```jsx
     {(isSuperAdmin || currentUser?.role === 'MAIN_INCHARGE') && (
       <button
         type="button"
         onClick={() => setActiveMainTab('travel_allowance')}
         className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs transition-all flex items-center gap-2 active:scale-95 shrink-0 cursor-pointer ${
           activeMainTab === 'travel_allowance'
             ? 'bg-teal-700 text-white shadow-sm shadow-teal-700/25 font-black'
             : 'bg-slate-50 hover:bg-teal-50/70 text-slate-700 hover:text-teal-900 border border-slate-200/90 font-bold'
         }`}
       >
         <span>🏍️</span>
         <span>Travel Allowance Statewide</span>
       </button>
     )}
     ```

- [ ] **Step 2: Mount `TravelAllowanceTab` in `AdminDashboard.jsx`**
1. Import `TravelAllowanceTab from './components/Admin/tabs/TravelAllowanceTab';`.
2. Connect `onInspectDistrict = (district) => { setTaDistrict(district); setShowTaModal(true); };`.
3. Render `TravelAllowanceTab` passing props (`activeMainTab`, `statewideSummary`, `loadingStatewideSummary`, `fetchStatewideSummary`, `month`, `setMonth`, `onInspectDistrict`, etc.).

- [ ] **Step 3: Verification & Commit**
Run: `npm --prefix dfy-frontend run lint`
Run: `npm --prefix dfy-frontend run build`
Commit: `git add dfy-frontend/src/components/Admin/AdminHeader.jsx dfy-frontend/src/AdminDashboard.jsx && git commit -m "feat(ta-ui): wire TravelAllowanceTab into AdminHeader and AdminDashboard navigation"`

---

### Task 5: End-to-End Integration Test Suite & Production Verification Gate

**Files:**
- Create: `tests/test_ta_statewide_tab_ui.mjs`
- Test: Full verification battery (Python compile, Pytest, Node regression, Lint, Build)

- [ ] **Step 1: Write Node UI verification test**
Create `tests/test_ta_statewide_tab_ui.mjs` verifying:
1. `AdminHeader.jsx` contains the `travel_allowance` tab button gated by role.
2. `AdminDashboard.jsx` imports and renders `TravelAllowanceTab`.
3. `TravelAllowanceTab.jsx` includes Hero KPI cards, Bento cards, Table toggle, search filtering, and drilldown inspection.

- [ ] **Step 2: Run test suite**
Run: `node tests/test_ta_statewide_tab_ui.mjs`
Expected: PASS 100%.

- [ ] **Step 3: Run Full Production Battery**
1. `python -m py_compile main.py backend/routers/travel_allowance.py` (Exit 0).
2. `pytest tests/test_ta_statewide_summary.py tests/test_travel_allowance_backend.py -v` (100% Pass).
3. `npm --prefix dfy-frontend run lint` (0 syntax errors).
4. `npm --prefix dfy-frontend run build` (Exit 0).

- [ ] **Step 4: Commit test suite**
Commit: `git add tests/test_ta_statewide_tab_ui.mjs && git commit -m "test(ta): add automated verification suite for statewide TA dashboard"`
