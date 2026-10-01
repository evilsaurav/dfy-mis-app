# Travel Allowance (TA) Surgical Remediation, Read Leak Optimization & UI/UX Studio Ergonomics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a surgical, feature-scoped remediation for the Travel Allowance (TA) module on `feat/travel-allowance-bike-log`: eliminate statewide 0-log Firestore read leaks, isolate Excel memory teardown under `TA_EXCEL_SEMAPHORE(1)`, cache monthly aggregates, prevent inverted odometer bugs, add `localStorage` draft recovery, eliminate nested scrollbars with sticky date columns, and enforce strict role hierarchy button gating based on district status.

**Architecture:** 
- **Backend (`main.py`)**: 
  - Restrict `get_ta_logs` to requested district, removing statewide stream fallback on 0-log districts.
  - Scope `save_ta_log` cache eviction to exact district/month keys instead of deleting all `ta_` statewide prefixes.
  - Query `get_ta_analytics` strictly for the requested month and cache results for 900s (15 min).
  - Wrap `export_travel_allowance_excel` under `ta_excel_semaphore = asyncio.Semaphore(1)` with district-filtered queries and explicit `wb = None; gc.collect()` teardown.
- **Frontend (`AdminDashboard.jsx`)**: 
  - Validate `final_reading >= initial_reading` to prevent silent corrupted distance preservation.
  - Non-destructive `fetchTaLog` error handling that retains existing state and displays warning toast.
  - Continuous `localStorage` auto-save (`dfy_ta_draft_${month}_${dist}_${staffKey}`) with instant crash recovery.
  - Lock Reports Studio TA container to single-scroll viewport (`h-screen overflow-hidden` wrapper with `flex-1 overflow-auto` table) and sticky Date/Day header and left columns.
  - Bind workflow buttons strictly to `district.status` and `currentUser.role`.

**Tech Stack:** FastAPI (Python 3.14), Google Cloud Firestore, React 19, Vite 8, Tailwind CSS, openpyxl, pytest.

**Spec:** [`docs/superpowers/specs/2026-09-28-ta-approval-hierarchy-and-dispute-system-design.md`](file:///d:/ignou/Mis%20field%20report/docs/superpowers/specs/2026-09-28-ta-approval-hierarchy-and-dispute-system-design.md)

## Global Constraints
- **Zero Push Rule**: All commits strictly remain on local branch `feat/travel-allowance-bike-log`. Zero pushes to `origin/main`.
- **Feature-Scoped**: Zero changes to KPI engines, attendance radar, or non-TA endpoints.
- **Temporal Dead Zone (TDZ) Rule**: In `AdminDashboard.jsx`, base state declarations must precede derived collections, hooks, and event handlers.
- **Production Safety**: Zero runtime crashes, blank screens, or data corruption.
- **Verification Gates**: Every task must pass Python compilation (`py_compile`), backend test suites, and frontend lint/build before committing.
- **Pros & Cons Transparency**: Explicitly detail architectural trade-offs, risks, and mitigations.

---

## Architectural Pros & Cons (Trade-Offs & Impact Analysis)

### 1. Isolated `TA_EXCEL_SEMAPHORE = asyncio.Semaphore(1)`
- **Pros**: Protects Render's 512MB RAM ceiling from concurrent Excel generation crashes without locking or slowing down attendance, login, or KPI routes.
- **Cons & Trade-offs**: If two admins in different districts export TA Excel simultaneously, the second admin waits 2–3 seconds for the first export to complete.
- **Mitigation**: Immediate frontend loading state (`isExporting`) with animated progress indicator preventing duplicate clicks.

### 2. Elimination of Statewide 0-Log Fallback Stream
- **Pros**: Reduces Firestore reads from ~50–100 reads down to 0 reads when querying empty or newly initialized districts; eliminates statewide document leakage.
- **Cons & Trade-offs**: Documents saved with non-canonical or misspelled district casing will not be automatically swept up unless canonicalized on save.
- **Mitigation**: `save_ta_log` and `build_ta_doc_id` strictly canonicalize district names before write.

### 3. Month-Scoped Analytics Query with 15-Minute TTL Cache
- **Pros**: Reduces Firestore reads on the analytics endpoint by 95% on initial load, and by 100% on subsequent tab clicks within 15 minutes.
- **Cons & Trade-offs**: YTD cumulative project KM is calculated within the active operational year rather than scanning the entire historical database back to inception.
- **Mitigation**: Targeted cache eviction on `save_ta_log` and `district-action` ensures live metrics update immediately when changes occur.

### 4. Client-Side `localStorage` Auto-Save & Non-Destructive State Recovery
- **Pros**: Zero data loss if internet disconnects, browser tab crashes, or server returns 500 during data entry.
- **Cons & Trade-offs**: Stale drafts could linger if multiple admins edit the same staff member from different computers.
- **Mitigation**: Drafts are cleared upon successful API save and scoped by `month`, `district`, and `staff_key`.

### 5. Single-Scroll Container with Sticky Header & Left Columns
- **Pros**: Completely eliminates the annoying double-scrollbar trap; allows seamless horizontal scrolling across 11 columns on laptops while keeping Date & Day visible.
- **Cons & Trade-offs**: Requires explicit z-index layering (`z-30` for top-left header intersection, `z-20` for header, `z-10` for sticky column) to prevent visual clipping.
- **Mitigation**: Rigorous visual testing across desktop and simulated mobile viewports.

---

### Task 1: Isolated Backend RAM & Firestore Read Leak Fixes (`main.py`)

**Files:**
- Modify: `main.py:9750-9800` (`get_ta_logs` query & cache)
- Modify: `main.py:9820-9930` (`save_ta_log` cache eviction)
- Modify: `main.py:10560-10625` (`get_ta_analytics` month-scoped query & 900s TTL cache)
- Modify: `main.py:10630-10700`, `main.py:10978-10985` (`export_travel_allowance_excel` query & memory cleanup)
- Test: `tests/test_travel_allowance_backend.py`
- Test: `tests/test_travel_allowance_excel_export.py`

**Interfaces:**
- Consumes: `travel_allowance_logs` collection, `cache` (`SimpleTTLCache`), `canonicalize_district`.
- Produces: 
  - `GET /api/ta-logs`: returns district logs without statewide fallback stream; caches empty list for 120s.
  - `POST /api/ta-logs/save`: target-evicts `ta_roster_{m}_{d}`, `ta_logs_{m}_{d}`, `ta_analytics_{m}_{d}`.
  - `GET /api/ta-logs/analytics`: month-scoped query with 15-min (900s) TTL cache.
  - `GET /api/ta-logs/export-excel`: district-filtered query + `del wb; gc.collect()` teardown.

- [ ] **Step 1: Write failing backend tests for empty district 0-read and month-scoped analytics**

Add tests to `tests/test_travel_allowance_backend.py`:
```python
@pytest.mark.asyncio
async def test_get_ta_logs_empty_district_does_not_stream_state():
    """Verify that an empty district returns empty list without querying statewide logs."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        admin_token = main.create_access_token({
            "user_id": "test_admin",
            "name": "Super Admin",
            "role": "SUPER_ADMIN"
        })
        res = await ac.get(
            "/api/ta-logs?month=2026-09&district=Sheohar",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert isinstance(data["logs"], list)

@pytest.mark.asyncio
async def test_ta_analytics_month_scoped_and_cached():
    """Verify TA analytics utilizes month-scoped querying and TTL caching."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        admin_token = main.create_access_token({
            "user_id": "test_admin",
            "name": "Super Admin",
            "role": "SUPER_ADMIN"
        })
        res = await ac.get(
            "/api/ta-logs/analytics?month=2026-09&district=Gaya",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["month"] == "2026-09"
        assert "total_ta_final_payable" in data
```

- [ ] **Step 2: Run tests to verify initial behavior**

Run: `python -m pytest tests/test_travel_allowance_backend.py -v`

- [ ] **Step 3: Implement surgical fixes in `main.py`**

1. In `get_ta_logs`:
   - Remove lines 9764–9767 (`if not query_docs: all_month = ...`).
   - If `query_docs` is empty, cache `[]` for 120s and return `{"success": True, "logs": []}`.
2. In `save_ta_log`:
   - Replace broad `cache.delete_prefix("ta_")` with targeted evictions:
     ```python
     clean_m = req.month.strip()
     clean_d = clean_dist.lower()
     cache.delete(f"ta_roster_{clean_m}_{clean_d}")
     cache.delete(f"ta_logs_{clean_m}_{clean_d}")
     cache.delete(f"ta_analytics_{clean_m}_{clean_d}")
     cache.delete(f"ta_analytics_{clean_m}_all")
     cache.delete("ta_analytics_all")
     ```
3. In `get_ta_analytics`:
   - Check cache: `cache_key = f"ta_analytics_{target_month}_{clean_dist.lower() if clean_dist else 'all'}_{allowed_scope}"`
   - Scope query strictly to `target_month`:
     ```python
     query = db.collection("travel_allowance_logs").where("month", "==", target_month)
     if clean_dist:
         query = query.where("district", "==", clean_dist)
     all_ta_docs = await asyncio.to_thread(lambda: list(query.stream()))
     ```
   - Store in `cache.set(cache_key, result, ttl=900)`.
4. In `export_travel_allowance_excel`:
   - Update `ta_docs` query to:
     ```python
     ta_docs = await asyncio.to_thread(lambda: list(
         db.collection("travel_allowance_logs")
         .where("month", "==", clean_month)
         .where("district", "==", clean_dist)
         .stream()
     ))
     ```
   - In `finally:` block:
     ```python
     finally:
         if wb:
             try:
                 wb.close()
             except Exception:
                 pass
             del wb
         output = None
         content_bytes = None
         gc.collect()
     ```

- [ ] **Step 4: Run tests and compilation verification**

Run: `python -m pytest tests/test_travel_allowance_backend.py tests/test_travel_allowance_excel_export.py -v`
Run: `python -m py_compile main.py`

- [ ] **Step 5: Commit changes locally**

```bash
git add main.py tests/test_travel_allowance_backend.py
git commit -m "fix(ta-backend): eliminate statewide read leaks and enforce isolated excel teardown"
```

---

### Task 2: Frontend Data Protection, Auto-Save Drafts & Inverted Reading Validation (`AdminDashboard.jsx`)

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx:4948-4987` (`fetchTaLog` non-destructive recovery)
- Modify: `dfy-frontend/src/AdminDashboard.jsx:5139-5171` (`handleUpdateDailyLog` validation)
- Modify: `dfy-frontend/src/AdminDashboard.jsx:5180-5210` (`localStorage` auto-save & restore)
- Test: `tests/test_ta_frontend_logic.mjs`

**Interfaces:**
- Consumes: `taDailyLogs`, `taMonth`, `taDistrict`, `taSelectedStaffKey`.
- Produces:
  - Form validation: rejects/warns when `final_reading < initial_reading`.
  - `localStorage` key: `dfy_ta_draft_${taMonth}_${taDistrict}_${taSelectedStaffKey}`.
  - Safe error recovery without wiping state on network drops.

- [ ] **Step 1: Write unit tests for frontend validation and draft recovery**

Create `tests/test_ta_frontend_logic.mjs`:
```javascript
import assert from 'node:assert';

// 1. Test Inverted Reading calculation guard
function calculateKm(initStr, finStr, isOverride, manualKm) {
  const init = Number(initStr) || 0;
  const fin = Number(finStr) || 0;
  if (isOverride) return Number(manualKm) || 0;
  if (init > 0 && fin > 0) {
    if (fin < init) return { error: "FINAL_LESS_THAN_INIT", km: 0 };
    return { error: null, km: fin - init };
  }
  return { error: null, km: 0 };
}

assert.deepStrictEqual(calculateKm("100", "150", false, 0), { error: null, km: 50 });
assert.deepStrictEqual(calculateKm("150", "100", false, 0), { error: "FINAL_LESS_THAN_INIT", km: 0 });
console.log("✅ All frontend logic unit tests passed!");
```

- [ ] **Step 2: Run unit test to verify baseline**

Run: `node tests/test_ta_frontend_logic.mjs`

- [ ] **Step 3: Implement validation and auto-save in `AdminDashboard.jsx`**

1. In `handleUpdateDailyLog`:
   ```javascript
   if (field === 'initial_reading' || field === 'final_reading' || field === 'is_override' || field === 'total_km') {
     const init = Number(updated.initial_reading) || 0;
     const fin = Number(updated.final_reading) || 0;
     if (!updated.is_override) {
       if (init > 0 && fin > 0) {
         if (fin < init) {
           updated.total_km = 0;
           updated.reading_error = "Final reading cannot be less than initial reading";
         } else {
           updated.total_km = fin - init;
           updated.reading_error = null;
         }
       } else {
         updated.total_km = 0;
         updated.reading_error = null;
       }
     } else {
       updated.total_km = Number(updated.total_km) || 0;
       updated.reading_error = null;
     }
     updated.amount = Math.round(updated.total_km * 4.0 * 100) / 100;
   }
   ```
2. In `fetchTaLog`:
   - In `catch (err)`:
     ```javascript
     console.error("Error fetching TA logs:", err);
     showToast("Network sync failed. Retaining current draft data.", "warning");
     // Do NOT reset setTaDailyLogs({})
     ```
3. Auto-save `localStorage` effect:
   ```javascript
   useEffect(() => {
     if (!taMonth || !taDistrict || !taSelectedStaffKey) return;
     const draftKey = `dfy_ta_draft_${taMonth}_${taDistrict}_${taSelectedStaffKey}`;
     if (Object.keys(taDailyLogs).length > 0) {
       try {
         localStorage.setItem(draftKey, JSON.stringify({
           daily_logs: taDailyLogs,
           deduction_amount: taDeductionAmount,
           deduction_reason: taDeductionReason,
           admin_remarks: taAdminRemarks,
           saved_at: Date.now()
         }));
       } catch (e) {
         console.warn("Local draft save error:", e);
       }
     }
   }, [taDailyLogs, taDeductionAmount, taDeductionReason, taAdminRemarks, taMonth, taDistrict, taSelectedStaffKey]);
   ```
4. Draft recovery upon staff selection:
   ```javascript
   // When selecting staff or on empty fetch result, check for existing draft in localStorage
   const draftKey = `dfy_ta_draft_${taMonth}_${taDistrict}_${targetKey}`;
   const savedDraftStr = localStorage.getItem(draftKey);
   if (savedDraftStr) {
     try {
       const draft = JSON.parse(savedDraftStr);
       if (draft && draft.daily_logs && Object.keys(draft.daily_logs).length > 0) {
         setTaDailyLogs(draft.daily_logs);
         if (draft.deduction_amount) setTaDeductionAmount(draft.deduction_amount);
         if (draft.deduction_reason) setTaDeductionReason(draft.deduction_reason);
         if (draft.admin_remarks) setTaAdminRemarks(draft.admin_remarks);
         showToast("Restored unsaved draft from local storage.", "info");
       }
     } catch (e) {
       console.warn("Draft restore failed", e);
     }
   }
   ```
5. Clear draft on successful save:
   ```javascript
   const draftKey = `dfy_ta_draft_${taMonth}_${taDistrict}_${sKey}`;
   localStorage.removeItem(draftKey);
   ```

- [ ] **Step 4: Verify frontend lint and build**

Run: `npm --prefix dfy-frontend run lint`
Run: `npm --prefix dfy-frontend run build`

- [ ] **Step 5: Commit changes locally**

```bash
git add dfy-frontend/src/AdminDashboard.jsx tests/test_ta_frontend_logic.mjs
git commit -m "feat(ta-frontend): add inverted reading guard, draft auto-save and non-destructive error recovery"
```

---

### Task 3: Frontend Single-Scroll Ergonomics, Sticky Columns & Role-Based Workflow State Machine (`AdminDashboard.jsx`)

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx:10365-10370` (Viewport container lock)
- Modify: `dfy-frontend/src/AdminDashboard.jsx:11150-11260` (Role action button visibility state machine)
- Modify: `dfy-frontend/src/AdminDashboard.jsx:11740-11860` (Single-scroll table, sticky headers, sticky Date/Day columns)
- Test: `tests/test_ta_workflow_state_machine.mjs`

**Interfaces:**
- Consumes: `taDistrictStatus`, `currentUser.role`, `isSuperAdmin`, `canManageTa`.
- Produces:
  - Clean single-scroll viewport without nested double-scrollbars.
  - Sticky Date and Day columns with solid background during horizontal pan.
  - Accurate button visibility based on district workflow state:
    - `DRAFT` / `REVERTED`: MIS / Sub-Admin sees "Submit Roster to Incharge".
    - `SUBMITTED`: Main Incharge / Super Admin sees "Approve District" & "Revert District".
    - `APPROVED`: District locked. Incharge / Super Admin sees "Revert to Draft" if corrections needed.

- [ ] **Step 1: Write test for workflow button visibility state machine**

Create `tests/test_ta_workflow_state_machine.mjs`:
```javascript
import assert from 'node:assert';

function getVisibleActions(role, canManageTa, districtStatus) {
  const actions = [];
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const isSubAdmin = role === 'SUB_ADMIN' || role === 'MIS';
  const isIncharge = role === 'MAIN_INCHARGE' || isSuperAdmin;

  // Sub-Admin / MIS actions
  if ((isSubAdmin && canManageTa) || isSuperAdmin) {
    if (districtStatus === 'DRAFT' || districtStatus === 'REVERTED') {
      actions.push('SUBMIT_ROSTER');
    }
  }

  // Incharge / Super Admin actions
  if (isIncharge) {
    if (districtStatus === 'SUBMITTED' || districtStatus === 'DISPUTED') {
      actions.push('APPROVE_ROSTER');
      actions.push('REVERT_ROSTER');
    } else if (districtStatus === 'APPROVED') {
      actions.push('REVERT_ROSTER'); // Allow emergency unlock
    }
  }

  return actions;
}

// Test Sub-Admin on DRAFT
assert.deepStrictEqual(getVisibleActions('SUB_ADMIN', true, 'DRAFT'), ['SUBMIT_ROSTER']);
// Test Sub-Admin on SUBMITTED
assert.deepStrictEqual(getVisibleActions('SUB_ADMIN', true, 'SUBMITTED'), []);
// Test Incharge on SUBMITTED
assert.deepStrictEqual(getVisibleActions('MAIN_INCHARGE', false, 'SUBMITTED'), ['APPROVE_ROSTER', 'REVERT_ROSTER']);
// Test Incharge on DRAFT
assert.deepStrictEqual(getVisibleActions('MAIN_INCHARGE', false, 'DRAFT'), []);
// Test Super Admin on APPROVED
assert.deepStrictEqual(getVisibleActions('SUPER_ADMIN', true, 'APPROVED'), ['REVERT_ROSTER']);

console.log("✅ All workflow state machine tests passed!");
```

- [ ] **Step 2: Run test to verify state machine**

Run: `node tests/test_ta_workflow_state_machine.mjs`

- [ ] **Step 3: Implement single scroll container, sticky columns, and button gating in `AdminDashboard.jsx`**

1. Outer container lock:
   - When `reportsStudioTab === 'ta_payout' && isTaFullscreen`, set container to:
     `"flex-1 overflow-hidden flex flex-col p-4 sm:p-6 bg-slate-50"`
2. Screen 1 & Screen 2 role action button gating:
   - Bind "Submit Roster to Incharge" strictly to:
     `((isSuperAdmin || canManageTa) && (taDistrictStatus === 'DRAFT' || taDistrictStatus === 'REVERTED'))`
   - Bind "Approve District" strictly to:
     `((currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'MAIN_INCHARGE') && (taDistrictStatus === 'SUBMITTED' || taDistrictStatus === 'DISPUTED'))`
   - Bind "Revert District" strictly to:
     `((currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'MAIN_INCHARGE') && (taDistrictStatus === 'SUBMITTED' || taDistrictStatus === 'DISPUTED' || taDistrictStatus === 'APPROVED'))`
3. Single scroll table with sticky Date and Day columns:
   - Container: `className="flex-1 overflow-auto custom-scrollbar border border-slate-200 rounded-2xl bg-white shadow-xs"`
   - Header row:
     ```jsx
     <thead className="sticky top-0 z-20 bg-slate-900 text-white font-bold text-xs shadow-xs">
       <tr>
         <th className="sticky left-0 z-30 bg-slate-900 px-3.5 py-3 text-center min-w-[100px] border-r border-slate-800">Date</th>
         <th className="sticky left-[100px] z-30 bg-slate-900 px-2.5 py-3 text-center min-w-[65px] border-r border-slate-800">Day</th>
         <th className="px-3.5 py-3 text-center min-w-[140px]">Initial Reading (KM)</th>
         ...
       </tr>
     </thead>
     ```
   - Body cells for Date and Day:
     ```jsx
     <td className={`sticky left-0 z-10 px-3.5 py-2 text-center font-bold text-slate-700 tabular-num whitespace-nowrap border-r border-slate-100 ${isSunday ? 'bg-indigo-50' : 'bg-white'}`}>
       {day.dateStr}
     </td>
     <td className={`sticky left-[100px] z-10 px-2.5 py-2 text-center font-bold text-[11px] border-r border-slate-100 ${isSunday ? 'bg-indigo-50 text-indigo-600' : 'bg-white text-slate-500'}`}>
       {day.dayName}
     </td>
     ```
   - Visual validation warning banner for `entry.reading_error`:
     If `entry.reading_error`, highlight row with subtle amber border and red tooltip icon `⚠️ Final < Initial`.
   - Read-only locking when `taDistrictStatus === 'APPROVED'`:
     Disable inputs and show locked badge if `taDistrictStatus === 'APPROVED'`.

- [ ] **Step 4: Run frontend lint and build verification**

Run: `npm --prefix dfy-frontend run lint`
Run: `npm --prefix dfy-frontend run build`

- [ ] **Step 5: Commit changes locally**

```bash
git add dfy-frontend/src/AdminDashboard.jsx tests/test_ta_workflow_state_machine.mjs
git commit -m "feat(ta-ui): resolve nested scrollbar trap, add sticky columns and bind workflow buttons to district status"
```

---

### Task 4: Full App Verification, Read/Write Profiling & Evidence Report

**Files:**
- Test all backend suites: `pytest tests/test_travel_allowance_*.py`
- Test frontend build: `npm --prefix dfy-frontend run build`
- Test frontend linter: `npm --prefix dfy-frontend run lint`

- [ ] **Step 1: Run comprehensive backend test battery**

Run: `python -m pytest tests/test_travel_allowance_backend.py tests/test_travel_allowance_excel_export.py -v`
Run: `python -m py_compile main.py`

- [ ] **Step 2: Run frontend verification battery**

Run: `node tests/test_ta_frontend_logic.mjs`
Run: `node tests/test_ta_workflow_state_machine.mjs`
Run: `npm --prefix dfy-frontend run lint`
Run: `npm --prefix dfy-frontend run build`

- [ ] **Step 3: Measure local API and Read/Write footprint**

Profile network request counts:
- Screen 1 Roster load: exactly 1 roster call + 1 analytics call.
- Screen 2 Day-by-Day load: 0 network calls (reads from loaded roster and localStorage).
- Subsequent clicks on same district/month within 300s/900s: 0 Firestore reads (served from backend memory cache).
- Excel export: exactly 1 district-filtered query instead of statewide collection scan.

- [ ] **Step 4: Review `git diff` audit**

Run: `git diff --stat`
Ensure only TA-scoped files (`main.py`, `AdminDashboard.jsx`, and TA test files) were modified.

- [ ] **Step 5: Final summary report**

Provide detailed metrics and verification evidence to the user. Maintain all changes on `feat/travel-allowance-bike-log` branch without pushing.
