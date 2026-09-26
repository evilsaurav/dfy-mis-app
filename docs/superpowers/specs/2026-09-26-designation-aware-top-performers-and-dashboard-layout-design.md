# Design Specification: FO Achievement Studio & Admin Designation-Aware Top Performers

**Date:** 2026-09-26  
**Status:** Approved by User  
**Target Environments:** 
1. Field Officer Mobile Web App (`dfy-frontend/src/App.jsx`)
2. Centralized Admin Dashboard (`dfy-frontend/src/AdminDashboard.jsx`)
3. Backend Analytics & Staff Engine (`main.py`)

---

## 1. Executive Summary & Problem Statement

### Background & User Directive
Frontline healthcare operations in Bihar for TB elimination encompass two deeply connected operational pillars:
1. **Frontline Field Officer Gamification & Recognition (FO App)**:
   Field Officers and frontline staff need tangible recognition and visual pride for their daily dedication. The user requested:
   > *"Location: Field Officer Profile (MyProfileDashboard in App.jsx)*  
   > *Jab Field Officer apne app me 'Profile' tab kholega: Honors & Badges Showcase:*  
   > *🎯 Target Achiever / Star (100%+, 75%+, 50%+)*  
   > *⚡ Punctuality Streak (🔥 7-Day Active Streak)*  
   > *🩺 Cascade Champion (Sputum testing, DBT, HIV/DM)*  
   > *🏍️ Field Trail Blazer (Total travel KM)*  
   > *'📲 Share My Achievement Card' Button with Live Preview Modal, Canvas HD PNG generator & WhatsApp sharing."*

2. **Statewide Designation-Aware Leaderboard & Full-Width Layout (Admin Dashboard)**:
   In the Admin Dashboard, the leaderboard must recognize distinct clinical roles:
   - **Lab Technicians (LT)**: Ranked by **Tests Performed** (`sample_tested_ids` / `tests`).
   - **Hub Agents**: High-volume clinical center officers ranked by **Notifications** with distinct `HUB AGENT` badges.
   - **SCT Agents**: Sputum collection personnel ranked by **Sputum Collections** (`sample_collection_ids`).
   - **Field Officers (FO)**: Ranked by **Notifications** (`notification_ids` / `notifications`).
   - **District Coordinators (DC)**: Ranked by **District Target Achievement % & Volume**.
   - **Instant Designation Shift**: When an admin updates an officer's designation in Staff Management, their historical reports dynamically move to their new designation pool immediately.
   - **Layout Restructure**: `🏆 Bihar Statewide Top Performers Studio` sits as a full-width showcase on top, and `📈 Daily Progression Trend (Day 1 - 30)` expands to full width directly below it.

---

## 2. Part 1: Field Officer Profile Honors, Badges & Achievement Card Studio (`App.jsx`)

### 2.1 Four Dynamic Honors & Badges in `MyProfileDashboard`
In `dfy-frontend/src/App.jsx`, inside `MyProfileDashboard`, calculate and display 4 dynamic clinical milestone badges:

1. 🎯 **Target Achiever / Star**:
   - `percent >= 100`: 🌟 **TB Eliminator (100%+ Target)** (Emerald / Gold Glowing Badge)
   - `percent >= 75`: ⭐ **Pacesetter (75%+ Target)** (Cyan / Teal Badge)
   - `percent >= 50`: 🎯 **Rising Star (50%+ Target)** (Amber / Orange Badge)
   - Default: 🎯 **Target Challenger** (Slate Badge)

2. ⚡ **Punctuality Streak**:
   - `streak >= 14`: 🔥 **14-Day Legend (Fortnight Streak)**
   - `streak >= 7`: 🔥 **7-Day Iron Streak**
   - `streak >= 3`: ⚡ **3-Day Steady Pulse**
   - Default: ⚡ **Daily Reporter**

3. 🩺 **Cascade Champion**:
   - Evaluated from `stats.breakdown`:
     - If officer has active tests (`tests > 0`), DBT (`dbt > 0`), and HIV/DM screening (`hiv_dm > 0`):
       🩺 **Clinical Cascade Master**
     - If officer has at least 2 cascade services active:
       🩺 **Cascade Specialist**
     - Default: 🩺 **Case Referrer**

4. 🏍️ **Field Trail Blazer**:
   - Evaluated from `stats.total_km`:
     - `total_km >= 150`: 🏍️ **Bihar Trail Blazer (150+ KM)**
     - `total_km >= 75`: 🛵 **Active Voyager (75+ KM)**
     - `total_km > 0`: 🚴 **Field Cruiser**
     - Default: 🚶 **Local Case Finder**

### 2.2 "📲 Share My Achievement Card" Button & Live Modal
- Place a glowing, animated gradient action button: `📲 Share My Achievement Card` inside `MyProfileDashboard`.
- Clicking opens a fullscreen/responsive modal dialog:
  - **Live Card Visual Preview**:
    - Navy-indigo gradient card with glowing spheres.
    - DFY Bihar TB Elimination Mission branding.
    - Officer Name, District, and Designation.
    - Active reporting streak pill with flame icon.
    - Notification progress bar and % achieved pill.
    - The 4 earned milestone badges rendered with icons and titles.
    - Total KM travelled and date stamp in IST.
  - **Canvas HD PNG Generator (1080x1350)**:
    - Hidden HTML5 Canvas rendering high-res card for crystal-clear export.
    - `⬇️ Download Card (PNG)` button saves `DFY_Achievement_[FO_NAME]_[MONTH].png`.
  - **📲 Share on WhatsApp Button**:
    - Prepares formatted WhatsApp text with officer stats and badges and opens `https://api.whatsapp.com/send?text=...`.

---

## 3. Part 2: Backend Designation Resolution & Sync (`main.py`)

### 3.1 Dynamic Designation Lookup from `staff_directory`
- When `get_statewide_top_performers(month, period)` executes:
  1. Retrieve cached `staff_directory` mapping (`staff_meta[normalize_staff_key(dist, name)]`).
  2. For every report in the period:
     - Retrieve officer's canonical designation from `staff_meta`.
     - Route report data into the appropriate designation bucket:
       - **Districts (DC)**: Aggregate district notification volume and target achievement %.
       - **Field Officers & Hub Agents (`FO` / `Hub Agent`)**: Rank by `notifications` count. Each entry includes `designation: "Field Officer"` or `"Hub Agent"`.
       - **Lab Technicians (`LT`)**: Rank by `tests` count (`sample_tested_ids` or `tests`).
       - **SCT Agents (`SCT Agent`)**: Rank by `samples_collected` (`sample_collection_ids` or `sample_collection`).
- **Deactivated Staff Protection**:
  - Exclude staff present in `inactive_staff_keys` or matching consonant-collapsed aliases (e.g., Purushotam Kumar).

### 3.2 Instant Cache Invalidation on Designation Mutation
- In endpoint `/admin/staff/update-details`:
  - When `req.designation` is updated, immediately purge `staff_directory`, `staff_directory_map`, `inactive_staff_keys`, and all `statewide_top_*` cache keys.
  - When the admin switches back to the Leaderboard, the officer immediately appears in their updated role with their cumulative metrics.

### 3.3 Endpoint Contract: `GET /api/statewide-top-performers`
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

---

## 4. Part 3: Centralized Admin Dashboard UI & Layout (`AdminDashboard.jsx`)

### 4.1 Staff Management Designation Dropdown Expansion
In `addStaffModal` and `pinChangeModal`:
- Add options:
  - `Field Officer`
  - `Hub Agent`
  - `SCT Agent`
  - `Lab Technician (LT)`
  - `District Coordinator (DC)`
  - `Senior Treatment Supervisor (STS)`
  - `TB Health Visitor (TBHV)`
  - `State Health Coordinator`

### 4.2 Full-Width Dashboard Layout Restructure
Replace the legacy 2:1 column grid:
```jsx
{/* TOP: Full-Width Bihar Statewide Top Performers Studio */}
<div className="w-full mb-6">
  {/* Bento Studio with 4 Role Tabs & Timeframe Switchers */}
</div>

{/* BOTTOM: Full-Width Daily Progression Trend */}
<div className="w-full bg-white p-5 rounded-2xl shadow-sm border border-slate-100 mb-6">
  {/* Full width 30-Day AreaChart */}
</div>
```

### 4.3 Four Role Tabs in Top Performers Studio
1. `🏛️ Top Districts (DC)`
2. `📋 Top FO & Hub Agents` (with `FO` vs `HUB AGENT` badge)
3. `🔬 Top Lab Technicians (LT)` (Tests count)
4. `🧪 Top SCT Agents` (Sputum Collections count)

### 4.4 HD WhatsApp Poster Studio Modal (1200x1350)
- Canvas renders 4-quadrant / 4-card overview with top rankers of DC, FO/Hub, LT, and SCT.
- WhatsApp share button formats all 4 categories with rankings and medals for 1-click sharing.

---

## 5. Verification & Delivery Protocol

1. **Python Compilation**: `python -m py_compile main.py` (Exit code 0).
2. **Backend Unit Tests**: `pytest tests/test_statewide_top_performers.py` (100% pass).
3. **Frontend UI Tests**:
   - `node tests/test_top_performers_studio_ui.mjs` (Admin dashboard layout & 4 tabs pass).
   - `node tests/test_fo_achievement_badges_ui.mjs` (FO profile badges & share card pass).
4. **Frontend Linter**: `npm --prefix dfy-frontend run lint` (0 syntax errors).
5. **Frontend Production Build**: `npm --prefix dfy-frontend run build` (Exit code 0).
6. **Zero-Leakage Privacy Audit**: Verify that FO App has zero mentions of the 10:00 AM cutoff; verify no patient IDs are leaked on achievement cards.
7. **Offline User Inspection Gate**: Local testing on `http://localhost:5173` before requesting user approval for `git push`.
