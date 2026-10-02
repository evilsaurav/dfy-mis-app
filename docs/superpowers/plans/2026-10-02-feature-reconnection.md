# DFY MIS Admin Dashboard — Feature Reconnection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 7 broken/disconnected features in the modular admin dashboard so they match production monolith behavior at commit `9852808`. No new features. No monolith merge.

**Architecture:** Modular. Fix prop-name mismatches, verify handler wiring, add missing `useEffect` hooks, harden modal components. All fixes are bounded to `AdminDashboard.jsx`, `useAdminModals.js`, `AdminModals.jsx`, and individual modal components.

**Tech Stack:** React 18, Vite, FastAPI (Python), Firestore

**Spec:** `docs/superpowers/specs/2026-10-02-feature-reconnection-design.md`

## Global Constraints

- Production is LIVE — zero crashes, blank/white screens, data corruption tolerated
- No monolith merge — fix connections only, preserve modular architecture
- No new features — restore original behavior only
- STRICT ZERO-PUSH RULE: Commit locally. Do NOT run `git push`
- TDZ order in all React files: useState → useMemo → useCallback → useEffect (never reverse)
- Anti-double-tap: all mutation buttons disabled during in-flight operations
- `python -m py_compile main.py` must exit code 0
- `npm --prefix dfy-frontend run lint` must have 0 syntax errors
- `npm --prefix dfy-frontend run build` must succeed (exit code 0)
- Working directory: `d:\ignou\Mis field report`
- Active branch: `main`

---

## File Structure

**Files modified (bounded):**

| File | Responsibility |
|------|---------------|
| `dfy-frontend/src/AdminDashboard.jsx` | Fix 3 prop-name mismatches for AdminFeed (lines 820, 823, 824) |
| `dfy-frontend/src/hooks/useAdminModals.js` | Add missing Nikshay sync-status useEffect; ensure handleFetchJourney in return |
| `dfy-frontend/src/components/Admin/AdminModals.jsx` | Audit all 7 feature modal prop wiring |
| `dfy-frontend/src/components/Admin/modals/FoInspectorModal.jsx` | Handle `district === 'All'` gracefully |
| `dfy-frontend/src/components/Admin/modals/JourneyModal.jsx` | Verify handleFetchJourney prop consumed |
| `dfy-frontend/src/components/Admin/modals/NikshayModal.jsx` | Verify nikshaySyncStatus displayed |
| `backend/routers/nikshay.py` | Verify /sync-status and /patient-journey endpoints |
| `tests/` | New test files per phase |

---

### Task 1: Admin Feed Modal Prop-Name Fix + Build Verification

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx:820-824`
- Test: `tests/test_admin_feed_prop_wiring.mjs`

**Interfaces:**
- Consumes: `useAdminModals` return keys: `setFeedDate`, `setFeedCategoryInputs`, `setFeedRemarks`
- Produces: `AdminHeader` receives correct prop setters so feed modal is pre-filled on open

**Context:** Lines 820–824 of `AdminDashboard.jsx` currently pass:
```jsx
setFeedDate={modals.setDate}           // WRONG — should be modals.setFeedDate
setFeedError={modals.setFeedError}
setFeedSuccess={modals.setFeedSuccess}
setFeedCategoryInputs={modals.setCategoryInputs}  // WRONG — should be modals.setFeedCategoryInputs
setFeedRemarks={modals.setRemarks}     // WRONG — should be modals.setFeedRemarks
```

The `useAdminModals.js` return object exports these keys (confirmed at lines 2046–2049):
- `setFeedDate` (line 2046)
- `setFeedCategoryInputs` (line 2047)
- `setFeedRemarks` (line 2049)

- [ ] **Step 1: Write the failing test**

Create `tests/test_admin_feed_prop_wiring.mjs`:
```javascript
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardPath = path.join(__dirname, '../dfy-frontend/src/AdminDashboard.jsx');
const src = readFileSync(dashboardPath, 'utf8');

let failures = 0;

// Must NOT contain wrong aliases
if (src.includes('modals.setDate')) {
  console.error('FAIL: AdminDashboard still passes modals.setDate (should be modals.setFeedDate)');
  failures++;
}
if (src.includes('modals.setCategoryInputs')) {
  console.error('FAIL: AdminDashboard still passes modals.setCategoryInputs (should be modals.setFeedCategoryInputs)');
  failures++;
}
if (src.includes('modals.setRemarks')) {
  console.error('FAIL: AdminDashboard still passes modals.setRemarks (should be modals.setFeedRemarks)');
  failures++;
}

// Must contain correct names
if (!src.includes('modals.setFeedDate')) {
  console.error('FAIL: AdminDashboard missing modals.setFeedDate');
  failures++;
}
if (!src.includes('modals.setFeedCategoryInputs')) {
  console.error('FAIL: AdminDashboard missing modals.setFeedCategoryInputs');
  failures++;
}
if (!src.includes('modals.setFeedRemarks')) {
  console.error('FAIL: AdminDashboard missing modals.setFeedRemarks');
  failures++;
}

if (failures === 0) {
  console.log('PASS: All AdminFeed prop names correctly wired in AdminDashboard.jsx');
  process.exit(0);
} else {
  console.error(`FAIL: ${failures} prop-name mismatches found`);
  process.exit(1);
}
```

- [ ] **Step 2: Run test to verify it fails**

```
node tests/test_admin_feed_prop_wiring.mjs
```
Expected: FAIL with 3 mismatches

- [ ] **Step 3: Fix the 3 wrong prop names in `AdminDashboard.jsx`**

Find lines 820, 823, 824 in `dfy-frontend/src/AdminDashboard.jsx`. The current block looks like:
```jsx
          setFeedDate={modals.setDate}
          setFeedError={modals.setFeedError}
          setFeedSuccess={modals.setFeedSuccess}
          setFeedCategoryInputs={modals.setCategoryInputs}
          setFeedRemarks={modals.setRemarks}
```

Replace with:
```jsx
          setFeedDate={modals.setFeedDate}
          setFeedError={modals.setFeedError}
          setFeedSuccess={modals.setFeedSuccess}
          setFeedCategoryInputs={modals.setFeedCategoryInputs}
          setFeedRemarks={modals.setFeedRemarks}
```

- [ ] **Step 4: Run test to verify it passes**

```
node tests/test_admin_feed_prop_wiring.mjs
```
Expected: PASS

- [ ] **Step 5: Lint check**

```
npm --prefix dfy-frontend run lint 2>&1 | Select-String "error" | Select-Object -First 10
```
Expected: 0 syntax errors

- [ ] **Step 6: Build check**

```
npm --prefix dfy-frontend run build
```
Expected: exit code 0

- [ ] **Step 7: Commit**

```
git add dfy-frontend/src/AdminDashboard.jsx tests/test_admin_feed_prop_wiring.mjs
git commit -m "fix(admin-feed): correct 3 prop-name mismatches for setFeedDate, setFeedCategoryInputs, setFeedRemarks"
```

- [ ] **Step 8: Write report to `.superpowers/sdd/2026-10-02-feature-reconnection/task-1-report.md`**

---

### Task 2: Nikshay Reconciler — Sync Status Auto-Fetch on Modal Open

**Files:**
- Modify: `dfy-frontend/src/hooks/useAdminModals.js`
- Verify: `dfy-frontend/src/components/Admin/modals/NikshayModal.jsx`
- Verify: `backend/routers/nikshay.py`
- Test: `tests/test_nikshay_modal_sync.mjs`

**Interfaces:**
- Consumes: `showNikshayModal` (state), `fetchNikshaySyncStatus` (handler), `authFetch` (from params)
- Produces: On modal open, `nikshaySyncStatus` is populated with last sync data

**Context:** In the production monolith (commit `9852808`), there was a `useEffect` watching `showNikshayModal` that called `fetchNikshaySyncStatus()` when the modal opened. The current `useAdminModals.js` has `nikshaySyncStatus` state (line 201) and `setNikshaySyncStatus` but the `fetchNikshaySyncStatus` function and the triggering `useEffect` must be verified.

- [ ] **Step 1: Read `useAdminModals.js` to find `fetchNikshaySyncStatus` — search for it**

Run: `Select-String -Path "dfy-frontend/src/hooks/useAdminModals.js" -Pattern "fetchNikshaySyncStatus"`

Expected: It should exist as a function. If it does NOT exist, create it.

- [ ] **Step 2: Check the useEffect for showNikshayModal**

Run: `Select-String -Path "dfy-frontend/src/hooks/useAdminModals.js" -Pattern "showNikshayModal"`

Look for a `useEffect(() => { if (showNikshayModal) { fetchNikshaySyncStatus(); } }, [showNikshayModal, fetchNikshaySyncStatus]);` pattern.

- [ ] **Step 3: Write the failing test**

Create `tests/test_nikshay_modal_sync.mjs`:
```javascript
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, '../dfy-frontend/src/hooks/useAdminModals.js'), 'utf8');
const nikshayModalSrc = readFileSync(path.join(__dirname, '../dfy-frontend/src/components/Admin/modals/NikshayModal.jsx'), 'utf8');

let failures = 0;

// useAdminModals must have fetchNikshaySyncStatus
if (!src.includes('fetchNikshaySyncStatus')) {
  console.error('FAIL: useAdminModals.js missing fetchNikshaySyncStatus function');
  failures++;
}

// useAdminModals must have a useEffect watching showNikshayModal that calls fetchNikshaySyncStatus
const hasNikshayEffect = src.includes('showNikshayModal') && src.includes('fetchNikshaySyncStatus') &&
  (src.includes('[showNikshayModal, fetchNikshaySyncStatus]') || src.includes('[showNikshayModal]'));
if (!hasNikshayEffect) {
  console.error('FAIL: useAdminModals.js missing useEffect([showNikshayModal]) that calls fetchNikshaySyncStatus');
  failures++;
}

// NikshayModal must consume nikshaySyncStatus prop
if (!nikshayModalSrc.includes('nikshaySyncStatus') && !nikshayModalSrc.includes('syncStatus')) {
  console.error('FAIL: NikshayModal.jsx does not consume nikshaySyncStatus prop');
  failures++;
}

// useAdminModals must return fetchNikshaySyncStatus
if (!src.includes('fetchNikshaySyncStatus,') && !src.includes('fetchNikshaySyncStatus\n')) {
  console.error('FAIL: useAdminModals.js does not return fetchNikshaySyncStatus');
  failures++;
}

if (failures === 0) {
  console.log('PASS: Nikshay sync-status wiring is correct');
  process.exit(0);
} else {
  console.error(`FAIL: ${failures} Nikshay sync issues`);
  process.exit(1);
}
```

- [ ] **Step 4: Run to verify RED**

```
node tests/test_nikshay_modal_sync.mjs
```

- [ ] **Step 5: Implement fixes in `useAdminModals.js`**

If `fetchNikshaySyncStatus` is missing, add it after `fetchCumulativeLedger`:
```javascript
const fetchNikshaySyncStatus = useCallback(async () => {
  try {
    const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
    const res = await authFetch(`${API_BASE_URL}/admin/nikshay/sync-status?month=${nikshayMonth || month}`);
    if (res.ok) {
      const data = await res.json();
      setNikshaySyncStatus(data);
    }
  } catch (e) {
    console.error("Nikshay sync status error", e);
  }
}, [nikshayMonth, month, authFetch]);
```

If the `useEffect` watching `showNikshayModal` is missing, add it (AFTER all `useCallback` definitions, before the return):
```javascript
useEffect(() => {
  if (showNikshayModal) {
    fetchNikshaySyncStatus();
  }
}, [showNikshayModal, fetchNikshaySyncStatus]);
```

Add `fetchNikshaySyncStatus` to the return object in the `// 13. Nikshay Reconciler` section:
```javascript
fetchNikshaySyncStatus,
```

Also verify `backend/routers/nikshay.py` has a GET `/admin/nikshay/sync-status` endpoint. Run:
```
Select-String -Path "backend/routers/nikshay.py" -Pattern "sync.status|sync_status"
```
If missing, add a simple stub:
```python
@router.get("/admin/nikshay/sync-status")
async def get_nikshay_sync_status(month: str = "", current_user: dict = Depends(verify_admin_token)):
    # Returns last reconciliation metadata from cache/storage
    return {"last_synced": None, "match_count": 0, "month": month}
```

- [ ] **Step 6: Run test to verify GREEN**

```
node tests/test_nikshay_modal_sync.mjs
```

- [ ] **Step 7: Lint + build**

```
npm --prefix dfy-frontend run lint 2>&1 | Select-String "error" | Select-Object -First 5
npm --prefix dfy-frontend run build
```

- [ ] **Step 8: Python compile if backend changed**

```
python -m py_compile main.py
```

- [ ] **Step 9: Commit**

```
git add dfy-frontend/src/hooks/useAdminModals.js tests/test_nikshay_modal_sync.mjs
git commit -m "fix(nikshay): add fetchNikshaySyncStatus handler and useEffect auto-fetch on modal open"
```

---

### Task 3: Patient Journey Tracker — Handler Wiring Verification + FO Inspector District='All' Fix

**Files:**
- Verify/Modify: `dfy-frontend/src/hooks/useAdminModals.js` (handleFetchJourney in return)
- Verify/Modify: `dfy-frontend/src/components/Admin/AdminModals.jsx` (JourneyModal props)
- Modify: `dfy-frontend/src/components/Admin/modals/JourneyModal.jsx` (prop consumption)
- Modify: `dfy-frontend/src/components/Admin/modals/FoInspectorModal.jsx` (All district filter)
- Test: `tests/test_journey_modal_handler.mjs`, `tests/test_fo_inspector_all_district.mjs`

**Interfaces:**
- Consumes: `handleFetchJourney(patientId)`, `journeyPatientId`, `journeyResult`, `journeyLoading`, `journeyError`, `showJourneyModal`
- Produces: JourneyModal displays timeline when patient ID searched; FO Inspector works on 'All' district

- [ ] **Step 1: Verify handleFetchJourney in useAdminModals return**

Run: `Select-String -Path "dfy-frontend/src/hooks/useAdminModals.js" -Pattern "handleFetchJourney"`

In the return object (around lines 1960–2165), find the `// 5. Patient Journey` section. It must include:
```javascript
showJourneyModal, setShowJourneyModal,
journeyPatientId, setJourneyPatientId,
journeyLoading, journeyResult, journeyError,
handleFetchJourney,
```

- [ ] **Step 2: Verify AdminModals.jsx passes correct props to JourneyModal**

Read `dfy-frontend/src/components/Admin/AdminModals.jsx` — find the `JourneyModal` render block. It must pass:
```jsx
<JourneyModal
  isOpen={props.showJourneyModal}
  onClose={() => props.setShowJourneyModal(false)}
  patientId={props.journeyPatientId}
  setPatientId={props.setJourneyPatientId}
  loading={props.journeyLoading}
  result={props.journeyResult}
  error={props.journeyError}
  handleFetchJourney={props.handleFetchJourney}
/>
```

- [ ] **Step 3: Verify FoInspectorModal handles district === 'All'**

Read `dfy-frontend/src/components/Admin/modals/FoInspectorModal.jsx`. The filter for records must handle `inspectingFO.district === 'All'`:

Current logic (from previous session fix) should already have name-based matching. But must also verify the district condition:
```javascript
const foRecords = (rawRecords || []).filter(r => {
  const nameMatch = isOfficerNameMatch(r.fo_name, inspectingFO.fo_name);
  const districtMatch = !inspectingFO.district || 
    inspectingFO.district === 'All' || 
    canonicalizeDistrict(r.working_place) === canonicalizeDistrict(inspectingFO.district);
  return nameMatch && districtMatch;
});
```

- [ ] **Step 4: Write failing tests**

Create `tests/test_journey_modal_handler.mjs`:
```javascript
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modalsSrc = readFileSync(path.join(__dirname, '../dfy-frontend/src/hooks/useAdminModals.js'), 'utf8');
const adminModalsSrc = readFileSync(path.join(__dirname, '../dfy-frontend/src/components/Admin/AdminModals.jsx'), 'utf8');

let failures = 0;

// handleFetchJourney must be in return block
const returnBlock = modalsSrc.slice(modalsSrc.lastIndexOf('return {'));
if (!returnBlock.includes('handleFetchJourney')) {
  console.error('FAIL: useAdminModals return missing handleFetchJourney');
  failures++;
}
if (!returnBlock.includes('journeyPatientId') || !returnBlock.includes('setJourneyPatientId')) {
  console.error('FAIL: useAdminModals return missing journeyPatientId/setJourneyPatientId');
  failures++;
}
if (!returnBlock.includes('journeyResult') || !returnBlock.includes('journeyLoading')) {
  console.error('FAIL: useAdminModals return missing journeyResult or journeyLoading');
  failures++;
}

// AdminModals must pass handleFetchJourney to JourneyModal
if (!adminModalsSrc.includes('handleFetchJourney={props.handleFetchJourney}') &&
    !adminModalsSrc.includes('handleFetchJourney=')) {
  console.error('FAIL: AdminModals.jsx does not pass handleFetchJourney to JourneyModal');
  failures++;
}

if (failures === 0) {
  console.log('PASS: Journey modal handler wiring verified');
  process.exit(0);
} else {
  console.error(`FAIL: ${failures} journey modal wiring issues`);
  process.exit(1);
}
```

Create `tests/test_fo_inspector_all_district.mjs`:
```javascript
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, '../dfy-frontend/src/components/Admin/modals/FoInspectorModal.jsx'), 'utf8');

let failures = 0;

// Must handle district === 'All' (not require exact district match)
if (!src.includes("=== 'All'") && !src.includes('=== "All"')) {
  console.error('FAIL: FoInspectorModal.jsx does not handle district === All case');
  failures++;
}

// Must use isOfficerNameMatch or equivalent name-based matching
if (!src.includes('isOfficerNameMatch') && !src.includes('toLowerCase')) {
  console.error('FAIL: FoInspectorModal.jsx missing flexible name matching');
  failures++;
}

if (failures === 0) {
  console.log('PASS: FoInspectorModal handles All district and flexible name matching');
  process.exit(0);
} else {
  console.error(`FAIL: ${failures} FO inspector issues`);
  process.exit(1);
}
```

- [ ] **Step 5: Run to verify RED** 

```
node tests/test_journey_modal_handler.mjs
node tests/test_fo_inspector_all_district.mjs
```

- [ ] **Step 6: Fix useAdminModals return block — add missing journey keys**

In `useAdminModals.js`, find the `// 5. Patient Journey` section in the return object. If missing, add:
```javascript
// 5. Patient Journey
showJourneyModal, setShowJourneyModal,
journeyPatientId, setJourneyPatientId,
journeyLoading, journeyResult, journeyError,
setJourneyError,
handleFetchJourney,
```

- [ ] **Step 7: Fix AdminModals.jsx — verify JourneyModal receives handleFetchJourney**

Read the JourneyModal render block in `AdminModals.jsx`. Ensure `handleFetchJourney={props.handleFetchJourney}` is present. Add if missing.

- [ ] **Step 8: Fix FoInspectorModal.jsx — district='All' guard**

In `FoInspectorModal.jsx`, find the records filter. Ensure:
```javascript
const districtMatch = !inspectingFO?.district || 
  inspectingFO.district === 'All' || 
  canonicalizeDistrict(r.working_place) === canonicalizeDistrict(inspectingFO.district);
```

- [ ] **Step 9: Run tests to verify GREEN**

```
node tests/test_journey_modal_handler.mjs
node tests/test_fo_inspector_all_district.mjs
```

- [ ] **Step 10: Lint + build**

```
npm --prefix dfy-frontend run lint 2>&1 | Select-String "error" | Select-Object -First 5
npm --prefix dfy-frontend run build
```

- [ ] **Step 11: Commit**

```
git add dfy-frontend/src/hooks/useAdminModals.js dfy-frontend/src/components/Admin/AdminModals.jsx dfy-frontend/src/components/Admin/modals/FoInspectorModal.jsx tests/test_journey_modal_handler.mjs tests/test_fo_inspector_all_district.mjs
git commit -m "fix(journey,fo-inspector): wire handleFetchJourney in return, add All district guard in FoInspectorModal"
```

---

### Task 4: NotifTray Data Flow Audit + build24ColTsv Column Population

**Files:**
- Verify/Modify: `dfy-frontend/src/hooks/useAdminModals.js` (build24ColTsv full column data)
- Verify: `dfy-frontend/src/components/Admin/AdminModals.jsx` (NotifTrayModal props)
- Test: `tests/test_notif_tray_data_flow.mjs`

**Interfaces:**
- Consumes: `rawRecords` (with `notification_ids`, `fo_name`, `date_of_reporting`, `working_place`, plus category count fields)
- Produces: `notifTrayData.allIds` = array of `{id, fo_name, district, date_formatted}`, `build24ColTsv` exports all 24 columns

**Context:** `notifTrayData` useMemo at line 749 correctly builds `allIds` from `rawRecords.notification_ids`. The `build24ColTsv` function at line 724 currently only fills columns 1–4 and col 8 (Episode ID). Production monolith populated all 24 columns from category counts. However — the NotifTray TSV was always ID-centric, not count-centric. Verify against production what columns 5–24 should contain.

From production grep: The 24 columns are: Sl No, FO Name, Date, District, Presumptive, Testing, Diagnosed, Episode ID, DBT, HIV/DM, FDC, Outcome, Home Visit, Follow Up, Face to Face, Contact Tracing, Diff TB, Docs, Kit Cons, TPT Start, TPT Presump, Aadhaar Face, Consent ID, Culture DST.

For a Notification ID entry, these map to the record's category counts (not per-ID). So each row = one notification ID entry, with the record's aggregate counts in cols 5–24.

- [ ] **Step 1: Write the failing test**

Create `tests/test_notif_tray_data_flow.mjs`:
```javascript
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modalsSrc = readFileSync(path.join(__dirname, '../dfy-frontend/src/hooks/useAdminModals.js'), 'utf8');
const adminModalsSrc = readFileSync(path.join(__dirname, '../dfy-frontend/src/components/Admin/AdminModals.jsx'), 'utf8');

let failures = 0;

// notifTrayData must be computed from rawRecords.notification_ids
if (!modalsSrc.includes('notification_ids')) {
  console.error('FAIL: useAdminModals notifTrayData does not read notification_ids');
  failures++;
}

// AdminModals must pass notifTrayData to NotifTrayModal
if (!adminModalsSrc.includes('notifTrayData={props.notifTrayData}') &&
    !adminModalsSrc.includes('notifTrayData=')) {
  console.error('FAIL: AdminModals does not pass notifTrayData to NotifTrayModal');
  failures++;
}

// build24ColTsv should be in the return
const returnBlock = modalsSrc.slice(modalsSrc.lastIndexOf('return {'));
if (!returnBlock.includes('build24ColTsv')) {
  console.error('FAIL: useAdminModals return missing build24ColTsv');
  failures++;
}
if (!returnBlock.includes('copyToClipboardWithFallback')) {
  console.error('FAIL: useAdminModals return missing copyToClipboardWithFallback');
  failures++;
}
if (!returnBlock.includes('handleClearNotifDistricts')) {
  console.error('FAIL: useAdminModals return missing handleClearNotifDistricts');
  failures++;
}

// notifTrayData must be in return
if (!returnBlock.includes('notifTrayData')) {
  console.error('FAIL: useAdminModals return missing notifTrayData');
  failures++;
}

if (failures === 0) {
  console.log('PASS: NotifTray data flow verified');
  process.exit(0);
} else {
  console.error(`FAIL: ${failures} notif tray wiring issues`);
  process.exit(1);
}
```

- [ ] **Step 2: Run to verify RED (or GREEN if already wired)**

```
node tests/test_notif_tray_data_flow.mjs
```

- [ ] **Step 3: Enhance build24ColTsv to include category counts**

In `useAdminModals.js`, find `build24ColTsv` (line 724). The current items array only has `{id, fo_name, district, date_formatted}`. We need to pass record context too. Update `notifTrayData` useMemo to include record stats in each item:

Current `notifTrayData` at line 749:
```javascript
const notifTrayData = useMemo(() => {
  const allIds = [];
  (rawRecords || []).forEach(r => {
    const dist = canonicalizeDistrict(r.working_place || r.district || '');
    if (notifTrayDistricts.length > 0 && !notifTrayDistricts.includes(dist)) return;
    const ids = r.notification_ids || [];
    ids.forEach(id => {
      allIds.push({
        id,
        fo_name: r.fo_name || 'Field Officer',
        district: dist,
        date_formatted: r.date_of_reporting || r.date || ''
      });
    });
  });
  return { allIds };
}, [rawRecords, notifTrayDistricts]);
```

Replace with (adds category counts to each entry):
```javascript
const notifTrayData = useMemo(() => {
  const allIds = [];
  (rawRecords || []).forEach(r => {
    const dist = canonicalizeDistrict(r.working_place || r.district || '');
    if (notifTrayDistricts.length > 0 && !notifTrayDistricts.includes(dist)) return;
    const ids = r.notification_ids || [];
    ids.forEach(id => {
      allIds.push({
        id,
        fo_name: r.fo_name || 'Field Officer',
        district: dist,
        date_formatted: r.date_of_reporting || r.date || '',
        presumptive: r.presumptive || 0,
        sample_tested: r.sample_tested || 0,
        notifications: r.notifications || 0,
        dbt: r.dbt || 0,
        hiv_dm: r.hiv_dm || 0,
        fdc_provided: r.fdc_provided || 0,
        follow_ups: r.follow_ups || r.follow_up || 0,
        home_visits: r.home_visits || r.home_visit || 0,
        contact_tracing: r.contact_tracing || 0,
        differentiated_tb: r.differentiated_tb || 0,
        documents: r.documents || 0,
        kit_consumption: r.kit_consumption || 0,
        tpt_treatment_start: r.tpt_treatment_start || 0,
        tpt_presumptive: r.tpt_presumptive || 0,
        adhar_face_auth: r.adhar_face_auth || r.adhar_face_authentication || 0,
        consent_with_id: r.consent_with_id || 0,
        culture_dst: r.culture_dst || 0
      });
    });
  });
  return { allIds };
}, [rawRecords, notifTrayDistricts]);
```

Update `build24ColTsv` to use all fields:
```javascript
const build24ColTsv = (items) => {
  const headers = [
    "Sl No", "FO Name", "Date", "District", "Presumptive", "Testing", "Diagnosed", "Episode ID",
    "DBT", "HIV/DM", "FDC", "Outcome", "Home Visit", "Follow Up", "Face to Face", "Contact Tracing",
    "Diff TB", "Docs", "Kit Cons", "TPT Start", "TPT Presump", "Aadhaar Face", "Consent ID", "Culture DST"
  ];
  const headerLine = headers.join('\t');
  const rowLines = (items || []).map((item, idx) => {
    const row = new Array(24).fill('');
    row[0] = String(idx + 1);
    row[1] = item.fo_name || '';
    row[2] = item.date_formatted || '';
    row[3] = item.district || '';
    row[4] = String(item.presumptive || '');
    row[5] = String(item.sample_tested || '');
    row[6] = String(item.notifications || '');
    row[7] = item.id || '';
    row[8] = String(item.dbt || '');
    row[9] = String(item.hiv_dm || '');
    row[10] = String(item.fdc_provided || '');
    row[11] = '';  // Outcome — not in current data model
    row[12] = String(item.home_visits || '');
    row[13] = String(item.follow_ups || '');
    row[14] = '';  // Face to Face — not separately tracked
    row[15] = String(item.contact_tracing || '');
    row[16] = String(item.differentiated_tb || '');
    row[17] = String(item.documents || '');
    row[18] = String(item.kit_consumption || '');
    row[19] = String(item.tpt_treatment_start || '');
    row[20] = String(item.tpt_presumptive || '');
    row[21] = String(item.adhar_face_auth || '');
    row[22] = String(item.consent_with_id || '');
    row[23] = String(item.culture_dst || '');
    return row.join('\t');
  });
  return [headerLine, ...rowLines].join('\n');
};
```

- [ ] **Step 4: Verify AdminModals passes notifTrayData to NotifTrayModal**

Read `AdminModals.jsx` NotifTrayModal block. Must include:
```jsx
notifTrayData={props.notifTrayData}
build24ColTsv={props.build24ColTsv}
copyToClipboardWithFallback={props.copyToClipboardWithFallback}
handleClearNotifDistricts={props.handleClearNotifDistricts}
handleSelectAllNotifDistricts={props.handleSelectAllNotifDistricts}
handleToggleNotifDistrict={props.handleToggleNotifDistrict}
notifTrayDistricts={props.notifTrayDistricts}
```

Add any missing props.

- [ ] **Step 5: Run tests to verify GREEN**

```
node tests/test_notif_tray_data_flow.mjs
```

- [ ] **Step 6: Lint + build**

```
npm --prefix dfy-frontend run lint 2>&1 | Select-String "error" | Select-Object -First 5
npm --prefix dfy-frontend run build
```

- [ ] **Step 7: Commit**

```
git add dfy-frontend/src/hooks/useAdminModals.js dfy-frontend/src/components/Admin/AdminModals.jsx tests/test_notif_tray_data_flow.mjs
git commit -m "fix(notif-tray): enrich tray data with category counts and populate all 24 TSV columns"
```

---

### Task 5: Cascade Alerts — Wire Check + Full System Regression

**Files:**
- Verify: `dfy-frontend/src/components/Admin/AdminModals.jsx` (CascadeAlertsModal props)
- Verify: `dfy-frontend/src/components/Admin/modals/CascadeAlertsModal.jsx`
- Verify: `dfy-frontend/src/components/Admin/AdminHeader.jsx` (cascade trigger)
- Test: `tests/test_cascade_alerts_wiring.mjs`

**Interfaces:**
- Consumes: `showCascadeModal`, `setShowCascadeModal`, `fetchCascadeAlerts`, `cascadeData`, `cascadeFilterDist`, `setCascadeFilterDist`, `cascadeRiskFilter`, `setCascadeRiskFilter`, `loadingCascade`
- Produces: Cascade modal opens, shows district-level alert data for the current month

- [ ] **Step 1: Write the failing test**

Create `tests/test_cascade_alerts_wiring.mjs`:
```javascript
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminModalsSrc = readFileSync(path.join(__dirname, '../dfy-frontend/src/components/Admin/AdminModals.jsx'), 'utf8');
const headerSrc = readFileSync(path.join(__dirname, '../dfy-frontend/src/components/Admin/AdminHeader.jsx'), 'utf8');
const modalsSrc = readFileSync(path.join(__dirname, '../dfy-frontend/src/hooks/useAdminModals.js'), 'utf8');

let failures = 0;

// AdminHeader must have fetchCascadeAlerts prop and use it before setShowCascadeModal
if (!headerSrc.includes('fetchCascadeAlerts')) {
  console.error('FAIL: AdminHeader.jsx missing fetchCascadeAlerts prop');
  failures++;
}
if (!headerSrc.includes('setShowCascadeModal')) {
  console.error('FAIL: AdminHeader.jsx missing setShowCascadeModal prop');
  failures++;
}

// AdminModals must pass all cascade props to CascadeAlertsModal
const cascadeBlock = adminModalsSrc.slice(
  adminModalsSrc.indexOf('CascadeAlertsModal'),
  adminModalsSrc.indexOf('/>', adminModalsSrc.indexOf('CascadeAlertsModal')) + 2
);
if (!cascadeBlock.includes('fetchCascadeAlerts')) {
  console.error('FAIL: AdminModals CascadeAlertsModal block missing fetchCascadeAlerts');
  failures++;
}
if (!cascadeBlock.includes('cascadeData')) {
  console.error('FAIL: AdminModals CascadeAlertsModal block missing cascadeData');
  failures++;
}
if (!cascadeBlock.includes('loadingCascade')) {
  console.error('FAIL: AdminModals CascadeAlertsModal block missing loadingCascade');
  failures++;
}

// useAdminModals must return fetchCascadeAlerts
const returnBlock = modalsSrc.slice(modalsSrc.lastIndexOf('return {'));
if (!returnBlock.includes('fetchCascadeAlerts')) {
  console.error('FAIL: useAdminModals return missing fetchCascadeAlerts');
  failures++;
}

if (failures === 0) {
  console.log('PASS: Cascade alerts wiring verified');
  process.exit(0);
} else {
  console.error(`FAIL: ${failures} cascade wiring issues`);
  process.exit(1);
}
```

- [ ] **Step 2: Run to verify (should pass if already wired, fail if not)**

```
node tests/test_cascade_alerts_wiring.mjs
```

- [ ] **Step 3: Fix any gaps found**

If `AdminModals.jsx` CascadeAlertsModal block is missing props, add them. If `useAdminModals` return is missing `fetchCascadeAlerts`, add it.

- [ ] **Step 4: Full regression — run all existing tests**

```
node tests/test_admin_feed_prop_wiring.mjs
node tests/test_nikshay_modal_sync.mjs
node tests/test_journey_modal_handler.mjs
node tests/test_fo_inspector_all_district.mjs
node tests/test_notif_tray_data_flow.mjs
node tests/test_cascade_alerts_wiring.mjs
node tests/test_master_table_cohort_ui.mjs
node tests/test_admin_pacing_ui.mjs
node tests/test_dual_target_ui.mjs
```

All must pass.

- [ ] **Step 5: Run Python tests regression**

```
pytest tests/ -v --tb=short 2>&1 | Select-String -Pattern "PASSED|FAILED|ERROR" | Select-Object -Last 20
```

All must pass.

- [ ] **Step 6: Final lint + build**

```
npm --prefix dfy-frontend run lint 2>&1 | Select-String "error" | Select-Object -First 5
npm --prefix dfy-frontend run build
```

- [ ] **Step 7: Python compile**

```
python -m py_compile main.py
```

- [ ] **Step 8: Commit**

```
git add tests/test_cascade_alerts_wiring.mjs
git commit -m "fix(cascade,regression): verify cascade alerts wiring, full regression suite passing"
```

If any fixes were made to `AdminModals.jsx` or `useAdminModals.js`:
```
git add dfy-frontend/src/hooks/useAdminModals.js dfy-frontend/src/components/Admin/AdminModals.jsx tests/test_cascade_alerts_wiring.mjs
git commit -m "fix(cascade): wire missing cascade props in AdminModals and useAdminModals return"
```

---

## Pre-flight Conflict Scan (Controller Must Run Before Task 1)

| Task pair | Shared file | Produces vs Consumes | Finding |
|---|---|---|---|
| T1 → T2 | `useAdminModals.js` | T1 reads; T2 writes | No conflict — T1 only reads AdminDashboard.jsx |
| T2 → T3 | `useAdminModals.js` | Both modify return block | T3 must not overwrite T2's Nikshay additions — implementers write to different sections |
| T3 → T4 | `useAdminModals.js` | T4 modifies notifTrayData useMemo | T3 must not disturb notifTrayData — different sections |
| T4 → T5 | `AdminModals.jsx` | T4 verifies NotifTray; T5 verifies Cascade | Sequential — T5 runs after T4 passes, no conflict |
| T1 (AdminDashboard) | AdminDashboard.jsx | Only 3 lines changed | No structural conflict |

**Ruling:** Tasks 2–4 all touch `useAdminModals.js` in different sections (Nikshay=lines ~783+, Journey=return block ~1960, NotifTray=~724–765). Implementers must read the CURRENT file state before making changes to avoid clobbering each other's additions. Tasks run sequentially — T3 reads T2's output, T4 reads T3's output.

---

## Execution Notes

- Tasks 1–5 run sequentially (each modifies shared files)
- No parallel dispatch allowed
- Base commit before Task 1 dispatch: record `git rev-parse HEAD`
- SDD workspace: `.superpowers/sdd/2026-10-02-feature-reconnection/`
- Ledger file: `.superpowers/sdd/2026-10-02-feature-reconnection/progress.md`
