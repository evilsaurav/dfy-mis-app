# Technical Design: Sub-Admin Sync Integrity, Mobile Radar Ergonomics, PWA Cache Invalidation, and FDC Medicine Rationing

- **Author**: Antigravity & Senior Production Engineering
- **Date**: 2026-09-23
- **Status**: Approved (Brainstorming Complete)
- **Target Branch**: `main`

---

## 1. Executive Summary

The DFY MIS App is a live production platform actively used by state coordinators, sub-admins, and field officers across 38 districts in Bihar for TB monitoring. 

Recent field feedback and telemetry identified five operational challenges:
1. **Sub-Admin Dashboard Data Inaccuracy & Stale Cache Lock**: Sub-Admins see incomplete or stale data. Refreshing or hard refreshing on mobile serves stale local cache or fails to show new submissions due to strict Firestore field filtering and disk cache overwrites.
2. **Sub-Admins Stuck on Outdated App Version (v2.7.6 vs v2.8.0)**: PWA Service Worker and browser cache aggressively persist old compiled JavaScript bundles on sub-admin mobile devices because `vercel.json` lacked explicit `no-cache` headers for `/sw.js` and `/index.html`.
3. **"This Site Can't Be Reached" & Cold Start Dropouts**: Render backend cold starts (30–50s spin-up) and corrupted service worker precache interceptors cause network error screens rather than resilient retry states.
4. **Attendance Radar Mobile Viewport Clipping**: On mobile devices, opening the "Not Submitted / Pending" list in the Attendance Radar causes the list to get pushed below the screen fold and clipped because modal headers (~380px) and fixed centering (`my-auto`) leave insufficient vertical space.
5. **FDC Medicine Rationing (Stock Shortages)**: While NTEP guidelines compute standard recommended strips (e.g. 6 or 12 strips), field clinics in rural Bihar frequently experience medicine stock shortages. Staff must distribute whatever stock is on hand (e.g., 1–4 strips) rather than being forced into an uneditable guideline number.

This design document establishes the architectural changes to resolve all five issues with zero regression.

---

## 2. Component Architecture & Deep Technical Design

```
+-----------------------------------------------------------------------------------+
|                                  DFY MIS SYSTEM                                   |
+-----------------------------------------------------------------------------------+
                                          |
        +---------------------------------+---------------------------------+
        |                                                                   |
        v                                                                   v
+-------------------------------+                         +----------------------------------+
|      BACKEND (FastAPI)        |                         |       FRONTEND (Vite / PWA)      |
+-------------------------------+                         +----------------------------------+
| 1. get_raw_monthly_reports:   |                         | 1. fetchData(forceRefresh=true): |
|    - Statewide date scan      |                         |    - Always live on user click   |
|    - In-memory canonical dist |                         |    - Bypasses stale local cache  |
| 2. Protected disk snapshots:  |                         | 2. PWA Auto-Update & SW:         |
|    - No subadmin overwriting  |                         |    - vercel.json no-cache hdrs   |
|    - Partitioned/Statewide    |                         |    - 1-tap "Hard Update" button  |
| 3. /api/app-version endpoint  |                         | 3. Attendance Radar Mobile:      |
|    - Serves current build     |                         |    - h-[92vh], min-h-[320px]     |
| 4. FDC Payload Support:       |                         |    - Outer overlay overflow-y    |
|    - Accepts 1..max strips    |                         | 4. FDC Rationing Stepper:        |
|    - Preserves supply_issued  |                         |    - 1 to max calculated strips  |
+-------------------------------+                         +----------------------------------+
```

---

### Component 1: Sub-Admin Data & Cache Accuracy

#### Root Cause Analysis
1. In `main.py:685–695`, sub-admin queries performed:
   ```python
   db.collection("daily_field_reports")
     .where("working_place", "==", d_name)
     .where("date_of_reporting", ">=", start_date)
     .where("date_of_reporting", "<=", end_date)
   ```
   - **Exact Match Failure**: Firestore exact equality (`==`) misses records where `working_place` has slight spelling or canonical variations (e.g. `"East Champaran"` vs `"Purbi Champaran"`, trailing spaces).
   - **Index Failure**: Firestore requires a composite index on `(working_place, date_of_reporting)`. When missing, queries throw `FailedPrecondition` and fall back to disk cache.
2. In `main.py:904–907`:
   When a sub-admin loaded their single district, lines 905–906 saved those 50 records into `cache/dash_{month}.json`, obliterating the statewide snapshot for all other 37 districts!
3. In `AdminDashboard.jsx:2655–2679`:
   The dashboard sent `since: cachedData.synced_at`. The backend returned `NO_CHANGE`. On mobile phones with no `Shift` key, the Refresh button could only invoke `fetchData(false)`, permanently trapping sub-admins in stale `localStorage`.

#### Implementation Specification
1. **Bulletproof Monthly Querying (`main.py`)**:
   - `get_raw_monthly_reports(month_prefix, force=False, district_filter=None)`:
     - Query Firestore by date range (`date_of_reporting >= {month_prefix}-01` and `<= {month_prefix}-31`).
     - Bihar generates ~2,000 monthly reports across all 38 districts. Date-range streaming executes in < 300ms.
     - Apply `canonicalize_district(d.get("working_place") or d.get("district"))` in Python memory.
     - **Result**: Zero dropped reports, immune to Firestore string variation, zero composite index failure risk.
2. **Safe Disk Snapshot Handling (`main.py`)**:
   - `cache/dash_{month}.json` MUST ONLY be written if `allowed_dist_set` is `None` (Statewide Super Admin). Sub-Admin responses must NEVER overwrite this global snapshot.
3. **Guaranteed Live Refresh on Mobile & Desktop (`AdminDashboard.jsx`)**:
   - The "Refresh" button click handler MUST call `fetchData(true)` and `fetchAttendance(true)`.
   - Normal clicks force a fresh database read (`force_refresh: true`), clearing local `localStorage` keys.
   - Background silent polling (every 45s) retains silent delta sync, but user-initiated Refresh is guaranteed live truth.

---

### Component 2: PWA Auto-Update & Sub-Admin Version Upgrade (v2.7.6 ➔ v2.8.0)

#### Root Cause Analysis
1. `vercel.json` lacked explicit `Cache-Control` response headers. Vercel and mobile browsers cached `sw.js` and `index.html` aggressively.
2. When new app builds deployed, mobile devices did not re-fetch `sw.js` and continued booting old JavaScript bundles stored in the browser's CacheStorage (`v2.7.6`).

#### Implementation Specification
1. **Vercel Cache-Control Headers (`dfy-frontend/vercel.json`)**:
   Configure strict `no-cache, no-store, must-revalidate` for `/sw.js` and `/index.html`:
   ```json
   {
     "rewrites": [
       { "source": "/(.*)", "destination": "/index.html" }
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
2. **1-Tap Emergency App Reset & Cache Purge (`AdminDashboard.jsx` & `App.jsx`)**:
   - Add a high-visibility button in the UI: **"🔄 Force Update / Clear Cache"**.
   - Handler action:
     ```javascript
     const handleHardAppReset = async () => {
       try {
         // 1. Unregister all service workers
         if ('serviceWorker' in navigator) {
           const registrations = await navigator.serviceWorker.getRegistrations();
           for (let reg of registrations) await reg.unregister();
         }
         // 2. Delete all CacheStorage caches
         if ('caches' in window) {
           const keys = await caches.keys();
           for (let key of keys) await caches.delete(key);
         }
         // 3. Clear dashboard and draft storage
         localStorage.clear();
         sessionStorage.clear();
         // 4. Force hard reload bypassing cache
         window.location.reload(true);
       } catch (e) {
         window.location.reload();
       }
     };
     ```
3. **Automated Version Alignment Ping**:
   - Create lightweight backend endpoint `GET /api/system-version` returning `{ "version": "2.8.0" }`.
   - On load, if client `APP_VERSION !== data.version`, trigger an automatic banner notifying user that a fresh build is activating.

---

### Component 3: "This Site Can't Be Reached" & Cold Start Shield

#### Implementation Specification
1. **Cold Start Grace Banner**:
   - In `AdminDashboard.jsx` and `App.jsx`, when an API fetch takes > 5 seconds, display a polite, reassuring banner:
     *"⚡ Server se connect ho raha hai (Render wake-up: 10-25s)... Kripya intezar karein."*
2. **Service Worker Navigation Resilience**:
   - In `sw.js` Workbox configuration (`vite.config.js`), ensure navigation fallback gracefully drops through to network if cached chunks are missing, rather than throwing an unhandled navigation abort error.

---

### Component 4: Attendance Radar Mobile Screen Layout Fix

#### Root Cause Analysis
- `AdminDashboard.jsx:9812–9813`: The modal used `fixed inset-0 flex items-center justify-center p-3`.
- Internal fixed header elements: Title, date bar, district pills, WhatsApp banner, 4 category tabs, and search bar occupied ~380px.
- On typical mobile phone screens (667px–844px high), with `my-auto` and no outer scroll, the list container was pushed below the viewport and clipped, making it impossible to scroll down to pending officers or tap "Mark Leave".

#### Implementation Specification
1. **Modal Container Hierarchy**:
   - Outer overlay: `fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto`.
   - Modal box: `w-full max-w-4xl bg-white rounded-2xl sm:rounded-3xl p-3 sm:p-6 shadow-2xl flex flex-col h-[94vh] sm:h-auto sm:max-h-[90vh] my-auto`.
2. **Compact Mobile Header Controls**:
   - Reduce vertical margins (`mb-1.5 sm:mb-2.5`).
   - Group Date Selector and quick navigation into a compact single-line toolbar on mobile.
   - District rollup pills: Single-row horizontal scroll (`overflow-x-auto pb-1`).
3. **Protected List Viewport**:
   - List container: `flex-1 min-h-[300px] overflow-y-auto pr-1 space-y-2 custom-scrollbar`.
   - Cards on mobile: Compact padding (`p-2.5 sm:p-3`), flexible action buttons that wrap cleanly without overflowing.

---

### Component 5: FDC Medicine Rationing: Custom Strip Count (1 to Max Recommended)

#### Context & Requirements
- **Guideline Calculation Preserved**: NTEP Adult & Pediatric algorithms in `utils/fdcCalculator.js` remain identical. They determine the standard recommended course (e.g. 6 strips for Adult 35–49 kg IP, 12 strips for CP).
- **Rationing Flexibility**: Rural field staff must be able to distribute a smaller quantity when stock is insufficient.
- **Rules**:
  - Minimum strips: **1**.
  - Maximum strips: **Calculated recommended strips** (or up to 12 if adult/pediatric regimen allows).
  - Default: **Calculated recommended strips** (full stock).
  - Stepper controls (`-` `[Count]` `+`) and direct numeric selection.
  - In-list quick stepper to modify strip counts on already added cards.
  - `supply_issued` text reflects the actual distributed quantity: e.g. `"${strips} strips (Stock Rationed)"` or `"${strips} strips"`.

#### Implementation Specification (`dfy-frontend/src/App.jsx`)
1. In `FdcBucket`:
   - Introduce state: `const [customStrips, setCustomStrips] = useState(null)`.
   - When `dosage` updates, if `customStrips` is null or exceeds `maxRecommended`, default `customStrips = dosage.strips`.
   - Stepper UI rendered in the calculation card:
     ```jsx
     <div className="flex items-center justify-between p-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
       <div>
         <span className="text-[10px] font-black uppercase text-emerald-800 block">Strips Provided (Stock):</span>
         <span className="text-[10px] text-slate-500 font-semibold">Min: 1 | Recommended: {dosage.strips}</span>
       </div>
       <div className="flex items-center gap-2">
         <button type="button" onClick={() => setCustomStrips(prev => Math.max(1, (prev || dosage.strips) - 1))} className="...">➖</button>
         <span className="font-mono font-black text-sm text-emerald-950 px-2">{customStrips || dosage.strips}</span>
         <button type="button" onClick={() => setCustomStrips(prev => Math.min(dosage.strips || 12, (prev || dosage.strips) + 1))} className="...">➕</button>
       </div>
     </div>
     ```
2. When saving entry in `handleAddSmart`:
   - `strips: customStrips || dosage.strips`
   - `supply_issued: `${actualStrips} strips (${actualStrips < dosage.strips ? 'Stock Rationed' : 'Full Supply'})``
3. In Added Entries list:
   - Provide inline `+` / `-` buttons on each card to increment or decrement strips directly without deleting and re-entering.

---

## 3. Security, RBAC & Data Integrity Analysis

1. **Sub-Admin Isolation**:
   - `main.py` continues to enforce `admin.get("role") == "SUB_ADMIN"` and `user_allowed` canonical district sets.
   - Any report whose `canonicalize_district(working_place)` does not match the Sub-Admin's permitted districts is filtered out before formatting and serialization.
2. **Disk Cache Cross-District Pollution Guard**:
   - `cache/dash_{month}.json` is guarded with `if not allowed_dist_set: json.dump(...)`.
   - Sub-Admin requests NEVER touch this file.
3. **Data Loss Prevention**:
   - Statewide date scan guarantees all reports submitted by FOs are retrieved regardless of district casing or string variations in Firestore.
4. **Offline Queue Integrity**:
   - Offline sync and IndexedDB schemas are untouched and retain backwards compatibility.

---

## 4. Verification Plan & Test Strategy

### Automated Verification
1. **Backend Python Compilation**:
   `python -m py_compile main.py` (Must exit code 0).
2. **Backend Automated Tests**:
   - Run `pytest tests/ -v` (Must pass 42/42 tests).
   - Add new test in `tests/test_subadmin_sync_and_snapshots.py` verifying:
     - Sub-Admin query does NOT overwrite statewide `dash_{month}.json`.
     - Sub-Admin query returns all reports with district name variants (e.g. "East Champaran" vs "Purbi Champaran").
     - Force refresh purges relevant caches.
3. **Frontend Production Build**:
   `npm --prefix dfy-frontend run build` (Must exit code 0).
4. **Frontend Lint**:
   `npm --prefix dfy-frontend run lint` (Must have 0 syntax errors).
5. **Node Test Suite**:
   `node tests/test_delta_merge.mjs; node tests/test_form_ingestion_gate.mjs; node tests/test_duplicate_radar_repair.mjs; node tests/test_offline_queue.mjs`

### Manual & Ergonomics Verification
1. Open Admin Dashboard on simulated mobile screen (375x667, 390x844). Verify Attendance Radar modal fits within viewport, list has ample height, and "Mark Leave" is easily clickable.
2. In FO reporting form, select Adult 35–49 kg IP (calculates 6 strips). Tap `-` to decrease to 3 strips. Verify 3 strips is added and submitted correctly.
3. Verify Vercel headers in `vercel.json` are syntactically valid and apply `no-cache` to `/sw.js` and `/index.html`.
4. Verify the 1-tap "Force Update / Clear Cache" button executes cleanly without throwing exceptions.
