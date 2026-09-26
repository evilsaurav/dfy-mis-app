# FO Achievement Studio & Admin Designation-Aware Top Performers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Frontline Field Officer Profile Honors & Badges with an HD Shareable Achievement Card Studio in `App.jsx`, along with Designation-Aware Multi-Metric Top Performers (FO/Hub, LT, SCT, DC) and Full-Width Dashboard Restructure in `AdminDashboard.jsx` and `main.py`.

**Architecture:**
- **Backend (`main.py`)**: Dynamic `staff_directory` designation lookup and cache eviction in `/api/statewide-top-performers` and `/admin/staff/update-details`. Segment performance into 4 clinical buckets: FO/Hub (Notifications), LT (Tests), SCT (Sputum Collections), and DC (District Target %).
- **Admin Dashboard (`AdminDashboard.jsx`)**: Full-width layout restructuring placing Top Performers on top and Daily Progression Trend full-width below. Add 4 role tabs, expand designation dropdowns in Staff Management, and update 1200x1350 Canvas poster generator.
- **FO App (`App.jsx`)**: Add 4 dynamic milestone badges (Target Achiever, Punctuality Streak, Cascade Champion, Field Trail Blazer) and a "📲 Share My Achievement Card" button with live preview modal, 1080x1350 HD canvas card download, and WhatsApp sharing.

**Tech Stack:** React 19, Tailwind CSS, HTML5 Canvas 2D, FastAPI, Google Cloud Firestore, Pytest, Node.js.

**Spec:** `docs/superpowers/specs/2026-09-26-designation-aware-top-performers-and-dashboard-layout-design.md`

## Global Constraints
- **ZERO LEAKAGE PRIVACY CONSTRAINT**: Absolutely NO mention of the Stealth 10:00 AM Cutoff in `App.jsx` or FO Guide. Official reporting deadline remains strictly 7:00 PM. No patient IDs or PII leaked on shareable cards.
- **TEMPORAL DEAD ZONE (TDZ) RULE**: Never reference state, derived variables, or callbacks before lexical declaration. Declare base states first, then derived collections, then handlers.
- **PRODUCTION PERFORMANCE & MEMORY SAFETY**: Client-side HTML5 Canvas 2D rendering for cards/posters with 0% server CPU/RAM load on Render. Preserve concurrency semaphores.
- **COMPILATION & LINT SAFETY**:
  - `python -m py_compile main.py` must exit code 0.
  - `npm --prefix dfy-frontend run lint` must pass with 0 syntax errors.
  - `npm --prefix dfy-frontend run build` must succeed.
- **ZERO PUSH WITHOUT APPROVAL**: Local commit only; wait for explicit user approval after offline local testing.

---

### Task 1: Backend Dynamic Staff Designation Mapping, Multi-Metric Leaderboard Aggregation & Cache Eviction in `main.py`

**Files:**
- Modify: `main.py:1025-1215` (Endpoint `/api/statewide-top-performers`)
- Modify: `main.py:5590-5620` (Endpoint `/admin/staff/update-details`)
- Test: `tests/test_statewide_top_performers.py`

**Interfaces:**
- Consumes: Firestore collections `staff_directory` and raw monthly reports.
- Produces: API response with keys `top_districts`, `top_fo` (Field Officers & Hub Agents), `top_lt` (Lab Technicians), `top_sct` (SCT Agents).

- [ ] **Step 1: Write the failing backend test in `tests/test_statewide_top_performers.py`**
Add tests asserting that `/api/statewide-top-performers` returns `top_fo`, `top_lt`, `top_sct`, and `top_districts`, correctly associates designations from `staff_directory`, and verifies cache invalidation on staff update.

- [ ] **Step 2: Run test to verify it fails**
Run: `python -m pytest tests/test_statewide_top_performers.py -v`
Expected: FAIL due to missing keys `top_lt` and `top_sct`.

- [ ] **Step 3: Implement dynamic designation aggregation & cache eviction in `main.py`**
1. In `get_statewide_top_performers`:
   - Load all staff from `staff_directory` into a map `staff_meta[normalize_staff_key(dist, name)] = {"designation": d.get("designation", "Field Officer"), "target": d.get("target", 50)}`.
   - Aggregate records into 4 buckets:
     - `district_counts` (Districts/DC) -> notifications & target %
     - `fo_counts` (FO & Hub Agents) -> notifications count with `designation`
     - `lt_counts` (Lab Technicians) -> tests count (`sample_tested_ids` or `tests`)
     - `sct_counts` (SCT Agents) -> sputum collections (`sample_collection_ids` or `sample_collection`)
   - Return `{ "success": True, "top_districts": [...], "top_fo": [...], "top_lt": [...], "top_sct": [...] }`.
2. In `/admin/staff/update-details`:
   - Invalidate `staff_directory_map`, `staff_directory`, and all keys starting with `statewide_top_`.

- [ ] **Step 4: Run test to verify it passes**
Run: `python -m pytest tests/test_statewide_top_performers.py -v`
Expected: PASS (100%).

- [ ] **Step 5: Verify Python compilation & commit**
Run: `python -m py_compile main.py`
Run: `git add main.py tests/test_statewide_top_performers.py; git commit -m "feat(backend): implement designation-aware multi-metric statewide leaderboard and cache eviction"`

---

### Task 2: Staff Management Designation Dropdown Expansion in `AdminDashboard.jsx`

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx` (Add Staff modal lines 8550-8565 and Edit Staff modal lines 8455-8470)
- Test: `tests/test_staff_designation_dropdown_ui.mjs`

**Interfaces:**
- Consumes: Admin staff management modals (`addStaffModal`, `pinChangeModal`).
- Produces: Standardized designations: `Field Officer`, `Hub Agent`, `SCT Agent`, `Lab Technician (LT)`, `District Coordinator (DC)`, `Senior Treatment Supervisor (STS)`, `TB Health Visitor (TBHV)`, `State Health Coordinator`.

- [ ] **Step 1: Write the failing UI test in `tests/test_staff_designation_dropdown_ui.mjs`**
Assert that both `addStaffModal` and `pinChangeModal` include options for `Hub Agent`, `SCT Agent`, `Lab Technician (LT)`, `Field Officer`, and `District Coordinator (DC)`.

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/test_staff_designation_dropdown_ui.mjs`
Expected: FAIL due to missing `Hub Agent` and `SCT Agent` options.

- [ ] **Step 3: Update designation dropdowns and refresh handlers in `AdminDashboard.jsx`**
1. In both modals, update the `<select>` options.
2. After successful staff designation update, trigger `fetchTopPerformers(topPerformersPeriod)` so the leaderboard updates immediately.

- [ ] **Step 4: Run test to verify it passes**
Run: `node tests/test_staff_designation_dropdown_ui.mjs`
Expected: PASS (100%).

- [ ] **Step 5: Commit**
Run: `git add dfy-frontend/src/AdminDashboard.jsx tests/test_staff_designation_dropdown_ui.mjs; git commit -m "feat(admin): expand staff designation dropdowns with hub agent and sct agent options"`

---

### Task 3: Full-Width Layout Restructure & 4-Role Leaderboard in `AdminDashboard.jsx`

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx:5800-6130` (Visual Analytics layout and Top Performers Studio)
- Modify: `dfy-frontend/src/AdminDashboard.jsx:2830-3050` (Canvas poster generator & WhatsApp share handlers)
- Test: `tests/test_top_performers_studio_ui.mjs`

**Interfaces:**
- Consumes: `/api/statewide-top-performers` response (`top_districts`, `top_fo`, `top_lt`, `top_sct`).
- Produces: Full-width Top Performers Studio on top, full-width Daily Progression Trend below, 4 role tabs, and 4-tier HD Canvas export.

- [ ] **Step 1: Update UI test `tests/test_top_performers_studio_ui.mjs`**
Assert that the UI contains the 4 tabs (`Top Districts`, `Top FO & Hub`, `Top Lab Technicians`, `Top SCT Agents`), `HUB AGENT` badge support, full-width Daily Progression Trend, and 4-role WhatsApp text formatting.

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/test_top_performers_studio_ui.mjs`
Expected: FAIL due to missing `Top Lab Technicians` and `Top SCT Agents` tabs.

- [ ] **Step 3: Implement full-width layout and 4-role leaderboard in `AdminDashboard.jsx`**
1. Move `🏆 Bihar Statewide Top Performers Studio` to a full-width container on top (`w-full mb-6`).
2. Move `📈 Daily Progression Trend (Day 1 - 30)` to a full-width container below it (`w-full mb-6`).
3. Add 4 tabs in Top Performers Studio:
   - `districts`: 🏛️ Top 5 Districts (Rank, District, Notifications, Target %)
   - `fo`: 📋 Top 5 FO & Hub Agents (Rank, Name, District, Badge: `FO` or `HUB AGENT`, Notifications)
   - `lt`: 🔬 Top 5 Lab Technicians (Rank, Name, District, Tests)
   - `sct`: 🧪 Top 5 SCT Agents (Rank, Name, District, Sputum Collections)
4. Update Canvas generator `generateTopPerformersPosterCanvas` (1200x1350) and WhatsApp text generator `handleShareTopPerformersWhatsApp` to represent all 4 categories.

- [ ] **Step 4: Run test to verify it passes**
Run: `node tests/test_top_performers_studio_ui.mjs`
Expected: PASS (100%).

- [ ] **Step 5: Commit**
Run: `git add dfy-frontend/src/AdminDashboard.jsx tests/test_top_performers_studio_ui.mjs; git commit -m "feat(ui): restructure dashboard with full-width top performers 4-role tabs and spacious progression trend"`

---

### Task 4: FO Profile Honors, Badges & "Share My Achievement Card" Studio in `App.jsx`

**Files:**
- Modify: `dfy-frontend/src/App.jsx:750-1000` (`MyProfileDashboard` component)
- Test: `tests/test_fo_achievement_badges_ui.mjs`

**Interfaces:**
- Consumes: `stats` object in `MyProfileDashboard` (`targetVal`, `notifAchieved`, `percent`, `streak_days`, `total_km`, `breakdown`).
- Produces: 4 dynamic honors & badges, `📲 Share My Achievement Card` action button, Canvas 1080x1350 HD PNG generator, and WhatsApp achievement share modal.

- [ ] **Step 1: Write the failing UI test in `tests/test_fo_achievement_badges_ui.mjs`**
Assert presence of 4 dynamic badges (Target Achiever, Punctuality Streak, Cascade Champion, Field Trail Blazer), "Share My Achievement Card" trigger, modal preview, and zero leakage of 10:00 AM cutoff.

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/test_fo_achievement_badges_ui.mjs`
Expected: FAIL due to missing badges and share button.

- [ ] **Step 3: Implement Honors & Badges and Achievement Card Modal in `App.jsx`**
1. Compute the 4 dynamic badges:
   - Target Achiever: `percent >= 100` (TB Eliminator), `percent >= 75` (Pacesetter), `percent >= 50` (Rising Star), else Target Challenger.
   - Punctuality Streak: `streak >= 14` (14-Day Legend), `streak >= 7` (7-Day Iron Streak), `streak >= 3` (3-Day Steady Pulse), else Daily Reporter.
   - Cascade Champion: `tests > 0 && dbt > 0 && hiv_dm > 0` (Clinical Cascade Master), else Cascade Specialist / Case Referrer.
   - Field Trail Blazer: `total_km >= 150` (Bihar Trail Blazer), `total_km >= 75` (Active Voyager), else Field Cruiser.
2. Render badges showcase in `MyProfileDashboard`.
3. Add `📲 Share My Achievement Card` glowing gradient button.
4. Render Achievement Card Preview Modal with:
   - Live visual card.
   - Hidden `<canvas ref={foCanvasRef} />` (1080x1350 resolution).
   - `⬇️ Download Card (PNG)` and `📲 Share on WhatsApp` buttons.

- [ ] **Step 4: Run test to verify it passes**
Run: `node tests/test_fo_achievement_badges_ui.mjs`
Expected: PASS (100%).

- [ ] **Step 5: Commit**
Run: `git add dfy-frontend/src/App.jsx tests/test_fo_achievement_badges_ui.mjs; git commit -m "feat(fo): add honors and badges showcase and hd achievement card studio in fo profile"`

---

### Task 5: End-to-End Verification Battery & Version Bump to v2.8.4

**Files:**
- Modify: `dfy-frontend/src/changelogData.js` (Bump version to `2.8.4`)
- Test: All suites

- [ ] **Step 1: Bump version in `dfy-frontend/src/changelogData.js`**
Set `APP_VERSION = "2.8.4"` and add changelog entry for FO Achievement Studio and Admin 4-Role Top Performers.

- [ ] **Step 2: Run complete automated test battery**
Run:
- `python -m py_compile main.py`
- `python -m pytest tests/test_statewide_top_performers.py -v`
- `node tests/test_top_performers_studio_ui.mjs`
- `node tests/test_staff_designation_dropdown_ui.mjs`
- `node tests/test_fo_achievement_badges_ui.mjs`
- `npm --prefix dfy-frontend run lint`
- `npm --prefix dfy-frontend run build`
All must exit code 0.

- [ ] **Step 3: Commit and prepare local environment for user testing**
Commit: `git add dfy-frontend/src/changelogData.js; git commit -m "chore: bump version to v2.8.4 with fo achievement studio and designation-aware top performers"`
Ensure local backend (port 8000) and frontend (port 5173) are ready for user offline inspection.
Do NOT run `git push origin main`.
