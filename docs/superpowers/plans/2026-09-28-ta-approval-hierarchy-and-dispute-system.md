# Travel Allowance (TA) Hierarchical Approval Workflow, 24-Hour Dispute System & Drill-Down UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a robust, cost-optimized multi-tier approval workflow (`MIS` data entry $\to$ `MAIN_INCHARGE` review & sign-off), a 24-hour time-gated Frontline FO dispute mechanism, and a clean full-screen drill-down UX (District Roster $\to$ Day-by-Day Table) with discreet pre-fill and zero-leak caching shields.

**Architecture:** Approach 1 (Document-Embedded State Machine with Lightweight Dynamic Roster Aggregation). Extends `travel_allowance_logs` documents with workflow state (`status`, `submitted_at`, `approved_at`, `revert_reason`, `dispute`), adds `MIS` and `MAIN_INCHARGE` roles to `admin_users`, establishes a 2-screen drill-down in Reports Studio, and enforces 3 cost-reduction caching shields (Backend compound query + 300s TTL cache, Client React session cache, FO single-doc direct fetch).

**Tech Stack:** FastAPI (Python 3.14), Google Cloud Firestore, React 19, Vite 8, Tailwind CSS, Pytest, Node.js test runners.

**Spec:** [`docs/superpowers/specs/2026-09-28-ta-approval-hierarchy-and-dispute-system-design.md`](file:///d:/ignou/Mis%20field%20report/docs/superpowers/specs/2026-09-28-ta-approval-hierarchy-and-dispute-system-design.md)

## Global Constraints
- **Zero Push Rule**: All commits strictly remain on local branch `feat/travel-allowance-bike-log`. Zero pushes to `origin/main`.
- **Temporal Dead Zone (TDZ) Rule**: In React components (`AdminDashboard.jsx`, `App.jsx`), base state declarations must precede derived collections, hooks, and event handlers.
- **Production Safety**: Zero runtime crashes, blank screens, or data corruption.
- **Verification Gates**: Every task must pass Python compilation (`py_compile`), backend test suites, and frontend lint/build before committing.
- **Cost-Reduction Protection**: Query Firestore with compound filters (`where("month", "==", month).where("district", "==", dist)`) and cache rosters in `SimpleTTLCache(300)` to prevent excessive reads.

---

### Task 1: Backend Roles (`MIS`, `MAIN_INCHARGE`), State Machine & Batch District Endpoints

**Files:**
- Modify: `main.py:6720-6750` (Role creation & validation)
- Modify: `main.py:9680-9750` (TA log endpoint query filtering & 300s TTL caching)
- Create: `tests/test_ta_approval_workflow.py`

**Interfaces:**
- Consumes: `admin_users` collection, `travel_allowance_logs` collection, `SimpleTTLCache`.
- Produces: 
  - `POST /api/ta/district-action`: `{ month, district, action: 'submit'|'approve'|'revert', revert_reason?: str, staff_keys?: list }`
  - Enhanced `GET /admin/ta/log`: returns cached district records with `status`, `submitted_at`, `approved_at`, `revert_reason`, `dispute`.

- [ ] **Step 1: Write failing backend tests for roles, batch actions, and state transitions**

Create `tests/test_ta_approval_workflow.py`:
```python
import pytest
from httpx import AsyncClient, ASGITransport
import main
from main import app, build_ta_doc_id, canonicalize_district, cache

@pytest.mark.asyncio
async def test_ta_district_action_mis_submit():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Login as Super Admin to create MIS and Incharge test tokens
        mis_token = main.create_access_token({
            "user_id": "test_gaya_mis",
            "name": "Test Gaya MIS",
            "role": "MIS",
            "allowed_districts": ["Gaya"]
        })
        incharge_token = main.create_access_token({
            "user_id": "test_gaya_incharge",
            "name": "Dr. Incharge",
            "role": "MAIN_INCHARGE",
            "allowed_districts": ["Gaya"]
        })

        # Save an initial draft log
        save_res = await ac.post("/api/ta-logs/save", json={
            "month": "2026-09",
            "district": "Gaya",
            "staff_key": "officer_test_1",
            "staff_name": "Officer Test 1",
            "designation": "Field Officer",
            "daily_logs": {
                "2026-09-01": {"initial_reading": 1000, "final_reading": 1050, "total_km": 50, "rate": 4.0, "amount": 200.0}
            },
            "deduction_amount": 0.0,
            "deduction_reason": "",
            "admin_remarks": ""
        }, headers={"Authorization": f"Bearer {mis_token}"})
        assert save_res.status_code == 200

        # MIS submits the district roster
        submit_res = await ac.post("/api/ta/district-action", json={
            "month": "2026-09",
            "district": "Gaya",
            "action": "submit"
        }, headers={"Authorization": f"Bearer {mis_token}"})
        assert submit_res.status_code == 200
        assert submit_res.json().get("success") is True

        # Verify state is now SUBMITTED
        log_res = await ac.get("/admin/ta/log?month=2026-09&district=Gaya", headers={"Authorization": f"Bearer {incharge_token}"})
        assert log_res.status_code == 200
        logs = log_res.json().get("logs", [])
        matched = [l for l in logs if l.get("staff_key") == "officer_test_1"]
        assert len(matched) == 1
        assert matched[0].get("status") == "SUBMITTED"

@pytest.mark.asyncio
async def test_ta_district_action_incharge_approve_and_revert():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        mis_token = main.create_access_token({
            "user_id": "test_gaya_mis",
            "name": "Test Gaya MIS",
            "role": "MIS",
            "allowed_districts": ["Gaya"]
        })
        incharge_token = main.create_access_token({
            "user_id": "test_gaya_incharge",
            "name": "Dr. Incharge",
            "role": "MAIN_INCHARGE",
            "allowed_districts": ["Gaya"]
        })

        # MIS cannot call approve (must be 403 Forbidden)
        forbidden_res = await ac.post("/api/ta/district-action", json={
            "month": "2026-09",
            "district": "Gaya",
            "action": "approve"
        }, headers={"Authorization": f"Bearer {mis_token}"})
        assert forbidden_res.status_code == 403

        # Incharge reverts with remarks
        revert_res = await ac.post("/api/ta/district-action", json={
            "month": "2026-09",
            "district": "Gaya",
            "action": "revert",
            "revert_reason": "Sherghati PHC meter reading needs correction"
        }, headers={"Authorization": f"Bearer {incharge_token}"})
        assert revert_res.status_code == 200

        # Incharge approves district
        approve_res = await ac.post("/api/ta/district-action", json={
            "month": "2026-09",
            "district": "Gaya",
            "action": "approve"
        }, headers={"Authorization": f"Bearer {incharge_token}"})
        assert approve_res.status_code == 200
        assert approve_res.json().get("success") is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_ta_approval_workflow.py -v`  
Expected: FAIL with 404 (endpoint `/api/ta/district-action` not found) or 403.

- [ ] **Step 3: Implement roles, state transitions, compound query, and 300s TTL cache in `main.py`**

In `main.py`:
1. In `AdminUserCreateReq` and `AdminUserUpdateReq`, ensure `role` accepts `"SUPER_ADMIN"`, `"MAIN_INCHARGE"`, `"MIS"`, `"SUB_ADMIN"`.
2. Add Pydantic model for district action:
```python
class TaDistrictActionRequest(BaseModel):
    month: str
    district: str
    action: str  # 'submit' | 'approve' | 'revert'
    revert_reason: Optional[str] = ""
    staff_keys: Optional[List[str]] = None
```
3. Implement `POST /api/ta/district-action`:
   - Enforce authorization: `submit` $\to$ `MIS`, `SUPER_ADMIN`. `approve` / `revert` $\to$ `MAIN_INCHARGE`, `SUPER_ADMIN`.
   - Validate district isolation for assigned districts.
   - Batch query district documents: `db.collection("travel_allowance_logs").where("month", "==", clean_month).where("district", "==", clean_dist)`
   - Set status, timestamps (`submitted_at`, `approved_at`, `reverted_at`), and `revert_reason`.
   - Invalidate cache key: `cache.delete(f"ta_roster_{clean_month}_{clean_dist.lower()}")`.
4. In `GET /admin/ta/log`:
   - When `district` is provided and no single `staff_key` requested, check `cache.get(f"ta_roster_{clean_month}_{clean_dist.lower()}")`.
   - If not cached, execute compound query `.where("month", "==", clean_month).where("district", "==", clean_dist).stream()`, store in `cache.set(..., ttl=300)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_ta_approval_workflow.py -v`  
Expected: 100% PASS (2/2 passed).

- [ ] **Step 5: Verify Python compilation & commit**

Run: `python -m py_compile main.py`  
Commit:
```bash
git add main.py tests/test_ta_approval_workflow.py
git commit -m "feat(backend): implement ta roles, approval state machine and cached district actions"
```

---

### Task 2: Backend 24-Hour Time-Gated Dispute System & Dispute Resolution

**Files:**
- Modify: `main.py` (Add `/api/ta/dispute` and `/api/ta/resolve-dispute`)
- Create: `tests/test_ta_dispute_system.py`

**Interfaces:**
- Consumes: `travel_allowance_logs` with `approved_at` timestamp.
- Produces:
  - `POST /api/ta/dispute`: `{ month, district, staff_key, pin, reason }`
  - `POST /api/ta/resolve-dispute`: `{ month, district, staff_key, resolution: 'accept'|'reject', resolution_note: str }`

- [ ] **Step 1: Write failing backend tests for 24h dispute window and resolution**

Create `tests/test_ta_dispute_system.py`:
```python
import pytest
from datetime import datetime, timedelta
from httpx import AsyncClient, ASGITransport
import main
from main import app, build_ta_doc_id, canonicalize_district, db

@pytest.mark.asyncio
async def test_ta_dispute_24h_window_and_resolution():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        incharge_token = main.create_access_token({
            "user_id": "test_gaya_incharge",
            "name": "Dr. Incharge",
            "role": "MAIN_INCHARGE",
            "allowed_districts": ["Gaya"]
        })

        month = "2026-09"
        district = "Gaya"
        staff_key = "fo_dispute_tester"

        # Seed staff directory entry for PIN validation
        doc_ref = db.collection("staff_directory").document("gaya_fo_dispute_tester")
        doc_ref.set({
            "id": "gaya_fo_dispute_tester",
            "name": "FO Dispute Tester",
            "district": "Gaya",
            "pin": "4321",
            "status": "Active"
        })

        # Seed approved TA log approved 2 hours ago
        ta_doc_id = build_ta_doc_id(month, district, staff_key)
        recent_approval = (datetime.now() - timedelta(hours=2)).strftime("%Y-%m-%d %H:%M:%S")
        db.collection("travel_allowance_logs").document(ta_doc_id).set({
            "month": month,
            "district": district,
            "staff_key": staff_key,
            "staff_name": "FO Dispute Tester",
            "status": "APPROVED",
            "approved_at": recent_approval,
            "approved_by": "Dr. Incharge",
            "total_km": 100,
            "gross_amount": 400.0,
            "deduction_amount": 100.0,
            "final_payable_amount": 300.0
        })

        # FO files dispute within 24h -> Must succeed (200)
        dispute_res = await ac.post("/api/ta/dispute", json={
            "month": month,
            "district": district,
            "staff_key": staff_key,
            "pin": "4321",
            "reason": "100 Rs deduction is incorrect; duty slip attached"
        })
        assert dispute_res.status_code == 200
        assert dispute_res.json().get("success") is True

        # Incharge resolves dispute with 'accept' -> reverts to DRAFT for MIS
        resolve_res = await ac.post("/api/ta/resolve-dispute", json={
            "month": month,
            "district": district,
            "staff_key": staff_key,
            "resolution": "accept",
            "resolution_note": "Reverted to MIS to remove 100 Rs deduction"
        }, headers={"Authorization": f"Bearer {incharge_token}"})
        assert resolve_res.status_code == 200

        # Seed an old approval 25 hours ago -> Dispute must fail with 400 Expired
        old_approval = (datetime.now() - timedelta(hours=25)).strftime("%Y-%m-%d %H:%M:%S")
        db.collection("travel_allowance_logs").document(ta_doc_id).update({
            "status": "APPROVED",
            "approved_at": old_approval,
            "dispute": {"is_disputed": False, "status": "NONE"}
        })
        expired_res = await ac.post("/api/ta/dispute", json={
            "month": month,
            "district": district,
            "staff_key": staff_key,
            "pin": "4321",
            "reason": "Late dispute attempt"
        })
        assert expired_res.status_code == 400
        assert "expired" in expired_res.json().get("detail", "").lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_ta_dispute_system.py -v`  
Expected: FAIL with 404.

- [ ] **Step 3: Implement dispute and resolve-dispute endpoints in `main.py`**

In `main.py`:
1. Add Pydantic models:
```python
class TaDisputeRequest(BaseModel):
    month: str
    district: str
    staff_key: str
    pin: str
    reason: str

class TaResolveDisputeRequest(BaseModel):
    month: str
    district: str
    staff_key: str
    resolution: str  # 'accept' | 'reject'
    resolution_note: Optional[str] = ""
```
2. Implement `POST /api/ta/dispute`:
   - Validate staff PIN against `staff_directory` (using memory cache if possible).
   - Fetch target document `build_ta_doc_id(clean_month, c_dist, staff_key)`.
   - Verify `status == "APPROVED"`.
   - Calculate elapsed seconds: `(datetime.now() - approved_datetime).total_seconds()`.
   - If $> 86400$ ($24\text{ hours}$), raise `HTTPException(400, "The 24-hour dispute window for this approved month has expired.")`.
   - Set `status = "DISPUTED"` and update `dispute` dict. Invalidate cache.
3. Implement `POST /api/ta/resolve-dispute`:
   - Restrict to `MAIN_INCHARGE` or `SUPER_ADMIN`.
   - If `resolution == "accept"`: set `status = "DRAFT"`, set `revert_reason = req.resolution_note`, mark `dispute.status = "ACCEPTED"`.
   - If `resolution == "reject"`: restore `status = "APPROVED"`, mark `dispute.status = "REJECTED"`, store `dispute.resolution_note`. Invalidate cache.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_ta_dispute_system.py -v`  
Expected: 100% PASS.

- [ ] **Step 5: Verify Python compilation & commit**

Run: `python -m py_compile main.py`  
Commit:
```bash
git add main.py tests/test_ta_dispute_system.py
git commit -m "feat(backend): implement 24-hour time-gated fo dispute mechanism and incharge resolution"
```

---

### Task 3: Frontend Full-Screen Drilldown Workspace (Roster $\to$ Day-by-Day) & Discreet Pre-fill

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx`
- Create: `tests/test_ta_admin_drilldown_ui.mjs`

**Interfaces:**
- Consumes: `reportsStudioTab === 'ta_payout'`, `isTaFullscreen`.
- Produces:
  - Screen 1: District Staff TA Payroll Roster (clean view with district selector, month selector, status badge, batch action buttons for MIS & Incharge).
  - Screen 2: Day-by-Day Two-Wheeler Table on *"Inspect / Edit Now ➔"* click with back button, staff switcher, uncropped inputs, and discreet `•••` pre-fill menu.

- [ ] **Step 1: Write failing UI test for full-screen drilldown and discreet pre-fill**

Create `tests/test_ta_admin_drilldown_ui.mjs`:
```javascript
import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log("🔍 Running Admin TA Drilldown & Hierarchy UI Verification Test...");

const adminPath = path.resolve('dfy-frontend/src/AdminDashboard.jsx');
assert(fs.existsSync(adminPath), "AdminDashboard.jsx must exist");
const code = fs.readFileSync(adminPath, 'utf8');

// 1. Drilldown state declaration
assert(
  code.includes('taViewMode') || code.includes('taDrilldownStaff'),
  "AdminDashboard must manage drilldown view state (Roster vs Day-by-Day)"
);

// 2. Screen 1 (Roster First)
assert(
  code.includes("District Staff Travel Allowance Payroll Roster"),
  "Screen 1 must render District Staff TA Payroll Roster"
);

// 3. Role-Based Action Buttons on Screen 1
assert(
  code.includes("Submit Roster to Incharge") || code.includes("Final Submit"),
  "MIS must have a Final Submit Roster button"
);
assert(
  code.includes("Approve District") || code.includes("Approve & Publish"),
  "Incharge must have an Approve District button"
);

// 4. Screen 2 Drilldown & Back Button
assert(
  code.includes("Back to District Roster") || code.includes("Back to Roster"),
  "Screen 2 must include a Back to District Roster button"
);

// 5. Discreet Pre-fill (••• Context Menu)
assert(
  !code.includes('Pre-fill from Daily Reports</button>'),
  "Pre-fill button must NOT be a standalone prominent button in top bar"
);
assert(
  code.includes("Sync from Daily Submissions") || code.includes("handlePrefillTaFromReports"),
  "Pre-fill action must be accessible via discreet context menu"
);

// 6. Revert / Dispute Alert Banners
assert(
  code.includes("revert_reason") || code.includes("revertReason"),
  "Day-by-Day screen must display Incharge revert remarks if rejected"
);

console.log("✅ Admin TA Drilldown & Hierarchy UI Verification Passed 100%!");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_ta_admin_drilldown_ui.mjs`  
Expected: FAIL (view mode / back button not implemented).

- [ ] **Step 3: Implement drill-down view switching, role buttons, discreet menu & alert banners in `AdminDashboard.jsx`**

In `dfy-frontend/src/AdminDashboard.jsx`:
1. Add base state at top (preserving TDZ order):
   ```javascript
   const [taViewMode, setTaViewMode] = useState('roster'); // 'roster' | 'day_by_day'
   const [taShowOptionsMenu, setTaShowOptionsMenu] = useState(false);
   const [taRevertModal, setTaRevertModal] = useState(null); // { isOpen, district, month, reason }
   const [taActionLoading, setTaActionLoading] = useState(false);
   ```
2. When clicking *"Inspect / Edit Now ➔"*:
   - Set `taSelectedStaffKey = staff.id || staff.name`
   - Set `setTaViewMode('day_by_day')`
3. In `reportsStudioTab === 'ta_payout'`:
   - If `taViewMode === 'roster'`:
     - Render Full-Screen Screen 1:
       - Header: DFY Travel Allowance Studio, District Selector, Month Selector, District Status Badge (`DRAFT`, `SUBMITTED`, `APPROVED`, `REVERTED`), Close Studio button.
       - Role Action Bar:
         - If user role is `MIS` or `SUPER_ADMIN`: button *"📤 Submit Roster to Incharge"*.
         - If user role is `MAIN_INCHARGE` or `SUPER_ADMIN`: buttons *"✅ Approve & Publish District"*, *"↩️ Revert District"*.
       - District Payroll Roster table with all staff, totals, status badges, and *"Inspect / Edit Now ➔"*.
   - If `taViewMode === 'day_by_day'`:
     - Render Full-Screen Screen 2:
       - Header:
         - Left: button *"← Back to District Roster"* (`onClick={() => setTaViewMode('roster')}`).
         - Center: District, Month, and Staff dropdown (to jump directly between staff).
         - Right: Discreet `•••` button toggling dropdown with *"⚡ Sync from Daily Submissions"*, Save TA Log button, and Close Studio button.
       - If staff log has `status === 'REVERTED'` or `status === 'DISPUTED'`: prominent amber/rose banner displaying remarks.
       - 4 Month-End Reconciliation Cards.
       - 31-Day Uncropped Table with sticky headers.
4. Implement handlers for `handleDistrictAction('submit'|'approve'|'revert')`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_ta_admin_drilldown_ui.mjs`  
Expected: 100% PASS.

- [ ] **Step 5: Run linter and build to verify zero syntax errors**

Run: `npm --prefix dfy-frontend run lint`  
Run: `npm --prefix dfy-frontend run build`  
Expected: 0 errors, build succeeds.

- [ ] **Step 6: Commit changes locally**

```bash
git add dfy-frontend/src/AdminDashboard.jsx tests/test_ta_admin_drilldown_ui.mjs
git commit -m "feat(ui): implement full-screen ta drilldown roster and discreet pre-fill context menu"
```

---

### Task 4: Frontline Field Officer App Review Lock, Approved Breakdown & 24h Dispute UI

**Files:**
- Modify: `dfy-frontend/src/App.jsx`
- Create: `tests/test_ta_fo_dispute_ui.mjs`

**Interfaces:**
- Consumes: `GET /admin/ta/log?month=...&district=...&staff_key=...&pin=...`
- Produces:
  - Pre-approval lock state: *"Verification in Progress by District MIS & Incharge"*.
  - Post-approval state: Full breakdown + 24h countdown dispute button.
  - Dispute modal dialog submitting to `POST /api/ta/dispute`.

- [ ] **Step 1: Write failing UI test for FO review lock and 24h dispute UI**

Create `tests/test_ta_fo_dispute_ui.mjs`:
```javascript
import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log("🔍 Running FO TA Dispute & Lock UI Verification Test...");

const appPath = path.resolve('dfy-frontend/src/App.jsx');
assert(fs.existsSync(appPath), "App.jsx must exist");
const code = fs.readFileSync(appPath, 'utf8');

// 1. Pre-approval Verification in Progress state
assert(
  code.includes("Verification in Progress") || code.includes("verification_in_progress"),
  "FO App must show Verification in Progress notice when TA is unapproved"
);

// 2. 24-Hour Dispute Window & Button
assert(
  code.includes("Report Dispute") || code.includes("Report Deduction Dispute"),
  "FO App must feature Report Dispute button"
);
assert(
  code.includes("Dispute Window") || code.includes("hours remaining") || code.includes("disputeWindowActive"),
  "FO App must display dispute countdown or window status"
);

// 3. Dispute Modal & Submission
assert(
  code.includes("handleFileTaDispute") || code.includes("/api/ta/dispute"),
  "FO App must handle dispute submission to /api/ta/dispute"
);

console.log("✅ FO TA Dispute & Lock UI Verification Passed 100%!");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_ta_fo_dispute_ui.mjs`  
Expected: FAIL.

- [ ] **Step 3: Implement pre-approval lock, approved breakdown & 24h dispute UI in `App.jsx`**

In `dfy-frontend/src/App.jsx`:
1. In `MyProfileDashboard` (or TA inspection section):
   - When fetching monthly TA summary:
     - Check `log.status`.
     - If `log.status !== 'APPROVED'`: render clean informational card:
       - *"🛵 Monthly Travel Allowance (Month: {month})"*
       - *"⏳ Verification in Progress by District MIS & Incharge"*
       - Explain that meter readings are currently being audited and final approved reimbursement will appear after sign-off.
     - If `log.status === 'APPROVED'`:
       - Calculate remaining dispute time: `const remainingMs = (new Date(log.approved_at).getTime() + 24*3600*1000) - Date.now()`.
       - If `remainingMs > 0`:
         - Display amber badge: `⏱️ Dispute Window: ${Math.floor(remainingMs/3600000)}h ${Math.floor((remainingMs%3600000)/60000)}m remaining`.
         - Button: *"⚠️ Report Deduction Dispute / Claim"*.
         - Clicking opens Dispute Modal:
           - Input field for justification / duty remarks.
           - Submit button calling `POST /api/ta/dispute`.
       - If `remainingMs <= 0` or dispute locked:
         - Display badge: `🔒 Payroll Finalized & Verified`.
       - Display verified total KM, gross amount, deductions with reasons, and net payable.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_ta_fo_dispute_ui.mjs`  
Expected: 100% PASS.

- [ ] **Step 5: Run linter and build to verify zero syntax errors**

Run: `npm --prefix dfy-frontend run lint`  
Run: `npm --prefix dfy-frontend run build`  
Expected: 0 errors, build succeeds.

- [ ] **Step 6: Commit changes locally**

```bash
git add dfy-frontend/src/App.jsx tests/test_ta_fo_dispute_ui.mjs
git commit -m "feat(fo): add pre-approval review lock, approved payout breakdown and 24h dispute claim modal"
```

---

### Task 5: End-to-End Verification Battery & Documentation Polish

**Files:**
- Modify: `dfy-frontend/src/changelogData.js`
- Test: All test suites

- [ ] **Step 1: Update changelog in `changelogData.js`**

Add entry for TA hierarchical approval, dispute system, and drilldown workspace under the current feature branch.

- [ ] **Step 2: Run complete backend test battery**

```bash
python -m py_compile main.py
pytest tests/test_ta_approval_workflow.py tests/test_ta_dispute_system.py tests/test_travel_allowance_backend.py tests/test_travel_allowance_excel_export.py -v
```
Expected: 100% PASS.

- [ ] **Step 3: Run complete frontend UI test battery**

```bash
node tests/test_ta_reports_integration_ui.mjs
node tests/test_admin_ta_studio_ui.mjs
node tests/test_ta_admin_drilldown_ui.mjs
node tests/test_ta_fo_dispute_ui.mjs
```
Expected: 100% PASS.

- [ ] **Step 4: Run frontend linter and production build**

```bash
npm --prefix dfy-frontend run lint
npm --prefix dfy-frontend run build
```
Expected: 0 syntax errors, Vite build exits 0.

- [ ] **Step 5: Git diff audit & local commit**

Audit `git diff` line-by-line to guarantee zero unintended edits.
```bash
git add dfy-frontend/src/changelogData.js
git commit -m "chore: complete verification battery for ta approval hierarchy, 24h dispute and drilldown ux"
```
Ensure **zero push to `origin/main`**.
