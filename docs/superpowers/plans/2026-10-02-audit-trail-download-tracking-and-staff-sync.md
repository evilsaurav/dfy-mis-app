# Audit Trail Filter Fix, Report Download Tracking & Unified Staff Live Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Activity Audit Trail filters, log all report downloads with user tracking, show download frequency counts per actor in the UI, and guarantee immediate cross-module synchronization whenever a staff member is added, edited, deleted, or toggled.

**Architecture:** 
1. Parameter normalization on `backend/routers/rbac_audit.py` to resolve both canonical and aliased filter keys (`action_type`/`action_filter`, `district`/`district_filter`, `user_id`/`user_filter`).
2. Instrumenting report download endpoints (`/download-kpi-workbook`, `/download-all-kpi-workbooks`, `/download-excel`, `/admin/export-attendance`) with `log_admin_activity("REPORT_DOWNLOADED", ...)`.
3. Adding a real-time memoized Download Intelligence Card in `AuditTrailModal.jsx` displaying total downloads and user-specific download counts with 1-click filtering.
4. Comprehensive backend cache invalidation across all 4 staff mutation endpoints (`staff_list_`, `staff_directory_`, `targets_`, `staff_targets_raw_`, `attendance_`, `statewide_top_`).
5. Wiring `fetchDirectory` and `loadTargets` into `useAdminModals.js` to execute coordinated state propagation across dropdowns, target modals, and attendance radar without manual browser reload.

**Tech Stack:** FastAPI (Python 3.11), React 18, Vite, Node.js test runners, Pytest.

**Spec:** `docs/superpowers/specs/2026-10-02-audit-trail-download-tracking-and-staff-sync-design.md`

## Global Constraints
- Production environment: Zero runtime crashes, blank/white screens, or data corruption.
- Strict Zero-Push Rule: Commit locally only. Do NOT run `git push`!
- `python -m py_compile main.py` must exit code 0.
- `npm --prefix dfy-frontend run lint` must have 0 syntax errors.
- `npm --prefix dfy-frontend run build` must succeed (exit code 0).
- Sub-Admin RBAC & Cross-District Isolation intact.
- Zero-Leakage Privacy Rule: ZERO mention of the Stealth 10 AM / 11 AM Cutoff in user-facing code, toasts, or logs.
- Temporal Dead Zone (TDZ) Rule: Strict lexical declaration order (base states -> derived collections -> handlers -> effects).

---

### Task 1: Audit Trail Parameter Normalization & Filter Dual-Key Support

**Files:**
- Modify: `backend/routers/rbac_audit.py:67-73, 350-406`
- Modify: `dfy-frontend/src/hooks/useAdminModals.js:790-820`
- Test: `tests/test_audit_trail_filters_normalization.mjs`

**Interfaces:**
- Consumes: `AuditLogQueryReq` in `rbac_audit.py`, `fetchAuditLogs` in `useAdminModals.js`.
- Produces: Normalized query processing accepting both `action_type`/`action_filter`, `district`/`district_filter`, `user_id`/`user_filter`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_audit_trail_filters_normalization.mjs`:
```javascript
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendPath = path.join(__dirname, '../backend/routers/rbac_audit.py');
const frontendPath = path.join(__dirname, '../dfy-frontend/src/hooks/useAdminModals.js');
const backendSrc = readFileSync(backendPath, 'utf8');
const frontendSrc = readFileSync(frontendPath, 'utf8');

console.log('🧪 Testing Audit Trail Filters Normalization...');

// 1. Backend Schema checks
assert.ok(
  backendSrc.includes('action_filter: Optional[str]') || backendSrc.includes('action_filter:'),
  'backend/routers/rbac_audit.py must accept action_filter in AuditLogQueryReq'
);
assert.ok(
  backendSrc.includes('district_filter: Optional[str]') || backendSrc.includes('district_filter:'),
  'backend/routers/rbac_audit.py must accept district_filter in AuditLogQueryReq'
);
assert.ok(
  backendSrc.includes('user_filter: Optional[str]') || backendSrc.includes('user_filter:'),
  'backend/routers/rbac_audit.py must accept user_filter in AuditLogQueryReq'
);

// 2. Effective Filter Fallbacks in get_audit_logs
assert.ok(
  backendSrc.includes('query.action_type or query.action_filter') || backendSrc.includes('query.action_filter or query.action_type'),
  'get_audit_logs must resolve effective_action from action_type or action_filter'
);
assert.ok(
  backendSrc.includes('query.district or query.district_filter') || backendSrc.includes('query.district_filter or query.district'),
  'get_audit_logs must resolve effective_district from district or district_filter'
);
assert.ok(
  backendSrc.includes('query.user_id or query.user_filter') || backendSrc.includes('query.user_filter or query.user_id'),
  'get_audit_logs must resolve effective_user from user_id or user_filter'
);

// 3. Frontend fetchAuditLogs sends both canonical and alias keys
assert.ok(
  frontendSrc.includes('action_type:') && frontendSrc.includes('action_filter:'),
  'useAdminModals.js must send action_type and action_filter'
);
assert.ok(
  frontendSrc.includes('district:') && frontendSrc.includes('district_filter:'),
  'useAdminModals.js must send district and district_filter'
);
assert.ok(
  frontendSrc.includes('user_id:') && frontendSrc.includes('user_filter:'),
  'useAdminModals.js must send user_id and user_filter'
);

console.log('✅ Audit Trail Filters Normalization Tests Passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_audit_trail_filters_normalization.mjs`
Expected: FAIL (missing fields in backend and frontend).

- [ ] **Step 3: Implement changes in `backend/routers/rbac_audit.py` & `dfy-frontend/src/hooks/useAdminModals.js`**

1. In `backend/routers/rbac_audit.py`:
Update `AuditLogQueryReq`:
```python
class AuditLogQueryReq(BaseModel):
    action_type: Optional[str] = None
    action_filter: Optional[str] = None
    district: Optional[str] = None
    district_filter: Optional[str] = None
    user_id: Optional[str] = None
    user_filter: Optional[str] = None
    search: Optional[str] = ""
    limit: Optional[int] = 300
```
In `get_audit_logs`:
```python
        effective_action = query.action_type or query.action_filter or "All"
        effective_district = query.district or query.district_filter or "All"
        effective_user = query.user_id or query.user_filter or "All"

        for doc in docs:
            d = doc.to_dict()
            log_time = d.get("timestamp", "")
            if log_time and log_time < cutoff_str:
                continue

            if effective_action != "All" and d.get("action_type") != effective_action:
                continue
            if effective_district != "All" and d.get("district") != effective_district:
                continue
            if effective_user != "All" and d.get("user_id") != effective_user:
                continue
            if query.search:
                s_lower = query.search.lower()
                text_to_search = f"{d.get('details', '')} {d.get('user_name', '')} {d.get('target_officer', '')} {d.get('district', '')} {d.get('ip_address', '')} {d.get('location', '')} {(d.get('diff') or {}).get('location', '')}".lower()
                if s_lower not in text_to_search:
                    continue
```

2. In `dfy-frontend/src/hooks/useAdminModals.js`:
In `fetchAuditLogs`:
```javascript
      const effectiveAction = overrideAction !== undefined ? overrideAction : auditFilterAction;
      const effectiveDist = overrideDist !== undefined ? overrideDist : auditFilterTarget;
      const effectiveUser = overrideUser !== undefined ? overrideUser : auditFilterAdmin;
      const effectiveSearch = overrideSearch !== undefined ? overrideSearch : auditSearchQuery;

      const res = await authFetch(`${API_BASE_URL}/admin/audit-logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action_type: effectiveAction,
          action_filter: effectiveAction,
          district: effectiveDist,
          district_filter: effectiveDist,
          user_id: effectiveUser,
          user_filter: effectiveUser,
          search: effectiveSearch,
          limit: 300
        })
      });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_audit_trail_filters_normalization.mjs`
Expected: PASS 100%

- [ ] **Step 5: Run quality checks and commit**

Run:
```bash
python -m py_compile main.py
npm --prefix dfy-frontend run lint
npm --prefix dfy-frontend run build
git add backend/routers/rbac_audit.py dfy-frontend/src/hooks/useAdminModals.js tests/test_audit_trail_filters_normalization.mjs
git commit -m "fix(audit): normalize filter parameter aliases across backend schema and frontend fetch"
```

---

### Task 2: Report Download Activity Logging & Download Analytics Summary

**Files:**
- Modify: `backend/routers/kpi.py:126-140, 830-845, 915-935`
- Modify: `backend/routers/attendance.py:1230-1250`
- Modify: `dfy-frontend/src/components/Admin/modals/AuditTrailModal.jsx:110-140`
- Test: `tests/test_report_download_audit_and_analytics.mjs`

**Interfaces:**
- Consumes: `log_admin_activity` in `backend/core/helpers.py`.
- Produces: `REPORT_DOWNLOADED` logs in database and download frequency badge counter in `AuditTrailModal.jsx`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_report_download_audit_and_analytics.mjs`:
```javascript
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const kpiPath = path.join(__dirname, '../backend/routers/kpi.py');
const attendancePath = path.join(__dirname, '../backend/routers/attendance.py');
const modalPath = path.join(__dirname, '../dfy-frontend/src/components/Admin/modals/AuditTrailModal.jsx');

const kpiSrc = readFileSync(kpiPath, 'utf8');
const attendanceSrc = readFileSync(attendancePath, 'utf8');
const modalSrc = readFileSync(modalPath, 'utf8');

console.log('🧪 Testing Report Download Audit Logging & UI Analytics...');

// 1. Backend KPI logging checks
assert.ok(kpiSrc.includes('REPORT_DOWNLOADED'), 'kpi.py must log REPORT_DOWNLOADED');
assert.ok(kpiSrc.includes('downloaded Consolidated Report') || kpiSrc.includes('Consolidated Excel'), 'kpi.py must log consolidated report downloads');
assert.ok(kpiSrc.includes('downloaded KPI Workbook'), 'kpi.py must log single KPI workbook downloads');
assert.ok(kpiSrc.includes('Bulk 33-District') || kpiSrc.includes('Bulk KPI'), 'kpi.py must log bulk KPI ZIP downloads');

// 2. Attendance export logging check
assert.ok(attendanceSrc.includes('REPORT_DOWNLOADED'), 'attendance.py must log REPORT_DOWNLOADED on export');

// 3. UI Download Stats computation in AuditTrailModal.jsx
assert.ok(modalSrc.includes('REPORT_DOWNLOADED'), 'AuditTrailModal.jsx must detect REPORT_DOWNLOADED logs');
assert.ok(modalSrc.includes('downloadStats') || modalSrc.includes('downloadsByUser'), 'AuditTrailModal.jsx must compute download stats by user');
assert.ok(modalSrc.includes('Downloads Breakdown') || modalSrc.includes('Report Downloads:'), 'AuditTrailModal.jsx must render download counts banner');

console.log('✅ Report Download Audit & UI Analytics Tests Passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_report_download_audit_and_analytics.mjs`
Expected: FAIL (missing logging and UI stats).

- [ ] **Step 3: Implement logging in `kpi.py` & `attendance.py` and Analytics card in `AuditTrailModal.jsx`**

1. In `backend/routers/kpi.py`:
- In `download_excel`:
  ```python
  actor_name = admin.get("name") or admin.get("username", "Admin")
  actor_id = admin.get("user_id") or admin.get("username", "admin")
  actor_role = admin.get("role", "SUB_ADMIN")
  await log_admin_activity(
      action_type="REPORT_DOWNLOADED",
      details=f"Admin {actor_name} downloaded Consolidated Excel for {target_month}",
      user_name=actor_name,
      user_id=actor_id,
      role=actor_role,
      diff={"report_type": "Consolidated Excel", "month": target_month}
  )
  ```
- In `download_kpi_workbook`:
  ```python
  actor_name = admin.get("name") or admin.get("username", "Admin")
  actor_id = admin.get("user_id") or admin.get("username", "admin")
  actor_role = admin.get("role", "SUB_ADMIN")
  await log_admin_activity(
      action_type="REPORT_DOWNLOADED",
      details=f"Admin {actor_name} downloaded KPI Workbook for {district or 'All'} ({target_month})",
      district=district if district and district != "All" else "",
      user_name=actor_name,
      user_id=actor_id,
      role=actor_role,
      diff={"report_type": "KPI Workbook", "district": district or "All", "month": target_month}
  )
  ```
- In `download_all_kpi_workbooks`:
  ```python
  actor_name = admin.get("name") or admin.get("username", "Admin")
  actor_id = admin.get("user_id") or admin.get("username", "admin")
  actor_role = admin.get("role", "SUB_ADMIN")
  await log_admin_activity(
      action_type="REPORT_DOWNLOADED",
      details=f"Admin {actor_name} downloaded Bulk 33-District KPI ZIP for {target_month}",
      user_name=actor_name,
      user_id=actor_id,
      role=actor_role,
      diff={"report_type": "Bulk KPI ZIP", "month": target_month}
  )
  ```

2. In `backend/routers/attendance.py`:
In `/admin/export-attendance`:
```python
    actor_name = admin.get("name") or admin.get("username", "Admin")
    actor_id = admin.get("user_id") or admin.get("username", "admin")
    actor_role = admin.get("role", "SUB_ADMIN")
    await log_admin_activity(
        action_type="REPORT_DOWNLOADED",
        details=f"Admin {actor_name} downloaded Attendance Excel for {date_str}",
        user_name=actor_name,
        user_id=actor_id,
        role=actor_role,
        diff={"report_type": "Attendance Excel", "date": date_str}
    )
```

3. In `dfy-frontend/src/components/Admin/modals/AuditTrailModal.jsx`:
Compute `downloadStats`:
```javascript
  const downloadStats = useMemo(() => {
    const downloadLogs = (auditLogsList || []).filter(l => l.action_type === 'REPORT_DOWNLOADED');
    const userCounts = {};
    downloadLogs.forEach(l => {
      const key = l.user_name || l.user_id || 'Unknown';
      userCounts[key] = (userCounts[key] || 0) + 1;
    });
    return {
      totalDownloads: downloadLogs.length,
      byUser: userCounts
    };
  }, [auditLogsList]);
```
Render download intelligence banner:
```jsx
        {/* Report Download Frequency Counter Banner */}
        {downloadStats.totalDownloads > 0 && (
          <div className="px-5 py-2.5 bg-emerald-50/80 border-b border-emerald-100 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-black text-emerald-900 flex items-center gap-1">
              <span>📥</span> Report Downloads Breakdown ({downloadStats.totalDownloads} Total):
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {Object.entries(downloadStats.byUser).map(([userName, count]) => (
                <span
                  key={userName}
                  className="bg-white border border-emerald-200 text-emerald-800 font-bold px-2 py-0.5 rounded-lg shadow-2xs flex items-center gap-1"
                >
                  <span className="text-slate-600">{userName}:</span>
                  <span className="font-black text-emerald-700">{count}x</span>
                </span>
              ))}
            </div>
          </div>
        )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_report_download_audit_and_analytics.mjs`
Expected: PASS 100%

- [ ] **Step 5: Run quality checks and commit**

Run:
```bash
python -m py_compile main.py
npm --prefix dfy-frontend run lint
npm --prefix dfy-frontend run build
git add backend/routers/kpi.py backend/routers/attendance.py dfy-frontend/src/components/Admin/modals/AuditTrailModal.jsx tests/test_report_download_audit_and_analytics.mjs
git commit -m "feat(audit): log report downloads and render user download frequency breakdown banner in audit trail"
```

---

### Task 3: Backend Staff Mutation Cache Invalidation Battery

**Files:**
- Modify: `backend/routers/staff.py:245-255, 300-310, 405-415, 470-475, 595-605`
- Test: `tests/test_staff_backend_invalidation.py`

**Interfaces:**
- Consumes: `cache` and `invalidate_staff_directory_cache` in `backend/core/cache.py`.
- Produces: Complete purge of `staff_list_`, `staff_directory_`, `targets_`, `staff_targets_raw_`, `attendance_`, and `statewide_top_` across all staff endpoints.

- [ ] **Step 1: Write the failing test**

Create `tests/test_staff_backend_invalidation.py`:
```python
import pytest
from unittest.mock import patch, MagicMock
from backend.routers.staff import add_staff_member, delete_staff_member, toggle_staff_status, update_staff_pin, AddStaffReq, DeleteStaffReq, ToggleStaffStatusReq, UpdatePinReq

@pytest.mark.asyncio
async def test_staff_mutations_invalidate_all_critical_cache_prefixes():
    with patch("backend.routers.staff.cache") as mock_cache, \
         patch("backend.routers.staff.invalidate_staff_directory_cache") as mock_inval_dir, \
         patch("backend.routers.staff.db") as mock_db, \
         patch("backend.routers.staff.log_admin_activity") as mock_log:
        
        # Setup mock db
        mock_doc = MagicMock()
        mock_doc.get.return_value = MagicMock(exists=False)
        mock_db.collection.return_value.document.return_value = mock_doc
        
        admin = {"role": "SUPER_ADMIN", "username": "admin", "name": "Super Admin"}
        req = AddStaffReq(district="Patna", name="Test Officer", pin="1234", designation="Field Officer", target=50)
        
        await add_staff_member(req, admin)
        
        # Verify staff_list_ was purged
        mock_cache.delete_prefix.assert_any_call("staff_list_")
        mock_cache.delete_prefix.assert_any_call("targets_")
        mock_cache.delete_prefix.assert_any_call("staff_targets_raw_")
        mock_cache.delete_prefix.assert_any_call("attendance_")
        mock_cache.delete_prefix.assert_any_call("statewide_top_")
        assert mock_inval_dir.called
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_staff_backend_invalidation.py -v`
Expected: FAIL (`AssertionError: 'staff_list_' not in calls`).

- [ ] **Step 3: Update `backend/routers/staff.py`**

In `add_staff_member`:
```python
        cache.delete_prefix("staff_list_")
        invalidate_staff_directory_cache()
        cache.delete_prefix("statewide_top_")
        cache.delete_prefix("attendance_")
        cache.delete_prefix("targets_")
        cache.delete_prefix("staff_targets_raw_")
        evict_officer_profile_cache(clean_dist, clean_name, get_ist_now().strftime("%Y-%m"))
```
In `update_staff_pin` and `update_staff_details`:
```python
        cache.delete_prefix("staff_list_")
        cache.delete(f"pin_{doc_id}")
        invalidate_staff_directory_cache()
        cache.delete_prefix("statewide_top_")
        cache.delete_prefix("attendance_")
        cache.delete_prefix("targets_")
        cache.delete_prefix("staff_targets_raw_")
        evict_officer_profile_cache(clean_dist, clean_name, current_month)
```
In `delete_staff_member`:
```python
        cache.delete_prefix("staff_list_")
        cache.delete(f"pin_{doc_id}")
        invalidate_staff_directory_cache()
        cache.delete_prefix("statewide_top_")
        cache.delete_prefix("attendance_")
        cache.delete_prefix("targets_")
        cache.delete_prefix("staff_targets_raw_")
        evict_officer_profile_cache(clean_dist, clean_name, get_ist_now().strftime("%Y-%m"))
```
In `toggle_staff_status`:
```python
        cache.delete_prefix("staff_list_")
        cache.delete(f"pin_{target_doc_id}")
        cache.delete(f"pin_{primary_id}")
        invalidate_staff_directory_cache()
        cache.delete_prefix("targets_")
        cache.delete_prefix("staff_targets_raw_")
        cache.delete_prefix("statewide_top_")
        cache.delete_prefix("attendance_")
        evict_officer_profile_cache(clean_dist, clean_fo, get_ist_now().strftime("%Y-%m"))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_staff_backend_invalidation.py -v`
Expected: PASS 100%

- [ ] **Step 5: Run quality checks and commit**

Run:
```bash
python -m py_compile main.py
pytest tests/ -q
git add backend/routers/staff.py tests/test_staff_backend_invalidation.py
git commit -m "fix(staff): invalidate staff_list_, targets_, and directory caches on all staff mutations"
```

---

### Task 4: Frontend Staff Live Sync Wiring & Coordinated State Refresh

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx:680-710`
- Modify: `dfy-frontend/src/hooks/useAdminModals.js:1290-1420`
- Test: `tests/test_staff_frontend_live_sync.mjs`

**Interfaces:**
- Consumes: `fetchDirectory`, `loadTargets` from `AdminDashboard.jsx`.
- Produces: Instant multi-subsystem state update whenever an officer is added/updated/deleted/toggled.

- [ ] **Step 1: Write the failing test**

Create `tests/test_staff_frontend_live_sync.mjs`:
```javascript
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardPath = path.join(__dirname, '../dfy-frontend/src/AdminDashboard.jsx');
const modalsHookPath = path.join(__dirname, '../dfy-frontend/src/hooks/useAdminModals.js');
const dashSrc = readFileSync(dashboardPath, 'utf8');
const modalsSrc = readFileSync(modalsHookPath, 'utf8');

console.log('🧪 Testing Frontend Staff Live Sync Wiring...');

// 1. Check AdminDashboard.jsx passes fetchDirectory and loadTargets into useAdminModals
assert.ok(
  dashSrc.includes('fetchDirectory,') || dashSrc.includes('fetchDirectory: fetchDirectory,'),
  'AdminDashboard.jsx must pass fetchDirectory to useAdminModals'
);
assert.ok(
  dashSrc.includes('loadTargets,') || dashSrc.includes('loadTargets: loadTargets,'),
  'AdminDashboard.jsx must pass loadTargets to useAdminModals'
);

// 2. Check useAdminModals.js executes coordinated refresh in handleExecuteAddStaff
const addStaffMatch = modalsSrc.match(/const handleExecuteAddStaff = async[\s\S]*?if \(res\.ok\) \{([\s\S]*?)\}/);
assert.ok(addStaffMatch, 'handleExecuteAddStaff function must exist');
const addStaffBody = addStaffMatch[1];
assert.ok(addStaffBody.includes('fetchDirectory'), 'handleExecuteAddStaff must call fetchDirectory()');
assert.ok(addStaffBody.includes('loadTargets'), 'handleExecuteAddStaff must call loadTargets()');
assert.ok(addStaffBody.includes('fetchStaffList'), 'handleExecuteAddStaff must call fetchStaffList()');

// 3. Check handleExecuteDeleteStaff & handleExecuteToggleStaffStatus
const deleteStaffMatch = modalsSrc.match(/const handleExecuteDeleteStaff = async[\s\S]*?if \(res\.ok\) \{([\s\S]*?)\}/);
assert.ok(deleteStaffMatch, 'handleExecuteDeleteStaff must exist');
assert.ok(deleteStaffMatch[1].includes('fetchDirectory'), 'handleExecuteDeleteStaff must call fetchDirectory()');

const toggleStaffMatch = modalsSrc.match(/const handleExecuteToggleStaffStatus = async[\s\S]*?if \(res\.ok\) \{([\s\S]*?)\}/);
assert.ok(toggleStaffMatch, 'handleExecuteToggleStaffStatus must exist');
assert.ok(toggleStaffMatch[1].includes('fetchDirectory'), 'handleExecuteToggleStaffStatus must call fetchDirectory()');

console.log('✅ Frontend Staff Live Sync Wiring Tests Passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_staff_frontend_live_sync.mjs`
Expected: FAIL (missing `fetchDirectory` in props and handlers).

- [ ] **Step 3: Implement in `AdminDashboard.jsx` & `useAdminModals.js`**

1. In `AdminDashboard.jsx`:
Pass `fetchDirectory`, `loadTargets`, and `selectedDistrict` into `useAdminModals`:
```javascript
  const modals = useAdminModals({
    ...
    fetchDirectory,
    loadTargets,
    selectedDistrict,
    month,
    topPerformersPeriod
  });
```

2. In `useAdminModals.js`:
Add parameters:
```javascript
export function useAdminModals({
  ...
  fetchDirectory,
  loadTargets,
  selectedDistrict = 'All',
  ...
}) {
```
In `handleExecuteAddStaff`, `handleExecuteDeleteStaff`, `handleExecuteToggleStaffStatus`, and `handleExecuteUpdatePin`:
```javascript
        await Promise.all([
          typeof fetchStaffList === 'function' ? fetchStaffList() : Promise.resolve(),
          typeof fetchDirectory === 'function' ? fetchDirectory() : Promise.resolve(),
          typeof loadTargets === 'function' ? loadTargets(selectedDistrict || 'All', month) : Promise.resolve(),
          typeof fetchAttendance === 'function' ? fetchAttendance(true) : Promise.resolve(),
          typeof fetchTopPerformers === 'function' ? fetchTopPerformers(topPerformersPeriod) : Promise.resolve()
        ]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_staff_frontend_live_sync.mjs`
Expected: PASS 100%

- [ ] **Step 5: Run quality checks and commit**

Run:
```bash
npm --prefix dfy-frontend run lint
npm --prefix dfy-frontend run build
git add dfy-frontend/src/AdminDashboard.jsx dfy-frontend/src/hooks/useAdminModals.js tests/test_staff_frontend_live_sync.mjs
git commit -m "fix(staff-sync): wire live cascade sync across directory, targets, staff list, and attendance"
```

---

### Task 5: Production Parity Regression Gate & Final Verification

**Files:**
- Test: All 182 pytest backend tests
- Test: All 13 Node test suites
- Test: Frontend lint & build

- [ ] **Step 1: Run Node regression battery**

```bash
node tests/test_audit_trail_filters_normalization.mjs
node tests/test_report_download_audit_and_analytics.mjs
node tests/test_staff_frontend_live_sync.mjs
node tests/test_dashboard_stale_cache_invalidation.mjs
node tests/test_secondary_indicators_fallback.mjs
node tests/test_cumulative_ledger_ingestion.mjs
node tests/test_admin_feed_prop_wiring.mjs
node tests/test_nikshay_modal_sync.mjs
node tests/test_journey_modal_handler.mjs
node tests/test_fo_inspector_all_district.mjs
node tests/test_notif_tray_data_flow.mjs
node tests/test_cascade_alerts_wiring.mjs
node tests/test_master_table_cohort_ui.mjs
node tests/test_admin_pacing_ui.mjs
```
Expected: All 14 test suites pass 100%.

- [ ] **Step 2: Run Python compilation and pytest battery**

```bash
python -m py_compile main.py
pytest tests/ -q
```
Expected: Exit code 0, 182+ tests passed, 0 failed.

- [ ] **Step 3: Run Frontend linter and production build**

```bash
npm --prefix dfy-frontend run lint
npm --prefix dfy-frontend run build
```
Expected: 0 syntax errors, Vite build exit code 0.

- [ ] **Step 4: Audit git diff against `origin/main`**

Verify zero unintended deletions, zero leaks of cutoffs, and strict sub-admin isolation.
Do NOT run `git push`. Present comprehensive evidence to the user.
