# Incremental Delta-Sync & Zero-Bill Firestore Read Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement true incremental delta synchronization and an anti-wipe in-memory cache to reduce Firestore reads per dashboard refresh from ~5,000 reads to <5 reads, eliminating cloud billing and guaranteeing permanent ₹0 Free Tier operations.

**Architecture:** 
1. The backend preserves monthly report caches in RAM (`shared_raw_month_{month_prefix}`) across submissions using in-place upserts instead of full-cache evictions.
2. `POST /admin/dashboard-data` filters records modified after `req.since` to return `mode: DELTA` and tombstones for deletions.
3. Sub-Admin cold queries are partitioned by assigned districts rather than streaming the whole state.
4. The frontend performs O(N) Map-based delta merging, background 45s silent polling, and uses a smart refresh button that avoids multi-stream redundancy.

**Tech Stack:** Python 3.11+, FastAPI, Google Cloud Firestore, React 19, Vite, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-09-22-incremental-delta-sync-and-read-optimization-design.md`

## Global Constraints
- Temporal Dead Zone (TDZ) & Hook Order Prevention: Base state declared before derived collections, handlers before effects.
- Strict Sub-Admin RBAC: Sub-admins must never receive or view data outside their permitted districts.
- Zero Loss of Data: Delta merging must update modified rows in-place and remove tombstones without duplicating or dropping reports.
- Verification Battery: `python -m py_compile main.py`, `npm run lint` (0 errors), `npm run build` (exit 0) before completion.
- User Approval Gate: Local commits first; explicit approval required before `git push origin main`.

---

### Task 1: Backend In-Memory Upsert Engine & Anti-Wipe Mutation Tracker (`main.py`)

**Files:**
- Modify: `main.py:488-601`
- Test: `tests/test_incremental_delta_sync.py`

**Interfaces:**
- Produces: `upsert_in_memory_report(month_prefix: str, report_data: dict, action: str = "submit")`
- Modifies: `record_report_mutation(action: str, doc_id: str, district: str, date: str, old_district: str, report_data: Optional[dict] = None)`

- [x] **Step 1: Write failing test in `tests/test_incremental_delta_sync.py`**
...
- [x] **Step 2: Run test to verify it fails**
...
- [x] **Step 3: Implement `upsert_in_memory_report` and modify `record_report_mutation` in `main.py`**
...
- [x] **Step 4: Run test to verify it passes**
...
- [x] **Step 5: Verify Python compilation & commit**

```bash
python -m py_compile main.py
git add main.py tests/test_incremental_delta_sync.py
git commit -m "feat(backend): implement in-memory report upsert and anti-wipe mutation tracking"
```

---

### Task 2: Backend `POST /admin/dashboard-data` Incremental Delta Response Engine (`main.py`)

**Files:**
- Modify: `main.py:603-770`
- Test: `tests/test_incremental_delta_sync.py`

**Interfaces:**
- Consumes: `LAST_REPORTS_MODIFIED_TS`, `DELETED_REPORTS_TOMBSTONES`, `get_raw_monthly_reports`
- Produces: Response dictionary with `mode: "NO_CHANGE" | "DELTA" | "FULL"`, `records: list`, `deleted_ids: list`, `synced_at: str`

- [x] **Step 1: Write failing test for delta responses in `tests/test_incremental_delta_sync.py`**

```python
import pytest
from main import app
from fastapi.testclient import TestClient

client = TestClient(app)

def test_dashboard_data_delta_response(monkeypatch):
    import main
    month_prefix = "2026-09"
    cache_key = f"shared_raw_month_{month_prefix}"
    
    mock_reports = [
        {"id": "gaya_fo1_2026-09-01", "working_place": "Gaya", "fo_name": "FO 1", "date_of_reporting": "2026-09-01", "submitted_at": "2026-09-22 10:00:00"},
        {"id": "gaya_fo2_2026-09-02", "working_place": "Gaya", "fo_name": "FO 2", "date_of_reporting": "2026-09-02", "submitted_at": "2026-09-22 18:00:00", "last_edited_at": "2026-09-22 21:00:00"},
    ]
    main.cache.set(cache_key, mock_reports, ttl=3600)
    main.LAST_REPORTS_MODIFIED_TS = 1790100000.0 # recent mutation

    # Query with since = "2026-09-22 12:00:00"
    # Only report 2 was edited after 12:00:00!
    payload = {
        "month_prefix": month_prefix,
        "since": "2026-09-22 12:00:00",
        "cached_count": 1,
        "districts": "Gaya"
    }
    headers = {"Authorization": "Bearer mock_state_admin_token"} # Use mock auth helper
```

- [x] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_incremental_delta_sync.py -k "test_dashboard_data_delta_response" -v`  
Expected: FAIL (`mode` is `FULL` instead of `DELTA` or returns full array)

- [x] **Step 3: Implement delta filtering in `get_dashboard_data` (`main.py`)**

In `get_dashboard_data`:
1. Check if `req.since` is provided, `not req.force_refresh`, and in-memory `shared_raw_month_{month_prefix}` exists.
2. If `req.since >= last_mut_str`: Return `mode: "NO_CHANGE"`.
3. If `req.since < last_mut_str`:
   Extract delta records from cached raw reports where `(d.get("last_edited_at") or d.get("timestamp_completed") or d.get("submitted_at") or "") > str(req.since).strip()`.
   Filter by Sub-Admin `allowed_dist_set`.
   Format indicators and return `mode: "DELTA"`, `records: formatted_delta`, `deleted_ids: recent_deletions`.
4. If no `req.since` or cold cache or `req.force_refresh`: Return `mode: "FULL"`.

- [x] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_incremental_delta_sync.py -k "test_dashboard_data_delta_response" -v`  
Expected: PASS

- [x] **Step 5: Verify Python compilation & commit**

```bash
python -m py_compile main.py
git add main.py tests/test_incremental_delta_sync.py
git commit -m "feat(backend): implement incremental delta response mode in get_dashboard_data"
```

---

### Task 3: Backend Sub-Admin Cold-Start District Query Optimization (`main.py`)

**Files:**
- Modify: `main.py:565-601`
- Test: `tests/test_incremental_delta_sync.py`

**Interfaces:**
- Consumes: `admin.get("allowed_districts")`, `canonicalize_district`
- Modifies: `get_raw_monthly_reports` to accept optional `districts: Optional[Set[str]] = None`

- [x] **Step 1: Write failing test in `tests/test_incremental_delta_sync.py`**

```python
def test_subadmin_cold_query_scoped_to_district(monkeypatch):
    # Verify that when get_raw_monthly_reports is called with district_filter,
    # it only fetches documents belonging to that district rather than the entire collection.
```

- [x] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_incremental_delta_sync.py -k "test_subadmin_cold_query_scoped_to_district" -v`  
Expected: FAIL

- [x] **Step 3: Implement district-scoped query in `get_raw_monthly_reports`**

In `get_raw_monthly_reports`:
If `districts` is specified and does not contain `"all"` / `"All"`:
- Partition queries by canonical district or query by date range and isolate by district key.
- Save to a district-partitioned cache key `f"shared_raw_month_{month_prefix}_{district_tag}"` so sub-admins don't overwrite the statewide cache.

- [x] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_incremental_delta_sync.py -k "test_subadmin_cold_query_scoped_to_district" -v`  
Expected: PASS

- [x] **Step 5: Commit**

```bash
python -m py_compile main.py
git add main.py tests/test_incremental_delta_sync.py
git commit -m "feat(backend): partition sub-admin cold queries by district to eliminate statewide scans"
```

---

### Task 4: Frontend Map-Based Delta-Merge in `fetchData` (`AdminDashboard.jsx`)

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx:2629-2715`
- Test: `tests/test_delta_merge.mjs`

**Interfaces:**
- Consumes: `data.mode`, `data.records`, `data.deleted_ids`, `data.synced_at`
- Produces: Seamlessly updated `rawRecords` state in React without full table unmounting or blank screen flickers.

- [x] **Step 1: Write failing Node test in `tests/test_delta_merge.mjs`**

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';

// Test harness simulating AdminDashboard delta merge logic
function mergeDelta(prevRecords, data) {
  if (data.mode === 'NO_CHANGE') return prevRecords;
  if (data.mode === 'DELTA') {
    const map = new Map(prevRecords.map(r => [r.id || r.doc_id, r]));
    (data.deleted_ids || []).forEach(delId => map.delete(delId));
    (data.records || []).forEach(newRec => {
      const id = newRec.id || newRec.doc_id;
      if (id) map.set(id, newRec);
    });
    return Array.from(map.values());
  }
  return data.records || [];
}

test('mergeDelta inserts new records into existing array without duplicates', () => {
  const initial = [
    { id: 'rec_1', fo_name: 'FO 1', notifications: 10 },
    { id: 'rec_2', fo_name: 'FO 2', notifications: 20 },
  ];
  const delta = {
    mode: 'DELTA',
    records: [
      { id: 'rec_2', fo_name: 'FO 2', notifications: 25 }, // update
      { id: 'rec_3', fo_name: 'FO 3', notifications: 5 },  // new
    ],
    deleted_ids: ['rec_1'] // delete
  };

  const result = mergeDelta(initial, delta);
  assert.equal(result.length, 2);
  assert.equal(result.find(r => r.id === 'rec_1'), undefined);
  assert.equal(result.find(r => r.id === 'rec_2').notifications, 25);
  assert.equal(result.find(r => r.id === 'rec_3').notifications, 5);
});
```

- [x] **Step 2: Run test to verify it passes initial logic**

Run: `node tests/test_delta_merge.mjs`  
Expected: PASS

- [x] **Step 3: Implement Map-Based Delta-Merge in `AdminDashboard.jsx` (`fetchData`)**

Update `fetchData` in `AdminDashboard.jsx`:
1. When `data.mode === 'NO_CHANGE'`, set status `UP_TO_DATE` and do not re-render records.
2. When `data.mode === 'DELTA'`, execute `setRawRecords` using `Map(prev.map(r => [r.id || r.doc_id, r]))`, applying deletions and delta upserts.
3. Save updated records to `localStorage`.
4. Update `lastSyncedTime`.

- [x] **Step 4: Verify frontend lint and build**

Run:
```bash
npm --prefix dfy-frontend run lint
npm --prefix dfy-frontend run build
```
Expected: 0 errors, build code 0.

- [x] **Step 5: Commit**

```bash
git add dfy-frontend/src/AdminDashboard.jsx tests/test_delta_merge.mjs
git commit -m "feat(frontend): implement Map-based incremental delta merge in AdminDashboard"
```

---

### Task 5: Frontend Silent Background Auto-Sync & Smart Refresh Button (`AdminDashboard.jsx`)

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx`
- Test: `tests/test_delta_merge.mjs`

**Interfaces:**
- Consumes: `fetchData`, `lastSyncedTime`, `isAuthenticated`
- Produces: 45s silent delta interval, window onfocus listener, smart refresh button.

- [x] **Step 1: Write test verifying smart refresh behavior**

Verify that non-forced refresh does not purge localStorage or pass `force_refresh: true`.

- [x] **Step 2: Implement 45s silent polling and window focus listener in `AdminDashboard.jsx`**

1. In `AdminDashboard.jsx`, add `useEffect` interval for 45 seconds when `isAuthenticated`:
   ```javascript
   useEffect(() => {
     if (!isAuthenticated) return;
     const intervalId = setInterval(() => {
       fetchData(false, true); // silent = true
     }, 45000);
     return () => clearInterval(intervalId);
   }, [isAuthenticated, month]);
   ```
2. Add `window.addEventListener('focus', ...)` to trigger delta sync on tab switch.
3. Redesign line 4303 (Refresh Button):
   - Single Click: calls `fetchData(false)` + `fetchAttendance(false)`. Targets and directory are preserved from memory.
   - Shift + Click: calls `fetchData(true)` + full reset for intentional diagnostic bypass.

- [x] **Step 3: Verify frontend lint and build**

Run:
```bash
npm --prefix dfy-frontend run lint
npm --prefix dfy-frontend run build
```
Expected: 0 errors, build code 0.

- [x] **Step 4: Commit**

```bash
git add dfy-frontend/src/AdminDashboard.jsx tests/test_delta_merge.mjs
git commit -m "feat(frontend): add 45s silent auto-sync and optimize Refresh button to delta mode"
```

---

### Task 6: Full System Integration, Verification Battery & User Push Gate

**Files:**
- Audit: All modified backend & frontend files

- [x] **Step 1: Run complete backend automated test suite**

Run: `pytest tests/test_incremental_delta_sync.py tests/test_attendance_leaves_and_lifecycle.py tests/test_ingestion_defense.py -v`  
Expected: All tests pass.

- [x] **Step 2: Run complete frontend node test suites**

Run: `node tests/test_delta_merge.mjs; node tests/test_form_ingestion_gate.mjs; node tests/test_duplicate_radar_repair.mjs; node tests/test_offline_queue.mjs`  
Expected: All tests pass.

- [x] **Step 3: Run Python compilation and Frontend production build**

Run:
```bash
python -m py_compile main.py
npm --prefix dfy-frontend run lint
npm --prefix dfy-frontend run build
```
Expected: All exit with code 0, 0 lint errors.

- [x] **Step 4: Inspect Git Diff Audit**

Run: `git diff HEAD~5`  
Expected: Only intended delta sync and read optimization changes present.

- [x] **Step 5: Present results to User for Approval Gate before Push**

Request explicit user approval per GEMINI.md Rule 5.
