# Firestore Read Reduction & Lazy Tab Delta Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce daily billable Firestore document reads from ~673,000 to <20,000 reads/day (100% Free Tier, ₹0.00 bill) by converting features to derive from an in-memory master ledger and loading dashboard tabs on demand with real-time delta sync (+1, +3, +20).

**Architecture:** A unified server-side in-memory ledger (`shared_raw_month_{YYYY-MM}`) backed by L2 persistent disk snapshots serves Attendance Radar, FO Profile Stats, and KPI workbooks with zero Firestore collection scans. The frontend eliminates eager initial waterfall requests in favor of on-demand tab loading, strict lexical TDZ safety, and deletion-aware delta sync.

**Tech Stack:** FastAPI (Python 3.14), Google Cloud Firestore, React 19, Vite, Tailwind CSS, openpyxl.

**Spec:** [`docs/superpowers/specs/2026-09-30-firestore-read-reduction-and-lazy-tab-engine-design.md`](file:///d:/ignou/Mis%20field%20report/docs/superpowers/specs/2026-09-30-firestore-read-reduction-and-lazy-tab-engine-design.md)

## Global Constraints
- Production environment: Live in Bihar for TB monitoring. Zero downtime, zero white screens, zero data loss.
- Strict Zero-Push Rule: Commit locally only. Do NOT run `git push origin main` until explicit user approval is granted.
- Temporal Dead Zone (TDZ) Rule: Base state declarations first, then derived collections (`useMemo`), then handlers (`useCallback`), then lazy tab `useEffect` hooks. Never reference a variable before its declaration.
- Confidential Stealth Cutoff: 10:00 AM next-day morning reporting deadline logic remains 100% confidential. Zero mention or leak in user-facing code or UI.
- Sub-Admin District RBAC: Sub-Admin users must never access, view, or modify data outside their permitted districts.
- Compilation & Test Gates: `python -m py_compile main.py` exit code 0; `npm run build` exit code 0; `npm run lint` 0 syntax errors; all pytest test suites 100% passing.

---

### Task 1: Backend Master Ledger Derivation for Attendance Radar & Scoped User RBAC

**Files:**
- Modify: `main.py:3568-3968` (`get_today_attendance`)
- Test: `tests/test_attendance_master_ledger_derivation.py`

**Interfaces:**
- Consumes: `get_raw_monthly_reports(month_prefix)` from `main.py:910`, `get_cached_staff_directory_raw()` from `main.py:539`, and `get_reporting_cutoff_hour()`.
- Produces: `get_today_attendance` with 0 Firestore reads for reports, month boundary transition handling, and user-scoped cache key (`attendance_{target_date}_{effective_dist}_{user_scope}`).

- [ ] **Step 1: Write the failing test**
Create `tests/test_attendance_master_ledger_derivation.py` asserting:
1. `get_today_attendance` derives records from in-memory reports without querying `db.collection("daily_field_reports").stream()`.
2. Month transition guard correctly pulls previous month's reports when `target_date` is Day 1 or Day 2 of the month.
3. Sub-admin cache keys are isolated by user scope (`super` vs `sub_{user_id}`) to prevent cache collision.

```python
import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from main import app, cache, get_today_attendance

@pytest.mark.asyncio
async def test_today_attendance_uses_master_ledger_zero_firestore_stream():
    cache.clear()
    target_date = "2026-09-15"
    admin_user = {"role": "SUPER_ADMIN", "username": "admin", "allowed_districts": ["All"]}

    mock_raw_reports = [
        {
            "id": "patna_fo1_2026-09-15",
            "working_place": "Patna",
            "fo_name": "Ramesh Kumar",
            "date_of_reporting": "2026-09-15",
            "notification_ids": ["101", "102"],
            "timestamp_completed": "2026-09-15T18:30:00",
            "is_next_day_submission": False
        }
    ]

    with patch("main.get_raw_monthly_reports", new_callable=AsyncMock) as mock_get_raw, \
         patch("main.get_cached_staff_directory_raw", new_callable=AsyncMock) as mock_staff, \
         patch("main.db") as mock_db:

        mock_get_raw.return_value = mock_raw_reports
        mock_staff.return_value = [{"district": "Patna", "name": "Ramesh Kumar", "is_active": True}]
        # Ensure db.collection("daily_field_reports").stream is NEVER called
        mock_db.collection.return_value.where.return_value.stream.side_effect = AssertionError("Firestore stream should not be called!")

        res = await get_today_attendance(date=target_date, districts="Patna", admin=admin_user)
        assert res["date"] == target_date
        assert res["submitted_count"] == 1
        assert res["submitted_fos"][0]["fo_name"] == "Ramesh Kumar"
        assert mock_get_raw.called

@pytest.mark.asyncio
async def test_today_attendance_month_transition_boundary():
    cache.clear()
    target_date = "2026-10-01"
    admin_user = {"role": "SUPER_ADMIN", "username": "admin", "allowed_districts": ["All"]}

    # Report submitted on 2026-10-01 at 08:30 AM before cutoff for 2026-09-30
    sep_report = {
        "id": "gaya_fo2_2026-09-30",
        "working_place": "Gaya",
        "fo_name": "Suresh Singh",
        "date_of_reporting": "2026-09-30",
        "timestamp_completed": "2026-10-01T08:30:00",
        "is_next_day_submission": True
    }

    with patch("main.get_raw_monthly_reports", new_callable=AsyncMock) as mock_get_raw, \
         patch("main.get_cached_staff_directory_raw", new_callable=AsyncMock) as mock_staff:

        async def fake_raw(month, **kwargs):
            if month == "2026-09":
                return [sep_report]
            return []

        mock_get_raw.side_effect = fake_raw
        mock_staff.return_value = [{"district": "Gaya", "name": "Suresh Singh", "is_active": True}]

        res = await get_today_attendance(date="2026-09-30", districts="Gaya", admin=admin_user)
        # Should detect the 2026-10-01 morning submission for 2026-09-30
        assert mock_get_raw.call_count >= 1

@pytest.mark.asyncio
async def test_today_attendance_subadmin_cache_isolation():
    cache.clear()
    target_date = "2026-09-20"
    super_admin = {"role": "SUPER_ADMIN", "username": "super", "user_id": "super_1"}
    sub_admin = {"role": "SUB_ADMIN", "username": "sub_patna", "user_id": "sub_1", "allowed_districts": ["Patna"]}

    with patch("main.get_raw_monthly_reports", new_callable=AsyncMock) as mock_get_raw, \
         patch("main.get_cached_staff_directory_raw", new_callable=AsyncMock) as mock_staff:

        mock_get_raw.return_value = []
        mock_staff.return_value = [{"district": "Patna", "name": "Test Officer", "is_active": True}]

        await get_today_attendance(date=target_date, districts="Patna", admin=super_admin)
        await get_today_attendance(date=target_date, districts="Patna", admin=sub_admin)

        # Check distinct cache keys
        super_key = f"attendance_{target_date}_patna_super"
        sub_key = f"attendance_{target_date}_patna_sub_sub_1"
        assert cache.get(super_key) is not None
        assert cache.get(sub_key) is not None
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pytest tests/test_attendance_master_ledger_derivation.py -v`  
Expected: FAIL (because `get_today_attendance` currently calls `db.collection("daily_field_reports").stream()`).

- [ ] **Step 3: Implement master ledger attendance derivation in `main.py`**
In `main.py:3568-3968`:
1. Bind user scope to cache key:
   ```python
   user_scope = "super" if admin_role == "SUPER_ADMIN" else f"sub_{admin.get('user_id') or admin.get('username')}"
   cache_key = f"attendance_{target_date}_{effective_dist}_{user_scope}"
   ```
2. Replace lines 3740-3767 with master ledger derivation:
   ```python
   target_month = target_date[:7]
   raw_docs = list(await get_raw_monthly_reports(target_month, district_filter=allowed_dist_set))

   # Month transition handling (Loophole 2 fix)
   try:
       target_dt = datetime.strptime(target_date, "%Y-%m-%d").date()
       prev_month_str = (target_dt.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
       next_month_str = (target_dt.replace(day=28) + timedelta(days=4)).strftime("%Y-%m")
       if target_dt.day <= 2:
           prev_docs = await get_raw_monthly_reports(prev_month_str, district_filter=allowed_dist_set)
           if prev_docs:
               raw_docs.extend(prev_docs)
       elif target_dt.day >= 28:
           next_docs = await get_raw_monthly_reports(next_month_str, district_filter=allowed_dist_set)
           if next_docs:
               raw_docs.extend(next_docs)
   except Exception as dt_err:
       print(f"Notice: month transition parsing: {dt_err}")
   ```
3. Filter `candidate_docs` in memory:
   - Match `date_of_reporting == target_date` or `date_of_reporting == next_date`.
   - Apply existing stealth cutoff rules.
4. Set cache TTL to 600s (`ttl=600`).

- [ ] **Step 4: Run test to verify it passes**
Run: `pytest tests/test_attendance_master_ledger_derivation.py -v`  
Expected: PASS 100%.

- [ ] **Step 5: Commit changes locally**
```bash
git add main.py tests/test_attendance_master_ledger_derivation.py
git commit -m "feat(attendance): derive attendance radar from in-memory master ledger with month boundary and rbac guards"
```

---

### Task 2: Backend Zero-Read Profile Stats, Scoped Eviction & Registry Cold-Warmup

**Files:**
- Modify: `main.py:3213-3560` (`my_profile_stats`), `main.py:1815-1857` (`fetch_district_notification_registry`), `main.py:1925-2140` (`submit_daily_report`)
- Test: `tests/test_profile_and_registry_read_reduction.py`

**Interfaces:**
- Consumes: `get_raw_monthly_reports(req_month)` and `get_cached_staff_directory_raw()`.
- Produces: `my_profile_stats` with 0 Firestore reads and 1800s TTL; `submit_daily_report` with single-officer profile eviction and in-place registry append with cold warmup fallback.

- [ ] **Step 1: Write the failing test**
Create `tests/test_profile_and_registry_read_reduction.py` asserting:
1. `my_profile_stats` uses in-memory reports and directory; never calls `db.collection("daily_field_reports").stream()` or `staff_directory.document().get()`.
2. `submit_daily_report` invalidates only the submitting officer's profile key (`profile_{wp}_{fo}_{month}`) without purging other officers' keys.
3. Submitting when registry cache is `None` (empty cache trap) triggers warmup fallback before appending.

```python
import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from main import app, cache, my_profile_stats, submit_daily_report, ProfileStatsRequest, DailyReportSubmission

@pytest.mark.asyncio
async def test_my_profile_stats_zero_firestore_reads():
    cache.clear()
    req = ProfileStatsRequest(working_place="Patna", fo_name="Amit Kumar", pin="1234", month="2026-09")

    mock_reports = [
        {
            "id": "patna_amitkumar_2026-09-10",
            "working_place": "Patna",
            "fo_name": "Amit Kumar",
            "date_of_reporting": "2026-09-10",
            "notification_ids": ["N1", "N2", "N3"],
            "total_km": 25,
            "submission_count": 1
        }
    ]

    with patch("main.get_raw_monthly_reports", new_callable=AsyncMock) as mock_raw, \
         patch("main.get_cached_staff_directory_raw", new_callable=AsyncMock) as mock_staff, \
         patch("main.get_cached_staff_targets_for_month", new_callable=AsyncMock) as mock_targets, \
         patch("main.db") as mock_db:

        mock_raw.return_value = mock_reports
        mock_staff.return_value = [{"district": "Patna", "name": "Amit Kumar", "pin": "1234", "is_active": True}]
        mock_targets.return_value = [{"district": "Patna", "fo_name": "Amit Kumar", "target": 60, "month": "2026-09"}]
        mock_db.collection.return_value.document.return_value.get.side_effect = AssertionError("Firestore .get should not be called!")

        res = await my_profile_stats(req)
        assert res["success"] is True
        assert res["target"] == 60
        assert res["breakdown"]["notification"] == 3
        assert res["total_km"] == 25
        assert mock_raw.called

@pytest.mark.asyncio
async def test_submit_report_scoped_profile_eviction_only():
    cache.clear()
    cache.set("profile_patna_amit_kumar_2026-09", {"stats": "cached_amit"})
    cache.set("profile_patna_rohit_kumar_2026-09", {"stats": "cached_rohit"})

    sub = DailyReportSubmission(
        working_place="Patna",
        fo_name="Amit Kumar",
        pin=1234,
        date_of_reporting="2026-09-15",
        notification_ids=["10001"]
    )

    with patch("main.db") as mock_db:
        mock_doc = MagicMock()
        mock_doc.exists = False
        mock_db.collection.return_value.document.return_value.get.return_value = mock_doc
        mock_db.collection.return_value.document.return_value.set.return_value = None

        await submit_daily_report(sub)

        # Amit's cache should be evicted
        assert cache.get("profile_patna_amit_kumar_2026-09") is None
        # Rohit's cache MUST be preserved!
        assert cache.get("profile_patna_rohit_kumar_2026-09") is not None

@pytest.mark.asyncio
async def test_registry_append_warmup_fallback_on_empty_cache():
    cache.clear()
    sub = DailyReportSubmission(
        working_place="Gaya",
        fo_name="Rajesh Singh",
        pin=1234,
        date_of_reporting="2026-09-16",
        notification_ids=["20001"]
    )

    with patch("main.db") as mock_db, \
         patch("main.fetch_district_notification_registry", new_callable=AsyncMock) as mock_fetch_reg:

        mock_doc = MagicMock()
        mock_doc.exists = False
        mock_db.collection.return_value.document.return_value.get.return_value = mock_doc
        mock_db.collection.return_value.document.return_value.set.return_value = None
        mock_fetch_reg.return_value = {"status": "success", "registry": {}, "total_count": 0}

        await submit_daily_report(sub)

        # Ensure warmup fallback was called because cache was empty
        assert mock_fetch_reg.called
        cached = cache.get("dist_notif_registry_gaya_2026-09_3")
        assert cached is not None
        assert "20001" in cached["registry"]
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pytest tests/test_profile_and_registry_read_reduction.py -v`  
Expected: FAIL.

- [ ] **Step 3: Implement scoped profile eviction & master ledger derivation in `main.py`**
1. In `my_profile_stats`:
   - Replace lines 3235-3251 with cached directory PIN check:
     ```python
     raw_staff = await get_cached_staff_directory_raw()
     # Find officer by canonical name and district, check pin
     ```
   - Replace lines 3252-3263 with cached targets:
     ```python
     raw_targets = await get_cached_staff_targets_for_month(req_month)
     # Lookup target_val
     ```
   - Replace lines 3267-3327 with in-memory filter from `get_raw_monthly_reports(req_month)`:
     ```python
     raw_reports = await get_raw_monthly_reports(req_month)
     reports = [r for r in raw_reports if canonicalize_district(r.get("working_place")) == c_wp and re.sub(r'[^a-zA-Z0-9]', '', r.get("fo_name", "")).lower() == clean_fo]
     ```
   - Set TTL to 1800s (`cache.set(cache_key, res, ttl=1800)`).
2. In `submit_daily_report`:
   - Replace `cache.delete_prefix("profile_")` with:
     ```python
     clean_wp_tag = canonicalize_district(report.working_place).replace(" ", "_").lower()
     clean_fo_tag = re.sub(r'[^a-zA-Z0-9]', '', report.fo_name).lower()
     month_tag = report.date_of_reporting[:7]
     cache.delete(f"profile_{clean_wp_tag}_{clean_fo_tag}_{month_tag}")
     ```
   - In-place registry append with warmup fallback (Loophole 1 fix):
     ```python
     reg_cache_key = f"dist_notif_registry_{clean_wp_tag}_{month_tag}_3"
     cached_reg = cache.get(reg_cache_key)
     if cached_reg is None or not isinstance(cached_reg, dict) or "registry" not in cached_reg:
         cached_reg = await fetch_district_notification_registry(clean_wp, months=3)
     if cached_reg and isinstance(cached_reg, dict) and "registry" in cached_reg:
         for nid in valid_new_notifs:
             cached_reg["registry"][nid] = {
                 "date": report.date_of_reporting,
                 "fo_name": report.fo_name,
                 "doc_id": doc_id
             }
         cached_reg["total_count"] = len(cached_reg["registry"])
         cache.set(reg_cache_key, cached_reg, ttl=7200)
     ```

- [ ] **Step 4: Run test to verify it passes**
Run: `pytest tests/test_profile_and_registry_read_reduction.py -v`  
Expected: PASS 100%.

- [ ] **Step 5: Commit changes locally**
```bash
git add main.py tests/test_profile_and_registry_read_reduction.py
git commit -m "feat(perf): derive fo profile stats from master ledger and implement scoped eviction with registry warmup fallback"
```

---

### Task 3: Backend Zero-Read KPI Excel Engine

**Files:**
- Modify: `main.py:2458-2550` (`generate_district_kpi_bytes`)
- Test: `tests/test_kpi_master_ledger_engine.py`

**Interfaces:**
- Consumes: `get_raw_monthly_reports(month_prefix)` and `get_cached_staff_targets_for_month(month_prefix)`.
- Produces: `generate_district_kpi_bytes` generating full 33-tab Excel workbooks with 0 Firestore reads.

- [ ] **Step 1: Write the failing test**
Create `tests/test_kpi_master_ledger_engine.py` asserting:
1. `generate_district_kpi_bytes` pulls from `get_raw_monthly_reports` and `get_cached_staff_targets_for_month`.
2. `db.collection("staff_targets").where.stream` and `db.collection("daily_field_reports").where.stream` are never called.
3. Produces valid spreadsheet bytes with 17 clinical indicator values correctly populated.

```python
import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from main import generate_district_kpi_bytes

@pytest.mark.asyncio
async def test_kpi_generator_uses_master_ledger_zero_firestore_reads():
    district = "Patna"
    month = "2026-09"

    mock_reports = [
        {
            "id": "patna_fo1_2026-09-01",
            "working_place": "Patna",
            "fo_name": "Ramesh Kumar",
            "date_of_reporting": "2026-09-01",
            "notification_ids": ["1001", "1002"],
            "sample_tested_ids": ["2001"],
            "differentiated_tb_ids": ["3001"],
            "tpt_treatment_start_ids": ["4001"],
            "tpt_presumptive_ids": ["5001"]
        }
    ]

    mock_targets = [
        {"district": "Patna", "fo_name": "Ramesh Kumar", "target": 55, "month": "2026-09"}
    ]

    with patch("main.get_raw_monthly_reports", new_callable=AsyncMock) as mock_raw, \
         patch("main.get_cached_staff_targets_for_month", new_callable=AsyncMock) as mock_targets_fn, \
         patch("main.db") as mock_db:

        mock_raw.return_value = mock_reports
        mock_targets_fn.return_value = mock_targets
        mock_db.collection.side_effect = AssertionError("Direct db.collection should not be called in KPI engine!")

        # Async wrapper test
        excel_bytes = await generate_district_kpi_bytes_async(district, month)
        assert excel_bytes is not None
        assert len(excel_bytes) > 5000
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pytest tests/test_kpi_master_ledger_engine.py -v`  
Expected: FAIL.

- [ ] **Step 3: Update `generate_district_kpi_bytes` in `main.py`**
1. Support asynchronous invocation or pass pre-fetched `raw_reports` and `target_records` to `generate_district_kpi_bytes`:
   - Replace lines 2496-2506 with `target_map` populated from `target_records`.
   - Replace lines 2520-2533 with in-memory filtering:
     ```python
     reports = [r for r in raw_reports if canonicalize_district(r.get("working_place")) in alias_queries]
     ```
2. Update `/download-kpi-workbook` and `/download-all-kpi-workbooks` to fetch `raw_reports` once from `get_raw_monthly_reports(month)` and pass to the generation function.

- [ ] **Step 4: Run test to verify it passes**
Run: `pytest tests/test_kpi_master_ledger_engine.py tests/test_kpi_excel_engine_17_indicators.py -v`  
Expected: PASS 100%.

- [ ] **Step 5: Commit changes locally**
```bash
git add main.py tests/test_kpi_master_ledger_engine.py
git commit -m "feat(kpi): route district excel generation through shared in-memory master ledger eliminating firestore streams"
```

---

### Task 4: Frontend On-Demand Lazy Tab Loading, TDZ Safety & Deletion Delta Sync

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx`, `dfy-frontend/src/App.jsx`
- Test: `tests/test_lazy_tab_loading_and_delta_ui.mjs`

**Interfaces:**
- Consumes: `/admin/dashboard-data` delta mode with `deleted_ids`.
- Produces: Clean initial mount with zero eager requests; on-demand tab loading; TDZ safety; tombstone deletion delta merge.

- [ ] **Step 1: Write the failing test**
Create `tests/test_lazy_tab_loading_and_delta_ui.mjs` asserting:
1. `AdminDashboard.jsx` does NOT invoke `fetchAttendance`, `loadTargets`, or `fetchTopPerformers` in the primary mount `useEffect`.
2. Tab trigger `useEffect` hooks are declared strictly after the lexical declaration of their respective fetch functions.
3. Delta sync merge handles both `deleted_ids` and `records`.
4. `App.jsx` does not eagerly invoke `/my-profile-stats` on mount.

```javascript
import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log("=== Running Lazy Tab Loading & Delta UI Verification ===");

const adminCode = fs.readFileSync(path.resolve('dfy-frontend/src/AdminDashboard.jsx'), 'utf8');
const appCode = fs.readFileSync(path.resolve('dfy-frontend/src/App.jsx'), 'utf8');

// Test 1: Main Mount must not contain eager fetchAttendance or fetchTopPerformers
const mainMountMatch = adminCode.match(/\/\/ Global & Session Data Fetching[\s\S]*?useEffect\(\(\) => \{([\s\S]*?)\}, \[month, isAuthenticated\]\);/);
assert.ok(mainMountMatch, "Clean primary mount useEffect must exist in AdminDashboard.jsx");
const mountBody = mainMountMatch[1];
assert.ok(!mountBody.includes('fetchAttendance()'), "Primary mount must NOT eagerly call fetchAttendance");
assert.ok(!mountBody.includes('fetchTopPerformers('), "Primary mount must NOT eagerly call fetchTopPerformers");
assert.ok(!mountBody.includes("loadTargets('All')"), "Primary mount must NOT eagerly call loadTargets");
console.log("✔ Test 1 Passed: Primary mount is lean and on-demand.");

// Test 2: TDZ Order Check (Helper functions declared BEFORE tab trigger useEffects)
const fetchAttendanceIdx = adminCode.indexOf('const fetchAttendance =');
const attendanceTriggerIdx = adminCode.indexOf('showAttendanceModal');
assert.ok(fetchAttendanceIdx !== -1, "fetchAttendance must be declared");
assert.ok(fetchAttendanceIdx < attendanceTriggerIdx, "fetchAttendance must be declared BEFORE its trigger hook");
console.log("✔ Test 2 Passed: Strict lexical declaration order prevents TDZ crashes.");

// Test 3: Delta sync includes deleted_ids tombstone handling
assert.ok(adminCode.includes('data.deleted_ids'), "Delta sync must process deleted_ids");
console.log("✔ Test 3 Passed: Delta sync supports deletion tombstones.");

console.log("🎉 ALL LAZY TAB LOADING & DELTA UI TESTS PASSED!");
```

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/test_lazy_tab_loading_and_delta_ui.mjs`  
Expected: FAIL.

- [ ] **Step 3: Update `AdminDashboard.jsx` and `App.jsx`**
1. In `AdminDashboard.jsx`:
   - Simplify main `useEffect`:
     ```javascript
     useEffect(() => {
       if (isAuthenticated) {
         fetchData(false);
         fetchDirectory();
         fetchActiveBroadcasts();
       }
     }, [month, isAuthenticated]);
     ```
   - Ensure `fetchAttendance`, `loadTargets`, `fetchStaffList`, `fetchTopPerformers` are declared as `useCallback` BEFORE any tab trigger `useEffect`.
   - Add trigger `useEffect` hooks for `showAttendanceModal`, `showTopPerformersModal`, `showStaffModal`, `showPacingModal`.
   - In `fetchData` delta handler, ensure `data.deleted_ids` removes tombstones from `rawRecords`.
2. In `App.jsx`:
   - In `useEffect` at lines 5374-5382, remove `fetchFoMonthlyHistory(...)` from automatic mount.
   - Trigger `fetchFoMonthlyHistory` only when the officer opens `MyProfileDashboard` or `showFoAchievementModal`.

- [ ] **Step 4: Run test to verify it passes**
Run: `node tests/test_lazy_tab_loading_and_delta_ui.mjs`  
Expected: PASS 100%.

- [ ] **Step 5: Run frontend lint and build**
Run: `npm --prefix dfy-frontend run lint` (Must be 0 errors)  
Run: `npm --prefix dfy-frontend run build` (Must exit 0)

- [ ] **Step 6: Commit changes locally**
```bash
git add dfy-frontend/src/AdminDashboard.jsx dfy-frontend/src/App.jsx tests/test_lazy_tab_loading_and_delta_ui.mjs
git commit -m "feat(ui): implement on-demand lazy tab loading with tdz safety and deletion-aware delta sync"
```

---

### Task 5: End-to-End System Regression Battery & Billing Read Audit

**Files:**
- Test: All backend pytest suites (`pytest tests/test_*.py -v`)
- Test: All frontend UI test suites (`node tests/test_*.mjs`)

- [ ] **Step 1: Run complete backend test suite**
Run: `pytest tests/test_*.py -v`  
Expected: All tests pass 100%.

- [ ] **Step 2: Run Python compilation verification**
Run: `python -m py_compile main.py`  
Expected: Exit 0.

- [ ] **Step 3: Run complete frontend build & lint**
Run: `npm --prefix dfy-frontend run lint`  
Run: `npm --prefix dfy-frontend run build`  
Expected: 0 lint errors, build exit 0.

- [ ] **Step 4: Audit git diff**
Run: `git diff origin/main`  
Verify only intentional, targeted read-reduction code exists.

- [ ] **Step 5: Final Local Commit**
```bash
git add -A
git commit -m "chore(release): complete firestore read reduction, master ledger derivation and lazy tab delta engine"
```
Wait for explicit user approval before running `git push origin main`.
