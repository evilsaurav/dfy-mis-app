# Technical Specification: Month Boundary Reconciliation, Dynamic Working-Days Calendar Pacing Engine, & 12:00 PM Grace Cutoff Protocol

- **Target Systems**: `main.py` (FastAPI Backend), `dfy-frontend/src/AdminDashboard.jsx`, `dfy-frontend/src/App.jsx`
- **Date**: 2026-10-01
- **Status**: Approved for Planning & Implementation
- **Environment**: Production Live (DFY Bihar TB Elimination Monitoring System)

---

## 1. Executive Summary & Root Cause Analysis

### 1.1 The Incident
On the morning of October 1st, 2026 (Day 1 of the new calendar month), the Admin Dashboard's **Target Pacing & Forecaster** card on the Overview tab displayed anomalous metrics for the selected month of September 2026:
- **Scope Target & Actual**: `6285 / 7711 Notif`
- **Current Daily Pace**: `6285.0 Notif/Day`
- **Month-End Projection**: `188550 Notifications (2445%)`
- **Days Remaining**: `29 Days`
- **Required Pace**: `49.2 Notif/Day`

### 1.2 Mathematical Root Cause
In `dfy-frontend/src/AdminDashboard.jsx` (lines 7004–7024), an isolated inline IIFE was calculating pacing metrics with four major architectural defects:
1. **Hardcoded Month Length**: `const daysInMonth = 30;` was hardcoded, completely ignoring 31-day months (January, March, May, July, August, October, December) and 28/29-day February.
2. **Real-World Date Collision with Historical Data**: `const todayDate = new Date().getDate();` obtained the real-world calendar day (October 1st = `1`). When the user selected September (a completed 30-day month with 6,285 notifications), the formula divided the entire month's total by `1`, yielding an astronomical `6285.0 Notif/Day`.
3. **Runaway Extrapolation**: `projectedTotal = Math.round(Number(currentDailyRate) * daysInMonth);` multiplied `6285.0 * 30`, projecting `188,550` notifications (`2445%` achievement).
4. **Zero Sunday / Holiday Calendar Subtraction**: The card failed to subtract Sundays (typically 4 or 5 per month) and admin-declared holidays, unlike the dedicated Staff Pacing Studio (`workingDaysInfo`).

### 1.3 Month-End Grace Reporting Disconnect (12:00 PM Cutoff)
Frontline field officers submitting reports on Day 1 of the month before 12:00 PM Noon are reporting on the final day of the previous month (e.g. September 30th). 
- In `main.py`, `resolve_effective_reporting_date` maps these submissions to the previous month.
- However, `AdminDashboard.jsx` and `App.jsx` defaulted to the new month (`2026-10`) on mount, hiding active September closing data from coordinators and field officers.
- In `main.py` line 1812 (`check_today_status`), an unaligned check `now_ist.hour < 10` prevented proper lookup of yesterday's report between 10:00 AM and 12:00 PM on Day 1.

---

## 2. Architecture & Design Specifications

### 2.1 Component 1: Centralized Operational Month Resolver
A shared helper resolves whether the operational context is currently in the **Month-End Grace Window**:

#### Logic Rules:
- **Condition**: `current_day == 1` AND `current_hour_ist < 12` (before 12:00 PM Noon).
- **Result**:
  - `operational_month`: Previous month (`YYYY-MM` of yesterday).
  - `is_grace_window`: `true`.
  - `grace_label`: `"September Month-End Reconciliation Window Active until 12:00 PM Noon"`.
- **Otherwise**:
  - `operational_month`: Current calendar month (`YYYY-MM` of today).
  - `is_grace_window`: `false`.

#### Implementation:
- **Frontend (`dfy-frontend/src/utils/operationalMonth.js` or inline helper)**:
  - Used for `useState` initial values of `month` in `AdminDashboard.jsx` and `App.jsx`.
- **Backend (`main.py`)**:
  - `get_active_operational_month(now_ist: datetime) -> str`: Used as fallback default when `month` query parameter is omitted in `/admin/dashboard-stats`, `/api/statewide-top-performers`, and `/my-profile-stats`.

---

### 2.2 Component 2: Unified Working Days & Target Pacing Calendar Engine

Replace the buggy inline IIFE in `AdminDashboard.jsx` (lines 7004–7056) by connecting it directly to the existing `workingDaysInfo` calendar model.

#### Calendar Formulas:
For any selected month (`YYYY-MM`):
1. **Total Days in Month**:
   $$N_{\text{days}} = \text{Date}(Y, M, 0).\text{getDate}()$$ (31 for Oct, 30 for Sep, 28/29 for Feb).
2. **Total Sundays**:
   Iterate $d \in [1, N_{\text{days}}]$ where $d.\text{getDay}() == 0$. Yields 4 or 5 Sundays.
3. **Total Working Days**:
   $$W_{\text{total}} = \max(1, N_{\text{days}} - \text{Sundays} - \text{DeclaredHolidays})$$
4. **Three State-Machine Modes**:

##### Mode 1: Past Month (`year < curYear || (year === curYear && monthIdx < curMonthIdx)`)
- State: **Finalized / Completed Month**.
- $W_{\text{elapsed}} = W_{\text{total}}$
- $W_{\text{remaining}} = 0$
- $\text{DaysRemaining} = 0$
- $\text{CurrentDailyPace} = \text{TotalAchieved} / W_{\text{total}}$
- $\text{RequiredPace} = 0.0\text{ Notif/Day}$
- $\text{MonthEndProjection} = \text{TotalAchieved}$
- $\text{ProjectedPercentage} = \text{Target} > 0 ? \text{round}((\text{TotalAchieved} / \text{Target}) \times 100) : 100\%$

##### Mode 2: Current Month (`year === curYear && monthIdx === curMonthIdx`)
- State: **Live Active Pacing**.
- $\text{EffectiveElapsedCalendarDays} = \min(\text{CurrentDay}, N_{\text{days}})$
- $\text{ElapsedSundays} = \text{Sundays before or on EffectiveElapsedCalendarDays}$
- $W_{\text{elapsed}} = \max(0, \min(W_{\text{total}}, \text{EffectiveElapsedCalendarDays} - \text{ElapsedSundays} - \text{ElapsedHolidays}))$
- $W_{\text{remaining}} = \max(0, W_{\text{total}} - W_{\text{elapsed}})$
- $\text{DaysRemaining} = W_{\text{remaining}}$
- $\text{CurrentDailyPace} = W_{\text{elapsed}} > 0 ? \text{round}(\text{TotalAchieved} / W_{\text{elapsed}}, 1) : \text{TotalAchieved}$
- $\text{PendingTarget} = \max(0, \text{Target} - \text{TotalAchieved})$
- $\text{RequiredPace} = W_{\text{remaining}} > 0 ? \text{round}(\text{PendingTarget} / W_{\text{remaining}}, 1) : 0.0$
- $\text{MonthEndProjection} = \text{round}(\text{TotalAchieved} + (\text{CurrentDailyPace} \times W_{\text{remaining}}))$
- $\text{ProjectedPercentage} = \text{Target} > 0 ? \text{round}((\text{MonthEndProjection} / \text{Target}) \times 100) : 100\%$

##### Mode 3: Future Month
- State: **Pre-Month Planning**.
- $W_{\text{elapsed}} = 0$, $W_{\text{remaining}} = W_{\text{total}}$
- $\text{DaysRemaining} = W_{\text{total}}$
- $\text{CurrentDailyPace} = 0.0$
- $\text{RequiredPace} = \text{Target} / W_{\text{total}}$
- $\text{MonthEndProjection} = 0$

---

### 2.3 Component 3: Backend Cutoff Synchronization & Boundary Hardening (`main.py`)

1. **`check_today_status` Alignment ([Line 1812](file:///d:/ignou/Mis%20field%20report/main.py#L1812))**:
   - Change:
     ```python
     cutoff_hour = get_reporting_cutoff_hour(now_ist)
     if res.get("status") != "completed" and now_ist.hour < cutoff_hour and req.date == today_str:
     ```
   - Benefit: Seamless continuity between 10:00 AM and 12:00 PM on Day 1.

2. **`get_statewide_top_performers` Default Fallback ([Line 1246](file:///d:/ignou/Mis%20field%20report/main.py#L1246))**:
   - Change: When `month` is `None` on Day 1 before 12:00 PM, fall back to `(now_dt - timedelta(days=1)).strftime("%Y-%m")` to preserve previous month's podium.

3. **`my_profile_stats` Working Days Alignment ([Line 3555](file:///d:/ignou/Mis%20field%20report/main.py#L3555))**:
   - Change: If requested month is a past month, strictly set `day_of_month = total_days`, `remaining_working_days = 0`, and `required_run_rate = 0.0`.

---

### 2.4 Component 4: Non-Intrusive UI Reassurance Banners

1. **`AdminDashboard.jsx`**:
   - When Day 1 before 12:00 PM: Display a top banner above the metrics:
     > ⏳ **September Month-End Reconciliation Window Active**: Reporting for September remains open until 12:00 PM Noon. Showing September data by default. `[Switch to October]`
2. **`App.jsx`**:
   - When Day 1 before 12:00 PM: Display a subtle info card on the Home screen:
     > 📋 **Reporting Notice**: Reports submitted this morning before 12:00 PM Noon will count toward your September monthly target.

---

## 3. Data Integrity & Security Guarantees

- **No Schema Breaking**: All JSON request/response structures remain 100% backward compatible.
- **Zero Stealth Cutoff Leakage**: The internal 10 AM/11 AM technical cutoff remains confidential; users are informed only of the official 12:00 PM Noon month-end close window.
- **Sub-Admin Isolation**: Sub-Admin allowed district filters are strictly maintained across all pacing and benchmark derivations.

---

## 4. Verification Battery & Test Plan

1. **Unit Test Suite (`tests/test_month_boundary_and_pacing.py`)**:
   - Test A: September pacing when evaluated on October 1st yields exact 0 days remaining, exact achieved projection (6285), and correct percentage (81.5%).
   - Test B: October pacing on October 1st accurately counts 31 calendar days, 4 Sundays, and calculates realistic velocity.
   - Test C: `check_today_status` on Day 1 at 10:30 AM returns completed report from previous month.
   - Test D: `get_reporting_cutoff_hour` returns 12 on Day 1 and 11 on other days.
2. **Frontend UI Mock Test (`tests/test_admin_pacing_ui.mjs`)**:
   - Test A: Verify Overview card displays 0 days remaining when viewing a past month.
   - Test B: Verify Overview card displays dynamic working days when viewing the current month.
3. **Production Standard Battery**:
   - `python -m py_compile main.py` (Exit code 0).
   - `npm --prefix dfy-frontend run lint` (0 syntax errors).
   - `npm --prefix dfy-frontend run build` (Exit code 0).
