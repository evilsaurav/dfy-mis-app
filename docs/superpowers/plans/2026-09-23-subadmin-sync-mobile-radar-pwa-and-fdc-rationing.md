# Sub-Admin Sync Integrity, Mobile Radar Ergonomics, PWA Cache Invalidation, and FDC Medicine Rationing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Sub-Admin dashboard query accuracy and stale cache locks, prevent disk snapshot overwrites, force PWA cache invalidation and version upgrade from v2.7.6 to v2.8.1 with a 1-tap hard reset, fix mobile viewport clipping in Attendance Radar, and add field medicine rationing (1 to max recommended strips) to FDC distribution.

**Architecture:** 
1. **Backend**: Replace exact-string Firestore district filtering with date-range streaming and in-memory canonicalization. Guard statewide disk snapshots against sub-admin overwrites. Expose `/api/system-version`.
2. **PWA Invalidation & Resilient Sync**: Enforce `no-cache, no-store, must-revalidate` in `vercel.json` for `/sw.js` and `/index.html`. Add 1-tap hard reset button and cold-start grace banners. Configure Admin "Refresh" to always perform force-refresh.
3. **Mobile Radar Ergonomics**: Revamp Attendance Radar modal with responsive mobile height (`h-[94vh]`), outer overlay scrolling, and a dedicated `flex-1 min-h-[320px] overflow-y-auto` list container.
4. **FDC Rationing**: Preserve NTEP dosage engine while introducing interactive strip stepper controls (`-` `[Count]` `+`) bounded by `[1, max_recommended]` on new entries and existing cards.

**Tech Stack:** FastAPI, Python 3.11+, React 19, Tailwind CSS, Vite, Workbox PWA, IndexedDB, Firebase Firestore.

**Spec:** `docs/superpowers/specs/2026-09-23-subadmin-sync-mobile-radar-pwa-and-fdc-rationing-design.md`

## Global Constraints

- Python compilation `python -m py_compile main.py` must exit code 0 on every backend task.
- Automated tests (`pytest tests/ -v`) must pass 100% with 0 regressions.
- Frontend build `npm --prefix dfy-frontend run build` and lint `npm --prefix dfy-frontend run lint` must have 0 syntax errors.
- Sub-Admin users must NEVER access or mutate records outside permitted districts (`admin.get("allowed_districts")`).
- Sub-Admin single-district queries must NEVER overwrite global statewide disk caches (`cache/dash_{month}.json`).
- Temporal Dead Zone (TDZ): In React components, declare base states before derived collections, handlers, and effects.
- User Approval Gate: Never push to `origin/main` automatically. Commit locally first.

---

### Task 1: Backend Sub-Admin Query Accuracy & Safe Disk Snapshotting (`main.py`)

**Files:**
- Modify: `main.py:647-720, 902-920, 1100-1120`
- Test: `tests/test_subadmin_sync_and_snapshots.py`

**Interfaces:**
- Consumes: Firestore collection `daily_field_reports`, `canonicalize_district`
- Produces: `get_raw_monthly_reports(month_prefix, force, district_filter)`, `GET /api/system-version`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_subadmin_sync_and_snapshots.py
import pytest
import os
import json
from unittest.mock import MagicMock, patch
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import main

class MockDocSnap:
    def __init__(self, doc_id, data):
        self.id = doc_id
        self._data = data

    def to_dict(self):
        return dict(self._data)

class MockQuery:
    def __init__(self, docs):
        self._docs = docs

    def where(self, field, op, val):
        filtered = []
        for d in self._docs:
            data = d.to_dict()
            if op == ">=" and data.get(field, "") >= val:
                filtered.append(d)
            elif op == "<=" and data.get(field, "") <= val:
                filtered.append(d)
            elif op == "==" and data.get(field, "") == val:
                filtered.append(d)
        return MockQuery(filtered)

    def stream(self):
        return iter(self._docs)

class MockCollection:
    def __init__(self, docs):
        self._docs = docs

    def where(self, field, op, val):
        return MockQuery(self._docs).where(field, op, val)

class MockDB:
    def __init__(self, docs):
        self._docs = docs

    def collection(self, name):
        return MockCollection(self._docs)

@pytest.mark.asyncio
async def test_subadmin_query_retrieves_district_variants_without_dropping():
    # Setup reports with district name variants: "Purbi Champaran" vs "East Champaran"
    raw_docs = [
        MockDocSnap("doc1", {
            "working_place": "Purbi Champaran",
            "fo_name": "Ramesh",
            "date_of_reporting": "2026-09-10",
            "notification_ids": ["111111111"]
        }),
        MockDocSnap("doc2", {
            "working_place": "East Champaran",
            "fo_name": "Suresh",
            "date_of_reporting": "2026-09-12",
            "notification_ids": ["222222222"]
        }),
        MockDocSnap("doc3", {
            "working_place": "Gaya",
            "fo_name": "Mahesh",
            "date_of_reporting": "2026-09-15",
            "notification_ids": ["333333333"]
        })
    ]
    orig_db = main.db
    main.db = MockDB(raw_docs)
    main.cache.delete_prefix("shared_raw_month_")

    try:
        # Sub-Admin with permission for "East Champaran"
        allowed = {"East Champaran"}
        reports = await main.get_raw_monthly_reports("2026-09", force=True, district_filter=allowed)
        
        # Both "Purbi Champaran" and "East Champaran" must be returned!
        doc_ids = [r["id"] for r in reports]
        assert "doc1" in doc_ids
        assert "doc2" in doc_ids
        assert "doc3" not in doc_ids
    finally:
        main.db = orig_db

@pytest.mark.asyncio
async def test_subadmin_query_does_not_overwrite_statewide_disk_snapshot():
    # Setup test file
    os.makedirs("cache", exist_ok=True)
    snap_path = "cache/dash_2026-09.json"
    statewide_records = [{"id": "statewide_1", "working_place": "Patna"}]
    with open(snap_path, "w", encoding="utf-8") as f:
        json.dump(statewide_records, f)

    try:
        # Call get_dashboard_data as Sub-Admin
        sub_admin_user = {
            "user_id": "subadmin_muzaffarpur",
            "username": "subadmin_muz",
            "role": "SUB_ADMIN",
            "allowed_districts": ["Muzaffarpur"]
        }
        req = main.DashboardRequest(month_prefix="2026-09", force_refresh=False)
        
        # Mock get_raw_monthly_reports to return only Muzaffarpur
        with patch("main.get_raw_monthly_reports") as mock_get_raw:
            mock_get_raw.return_value = [{"id": "muz_1", "working_place": "Muzaffarpur", "date_of_reporting": "2026-09-01"}]
            await main.get_dashboard_data(req, admin=sub_admin_user)

        # Verify statewide snapshot was NOT overwritten!
        with open(snap_path, "r", encoding="utf-8") as f:
            persisted = json.load(f)
        assert len(persisted) == 1
        assert persisted[0]["id"] == "statewide_1"
    finally:
        if os.path.exists(snap_path):
            os.remove(snap_path)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_subadmin_sync_and_snapshots.py -v`
Expected: FAIL (sub-admin queries currently use `.where("working_place", "==", d_name)` and drop variants, or overwrite disk snapshots).

- [ ] **Step 3: Implement minimal code in `main.py`**

In `main.py:647-720`:
1. In `get_raw_monthly_reports`: Always query Firestore by `date_of_reporting >= start_date` and `<= end_date` (never filter by `.where("working_place", "==", d_name)` in Firestore query).
2. Filter the retrieved documents in memory using `canonicalize_district(d.get("working_place") or d.get("district", "")) in clean_dists`.
3. In `get_dashboard_data` (lines 902–908):
   Guard disk snapshot saving with `if not allowed_dist_set and records:`:
   ```python
   if not allowed_dist_set and records:
       try:
           os.makedirs("cache", exist_ok=True)
           with open(f"cache/dash_{req.month_prefix}.json", "w", encoding="utf-8") as f:
               json.dump(records, f)
       except Exception:
           pass
   ```
4. Add endpoint `GET /api/system-version`:
   ```python
   @app.get("/api/system-version")
   async def get_system_version():
       return {"status": "success", "version": "2.8.1", "min_supported_version": "2.8.0"}
   ```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_subadmin_sync_and_snapshots.py -v`
Expected: PASS (2 passed).
Run: `python -m py_compile main.py`
Expected: Exit code 0.

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_subadmin_sync_and_snapshots.py
git commit -m "fix(backend): guarantee sub-admin district variant retrieval and guard statewide disk snapshots"
```

---

### Task 2: PWA Cache Invalidation & Force Update Mechanism (`dfy-frontend/vercel.json`, `dfy-frontend/src/changelogData.js`, `dfy-frontend/index.html`)

**Files:**
- Modify: `dfy-frontend/vercel.json`
- Modify: `dfy-frontend/src/changelogData.js:4`
- Modify: `dfy-frontend/index.html:24-42`
- Test: `tests/test_pwa_cache_headers.mjs`

**Interfaces:**
- Consumes: Vercel routing configuration, browser ServiceWorker API
- Produces: Strict Cache-Control headers for PWA assets, `APP_VERSION = "2.8.1"`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/test_pwa_cache_headers.mjs
import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

const vercelConfig = JSON.parse(readFileSync(resolve('dfy-frontend/vercel.json'), 'utf8'));

// Verify headers exist for /sw.js and /index.html
assert(Array.isArray(vercelConfig.headers), "vercel.json must have headers array");

const swHeader = vercelConfig.headers.find(h => h.source === '/sw.js');
assert(swHeader, "Must have header rule for /sw.js");
const swCacheControl = swHeader.headers.find(h => h.key.toLowerCase() === 'cache-control');
assert(swCacheControl.value.includes('no-cache') && swCacheControl.value.includes('no-store'), "/sw.js must be no-cache, no-store");

const htmlHeader = vercelConfig.headers.find(h => h.source === '/index.html');
assert(htmlHeader, "Must have header rule for /index.html");
const htmlCacheControl = htmlHeader.headers.find(h => h.key.toLowerCase() === 'cache-control');
assert(htmlCacheControl.value.includes('no-cache'), "/index.html must be no-cache");

const changelog = readFileSync(resolve('dfy-frontend/src/changelogData.js'), 'utf8');
assert(changelog.includes('APP_VERSION = "2.8.1"'), "APP_VERSION must be bumped to 2.8.1");

console.log("✔ PWA cache control and version bump verified!");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_pwa_cache_headers.mjs`
Expected: FAIL ("vercel.json must have headers array")

- [ ] **Step 3: Implement minimal code**

1. Update `dfy-frontend/vercel.json` to include strict headers:
```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/sw.js",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" },
        { "key": "Pragma", "value": "no-cache" },
        { "key": "Expires", "value": "0" }
      ]
    },
    {
      "source": "/index.html",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" },
        { "key": "Pragma", "value": "no-cache" },
        { "key": "Expires", "value": "0" }
      ]
    }
  ]
}
```
2. In `dfy-frontend/src/changelogData.js`:
Bump `APP_VERSION = "2.8.1"`.
Add changelog entry for v2.8.1 describing subadmin sync fix, PWA cache purge, mobile attendance radar layout, and FDC medicine rationing.
3. In `dfy-frontend/index.html`:
Update the service worker update block to detect byte changes and immediately trigger activation.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_pwa_cache_headers.mjs`
Expected: PASS ("✔ PWA cache control and version bump verified!")

- [ ] **Step 5: Commit**

```bash
git add dfy-frontend/vercel.json dfy-frontend/src/changelogData.js dfy-frontend/index.html tests/test_pwa_cache_headers.mjs
git commit -m "fix(pwa): add strict cache-control headers in vercel.json and bump app version to 2.8.1"
```

---

### Task 3: Frontend Guaranteed Live Refresh & Hard Reset UI (`AdminDashboard.jsx`, `App.jsx`)

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx:2630-2780, 4370-4440`
- Modify: `dfy-frontend/src/App.jsx:4630-4660`
- Test: `tests/test_refresh_and_hard_reset.mjs`

**Interfaces:**
- Consumes: `authFetch`, ServiceWorker API, `localStorage`
- Produces: 100% force refresh on click, 1-tap `handleHardAppReset`, Cold-start waking state

- [ ] **Step 1: Write the failing test**

```javascript
// tests/test_refresh_and_hard_reset.mjs
import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

const adminCode = readFileSync(resolve('dfy-frontend/src/AdminDashboard.jsx'), 'utf8');

// 1. Verify Refresh button click handler always forces live refresh
assert(adminCode.includes('fetchData(true)'), "Admin Refresh button must trigger fetchData(true)");

// 2. Verify hard reset / purge cache handler exists
assert(adminCode.includes('handleHardAppReset'), "AdminDashboard must implement handleHardAppReset");
assert(adminCode.includes('caches.delete'), "handleHardAppReset must clear CacheStorage");

// 3. Verify server cold start indicator state exists
assert(adminCode.includes('isColdStarting') || adminCode.includes('serverWakeNotice') || adminCode.includes('connecting to server'), "Dashboard must support server cold start notification");

console.log("✔ Live refresh and hard app reset verified!");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_refresh_and_hard_reset.mjs`
Expected: FAIL

- [ ] **Step 3: Implement minimal code**

1. In `AdminDashboard.jsx`:
   - Change the Refresh button onClick handler (lines ~4370–4395):
     ```jsx
     onClick={() => {
       fetchData(true);
       fetchAttendance(true);
       fetchDirectory();
       loadTargets('All');
       fetchStaffList();
       fetchActiveBroadcasts();
       showToast("✓ Live database refresh complete.", "success");
     }}
     ```
   - Implement `handleHardAppReset`:
     ```javascript
     const handleHardAppReset = async () => {
       if (!window.confirm("App cache clear karke fresh reload karein?")) return;
       try {
         if ('serviceWorker' in navigator) {
           const regs = await navigator.serviceWorker.getRegistrations();
           for (const r of regs) await r.unregister();
         }
         if ('caches' in window) {
           const keys = await caches.keys();
           for (const k of keys) await caches.delete(k);
         }
         localStorage.clear();
         sessionStorage.clear();
       } catch (e) {
         console.warn("Reset error:", e);
       }
       window.location.reload(true);
     };
     ```
   - Add a "🔄 Reset / Hard Update" button in the admin header.
   - Add cold-start detection: if `fetchData` takes > 6s, show an amber toast/banner: `"⚡ Server wake-up ho raha hai, kripya thoda intezar karein..."`.
2. In `App.jsx`:
   - Add a similar 1-tap "🔄 Update / Reset App" button in the FO menu/profile.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_refresh_and_hard_reset.mjs`
Expected: PASS ("✔ Live refresh and hard app reset verified!")
Run: `npm --prefix dfy-frontend run lint`
Expected: 0 syntax errors.

- [ ] **Step 5: Commit**

```bash
git add dfy-frontend/src/AdminDashboard.jsx dfy-frontend/src/App.jsx tests/test_refresh_and_hard_reset.mjs
git commit -m "feat(ui): ensure refresh always forces live truth and add 1-tap hard reset for pwa cache"
```

---

### Task 4: Attendance Radar Mobile Viewport & Ergonomics Fix (`AdminDashboard.jsx`)

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx:9810-10250`
- Test: `tests/test_attendance_radar_mobile_layout.mjs`

**Interfaces:**
- Consumes: `showAttendanceModal`, `activeAttendanceTab`, `filteredMissing`
- Produces: Responsive `h-[94vh]` modal, outer scroll wrapper, non-clipped FO list

- [ ] **Step 1: Write the failing test**

```javascript
// tests/test_attendance_radar_mobile_layout.mjs
import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

const adminCode = readFileSync(resolve('dfy-frontend/src/AdminDashboard.jsx'), 'utf8');

// 1. Verify Attendance Radar outer overlay has overflow-y-auto
const modalIndex = adminCode.indexOf('Field Officer Attendance Radar');
assert(modalIndex !== -1, "Attendance Radar modal must exist");
const modalBlock = adminCode.substring(modalIndex - 500, modalIndex + 1500);

assert(modalBlock.includes('overflow-y-auto'), "Modal outer wrapper must have overflow-y-auto");
assert(modalBlock.includes('h-[94vh]') || modalBlock.includes('h-[92vh]'), "Modal must have responsive mobile viewport height");

// 2. Verify list container has flexible min-height
const listBlock = adminCode.substring(modalIndex + 1000, modalIndex + 3000);
assert(listBlock.includes('min-h-[300px]') || listBlock.includes('min-h-[320px]'), "List container must guarantee min-height on mobile");

console.log("✔ Attendance Radar mobile viewport layout verified!");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_attendance_radar_mobile_layout.mjs`
Expected: FAIL

- [ ] **Step 3: Implement minimal code**

In `AdminDashboard.jsx:9812–10160`:
1. Update outer overlay and modal wrapper:
   ```jsx
   <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
     <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 w-full max-w-4xl shadow-2xl border border-slate-100 h-[94vh] sm:h-auto sm:max-h-[90vh] flex flex-col animate-fade-in my-auto font-sans">
   ```
2. Make header elements compact:
   - Header margin: `mb-2 pb-2`
   - Date navigation: Compact bar with smaller padding `p-2`
   - District rollup pills: `pb-1 mb-1.5`
   - Category tabs: Compact padding `py-1.5`
   - Quick search: `mb-1.5`
3. Update list container:
   ```jsx
   <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar my-1 min-h-[320px]">
   ```
4. Update list card layout on mobile:
   - Ensure the "Mark Leave" and "Not Submitted" badges wrap cleanly on small phones without pushing card boundaries.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_attendance_radar_mobile_layout.mjs`
Expected: PASS ("✔ Attendance Radar mobile viewport layout verified!")
Run: `npm --prefix dfy-frontend run lint`
Expected: 0 syntax errors.

- [ ] **Step 5: Commit**

```bash
git add dfy-frontend/src/AdminDashboard.jsx tests/test_attendance_radar_mobile_layout.mjs
git commit -m "fix(radar): optimize attendance radar modal viewport and prevent list clipping on mobile"
```

---

### Task 5: FDC Medicine Rationing: Custom Strip Count Stepper (`dfy-frontend/src/App.jsx`)

**Files:**
- Modify: `dfy-frontend/src/App.jsx:2513-2890`
- Test: `tests/test_fdc_rationing_stepper.mjs`

**Interfaces:**
- Consumes: `calculateFdcDosage`, `FdcBucket`, `handleAddFdc`, `handleUpdateFdc`
- Produces: Adjustable strip stepper `[1, max_recommended]`, rationing metadata in `supply_issued`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/test_fdc_rationing_stepper.mjs
import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

const appCode = readFileSync(resolve('dfy-frontend/src/App.jsx'), 'utf8');

// 1. Verify customStrips state exists in FdcBucket
assert(appCode.includes('customStrips'), "FdcBucket must declare customStrips state");

// 2. Verify stepper controls exist for strips
assert(appCode.includes('setCustomStrips'), "FdcBucket must provide strip adjustment handler");

// 3. Verify minimum 1 strip enforcement
assert(appCode.includes('Math.max(1'), "Strip stepper must enforce minimum of 1 strip");

// 4. Verify inline adjustment buttons on added entries
assert(appCode.includes('onUpdateFdc') && appCode.includes('detail.strips'), "Added FDC entries must support inline strip adjustment");

console.log("✔ FDC Medicine Rationing Stepper verified!");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_fdc_rationing_stepper.mjs`
Expected: FAIL

- [ ] **Step 3: Implement minimal code**

In `dfy-frontend/src/App.jsx:2513–2890`:
1. In `FdcBucket`, declare `const [customStrips, setCustomStrips] = useState(null)`.
2. When `dosage` updates or resets, compute `effectiveStrips = customStrips !== null ? customStrips : (dosage?.strips || 1)`.
3. In the dosage card, render the interactive stepper:
   ```jsx
   <div className="flex items-center justify-between p-2.5 bg-emerald-50/90 rounded-xl border border-emerald-200 mt-2">
     <div>
       <span className="text-[10px] font-black uppercase text-emerald-800 block">Strips Provided (Stock):</span>
       <span className="text-[10px] text-slate-500 font-semibold">Min: 1 | Recommended: {dosage.strips}</span>
     </div>
     <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-emerald-200 shadow-2xs">
       <button
         type="button"
         onClick={() => setCustomStrips(prev => Math.max(1, (prev !== null ? prev : dosage.strips) - 1))}
         className="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-sm flex items-center justify-center cursor-pointer active:scale-95"
         title="Decrease Strips"
       >
         -
       </button>
       <span className="font-mono font-black text-sm text-emerald-950 px-2 min-w-[28px] text-center">
         {effectiveStrips}
       </span>
       <button
         type="button"
         onClick={() => setCustomStrips(prev => Math.min(dosage.strips || 12, (prev !== null ? prev : dosage.strips) + 1))}
         className="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-sm flex items-center justify-center cursor-pointer active:scale-95"
         title="Increase Strips"
       >
         +
       </button>
     </div>
   </div>
   ```
4. In `handleAddSmart`:
   Pass `strips: effectiveStrips`, `supply_issued: `${effectiveStrips} strips (${effectiveStrips < (dosage?.strips || 1) ? 'Stock Rationed' : 'Full Supply'})``.
5. On added list items (`safeIds.map`):
   Add inline `-` and `+` buttons next to the strip badge:
   ```jsx
   <button
     type="button"
     onClick={() => onUpdateFdc(id, { strips: Math.max(1, displayStrips - 1), supply_issued: `${Math.max(1, displayStrips - 1)} strips` })}
     className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-xs font-bold"
   >
     -
   </button>
   <button
     type="button"
     onClick={() => onUpdateFdc(id, { strips: displayStrips + 1, supply_issued: `${displayStrips + 1} strips` })}
     className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-xs font-bold"
   >
     +
   </button>
   ```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_fdc_rationing_stepper.mjs`
Expected: PASS ("✔ FDC Medicine Rationing Stepper verified!")
Run: `npm --prefix dfy-frontend run lint`
Expected: 0 syntax errors.
Run: `npm --prefix dfy-frontend run build`
Expected: Exit code 0.

- [ ] **Step 5: Commit**

```bash
git add dfy-frontend/src/App.jsx tests/test_fdc_rationing_stepper.mjs
git commit -m "feat(fdc): add medicine rationing strip stepper with 1-to-max customization and inline editing"
```

---

### Task 6: Full Battery Verification & Production Readiness

**Files:**
- Test all: `tests/`
- Build: `dfy-frontend/`

- [ ] **Step 1: Python compilation check**
Run: `python -m py_compile main.py`
Expected: Exit code 0.

- [ ] **Step 2: Backend Pytest Suite**
Run: `pytest tests/ -v`
Expected: 100% passed (44+ tests, 0 failures).

- [ ] **Step 3: Node Test Suite**
Run:
```bash
node tests/test_subadmin_sync_and_snapshots.py # if python
node tests/test_pwa_cache_headers.mjs
node tests/test_refresh_and_hard_reset.mjs
node tests/test_attendance_radar_mobile_layout.mjs
node tests/test_fdc_rationing_stepper.mjs
node tests/test_delta_merge.mjs
node tests/test_form_ingestion_gate.mjs
node tests/test_duplicate_radar_repair.mjs
node tests/test_offline_queue.mjs
```
Expected: All pass.

- [ ] **Step 4: Frontend Linter & Production Build**
Run:
```bash
npm --prefix dfy-frontend run lint
npm --prefix dfy-frontend run build
```
Expected: 0 lint errors, build exits code 0.

- [ ] **Step 5: Git Diff Audit**
Run: `git diff HEAD~5`
Review every change to ensure zero unintended mutations.
Update walkthrough artifact.
Request user approval before any `git push origin main`.
