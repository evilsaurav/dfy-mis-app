# Duplicate Notification Prevention & Auto-Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-tier duplicate notification prevention and auto-repair system that strictly blocks duplicate patient TB notifications offline and online, provides confirmation modals for other clinical indicators, auto-prunes duplicates at backend ingestion without losing valid work, and provides a Sub-Admin RBAC-isolated 1-click repair tool in the Admin Dashboard.

**Architecture:** 
- Client-side: IndexedDB store (`district_notified_registry`) populated on login/online sync provides 0ms offline duplicate notification detection.
- Mobile Form UI: Strict Red Blocking Modal for `notification_ids`; Interactive Amber Confirmation Modal for other indicators.
- Backend Ingestion: `/submit-daily-report` cross-checks 90-day district notifications, auto-prunes duplicate notifications, safely persists other work (Visits, DBT, FDC), and increments rollups accurately.
- Admin Duplicate Radar: Scans cross-date duplicate notifications and offers a Sub-Admin-isolated 1-click repair endpoint (`/admin/repair-duplicate-notifications`) that cleans report arrays and decrements inflated rollups atomically.

**Tech Stack:** FastAPI, Google Cloud Firestore, React 19, Tailwind CSS v4, IndexedDB, Vite.

**Spec:** [`docs/superpowers/specs/2026-09-21-duplicate-notification-prevention-design.md`](file:///d:/ignou/Mis%20field%20report/docs/superpowers/specs/2026-09-21-duplicate-notification-prevention-design.md)

## Global Constraints
- Every write endpoint must strictly validate canonical district matching (`canonicalize_district`).
- Sub-Admin users must never access or modify data outside their permitted districts (`HTTP 403 Forbidden`).
- Every mutation must invalidate relevant cache keys (`dash_`, `shared_raw_month_`, `dupe_audit_`, `cascade_alerts_`).
- Rollup increments/decrements must use atomic operations (`firestore.Increment`).
- Zero tolerance for runtime crashes, blank screens, or TDZ reference errors.

---

### Task 1: Backend District Notification Registry API & Caching

**Files:**
- Modify: `main.py`
- Test: `tests/test_district_registry.py`

**Interfaces:**
- Produces: `GET /api/district-notification-registry?district={district}&months={months}`
- Response:
  ```json
  {
    "status": "success",
    "district": "Aurangabad",
    "total_count": 842,
    "registry": {
      "123456789": { "date": "2026-09-02", "fo_name": "Ramesh Kumar" }
    },
    "cached_at": "2026-09-21T14:30:00"
  }
  ```

- [ ] **Step 1: Write test script `tests/test_district_registry.py`**
```python
import asyncio
import pytest
from httpx import AsyncClient
from main import app

@pytest.mark.asyncio
async def test_district_notification_registry_endpoint():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.get("/api/district-notification-registry?district=Aurangabad&months=3")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert "registry" in data
        assert isinstance(data["registry"], dict)
        assert data["district"] == "Aurangabad"
```

- [ ] **Step 2: Run test to verify it fails**
Run: `python -m pytest tests/test_district_registry.py`
Expected: FAIL with 404 Not Found.

- [ ] **Step 3: Implement `GET /api/district-notification-registry` in `main.py`**
```python
@app.get("/api/district-notification-registry")
async def get_district_notification_registry(district: str, months: int = 3):
    try:
        clean_dist = canonicalize_district(district.strip())
        if not clean_dist:
            raise HTTPException(status_code=400, detail="Valid district is required.")
        
        now = get_ist_now()
        cur_month_str = now.strftime("%Y-%m")
        cache_key = f"dist_notif_registry_{clean_dist}_{cur_month_str}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        # Calculate start date (months ago)
        start_date = (now - timedelta(days=max(30, months * 30))).strftime("%Y-%m-01")
        end_date = now.strftime("%Y-%m-%d")

        docs = await asyncio.to_thread(lambda: list(
            db.collection("daily_field_reports")
            .where("date_of_reporting", ">=", start_date)
            .where("date_of_reporting", "<=", end_date)
            .stream()
        ))

        registry = {}
        for doc in docs:
            d = doc.to_dict()
            doc_dist = canonicalize_district(d.get("working_place", ""))
            if doc_dist.lower() != clean_dist.lower():
                continue
            dt = d.get("date_of_reporting", "")
            fo = d.get("fo_name", "")
            notifs = d.get("notification_ids", []) or []
            for nid in notifs:
                clean_nid = str(nid).strip()
                if clean_nid and len(clean_nid) >= 5:
                    if clean_nid not in registry or dt < registry[clean_nid]["date"]:
                        registry[clean_nid] = {
                            "date": dt,
                            "fo_name": fo
                        }

        result = {
            "status": "success",
            "district": clean_dist,
            "total_count": len(registry),
            "registry": registry,
            "cached_at": now.isoformat()
        }
        cache.set(cache_key, result, ttl=7200) # 2 hours cache
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

- [ ] **Step 4: Run test to verify it passes**
Run: `python -m pytest tests/test_district_registry.py`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add tests/test_district_registry.py main.py
git commit -m "feat(api): add district notification registry endpoint with 90-day lookup and caching"
```

---

### Task 2: Backend Ingestion Defense Gate in `/submit-daily-report`

**Files:**
- Modify: `main.py:759-905`
- Test: `tests/test_ingestion_defense.py`

**Interfaces:**
- Consumes: `report.notification_ids`
- Produces: Auto-pruning of duplicate notification IDs, non-inflated rollup increments, and `{ pruned_duplicate_notifications: [...], pruned_count: N }`.

- [ ] **Step 1: Write test script `tests/test_ingestion_defense.py`**
Test that `/submit-daily-report` auto-prunes an ID that was previously submitted in that district on an earlier date, while saving other indicators.

- [ ] **Step 2: Run test to verify it fails**
Run: `python -m pytest tests/test_ingestion_defense.py`

- [ ] **Step 3: Implement Ingestion Gate in `/submit-daily-report`**
In `main.py`:
1. Before computing `delta_counts`, query existing notification IDs for the district in the current and previous 2 months (excluding the document being edited if today's report already exists).
2. Filter incoming `report.notification_ids`:
   - `pruned_duplicates = [pid for pid in (report.notification_ids or []) if pid in existing_notified_pids]`
   - `valid_new_notifs = [pid for pid in (report.notification_ids or []) if pid not in existing_notified_pids]`
3. Set `payload["notification_ids"] = valid_new_notifs`.
4. Calculate `delta_counts["notifications"] = len(set(valid_new_notifs) - old_notifs)`.
5. Return `{ "message": "Daily report submitted successfully", "pruned_duplicate_notifications": pruned_duplicates, "pruned_count": len(pruned_duplicates) }`.
6. Also add duplicate notification validation checks in `/admin/feed-officer-data` and `/api/reports/edit-id`.

- [ ] **Step 4: Run test to verify it passes**
Run: `python -m pytest tests/test_ingestion_defense.py`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add tests/test_ingestion_defense.py main.py
git commit -m "feat(ingestion): add server-side duplicate notification auto-pruning and rollup protection"
```

---

### Task 3: Backend Admin Duplicate Notification Scan & Auto-Repair Endpoints with Strict Sub-Admin RBAC

**Files:**
- Modify: `main.py`
- Test: `tests/test_repair_duplicate_notifications.py`

**Interfaces:**
- Produces: `GET /admin/scan-duplicate-notifications?month=YYYY-MM`
- Produces: `POST /admin/repair-duplicate-notifications`
- Enforces: Sub-Admin cross-district isolation (`HTTP 403 Forbidden`).

- [ ] **Step 1: Write test script `tests/test_repair_duplicate_notifications.py`**
Test:
1. Scan identifies a repeat instance where an FO reported an ID on 01 Sep and re-reported on 06 Sep.
2. Sub-Admin without district access gets 403 Forbidden.
3. Repair endpoint removes duplicate IDs from the 06 Sep report, decrements the rollup atomically by `-N`, and logs to `admin_audit_logs`.

- [ ] **Step 2: Run test to verify it fails**
Run: `python -m pytest tests/test_repair_duplicate_notifications.py`

- [ ] **Step 3: Implement Scan and Repair endpoints in `main.py`**
```python
@app.get("/admin/scan-duplicate-notifications")
async def scan_duplicate_notifications(month: str, admin: dict = Depends(get_current_admin)):
    ...
```
```python
@app.post("/admin/repair-duplicate-notifications")
async def repair_duplicate_notifications(req: RepairDuplicateRequest, admin: dict = Depends(get_current_admin)):
    ...
```
Strict Sub-Admin RBAC:
```python
admin_role = admin.get("role", "SUB_ADMIN")
allowed_districts = admin.get("allowed_districts", [])
allowed_c = [canonicalize_district(d).lower() for d in allowed_districts]
if admin_role == "SUB_ADMIN":
    if "All" not in allowed_districts and target_dist_c not in allowed_c:
        raise HTTPException(status_code=403, detail="Permission Denied: Cannot modify data in this district.")
```

- [ ] **Step 4: Run test to verify it passes**
Run: `python -m pytest tests/test_repair_duplicate_notifications.py`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add tests/test_repair_duplicate_notifications.py main.py
git commit -m "feat(admin): add duplicate notification scan and RBAC-guarded 1-click repair endpoints"
```

---

### Task 4: Frontend Offline Registry Storage in IndexedDB

**Files:**
- Modify: `dfy-frontend/src/offlineQueue.js`

**Interfaces:**
- Produces:
  - `saveDistrictRegistry(district, registryData)`
  - `getDistrictRegistry(district)`
  - `isPatientIdNotified(district, patientId)` -> `{ notified: boolean, date?: string, fo_name?: string }`
  - Update `syncAllOfflineReports` to process server notice for pruned notifications.

- [ ] **Step 1: Add `district_notified_registry` store in `openOfflineDB()`**
Increment DB_VERSION from 1 to 2 with `onupgradeneeded` handler adding store if missing.

- [ ] **Step 2: Implement storage and lookup methods in `offlineQueue.js`**

- [ ] **Step 3: Update `syncAllOfflineReports` to capture server pruned notifications**

- [ ] **Step 4: Verify with `npm run build` in `dfy-frontend/`**

- [ ] **Step 5: Commit**
```bash
git add dfy-frontend/src/offlineQueue.js
git commit -m "feat(offline): add district notified registry storage in IndexedDB"
```

---

### Task 5: Frontend Mobile UI Modals & Form Ingestion Gate

**Files:**
- Modify: `dfy-frontend/src/App.jsx`

**Interfaces:**
- Produces:
  - `DuplicateNotificationBlockModal`: Strict Red Blocking Modal for `notification_ids`.
  - `RepeatInterventionConfirmModal`: Amber Confirmation Modal for other indicators.
  - Background registry sync on login & reconnect.
  - WhatsApp multi-ID paste filter for notifications.

- [ ] **Step 1: Add Registry Sync hook in `App.jsx`**
When `isLoggedIn && formData.working_place`:
Fetch `/api/district-notification-registry?district={formData.working_place}&months=3` and persist in IndexedDB.

- [ ] **Step 2: Create `DuplicateNotificationBlockModal` component**
Render modal when an entered ID matches `isPatientIdNotified`.

- [ ] **Step 3: Create `RepeatInterventionConfirmModal` component**
Render modal when an entered ID matches a previous entry in the same category.

- [ ] **Step 4: Wire input handlers (`handleDirectAddId` and batch paste)**
- For `field === 'notification_ids'`: Check registry. If duplicate, trigger Red Modal and block addition.
- For other fields: Check category repeat. If repeat, trigger Amber Modal.
- Update bulk paste logic to filter duplicate notifications and display summary.

- [ ] **Step 5: Verify with `npm run lint` and `npm run build`**

- [ ] **Step 6: Commit**
```bash
git add dfy-frontend/src/App.jsx
git commit -m "feat(mobile-ui): add strict duplicate notification blocking modal and repeat intervention confirmation"
```

---

### Task 6: Frontend Admin Dashboard 1-Click Repair Suite in Duplicate Radar

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx`

**Interfaces:**
- Produces:
  - Tab 3 inside Duplicate Radar Modal: `🚨 Notification Inflation & 1-Click Fix`.
  - Preview table of duplicate notification instances.
  - `[ 🧹 Clean Duplicate IDs & Correct Rollups ]` button with loading state.
  - Auto-refresh of dashboard data upon repair.

- [ ] **Step 1: Add tab state and fetch scan endpoint**
Add `duplicateRadarTab === 'repair'` and `fetchDuplicateNotificationScan()`.

- [ ] **Step 2: Render preview table**
Render district, officer name, repeat date, duplicate count, and affected rollups.

- [ ] **Step 3: Wire `[ 🧹 Clean Duplicate IDs & Correct Rollups ]` button**
Call `/admin/repair-duplicate-notifications` with anti-double-tap loading state.
On success: Show detailed toast and re-fetch dashboard data.

- [ ] **Step 4: Verify with `npm run lint` and `npm run build`**

- [ ] **Step 5: Commit**
```bash
git add dfy-frontend/src/AdminDashboard.jsx
git commit -m "feat(admin-dashboard): add notification inflation scan and 1-click repair tab in duplicate radar"
```

---

### Task 7: Version Bump to v2.7.4 & Full Verification Battery

**Files:**
- Modify: `dfy-frontend/src/changelogData.js`

- [ ] **Step 1: Bump `APP_VERSION` to `2.7.4` in `changelogData.js`**
Add comprehensive release notes for Duplicate Notification Prevention & 1-Click Auto-Repair Suite.

- [ ] **Step 2: Run Full Verification Battery**
1. `python -m py_compile main.py` (Exit code 0).
2. Run backend pytest suite.
3. `npm run lint` in `dfy-frontend/` (0 errors).
4. `npm run build` in `dfy-frontend/` (Exit code 0).
5. TDZ & lexical scope check in `AdminDashboard.jsx` and `App.jsx`.
6. Audit git diff line-by-line.

- [ ] **Step 3: Commit**
```bash
git add dfy-frontend/src/changelogData.js
git commit -m "chore(release): bump to v2.7.4 for duplicate notification prevention and auto-repair suite"
```
