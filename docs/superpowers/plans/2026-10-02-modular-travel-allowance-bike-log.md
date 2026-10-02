# Modular Travel Allowance (TA) & Bike Log Subsystem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready, modular Travel Allowance (TA) and Bike Log management subsystem in DFY MIS with multi-tier role governance, granular per-staff approvals, locking/unlocking controls, dual-alert 24-hour disputes, dynamic KM rates, and multi-sheet payroll Excel exports.

**Architecture:** 
- Backend creates an isolated `backend/routers/travel_allowance.py` mounted cleanly in `main.py`, providing in-memory TTL caching and single-read FO lookups.
- Admin Web UI adds a dedicated 2-tier workspace in `TravelAllowanceModal.jsx` powered by an isolated `useAdminTA.js` hook, featuring district payroll rosters and 31-day meter readings drilldowns with hidden pre-fill menus.
- Field Officer Mobile App embeds a clean `TravelAllowanceCard.jsx` in `App.jsx` with privacy guards during review and a 24-hour dispute window once approved.

**Tech Stack:** React 19, FastAPI, Google Cloud Firestore, OpenPyXL, Python 3.11/3.14, Tailwind CSS, Vite.

**Spec:** `docs/superpowers/specs/2026-10-02-modular-travel-allowance-bike-log-design.md`

## Global Constraints

- Production environment: Zero runtime crashes, blank/white screens, data corruption, or unhandled promise rejections.
- Strict Zero-Push Rule: Commit locally only on branch `feat/travel-allowance-modular`. Do NOT run `git push`!
- Temporal Dead Zone (TDZ) Rule: Strict lexical declaration order; base states -> derived collections -> handlers -> effects.
- Anti-Double-Tap & Concurrency Guards on all mutations and Excel exports.
- Sub-Admin cross-district security isolation strictly enforced against `allowed_districts`.
- Incharge Read-Only rule: Incharge users cannot directly edit readings; they review, pass, revert, or unlock.
- Locked Record rule: Approved records are locked; mutations return HTTP 423 unless explicitly unlocked by Incharge/Super Admin.
- Hidden Pre-fill rule: Pre-fill from reports action is restricted to Sub-Admin/Admin and tucked into a discreet context menu (`•••`).
- Dynamic KM Rate: Centrally stored in `app_settings/travel_allowance` and synced across calculations, UI, and Excel formulas.
- All 191 existing backend pytest tests and 16 Node regression test suites must pass 100%.

---

### Task 1: Backend TA Router & Core Endpoints

**Files:**
- Create: `backend/routers/travel_allowance.py`
- Modify: `main.py:230-245`
- Test: `tests/test_travel_allowance_backend.py`

**Interfaces:**
- Consumes: `backend.core.database.get_db`, `backend.core.security.get_current_user`, `backend.core.cache.cache`
- Produces: `router` exporting `/admin/ta/rate`, `/admin/ta/roster`, `/admin/ta/prefill`, `/admin/ta/save-log`

- [ ] **Step 1: Write the failing test**

Create `tests/test_travel_allowance_backend.py`:
```python
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

def test_ta_router_endpoints_exist_and_rbac():
    import main
    client = TestClient(main.app)
    
    # 1. Unauthenticated request rejected
    res = client.get("/admin/ta/rate")
    assert res.status_code == 401
    
    # 2. Get default rate with admin mock
    with patch("backend.core.security.get_current_user", return_value={"uid": "u1", "role": "SUPER_ADMIN", "allowed_districts": ["All"]}):
        res = client.get("/admin/ta/rate")
        assert res.status_code == 200
        data = res.json()
        assert "rate_per_km" in data
        assert data["rate_per_km"] == 4.0

def test_ta_save_log_calculates_gross_and_net():
    from backend.routers.travel_allowance import calculate_log_totals
    
    days = [
        {"day": 1, "morning_km": 100.0, "evening_km": 125.0, "total_km": 25.0},
        {"day": 2, "morning_km": 125.0, "evening_km": 150.0, "total_km": 25.0},
    ]
    totals = calculate_log_totals(days, rate_per_km=4.0, deduction_amount=20.0)
    assert totals["total_km"] == 50.0
    assert totals["gross_amount"] == 200.0
    assert totals["deduction_amount"] == 20.0
    assert totals["final_payable_amount"] == 180.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_travel_allowance_backend.py -v`
Expected: FAIL with "module not found" or "cannot import travel_allowance"

- [ ] **Step 3: Implement `backend/routers/travel_allowance.py` and mount in `main.py`**

Create `backend/routers/travel_allowance.py` with:
- Models: `TaRateUpdateReq`, `TaDayReading`, `TaLogSaveReq`, `TaStaffActionReq`.
- Helper: `calculate_log_totals(days, rate_per_km, deduction_amount)`.
- `GET /admin/ta/rate`: returns current rate from `app_settings/travel_allowance` (fallback 4.0).
- `POST /admin/ta/rate`: updates rate if role is `SUPER_ADMIN` or `MAIN_INCHARGE`.
- `GET /admin/ta/roster`: queries `travel_allowance_logs` by `month` and `district`, checks Sub-Admin district access, enriches with staff directory.
- `POST /admin/ta/prefill`: reads `daily_field_reports` for month/district, maps `morning_km`, `evening_km`, `visited_names`, computes daily KM.
- `POST /admin/ta/save-log`: verifies record is not locked, recomputes gross & net, saves to Firestore, clears cache.

Mount in `main.py`:
```python
from backend.routers import travel_allowance
app.include_router(travel_allowance.router)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_travel_allowance_backend.py -v`
Expected: PASS (100%)

- [ ] **Step 5: Run quality checks and commit**

```bash
python -m py_compile main.py backend/routers/travel_allowance.py
git add backend/routers/travel_allowance.py main.py tests/test_travel_allowance_backend.py
git commit -m "feat(ta-backend): implement core travel allowance router, rate configuration, and roster endpoints"
```

---

### Task 2: State Machine, Granular Pass/Revert, Locking, Dispute & Excel Export

**Files:**
- Modify: `backend/routers/travel_allowance.py`
- Test: `tests/test_ta_approval_and_dispute_workflow.py`
- Test: `tests/test_travel_allowance_excel_export.py`

**Interfaces:**
- Consumes: `travel_allowance_logs` Firestore collection, `openpyxl`
- Produces: `/admin/ta/submit-roster`, `/admin/ta/pass-staff`, `/admin/ta/revert-staff`, `/admin/ta/unlock-staff`, `/fo/ta/monthly-summary`, `/fo/ta/dispute`, `/admin/ta/resolve-dispute`, `/admin/ta/export-excel`

- [ ] **Step 1: Write the failing test**

Create `tests/test_ta_approval_and_dispute_workflow.py`:
```python
import pytest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

def test_granular_per_staff_pass_and_revert():
    from backend.routers.travel_allowance import apply_staff_status_transition
    
    # 5 staff members
    staff_records = {
        "s1": {"status": "SUBMITTED", "is_locked": False},
        "s2": {"status": "SUBMITTED", "is_locked": False},
        "s3": {"status": "SUBMITTED", "is_locked": False},
        "s4": {"status": "SUBMITTED", "is_locked": False},
        "s5": {"status": "SUBMITTED", "is_locked": False},
    }
    
    # Pass 4 staff
    for sid in ["s1", "s2", "s3", "s4"]:
        res = apply_staff_status_transition(staff_records[sid], action="PASS", actor_role="MAIN_INCHARGE", actor_name="Incharge A")
        assert res["status"] == "APPROVED"
        assert res["is_locked"] == True
        assert res["approved_by"] == "Incharge A"
    
    # Revert 1 staff
    res5 = apply_staff_status_transition(staff_records["s5"], action="REVERT", actor_role="MAIN_INCHARGE", actor_name="Incharge A", reason="Mismatched Odometer on Day 12")
    assert res5["status"] == "REVERTED"
    assert res5["is_locked"] == False
    assert res5["revert_reason"] == "Mismatched Odometer on Day 12"

def test_locked_record_blocks_subadmin_edits_until_unlocked():
    from backend.routers.travel_allowance import validate_edit_permission
    
    locked_record = {"status": "APPROVED", "is_locked": True}
    
    # Sub-admin rejected
    allowed, err = validate_edit_permission(locked_record, user_role="SUB_ADMIN")
    assert allowed is False
    assert "locked" in err.lower()
    
    # Incharge unlocks record
    from backend.routers.travel_allowance import apply_staff_status_transition
    unlocked = apply_staff_status_transition(locked_record, action="UNLOCK", actor_role="MAIN_INCHARGE", actor_name="Incharge A")
    assert unlocked["is_locked"] is False
    assert unlocked["status"] == "REVERTED"
    
    allowed2, _ = validate_edit_permission(unlocked, user_role="SUB_ADMIN")
    assert allowed2 is True

def test_fo_dispute_window_24_hours():
    from backend.routers.travel_allowance import is_dispute_window_open
    
    now = datetime.utcnow()
    # 5 hours after approval -> OPEN
    assert is_dispute_window_open(approved_at=(now - timedelta(hours=5)).isoformat(), now_dt=now) is True
    # 25 hours after approval -> CLOSED
    assert is_dispute_window_open(approved_at=(now - timedelta(hours=25)).isoformat(), now_dt=now) is False
```

Create `tests/test_travel_allowance_excel_export.py`:
```python
import pytest
import io
import openpyxl

def test_generate_ta_multi_sheet_workbook():
    from backend.routers.travel_allowance import build_ta_excel_workbook
    
    mock_district_data = {
        "district": "Jamui",
        "month": "2026-09",
        "rate_per_km": 4.0,
        "roster": [
            {
                "staff_name": "Test FO 1",
                "designation": "Field Officer",
                "total_km": 100.0,
                "gross_amount": 400.0,
                "deduction_amount": 0.0,
                "final_payable_amount": 400.0,
                "days": [{"day": i, "date": f"2026-09-{i:02d}", "morning_km": 1000 + i*10, "evening_km": 1010 + i*10, "total_km": 10.0, "visited_names": "Clinic A", "purpose": "Followup", "is_manual_override": False, "admin_remarks": ""} for i in range(1, 11)]
            }
        ]
    }
    
    wb_bytes = build_ta_excel_workbook(mock_district_data)
    assert len(wb_bytes) > 0
    
    wb = openpyxl.load_workbook(io.BytesIO(wb_bytes))
    assert "DASHBOARD" in wb.sheetnames
    assert "Test FO 1" in wb.sheetnames[1]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_ta_approval_and_dispute_workflow.py tests/test_travel_allowance_excel_export.py -v`
Expected: FAIL (missing transition functions and workbook builder)

- [ ] **Step 3: Implement workflow logic, locking, disputes, and Excel builder**

In `backend/routers/travel_allowance.py`:
- Implement `apply_staff_status_transition(record, action, actor_role, actor_name, reason)`.
- Implement `validate_edit_permission(record, user_role)`.
- Implement `is_dispute_window_open(approved_at, now_dt)`.
- Implement endpoints:
  - `/admin/ta/submit-roster`: marks district staff as `SUBMITTED`.
  - `/admin/ta/pass-staff`: granular pass/approve, locks record.
  - `/admin/ta/revert-staff`: granular revert with reason, unlocks record for Sub-Admin edit.
  - `/admin/ta/unlock-staff`: Incharge/Super Admin unlocks approved record.
  - `/fo/ta/monthly-summary`: returns approved summary or `UNDER_REVIEW` privacy guard.
  - `/fo/ta/dispute`: validates 24h window, sets `dispute_status = "PENDING"`, writes dual notification broadcast.
  - `/admin/ta/resolve-dispute`: Incharge accepts (unlocks) or rejects dispute.
  - `/admin/ta/export-excel`: generates openpyxl multi-sheet workbook with formulas and streaming response.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_ta_approval_and_dispute_workflow.py tests/test_travel_allowance_excel_export.py -v`
Expected: PASS (100%)

- [ ] **Step 5: Run quality checks and commit**

```bash
python -m py_compile backend/routers/travel_allowance.py
git add backend/routers/travel_allowance.py tests/test_ta_approval_and_dispute_workflow.py tests/test_travel_allowance_excel_export.py
git commit -m "feat(ta-workflow): implement granular per-staff approval, locking, 24h dispute dual alerts, and excel export"
```

---

### Task 3: Frontend Admin TA Modal & Custom Hook

**Files:**
- Create: `dfy-frontend/src/hooks/useAdminTA.js`
- Create: `dfy-frontend/src/components/Admin/modals/TravelAllowanceModal.jsx`
- Modify: `dfy-frontend/src/hooks/useAdminModals.js:20-60, 1500-1550`
- Modify: `dfy-frontend/src/components/Admin/AdminModals.jsx:30-45, 450-480`
- Modify: `dfy-frontend/src/components/Admin/modals/ReportsStudioModal.jsx:250-290`
- Test: `tests/test_ta_admin_studio_wiring.mjs`

**Interfaces:**
- Consumes: `useAdminTA` managing `rosterData`, `selectedOfficer`, `viewMode` (`ROSTER` vs `DRILLDOWN`), `ratePerKm`, `isLocked`
- Produces: `<TravelAllowanceModal ... />` rendered cleanly inside `AdminModals.jsx`

- [ ] **Step 1: Write the failing test**

Create `tests/test_ta_admin_studio_wiring.mjs`:
```javascript
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';

console.log('🧪 Testing TA Admin Studio Component & Hook Wiring...');

// 1. Files exist
assert.ok(existsSync('dfy-frontend/src/hooks/useAdminTA.js'), 'useAdminTA.js must exist');
assert.ok(existsSync('dfy-frontend/src/components/Admin/modals/TravelAllowanceModal.jsx'), 'TravelAllowanceModal.jsx must exist');

const hookSrc = readFileSync('dfy-frontend/src/hooks/useAdminTA.js', 'utf8');
const modalSrc = readFileSync('dfy-frontend/src/components/Admin/modals/TravelAllowanceModal.jsx', 'utf8');
const adminModalsSrc = readFileSync('dfy-frontend/src/components/Admin/AdminModals.jsx', 'utf8');

// 2. Hook exports required state and functions
assert.ok(hookSrc.includes('fetchRoster'), 'useAdminTA must export fetchRoster');
assert.ok(hookSrc.includes('handlePassStaff'), 'useAdminTA must export handlePassStaff');
assert.ok(hookSrc.includes('handleRevertStaff'), 'useAdminTA must export handleRevertStaff');
assert.ok(hookSrc.includes('handleUnlockStaff'), 'useAdminTA must export handleUnlockStaff');
assert.ok(hookSrc.includes('handleUpdateRate'), 'useAdminTA must export handleUpdateRate');

// 3. Modal contains hidden context menu for prefill
assert.ok(modalSrc.includes('Pre-fill District from Reports') || modalSrc.includes('prefill'), 'Modal must have pre-fill action');
assert.ok(modalSrc.includes('Rate:') || modalSrc.includes('rate_per_km'), 'Modal must display dynamic rate pill');

// 4. AdminModals imports and renders TravelAllowanceModal
assert.ok(adminModalsSrc.includes('TravelAllowanceModal'), 'AdminModals must import TravelAllowanceModal');

console.log('✅ TA Admin Studio Component & Hook Wiring Tests Passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_ta_admin_studio_wiring.mjs`
Expected: FAIL (files do not exist yet)

- [ ] **Step 3: Implement `useAdminTA.js` and `TravelAllowanceModal.jsx`**

1. Create `dfy-frontend/src/hooks/useAdminTA.js`:
   - State: `month`, `selectedDistrict`, `roster`, `selectedOfficer`, `viewMode` (`ROSTER` | `DRILLDOWN`), `ratePerKm`, `editingRate`, `showRateModal`, `showContextMenu`, `loadingRoster`, `isSubmitting`, `revertModalStaff`.
   - Handlers: `fetchRoster`, `handlePrefill`, `handleSaveLog`, `handleSubmitRoster`, `handlePassStaff`, `handleRevertStaff`, `handleUnlockStaff`, `handleUpdateRate`, `handleExportExcel`.
   - Role checks: `isSubAdmin = currentUser?.role === 'SUB_ADMIN'`, `isIncharge = currentUser?.role === 'MAIN_INCHARGE' || currentUser?.role === 'SUPER_ADMIN'`.

2. Create `dfy-frontend/src/components/Admin/modals/TravelAllowanceModal.jsx`:
   - Renders View 1 (District Payroll Roster):
     - Header: District dropdown, Month picker, `Rate: ₹{ratePerKm} / KM ✏️` pill, Context Menu (`•••`) with hidden *"⚡ Pre-fill District from Reports"*.
     - Summary KPI Banners: Total KM, Gross, Deductions, Net Payable.
     - Roster Table with rows: Officer, Days, Total KM, Gross, Deductions, Net, Status, Actions (`Inspect / Edit ➔`, `Pass`, `Revert`, `Unlock`).
     - Footer bar with Submit / Pass All / Revert All / Export Excel.
   - Renders View 2 (Day-by-Day Meter Readings & Route Verification):
     - `← Back to District Roster` breadcrumb.
     - 31-day table: Morning KM, Evening KM, calculated Day KM, Visited Names, Purpose, Broken Meter Override toggle.
     - Bottom accounting deck: Gross, Deduction input, Deduction reason, Net Payable, Save button (disabled if locked).
     - Rate modal dialog for changing KM rate.
     - Revert reason modal dialog.

3. Wire into `dfy-frontend/src/hooks/useAdminModals.js`:
   - Add `showTaModal`, `setShowTaModal`, `taHook = useAdminTA(...)`.
   - Export to `AdminDashboard.jsx`.

4. Wire into `dfy-frontend/src/components/Admin/AdminModals.jsx`:
   - Render `<TravelAllowanceModal isOpen={showTaModal} onClose={() => setShowTaModal(false)} {...taHook} />`.

5. Wire launch tile in `ReportsStudioModal.jsx`:
   - On clicking Travel Allowance tile, trigger `onOpenTravelAllowance()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_ta_admin_studio_wiring.mjs`
Expected: PASS (100%)

- [ ] **Step 5: Run quality checks and commit**

```bash
npm --prefix dfy-frontend run lint
npm --prefix dfy-frontend run build
git add dfy-frontend/src/hooks/useAdminTA.js dfy-frontend/src/components/Admin/modals/TravelAllowanceModal.jsx dfy-frontend/src/hooks/useAdminModals.js dfy-frontend/src/components/Admin/AdminModals.jsx dfy-frontend/src/components/Admin/modals/ReportsStudioModal.jsx tests/test_ta_admin_studio_wiring.mjs
git commit -m "feat(ta-ui): create dedicated TravelAllowanceModal, useAdminTA hook, and wire reports studio launch"
```

---

### Task 4: Field Officer Mobile App Integration

**Files:**
- Create: `dfy-frontend/src/components/Fo/TravelAllowanceCard.jsx`
- Modify: `dfy-frontend/src/App.jsx:5400-5450, 5800-5850`
- Test: `tests/test_fo_ta_card_ui.mjs`

**Interfaces:**
- Consumes: `/fo/ta/monthly-summary`, `/fo/ta/dispute`
- Produces: Self-contained mobile card rendering in FO view of `App.jsx`

- [ ] **Step 1: Write the failing test**

Create `tests/test_fo_ta_card_ui.mjs`:
```javascript
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';

console.log('🧪 Testing FO Travel Allowance Card Component & App Wiring...');

assert.ok(existsSync('dfy-frontend/src/components/Fo/TravelAllowanceCard.jsx'), 'TravelAllowanceCard.jsx must exist');

const cardSrc = readFileSync('dfy-frontend/src/components/Fo/TravelAllowanceCard.jsx', 'utf8');
const appSrc = readFileSync('dfy-frontend/src/App.jsx', 'utf8');

// 1. Privacy guard during review
assert.ok(cardSrc.includes('Verification in Progress') || cardSrc.includes('Under Review') || cardSrc.includes('UNDER_REVIEW'), 'Card must have under review privacy state');

// 2. Net Payable and rate display
assert.ok(cardSrc.includes('Net Payable') || cardSrc.includes('final_payable_amount'), 'Card must display net payable amount');
assert.ok(cardSrc.includes('rate_per_km'), 'Card must display dynamic rate');

// 3. 24h dispute trigger and modal
assert.ok(cardSrc.includes('Raise Dispute') || cardSrc.includes('dispute'), 'Card must have dispute trigger');

// 4. App.jsx renders TravelAllowanceCard
assert.ok(appSrc.includes('TravelAllowanceCard'), 'App.jsx must import and render TravelAllowanceCard');

console.log('✅ FO Travel Allowance Card Component & App Wiring Tests Passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_fo_ta_card_ui.mjs`
Expected: FAIL

- [ ] **Step 3: Implement `TravelAllowanceCard.jsx` and embed in `App.jsx`**

1. Create `dfy-frontend/src/components/Fo/TravelAllowanceCard.jsx`:
   - Fetches from `/fo/ta/monthly-summary?month=${month}&district=${working_place}&fo_name=${fo_name}`.
   - If status is `DRAFT` or `SUBMITTED`: Renders privacy banner (`⏳ Monthly Travel Allowance: Verification in Progress`).
   - If status is `APPROVED`:
     - Renders Emerald Card with Total KM, Rate (`₹{rate_per_km}/KM`), Gross, Deductions (with reason), and Net Payable.
     - Checks `dispute_window_active`: If true, renders `"⏱️ 24h Review Window Open"` and button `[🚨 Raise Dispute]`.
     - Dispute dialog with reason textarea; posts to `/fo/ta/dispute`.
   - If status is `DISPUTED`: Renders `"⚠️ Dispute Submitted to Admin: Under Review"`.
   - If finalized (>24h): Renders `"🔒 TA Finalized for Payroll Disbursement"`.

2. In `dfy-frontend/src/App.jsx`:
   - Import `TravelAllowanceCard`.
   - Render in the FO Dashboard duty section below monthly history.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_fo_ta_card_ui.mjs`
Expected: PASS (100%)

- [ ] **Step 5: Run quality checks and commit**

```bash
npm --prefix dfy-frontend run lint
npm --prefix dfy-frontend run build
git add dfy-frontend/src/components/Fo/TravelAllowanceCard.jsx dfy-frontend/src/App.jsx tests/test_fo_ta_card_ui.mjs
git commit -m "feat(fo-ta): add field officer travel allowance card with privacy guard, dynamic rate, and 24h dispute window"
```

---

### Task 5: Production Parity Regression Gate & Final Verification Battery

**Files:**
- Test: All pytest suites
- Test: All 18 Node test suites
- Test: Frontend linter & build

- [ ] **Step 1: Run Node regression battery**

```bash
node tests/test_ta_admin_studio_wiring.mjs
node tests/test_fo_ta_card_ui.mjs
node tests/test_cascade_alerts_data_unwrap.mjs
node tests/test_staff_optimistic_instant_sync.mjs
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
Expected: All 18 test suites pass 100%.

- [ ] **Step 2: Run Python compilation and full pytest battery**

```bash
python -m py_compile main.py backend/routers/travel_allowance.py
pytest tests/ -q
```
Expected: Exit code 0, 194+ tests passed, 0 failed.

- [ ] **Step 3: Run exact modal audit**

```bash
node scratch/exact_modal_audit.mjs
```
Expected: All 24 core modals + TA modal clean.

- [ ] **Step 4: Run Frontend linter and production build**

```bash
npm --prefix dfy-frontend run lint
npm --prefix dfy-frontend run build
```
Expected: 0 syntax errors, Vite build exit code 0.

- [ ] **Step 5: Git Diff Audit against `main`**

Verify only intended modular TA changes are present.
Strict Zero-Push Rule: Local commit only. Present comprehensive verification evidence to the user.
