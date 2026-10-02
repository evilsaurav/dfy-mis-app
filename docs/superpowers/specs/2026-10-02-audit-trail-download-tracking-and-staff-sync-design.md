# Design Specification: Audit Trail Filter Fix, Report Download Tracking & Unified Staff Live Sync

- **Date**: October 2, 2026
- **Status**: Draft / Under Review
- **Author**: Pair Programming with User
- **Target Environments**:
  - Backend: FastAPI Python 3.11 (`backend/routers/rbac_audit.py`, `backend/routers/staff.py`, `backend/routers/kpi.py`, `backend/routers/attendance.py`)
  - Frontend: React 18 / Vite (`dfy-frontend/src/AdminDashboard.jsx`, `dfy-frontend/src/hooks/useAdminModals.js`, `dfy-frontend/src/components/Admin/modals/AuditTrailModal.jsx`)

---

## 1. Executive Problem Statement & User Intent

### 1.1 Problem 1: Audit Trail Filters Ineffective
In the Activity Audit Trail modal, changing dropdowns (Action Filter, District Filter, Actor/Admin Filter) or entering search terms currently fails to filter server logs.
**Root Cause**: In `useAdminModals.js`, the client sends `{ action_filter, district_filter, user_filter, search }`, whereas the backend Pydantic schema in `backend/routers/rbac_audit.py` strictly binds `{ action_type, district, user_id, search }`. Extra fields were discarded, leaving default `"All"` filters.

### 1.2 Problem 2: Audit Trail Lacks Report Download Frequency Tracking
The user explicitly requires: *"audit trail mein ek aur chiiz add kro kon kitni baar report studio se report download kiya hai"* (Track who downloaded reports from Report Studio and how many times).
Currently, none of the workbook or Excel download endpoints (`/download-kpi-workbook`, `/download-all-kpi-workbooks`, `/download-excel`, `/admin/export-attendance`) invoke `log_admin_activity("REPORT_DOWNLOADED", ...)`. Furthermore, the Audit Trail UI has no summary indicator aggregating download counts by actor.

### 1.3 Problem 3: Newly Added Staff Fails to Sync Everywhere
When an administrator registers a new officer via the Staff Management modal, the officer does not appear in district FO dropdowns, the Target Setting modal, or the Pacing table without a manual browser hard reload.
**Root Causes**:
1. **Backend Cache Retention**: `backend/routers/staff.py` caches `/admin/staff/list` under key `staff_list_*` for 1,800 seconds (30 minutes). On staff mutations (`add`, `delete`, `toggle-status`, `update-pin`), `cache.delete_prefix("staff_list_")` was not executed.
2. **Frontend State Desynchronization**: `useAdminModals.js` only re-fetched `fetchStaffList()`. It did not invoke `fetchDirectory()` (which populates `staffDirectory` for district dropdowns and target modals) nor `loadTargets()`. Neither function was passed into `useAdminModals`.

---

## 2. Detailed Technical Architecture & Requirements

### 2.1 Audit Trail Filter Parameter Normalization (`backend/routers/rbac_audit.py`)
Update `AuditLogQueryReq` to support canonical keys and frontend aliases:
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
In `get_audit_logs(query, admin)`:
```python
effective_action = query.action_type or query.action_filter or "All"
effective_district = query.district or query.district_filter or "All"
effective_user = query.user_id or query.user_filter or "All"

# Apply filters
if effective_action != "All" and d.get("action_type") != effective_action:
    continue
if effective_district != "All" and d.get("district") != effective_district:
    continue
if effective_user != "All" and d.get("user_id") != effective_user:
    continue
```

### 2.2 Report Download Activity Logging & Frequency Aggregation

#### 2.2.1 Backend Logging on Download Endpoints
Instrument the following endpoints with `log_admin_activity("REPORT_DOWNLOADED", ...)`:
1. `backend/routers/kpi.py`:
   - `/download-kpi-workbook`: Log district, month, user details.
   - `/download-all-kpi-workbooks`: Log bulk ZIP generation with month and user details.
   - `/download-excel`: Log consolidated Excel download.
2. `backend/routers/attendance.py`:
   - `/admin/export-attendance`: Log attendance Excel export with target date and user details.

#### 2.2.2 Frontend Download Analytics Summary (`AuditTrailModal.jsx`)
Compute a real-time memoized summary of report downloads from `auditLogsList`:
```javascript
const downloadStats = useMemo(() => {
  const downloadLogs = auditLogsList.filter(l => l.action_type === 'REPORT_DOWNLOADED');
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
Render a banner/card at the top of the modal when viewing `REPORT_DOWNLOADED` or when downloads exist:
- Shows **Total Report Downloads** pill.
- Shows individual pills for each user with their download tally (e.g. `Super Admin: 14`, `Sub-Admin Patna: 6`).
- Clicking a user pill automatically filters the list to that actor (`setAuditFilterUser(user_id)`).

### 2.3 Unified Staff Lifecycle Live Sync Architecture

#### 2.3.1 Backend Invalidation Battery (`backend/routers/staff.py`)
In all 4 staff mutation endpoints:
- `add_staff_member` (`/admin/staff/add`)
- `update_staff_pin` (`/admin/staff/update-pin`)
- `delete_staff_member` (`/admin/staff/delete`)
- `toggle_staff_status` (`/admin/staff/toggle-status`)

Execute the complete invalidation suite:
```python
cache.delete_prefix("staff_list_")
invalidate_staff_directory_cache()
cache.delete_prefix("targets_")
cache.delete_prefix("staff_targets_raw_")
cache.delete_prefix("attendance_")
cache.delete_prefix("statewide_top_")
evict_officer_profile_cache(clean_dist, clean_name, current_month)
```

#### 2.3.2 Frontend Wiring & Coordinated Refresh
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
   In `handleExecuteAddStaff`, `handleExecuteDeleteStaff`, `handleExecuteToggleStaffStatus`, and `handleExecuteUpdatePin`, trigger:
   ```javascript
   await Promise.all([
     typeof fetchStaffList === 'function' ? fetchStaffList() : Promise.resolve(),
     typeof fetchDirectory === 'function' ? fetchDirectory() : Promise.resolve(),
     typeof loadTargets === 'function' ? loadTargets(selectedDistrict || 'All', month) : Promise.resolve(),
     typeof fetchAttendance === 'function' ? fetchAttendance(true) : Promise.resolve(),
     typeof fetchTopPerformers === 'function' ? fetchTopPerformers(topPerformersPeriod) : Promise.resolve()
   ]);
   ```

---

## 3. Data Integrity, RBAC & Security Constraints

1. **Sub-Admin Isolation**: Sub-Admins can only filter audit logs or view staff within their `allowed_districts`. Backend endpoints reject cross-district access with HTTP 403.
2. **Zero-Leakage Privacy Rule**: No mention of stealth cutoffs (10 AM / 11 AM) in user-facing UI, audit logs, or error toasts.
3. **Anti-Crash & TDZ Safety**: All state setters and hook dependencies must be ordered strictly according to Rule 2 in `GEMINI.md`.

---

## 4. Verification Battery & Acceptance Criteria

1. **Audit Trail Filter Tests (`tests/test_audit_trail_filters_and_download_tracking.mjs`)**:
   - Verify filter payload sends both canonical keys and aliases.
   - Verify backend filters properly on action, district, user, and search queries.
   - Verify `REPORT_DOWNLOADED` logs are created and user counts are correctly computed.
2. **Staff Live Sync Tests (`tests/test_staff_mutation_live_sync.mjs`)**:
   - Verify all mutation endpoints purge `staff_list_`, `staff_directory_`, `targets_`, etc.
   - Verify frontend hook invokes `fetchDirectory` and `loadTargets` on add/delete/toggle.
3. **Full System Regression Gate**:
   - 182 backend pytest tests (100% pass).
   - 13 frontend Node test suites (100% pass).
   - `python -m py_compile main.py` exit code 0.
   - `npm --prefix dfy-frontend run lint` 0 syntax errors.
   - `npm --prefix dfy-frontend run build` exit code 0.
