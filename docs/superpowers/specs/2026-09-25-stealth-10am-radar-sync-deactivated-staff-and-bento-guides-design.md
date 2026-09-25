# Technical Design Specification: Stealth 10 AM Radar Sync, Deactivated Staff Roster Defense, Master Table Cohort Docs & Native Bento Visual Flowcharts

- **Date**: September 25, 2026
- **Status**: Approved by User (Option A & Question 2 Confirmed)
- **Target Platform**: Production Bihar TB MIS (FastAPI + React 19 + Tailwind CSS + Firestore)
- **Author**: Antigravity & DFY Core Platform Engineering

---

## 1. Executive Summary & Problem Analysis

### 1.1 Context & Incident Background
The Bihar TB MIS application is actively deployed in live production, serving state coordinators and district field officers across Bihar. During live operational review on September 25, 2026, four issues and feature requirements were identified:

1. **Attendance Radar Stealth 10 AM Cutoff Root-Cause Fix & Attribution UI**:
   - Several field officers submitted reports between `07:39 AM` and `09:26 AM` on Sept 25 (e.g. Shashi Ranjan 09:26 AM, Ram Prakash 08:25 AM, Munna Kumar 08:21 AM, Nilkamal Kumar 08:10 AM, Diwakar Kumar 07:39 AM).
   - Rather than being credited to yesterday (Sept 24), these reports appeared in **Today's Submitted** tagged as `Mid-Day (< 5 PM)`.
   - **Root Cause**: `resolve_effective_reporting_date` in `main.py` only rerouted submissions to yesterday `if not exists`. Because staff report daily, a report for yesterday almost always already exists, causing the check to evaluate to `False` and fall through to today's date.
   - **Requirement**: Any submission before 10:00 AM IST must unconditionally count towards Yesterday ($D-1$), with metadata recording the next-day morning submission (`⏰ Next day morning HH:MM AM`). Today's ($D$) radar must strictly show submissions completed $\ge$ 10:00 AM IST.

2. **Purushotam Kumar Deactivated Staff Showing in Defaulters**:
   - Field Officer Purushotam Kumar in Sitamarhi was deactivated (`sitamarhi_purushottamkumar`), yet he continued to appear in the Defaulters list.
   - **Root Cause**: In Firestore `staff_directory`, his document is `sitamarhi_purushottamkumar` (two 't's), whereas in the directory snapshot `staffDirectory['Sitamarhi']` his name is `"Purushotam Kumar"` (one 't'). In `AdminDashboard.jsx`, `inactiveCutoffMap` keys were built with exact stripped lowercase names, returning `undefined` for `"sitamarhi_purushotamkumar"`, thereby bypassing the inactive filter.
   - **Requirement**: Implement dual-layer defense: consonant-collapsed normalization (`replace(/(.)\1+/g, '$1')`) and cross-referencing `staffList` active status directly.

3. **Master Detailed Table: Documents Section Current & Previous Month Cohort**:
   - In `AdminDashboard.jsx`, the master summary table displays `Tests`, `HIV/DM`, and `Contact Tracing` with Current Month vs Previous Month cohort breakdowns (`C:X | P:Y`), reacting to the `masterTableCohortFilter` toggle (`all`, `current_cohort`, `backlog`).
   - The `Docs` (`documents`) column currently only displays a flat total (`row.documents`).
   - **Requirement**: Calculate `documents_cur` and `documents_prev` using `currentMonthNotifIdSet.has(id)` for every ID in `documents_ids`, and render `C:{row.documents_cur} | P:{row.documents_prev}` in the table cell with full filter reactivity.

4. **Admin Panel SOP & FO App Guide: 100% Native Bento Visual Flowcharts**:
   - Overhaul all remaining text topics in `FoHelpGuide` (`App.jsx`) and `showAppGuideModal` (`AdminDashboard.jsx`) into responsive, native Bento Visual Flowcharts (cards, visual sequence arrows 1➔2➔3, status chips, responsive Tailwind grids).
   - **CRITICAL ZERO-LEAKAGE PRIVACY CONSTRAINT**: The Stealth 10:00 AM Cutoff is strictly internal backend & Admin SOP. The FO Guide must **NEVER** mention the 10 AM cutoff.

5. **Staff Attendance Dual-Sheet Excel Generator**:
   - In `/admin/export-staff-attendance`, Sheet 1 remarks column must append `(Next Day Morning)` if the report was submitted on the morning of the subsequent day (< 10 AM IST).

6. **Live Morning Data Migration**:
   - Execute a safe, idempotent backend migration script to reassign/merge reports submitted this morning (< 10:00 AM on Sept 25) by Shashi Ranjan, Ram Prakash, Munna Kumar, Nilkamal Kumar, and Diwakar Kumar into `2026-09-24`, so the live radar immediately reflects yesterday's submission.

---

## 2. Technical Architecture & System Changes

### 2.1 Backend: Strict Stealth 10 AM Cutoff Engine (`main.py`)

#### Unconditional Cutoff Resolution
In `resolve_effective_reporting_date(fo_name, working_place, requested_date)`:
```python
now_ist = get_ist_now()
today_str = now_ist.strftime("%Y-%m-%d")
yesterday_str = (now_ist - timedelta(days=1)).strftime("%Y-%m-%d")

# Preserve explicit historical edits older than yesterday
if requested_date and requested_date < yesterday_str:
    return requested_date

# Unconditional cutoff: submissions before 10:00 AM IST strictly map to yesterday
if now_ist.hour < 10:
    return yesterday_str

return requested_date or today_str
```

#### Next-Day Morning Submission Metadata
In `submit_daily_report(report)`:
```python
now_ist = get_ist_now()
if now_ist.hour < 10 and not (report.date_of_reporting and report.date_of_reporting < yesterday_str):
    morning_time = format_to_ist_time(now_ist)
    payload["is_next_day_submission"] = True
    payload["submitted_morning_time"] = morning_time
    payload["morning_submission_label"] = f"Next day morning {morning_time}"
```

#### Attendance Radar Segregation (`/admin/today-attendance`)
When `target_date` is requested:
1. Target date $D$ includes:
   - Reports where `date_of_reporting == target_date` and `timestamp_completed` $\ge$ 10:00 AM IST of date $D$.
   - PLUS reports where `date_of_reporting == target_date` and `timestamp_completed` is on date $D+1$ before 10:00 AM IST (`is_next_day_submission == True`).
2. Reports submitted on date $D$ before 10:00 AM IST are attributed to date $D-1$ and are excluded from date $D$'s submitted roster.
3. For next-day submissions, the API returns:
   ```json
   {
     "is_next_day": true,
     "submitted_time": "08:25 AM",
     "submitted_label": "Next day morning 08:25 AM",
     "time_classification": "Next Day Morning (< 10 AM)"
   }
   ```

#### Attendance Excel Export (`/admin/export-staff-attendance`)
In Sheet 1 (Daily Roster), for any day where `is_next_day_submission` is True, append `(Next Day Morning)` to the remarks column:
```python
if is_next_day:
    remarks.append(f"Submitted next morning ({morning_time})")
```

---

### 2.2 Inactive Staff Roster Matching & Defaulter Exclusion (`AdminDashboard.jsx` & `main.py`)

#### Consonant-Collapsed Normalization Helper
Add a shared normalization utility:
```javascript
const normalizeStaffKey = (dist, name) => {
  const d = canonicalizeDistrict(dist || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const n = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(.)\1+/g, '$1');
  return `${d}_${n}`;
};
```
- `"Sitamarhi"` + `"Purushottam Kumar"` $\to$ `"sitamarhi_purushotamkumar"`
- `"Sitamarhi"` + `"Purushotam Kumar"` $\to$ `"sitamarhi_purushotamkumar"`
- Matching is 100% deterministic regardless of single or double letters!

#### Direct `staffList` Status Exclusion
In `chronicDefaulters` and `filteredMissing`:
1. Build `inactiveSet` and `inactiveCutoffMap` indexing both exact and consonant-collapsed keys.
2. If `inactiveCutoffMap[foKey]` or `inactiveCutoffMap[normKey]` is defined and `attendanceDate >= cutoff`, exclude immediately.
3. Also check if the officer in `staffList` has `is_active === false` or `status === 'inactive'`. If so, exclude immediately.

---

### 2.3 Master Detailed Table: Documents Current & Previous Cohort (`AdminDashboard.jsx`)

#### Cohort Calculation in `tableData` Memo
In `AdminDashboard.jsx:tableData`:
```javascript
// Initialization
documents_cur: 0,
documents_prev: 0,

// Computation per record
(r.documents_ids || []).forEach(id => {
  const clean = String(id).trim();
  if (clean) {
    if (currentMonthNotifIdSet.has(clean)) map[key].documents_cur += 1;
    else map[key].documents_prev += 1;
  }
});
```

#### Sorting Support in `requestSort`
```javascript
if (masterTableCohortFilter === 'current_cohort') {
  if (sortKey === 'documents') return row.documents_cur;
} else if (masterTableCohortFilter === 'backlog') {
  if (sortKey === 'documents') return row.documents_prev;
}
```

#### Table Cell Rendering
```jsx
<td className="p-3 tabular-num font-semibold text-slate-700">
  {masterTableCohortFilter === 'current_cohort'
    ? (row.documents_cur > 0 ? row.documents_cur : <span className="text-slate-300 font-normal">—</span>)
    : masterTableCohortFilter === 'backlog'
    ? (row.documents_prev > 0 ? row.documents_prev : <span className="text-slate-300 font-normal">—</span>)
    : (
      <span>
        {row.documents > 0 ? row.documents : <span className="text-slate-300 font-normal">—</span>}
        {row.documents > 0 && (row.documents_cur > 0 || row.documents_prev > 0) && (
          <span className="text-[9px] font-medium text-slate-400 block -mt-0.5">
            C:{row.documents_cur} | P:{row.documents_prev}
          </span>
        )}
      </span>
    )}
</td>
```

---

### 2.4 Complete Native Bento Visual Flowcharts

#### FO App Field Guide (`App.jsx`)
Transform all remaining guide topics into interactive, visual bento structures:
1. **Daily Field Reporting Workflow**: 4-card sequence (District & PIN Selection ➔ TB Notification Box ➔ Interventions & FDC ➔ Travel KM & Remarks) with step numbers, connectors, and callout tips.
2. **Duplicate Notification vs Repeat Visit**: Dual-card side-by-side bento with Red (Hard Block) vs Amber (Repeat Legitimate Visit) visual comparison cards.
3. **Offline Sync & Vault Architecture**: Visual diagram showing Phone Storage (Encrypted IndexedDB) ➔ Network Detection ➔ Cloud Upload with zero-loss shield badges.
4. **24-Hour Self-Correction Window**: 3-step visual ladder (Profile Tab ➔ Select Date ➔ Pencil Edit / Cross Delete) with 24h countdown badge.
5. **Patient Tracker & Nikshay Journey**: Visual status progression ladder (Green Shield Verified ➔ Blue Under Review ➔ Gray Pending).
6. **Ergonomics & Fast Data Entry**: 4-tile bento showcasing Sticky Quick-Jump Pills, Numeric Dialpad, Live 9-Digit Badge, and Removable Tag Chips.
7. **Attendance Roster & Calendar**: 6-tile color key grid for P, ML, CL, OD, A, WO with supervisor remark inspection card preview.

#### Admin SOP Modal (`AdminDashboard.jsx`)
Transform all 10 topics in `showAppGuideModal` into comprehensive Bento Visual Flowcharts:
- Daily Notification Verification Tray & 24-Column Copy.
- Nikshay Reconciler & Permanent Verification Ledger.
- Attendance Radar & Retroactive Inspection Remarks.
- Staff Target Pacing & Forecast Models.
- Staff Directory & Duty PIN Management.
- Duplicate Radar & 1-Click Fix Engine.
- Multi-District Staff Attendance Dual-Sheet Excel Generator.
- Sub-Admin District Boundary Protection (RBAC).
- Operational Field FAQs.

#### Zero-Leakage Privacy Rule
In `App.jsx`, **no mention** of the 10:00 AM cutoff exists. The standard reporting deadline remains communicated as 7:00 PM evening. The 10:00 AM grace mechanism is strictly documented in the internal Admin SOP.

---

### 2.5 Live Morning Data Migration Script

Create and execute `scripts/migrate_morning_reports.py`:
- Target reports on `2026-09-25` submitted before `10:00:00 IST` for Shashi Ranjan, Ram Prakash, Munna Kumar, Nilkamal Kumar, and Diwakar Kumar.
- Merge the IDs and metadata into their respective `2026-09-24` documents.
- Set `is_next_day_submission = True` and `submitted_morning_time = formatted_time`.
- Invalidate relevant Redis/Memory cache keys (`attendance_2026-09-24_*`, `attendance_2026-09-25_*`).

---

## 3. Verification Battery & Acceptance Criteria

1. **Compilation**: `python -m py_compile main.py` exits code 0.
2. **Automated Backend Tests**:
   - `pytest tests/test_stealth_10am_cutoff.py -v`: 100% pass for unconditional cutoff and next-day attribution.
   - `pytest tests/test_staff_attendance_export.py -v`: 100% pass for Sheet 1 next-day morning notes.
   - `pytest tests/test_retroactive_attendance_remarks.py -v`: 100% pass for remarks and overrides.
3. **Automated Frontend Tests**:
   - `node tests/test_deactivated_staff_alias.mjs`: Purushotam Kumar excluded from defaulters across spellings.
   - `node tests/test_master_table_cohort_ui.mjs`: Documents column renders `C:X | P:Y` and reacts to cohort toggle.
   - `node tests/test_visual_flowcharts_ui.mjs`: Complete bento flowchart coverage and zero leakage in FO Guide.
4. **Build & Lint**:
   - `npm --prefix dfy-frontend run lint` exits with 0 syntax errors.
   - `npm --prefix dfy-frontend run build` exits code 0.
5. **Temporal Dead Zone (TDZ) Audit**: Zero uninitialized hook references in `AdminDashboard.jsx` and `App.jsx`.
6. **Version Bump**: `APP_VERSION = "2.8.3"` in `changelogData.js`.
