# DFY MIS Executive UI/UX Design System Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate the DFY MIS application's UI/UX to an executive-grade clinical monitoring portal with zero changes to underlying backend contracts, calculation logic, RBAC, or database functions.

**Architecture:** Modernize the frontend presentation layer through a unified DFY Medical Teal & Deep Emerald design system. Apply high-contrast outdoor mobile ergonomics to the Field Officer reporting form while transforming the Admin Dashboard with an Executive Top Command Bar, 4-Card KPI Strip, and Category-Banded Detailed Master Table.

**Tech Stack:** React 19, Tailwind CSS v4, Recharts, Vite.

**Spec:** `docs/superpowers/specs/2026-09-20-ui-design-system-spec.md`

## Global Constraints
- **Zero Functionality Alteration Policy**: No backend endpoints, data calculation functions, state reducers, or RBAC rules will be modified.
- **Rule 1 Verification Battery**: Every task must compile cleanly (`python -m py_compile main.py`, `npm run lint`, `npm run build`).
- **Rule 2 TDZ & Hook Safety**: Declare base states first, then derived collections, then dependent hooks, then handlers. No lexical references before declaration.
- **Preserve FO Muscle Memory**: Maintain the existing single continuous list of fields in `App.jsx` without hiding inputs behind nested accordions.

---

### Task 1: CSS Design Tokens, Font Readability & Tabular Numerics

**Files:**
- Modify: `dfy-frontend/src/index.css:1-104`

**Interfaces:**
- Consumes: Tailwind v4 theme directives.
- Produces: Global `.tabular-num`, `.glass-header`, `.badge-teal`, `.badge-emerald`, `.badge-indigo`, `.badge-amber`, `.badge-rose`, and refined custom scrollbars.

- [ ] **Step 1: Check existing CSS classes in `index.css`**
Review `dfy-frontend/src/index.css` to identify glassmorphism classes, animations, and typography tokens.

- [ ] **Step 2: Add Medical Brand theme tokens and utility classes**
Update `dfy-frontend/src/index.css` with clean DFY Medical Teal & Deep Emerald accent classes, high-contrast text styles, and enhanced glass-card elevation.

```css
/* DFY Medical Elevation & Theme Tokens */
.border-medical-teal { border-color: rgba(13, 148, 136, 0.3); }
.bg-medical-teal { background-color: #0f766e; }
.text-medical-teal { color: #0f766e; }

/* Sticky Header Backdrop */
.command-bar-surface {
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(226, 232, 240, 0.9);
}

/* Category Band Headers for Master Table */
.th-band-primary { background: #f0fdfa; color: #0f766e; border-bottom: 2px solid #0d9488; }
.th-band-clinical { background: #eef2ff; color: #4338ca; border-bottom: 2px solid #6366f1; }
.th-band-outreach { background: #fefce8; color: #a16207; border-bottom: 2px solid #eab308; }
.th-band-special { background: #fdf2f8; color: #be185d; border-bottom: 2px solid #ec4899; }
```

- [ ] **Step 3: Verify build**
Run `npm run build` in `dfy-frontend/` to confirm CSS builds cleanly.

- [ ] **Step 4: Commit**
```bash
git add dfy-frontend/src/index.css
git commit -m "style: add medical brand tokens and table band utilities in index.css"
```

---

### Task 2: Field Officer Mobile Form Polish & Outdoor Readability

**Files:**
- Modify: `dfy-frontend/src/App.jsx`

**Interfaces:**
- Consumes: Existing daily reporting state, `selectedCategory`, `inputIds`, `formFields`.
- Produces: Enhanced outdoor contrast inputs, chip-tags with remove buttons, category headers, and 48px thumb hitboxes.

- [ ] **Step 1: Locate daily report form categories in `App.jsx`**
Locate form category inputs and patient ID chip rendering in `App.jsx`.

- [ ] **Step 2: Apply high-contrast borders and large 48px touch hitboxes**
Ensure all input containers have `#1e293b` text color, clean `#cbd5e1` borders with `#0d9488` focus rings, and large 48px hitboxes.

- [ ] **Step 3: Elevate Patient ID Chip-Tags with 1-tap removal**
Ensure chips render with `bg-teal-50 text-teal-800 border border-teal-200` and clear `×` tap targets.

- [ ] **Step 4: Verify build and lint**
Run `npm run lint` and `npm run build` in `dfy-frontend/`.

- [ ] **Step 5: Commit**
```bash
git add dfy-frontend/src/App.jsx
git commit -m "style(fo-form): enhance outdoor sunlight contrast, chip-tags, and 48px touch targets"
```

---

### Task 3: Admin Dashboard Executive Top Sticky Command Bar & Sub-Navigation

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx` (Top header and tab controls)

**Interfaces:**
- Consumes: `month`, `selectedDistrict`, `selectedFO`, `activeMainTab`, modal setters.
- Produces: Unified sticky top command bar preserving 100% full table width.

- [ ] **Step 1: Locate top header in `AdminDashboard.jsx`**
Locate the main header navigation, month picker, district selector, and action buttons.

- [ ] **Step 2: Refactor top header into a consolidated executive command bar**
Unify the Month Picker, District dropdown, and Quick Actions (`Reports Studio`, `Cascade Alerts`, `Nikshay Reconciler`, `Attendance`) into a clean, glassmorphism sticky toolbar.

- [ ] **Step 3: Update sub-navigation pills**
Style `[⚡ Overview & Master Data]`, `[🎯 Staff Target Pacing]`, `[⚖️ District Benchmarks]` with clean pill buttons highlighted in solid Medical Teal.

- [ ] **Step 4: Verify build and lint**
Run `npm run lint` and `npm run build` in `dfy-frontend/`.

- [ ] **Step 5: Commit**
```bash
git add dfy-frontend/src/AdminDashboard.jsx
git commit -m "feat(admin-nav): add executive top sticky command bar and sleek sub-nav pills"
```

---

### Task 4: Executive 4-Card KPI Summary Strip Redesign

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx` (Overview KPI summary cards)

**Interfaces:**
- Consumes: `totals` (`notifications`, `tests`, `presumptive`, `total_km`, `hiv_dm`, `dbt`, `contact_tracing`), `targetsData`.
- Produces: 4-Card Executive KPI Summary Strip with 28px numbers, progress bars, and contextual subtext.

- [ ] **Step 1: Locate KPI cards in `AdminDashboard.jsx`**
Locate the 4 cards at the top of the Overview tab (Notifications, Tests, KM, Total Operations).

- [ ] **Step 2: Replace with Executive 4-Card layout**
Implement:
  1. **TB Notifications:** Big tabular number + Target progress bar (`Target: X • Y% Achieved`) + Status pill.
  2. **UDST Lab Testing:** Big tabular number + Testing yield from presumptive cases + Reconciled label.
  3. **Core Clinical Interventions:** Combined count + Subtext with HIV/DM, DBT, and Contact Tracing breakdown.
  4. **Field Footprint & Footwork:** Total KM + Active staff count + Average KM per FO.

- [ ] **Step 3: Verify build and lint**
Run `npm run lint` and `npm run build` in `dfy-frontend/`.

- [ ] **Step 4: Commit**
```bash
git add dfy-frontend/src/AdminDashboard.jsx
git commit -m "feat(kpi-strip): redesign 4 executive summary cards with progress bars and clear subtext"
```

---

### Task 5: Detailed Master Table Category Bands, Sticky Pinned Column & Zero-Noise Formatting

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx` (Detailed Master Table thead & tbody)

**Interfaces:**
- Consumes: `tableData`, `sortConfig`, `masterTableCohortFilter`, `selectedDistrict`.
- Produces: Grouped header bands, frozen sticky first column with shadow, zebra striping, and dimmed dashes for zeros.

- [ ] **Step 1: Update `<thead>` with 4 Category Group Bands**
Add the top header band row:
  - `Target & Notifications` (Col 2-4)
  - `Core Clinical Cascade` (Col 5-8)
  - `Visits & Logistics` (Col 9-16)
  - `Special Indicators` (Col 17-23)

- [ ] **Step 2: Elevate Frozen First Column**
Ensure the District / Officer Name column remains sticky on the left with a subtle drop shadow (`shadow-[4px_0_12px_-2px_rgba(0,0,0,0.06)]`) and crisp right border.

- [ ] **Step 3: Apply Zebra Striping & Zero-Noise Dashing**
Apply alternating row backgrounds (`bg-white` and `bg-slate-50/40`), gentle hover highlight (`hover:bg-teal-50/50`), and render subtle dashes (`—`) when optional secondary indicators are 0.

- [ ] **Step 4: Verify build and lint**
Run `npm run lint` and `npm run build` in `dfy-frontend/`.

- [ ] **Step 5: Commit**
```bash
git add dfy-frontend/src/AdminDashboard.jsx
git commit -m "feat(master-table): add category header bands, sticky pinned column, and zebra styling"
```

---

### Task 6: Release Notes, Verification Battery & Diff Audit

**Files:**
- Modify: `dfy-frontend/src/changelogData.js`

**Interfaces:**
- Consumes: `APP_VERSION = "2.7.3"`.
- Produces: Detailed changelog entry for the Executive UI Design System Upgrade.

- [ ] **Step 1: Update `changelogData.js`**
Bump `APP_VERSION` to `2.7.3` and add full release highlights.

- [ ] **Step 2: Run Full Verification Battery**
1. Python check: `python -m py_compile main.py` (Exit code 0)
2. Frontend linter: `npm run lint` in `dfy-frontend/` (0 errors)
3. Frontend build: `npm run build` in `dfy-frontend/` (Exit code 0)
4. TDZ and hook order inspection.
5. Line-by-line `git diff` audit.

- [ ] **Step 3: Commit and Present for User Approval Gate**
```bash
git add dfy-frontend/src/changelogData.js
git commit -m "chore(release): bump to v2.7.3 for executive UI design system upgrade"
```
Present evidence to user and wait for explicit approval before running `git push`.
