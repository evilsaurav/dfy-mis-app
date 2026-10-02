# Instant Staff Sync, Cascade Radar Display & Nikshay Demographics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 0ms optimistic UI updates for staff mutations, restore Predictive Clinical Cascade & Dropout Radar data visualization, and enable ultra-flexible Nikshay column detection and demographics retention.

**Architecture:** 
- Frontend adopts optimistic UI state mutation pattern for staff addition, deletion, and status toggles, eliminating perceived network latency while background asynchronous synchronization handles Firestore persistence and cache eviction.
- Cascade Alerts modal hook unwraps nested payload dictionaries and dynamically appends Sub-Admin district query parameters.
- Backend Nikshay reconciler replaces brittle column substring matching with multi-pattern fuzzy header detection and retains demographics across the entire uploaded file.

**Tech Stack:** React 19, FastAPI, Google Cloud Firestore, Python 3.11/3.14, Tailwind CSS, Vite.

**Spec:** `docs/superpowers/specs/2026-10-02-instant-staff-sync-cascade-display-and-nikshay-demographics-design.md`

## Global Constraints

- Production environment: Zero runtime crashes, blank/white screens, data corruption, or unhandled promise rejections.
- Strict Zero-Push Rule: Commit locally only. Do NOT run git push!
- Temporal Dead Zone (TDZ) Rule: Strict lexical declaration order; base states -> derived collections -> handlers -> effects.
- Anti-Double-Tap & Concurrency Guards intact.
- Sub-Admin cross-district security isolation intact.
- Zero-Leakage Privacy Rule: ZERO mention of the Stealth 10 AM / 11 AM Cutoff in user-facing UI, alerts, or error toasts.
- All backend pytest tests and Node regression test suites must pass 100%.

---

### Task 1: Predictive Clinical Cascade Radar Display & Sub-Admin Scope Fix

**Files:**
- Modify: `dfy-frontend/src/hooks/useAdminModals.js:315-330`
- Test: `tests/test_cascade_alerts_data_unwrap.mjs`

**Interfaces:**
- Consumes: `/admin/cascade-alerts` backend API response (`{ "success": true, "data": { "summary": ..., "alerts": [...] } }`)
- Produces: `cascadeData` containing `{ summary: {...}, alerts: [...] }` directly consumable by `CascadeAlertsModal.jsx`

- [ ] **Step 1: Write the failing test**

Create `tests/test_cascade_alerts_data_unwrap.mjs`:
```javascript
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

console.log('🧪 Testing Cascade Alerts Data Unwrap & Sub-Admin Query Wiring...');

const modalsHookSrc = readFileSync('dfy-frontend/src/hooks/useAdminModals.js', 'utf8');

// 1. Check fetchCascadeAlerts unwraps json.data || json
assert.ok(
  modalsHookSrc.includes('setCascadeData(json?.data || json') ||
  modalsHookSrc.includes('setCascadeData(data?.data || data') ||
  modalsHookSrc.includes('(data && data.data) ? data.data : data'),
  'fetchCascadeAlerts must unwrap data.data so cascadeData.summary and cascadeData.alerts bind directly'
);

// 2. Check Sub-Admin query param wiring
assert.ok(
  modalsHookSrc.includes("currentUser?.role === 'SUB_ADMIN'") ||
  modalsHookSrc.includes("currentUser?.allowed_districts"),
  'fetchCascadeAlerts must handle Sub-Admin allowed_districts query param'
);

console.log('✅ Cascade Alerts Data Unwrap Tests Passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_cascade_alerts_data_unwrap.mjs`
Expected: FAIL (currently does `setCascadeData(data || ...)` without unwrapping).

- [ ] **Step 3: Implement unwrapping in `useAdminModals.js`**

In `dfy-frontend/src/hooks/useAdminModals.js`:
Update `fetchCascadeAlerts`:
```javascript
  // 2. Cascade Alerts Fetcher
  const fetchCascadeAlerts = useCallback(async () => {
    setLoadingCascade(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      let q = `?month=${month}`;
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        q += `&districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}`;
      }
      const res = await authFetch(`${API_BASE_URL}/admin/cascade-alerts${q}`);
      if (res.ok) {
        const data = await res.json();
        const unwrap = (data && data.data) ? data.data : (data || { summary: {}, alerts: [] });
        setCascadeData(unwrap);
      }
    } catch (e) {
      console.error("Cascade alerts fetch error", e);
    } finally {
      setLoadingCascade(false);
    }
  }, [month, authFetch, currentUser]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_cascade_alerts_data_unwrap.mjs`
Expected: PASS

- [ ] **Step 5: Run quality checks and commit**

Run:
```bash
npm --prefix dfy-frontend run lint
npm --prefix dfy-frontend run build
git add dfy-frontend/src/hooks/useAdminModals.js tests/test_cascade_alerts_data_unwrap.mjs
git commit -m "fix(cascade): unwrap response data object and pass subadmin districts to cascade alerts"
```

---

### Task 2: Instant Staff Management with Optimistic UI & Zero-Delay Mutation

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx:684-690`
- Modify: `dfy-frontend/src/hooks/useAdminModals.js:18-25, 1310-1415`
- Test: `tests/test_staff_optimistic_instant_sync.mjs`

**Interfaces:**
- Consumes: `setStaffList` and `setStaffDirectory` from `AdminDashboard.jsx`
- Produces: Optimistic instant UI updates for `handleExecuteAddStaff`, `handleExecuteDeleteStaff`, and `handleExecuteToggleStaffStatus`

- [ ] **Step 1: Write the failing test**

Create `tests/test_staff_optimistic_instant_sync.mjs`:
```javascript
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

console.log('🧪 Testing Staff Optimistic Instant Sync Wiring...');

const dashSrc = readFileSync('dfy-frontend/src/AdminDashboard.jsx', 'utf8');
const modalsSrc = readFileSync('dfy-frontend/src/hooks/useAdminModals.js', 'utf8');

// 1. AdminDashboard passes setStaffList and setStaffDirectory
assert.ok(
  dashSrc.includes('setStaffList,') || dashSrc.includes('setStaffList: setStaffList,'),
  'AdminDashboard must pass setStaffList to useAdminModals'
);
assert.ok(
  dashSrc.includes('setStaffDirectory,') || dashSrc.includes('setStaffDirectory: setStaffDirectory,'),
  'AdminDashboard must pass setStaffDirectory to useAdminModals'
);

// 2. useAdminModals accepts setStaffList and setStaffDirectory
assert.ok(
  modalsSrc.includes('setStaffList,') && modalsSrc.includes('setStaffDirectory,'),
  'useAdminModals parameter list must include setStaffList and setStaffDirectory'
);

// 3. handleExecuteAddStaff performs optimistic state insertion
assert.ok(
  modalsSrc.includes('setStaffList(prev => [...prev,') || modalsSrc.includes('setStaffList(prev => ['),
  'handleExecuteAddStaff must optimistically append new officer to staffList'
);

// 4. handleExecuteDeleteStaff performs optimistic deletion
assert.ok(
  modalsSrc.includes('prev.filter(s => !(s.name === name'),
  'handleExecuteDeleteStaff must optimistically filter out deleted officer'
);

console.log('✅ Staff Optimistic Instant Sync Wiring Tests Passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_staff_optimistic_instant_sync.mjs`
Expected: FAIL (missing `setStaffList` and `setStaffDirectory` in props and optimistic add).

- [ ] **Step 3: Implement optimistic updates in `AdminDashboard.jsx` & `useAdminModals.js`**

1. In `dfy-frontend/src/AdminDashboard.jsx`:
Pass `setStaffList` and `setStaffDirectory` into `useAdminModals`:
```javascript
  const modals = useAdminModals({
    month, currentUser, districts, targetModalDistricts, availableKpiDistricts,
    staffDirectory, setStaffDirectory, fetchDirectory, targetsData, rawRecords, setRawRecords, 
    staffList, setStaffList, fetchStaffList,
    selectedDistrict,
    ...
```

2. In `dfy-frontend/src/hooks/useAdminModals.js`:
Add `setStaffList` and `setStaffDirectory` to props:
```javascript
export function useAdminModals({
  ...
  staffDirectory,
  setStaffDirectory,
  fetchDirectory,
  staffList,
  setStaffList,
  fetchStaffList,
  ...
})
```

Update `handleExecuteAddStaff`:
```javascript
  const handleExecuteAddStaff = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!addStaffModal) return;
    const { district, name, pin, designation, target } = addStaffModal;
    if (!name || !name.trim()) {
      setAddStaffModal(prev => ({ ...prev, error: "Officer Name is required." }));
      return;
    }
    if (!pin || pin.trim().length !== 4 || !/^\d+$/.test(pin.trim())) {
      setAddStaffModal(prev => ({ ...prev, error: "PIN must be exactly 4 digits." }));
      return;
    }

    const cleanDist = district || 'Jamui';
    const cleanName = name.trim();
    const cleanPin = pin.trim();
    const cleanDesig = designation || 'Field Officer';
    const numTarget = Number(target) || 50;

    // ⚡ Optimistic UI Update (0ms perceived latency)
    const newOfficer = {
      district: cleanDist,
      name: cleanName,
      pin: cleanPin,
      designation: cleanDesig,
      target: numTarget,
      status: 'active',
      is_active: true
    };

    if (typeof setStaffList === 'function') {
      setStaffList(prev => [...(prev || []).filter(s => !(s.name === cleanName && s.district === cleanDist)), newOfficer]);
    }
    if (typeof setStaffDirectory === 'function') {
      setStaffDirectory(prev => {
        const distOfficers = prev?.[cleanDist] ? [...prev[cleanDist]] : [];
        if (!distOfficers.includes(cleanName)) distOfficers.push(cleanName);
        return { ...(prev || {}), [cleanDist]: distOfficers.sort() };
      });
    }

    setAddStaffModal(null);
    if (showToast) showToast("✓ New staff officer registered!", "success");

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/staff/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          district: cleanDist,
          name: cleanName,
          pin: cleanPin,
          designation: cleanDesig,
          target: numTarget
        })
      });
      if (res.ok) {
        Promise.all([
          typeof fetchStaffList === 'function' ? fetchStaffList() : Promise.resolve(),
          typeof fetchDirectory === 'function' ? fetchDirectory() : Promise.resolve(),
          typeof loadTargets === 'function' ? loadTargets(selectedDistrict || 'All', month) : Promise.resolve(),
          typeof fetchAttendance === 'function' ? fetchAttendance(true) : Promise.resolve(),
          typeof fetchTopPerformers === 'function' ? fetchTopPerformers(topPerformersPeriod) : Promise.resolve()
        ]).catch(e => console.warn("Background staff refresh error:", e));
      } else {
        const data = await res.json();
        if (showToast) showToast(data.detail || "Failed to add officer on server.", "error");
        if (typeof fetchStaffList === 'function') fetchStaffList();
        if (typeof fetchDirectory === 'function') fetchDirectory();
      }
    } catch (err) {
      if (showToast) showToast("Network error registering staff.", "error");
      if (typeof fetchStaffList === 'function') fetchStaffList();
      if (typeof fetchDirectory === 'function') fetchDirectory();
    }
  };
```

Update `handleExecuteDeleteStaff`:
```javascript
  const handleExecuteDeleteStaff = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!deleteStaffModal) return;
    const { name, district } = deleteStaffModal;

    // ⚡ Optimistic UI Update (0ms latency)
    if (typeof setStaffList === 'function') {
      setStaffList(prev => (prev || []).filter(s => !(s.name === name && s.district === district)));
    }
    if (typeof setStaffDirectory === 'function') {
      setStaffDirectory(prev => {
        const distOfficers = (prev?.[district] || []).filter(n => n !== name);
        return { ...(prev || {}), [district]: distOfficers };
      });
    }

    setDeleteStaffModal(null);
    if (showToast) showToast(`✓ Officer ${name} removed from registry.`, "success");

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/staff/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ district, name })
      });
      if (res.ok) {
        Promise.all([
          typeof fetchStaffList === 'function' ? fetchStaffList() : Promise.resolve(),
          typeof fetchDirectory === 'function' ? fetchDirectory() : Promise.resolve(),
          typeof loadTargets === 'function' ? loadTargets(selectedDistrict || 'All', month) : Promise.resolve(),
          typeof fetchAttendance === 'function' ? fetchAttendance(true) : Promise.resolve()
        ]).catch(e => console.warn("Background staff delete refresh error:", e));
      } else {
        const data = await res.json();
        if (showToast) showToast(data.detail || "Failed to delete on server.", "error");
        if (typeof fetchStaffList === 'function') fetchStaffList();
        if (typeof fetchDirectory === 'function') fetchDirectory();
      }
    } catch (err) {
      if (showToast) showToast("Network error deleting staff.", "error");
      if (typeof fetchStaffList === 'function') fetchStaffList();
      if (typeof fetchDirectory === 'function') fetchDirectory();
    }
  };
```

Update `handleExecuteToggleStaffStatus`:
```javascript
  const handleExecuteToggleStaffStatus = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!staffToggleModal || !staffToggleModal.officer) return;
    const { officer, targetStatus, effectiveDate } = staffToggleModal;
    const isAct = targetStatus === 'active';

    // ⚡ Optimistic UI Update (0ms latency)
    if (typeof setStaffList === 'function') {
      setStaffList(prev => (prev || []).map(s => {
        if (s.name === officer.name && s.district === officer.district) {
          return { ...s, status: targetStatus, is_active: isAct };
        }
        return s;
      }));
    }

    setStaffToggleModal(null);
    if (showToast) showToast(`✓ Officer status set to ${targetStatus}!`, "success");

    setIsTogglingStaff(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const effDate = targetStatus === 'inactive' ? (effectiveDate || new Date().toISOString().slice(0, 10)) : undefined;
      const res = await authFetch(`${API_BASE_URL}/admin/staff/toggle-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          district: officer.district,
          fo_name: officer.name,
          status: targetStatus,
          ...(effDate ? { effective_date: effDate } : {})
        })
      });
      if (res.ok) {
        Promise.all([
          typeof fetchStaffList === 'function' ? fetchStaffList() : Promise.resolve(),
          typeof fetchDirectory === 'function' ? fetchDirectory() : Promise.resolve(),
          typeof loadTargets === 'function' ? loadTargets(selectedDistrict || 'All', month) : Promise.resolve(),
          typeof fetchAttendance === 'function' ? fetchAttendance(true) : Promise.resolve()
        ]).catch(e => console.warn("Background toggle refresh error:", e));
      } else {
        if (typeof fetchStaffList === 'function') fetchStaffList();
      }
    } catch (err) {
      if (showToast) showToast("Error toggling staff status", "error");
      if (typeof fetchStaffList === 'function') fetchStaffList();
    } finally {
      setIsTogglingStaff(false);
    }
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_staff_optimistic_instant_sync.mjs`
Expected: PASS 100%

- [ ] **Step 5: Run quality checks and commit**

Run:
```bash
npm --prefix dfy-frontend run lint
npm --prefix dfy-frontend run build
git add dfy-frontend/src/AdminDashboard.jsx dfy-frontend/src/hooks/useAdminModals.js tests/test_staff_optimistic_instant_sync.mjs
git commit -m "feat(staff-sync): implement 0ms optimistic UI mutations for staff add, delete, and toggle"
```

---

### Task 3: Nikshay Reconciler Flexible Column Header Matching & Demographics Retention

**Files:**
- Modify: `backend/routers/nikshay.py:223-285, 570-620`
- Test: `tests/test_nikshay_demographics_flexible_match.py`

**Interfaces:**
- Consumes: Raw uploaded Excel/CSV files with various column naming styles
- Produces: Correct extraction of `name_col` and `phone_col`, populating `patient_name` and `phone` in `nikshay_patients` and `nikshay_verified_patients`

- [ ] **Step 1: Write the failing test**

Create `tests/test_nikshay_demographics_flexible_match.py`:
```python
import io
import pandas as pd
import pytest
from backend.routers.nikshay import is_name_header, is_phone_header

def test_flexible_name_header_detection():
    # Various real-world Nikshay column naming styles
    assert is_name_header("Patient Name") == True
    assert is_name_header("Name of Patient") == True
    assert is_name_header("Name of the Patient") == True
    assert is_name_header("Beneficiary Name") == True
    assert is_name_header("Case Name") == True
    assert is_name_header("Client Name") == True
    assert is_name_header("patient_name") == True
    assert is_name_header("Name") == True
    
    # Non-name headers
    assert is_name_header("District") == False
    assert is_name_header("Notification Date") == False

def test_flexible_phone_header_detection():
    assert is_phone_header("Primary Phone") == True
    assert is_phone_header("Primary Phone Number") == True
    assert is_phone_header("Mobile No.") == True
    assert is_phone_header("Mobile Number") == True
    assert is_phone_header("Contact No") == True
    assert is_phone_header("Contact Number") == True
    assert is_phone_header("phone") == True
    assert is_phone_header("Cell") == True
    
    # Non-phone headers
    assert is_phone_header("Address") == False
    assert is_phone_header("Patient Name") == False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_nikshay_demographics_flexible_match.py -v`
Expected: FAIL with "cannot import is_name_header"

- [ ] **Step 3: Implement flexible header matchers and demographics extraction**

In `backend/routers/nikshay.py`:
Add helper functions:
```python
def is_name_header(c: str) -> bool:
    h = str(c).strip().lower().replace(" ", "_").replace(".", "").replace("'", "")
    if any(k in h for k in ["patient_name", "patientname", "beneficiary_name", "case_name", "client_name"]):
        return True
    if "name" in h and any(k in h for k in ["patient", "beneficiary", "case", "client", "person"]):
        return True
    if h in ["name", "patient", "patient_name", "name_of_patient", "name_of_the_patient", "beneficiary"]:
        return True
    return False

def is_phone_header(c: str) -> bool:
    h = str(c).strip().lower().replace(" ", "_").replace(".", "")
    return any(k in h for k in ["primaryphone", "phone", "mobile", "contact", "cell"])
```

In `reconcile_nikshay`:
Use `is_name_header` and `is_phone_header` to detect `name_col` and `phone_col`:
```python
        phone_col = next((c for c in df.columns if is_phone_header(c)), None)
        name_col = next((c for c in df.columns if is_name_header(c)), None)
```

Also, build an all-records demographic dictionary `nikshay_demographics_lookup = {}` from all rows in the uploaded Excel (regardless of date filter) so that even if a patient in DFY MIS was diagnosed in a different month, their name and phone are resolved from the uploaded file:
```python
        # Build demographic lookup for all patients in the sheet
        nikshay_demographics_lookup = {}
        for _, row in df.iterrows():
            val = row.get(id_col)
            if val is None or pd.isna(val):
                continue
            s = str(val).strip().split(".")[0]
            if s and s.isalnum() and len(s) >= 5:
                p_phone = re.sub(r'\D', '', str(row.get(phone_col, "")).split(".")[0])[-10:] if phone_col and not pd.isna(row.get(phone_col)) else ""
                p_name = str(row.get(name_col, "")).strip() if name_col and not pd.isna(row.get(name_col)) else ""
                if p_name or p_phone:
                    nikshay_demographics_lookup[s] = {"name": p_name, "phone": p_phone}
```

In `patients_to_sync` resolution for DFY-only records:
```python
        for pid, dfy_info in dfy_details.items():
            if pid not in patients_to_sync:
                has_any_service = (dfy_info["has_notification"] or dfy_info["has_hiv_dm"] or 
                                   dfy_info["has_dbt"] or dfy_info["has_udst"] or dfy_info["has_contact"])
                if has_any_service:
                    demo = nikshay_demographics_lookup.get(pid, {})
                    patients_to_sync[pid] = {
                        "name": demo.get("name", ""),
                        "patient_name": demo.get("name", ""),
                        "phone": demo.get("phone", ""),
                        "district": dfy_info.get("district", ""),
                        ...
                    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_nikshay_demographics_flexible_match.py -v`
Expected: PASS (100%)

- [ ] **Step 5: Run quality checks and commit**

Run:
```bash
python -m py_compile main.py backend/routers/nikshay.py
git add backend/routers/nikshay.py tests/test_nikshay_demographics_flexible_match.py
git commit -m "fix(nikshay): implement flexible column detection and retain demographics across full upload"
```

---

### Task 4: Production Parity Regression Gate & Final Verification

**Files:**
- Test: All pytest suites
- Test: All 16 Node test suites
- Test: Frontend lint & build

- [ ] **Step 1: Run Node regression battery**

```bash
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
Expected: All 16 test suites pass 100%.

- [ ] **Step 2: Run Python compilation and pytest battery**

```bash
python -m py_compile main.py
pytest tests/ -q
```
Expected: Exit code 0, 189+ tests passed, 0 failed.

- [ ] **Step 3: Run Frontend linter and production build**

```bash
npm --prefix dfy-frontend run lint
npm --prefix dfy-frontend run build
```
Expected: 0 syntax errors, Vite build exit code 0.

- [ ] **Step 4: Audit git diff against `origin/main`**

Verify zero unintended deletions, zero leaks of cutoffs, and strict sub-admin isolation.
Do NOT run `git push`. Present comprehensive evidence to the user.
