# Design Specification: Statewide Travel Allowance Executive Dashboard

- **Date**: 2026-10-08
- **Feature**: Statewide Travel Allowance Executive Dashboard
- **Access Scope**: Strictly `SUPER_ADMIN` and `MAIN_INCHARGE`
- **Location**: Primary Navigation Tab in `AdminDashboard.jsx` (adjacent to "District Benchmarks & Pacing")
- **Target Audience**: State Health Program Coordinators & Executive Monitoring Leadership (DFY TB Bihar)

---

## 1. Executive Summary & Goals

The Travel Allowance (TA) module currently allows district-scoped roster review and daily bike log inspection through `TravelAllowanceModal.jsx`. However, state leadership currently lacks a consolidated, real-time command deck across all districts.

This specification introduces the **Statewide Travel Allowance Executive Dashboard**:
1. **Consolidated Visibility**: Aggregates all active districts (currently 22 active districts, auto-scaling to 38+ as new districts activate) into a unified view.
2. **Hybrid UI Architecture (Option A + B Mix)**:
   - Top-level high-impact Executive KPI hero cards (Total Payable ₹, Total KM Logged, Approval Progress %, Action Radar).
   - Dynamic **Bento Cards Grid** featuring visual progress bars, status indicators, and one-click district inspection.
   - Instant toggle to an **Executive Data Table** for high-density tabular sorting and analysis.
3. **Seamless Drilldown**: Clicking "Inspect & Review" on any district card immediately opens the existing `TravelAllowanceModal` pre-configured to that district.
4. **Strict RBAC**: Exclusively visible and accessible to `SUPER_ADMIN` and `MAIN_INCHARGE`. Hidden from Sub-Admins and field officers.
5. **Zero Free-Tier Impact**: Backed by a single SQL aggregation query (< 3 ms) and an in-memory TTL cache (< 50 KB RAM), guaranteeing 100% compliance with Render (512MB RAM) and Supabase free-tier limits.

---

## 2. Infrastructure & Free-Tier Quota Impact

| Layer | Free Tier Limit | Statewide TA Consumption | Safety Mechanism |
| :--- | :--- | :--- | :--- |
| **Supabase (PostgreSQL)** | 500 MB DB storage<br>5 GB bandwidth/mo | • ~20 KB table storage/month<br>• Query time: `< 3 ms`<br>• Payload size: `< 4.5 KB` per call | Single SQL `GROUP BY district` query on indexed `month` column. Never streams unaggregated raw logs. |
| **Render (Backend API)** | 512 MB RAM<br>0.1 vCPU | • Memory overhead: `< 50 KB`<br>• Zero Python loop hydration | In-memory `SimpleTTLCache(ttl_seconds=60)` on key `ta_statewide_summary_{month}`. Live eviction on roster mutation. |
| **Vercel (Frontend)** | 100 GB bandwidth<br>Static SPA | • Bundle increase: `< 15 KB`<br>• Pure static asset serving | Native Tailwind CSS utilities, tree-shaken Lucide icons, no runtime serverless execution. |

---

## 3. RBAC & Security Matrix

| Role | Tab Visibility in Navigation | Backend Endpoint Access (`/admin/ta/statewide-summary`) | Roster Approval & Locking Actions |
| :--- | :--- | :--- | :--- |
| `SUPER_ADMIN` | ✅ Visible | ✅ Allowed (HTTP 200) | ✅ Full (Pass, Revert, Unlock, Export) |
| `MAIN_INCHARGE` | ✅ Visible | ✅ Allowed (HTTP 200) | ✅ Full Governance (Pass, Revert, Unlock) |
| `SUB_ADMIN` | ❌ Hidden | ❌ Denied (HTTP 403 Forbidden) | Limited to permitted districts in District Modal |
| `FIELD_OFFICER` | ❌ Hidden | ❌ Denied (HTTP 403 Forbidden) | Limited to personal profile summary card |

---

## 4. Backend Architecture & Endpoints

### 4.1 Endpoint Specification
- **Route**: `GET /admin/ta/statewide-summary`
- **File**: `backend/routers/travel_allowance.py`
- **Query Parameters**:
  - `month` (string, required): Format `YYYY-MM` (e.g. `2026-10`).
  - `force_refresh` (boolean, optional): Default `false`. If `true`, bypasses cache.
- **Security Dependency**: `Depends(get_current_user)` validating that `user.role in ("SUPER_ADMIN", "MAIN_INCHARGE")`.

### 4.2 Database Aggregation Query
```sql
SELECT 
    r.district,
    COUNT(r.id) AS total_officers,
    COALESCE(SUM(r.total_km), 0) AS total_km,
    COALESCE(SUM(r.gross_amount), 0) AS total_gross,
    COALESCE(SUM(r.deduction_amount), 0) AS total_deductions,
    COALESCE(SUM(r.final_payable_amount), 0) AS total_payable,
    COUNT(CASE WHEN r.status = 'APPROVED' THEN 1 END) AS approved_count,
    COUNT(CASE WHEN r.status = 'SUBMITTED' THEN 1 END) AS submitted_count,
    COUNT(CASE WHEN r.status = 'REVERTED' THEN 1 END) AS reverted_count,
    COUNT(CASE WHEN r.status = 'DRAFT' OR r.status IS NULL THEN 1 END) AS draft_count,
    COUNT(CASE WHEN r.has_dispute = true THEN 1 END) AS dispute_count,
    MAX(r.updated_at) AS last_updated_at
FROM travel_allowance_rosters r
WHERE r.month = %s
GROUP BY r.district
ORDER BY r.district ASC;
```

### 4.3 Response Payload Schema
```json
{
  "month": "2026-10",
  "rate_per_km": 4.0,
  "summary": {
    "total_districts": 22,
    "total_officers": 86,
    "total_km": 37240.5,
    "total_gross": 148962.0,
    "total_deductions": 1250.0,
    "total_payable": 147712.0,
    "approved_districts": 18,
    "pending_districts": 3,
    "disputed_districts": 1,
    "overall_completion_pct": 81.8
  },
  "districts": [
    {
      "district": "Patna",
      "total_officers": 5,
      "total_km": 2450.0,
      "gross_amount": 9800.0,
      "deduction_amount": 0.0,
      "final_payable_amount": 9800.0,
      "approved_count": 5,
      "submitted_count": 0,
      "reverted_count": 0,
      "draft_count": 0,
      "dispute_count": 0,
      "completion_pct": 100.0,
      "status": "APPROVED",
      "last_updated_at": "2026-10-07T14:30:00Z"
    }
  ]
}
```

### 4.4 Caching & Invalidation Protocol
- **Cache Key**: `ta_statewide_summary_{month}`
- **TTL**: 60 seconds.
- **Cache Invalidation Hooks**: Automatically invalidated on:
  - `POST /admin/ta/save-log`
  - `POST /admin/ta/submit-roster`
  - `POST /admin/ta/pass-staff`
  - `POST /admin/ta/revert-staff`
  - `POST /admin/ta/unlock-staff`
  - `POST /admin/ta/resolve-dispute`
  - `POST /fo/ta/dispute`

---

## 5. Frontend UI/UX Architecture

### 5.1 Component Hierarchy
```
dfy-frontend/src/
├── AdminDashboard.jsx                       (Mounts tab when activeMainTab === 'travel_allowance')
├── components/Admin/
│   ├── AdminHeader.jsx                      (Adds 4th tab button beside 'District Benchmarks & Pacing')
│   ├── tabs/
│   │   └── TravelAllowanceTab.jsx           (Dedicated statewide executive dashboard component)
│   └── modals/
│       └── TravelAllowanceModal.jsx         (Pre-existing district modal; launched on "Inspect Roster")
```

### 5.2 Visual Layout & Sections

#### Section A: Executive Header & Action Ribbon
- **Sticky Tab Selector**:
  - `📊 Overview & State Analytics`
  - `🎯 Staff Pacing & Peer Comparison`
  - `🏢 District Benchmarks & Pacing`
  - `🏍️ Travel Allowance Statewide` *(Active, styled in vibrant emerald/teal)*
- **Control Bar**:
  - **Month Picker**: Dropdown selecting target month (`YYYY-MM`).
  - **Search Bar**: Instant filter by district name.
  - **Status Filter Chips**: `All (22)`, `Pending Review (3)`, `Fully Approved (18)`, `Disputes (1)`.
  - **View Switcher Toggle**: `🎴 Bento Cards` vs `📋 Detailed Table`.
  - **Action Buttons**:
    - `🔄 Refresh Data` (with rotating icon and anti-double-tap loading guard).
    - `📥 Export State Excel` (1-click multi-district workbook download).

#### Section B: Top 4 KPI Hero Cards
1. **💰 Total Net Payable**:
   - Primary metric: `₹1,47,712` (Indian Rupee formatted).
   - Subtext: Gross: ₹1,48,962 • Deductions: ₹1,250.
2. **🏍️ Total Statewide Distance**:
   - Primary metric: `37,240.5 KM`.
   - Subtext: Active Rate: `₹4.00 / KM`.
3. **🎯 Verification & Approval Progress**:
   - Primary metric: `18 / 22 Districts` (`81.8%`).
   - Visual: Two-tone animated progress bar with glowing emerald fill.
4. **⚠️ Action Radar**:
   - Primary metric: `3 Pending • 1 Dispute`.
   - Visual: Amber/Rose alert badge for immediate leadership attention.

#### Section C: View 1 — Dynamic Bento Cards Grid (Default)
- Grid layout: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4`.
- Each District Bento Card displays:
  - **Header**: District Name (e.g. `📍 Patna`) + Officer Count badge (`5 Officers`).
  - **Status Pill**:
    - `🟢 Fully Approved (100%)` if `approved_count === total_officers`.
    - `🟡 In Review (Sub-Admin Submitted)` if `submitted_count > 0`.
    - `🔴 Action Needed / Dispute` if `dispute_count > 0` or `reverted_count > 0`.
    - `⚪ Draft / In Progress` if only draft.
  - **Mini Progress Bar**: Visual fraction of approved officers (`4/5 approved`).
  - **Financial Metrics**:
    - Total KM Logged (e.g. `2,450 KM`).
    - Net Payable (e.g. `₹9,800`).
    - Deductions (if any, in red).
  - **Footer Action**:
    - **`🔍 Inspect & Review Roster`** button. Clicking this triggers:
      `setTaDistrict(district); setShowTaModal(true);`
      seamlessly opening the detailed officer roster modal without losing state.

#### Section D: View 2 — Executive Tabular View
- High-density sortable table for leadership review.
- Columns:
  1. `#`
  2. `District`
  3. `Total Staff`
  4. `Total KM`
  5. `Gross (₹)`
  6. `Deductions (₹)`
  7. `Net Payable (₹)`
  8. `Roster Status`
  9. `Approval Rate`
  10. `Actions` (Inspect Roster button)
- Summary Total Footer Row calculating exact columns sums (`SUM(KM)`, `SUM(Gross)`, `SUM(Net)`).

---

## 6. Edge Cases & Resilience Strategy

1. **New Month / Zero Data**:
   - When leadership switches to a month with no initiated rosters, show a clean, friendly empty state: `"No Travel Allowance records initialized for October 2026. Sub-Admins will populate logs as reports are filed."` with a quick "Initialize Roster" prompt.
2. **Dynamic District Count**:
   - The component never hardcodes 22 or 38 districts. It computes `districts.length` dynamically from active records and displays all present districts seamlessly.
3. **Network Failure / Stale Cache**:
   - Handled with try/catch, fallback to cached data, and a prominent toast notification (`"Failed to load statewide TA summary. Check network connection."`).
4. **Anti-Double-Tap & Concurrency**:
   - All mutation and export buttons implement `isDownloading` and `isLoading` disabled states to prevent double submission.
5. **Temporal Dead Zone (TDZ) Safety**:
   - `TravelAllowanceTab.jsx` strictly declares all `useState` hooks first, followed by `useMemo` derivations, followed by event handlers, preventing runtime TDZ crashes.

---

## 7. Verification & Testing Protocol

1. **Backend Tests (`tests/test_ta_statewide_summary.py`)**:
   - Verify RBAC gating: `SUPER_ADMIN` and `MAIN_INCHARGE` return HTTP 200; `SUB_ADMIN` returns HTTP 403.
   - Verify aggregation mathematics: `total_km`, `gross_amount`, `deduction_amount`, `final_payable_amount` match roster rows.
   - Verify cache invalidation: mutating a roster immediately updates the statewide summary endpoint.
2. **Frontend UI Tests (`tests/test_ta_statewide_tab_ui.mjs`)**:
   - Verify tab visibility in `AdminHeader.jsx` based on `user.role`.
   - Verify view switching between Bento Cards and Tabular mode.
   - Verify click on "Inspect Roster" triggers `setShowTaModal(true)` with correct district selected.
3. **Production Verification Battery**:
   - `python -m py_compile main.py backend/routers/travel_allowance.py` (Exit 0).
   - `pytest tests/test_ta_*.py -v` (100% Pass).
   - `npm --prefix dfy-frontend run lint` (0 syntax errors).
   - `npm --prefix dfy-frontend run build` (Exit 0, production dist built).
