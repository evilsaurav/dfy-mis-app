# Month Boundary Reconciliation, Dynamic Calendar Pacing Engine, & 12:00 PM Grace Cutoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate runaway target pacing extrapolation, establish a calendar-accurate working days pacing engine with Sunday/holiday deduction, and synchronize 12:00 PM Noon month-end grace reporting across backend and frontend.

**Architecture:** Implement a single source of truth `getOperationalMonth()` on frontend and backend to detect the Day 1 before-noon grace window, replace the hardcoded 30-day IIFE in `AdminDashboard.jsx` with the calendar-accurate `workingDaysInfo` model across three state-machine modes (Past/Current/Future), and align `check_today_status` and leaderboard defaults in `main.py`.

**Tech Stack:** Python 3.14 (FastAPI, pytest), React 18, Vite 8, TailwindCSS, date-fns / native Date API.

**Spec:** `docs/superpowers/specs/2026-10-01-month-boundary-pacing-and-noon-cutoff-design.md`

## Global Constraints
- THIS APPLICATION IS LIVE IN PRODUCTION for TB monitoring in Bihar.
- Zero tolerance for runtime crashes, blank/white screens, data corruption, or broken schemas.
- Strict Zero-Push Rule: Commit locally only. Do NOT run `git push` without explicit user approval.
- Response schemas for `/check-today-status`, `/my-profile-stats`, `/api/statewide-top-performers`, and `/admin/dashboard-stats` must stay 100% backward compatible.
- Zero technical cutoff leakage: Internal 10 AM / 11 AM technical cutoff stays confidential; users are informed only of the official 12:00 PM Noon month-end close window.
- Temporal Dead Zone (TDZ) Rule: States -> useMemo -> useCallback -> Trigger useEffects in `AdminDashboard.jsx` and `App.jsx`.

---

### Task 1: Backend Cutoff Synchronization & Operational Month Fallback in `main.py`

**Files:**
- Modify: `main.py:1240-1255`, `main.py:1730-1745`, `main.py:1810-1825`, `main.py:3550-3575`
- Test: `tests/test_month_boundary_and_pacing.py`

**Interfaces:**
- Produces: `get_active_operational_month(now_ist: datetime) -> str`
- Modifies: `check_today_status` to use `get_reporting_cutoff_hour(now_ist)` instead of hardcoded `< 10`
- Modifies: `get_statewide_top_performers` default month fallback on Day 1 before 12:00 PM

- [ ] **Step 1: Write the failing backend test suite**

Create `tests/test_month_boundary_and_pacing.py`:
```python
import pytest
from datetime import datetime
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient
from pathlib import Path
import sys

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from main import app, cache, get_reporting_cutoff_hour, get_active_operational_month, create_access_token

client = TestClient(app)

def make_admin_token():
    return create_access_token({"user_id": "test_admin", "username": "admin", "role": "SUPER_ADMIN", "allowed_districts": ["All"]})

@pytest.fixture(autouse=True)
def clean_cache():
    cache.clear()
    yield
    cache.clear()

def test_reporting_cutoff_hour_day_1_vs_other_days():
    # Day 1 yields 12 (Noon)
    dt_day1 = datetime(2026, 10, 1, 9, 30)
    assert get_reporting_cutoff_hour(dt_day1) == 12

    # Other days yield 11 (11 AM)
    dt_day15 = datetime(2026, 10, 15, 9, 30)
    assert get_reporting_cutoff_hour(dt_day15) == 11

def test_get_active_operational_month():
    # Oct 1 at 09:00 AM -> September (grace window)
    dt_morning = datetime(2026, 10, 1, 9, 0)
    assert get_active_operational_month(dt_morning) == "2026-09"

    # Oct 1 at 12:00 PM -> October
    dt_noon = datetime(2026, 10, 1, 12, 0)
    assert get_active_operational_month(dt_noon) == "2026-10"

    # Oct 15 at 09:00 AM -> October
    dt_mid_month = datetime(2026, 10, 15, 9, 0)
    assert get_active_operational_month(dt_mid_month) == "2026-10"

def test_check_today_status_at_10_30_am_on_day_1():
    # On Oct 1 at 10:30 AM (between 10 AM and 12 PM), check_today_status should look up yesterday's doc
    req_body = {
        "working_place": "Sitamarhi",
        "fo_name": "ALOK KUMAR",
        "date": "2026-10-01"
    }

    mock_doc = MagicMock()
    mock_doc.exists = True
    mock_doc.to_dict.return_value = {"date_of_reporting": "2026-09-30", "status": "completed"}

    with patch("main.get_ist_now", return_value=datetime(2026, 10, 1, 10, 30)), \
         patch("main.db") as mock_db:
        mock_db.collection.return_value.document.return_value.get.return_value = mock_doc

        res = client.post("/check-today-status", json=req_body)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "completed"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_month_boundary_and_pacing.py -v`
Expected: FAIL with `cannot import name 'get_active_operational_month'`

- [ ] **Step 3: Implement minimal code in `main.py`**

In `main.py`:
1. Add `get_active_operational_month(now_ist: datetime) -> str`:
```python
def get_active_operational_month(now_ist: Optional[datetime] = None) -> str:
    """
    Returns the active operational reporting month:
    - On 1st of month before 12:00 PM Noon, returns previous month (YYYY-MM).
    - Otherwise returns current calendar month (YYYY-MM).
    """
    if now_ist is None:
        now_ist = get_ist_now()
    if hasattr(now_ist, 'day') and now_ist.day == 1 and now_ist.hour < 12:
        prev_month_dt = now_ist.replace(day=1) - timedelta(days=1)
        return prev_month_dt.strftime("%Y-%m")
    return now_ist.strftime("%Y-%m")
```

2. Update `check_today_status` (line 1812):
```python
        now_ist = get_ist_now()
        today_str = now_ist.strftime("%Y-%m-%d")
        cutoff_hour = get_reporting_cutoff_hour(now_ist)
        if res.get("status") != "completed" and now_ist.hour < cutoff_hour and req.date == today_str:
```

3. Update `get_statewide_top_performers` (line 1246):
```python
        if not month:
            month = get_active_operational_month(now_dt)
```

4. Update `my_profile_stats` past month calculation (line 3555):
```python
        ist_today = get_ist_now().date()
        if req_month == ist_today.strftime("%Y-%m"):
            day_of_month = ist_today.day
        elif req_month < ist_today.strftime("%Y-%m"):
            day_of_month = total_days
        else:
            day_of_month = 0
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_month_boundary_and_pacing.py -v`
Expected: PASS (4/4 tests passed)

- [ ] **Step 5: Verify Python compilation & commit**

Run: `python -m py_compile main.py`
Run:
```bash
git add main.py tests/test_month_boundary_and_pacing.py
git commit -m "feat(backend): align month-end grace cutoff and operational month resolver"
```

---

### Task 2: Dynamic Calendar Model & Pacing Engine Overhaul in `AdminDashboard.jsx`

**Files:**
- Create: `dfy-frontend/src/utils/operationalMonth.js`
- Modify: `dfy-frontend/src/AdminDashboard.jsx:159`, `dfy-frontend/src/AdminDashboard.jsx:7004-7060`
- Test: `tests/test_admin_pacing_ui.mjs`

**Interfaces:**
- Consumes: `workingDaysInfo` hook and `getOperationalMonth` helper
- Produces: Correct 3-mode Target Pacing & Forecaster card on Overview tab

- [ ] **Step 1: Create `dfy-frontend/src/utils/operationalMonth.js`**

```javascript
/**
 * Resolves operational month and Day 1 grace period status.
 * - On 1st of month before 12:00 PM Noon: operational month is previous month.
 * - Otherwise: operational month is current calendar month.
 */
export const getOperationalMonth = (customDate = new Date()) => {
  const d = new Date(customDate);
  const day = d.getDate();
  const hours = d.getHours();

  if (day === 1 && hours < 12) {
    const prevMonthDate = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const yyyy = prevMonthDate.getFullYear();
    const mm = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
    return {
      operationalMonth: `${yyyy}-${mm}`,
      isMonthEndGracePeriod: true,
      graceClosingMonth: `${yyyy}-${mm}`,
      activeCalendarMonth: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    };
  }

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return {
    operationalMonth: `${yyyy}-${mm}`,
    isMonthEndGracePeriod: false,
    graceClosingMonth: null,
    activeCalendarMonth: `${yyyy}-${mm}`
  };
};
```

- [ ] **Step 2: Write failing frontend unit test `tests/test_admin_pacing_ui.mjs`**

Create `tests/test_admin_pacing_ui.mjs`:
```javascript
import assert from 'node:assert/strict';
import { getOperationalMonth } from '../dfy-frontend/src/utils/operationalMonth.js';

// Test 1: Operational month on Oct 1 at 09:30 AM
const oct1Morning = new Date(2026, 9, 1, 9, 30); // Month is 0-indexed (9 = Oct)
const res1 = getOperationalMonth(oct1Morning);
assert.equal(res1.operationalMonth, '2026-09');
assert.equal(res1.isMonthEndGracePeriod, true);

// Test 2: Operational month on Oct 1 at 12:30 PM
const oct1Afternoon = new Date(2026, 9, 1, 12, 30);
const res2 = getOperationalMonth(oct1Afternoon);
assert.equal(res2.operationalMonth, '2026-10');
assert.equal(res2.isMonthEndGracePeriod, false);

// Test 3: Operational month on Sep 15 at 14:00
const sep15 = new Date(2026, 8, 15, 14, 0);
const res3 = getOperationalMonth(sep15);
assert.equal(res3.operationalMonth, '2026-09');
assert.equal(res3.isMonthEndGracePeriod, false);

console.log('✅ All operationalMonth tests passed!');
```

- [ ] **Step 3: Run test to verify passes**

Run: `node tests/test_admin_pacing_ui.mjs`
Expected: `✅ All operationalMonth tests passed!`

- [ ] **Step 4: Update `AdminDashboard.jsx`**

1. Import `getOperationalMonth`:
```javascript
import { getOperationalMonth } from './utils/operationalMonth';
```

2. Initialize `month` state with operational month:
```javascript
const [month, setMonth] = useState(() => getOperationalMonth().operationalMonth);
```

3. Replace the Overview Target Pacing card (lines 7004–7056):
```jsx
{(() => {
  const { totalWorkingDays, elapsedWorkingDays, remainingWorkingDays, isCurrentMonth, isPastMonth, isFutureMonth, totalDays } = workingDaysInfo;

  let scopedTarget = 0;
  if (selectedDistrict !== 'All') {
    scopedTarget = targetsData.filter(t => t.district === selectedDistrict).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
  } else if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
    scopedTarget = targetsData.filter(t => currentUser.allowed_districts.includes(t.district)).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
  } else {
    scopedTarget = targetsData.reduce((sum, t) => sum + (Number(t.target) || 0), 0);
  }

  const totalScopeNotif = totals.notifications || 0;
  const pendingScopeNotif = Math.max(0, scopedTarget - totalScopeNotif);

  let currentDailyRate = '0.0';
  let requiredDailyRate = '0.0';
  let projectedTotal = totalScopeNotif;
  let projectedPct = scopedTarget > 0 ? Math.round((totalScopeNotif / scopedTarget) * 100) : 100;
  let daysRemainingDisplay = 0;

  if (isPastMonth) {
    // Mode 1: Past Month (Completed Month Final View)
    currentDailyRate = totalWorkingDays > 0 ? (totalScopeNotif / totalWorkingDays).toFixed(1) : '0.0';
    requiredDailyRate = '0.0';
    projectedTotal = totalScopeNotif;
    projectedPct = scopedTarget > 0 ? Math.round((totalScopeNotif / scopedTarget) * 100) : 100;
    daysRemainingDisplay = 0;
  } else if (isCurrentMonth) {
    // Mode 2: Live In-Flight Pacing
    currentDailyRate = elapsedWorkingDays > 0 ? (totalScopeNotif / elapsedWorkingDays).toFixed(1) : totalScopeNotif.toFixed(1);
    requiredDailyRate = remainingWorkingDays > 0 ? (pendingScopeNotif / remainingWorkingDays).toFixed(1) : '0.0';
    projectedTotal = Math.round(totalScopeNotif + (Number(currentDailyRate) * remainingWorkingDays));
    projectedPct = scopedTarget > 0 ? Math.round((projectedTotal / scopedTarget) * 100) : 100;
    daysRemainingDisplay = remainingWorkingDays;
  } else {
    // Mode 3: Future Month
    currentDailyRate = '0.0';
    requiredDailyRate = totalWorkingDays > 0 ? (scopedTarget / totalWorkingDays).toFixed(1) : '0.0';
    projectedTotal = 0;
    projectedPct = 0;
    daysRemainingDisplay = totalWorkingDays;
  }

  return (
    <>
      <div className="bg-indigo-50/70 p-4 rounded-2xl border border-indigo-100 flex justify-between items-center">
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400">
            {isPastMonth ? 'Final Daily Velocity' : 'Current Daily Pace'}
          </span>
          <p className="text-xl font-black text-indigo-700">{currentDailyRate} <span className="text-xs font-bold text-indigo-500">Notif/Day</span></p>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            {isPastMonth ? 'Pacing Status' : 'Required Pace'}
          </span>
          <p className="text-xl font-black text-slate-800">
            {isPastMonth ? (projectedPct >= 100 ? '✅ Achieved' : '🏁 Completed') : `${requiredDailyRate} Notif/Day`}
          </p>
        </div>
      </div>

      <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-xs">
        <div className="flex justify-between font-bold">
          <span className="text-slate-500">Scope Target &amp; Actual:</span>
          <span className="font-black text-slate-800">{totalScopeNotif} / {scopedTarget} Notif</span>
        </div>
        <div className="flex justify-between font-bold">
          <span className="text-slate-500">{isPastMonth ? 'Final Achievement:' : 'Month-End Projection:'}</span>
          <span className="font-black text-indigo-600">{projectedTotal} Notifications ({projectedPct}%)</span>
        </div>
        <div className="flex justify-between font-bold">
          <span className="text-slate-500">Working Days Remaining:</span>
          <span className="text-slate-700 font-mono font-bold">
            {isPastMonth ? '0 Days (Month Closed)' : `${daysRemainingDisplay} Days (${totalWorkingDays} Total Working Days)`}
          </span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden mt-1">
          <div className="h-full bg-indigo-600 rounded-full transition-all duration-700" style={{ width: `${Math.min(100, projectedPct)}%` }}></div>
        </div>
      </div>
    </>
  );
})()}
```

4. Add Day 1 Month-End Grace Banner in `AdminDashboard.jsx` header:
When `getOperationalMonth().isMonthEndGracePeriod` is true, show a clean banner:
```jsx
{getOperationalMonth().isMonthEndGracePeriod && (
  <div className="mb-4 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 rounded-2xl p-3 flex items-center justify-between text-xs text-amber-900">
    <div className="flex items-center gap-2 font-bold">
      <span className="text-base">⏳</span>
      <span><strong>Month-End Close Window Active:</strong> Reporting for {getOperationalMonth().graceClosingMonth} remains open until 12:00 PM Noon today. Showing {month} data.</span>
    </div>
    {month !== getOperationalMonth().activeCalendarMonth && (
      <button onClick={() => setMonth(getOperationalMonth().activeCalendarMonth)} className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition-colors shrink-0">
        Switch to {getOperationalMonth().activeCalendarMonth}
      </button>
    )}
  </div>
)}
```

- [ ] **Step 5: Run linter and build check**

Run: `npm --prefix dfy-frontend run lint`
Run: `npm --prefix dfy-frontend run build`
Expected: 0 errors, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add dfy-frontend/src/utils/operationalMonth.js dfy-frontend/src/AdminDashboard.jsx tests/test_admin_pacing_ui.mjs
git commit -m "feat(dashboard): connect overview pacing card to calendar workingDaysInfo and operational month resolver"
```

---

### Task 3: Frontline FO Mobile App Month Sync & Reassurance Notice in `App.jsx`

**Files:**
- Modify: `dfy-frontend/src/App.jsx:510-530`, `dfy-frontend/src/App.jsx:5300-5310`, `dfy-frontend/src/App.jsx:Home Notice`
- Test: `tests/test_fo_month_boundary_ui.mjs`

**Interfaces:**
- Consumes: `getOperationalMonth` from `./utils/operationalMonth`
- Produces: Correct month string in `my-profile-stats` and `fetchFoMonthlyHistory` during Day 1 grace period

- [ ] **Step 1: Write test `tests/test_fo_month_boundary_ui.mjs`**

```javascript
import assert from 'node:assert/strict';
import fs from 'node:fs';

const appContent = fs.readFileSync('dfy-frontend/src/App.jsx', 'utf-8');

// Verify getOperationalMonth is imported
assert.ok(appContent.includes('getOperationalMonth'), 'App.jsx must import and use getOperationalMonth');

// Verify profile stats month uses operationalMonth
assert.ok(appContent.includes('getOperationalMonth().operationalMonth'), 'App.jsx must use getOperationalMonth().operationalMonth for stats queries');

console.log('✅ FO month boundary UI test passed!');
```

- [ ] **Step 2: Update `dfy-frontend/src/App.jsx`**

1. Import `getOperationalMonth`:
```javascript
import { getOperationalMonth } from './utils/operationalMonth';
```

2. In `fetchProfileStats` (lines 510–525):
Replace:
```javascript
const today = new Date();
const monthStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, '0');
```
With:
```javascript
const monthStr = getOperationalMonth().operationalMonth;
```

3. In `fetchFoMonthlyHistory` (lines 5300–5310):
Replace:
```javascript
const today = new Date();
const monthStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, '0');
```
With:
```javascript
const monthStr = getOperationalMonth().operationalMonth;
```

4. Add subtle Home reassurance notice on Day 1 before 12:00 PM:
```jsx
{getOperationalMonth().isMonthEndGracePeriod && (
  <div className="mx-4 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-2.5 text-xs text-amber-900 font-semibold shadow-2xs">
    <span className="text-base">📋</span>
    <span><strong>Notice:</strong> Subah 12:00 PM se pehle darj ki gayi report aapke pichhle mahine ({getOperationalMonth().graceClosingMonth}) ke target me judegi.</span>
  </div>
)}
```

- [ ] **Step 3: Run test, linter and build check**

Run: `node tests/test_fo_month_boundary_ui.mjs`
Run: `npm --prefix dfy-frontend run lint`
Run: `npm --prefix dfy-frontend run build`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add dfy-frontend/src/App.jsx tests/test_fo_month_boundary_ui.mjs
git commit -m "feat(fo): synchronize mobile app profile queries with operational month and add morning grace notice"
```

---

### Task 4: Full App Verification Battery & Evidence Audit

**Files:**
- Audit: All modified files (`main.py`, `AdminDashboard.jsx`, `App.jsx`, `operationalMonth.js`, tests)

- [ ] **Step 1: Run complete backend test battery**
Run:
```bash
pytest tests/test_month_boundary_and_pacing.py tests/test_top_performers_target_accuracy_and_realtime_sync.py tests/test_statewide_top_performers.py -v
```
Expected: 100% PASS.

- [ ] **Step 2: Run complete frontend unit tests**
Run:
```bash
node tests/test_admin_pacing_ui.mjs
node tests/test_fo_month_boundary_ui.mjs
```
Expected: 100% PASS.

- [ ] **Step 3: Backend Python compilation**
Run: `python -m py_compile main.py`
Expected: Exit code 0.

- [ ] **Step 4: Frontend linter & build**
Run:
```bash
npm --prefix dfy-frontend run lint
npm --prefix dfy-frontend run build
```
Expected: 0 syntax errors, build succeeds.

- [ ] **Step 5: Git diff audit**
Run: `git diff HEAD~3..HEAD`
Inspect line-by-line to ensure zero unintended changes.
