# Attendance Radar Leaves, Staff Lifecycle Isolation, and FO Target Pacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a robust leave and absence tracking mechanism for Attendance Radar with Sub-Admin RBAC, enforce an effective date cutoff (`inactive_since`) for deactivated staff so removed staff disappear from current attendance while preserving historical records, harden PIN login to reject inactive accounts, and implement a synchronized declared holiday pacing and run-rate engine in the FO App Profile.

**Architecture:**
- **Firestore Collections**:
  - `daily_staff_leaves`: Doc ID `{date}_{district}_{fo_name}` storing daily leave records.
  - `staff_directory`: Enhanced with `status`, `is_active`, `inactive_since`, and deactivation metadata.
  - `pacing_settings`: Doc ID `{YYYY-MM}` (state default) and `{YYYY-MM}_{district}` (district override) storing declared holiday buffers.
- **FastAPI Endpoints**:
  - `POST /admin/attendance/mark-leave` & `POST /admin/attendance/unmark-leave` with Sub-Admin RBAC and date-scoped cache invalidation (`attendance_{date}_*`).
  - `POST /admin/staff/toggle-status` with snapshot synchronization and PIN invalidation.
  - Hardened `/verify-pin` blocking inactive accounts across online and fallback paths.
  - `GET /admin/pacing/settings` & `POST /admin/pacing/settings` for real-time holiday adjustments.
  - Updated `/admin/today-attendance` filtering staff by `inactive_since` cutoff and segregating staff into `submitted_full`, `submitted_partial`, `on_leave_fos`, and `missing_fos`.
  - Updated `/my-profile-stats` returning dynamic `working_days_info` (total, elapsed, remaining working days, current and required run-rates).
- **Frontend UIs**:
  - `AdminDashboard.jsx`: Attendance Radar "On Leave" badge/tab, 1-click "Mark Leave / Absent" modal on missing cards, WhatsApp reminder generator excluding on-leave staff, Staff table filter tabs (All/Active/Inactive) with status toggle switch, and Declared Holiday `+`/`-` buttons persisting to backend.
  - `App.jsx`: Glassmorphic Hero Pacing Command Card in FO Profile displaying dual-track progress (actual vs expected benchmark), working days left, required daily run-rate, and contextual motivation banner.

**Tech Stack:** FastAPI, Google Cloud Firestore, React 19, Tailwind CSS v4, Vite, Python `pytest`.

**Spec:** [`docs/superpowers/specs/2026-09-22-attendance-radar-leaves-and-fo-target-pacing-design.md`](file:///d:/ignou/Mis%20field%20report/docs/superpowers/specs/2026-09-22-attendance-radar-leaves-and-fo-target-pacing-design.md)

## Global Constraints
- Every write endpoint must strictly validate canonical district matching (`canonicalize_district`).
- Sub-Admin users must never access or modify data outside their permitted districts (`admin.get("allowed_districts")`), returning HTTP 403.
- Inactive staff must never be able to log in via `/verify-pin`.
- Historical daily reports submitted by staff prior to deactivation must remain 100% intact and visible in past month reports.
- Date-scoped cache keys (`attendance_{date}_*`, `pin_*`, `pacing_*`) must be properly evicted upon mutation.
- Zero tolerance for runtime crashes, blank/white screens, or Temporal Dead Zone (TDZ) reference errors.
- Full verification battery before claiming completion: `python -m py_compile main.py`, `pytest`, `npm run lint`, `npm run build`.

---

### Task 1: Backend Leave Management Endpoints (`/admin/attendance/mark-leave`, `/admin/attendance/unmark-leave`) & RBAC

**Files:**
- Modify: `main.py`
- Test: `tests/test_attendance_leaves_and_lifecycle.py`

**Interfaces:**
- Produces:
  - `POST /admin/attendance/mark-leave`
    - Body: `{"district": "Jamui", "fo_name": "Ramesh Kumar", "date": "2026-09-22", "status": "leave", "reason_type": "Medical", "remark": "Doctor visit"}`
    - Returns: `{"success": True, "message": "Leave recorded successfully."}`
  - `POST /admin/attendance/unmark-leave`
    - Body: `{"district": "Jamui", "fo_name": "Ramesh Kumar", "date": "2026-09-22"}`
    - Returns: `{"success": True, "message": "Leave removed successfully."}`

- [ ] **Step 1: Write the failing tests for leave marking, unmarking, and Sub-Admin RBAC**

```python
# tests/test_attendance_leaves_and_lifecycle.py
import pytest
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from main import app, cache, create_access_token, canonicalize_district
from httpx import AsyncClient, ASGITransport

def make_admin_token(role="SUPER_ADMIN", username="superadmin", allowed_districts=None):
    return create_access_token({
        "user_id": "test_admin_123",
        "username": username,
        "role": role,
        "name": "Admin Test",
        "allowed_districts": allowed_districts or ["All"]
    })

@pytest.mark.asyncio
async def test_mark_and_unmark_leave_success():
    super_token = make_admin_token(role="SUPER_ADMIN")
    headers = {"Authorization": f"Bearer {super_token}"}
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Mark Leave
        mark_res = await ac.post("/admin/attendance/mark-leave", json={
            "district": "Jamui",
            "fo_name": "Ramesh Kumar",
            "date": "2026-09-22",
            "status": "leave",
            "reason_type": "Medical",
            "remark": "Fever"
        }, headers=headers)
        assert mark_res.status_code == 200
        assert mark_res.json()["success"] is True

        # 2. Unmark Leave
        unmark_res = await ac.post("/admin/attendance/unmark-leave", json={
            "district": "Jamui",
            "fo_name": "Ramesh Kumar",
            "date": "2026-09-22"
        }, headers=headers)
        assert unmark_res.status_code == 200
        assert unmark_res.json()["success"] is True

@pytest.mark.asyncio
async def test_mark_leave_subadmin_rbac():
    # Sub-Admin permitted only for Jamui
    jamui_token = make_admin_token(role="SUB_ADMIN", username="jamui_admin", allowed_districts=["Jamui"])
    headers = {"Authorization": f"Bearer {jamui_token}"}
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Allowed district -> Success
        res_ok = await ac.post("/admin/attendance/mark-leave", json={
            "district": "Jamui",
            "fo_name": "Ramesh Kumar",
            "date": "2026-09-22",
            "status": "leave",
            "reason_type": "Casual"
        }, headers=headers)
        assert res_ok.status_code == 200

        # Disallowed district (Sitamarhi) -> HTTP 403
        res_bad = await ac.post("/admin/attendance/mark-leave", json={
            "district": "Sitamarhi",
            "fo_name": "Deepak Kumar",
            "date": "2026-09-22",
            "status": "leave",
            "reason_type": "Casual"
        }, headers=headers)
        assert res_bad.status_code == 403
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_attendance_leaves_and_lifecycle.py -k "test_mark_and_unmark_leave_success" -v`  
Expected: FAIL (404 Not Found or endpoints missing).

- [ ] **Step 3: Implement `MarkLeaveReq`, `UnmarkLeaveReq`, and endpoints in `main.py`**

Define Pydantic models:
```python
class MarkLeaveReq(BaseModel):
    district: str
    fo_name: str
    date: str
    status: str = "leave" # "leave" | "absent" | "weekly_off"
    reason_type: str = "Casual"
    remark: Optional[str] = ""

class UnmarkLeaveReq(BaseModel):
    district: str
    fo_name: str
    date: str
```
Implement endpoints:
- Check Sub-Admin `allowed_districts`.
- Canonicalize district and clean FO name.
- Doc ID: `{clean_date}_{clean_dist}_{clean_fo}`.
- Store/update or delete from `daily_staff_leaves` collection.
- Evict `cache.delete_prefix(f"attendance_{clean_date}")`.
- Return standard success dictionary.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_attendance_leaves_and_lifecycle.py -k "test_mark_and_unmark_leave_success or test_mark_leave_subadmin_rbac" -v`  
Expected: PASS (2 passed).

- [ ] **Step 5: Commit changes**

```bash
git add main.py tests/test_attendance_leaves_and_lifecycle.py
git commit -m "feat: implement backend attendance leave marking and unmarking with RBAC"
```

---

### Task 2: Staff Lifecycle Cutoff, Status Toggle & PIN Deactivation Guard (`/admin/staff/toggle-status`, `/verify-pin`)

**Files:**
- Modify: `main.py`
- Test: `tests/test_attendance_leaves_and_lifecycle.py`

**Interfaces:**
- Produces:
  - `POST /admin/staff/toggle-status`
    - Body: `{"district": "Jamui", "fo_name": "Ramesh Kumar", "status": "inactive", "effective_date": "2026-09-22"}`
    - Returns: `{"success": True, "message": "Staff status updated to inactive."}`
  - Updated `GET /admin/staff/list?status_filter=all`
  - Hardened `/verify-pin`: returns `{"valid": False, "error": "Account deactivated..."}` when inactive.

- [ ] **Step 1: Write the failing tests for toggle status and inactive login block**

```python
@pytest.mark.asyncio
async def test_staff_toggle_status_and_pin_block():
    super_token = make_admin_token(role="SUPER_ADMIN")
    headers = {"Authorization": f"Bearer {super_token}"}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Toggle status to inactive
        res = await ac.post("/admin/staff/toggle-status", json={
            "district": "Jamui",
            "fo_name": "Ramesh Kumar",
            "status": "inactive",
            "effective_date": "2026-09-22"
        }, headers=headers)
        assert res.status_code == 200
        assert res.json()["success"] is True

        # 2. Verify PIN login is rejected
        pin_res = await ac.post("/verify-pin", json={
            "working_place": "Jamui",
            "fo_name": "Ramesh Kumar",
            "pin": "1234"
        })
        assert pin_res.status_code == 200
        pin_data = pin_res.json()
        assert pin_data["valid"] is False
        assert "deactivated" in pin_data.get("error", "").lower() or "inactive" in pin_data.get("error", "").lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_attendance_leaves_and_lifecycle.py -k "test_staff_toggle_status_and_pin_block" -v`  
Expected: FAIL.

- [ ] **Step 3: Implement `/admin/staff/toggle-status` and harden `/verify-pin` in `main.py`**

- Pydantic model:
  ```python
  class ToggleStaffStatusReq(BaseModel):
      district: str
      fo_name: str
      status: str  # "active" | "inactive"
      effective_date: Optional[str] = None
  ```
- In `/admin/staff/toggle-status`:
  - Check Sub-Admin `allowed_districts`.
  - Update `staff_directory` doc with:
    - `"status": req.status`
    - `"is_active": req.status == "active"`
    - `"inactive_since": req.effective_date or today_str` if inactive, else `None`
    - `"updated_at": now_str`
  - Update `staff_directory_snapshot.json`.
  - Evict `cache.delete_prefix("admin_staff_full_list")`, `cache.delete("staff_directory_list")`, `cache.delete("staff_directory_dict")`, `cache.delete_prefix("attendance_")`.
- In `/verify-pin`:
  - Check `is_active is False` or `status == "inactive"`.
  - Return `{"valid": False, "error": "Account deactivated. Please contact your District MIS or State Admin."}`.
  - In offline / quota exception handlers: do NOT allow bypass if account was identified as inactive.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_attendance_leaves_and_lifecycle.py -k "test_staff_toggle_status_and_pin_block" -v`  
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add main.py tests/test_attendance_leaves_and_lifecycle.py
git commit -m "feat: implement staff toggle status and hardened inactive PIN login guard"
```

---

### Task 3: Backend Declared Holidays Pacing Sync (`/admin/pacing/settings`) & `/my-profile-stats` Working Days

**Files:**
- Modify: `main.py`
- Test: `tests/test_attendance_leaves_and_lifecycle.py`

**Interfaces:**
- Produces:
  - `GET /admin/pacing/settings?month=2026-09&district=Jamui`
    - Returns: `{"success": True, "month": "2026-09", "district": "Jamui", "declared_holidays": 2, "is_override": True}`
  - `POST /admin/pacing/settings`
    - Body: `{"month": "2026-09", "district": "Jamui", "declared_holidays": 2}`
  - Updated `POST /my-profile-stats`: includes `working_days_info` in response.

- [ ] **Step 1: Write failing test for pacing settings and profile working days**

```python
@pytest.mark.asyncio
async def test_pacing_settings_and_profile_working_days():
    super_token = make_admin_token(role="SUPER_ADMIN")
    headers = {"Authorization": f"Bearer {super_token}"}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Save district holiday override (Jamui = 2 holidays)
        post_res = await ac.post("/admin/pacing/settings", json={
            "month": "2026-09",
            "district": "Jamui",
            "declared_holidays": 2
        }, headers=headers)
        assert post_res.status_code == 200

        # 2. Get pacing settings
        get_res = await ac.get("/admin/pacing/settings?month=2026-09&district=Jamui", headers=headers)
        assert get_res.status_code == 200
        data = get_res.json()
        assert data["declared_holidays"] == 2
        assert data["district"] == "Jamui"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_attendance_leaves_and_lifecycle.py -k "test_pacing_settings_and_profile_working_days" -v`  
Expected: FAIL.

- [ ] **Step 3: Implement `/admin/pacing/settings` and enrich `/my-profile-stats` in `main.py`**

- Add `PacingSettingsReq` model:
  ```python
  class PacingSettingsReq(BaseModel):
      month: str
      district: str = "all"
      declared_holidays: int = 1
  ```
- Endpoints:
  - `GET /admin/pacing/settings`: Checks district override `{month}_{clean_dist}`, then state default `{month}`, falls back to 1.
  - `POST /admin/pacing/settings`: Validates Sub-Admin district, upserts in `pacing_settings` collection, invalidates cache.
- In `/my-profile-stats`:
  - Calculate `working_days_info` using calendar month, Sundays, and resolved `declared_holidays`.
  - Calculate `required_run_rate = round(remaining_target / max(1, remaining_working_days), 1)`.
  - Calculate `current_run_rate = round(achieved / max(1, elapsed_working_days), 1)`.
  - Add to return dictionary.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_attendance_leaves_and_lifecycle.py -k "test_pacing_settings_and_profile_working_days" -v`  
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add main.py tests/test_attendance_leaves_and_lifecycle.py
git commit -m "feat: implement declared holidays pacing settings and enrich profile stats with working days"
```

---

### Task 4: Attendance Radar Cutoff Filter & Leave Resolution (`/admin/today-attendance`)

**Files:**
- Modify: `main.py`
- Test: `tests/test_attendance_leaves_and_lifecycle.py`

**Interfaces:**
- Modifies: `GET /admin/today-attendance?date={date}&districts={districts}`
- Response includes:
  - `on_leave_count`: int
  - `on_leave_fos`: list of `{ district, fo_name, status, reason_type, remark, marked_by_name, marked_at }`
  - `missing_count`: count of genuine unsubmitted officers without approved leave
  - `missing_fos`: list of genuine defaulters (excluding on-leave staff)

- [ ] **Step 1: Write failing test for attendance radar date cutoff and leave segregation**

```python
@pytest.mark.asyncio
async def test_today_attendance_cutoff_and_leaves():
    super_token = make_admin_token(role="SUPER_ADMIN")
    headers = {"Authorization": f"Bearer {super_token}"}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Mark leave for Ramesh Kumar on 2026-09-22
        await ac.post("/admin/attendance/mark-leave", json={
            "district": "Jamui",
            "fo_name": "Ramesh Kumar",
            "date": "2026-09-22",
            "status": "leave",
            "reason_type": "Medical"
        }, headers=headers)

        res = await ac.get("/admin/today-attendance?date=2026-09-22&districts=Jamui&force_refresh=true", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert "on_leave_fos" in data
        assert "on_leave_count" in data
        # Ramesh Kumar should be in on_leave_fos, NOT missing_fos
        leave_names = [f["fo_name"] for f in data["on_leave_fos"]]
        missing_names = [f["fo_name"] for f in data["missing_fos"]]
        assert "Ramesh Kumar" in leave_names
        assert "Ramesh Kumar" not in missing_names
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_attendance_leaves_and_lifecycle.py -k "test_today_attendance_cutoff_and_leaves" -v`  
Expected: FAIL (`on_leave_fos` missing from response).

- [ ] **Step 3: Update `/admin/today-attendance` in `main.py`**

- In `get_today_attendance`:
  - When building `staff_list`:
    - Check each staff record:
      - If `is_active is False` or `status == "inactive"`:
        - Only include if `inactive_since` exists AND `date < inactive_since`.
        - If `date >= inactive_since`: EXCLUDE!
  - Query `daily_staff_leaves` where `date == date`.
  - For unsubmitted officers:
    - If in `leaves_map`: append to `on_leave_fos`.
    - Else: append to `missing_fos`.
  - Calculate `on_leave_count = len(on_leave_fos)`.
  - Calculate `missing_count = len(missing_fos)`.
  - Include both in the returned dictionary and cache response.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_attendance_leaves_and_lifecycle.py -k "test_today_attendance_cutoff_and_leaves" -v`  
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add main.py tests/test_attendance_leaves_and_lifecycle.py
git commit -m "feat: update today attendance endpoint with effective date cutoff and leave segregation"
```

---

### Task 5: Frontend Attendance Radar UI & WhatsApp Generator (`AdminDashboard.jsx`)

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx`

**Interfaces:**
- Radar UI:
  - Header metric: "On Leave / Absent ({attendance.on_leave_count || 0})"
  - Active Tab: "On Leave ({attendance.on_leave_count || 0})"
  - Missing officer card action: "🏖️ Mark Leave" button opening modal
  - On Leave card action: "🔄 Revert Leave" button
  - Declared holidays `+` / `-` buttons calling `POST /admin/pacing/settings`
- WhatsApp Generator:
  - `copyMissingReminder`: generates text strictly from `missing_fos` (excluding `on_leave_fos`), and appends `ℹ️ (X staff on leave today)`.
- In-memory Derivation:
  - `deriveAttendanceFromRecords`: honors `inactive_since` and `leaves_map`.

- [ ] **Step 1: Declare state and handlers in `AdminDashboard.jsx`**

- State:
  - `const [leaveActionModal, setLeaveActionModal] = useState(null);` (Stores `{ district, fo_name, date, status, reason_type, remark }`)
  - `const [isSavingLeave, setIsSavingLeave] = useState(false);`
  - `const [activeAttendanceTab, setActiveAttendanceTab] = useState('missing');` ('submitted_full' | 'submitted_partial' | 'on_leave' | 'missing')
- Handlers:
  - `handleExecuteMarkLeave`: calls `POST /admin/attendance/mark-leave`, optimistically moves officer from `missing_fos` to `on_leave_fos`, refreshes attendance.
  - `handleExecuteUnmarkLeave`: calls `POST /admin/attendance/unmark-leave`, optimistically moves officer back, refreshes attendance.
  - `handleUpdateHolidays`: calls `POST /admin/pacing/settings` when clicking `+` or `-` in declared holidays.

- [ ] **Step 2: Update Radar tabs and cards layout**

- Add tab button:
  ```jsx
  <button onClick={() => setActiveAttendanceTab('on_leave')} className="...">
    🏖️ On Leave ({attendance?.on_leave_count || 0})
  </button>
  ```
- Render `On Leave` section displaying cards with status badge, reason, remark, marked by, and "Revert" button.
- Add "Mark Leave" button on cards in the `Missing` tab.

- [ ] **Step 3: Update `copyMissingReminder`**

Ensure `copyMissingReminder` strictly uses `attendance.missing_fos` and appends:
```javascript
if (attendance.on_leave_count > 0) {
  text += `\nℹ️ (${attendance.on_leave_count} staff on approved leave/absent today)\n`;
}
```

- [ ] **Step 4: Update in-memory `deriveAttendanceFromRecords`**

In `deriveAttendanceFromRecords`:
- Filter out staff whose `inactive_since <= targetDate`.
- Check local or loaded leaves to accurately populate `on_leave_fos`.

- [ ] **Step 5: Verify build and lint**

Run: `npm run lint` and `npm run build` in `dfy-frontend/`.  
Expected: 0 errors.

- [ ] **Step 6: Commit changes**

```bash
git add dfy-frontend/src/AdminDashboard.jsx
git commit -m "feat: add attendance radar leave marking, on-leave tab, and whatsapp generator exclusion"
```

---

### Task 6: Frontend Staff Management Table Active/Inactive Controls (`AdminDashboard.jsx`)

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx`

**Interfaces:**
- Staff Table Controls:
  - Filter tabs: **All ({total}) | Active ({activeCount}) | Inactive ({inactiveCount})**
  - Status column badge:
    - Green `🟢 Active` \(\rightarrow\) Clicking opens prompt to deactivate with optional effective date.
    - Gray `⚪ Inactive (since YYYY-MM-DD)` \(\rightarrow\) Clicking opens prompt to reactivate.

- [ ] **Step 1: Add staff status filter and toggle modal state**

- State:
  - `const [staffStatusFilter, setStaffStatusFilter] = useState('active');`
  - `const [staffToggleModal, setStaffToggleModal] = useState(null);`
  - `const [isTogglingStaff, setIsTogglingStaff] = useState(false);`

- [ ] **Step 2: Add `handleExecuteToggleStaffStatus` handler**

- Sends request to `POST /admin/staff/toggle-status`.
- Updates `staffList` in state optimistically:
  ```javascript
  setStaffList(prev => prev.map(s => (s.name === name && s.district === district ? {
    ...s,
    status: newStatus,
    is_active: newStatus === 'active',
    inactive_since: newStatus === 'inactive' ? effectiveDate : null
  } : s)));
  ```
- Calls `fetchDirectory()` and `fetchAttendance(true)`.

- [ ] **Step 3: Render filter tabs and clickable status badges**

- Add filter tab buttons above the Staff Management table.
- Filter `displayedStaffList` based on `staffStatusFilter`.
- In the table row, render the interactive status badge button.

- [ ] **Step 4: Verify build and lint**

Run: `npm run lint` and `npm run build` in `dfy-frontend/`.  
Expected: 0 errors.

- [ ] **Step 5: Commit changes**

```bash
git add dfy-frontend/src/AdminDashboard.jsx
git commit -m "feat: add staff active/inactive filter tabs and status toggle modal"
```

---

### Task 7: Frontend FO Profile Modern Glassmorphic Command Card (`App.jsx`)

**Files:**
- Modify: `dfy-frontend/src/App.jsx`

**Interfaces:**
- FO Profile UI:
  - Glassmorphic command card: `bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900`
  - Pacing status pill (Ahead of Pace / On Track / Behind Pace)
  - Dual-track progress bar (Actual vs Benchmark marker)
  - 4-metric grid: Target, Achieved, Working Days Left, Required Daily Run-Rate
  - Hindi motivational guidance text

- [ ] **Step 1: Compute Pacing & Working Day Metrics in `App.jsx`**

Using `stats.working_days_info` from `/my-profile-stats` (or client fallback):
- `totalWorkingDays`, `elapsedWorkingDays`, `remainingWorkingDays`.
- `targetVal = Number(stats?.target) || 50`.
- `notifAchieved = Number(stats?.breakdown?.notification) || 0`.
- `remainingTarget = Math.max(0, targetVal - notifAchieved)`.
- `requiredRunRate = remainingWorkingDays > 0 ? (remainingTarget / remainingWorkingDays).toFixed(1) : remainingTarget`.
- `currentRunRate = elapsedWorkingDays > 0 ? (notifAchieved / elapsedWorkingDays).toFixed(1) : 0`.
- `expectedToDate = Math.round((targetVal * elapsedWorkingDays) / Math.max(1, totalWorkingDays))`.
- `paceDiff = notifAchieved - expectedToDate`.

- [ ] **Step 2: Replace circular target UI with Glassmorphic Command Card**

- Replace lines 804-845 in `dfy-frontend/src/App.jsx` with the modern Glassmorphic Command Card component.
- Ensure all color tokens, badges, and responsive widths fit mobile screens seamlessly.

- [ ] **Step 3: Verify build and lint**

Run: `npm run lint` and `npm run build` in `dfy-frontend/`.  
Expected: 0 errors.

- [ ] **Step 4: Commit changes**

```bash
git add dfy-frontend/src/App.jsx
git commit -m "feat: implement modern glassmorphic target pacing and run-rate command card in FO profile"
```

---

### Task 8: End-to-End Verification Battery & Production Gate (GEMINI.md Rule 1)

**Files:**
- All modified backend and frontend files.

- [ ] **Step 1: Run Python compilation check**
  Run: `python -m py_compile main.py`  
  Expected: Exit code 0.

- [ ] **Step 2: Run complete automated test suite**
  Run: `pytest tests/ -v`  
  Expected: All tests pass with 0 failures.

- [ ] **Step 3: Run Frontend Linter**
  Run: `cd dfy-frontend && npm run lint`  
  Expected: 0 errors.

- [ ] **Step 4: Run Frontend Production Build**
  Run: `cd dfy-frontend && npm run build`  
  Expected: Exit code 0, dist bundle successfully created.

- [ ] **Step 5: Perform line-by-line Git Diff Audit**
  Run: `git diff HEAD~7`  
  Verify only intended changes across leaves, staff lifecycle, pacing, and UI exist.
