# Design Specification: Designation-Aware Statewide Top Performers & Full-Width Dashboard Layout

**Date:** 2026-09-26  
**Status:** Approved by User  
**Target Environments:** Backend (`main.py`) & Admin Dashboard (`dfy-frontend/src/AdminDashboard.jsx`)  
**Scope Isolation:** Strictly Admin Dashboard & Backend Analytics. Field Officer Mobile Web App (`App.jsx`) remains unchanged.

---

## 1. Executive Summary & Problem Statement

### Background
In the previous phase, the legacy "Work Balance Radar" was removed from `AdminDashboard.jsx` and replaced with the **Bihar Top Performers Studio** bento card. Currently, this card displays top 5 districts and top 5 field officers purely ranked by notifications.

### Motivation & User Requirements
Frontline healthcare operations in Bihar are structured into distinct functional designations with specific clinical responsibilities and targets:
1. **Lab Technicians (LT)**: Core responsibility is clinical sputum testing and lab result uploads. Their performance must be measured by **Tests Performed** (`sample_tested_ids` / `tests`).
2. **Hub Agents**: Field officers positioned at high-volume urban medical centers and prominent OPD clinics where patient footfall is intensive. Their performance is measured by **Notifications** (`notification_ids` / `notifications`) under higher volume thresholds.
3. **Sputum Collection & Transport (SCT) Agents**: Frontline personnel dedicated to field sputum collection from patient homes, delivery to designated microscopy centres (DMC), accompanying drug delivery, and screening. Their primary performance metric is **Samples Collected** (`sample_collection_ids`).
4. **Field Officers (FO)**: General frontline officers driving active case-finding, community referrals, and notifications (`notification_ids` / `notifications`).
5. **District Coordinators (DC)**: District operational managers measured by **Overall District Target Achievement %** and Notification Volume.

### Key Capabilities Required
1. **Dynamic Designation Mapping & Instant Shift**: When an admin updates an officer's designation in the Staff Directory (e.g., from FO to Hub Agent or SCT Agent), the change must immediately synchronize. Historical reports for the period must dynamically associate with the officer's updated role without requiring backdated record mutations.
2. **Dedicated Role Tabs in Top Performers Studio**:
   - `🏛️ Top Districts (DC)`
   - `📋 Top FO & Hub Agents` (with clear visual badges distinguishing `FO` vs `HUB AGENT`)
   - `🔬 Top Lab Technicians (LT)` (ranked by tests performed)
   - `🧪 Top SCT Agents` (ranked by sputum samples collected)
3. **Dashboard Visual Layout Enhancement**:
   - **Top Section (Full Width)**: `🏆 Bihar Statewide Top Performers Studio` moves to the top as a full-width showcase banner.
   - **Bottom Section (Full Width)**: `📈 Daily Progression Trend (Day 1 - 30)` expands to full width below the Leaderboard, giving the 30-day progression line chart optimal breathing room and readability across desktop and mobile.
4. **HD WhatsApp Poster & Text Updates**:
   - Client-side Canvas (1200x1350) renders the champions across all 4 categories.
   - WhatsApp share button generates pre-formatted text demarcating all 4 role leaderboards with appropriate emojis.

---

## 2. Clinical Metric & Role Definitions

| Role / Designation | UI Tab | Key Performance Indicator (KPI) | Source Field in Reports | Ranking Metric |
| :--- | :--- | :--- | :--- | :--- |
| **District Coordinator (DC)** | `🏛️ Top Districts (DC)` | District Target Achievement % & Total Notifications | `working_place`, `district`, `dist_targets` | Percentage descending, notifications descending |
| **Field Officer (FO)** | `📋 Top FO & Hub` | Frontline TB Case Notification Volume | `notification_ids` (len) or `notifications` (int) | Notifications descending |
| **Hub Agent** | `📋 Top FO & Hub` (Badge: `HUB`) | High-Volume Hospital Case Notifications | `notification_ids` (len) or `notifications` (int) | Notifications descending |
| **Lab Technician (LT)** | `🔬 Top LT` | Clinical Diagnostic Testing Volume | `sample_tested_ids` (len) or `tests` (int) | Tests descending |
| **SCT Agent** | `🧪 Top SCT` | Field Sputum Collection & Transport Volume | `sample_collection_ids` (len) or `sample_collection` | Collections descending |

---

## 3. Backend Architecture (`main.py`)

### 3.1 Dynamic Designation Resolution Engine
Rather than relying on static or potentially missing `designation` fields inside individual daily report submissions, the backend dynamically queries Firestore `staff_directory` and caches a normalized officer lookup map:

```python
# Staff designation map cache key: "staff_directory_map" (TTL: 180s)
staff_meta = {
    # key: normalize_staff_key(canonical_district, canonical_name)
    # value: {"designation": "Hub Agent", "target": 75, "is_active": True}
}
```

- If an officer's designation in `staff_directory` is `"Lab Technician"` or contains `"LT"`, their reports aggregate into the **LT** bucket.
- If designation is `"SCT Agent"` or contains `"SCT"` or `"Sputum"`, their reports aggregate into the **SCT** bucket.
- If designation is `"Hub Agent"` or contains `"Hub"`, their reports aggregate into the **FO & Hub** bucket with `designation: "Hub Agent"`.
- Otherwise (default `"Field Officer"`), their reports aggregate into the **FO & Hub** bucket with `designation: "Field Officer"`.

### 3.2 Endpoint: `GET /api/statewide-top-performers`
- **Parameters**: `month` (e.g. `2026-09`), `period` (`weekly`, `fortnightly`, `monthly`).
- **Authorization**: Super-Admin or Sub-Admin (no district RBAC restriction; pre-aggregated leaderboard data contains 0 patient PII).
- **Response Schema**:
```json
{
  "success": true,
  "month": "2026-09",
  "period": "monthly",
  "start_date": "2026-09-01",
  "end_date": "2026-09-26",
  "top_districts": [
    { "rank": 1, "district": "Gaya", "notifications": 142, "target": 120, "percentage": 118.3 }
  ],
  "top_fo": [
    { "rank": 1, "fo_name": "Ramesh Kumar", "district": "Patna", "designation": "Hub Agent", "metric_value": 45, "metric_label": "notifications" }
  ],
  "top_lt": [
    { "rank": 1, "fo_name": "Suresh Singh", "district": "Muzaffarpur", "designation": "Lab Technician (LT)", "metric_value": 88, "metric_label": "tests" }
  ],
  "top_sct": [
    { "rank": 1, "fo_name": "Amit Sharma", "district": "Jamui", "designation": "SCT Agent", "metric_value": 62, "metric_label": "collections" }
  ]
}
```

### 3.3 Cache Invalidation on Staff Mutation (`/admin/staff/update-details`)
When an administrator edits a staff member's designation via `POST /admin/staff/update-details`:
1. Document in `staff_directory` is updated with `designation: clean_desig`.
2. Cache keys `staff_directory_map`, `staff_directory`, and all matching `statewide_top_*` keys are cleared immediately from `SimpleTTLCache`.
3. Subsequent calls to `/api/statewide-top-performers` instantly reflect the officer under their new designation bucket.

---

## 4. Frontend Architecture (`AdminDashboard.jsx`)

### 4.1 Staff Management Modal Designation Options
In `addStaffModal` and `pinChangeModal`, expand the `<select>` options to include:
- `Field Officer`
- `Hub Agent`
- `SCT Agent`
- `Lab Technician (LT)`
- `District Coordinator (DC)`
- `Senior Treatment Supervisor (STS)`
- `TB Health Visitor (TBHV)`
- `State Health Coordinator`

### 4.2 Dashboard Layout Restructuring
Replace the previous 2:1 column grid (`grid-cols-1 lg:grid-cols-3`):
```jsx
{/* Top Full-Width Showcase: Bihar Top Performers Studio */}
<div className="w-full mb-6">
  <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-5 rounded-2xl shadow-md border border-indigo-900/60 relative overflow-hidden">
    {/* Tab Bar: DC / Districts | FO & Hub | Lab Technicians | SCT Agents */}
    ...
  </div>
</div>

{/* Bottom Full-Width Analytics: Daily Progression Trend */}
<div className="w-full bg-white p-5 rounded-2xl shadow-sm border border-slate-100 mb-6">
  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-3 pb-3 border-b border-slate-100">
    <h3 className="text-slate-800 font-black text-base">
      Daily Progression Trend (Day 1 - {dailyTrendStats.totalDays})
    </h3>
  </div>
  <div className="h-72 w-full">
    {/* Full-width Responsive AreaChart */}
  </div>
</div>
```

### 4.3 Tab Switching State
State `topPerformersTab` supports:
- `'districts'`: Top 5 Districts (Rank, District, Notifications, Target %).
- `'fo'`: Top 5 Field Officers & Hub Agents (Rank, Name, District, Designation Badge, Notifications).
- `'lt'`: Top 5 Lab Technicians (Rank, Name, District, Tests Performed).
- `'sct'`: Top 5 SCT Agents (Rank, Name, District, Sputum Collections).

### 4.4 HD Canvas Poster Generator (1200x1350)
- The Canvas renders a 4-tier / 4-card layout featuring the statewide leaders of:
  - 🏛️ Top Districts (DC)
  - 📋 Top Field Officers & Hub Agents
  - 🔬 Top Lab Technicians (LT)
  - 🧪 Top SCT Agents
- Footer with timestamp in Indian Standard Time (IST).

---

## 5. Verification & Safety Battery

1. **Python Compilation**: `python -m py_compile main.py` (Must exit code 0).
2. **Backend Unit Tests**: Verify `/api/statewide-top-performers` correctly segments FO, Hub, LT, and SCT roles; verify cache eviction.
3. **Frontend Linter**: `npm --prefix dfy-frontend run lint` (0 syntax errors).
4. **Frontend Production Build**: `npm --prefix dfy-frontend run build` (Must exit code 0).
5. **UI Assertion Test**: Automated node script verifying presence of 4 tabs, role badges, full-width Daily Progression Trend, and no TDZ references.
6. **Zero-Leakage & Privacy**: No patient IDs or PII on public posters or unauthenticated endpoints.
7. **Offline Inspection Gate**: Testing locally on `http://localhost:5173` and `http://localhost:8000` before user grants approval for `git push`.
