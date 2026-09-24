# Staff Attendance Workbook, Retroactive Remarks, Bulletin Fix & Visual Flowcharts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul Report Studio to replace legacy Dossier with a Dual-Sheet Staff Attendance Excel export with multi-district queueing; implement retroactive admin remarks and leave overrides on any day with live FO calendar sync; fix WhatsApp bulletin data generation; and embed responsive native Bento flowcharts in Admin SOP and FO Guide (with zero leak of stealth 10 AM cutoff).

**Architecture:**
- **Attendance Excel Generator**: High-performance openpyxl streaming in `main.py` producing Sheet 1 (Attendance Matrix Days 1-31 with status codes `P`, `ML`, `CL`, `OD`, `A`, `WO`, `H` and summary totals) and Sheet 2 (Detailed Daily Activity Log with travel KM and remarks), guarded by `asyncio.Semaphore(1)` and immediate GC.
- **Retroactive Remark Engine**: `POST /admin/attendance/add-remark` in `main.py` enabling dual-action inspection remarks or leave overrides on past/present dates, clearing attendance/profile caches, and hydrating into FO calendar.
- **Report Studio UI Overhaul**: Replace dossier with multi-district attendance deck supporting Scoped ZIP and sequential queueing (1s cooldown) in `AdminDashboard.jsx`.
- **WhatsApp Bulletin Fix**: Canonical district matching and reactive `useMemo` rendering the complete dynamic bulletin with copy and WhatsApp Web buttons.
- **Native Bento Flowcharts**: Clean, responsive SVG/CSS step-card diagrams in `App.jsx` (FO Guide) and `AdminDashboard.jsx` (Admin SOP), with strict omission of the stealth cutoff from FO documentation.

**Tech Stack:** Python 3.14 / FastAPI, Google Cloud Firestore, openpyxl, React 19, Tailwind CSS v4, Node.js v24 ESM test runner.

**Spec:** `docs/superpowers/specs/2026-09-25-staff-attendance-export-retroactive-remarks-and-visual-guides-design.md`

## Global Constraints

- Production environment: Zero runtime crashes, white screens, data corruption, or breaking regressions.
- Temporal Dead Zone (TDZ) Rule: Never reference state or derived variables before their lexical declaration.
- Anti-Double-Tap & Concurrency Guards: Ensure loading/disabled states on all mutations and exports.
- Cross-District Isolation: Sub-Admin users must never access or modify data outside permitted districts (HTTP 403).
- Verification Battery: `python -m py_compile main.py` exit code 0; `pytest tests/` 100% pass; `npm run lint` 0 errors; `npm run build` exit code 0.
- GEMINI.md Rule 5: Commit locally first, summarize evidence, and wait for explicit user approval before `git push origin main`.
- **Zero-Leakage Privacy Rule**: Under NO circumstances should the Stealth 10:00 AM Reporting Cutoff be mentioned in the Field Officer Guide (`App.jsx`).

---

### Task 1: Backend Staff Attendance Dual-Sheet Excel Generator (`/admin/export-staff-attendance`)

**Files:**
- Modify: `main.py:3400-3500` (Add `/admin/export-staff-attendance`, remove/replace legacy dossier)
- Test: `tests/test_staff_attendance_export.py`

**Interfaces:**
- Consumes: `month: str`, `district: Optional[str]`, `districts: Optional[str]`, `admin: dict`
- Produces: Dual-Sheet Streaming Excel response (`DFY_Staff_Attendance_<District>_<Month>.xlsx`) with:
  - Sheet 1: `Attendance Matrix` (Headers: SL, District, Officer Name, Designation, 1..31, Total Days, Present, Leaves, Absent, Travel KM, Remarks)
  - Sheet 2: `Daily Activity Log` (Headers: Date, District, Officer Name, Status, Total IDs, Notifications, Tests, DBT, Travel KM, Visited Doctors, Admin Remark)

- [ ] **Step 1: Write the failing test**

```python
# tests/test_staff_attendance_export.py
import io
import pytest
import pandas as pd
from unittest.mock import patch, MagicMock
import main

@pytest.mark.asyncio
async def test_staff_attendance_export_dual_sheet_structure():
    mock_admin = {"username": "admin", "role": "SUPER_ADMIN"}
    
    with patch("main.get_raw_monthly_reports") as mock_reports, \
         patch("main.db.collection") as mock_coll:
        
        # Mock staff directory
        staff_doc = MagicMock()
        staff_doc.to_dict.return_value = {"name": "Rahul Kumar", "district": "Muzaffarpur", "designation": "Field Officer"}
        mock_coll.return_value.stream.return_value = [staff_doc]
        
        # Mock daily field reports
        mock_reports.return_value = [{
            "working_place": "Muzaffarpur",
            "fo_name": "Rahul Kumar",
            "date_of_reporting": "2026-09-15",
            "submission_count": 1,
            "total_km": 25,
            "notification_ids": ["123456789"],
            "sample_tested_ids": [],
            "dbt_ids": [],
            "visited_names": ["Dr. Sharma"]
        }]
        
        response = await main.export_staff_attendance(
            month="2026-09",
            district="Muzaffarpur",
            admin=mock_admin
        )
        
        content = response.body
        excel_file = io.BytesIO(content)
        xls = pd.ExcelFile(excel_file)
        
        assert "Attendance Matrix" in xls.sheet_names, "Workbook must contain Sheet 1: 'Attendance Matrix'"
        assert "Daily Activity Log" in xls.sheet_names, "Workbook must contain Sheet 2: 'Daily Activity Log'"
        
        df_matrix = pd.read_excel(xls, sheet_name="Attendance Matrix")
        assert "Officer Name" in df_matrix.columns
        assert "Total Days" in df_matrix.columns
        assert "Present" in df_matrix.columns
        assert "Travel KM" in df_matrix.columns

@pytest.mark.asyncio
async def test_staff_attendance_export_subadmin_rbac_isolation():
    mock_subadmin = {"username": "subadmin", "role": "SUB_ADMIN", "allowed_districts": ["Buxar"]}
    
    with pytest.raises(main.HTTPException) as excinfo:
        await main.export_staff_attendance(
            month="2026-09",
            district="Muzaffarpur",
            admin=mock_subadmin
        )
    assert excinfo.value.status_code == 403, "Sub-admin must be forbidden from exporting outside allowed districts"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_staff_attendance_export.py -v`
Expected: FAIL (AttributeError: `export_staff_attendance` not found)

- [ ] **Step 3: Implement `export_staff_attendance` in `main.py`**

1. Define concurrency semaphore: `attendance_excel_semaphore = asyncio.Semaphore(1)`.
2. Implement route:
```python
@app.get("/admin/export-staff-attendance")
async def export_staff_attendance(
    month: Optional[str] = None, 
    district: Optional[str] = None,
    districts: Optional[str] = None, 
    admin: dict = Depends(get_current_admin)
):
    # RBAC check
    if admin.get("role") == "SUB_ADMIN":
        allowed = admin.get("allowed_districts", [])
        allowed_c = [canonicalize_district(d).lower() for d in allowed]
        if district and district != "All" and canonicalize_district(district).lower() not in allowed_c:
            raise HTTPException(status_code=403, detail=f"Permission denied for district: {district}")

    async with attendance_excel_semaphore:
        # 1. Fetch staff directory, leaves, and monthly reports
        # 2. Build Sheet 1 (Attendance Matrix Days 1..31 with status codes P, ML, CL, OD, A, WO, H)
        # 3. Build Sheet 2 (Daily Activity Log with KM, IDs, Visited Doctors, Remarks)
        # 4. Stream as application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```
3. Apply styling with `openpyxl` (Colors: Emerald for `P`, Amber for `ML`, Sky for `CL`, Indigo for `OD`, Rose for `A`).
4. Force `gc.collect()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_staff_attendance_export.py -v`
Expected: PASS (2 passed)
Run: `python -m py_compile main.py`
Expected: Exit code 0

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_staff_attendance_export.py
git commit -m "feat(backend): implement dual-sheet staff attendance excel generator with rbac and concurrency guards"
```

---

### Task 2: Backend Retroactive Admin Remarks & Leave Override Endpoint (`/admin/attendance/add-remark`) & FO Profile Hydration

**Files:**
- Modify: `main.py:2550-2620, 8100-8250`
- Test: `tests/test_retroactive_attendance_remarks.py`

**Interfaces:**
- Consumes: `district: str`, `fo_name: str`, `date: str`, `action: str` ("remark" or "override_leave"), `remark: str`, `status: Optional[str]`, `reason_type: Optional[str]`
- Produces: `{"success": True, "message": ...}`; enriches `my_profile_stats` with `admin_remark` and updated leave status.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_retroactive_attendance_remarks.py
import pytest
from unittest.mock import patch, MagicMock
import main

@pytest.mark.asyncio
async def test_add_attendance_remark_only():
    mock_admin = {"username": "admin", "name": "Admin Saurav", "role": "SUPER_ADMIN"}
    req = main.AttendanceRemarkReq(
        district="Muzaffarpur",
        fo_name="Rahul Kumar",
        date="2026-09-20",
        action="remark",
        remark="Field checked with Dr. Sharma. 4 IDs verified."
    )
    with patch("main.db.collection") as mock_coll:
        res = await main.add_attendance_remark(req, admin=mock_admin)
        assert res.get("success") is True
        assert "recorded" in res.get("message", "").lower()

@pytest.mark.asyncio
async def test_override_attendance_to_leave():
    mock_admin = {"username": "admin", "name": "Admin Saurav", "role": "SUPER_ADMIN"}
    req = main.AttendanceRemarkReq(
        district="Muzaffarpur",
        fo_name="Rahul Kumar",
        date="2026-09-20",
        action="override_leave",
        remark="Staff reported sick on phone",
        status="leave",
        reason_type="Medical"
    )
    with patch("main.db.collection") as mock_coll:
        res = await main.add_attendance_remark(req, admin=mock_admin)
        assert res.get("success") is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_retroactive_attendance_remarks.py -v`
Expected: FAIL (AttributeError: `AttendanceRemarkReq` or `add_attendance_remark` not found)

- [ ] **Step 3: Implement `add_attendance_remark` in `main.py`**

1. Define `AttendanceRemarkReq`:
```python
class AttendanceRemarkReq(BaseModel):
    district: str
    fo_name: str
    date: str
    action: str = "remark" # "remark" or "override_leave"
    remark: str
    status: Optional[str] = "leave"
    reason_type: Optional[str] = "Casual"
```
2. Implement `@app.post("/admin/attendance/add-remark")`:
- Check RBAC permissions.
- If `action == "remark"`: Write remark to `daily_staff_leaves` doc or update day report `admin_remark`.
- If `action == "override_leave"`: Write leave status with remark to `daily_staff_leaves`.
- Evict caches: `cache.delete_prefix("attendance_")` and `cache.delete_prefix("profile_")`.
- Update in-memory monthly cache.
3. In `my_profile_stats`:
Hydrate `admin_remark` into `daily_history[date]` for both submitted days and leave days.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_retroactive_attendance_remarks.py -v`
Expected: PASS (2 passed)
Run: `python -m py_compile main.py`
Expected: Exit code 0

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_retroactive_attendance_remarks.py
git commit -m "feat(backend): implement retroactive attendance remarks and leave overrides with profile stats hydration"
```

---

### Task 3: Frontend Report Studio Staff Attendance Tab, Multi-District Queue & Dossier Removal (`AdminDashboard.jsx`)

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx:160-165, 8600-8615, 9150-9175`
- Test: `tests/test_staff_attendance_ui.mjs`

**Interfaces:**
- Consumes: `GET /admin/export-staff-attendance`
- Produces: `reportsStudioTab === "staff_attendance"`, multi-district selection deck, Scoped ZIP download, Sequential Queue download with live progress.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/test_staff_attendance_ui.mjs
import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

const adminCode = readFileSync(resolve('dfy-frontend/src/AdminDashboard.jsx'), 'utf8');

// 1. Verify legacy Dossier is removed
assert(!adminCode.includes('Field Officer Monthly Appraisal & TA/DA Dossier'), "Legacy Dossier heading must be removed");
assert(!adminCode.includes('/admin/export-fo-dossier'), "Legacy Dossier export URL must be removed");

// 2. Verify new Staff Attendance tab exists
assert(adminCode.includes('staff_attendance'), "Report Studio must have 'staff_attendance' tab");
assert(adminCode.includes('Staff Attendance (.xlsx)'), "Tab label must be 'Staff Attendance (.xlsx)'");
assert(adminCode.includes('/admin/export-staff-attendance'), "Must call /admin/export-staff-attendance");

// 3. Verify Multi-District Queue and Scoped ZIP exist for attendance
assert(adminCode.includes('handleDownloadStaffAttendanceQueue') || adminCode.includes('handleDownloadAttendanceScopedZip'), "Must have queue/ZIP handlers for attendance");

console.log("✔ Staff Attendance UI assertions passed!");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_staff_attendance_ui.mjs`
Expected: FAIL

- [ ] **Step 3: Implement minimal code in `AdminDashboard.jsx`**

1. Replace `fo_dossier` in `reportsStudioTab` list with `{ id: "staff_attendance", label: "📋 Staff Attendance (.xlsx)", icon: "📅" }`.
2. Remove legacy Dossier view and replace with `Staff Attendance Deck`:
   - District selection chips (All / Clear).
   - Scoped ZIP download button (`handleDownloadAttendanceScopedZip`).
   - One-by-One Queue download button (`handleDownloadStaffAttendanceQueue`) with 1-second delay and memory protection banner.
3. Wire API call to `${API_BASE_URL}/admin/export-staff-attendance?month=${month}&district=${dist}&token=${getAdminToken()}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_staff_attendance_ui.mjs`
Expected: PASS
Run: `npm --prefix dfy-frontend run lint`
Expected: 0 syntax errors.
Run: `npm --prefix dfy-frontend run build`
Expected: Exit code 0.

- [ ] **Step 5: Commit**

```bash
git add dfy-frontend/src/AdminDashboard.jsx tests/test_staff_attendance_ui.mjs
git commit -m "feat(ui): replace legacy dossier with staff attendance dual-sheet export and multi-district queue"
```

---

### Task 4: Frontend Attendance Radar Retroactive Remarks / Leave Modal on Submitted & Defaulter Cards (`AdminDashboard.jsx`)

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx:10200-10350`
- Test: `tests/test_retroactive_remarks_ui.mjs`

**Interfaces:**
- Consumes: `POST /admin/attendance/add-remark`
- Produces: `📝 Remark / Leave` button on Submitted & Defaulter cards, and dual-action modal (Inspection Remark vs Leave Override).

- [ ] **Step 1: Write the failing test**

```javascript
// tests/test_retroactive_remarks_ui.mjs
import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

const adminCode = readFileSync(resolve('dfy-frontend/src/AdminDashboard.jsx'), 'utf8');

// 1. Verify remark/leave button exists on submitted cards
assert(adminCode.includes('handleOpenRemarkModal') || adminCode.includes('setAttendanceRemarkModal'), "Must have remark modal trigger for submitted cards");

// 2. Verify dual-action choice exists in modal
assert(adminCode.includes('/admin/attendance/add-remark'), "Must call /admin/attendance/add-remark");
assert(adminCode.includes('Inspection Remark') || adminCode.includes('Admin Remark'), "Modal must support inspection remark");
assert(adminCode.includes('override_leave') || adminCode.includes('Override to Leave'), "Modal must support leave override");

console.log("✔ Retroactive remarks UI assertions passed!");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_retroactive_remarks_ui.mjs`
Expected: FAIL

- [ ] **Step 3: Implement minimal code in `AdminDashboard.jsx`**

1. Add state:
```javascript
const [attendanceRemarkModal, setAttendanceRemarkModal] = useState({
  isOpen: false,
  district: '',
  fo_name: '',
  date: '',
  action: 'remark', // 'remark' | 'override_leave'
  remark: '',
  status: 'leave',
  reason_type: 'Casual'
});
const [isSavingAttendanceRemark, setIsSavingAttendanceRemark] = useState(false);
```
2. In submitted cards (`filteredSubmitted.map`) and defaulters cards (`filteredDefaulters.map`):
Render `📝 Remark / Leave` button opening `attendanceRemarkModal`.
3. In `AttendanceRemarkModal`:
Provide segmented toggle:
- `📋 Add Inspection Remark` (Keeps report submitted, records official feedback)
- `⚠️ Override to Leave / Absent` (Select status: Medical, Casual, Official Duty, Absent)
Textarea for remark and Submit button calling `/admin/attendance/add-remark`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_retroactive_remarks_ui.mjs`
Expected: PASS
Run: `npm --prefix dfy-frontend run lint`
Expected: 0 syntax errors.
Run: `npm --prefix dfy-frontend run build`
Expected: Exit code 0.

- [ ] **Step 5: Commit**

```bash
git add dfy-frontend/src/AdminDashboard.jsx tests/test_retroactive_remarks_ui.mjs
git commit -m "feat(ui): add retroactive attendance remark and leave override controls to attendance radar"
```

---

### Task 5: Frontend Report Studio WhatsApp Bulletin Data Fix & Reactive Preview (`AdminDashboard.jsx`)

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx:3175-3215, 9215-9240`
- Test: `tests/test_whatsapp_bulletin_fix.mjs`

**Interfaces:**
- Consumes: `rawRecords`, `targetsData`, `districts`, `month`, `totals`
- Produces: `liveWhatsAppBulletin` (memoized string), live interactive preview, Copy & WhatsApp Web share buttons.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/test_whatsapp_bulletin_fix.mjs
import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

const adminCode = readFileSync(resolve('dfy-frontend/src/AdminDashboard.jsx'), 'utf8');

// 1. Verify canonical district matching in bulletin calculation
assert(adminCode.includes('canonicalizeDistrict(r.working_place)') || adminCode.includes('canonicalizeDistrict(r.district)'), "Bulletin aggregation must use canonicalizeDistrict");

// 2. Verify reactive bulletin text is bound to the preview container
assert(adminCode.includes('liveWhatsAppBulletin') || adminCode.includes('whatsAppBulletinText'), "Must have reactive bulletin memo");
assert(!adminCode.includes('?? Top Districts ranked by Notification Target %`'), "Hardcoded static 4-line preview must be replaced with reactive bulletin");

// 3. Verify WhatsApp Web direct link
assert(adminCode.includes('api.whatsapp.com/send') || adminCode.includes('wa.me'), "Must provide direct WhatsApp share button");

console.log("✔ WhatsApp Bulletin fix assertions passed!");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_whatsapp_bulletin_fix.mjs`
Expected: FAIL

- [ ] **Step 3: Implement minimal code in `AdminDashboard.jsx`**

1. Create `liveWhatsAppBulletin` useMemo:
```javascript
const liveWhatsAppBulletin = useMemo(() => {
  // Aggregate using canonicalizeDistrict(r.working_place) === dist
  // Build state totals, rankings with medals 🥇 🥈 🥉, target percentages
  // Return complete formatted string
}, [month, totals, rawRecords, targetsData, districts, currentUser]);
```
2. Replace static preview in Report Studio with `{liveWhatsAppBulletin}` inside `<pre className="font-mono text-xs whitespace-pre-wrap select-all ...">`.
3. Add `Open in WhatsApp Web` button linking to `https://api.whatsapp.com/send?text=${encodeURIComponent(liveWhatsAppBulletin)}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_whatsapp_bulletin_fix.mjs`
Expected: PASS
Run: `npm --prefix dfy-frontend run lint`
Expected: 0 syntax errors.
Run: `npm --prefix dfy-frontend run build`
Expected: Exit code 0.

- [ ] **Step 5: Commit**

```bash
git add dfy-frontend/src/AdminDashboard.jsx tests/test_whatsapp_bulletin_fix.mjs
git commit -m "fix(bulletin): fix whatsapp bulletin district aggregation, bind reactive preview, and add web share"
```

---

### Task 6: Native Bento Flowcharts in Admin SOP & FO Guide, Version Bump & Zero-Leakage Privacy (`App.jsx`, `AdminDashboard.jsx`, `changelogData.js`)

**Files:**
- Modify: `dfy-frontend/src/App.jsx:1780-1920` (FO Guide Flowcharts)
- Modify: `dfy-frontend/src/AdminDashboard.jsx:12440-12580` (Admin SOP Flowcharts)
- Modify: `dfy-frontend/src/changelogData.js:1-40` (Bump to v2.8.2)
- Test: `tests/test_visual_flowcharts_ui.mjs`

**Interfaces:**
- Consumes: Workflow concepts
- Produces: Responsive SVG/CSS Bento step-cards with connectors and status badges; updated changelog.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/test_visual_flowcharts_ui.mjs
import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

const appCode = readFileSync(resolve('dfy-frontend/src/App.jsx'), 'utf8');
const adminCode = readFileSync(resolve('dfy-frontend/src/AdminDashboard.jsx'), 'utf8');
const changelogCode = readFileSync(resolve('dfy-frontend/src/changelogData.js'), 'utf8');

// 1. Verify FO Guide has visual bento workflow step cards
assert(appCode.includes('Daily Reporting Lifecycle') || appCode.includes('Reporting Workflow'), "FO Guide must feature Reporting Workflow");
assert(appCode.includes('Patient Journey & 1-Tap Calling') || appCode.includes('Direct Patient Call'), "FO Guide must feature Patient Calling guide");

// 2. CRITICAL ZERO-LEAKAGE PRIVACY CHECK: Stealth 10 AM Cutoff MUST NOT be in FO Guide!
assert(!appCode.includes('Stealth 10:00 AM') && !appCode.includes('10:00 AM Cutoff') && !appCode.includes('10 AM grace'), "CRITICAL: Stealth 10 AM Cutoff must NOT be leaked in FO Guide!");

// 3. Verify Admin SOP has visual bento workflow step cards
assert(adminCode.includes('Attendance Monitoring Workflow') || adminCode.includes('Radar Workflow'), "Admin SOP must feature Attendance Workflow");
assert(adminCode.includes('Nikshay Reconciler Workflow') || adminCode.includes('Reconciliation Process'), "Admin SOP must feature Reconciler Workflow");

// 4. Verify Version Bump
assert(changelogCode.includes('export const APP_VERSION = "2.8.2"'), "App version must be bumped to 2.8.2");

console.log("✔ Visual flowcharts and privacy assertions passed!");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_visual_flowcharts_ui.mjs`
Expected: FAIL

- [ ] **Step 3: Implement minimal code**

1. In `dfy-frontend/src/App.jsx`:
Embed responsive Bento Flowcharts in `FieldOfficerGuideModal`:
- Diagram 1: Daily Reporting Flow (Morning Visit -> Evening Entry -> Duplicate Check -> Submission -> Calendar confirmation).
- Diagram 2: Patient Journey & 1-Tap Call Workflow.
- Diagram 3: Leave & Calendar Color Legend.
- Strict Privacy: Zero mention of the Stealth 10 AM Cutoff!
2. In `dfy-frontend/src/AdminDashboard.jsx`:
Embed Bento Flowcharts in `showAppGuideModal` (Admin SOP):
- Diagram 1: Attendance Monitoring & Defaulter Radar.
- Diagram 2: Nikshay Excel Reconciler & Monotonic Ledger.
- Diagram 3: Retrospective Attendance Editing & Monthly Export.
3. In `dfy-frontend/src/changelogData.js`:
- Set `export const APP_VERSION = "2.8.2"`.
- Add `v2.8.2` changelog detailing the new Staff Attendance Excel export, retroactive remarks, WhatsApp bulletin fix, and visual workflow diagrams.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_visual_flowcharts_ui.mjs`
Expected: PASS
Run: `npm --prefix dfy-frontend run lint`
Expected: 0 syntax errors.
Run: `npm --prefix dfy-frontend run build`
Expected: Exit code 0.

- [ ] **Step 5: Commit**

```bash
git add dfy-frontend/src/App.jsx dfy-frontend/src/AdminDashboard.jsx dfy-frontend/src/changelogData.js tests/test_visual_flowcharts_ui.mjs
git commit -m "feat(ui): add visual bento flowcharts to fo guide and admin sop, bump to v2.8.2, preserve cutoff privacy"
```

---

### Task 7: Full Verification Battery, Git Diff Audit & Approval Gate

- [ ] **Step 1: Execute Complete Verification Suite**
  - `python -m py_compile main.py` (Must exit code 0)
  - `pytest tests/ -k "not mjs" -v` (All tests must pass)
  - `npm --prefix dfy-frontend run lint` (0 syntax errors)
  - `npm --prefix dfy-frontend run build` (Exit code 0)
  - Run all Node verification test suites:
    ```bash
    node tests/test_staff_attendance_ui.mjs
    node tests/test_retroactive_remarks_ui.mjs
    node tests/test_whatsapp_bulletin_fix.mjs
    node tests/test_visual_flowcharts_ui.mjs
    node tests/test_submission_time_format.mjs
    node tests/test_fo_calendar_leave_ui.mjs
    node tests/test_patient_contact_ui.mjs
    ```
- [ ] **Step 2: Git Diff Audit**
  - Line-by-line review of `git diff` against `origin/main`.
- [ ] **Step 3: User Approval Gate**
  - Compile evidence summary in `walkthrough.md`.
  - Present results to user and wait for explicit approval before running `git push origin main`.
