# Leave Sync, Stealth 10 AM Cutoff, Reconciler Phone & Time Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the FO form submission timestamp display, implement the stealth 10:00 AM next-day reporting cutoff on the backend, sync admin-marked leaves to the FO calendar with 5 category colors and remarks, and persist & display patient names and phone numbers in the Nikshay Reconciler and Patient Journey cards with 1-tap calling.

**Architecture:**
- **Time Format**: Centralized `formatIstTime` utility converting any ISO/UTC/locale timestamp to clean 12-hour IST (`HH:MM AM/PM`).
- **Cutoff Engine**: Backend-only `resolve_effective_reporting_date` in `main.py` resolving submissions before 10 AM IST to yesterday if yesterday's report is pending, keeping FO app UI psychologically strict.
- **Leave Sync**: Backend `/my-profile-stats` hydrates `daily_history` from `daily_staff_leaves`; FO calendar renders color-coded pills (Amber, Sky, Indigo, Rose, Slate) and a dedicated inspection card with Admin remarks.
- **Reconciler Contacts**: Expanded column detection in `reconcile_nikshay` and `sync_nikshay_cumulative_ledger_sync` persisting `patient_name` & sanitized `phone` to `nikshay_verified_patients`, exposing them in `/api/reports/patient-journey/{patient_id}`, and rendering 1-tap call & copy buttons in FO App & Admin Panel.

**Tech Stack:** Python 3.14 / FastAPI, Google Cloud Firestore, React 19, Tailwind CSS v4, Node.js v24 ESM test runner.

**Spec:** `docs/superpowers/specs/2026-09-25-leave-sync-10am-cutoff-reconciler-phone-and-time-fix-design.md`

## Global Constraints

- Production environment: Zero runtime crashes, white screens, data corruption, or breaking regressions.
- Temporal Dead Zone (TDZ) Rule: Never reference state or derived variables before their lexical declaration.
- Anti-Double-Tap & Concurrency Guards: Ensure loading/disabled states on all mutations.
- Cross-District Isolation: Sub-Admin users must never access or modify data outside permitted districts.
- Verification Battery: `python -m py_compile main.py` exit code 0; `pytest tests/` 100% pass; `npm run lint` 0 errors; `npm run build` exit code 0.
- GEMINI.md Rule 5: Commit locally first, summarize evidence, and wait for explicit user approval before `git push origin main`.

---

### Task 1: Form Submission Time Formatter (`formatIstTime`) & Test Suite

**Files:**
- Create: `dfy-frontend/src/utils/timeFormat.js`
- Modify: `dfy-frontend/src/App.jsx:5056-5061`
- Test: `tests/test_submission_time_format.mjs`

**Interfaces:**
- Consumes: `timestamp_completed` string or Date
- Produces: `formatIstTime(rawTs) -> string` (e.g., `"08:30 AM"`, `"02:45 PM"`)

- [ ] **Step 1: Write the failing test**

```javascript
// tests/test_submission_time_format.mjs
import assert from 'assert';
import { formatIstTime } from '../dfy-frontend/src/utils/timeFormat.js';

// 1. UTC ISO string test (10:15 UTC -> 15:45 IST / 03:45 PM)
const utcIso = "2026-09-25T10:15:00.000000Z";
assert.strictEqual(formatIstTime(utcIso), "03:45 PM", "Must convert UTC ISO to 03:45 PM IST");

// 2. Already formatted string test
assert.strictEqual(formatIstTime("08:30 pm"), "08:30 PM", "Must handle 12-hour strings");
assert.strictEqual(formatIstTime("8:30 am"), "08:30 AM", "Must pad single digit hours");

// 3. Fallback / falsy test
assert.strictEqual(formatIstTime(null), "", "Falsy value must return empty string");
assert.strictEqual(formatIstTime(""), "", "Empty string must return empty string");

console.log("✔ Submission time format tests passed!");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_submission_time_format.mjs`
Expected: FAIL (Cannot find module `timeFormat.js`)

- [ ] **Step 3: Implement minimal code**

1. Create `dfy-frontend/src/utils/timeFormat.js`:
```javascript
export const formatIstTime = (rawTs) => {
  if (!rawTs) return '';
  const str = String(rawTs).trim();
  const match12 = str.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (match12) {
    const hh = match12[1].padStart(2, '0');
    const mm = match12[2];
    const ampm = match12[3].toUpperCase();
    return `${hh}:${mm} ${ampm}`;
  }
  const d = new Date(rawTs);
  if (isNaN(d.getTime())) return str;
  return d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).toUpperCase();
};
```
2. In `dfy-frontend/src/App.jsx`:
Import `formatIstTime` from `./utils/timeFormat.js`.
In line 5058, replace:
```jsx
{todaySubmittedReport.timestamp_completed && (
  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-1 rounded-lg shrink-0">
    {formatIstTime(todaySubmittedReport.timestamp_completed)}
  </span>
)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_submission_time_format.mjs`
Expected: PASS
Run: `npm --prefix dfy-frontend run lint`
Expected: 0 syntax errors.

- [ ] **Step 5: Commit**

```bash
git add dfy-frontend/src/utils/timeFormat.js dfy-frontend/src/App.jsx tests/test_submission_time_format.mjs
git commit -m "fix(ui): format post-submission timestamp accurately in 12-hour IST"
```

---

### Task 2: Backend Stealth 10:00 AM Reporting Cutoff Engine

**Files:**
- Modify: `main.py:1205-1240` (`resolve_effective_reporting_date`, `/submit-daily-report`, `/check-today-status`)
- Test: `tests/test_stealth_10am_cutoff.py`

**Interfaces:**
- Consumes: `fo_name`, `working_place`, `requested_date`
- Produces: `resolve_effective_reporting_date(fo_name, working_place, requested_date, now_ist=None) -> str`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_stealth_10am_cutoff.py
import pytest
from datetime import datetime
from unittest.mock import patch, MagicMock
import main

@pytest.mark.asyncio
async def test_cutoff_before_10am_yesterday_missing_resolves_to_yesterday():
    # Simulate 8:30 AM on 2026-09-26
    fake_now = datetime(2026, 9, 26, 8, 30, 0)
    with patch("main.get_ist_now", return_value=fake_now):
        with patch("main.db.collection") as mock_coll:
            # Mock yesterday document does not exist
            mock_doc = MagicMock()
            mock_doc.get.return_value.exists = False
            mock_coll.return_value.document.return_value = mock_doc
            
            resolved = await main.resolve_effective_reporting_date(
                fo_name="Rahul Kumar",
                working_place="Muzaffarpur",
                requested_date="2026-09-26"
            )
            assert resolved == "2026-09-25", "Submissions before 10 AM with missing yesterday must route to yesterday"

@pytest.mark.asyncio
async def test_cutoff_before_10am_yesterday_already_submitted_resolves_to_today():
    # Simulate 8:30 AM on 2026-09-26 with yesterday already submitted
    fake_now = datetime(2026, 9, 26, 8, 30, 0)
    with patch("main.get_ist_now", return_value=fake_now):
        with patch("main.db.collection") as mock_coll:
            mock_doc = MagicMock()
            mock_doc.get.return_value.exists = True
            mock_coll.return_value.document.return_value = mock_doc
            
            resolved = await main.resolve_effective_reporting_date(
                fo_name="Rahul Kumar",
                working_place="Muzaffarpur",
                requested_date="2026-09-26"
            )
            assert resolved == "2026-09-26", "Submissions before 10 AM when yesterday is already submitted must route to today"

@pytest.mark.asyncio
async def test_cutoff_at_or_after_10am_resolves_to_today():
    # Simulate 10:15 AM on 2026-09-26
    fake_now = datetime(2026, 9, 26, 10, 15, 0)
    with patch("main.get_ist_now", return_value=fake_now):
        resolved = await main.resolve_effective_reporting_date(
            fo_name="Rahul Kumar",
            working_place="Muzaffarpur",
            requested_date="2026-09-26"
        )
        assert resolved == "2026-09-26", "Submissions at or after 10 AM must strictly route to today"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_stealth_10am_cutoff.py -v`
Expected: FAIL (AttributeError: `resolve_effective_reporting_date` not found)

- [ ] **Step 3: Implement minimal code in `main.py`**

In `main.py`:
1. Define `resolve_effective_reporting_date`:
```python
async def resolve_effective_reporting_date(
    fo_name: str, 
    working_place: str, 
    requested_date: Optional[str] = None
) -> str:
    now_ist = get_ist_now()
    today_str = now_ist.strftime("%Y-%m-%d")
    yesterday_str = (now_ist - timedelta(days=1)).strftime("%Y-%m-%d")

    # Respect explicit historical edits older than yesterday
    if requested_date and requested_date < yesterday_str:
        return requested_date

    if now_ist.hour < 10:
        c_wp = canonicalize_district(working_place) if working_place else ""
        yesterday_doc_id = f"{c_wp}_{fo_name}_{yesterday_str}".replace(" ", "_").lower()
        try:
            doc_ref = db.collection("daily_field_reports").document(yesterday_doc_id)
            doc = await asyncio.to_thread(doc_ref.get)
            if not doc.exists:
                return yesterday_str
        except Exception:
            pass

    return requested_date or today_str
```
2. In `/submit-daily-report`:
```python
report.date_of_reporting = await resolve_effective_reporting_date(
    fo_name=report.fo_name,
    working_place=report.working_place,
    requested_date=report.date_of_reporting
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_stealth_10am_cutoff.py -v`
Expected: PASS (3 passed)
Run: `python -m py_compile main.py`
Expected: Exit code 0

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_stealth_10am_cutoff.py
git commit -m "feat(backend): implement stealth 10:00 AM next-day reporting cutoff"
```

---

### Task 3: Backend Staff Leave Hydration in `/my-profile-stats` & FO Calendar Enrichment

**Files:**
- Modify: `main.py:2440-2510, 8020-8025, 8065-8070`
- Test: `tests/test_fo_leave_sync_and_calendar.py`

**Interfaces:**
- Consumes: `daily_staff_leaves` collection
- Produces: `daily_history[date]` enriched with `is_leave`, `status`, `reason_type`, `remark`, `marked_by`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_fo_leave_sync_and_calendar.py
import pytest
from unittest.mock import patch, MagicMock
import main

@pytest.mark.asyncio
async def test_my_profile_stats_hydrates_leaves_into_daily_history():
    req = main.ProfileStatsRequest(
        working_place="Muzaffarpur",
        fo_name="Rahul Kumar",
        pin=1234,
        month="2026-09"
    )
    
    # Mock pin verification success
    with patch("main.verify_password", return_value=True), \
         patch("main.db.collection") as mock_coll:
        
        # Setup mock leave doc
        leave_snap = MagicMock()
        leave_snap.to_dict.return_value = {
            "date": "2026-09-24",
            "district": "Muzaffarpur",
            "fo_name": "Rahul Kumar",
            "status": "leave",
            "reason_type": "Medical",
            "remark": "Fever reported",
            "marked_by_name": "Admin Saurav",
            "marked_at": "2026-09-24 10:00:00"
        }
        
        # Configure collections
        def coll_router(name):
            mock = MagicMock()
            if name == "daily_staff_leaves":
                mock.where.return_value.where.return_value.stream.return_value = [leave_snap]
            elif name == "daily_field_reports":
                mock.where.return_value.where.return_value.where.return_value.stream.return_value = []
            elif name == "staff_directory":
                doc = MagicMock()
                doc.exists = True
                doc.to_dict.return_value = {"pin": "1234"}
                mock.document.return_value.get.return_value = doc
            else:
                mock.document.return_value.get.return_value.exists = False
            return mock
        mock_coll.side_effect = coll_router

        res = await main.my_profile_stats(req)
        assert "daily_history" in res
        assert "2026-09-24" in res["daily_history"]
        day_info = res["daily_history"]["2026-09-24"]
        assert day_info.get("is_leave") is True
        assert day_info.get("reason_type") == "Medical"
        assert day_info.get("remark") == "Fever reported"
        assert day_info.get("marked_by") == "Admin Saurav"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_fo_leave_sync_and_calendar.py -v`
Expected: FAIL

- [ ] **Step 3: Implement minimal code in `main.py`**

1. In `/my-profile-stats`:
Query `daily_staff_leaves` for `c_wp`, `req.fo_name` for `req_month`:
```python
leave_docs = await asyncio.to_thread(lambda: list(
    db.collection("daily_staff_leaves")
    .where("district", "==", c_wp)
    .where("date", ">=", start_date)
    .where("date", "<=", end_date)
    .stream()
))
for l_doc in leave_docs:
    l_data = l_doc.to_dict() if hasattr(l_doc, "to_dict") else l_doc
    l_fo = re.sub(r'[^a-zA-Z0-9]', '', l_data.get("fo_name", "")).lower()
    if l_fo == clean_target_fo:
        l_date = l_data.get("date", "")
        if l_date and l_date not in daily_history:
            daily_history[l_date] = {
                "submitted": False,
                "count": 0,
                "total_ids": 0,
                "categories": {},
                "is_leave": True,
                "status": l_data.get("status", "leave"),
                "reason_type": l_data.get("reason_type", "Casual"),
                "remark": l_data.get("remark", ""),
                "marked_by": l_data.get("marked_by_name", "Admin"),
                "marked_at": l_data.get("marked_at", "")
            }
        elif l_date in daily_history:
            daily_history[l_date]["is_leave"] = True
            daily_history[l_date]["leave_info"] = {
                "status": l_data.get("status", "leave"),
                "reason_type": l_data.get("reason_type", "Casual"),
                "remark": l_data.get("remark", ""),
                "marked_by": l_data.get("marked_by_name", "Admin")
            }
```
2. In `mark_leave` and `unmark_leave`:
Add cache eviction:
`cache.delete_prefix("profile_")`

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_fo_leave_sync_and_calendar.py -v`
Expected: PASS
Run: `python -m py_compile main.py`
Expected: Exit code 0

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_fo_leave_sync_and_calendar.py
git commit -m "feat(backend): hydrate staff leaves into profile stats daily history and invalidate profile cache"
```

---

### Task 4: Frontend FO Calendar Multi-Color Leave Badges & Inspection Card

**Files:**
- Modify: `dfy-frontend/src/App.jsx:1060-1200`
- Test: `tests/test_fo_calendar_leave_ui.mjs`

**Interfaces:**
- Consumes: `stats.daily_history[dateKey]` with `is_leave`, `reason_type`, `remark`, `marked_by`
- Produces: Color-coded calendar cells and dedicated Leave Inspection Card

- [ ] **Step 1: Write the failing test**

```javascript
// tests/test_fo_calendar_leave_ui.mjs
import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

const appCode = readFileSync(resolve('dfy-frontend/src/App.jsx'), 'utf8');

// 1. Verify calendar leave color branching exists
assert(appCode.includes('dayData.is_leave'), "Calendar must check dayData.is_leave");
assert(appCode.includes('bg-amber-500') || appCode.includes('text-amber-500'), "Calendar must have amber color for Medical leave");
assert(appCode.includes('bg-sky-500') || appCode.includes('text-sky-500'), "Calendar must have sky color for Casual/Annual leave");

// 2. Verify calendar legend displays leave badges
assert(appCode.includes('Medical Leave') || appCode.includes('Sick Leave'), "Calendar legend must display Medical leave");
assert(appCode.includes('Casual / Annual') || appCode.includes('Annual Leave'), "Calendar legend must display Casual/Annual leave");

// 3. Verify leave inspection card displays admin remark
assert(appCode.includes('selectedDayData.remark'), "Inspection card must display selectedDayData.remark");
assert(appCode.includes('selectedDayData.marked_by'), "Inspection card must display selectedDayData.marked_by");

console.log("✔ FO Calendar leave UI assertions passed!");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_fo_calendar_leave_ui.mjs`
Expected: FAIL

- [ ] **Step 3: Implement minimal code in `dfy-frontend/src/App.jsx`**

1. In Calendar cell rendering (`daysInMonth.map`):
```jsx
let bgColor = "bg-slate-50 text-slate-400 border-slate-100";
if (count > 0) {
  bgColor = "bg-emerald-500 text-white font-black shadow-sm shadow-emerald-500/30 border-emerald-600";
} else if (dayData && dayData.is_leave) {
  const reason = (dayData.reason_type || '').toLowerCase();
  const status = (dayData.status || '').toLowerCase();
  if (reason.includes('med') || reason.includes('sick')) {
    bgColor = "bg-amber-500 text-white font-black shadow-sm shadow-amber-500/30 border-amber-600";
  } else if (reason.includes('cas') || reason.includes('ann') || reason.includes('pers')) {
    bgColor = "bg-sky-500 text-white font-black shadow-sm shadow-sky-500/30 border-sky-600";
  } else if (reason.includes('off') || reason.includes('train') || reason.includes('duty')) {
    bgColor = "bg-indigo-500 text-white font-black shadow-sm shadow-indigo-500/30 border-indigo-600";
  } else if (status === 'absent' || reason.includes('uninformed')) {
    bgColor = "bg-rose-500 text-white font-black shadow-sm shadow-rose-500/30 border-rose-600";
  } else if (status === 'weekly_off') {
    bgColor = "bg-slate-400 text-white font-black shadow-sm shadow-slate-400/30 border-slate-500";
  } else {
    bgColor = "bg-amber-500 text-white font-black shadow-sm shadow-amber-500/30 border-amber-600";
  }
}
```
2. In Calendar Legend:
Add color indicator pills for Submitted (Green), Medical Leave (Amber), Casual / Annual Leave (Sky), Official Duty (Indigo), Absent (Rose).
3. In Date Inspection Area (`selectedDate`):
If `selectedDayData && selectedDayData.is_leave && !selectedDayData.submitted`:
Render dedicated Leave Status Card:
```jsx
<div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 my-3 space-y-2">
  <div className="flex items-center justify-between">
    <span className="text-xs font-black uppercase text-amber-900 flex items-center gap-1.5">
      <span>🏖️</span> Approved Leave: {selectedDayData.reason_type || 'Leave'}
    </span>
    <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
      Marked by {selectedDayData.marked_by || 'Admin'}
    </span>
  </div>
  {selectedDayData.remark && (
    <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/60 text-xs text-amber-950 font-medium">
      <span className="font-bold text-amber-900 block text-[10px] uppercase">Admin Remark:</span>
      "{selectedDayData.remark}"
    </div>
  )}
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_fo_calendar_leave_ui.mjs`
Expected: PASS
Run: `npm --prefix dfy-frontend run lint`
Expected: 0 syntax errors.
Run: `npm --prefix dfy-frontend run build`
Expected: Exit code 0.

- [ ] **Step 5: Commit**

```bash
git add dfy-frontend/src/App.jsx tests/test_fo_calendar_leave_ui.mjs
git commit -m "feat(ui): implement multi-color leave calendar badges and admin remarks card in FO profile"
```

---

### Task 5: Nikshay Reconciler Name & Phone Column Detection, Persistence & Journey API

**Files:**
- Modify: `main.py:6715-6775, 6605-6635, 7590-7665`
- Test: `tests/test_reconciler_patient_contacts.py`

**Interfaces:**
- Consumes: Nikshay Excel/CSV upload with various phone and name headers
- Produces: `nikshay_verified_patients` with sanitized `phone` and `patient_name`; `/api/reports/patient-journey/{patient_id}` with `metadata.phone` and `metadata.patient_name`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_reconciler_patient_contacts.py
import pytest
from unittest.mock import patch, MagicMock
import main

@pytest.mark.asyncio
async def test_patient_journey_api_returns_patient_name_and_phone():
    with patch("main.db.collection") as mock_coll:
        mock_doc = MagicMock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {
            "patient_id": "102938475",
            "patient_name": "Ramesh Kumar",
            "phone": "9876543210",
            "district": "Muzaffarpur",
            "bank_validated": True
        }
        mock_coll.return_value.document.return_value.get.return_value = mock_doc
        mock_coll.return_value.where.return_value.where.return_value.stream.return_value = []
        
        res = await main.get_patient_journey("102938475")
        assert res.get("success") is True
        assert "metadata" in res
        assert res["metadata"].get("patient_name") == "Ramesh Kumar"
        assert res["metadata"].get("phone") == "9876543210"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_reconciler_patient_contacts.py -v`
Expected: FAIL (AssertionError: phone not in metadata)

- [ ] **Step 3: Implement minimal code in `main.py`**

1. In `reconcile_nikshay`:
Expand phone column candidates:
`phone_col = next((cols_lower[c] for c in ["primaryphone", "phone", "mobile", "mobile_no", "mobile_number", "contact_no", "contact_number", "beneficiary_mobile", "patient_mobile", "phone_number", "cell"] if c in cols_lower), None)`
Sanitize phone number:
`p_phone = re.sub(r'\D', '', str(row.get(phone_col, "")).split(".")[0])[-10:] if phone_col and not pd.isna(row.get(phone_col)) else ""`
2. In `sync_nikshay_cumulative_ledger_sync`:
Ensure `patient_name` and `phone` are updated on documents whenever current provides them.
3. In `/api/reports/patient-journey/{patient_id}`:
```python
if ledger_data:
    if ledger_data.get("patient_name"):
        patient_meta["patient_name"] = ledger_data.get("patient_name")
    if ledger_data.get("phone"):
        patient_meta["phone"] = ledger_data.get("phone")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_reconciler_patient_contacts.py -v`
Expected: PASS (1 passed)
Run: `python -m py_compile main.py`
Expected: Exit code 0

- [ ] **Step 5: Commit**

```bash
git add main.py tests/test_reconciler_patient_contacts.py
git commit -m "feat(backend): persist patient name and sanitized phone in reconciler ledger and journey API"
```

---

### Task 6: Direct Patient Contact Cards in FO App & Admin Panel

**Files:**
- Modify: `dfy-frontend/src/App.jsx:1520-1550` (`PatientJourneyTracker`)
- Modify: `dfy-frontend/src/AdminDashboard.jsx:13925-13935` (Patient Journey Drawer)
- Test: `tests/test_patient_contact_ui.mjs`

**Interfaces:**
- Consumes: `result.metadata.patient_name`, `result.metadata.phone`
- Produces: 1-tap `📞 Call Patient` (`tel:`) link, copy button, patient identity display.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/test_patient_contact_ui.mjs
import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

const appCode = readFileSync(resolve('dfy-frontend/src/App.jsx'), 'utf8');
const adminCode = readFileSync(resolve('dfy-frontend/src/AdminDashboard.jsx'), 'utf8');

// 1. Verify FO App displays patient name and phone with tel: link
assert(appCode.includes('result.metadata?.patient_name'), "FO App must render patient_name");
assert(appCode.includes('result.metadata?.phone'), "FO App must render patient phone");
assert(appCode.includes('tel:'), "FO App must have direct call link");

// 2. Verify Admin Panel journey drawer displays patient name and phone with tel: link
assert(adminCode.includes('journeyResult.metadata?.patient_name'), "Admin Dashboard must render patient_name");
assert(adminCode.includes('journeyResult.metadata?.phone'), "Admin Dashboard must render phone");
assert(adminCode.includes('tel:'), "Admin Dashboard must have direct call link");

console.log("✔ Patient contact UI tests passed!");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_patient_contact_ui.mjs`
Expected: FAIL

- [ ] **Step 3: Implement minimal code**

1. In `dfy-frontend/src/App.jsx` (`PatientJourneyTracker`):
Render Patient Name and Phone in the Overview Card:
```jsx
<div className="flex items-center gap-2 mt-1">
  <span className="text-sm font-extrabold text-slate-800">
    👤 {result.metadata?.patient_name || 'Patient'}
  </span>
  {result.metadata?.phone && (
    <div className="flex items-center gap-1.5 ml-1">
      <a 
        href={`tel:${result.metadata.phone}`}
        className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-2xs active:scale-95"
      >
        <span>📞 Call</span>
        <span className="font-mono">{result.metadata.phone}</span>
      </a>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(result.metadata.phone);
          showToast("Phone number copied!", "info");
        }}
        className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
        title="Copy Phone"
      >
        📋
      </button>
    </div>
  )}
</div>
```
2. In `dfy-frontend/src/AdminDashboard.jsx`:
Render Patient Name and Phone in the Patient Journey Drawer header with `tel:` link.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_patient_contact_ui.mjs`
Expected: PASS
Run: `npm --prefix dfy-frontend run lint`
Expected: 0 syntax errors.
Run: `npm --prefix dfy-frontend run build`
Expected: Exit code 0.

- [ ] **Step 5: Commit**

```bash
git add dfy-frontend/src/App.jsx dfy-frontend/src/AdminDashboard.jsx tests/test_patient_contact_ui.mjs
git commit -m "feat(ui): display patient name and direct-call phone button in FO tracker and admin journey drawer"
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
    node tests/test_submission_time_format.mjs
    node tests/test_fo_calendar_leave_ui.mjs
    node tests/test_patient_contact_ui.mjs
    node tests/test_refresh_and_hard_reset.mjs
    node tests/test_attendance_radar_mobile_layout.mjs
    node tests/test_fdc_rationing_stepper.mjs
    ```
- [ ] **Step 2: Git Diff Audit**
  - Line-by-line review of `git diff` against `origin/main`.
- [ ] **Step 3: User Approval Gate**
  - Compile evidence summary in `walkthrough.md`.
  - Present results to user and wait for explicit approval before running `git push origin main`.
