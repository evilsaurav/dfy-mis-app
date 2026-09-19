# Technical Design Spec: DFY MIS Executive UI/UX Design System Upgrade

**Date:** 2026-09-20  
**Target Platform:** Web (Desktop/Tablet for Admin Dashboard, Mobile PWA for Field Officers)  
**Primary Files Touched:**
- `dfy-frontend/src/AdminDashboard.jsx`
- `dfy-frontend/src/App.jsx`
- `dfy-frontend/src/index.css`
- `dfy-frontend/src/changelogData.js`

> [!IMPORTANT]
> **Zero Functionality Alteration Policy**:
> No backend endpoints, database schemas, calculation logic, RBAC checks, or mutation contracts will be modified. All changes are strictly presentation, visual hierarchy, layout ergonomics, and CSS styling.

---

## 1. Design Tokens & Visual Theme

### 1.1 Brand Color Palette (DFY Medical Teal & Deep Emerald)
- **Primary Brand / Action:** Medical Teal (`#0f766e` / `#0d9488`)
- **Success / Target Achieved:** Deep Emerald (`#059669` / `#10b981`)
- **Info / Lab & UDST:** Cobalt Blue (`#1d4ed8` / `#2563eb`)
- **Clinical Cascade:** Violet Purple (`#7e22ce` / `#9333ea`)
- **Watchlist / Field Travel:** Warm Amber (`#b45309` / `#f59e0b`)
- **Critical / Drop-off:** Rose Red (`#be123c` / `#e11d48`)
- **Surfaces & Backgrounds:** Crisp White (`#ffffff`), Slate Canvas (`#f8fafc`), Card Border (`#e2e8f0`)
- **Typography:** Deep Slate (`#0f172a` for headings, `#334155` for body, `#64748b` for secondary labels)

### 1.2 Typography & Numbers
- **Font Family:** `Plus Jakarta Sans`, system fallback.
- **Tabular Figures:** `font-variant-numeric: tabular-nums` enforced on all numbers, counters, dates, and currency to eliminate visual jitter.
- **Readability Minimum:** Minimum text size of 11px for secondary labels, eliminating illegible 8px-9px micro-labels.

---

## 2. Field Officer Mobile App (`App.jsx`) Ergonomics

### 2.1 Preserved Flow with High-Polish Surfaces
- **Single List Layout:** Preserves the existing continuous list structure so that Field Officers retain 100% of their established muscle memory (no accordion menus to open/close).
- **Outdoor Sunlight Contrast:** Replaces faint gray text with high-contrast `#1e293b` typography and clear `#cbd5e1` input borders.
- **Large Touch Hitboxes:** All input containers, buttons, and bottom dock navigation tabs will have a minimum height of 48px for thumb-friendly interaction in moving vehicles or field environments.

### 2.2 Category Headers & Chip-Tag ID Entry
- **Category Header Bands:** Clear, clean section dividers separating diagnosis, clinical tests, drug logistics, and visits.
- **Chip-Tags with Instant Removal:** Patient IDs entered or pasted convert into clean teal pill tags (`bg-teal-50 text-teal-800 border border-teal-200`) with a prominent delete button (`×`).
- **Live Counter Badge:** Each category title displays a live pill badge (e.g. `3 IDs`) so the officer can verify their entries before submission.

---

## 3. Admin Dashboard (`AdminDashboard.jsx`) Command Center

### 3.1 Executive Top Sticky Command Bar
- Consolidates the top controls into a single, cohesive, glassmorphism sticky toolbar (`bg-white/95 backdrop-blur-md border-b border-slate-200/90 z-20`):
  1. **Brand Mark:** Doctors For You (DFY) TB MIS Control Center with live sync heartbeat indicator.
  2. **Global Selectors:** `[📅 Month Picker]` + `[📍 District Selector]` styled as unified pill controls.
  3. **Executive Action Tray:** Compact dropdown buttons for `Reports Studio`, `Cascade Funnel`, `Nikshay Reconciler`, `Attendance`, and `Broadcast`.
- **100% Full Width:** Preserves the entire viewport width for wide tables and detailed charts on laptops and desktop monitors (eliminating space-wasting sidebars).

### 3.2 Sleek Sub-Navigation Pills
- Clean segmented pill switch for the top views:
  - `⚡ Overview & Master Table`
  - `🎯 Staff Target Pacing`
  - `⚖️ District Benchmarks`
- Active tab highlighted in solid DFY Medical Teal (`bg-teal-700 text-white shadow-sm`).

### 3.3 Executive 4-Card KPI Strip
Redesigned top summary cards with clear visual hierarchy:
1. **TB Notifications:** Primary volume number (28px tabular-num) + Target progress gauge bar (`Target: 1,600 • 88.7% Achieved`) + Status badge.
2. **UDST & Lab Testing:** Total samples tested + Testing Yield percentage from presumptive cases.
3. **Core Clinical Cascade:** Total completed interventions across HIV/DM, DBT Bank Linking, and Contact Tracing.
4. **Field Footprint & Operations:** Total Field KM + Active Staff count + Average KM per FO.

---

## 4. Detailed Master Table Ergonomics

### 4.1 Category Group Header Color-Coded Bands
The 23 columns will be grouped under 4 distinct, visually elegant top header bands:
- **Band 1: Target & Notifications** (`bg-teal-50/90 text-teal-900 border-b-2 border-teal-600`): District/FO, Target, Notifications, Achievement %.
- **Band 2: Core Clinical Cascade** (`bg-indigo-50/90 text-indigo-900 border-b-2 border-indigo-600`): UDST Lab Tests, HIV/DM Screening, DBT Bank Linking, Contact Tracing.
- **Band 3: Visits & Logistics** (`bg-amber-50/90 text-amber-900 border-b-2 border-amber-600`): Home Visits, Doctor Visits, FDC Drugs Provided, Kit Consumption.
- **Band 4: Special Indicators** (`bg-pink-50/90 text-pink-900 border-b-2 border-pink-600`): Differentiated TB, TPT Treatment Start, TPT Presumptive, Aadhaar Face Auth, Consent, Overrides.

### 4.2 Frozen Sticky First Column
- Sticky District / Officer Name column with elevated drop-shadow border (`border-r border-slate-200 shadow-[4px_0_12px_-2px_rgba(0,0,0,0.06)]`) so officer names remain visible across the entire 23-column horizontal scroll.

### 4.3 Zebra Striping & Zero-Noise Formatting
- Alternating row backgrounds (`bg-white` and `bg-slate-50/40`) with gentle teal hover tinting (`hover:bg-teal-50/50`).
- When an optional indicator is `0`, render a subtle muted dash (`—`) or dimmed number (`text-slate-300`) to let active positive accomplishments visually pop out.

---

## 5. Verification & Safety Battery
- **Backend Stability:** `python -m py_compile main.py` must exit code 0.
- **Frontend Build & Linter:** `npm run lint` (0 errors) and `npm run build` (exit code 0).
- **TDZ Safety:** Verification that no state or hook order is disrupted.
- **User Approval Gate:** Staged and committed locally, then user approval before `git push`.
