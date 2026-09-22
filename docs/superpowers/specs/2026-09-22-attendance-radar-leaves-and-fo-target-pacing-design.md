# Technical Design Specification: Attendance Radar Leaves, Staff Lifecycle Isolation, and FO Target Pacing & Run-Rate

**Date:** 2026-09-22  
**Status:** Approved by User  
**Target Systems:** FastAPI Backend (`main.py`), Admin Dashboard (`AdminDashboard.jsx`), Field Officer Portal (`App.jsx`)

---

## 1. Executive Summary & Goals

### 1.1 Context
The DFY MIS App is an active production system deployed for TB monitoring across 38 districts in Bihar. Coordinators and State Admins use the Attendance Radar to monitor daily field submissions, identify non-reporting Field Officers (defaulters), and broadcast reminders via WhatsApp groups. Field Officers (FOs) use the mobile portal to submit reports, log patient IDs, and review their monthly performance.

### 1.2 Identified Deficiencies
1. **No Leave / Absence Mechanism**: When an officer is on approved medical, casual, or official leave, the Attendance Radar flags them as "Missing / Not Submitted" (Defaulters). WhatsApp reminders shame or ping them inappropriately.
2. **Removed / Inactive Staff Leaking into Attendance Radar**: Deactivated or deleted staff continue appearing in the Attendance Radar for current dates due to static fallback directory loading and the lack of an effective deactivation date cutoff (`inactive_since`).
3. **No Staff Active/Inactive Controls**: Admins only have a "Delete" button. There is no status toggle to mark staff inactive, review inactive rosters, or reactivate staff while preserving their historical reporting data.
4. **Disconnected Pacing & Run-Rate in FO App**: In `AdminDashboard.jsx`, Admins adjust "Declared Holidays" to calculate working days, but this is stored purely in local component state. The FO App calculates target progress using a basic percentage circle without working days, Sunday deductions, or required daily run-rates.

### 1.3 Strategic Objectives
1. **Attendance Radar Leaves**: Introduce `daily_staff_leaves` in Firestore with single-click "Mark Leave / Absent" actions for Admins, separating legitimate leaves from defaulters and automatically excluding them from WhatsApp reminders.
2. **Staff Lifecycle & Cutoff Isolation**: Introduce an explicit `status` (`"active"` | `"inactive"`) and `inactive_since` date cutoff in `staff_directory`. Prevent inactive staff from appearing on/after their deactivation date, block their `/verify-pin` login, yet preserve 100% of their historical reports.
3. **Strict District RBAC**: Enforce district matching (`canonicalize_district`) and Sub-Admin isolation (`admin.get("allowed_districts")`) across all leave, staff status, and radar endpoints.
4. **Synchronized Pacing Engine & Modern FO Profile**: Store declared holidays in `pacing_settings` with district override capability. Provide a modern glassmorphic Target Pacing & Run-Rate dashboard in the FO App displaying required daily run-rate, benchmark markers, and motivational status.

---

## 2. Architecture & Data Schemas

```
+-------------------------------------------------------------------------------+
|                                  FIRESTORE                                    |
+-------------------------------------------------------------------------------+
| 1. daily_staff_leaves                                                         |
|    ID: {date}_{clean_district}_{clean_fo_name}                                |
|    Fields: date, district, fo_name, status, reason_type, remark, marked_by...|
+-------------------------------------------------------------------------------+
| 2. staff_directory                                                            |
|    ID: {clean_district}_{clean_fo_name}                                       |
|    Fields: name, district, pin, status, is_active, inactive_since, updated_at  |
+-------------------------------------------------------------------------------+
| 3. pacing_settings                                                            |
|    ID: {YYYY-MM} (State Default) or {YYYY-MM}_{clean_district} (Override)     |
|    Fields: month, district, declared_holidays, updated_by, updated_at         |
+-------------------------------------------------------------------------------+
                                      |
         +----------------------------+----------------------------+
         |                                                         |
         v                                                         v
+--------------------------+                             +--------------------+
|   FASTAPI BACKEND        |                             |   FASTAPI BACKEND  |
|   /admin/today-attendance|                             |   /my-profile-stats|
|   - Filter active cutoff |                             |   - Dynamic Pacing |
|   - Categorize leaves    |                             |   - Working Days   |
+--------------------------+                             +--------------------+
         |                                                         |
         v                                                         v
+--------------------------+                             +--------------------+
|    ADMIN DASHBOARD       |                             |     FO APP         |
|   - Radar: On Leave Tab  |                             |   - Hero Pacing    |
|   - 1-Click Leave Action |                             |   - Daily Run-Rate |
|   - Clean WhatsApp Copy  |                             |   - Benchmarks     |
|   - Staff Status Toggle  |                             +--------------------+
+--------------------------+
```

### 2.1 `daily_staff_leaves` Collection
- **Document ID Pattern**: `{date}_{clean_district}_{clean_fo}`  
  *Example*: `2026-09-22_jamui_rameshkumar`
- **Fields**:
  - `date`: `str` (`YYYY-MM-DD`)
  - `district`: `str` (Canonical District, e.g. `"Jamui"`)
  - `fo_name`: `str` (Officer Name)
  - `status`: `str` (`"leave"` | `"absent"` | `"weekly_off"`)
  - `reason_type`: `str` (`"Medical"` | `"Casual"` | `"Official Work"` | `"Personal"` | `"Uninformed"`)
  - `remark`: `str` (Optional explanation)
  - `marked_by_name`: `str` (Admin/Sub-Admin name)
  - `marked_by_id`: `str` (Admin user ID)
  - `marked_by_role`: `str` (`"SUPER_ADMIN"` | `"SUB_ADMIN"`)
  - `marked_at`: `str` (`YYYY-MM-DD HH:MM:SS` IST)

### 2.2 `staff_directory` Collection (Lifecycle Enhancements)
- **Document ID Pattern**: `{clean_district}_{clean_fo}`  
- **Added/Updated Fields**:
  - `status`: `str` (`"active"` | `"inactive"`)
  - `is_active`: `bool` (`True` if active, `False` if deactivated)
  - `inactive_since`: `Optional[str]` (`YYYY-MM-DD` cutoff date, defaults to today when deactivated)
  - `deactivated_by`: `Optional[str]` (Admin identifier)
  - `updated_at`: `str` (IST timestamp)

### 2.3 `pacing_settings` Collection
- **Document ID Patterns**:
  - State Default: `{YYYY-MM}` (e.g. `2026-09`)
  - District Override: `{YYYY-MM}_{clean_district}` (e.g. `2026-09_jamui`)
- **Fields**:
  - `month`: `str` (`YYYY-MM`)
  - `district`: `str` (`"all"` or Canonical District)
  - `declared_holidays`: `int` (Buffer of non-working festival/government holidays)
  - `updated_by`: `str`
  - `updated_at`: `str`

---

## 3. Backend Implementation & API Endpoints

### 3.1 Leave Management Endpoints

#### 3.1.1 `POST /admin/attendance/mark-leave`
- **Purpose**: Mark an FO as On Leave / Absent for a specific date.
- **Request Model**:
  ```python
  class MarkLeaveReq(BaseModel):
      district: str
      fo_name: str
      date: str
      status: str = "leave"  # "leave" | "absent" | "weekly_off"
      reason_type: str = "Casual"
      remark: Optional[str] = ""
  ```
- **RBAC Check**:
  - Verify caller is authenticated Admin.
  - Canonicalize district.
  - If `admin["role"] == "SUB_ADMIN"`: ensure canonical district is in `admin["allowed_districts"]`.
- **Logic**:
  - Set doc in `daily_staff_leaves`.
  - Invalidate cache keys: `attendance_{date}_*`.
  - Log activity via `log_admin_activity`.
- **Response**: `{"success": True, "message": "Leave recorded successfully."}`

#### 3.1.2 `POST /admin/attendance/unmark-leave`
- **Purpose**: Remove an existing leave record (revert back to active attendance duty).
- **Request Model**:
  ```python
  class UnmarkLeaveReq(BaseModel):
      district: str
      fo_name: str
      date: str
  ```
- **RBAC Check**: Sub-Admin permitted districts verification.
- **Logic**:
  - Delete document from `daily_staff_leaves`.
  - Invalidate cache: `attendance_{date}_*`.
- **Response**: `{"success": True, "message": "Leave removed successfully."}`

### 3.2 Staff Lifecycle Endpoints

#### 3.2.1 `POST /admin/staff/toggle-status`
- **Purpose**: Toggle staff status between Active and Inactive with an effective cutoff date.
- **Request Model**:
  ```python
  class ToggleStaffStatusReq(BaseModel):
      district: str
      fo_name: str
      status: str  # "active" | "inactive"
      effective_date: Optional[str] = None
  ```
- **Logic**:
  - Clean district and name.
  - If `status == "inactive"`:
    - Set `is_active = False`, `status = "inactive"`, `inactive_since = effective_date or today_str`.
  - If `status == "active"`:
    - Set `is_active = True`, `status = "active"`, `inactive_since = None`.
  - Invalidate `pin_*`, `staff_directory_dict`, `staff_directory_list`, `admin_staff_full_list_*`, `attendance_*`.
  - Update `staff_directory_snapshot.json` accordingly.

#### 3.2.2 `GET /admin/staff/list` (Enhancement)
- Accepts optional `status_filter` query param: `"active"` (default), `"inactive"`, or `"all"`.
- Returns full details including `status`, `is_active`, `inactive_since`.

#### 3.2.3 `POST /verify-pin` (Hardened Inactive Login Guard)
- When validating FO PIN:
  - Fetch staff document from `staff_directory`.
  - If `doc.get("is_active") is False` or `doc.get("status") == "inactive"`:
    - Immediately return:
      ```json
      {
        "valid": false,
        "error": "Account deactivated. Please contact your District MIS or State Admin."
      }
      ```
  - Disallow any fallback pass-through for inactive accounts.

### 3.3 Synchronized Holiday Settings Endpoints

#### 3.3.1 `GET /admin/pacing/settings`
- **Parameters**: `month: str` (`YYYY-MM`), `district: Optional[str] = None`
- **Logic**:
  - Check for district override `{month}_{clean_district}`. If found, return it.
  - Otherwise, check state default `{month}`.
  - If none configured, return default (`declared_holidays: 1`).
- **Response**:
  ```json
  {
    "success": true,
    "month": "2026-09",
    "district": "Jamui",
    "declared_holidays": 2,
    "is_override": true
  }
  ```

#### 3.3.2 `POST /admin/pacing/settings`
- **Payload**: `{ month: str, district: str, declared_holidays: int }`
- **RBAC**: Sub-Admin can set for their assigned district; Super Admin can set for `"all"` or specific districts.
- **Logic**: Upserts document in `pacing_settings` and deletes cached pacing keys.

### 3.4 Attendance Radar Engine (`/admin/today-attendance`)
- **Cutoff Filtering Rule**:
  - Fetch staff directory records.
  - An officer is included for `targetDate` **if and only if**:
    - `is_active == True` and (`inactive_since` is empty or `targetDate < inactive_since`), OR
    - `is_active == False` and `targetDate < inactive_since` (officer was active on that past date).
  - An officer where `targetDate >= inactive_since` is **completely excluded**.
- **Leave Resolution Rule**:
  - Query `daily_staff_leaves` where `date == targetDate`.
  - For each unsubmitted officer:
    - If in leaves map: add to `on_leave_fos` bucket.
    - Else: add to `missing_fos` bucket.
- **Output Payload**:
  - `total_staff`: Active eligible count for `targetDate`.
  - `submitted_full_count`, `submitted_partial_count`.
  - `on_leave_count`: Count of staff on approved leave/absent.
  - `missing_count`: Count of genuine defaulters.
  - `on_leave_fos`: Array of detailed leave objects.
  - `missing_fos`: Array of unaccounted defaulters.

---

## 4. Frontend & User Interface Architecture

### 4.1 Admin Dashboard (`AdminDashboard.jsx`)

#### 4.1.1 Attendance Radar Header & Badges
- Add **"On Leave / Absent"** metric pill alongside "Submitted Full", "Partial", and "Missing".
- Visual styling: Warm amber/violet pill displaying `{attendance.on_leave_count || 0}`.

#### 4.1.2 Attendance Radar Tabs
- Add **"On Leave / Absent ({count})"** tab.
- Table/Grid displays:
  - Officer Name & District
  - Status Badge: `🏖️ On Leave` (Medical/Casual) or `⚠️ Absent`
  - Remark & Marked By details
  - **"Revert" Button**: Calls `POST /admin/attendance/unmark-leave` with instant optimistic update.

#### 4.1.3 Missing Officers Action Modal
- Each card in the "Missing" tab receives an action button: **"🏖️ Mark Leave / Absent"**.
- Opens a clean dialog:
  - Dropdown 1 (Status): `On Leave` | `Absent` | `Weekly Off`
  - Dropdown 2 (Reason): `Medical` | `Casual` | `Official Work` | `Personal` | `Uninformed`
  - Textarea: Optional remark
  - Save button: Calls `POST /admin/attendance/mark-leave`, triggers toast, moves officer from `missing_fos` to `on_leave_fos`.

#### 4.1.4 WhatsApp Reminder Generator
- Modify `copyMissingReminder` to generate text strictly from `missing_fos`.
- Appends an informational note:
  ```text
  ℹ️ (X officers on approved leave/absent today)
  ```
- Prevents on-leave staff from being pinged as defaulters.

#### 4.1.5 Staff Management Table Active/Inactive Controls
- Add top filter tabs: **All | Active (default) | Inactive**.
- Status column:
  - Active staff: Clickable green badge `🟢 Active` \(\rightarrow\) Prompt to deactivate.
  - Inactive staff: Clickable gray badge `⚪ Inactive (since YYYY-MM-DD)` \(\rightarrow\) Prompt to reactivate.

---

### 4.2 Field Officer Mobile Portal (`App.jsx`)

#### 4.2.1 Real-Time Holiday Sync
- When fetching `/my-profile-stats`, backend includes:
  ```json
  "working_days_info": {
    "total_days": 30,
    "sundays": 4,
    "declared_holidays": 2,
    "total_working_days": 24,
    "elapsed_working_days": 17,
    "remaining_working_days": 7
  }
  ```
- If Sub-Admin or Admin modifies holidays, FO profile recalculates automatically.

#### 4.2.2 Glassmorphic Field Command Card
- **Hero Card Layout**:
  - Gradient background: `bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900`.
  - **Pacing Status Pill**:
    - 🏆 *Target Crusher*: \(\text{Achieved} \ge \text{Target}\)
    - 🚀 *Ahead of Pace*: \(\text{Achieved} \ge \text{Expected}\)
    - ⚠️ *Needs Acceleration*: \(\text{Achieved} < \text{Expected}\)
  - **Dual-Track Progress**:
    - Bar 1: Actual Notifications Achieved vs Monthly Target.
    - Marker: Expected Benchmark Position for today.
  - **Metrics Micro-Grid**:
    - 🎯 Monthly Target: e.g. `50`
    - ✅ Achieved: e.g. `28` (`56%`)
    - 📅 Working Days Left: e.g. `7 Days` *(Sundays & Holidays deducted)*
    - ⚡ Required Run-Rate: e.g. `3.1 / Day`
  - **Hindi Contextual Motivational Banner**:
    - Computes exact gap and suggests daily cadence needed to achieve target by month-end.

---

## 5. Security & RBAC Matrix

| Endpoint | Super Admin | Sub-Admin | Field Officer |
|---|---|---|---|
| `POST /admin/attendance/mark-leave` | All Districts | Permitted Districts Only (`allowed_districts`) | Blocked (403) |
| `POST /admin/attendance/unmark-leave` | All Districts | Permitted Districts Only (`allowed_districts`) | Blocked (403) |
| `POST /admin/staff/toggle-status` | All Districts | Permitted Districts Only (`allowed_districts`) | Blocked (403) |
| `GET /admin/pacing/settings` | Any District | Permitted Districts or State Default | Read-Only |
| `POST /admin/pacing/settings` | State Default or Any District | Permitted Districts Override Only | Blocked (403) |
| `POST /verify-pin` | N/A | N/A | Active Accounts Only (Inactive Blocked 403) |

---

## 6. Verification & Test Plan

### 6.1 Automated Backend Tests (`pytest tests/test_attendance_leaves_and_lifecycle.py`)
1. **Mark/Unmark Leave**:
   - Verify leave doc created in `daily_staff_leaves`.
   - Verify `/admin/today-attendance` moves officer to `on_leave_fos`.
   - Verify unmark deletes doc and moves officer back to `missing_fos`.
2. **RBAC Isolation**:
   - Sub-Admin for Jamui cannot mark leave for Sitamarhi (HTTP 403).
   - Sub-Admin cannot toggle staff status outside permitted districts.
3. **Staff Lifecycle & Cutoff**:
   - Deactivate officer with `inactive_since = "2026-09-22"`.
   - Radar for `2026-09-21` includes officer.
   - Radar for `2026-09-22` excludes officer.
   - `/verify-pin` returns `{ "valid": False, "error": "Account deactivated..." }`.
4. **Pacing Engine & Holidays**:
   - Set district override for declared holidays.
   - Verify `/my-profile-stats` returns adjusted `remaining_working_days` and `required_run_rate`.

### 6.2 Production Verification Battery (GEMINI.md Rule 1)
1. Python compilation: `python -m py_compile main.py` (Exit code 0).
2. Frontend lint: `npm run lint` in `dfy-frontend/` (0 syntax errors).
3. Frontend build: `npm run build` in `dfy-frontend/` (Exit code 0).
4. Git diff audit before proposing any push.
