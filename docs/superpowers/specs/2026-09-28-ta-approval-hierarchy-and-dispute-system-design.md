# Design Specification: Travel Allowance (TA) Hierarchical Approval Workflow, Time-Gated Dispute System & Cost-Optimized Drilldown UX

**Document Version:** 1.0.0  
**Date:** 2026-09-28  
**Branch:** `feat/travel-allowance-bike-log` (Strictly local, Zero Push to Production)  
**Status:** DRAFT / UNDER REVIEW  

---

## 1. Executive Summary & Goals

### 1.1 Problem Statement
1. **Lack of Governance & Approval Hierarchy**: Previously, any administrative user could edit and save Travel Allowance (TA) bike logs directly, without an official review and sign-off process between district data operators (MIS) and administrative supervisors (Main Incharge).
2. **Premature Exposure to Frontline Staff**: Field Officers (FO) could potentially see in-progress drafts or unverified deductions before official sign-off, creating confusion or disputes before calculations were finalized.
3. **Missing Dispute Mechanism**: If an administrative deduction or kilometer calculation was erroneous, there was no formal in-app recourse for Field Officers to register a claim.
4. **Cramped Multi-Deck Interface**: In the TA Studio modal, the 31-day table, the accounting metrics, and the district payroll roster were stacked in one vertical container, creating visual clutter and nested scroll issues.
5. **Database Load & Billing Escalation**: Uncached `.stream()` calls on `travel_allowance_logs` were reading all monthly statewide documents on every staff/district switch, causing unnecessary Firestore read spikes.

### 1.2 Proposed Solutions & Key Deliverables
1. **Multi-Tier Role Hierarchy**:
   - `SUPER_ADMIN`: Master governance, user & district management, override authority.
   - `MIS`: Assigned to specific districts; fills, verifies, and submits monthly rosters.
   - `MAIN_INCHARGE`: Reviews submitted monthly district rosters; approves for payout or reverts to MIS with specific feedback.
2. **Approval State Machine**: `DRAFT` $\to$ `SUBMITTED` $\to$ `APPROVED` (or `REVERTED` $\to$ `SUBMITTED` $\to$ `APPROVED`).
3. **Frontline App Publication & 24-Hour Dispute Window**:
   - TA data in the FO App remains locked/hidden with a *"Verification in Progress"* status until officially `APPROVED` by the Main Incharge.
   - Upon approval, a strict **24-hour dispute window** activates. FO can file a dispute claim alerting both Incharge and MIS.
   - Main Incharge has sole authority to resolve disputes (Accept & Revert to MIS or Reject with explanation).
   - After 24 hours, the dispute window permanently locks for month-end payroll finalization.
4. **Full-Screen Drilldown Workspace (Roster $\to$ Day-by-Day Table)**:
   - Clicking Travel Allowance in Reports Studio opens a clean, full-screen **District Payroll Roster** showing all officers, their status, total KM, and batch action buttons.
   - Clicking *"Inspect / Edit Now ➔"* on an officer drills down into their full-screen **Day-by-Day Two-Wheeler Meter Readings & Route Verification** table.
   - The *"Pre-fill from Daily Reports"* action is tucked away inside a discreet context menu (`•••`) rather than shown as a prominent button.
5. **Cost-Reduction & Caching Architecture**:
   - Compound Firestore queries (`where("month", "==", month).where("district", "==", dist)`).
   - In-memory 300-second TTL cache (`SimpleTTLCache`) on backend endpoints to eliminate duplicate reads.
   - Client-side React session cache to make drilldown navigation instantaneous with 0 Firestore reads.
   - Direct document key lookups for FO App (`{month}_{district}_{staff_key}`) + `localStorage` caching (`dfy_fo_ta_cache_`).

---

## 2. User Roles & Permission Matrix

| Feature / Action | `SUPER_ADMIN` | `MAIN_INCHARGE` | `MIS` | `FIELD_OFFICER` |
|---|:---:|:---:|:---:|:---:|
| **Assign Districts to Users** | ✅ Full | ❌ None | ❌ None | ❌ None |
| **Manage User Roles & PINs** | ✅ Full | ❌ None | ❌ None | ❌ None |
| **Edit Daily Odometer & Deductions** | ✅ Full | ❌ Read-Only / Review | ✅ Permitted Districts | ❌ None |
| **Submit Monthly Roster to Incharge** | ✅ Override | ❌ None | ✅ Permitted Districts | ❌ None |
| **Approve District Roster & Publish** | ✅ Override | ✅ Permitted Districts | ❌ None | ❌ None |
| **Revert Roster / Officer to MIS** | ✅ Override | ✅ Permitted Districts | ❌ None | ❌ None |
| **View TA in Frontline FO App** | ✅ Debug | ❌ None | ❌ None | ✅ Self Only (When Approved) |
| **File TA Dispute Claim (24h Window)** | ❌ None | ❌ None | ❌ None | ✅ Self Only |
| **Resolve Dispute (Accept / Reject)** | ✅ Override | ✅ Permitted Districts | ❌ View Only | ❌ None |
| **Export Multi-Sheet Excel Workbook** | ✅ Full | ✅ Permitted Districts | ✅ Permitted Districts | ❌ None |

---

## 3. Approval Lifecycle & State Machine

```
   [ MIS Data Entry ]
          │
          ▼
     ┌─────────┐
     │  DRAFT  │  ◄───────────────────────────┐
     └────┬────┘                              │
          │                                   │
          │ (MIS clicks "Final Submit")       │
          ▼                                   │
    ┌───────────┐                             │
    │ SUBMITTED │                             │
    └─────┬─────┘                             │
          │                                   │
    ┌─────┴─────────────────────┐             │
    │ Main Incharge Review      │             │
    └─────┬─────────────────────┘             │
          │                                   │
          ├───► Revert with remarks ──────────┘
          │     (Status: REVERTED)
          │
          ▼
    ┌───────────┐
    │ APPROVED  │ ──► Data Published to FO App
    └─────┬─────┘     (approved_at timestamp set)
          │
          ├───► 24-Hour Timer Expires ──► [ LOCKED / PAYROLL FINAL ]
          │
          └───► FO Files Dispute within 24h
                │
                ▼
          ┌───────────┐
          │ DISPUTED  │ ──► Alert sent to Incharge & MIS
          └─────┬─────┘
                │
                ├───► Incharge Accepts ──► Reverts to DRAFT for MIS Fix
                │
                └───► Incharge Rejects ──► Locked with Incharge Explanation
```

### Detailed State Transitions
1. **`DRAFT` (Initial State)**:
   - MIS enters morning/evening meter readings, broken meter overrides, locations, and deduction reasons.
   - Status in Roster: `Draft / Not Submitted`.
   - FO App: Displays *"⏳ Verification in Progress by District MIS & Incharge"*. All amounts hidden or marked pending.
2. **`SUBMITTED`**:
   - MIS triggers `submit_district` (or per-officer submit).
   - Timestamps: `submitted_at`, `submitted_by`.
   - MIS inputs become disabled/read-only unless reverted.
   - Main Incharge sees highlighted notification badge on Roster: *"Pending Approval"*.
3. **`APPROVED`**:
   - Main Incharge triggers `approve_district` (or per-officer approve).
   - Timestamps: `approved_at`, `approved_by`.
   - Immediately publishes verified 31-day data, mileage, deductions, and net payable amount to the Field Officer's profile.
   - Starts the **24-hour dispute countdown** (`approved_at + 24 hours`).
4. **`REVERTED`**:
   - Main Incharge enters required feedback: `revert_reason`.
   - Timestamps: `reverted_at`, `reverted_by`.
   - Status updates to `REVERTED`. Revert banner with Incharge remarks displays prominently on the officer's Day-by-Day table.
   - MIS editing unlocks so corrections can be made and re-submitted.
5. **`DISPUTED`**:
   - Within 24 hours of approval, FO clicks *"⚠️ Report Dispute"*, enters their justification (`reason`), and submits.
   - Timestamps: `disputed_at`, `reason`, `status: "PENDING"`.
   - High-priority amber badge displayed to both MIS and Incharge.
   - Incharge actions:
     - **Accept Dispute**: Updates dispute status to `"ACCEPTED"`, records resolution note, and reverts officer to `DRAFT` for MIS to adjust.
     - **Reject Dispute**: Updates dispute status to `"REJECTED"`, records explanation note to FO, and restores status to `APPROVED` (locked).
6. **`LOCKED`**:
   - Once 24 hours elapse from `approved_at` with no active dispute, dispute button is permanently disabled.
   - Payout figures are locked for accounts and multi-sheet Excel export.

---

## 4. Firestore Data Model & Schema

### 4.1 Collection: `travel_allowance_logs`
Document ID format: `{YYYY-MM}_{canonical_district}_{staff_key}` (e.g. `2026-09_gaya_sauravkumar`)

```json
{
  "month": "2026-09",
  "district": "Gaya",
  "staff_key": "sauravkumar",
  "staff_name": "Saurav Kumar",
  "designation": "Field Officer",
  "daily_logs": {
    "2026-09-01": {
      "initial_reading": 12000,
      "final_reading": 12045,
      "is_override": false,
      "total_km": 45,
      "rate": 4.0,
      "amount": 180.0,
      "from_location": "Gaya HQ",
      "to_location": "Sherghati PHC",
      "purpose": "Sample collection"
    }
  },
  "total_km": 450,
  "rate_per_km": 4.0,
  "gross_amount": 1800.0,
  "deduction_amount": 100.0,
  "deduction_reason": "Excess KM claimed on 14th Sep",
  "admin_remarks": "Verified and passed",
  "final_payable_amount": 1700.0,
  
  "status": "APPROVED", 
  "submitted_at": "2026-09-30 18:30:00",
  "submitted_by": "gaya_mis",
  "submitted_by_name": "Gaya MIS Officer",
  
  "approved_at": "2026-10-01 10:15:00",
  "approved_by": "dr_incharge",
  "approved_by_name": "Dr. R. K. Singh (District Incharge)",
  
  "revert_reason": "",
  "reverted_at": "",
  "reverted_by": "",
  
  "dispute": {
    "is_disputed": false,
    "disputed_at": "",
    "reason": "",
    "status": "NONE",
    "resolution_note": "",
    "resolved_at": "",
    "resolved_by": ""
  },
  
  "updated_at": "2026-10-01 10:15:00",
  "updated_by": "dr_incharge"
}
```

### 4.2 Collection: `admin_users`
Extended role support:
- `SUPER_ADMIN`
- `MAIN_INCHARGE`
- `MIS`
- `SUB_ADMIN` (Legacy fallback, treated with MIS data permissions)

---

## 5. Cost-Reduction & Cloud Resource Architecture

### 5.1 Analysis of Potential Resource Bottlenecks
1. **Firestore (Google Cloud)**:
   - **Pricing**: $0.06 per 100,000 document reads. Free tier: 50,000 reads/day.
   - **Root Cause of Cost**: Unfiltered collection scans and uncached queries.
   - **Target Metric**: The entire monthly TA module across all 22 Bihar districts must generate $\le 2,500$ Firestore reads/month (less than 5% of a *single day's* free quota).
2. **Render (FastAPI Python Backend)**:
   - **Pricing**: Fixed monthly instance ($0 Free / $7 Starter).
   - **Resource Constraint**: 512 MB RAM ceiling.
   - **Target Metric**: Roster payloads are small JSON ($\sim 25\text{ KB}$ per district). In-memory processing stays $< 10\text{ MB}$.
3. **Vercel (React Frontend)**:
   - **Pricing**: Free tier (100 GB bandwidth).
   - **Target Metric**: Edge CDN caching for compiled static JS/CSS. Zero server-side compute cost.

### 5.2 The 3 Cost-Reduction Shields
1. **Shield 1: Compound Firestore Query & 300-Second Backend TTL Cache**:
   - Replace statewide collection queries with strict compound index filters:
     `db.collection("travel_allowance_logs").where("month", "==", clean_month).where("district", "==", clean_dist)`
   - Wrap the district roster in `SimpleTTLCache(default_ttl=300)`.
   - Repeated requests for the same district within 5 minutes hit RAM directly ($0\text{ Firestore reads}$).
   - Any mutation (`save_ta_log`, `district_action`, `dispute`) immediately invalidates that district's cache key.
2. **Shield 2: Client-Side React Session Cache**:
   - `AdminDashboard.jsx` stores the fetched district roster in component memory during navigation.
   - Transitioning between **Screen 1 (Roster)** and **Screen 2 (Day-by-Day)** uses local memory with **0 network requests**.
3. **Shield 3: Single-Document Direct Key Lookup for Frontline App**:
   - Field Officer App (`App.jsx`) queries by exact deterministic document ID: `build_ta_doc_id(month, dist, staff_key)`.
   - Exactly $1\text{ document read}$ on first open.
   - Hydrated into `localStorage` (`dfy_fo_ta_cache_`). Re-opening the app does $0\text{ Firestore reads}$ unless the server version changed.

---

## 6. Frontend UI / UX Specification

### 6.1 Full-Screen Workspace Architecture (Reports Studio)

```
[ Reports Studio Modal -> Click "🛵 Travel Allowance (.xlsx)" ]
                            │
                            ▼
┌────────────────────────────────────────────────────────────────────────┐
│ SCREEN 1: DISTRICT STAFF TA PAYROLL ROSTER (Full Viewport)             │
├────────────────────────────────────────────────────────────────────────┤
│ Header:                                                                │
│ [🛵 DFY Travel Allowance Studio]  [Dist: Gaya ▼] [Month: 2026-09 ▼]    │
│ District Status Badge: [SUBMITTED TO INCHARGE]   [✕ Close Studio (Esc)]│
├────────────────────────────────────────────────────────────────────────┤
│ Executive Action Bar:                                                  │
│ • MIS View: [📤 Final Submit District to Incharge]                     │
│ • Incharge View: [✅ Approve & Publish District] [↩️ Revert District]   │
│ • District Metrics: 18 Staff | 3,420 Total KM | ₹13,680 Net Payable    │
├────────────────────────────────────────────────────────────────────────┤
│ Roster Table:                                                          │
│ Sl | Officer Name | Designation | KM | Gross | Ded | Net | Status | Act│
│ 1  | Saurav Kumar | Field Off.  | 450| 1800  | 100 | 1700| APPROVED| [➔]│
│ 2  | Amit Kumar   | Field Off.  | 380| 1520  | 0   | 1520| DRAFT   | [➔]│
│                                                                        │
│ Action: Clicking "[Inspect / Edit Now ➔]" transitions to Screen 2.      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ SCREEN 2: DAY-BY-DAY ROUTE & METER VERIFICATION (Drill-Down View)      │
├────────────────────────────────────────────────────────────────────────┤
│ Top Controls Bar:                                                      │
│ [← Back to District Roster]                                            │
│ [Dist: Gaya ▼] [Month: 2026-09 ▼] [Staff: Saurav Kumar (FO) ▼]         │
│ Status Badge: [APPROVED]                                               │
│ [••• Context Menu] [💾 Save TA Log] [✕ Close Studio]                   │
│   └── Hidden Option: "⚡ Sync from Daily Submissions"                   │
├────────────────────────────────────────────────────────────────────────┤
│ [If REVERTED / DISPUTED]: Amber Alert Box with Incharge / FO Remarks   │
├────────────────────────────────────────────────────────────────────────┤
│ 4 Month-End Reconciliation Cards:                                      │
│ [Total Travel KM] [Gross TA Claim] [Admin Deductions] [Net Approved ₹] │
├────────────────────────────────────────────────────────────────────────┤
│ 31-Day Uncropped Interactive Table:                                    │
│ • Date | Day | Initial KM | Final KM | Broken? | KM | Rate | Amount    │
│ • From Location (min-w-[200px]) | To Location (min-w-[220px])          │
│ • Purpose & Remarks (min-w-[280px])                                    │
│ • Sticky Top Header (z-20 bg-slate-900 text-white)                     │
├────────────────────────────────────────────────────────────────────────┤
│ Sticky Bottom Bar:                                                     │
│ Staff Summary | [💾 Save TA Log] [← Back to Roster]                    │
└────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Discreet Pre-fill Placement
- The prominent amber *"Pre-fill from Daily Reports"* button is removed from the main header.
- Replaced with a subtle `•••` action dropdown menu in the Day-by-Day header containing:
  - *"⚡ Sync from Daily Submissions (Auto-fill)"*
- Keeps the interface uncluttered for standard operators while preserving the powerful pre-fill capability.

### 6.3 Frontline Field Officer App (`App.jsx`)
1. **Verification-in-Progress Placeholder**:
   - If log status is `DRAFT`, `SUBMITTED`, or `REVERTED`, the FO App displays:
     ```
     ┌───────────────────────────────────────────────────────────┐
     │ 🛵 Two-Wheeler Travel Allowance (September 2026)           │
     │ ⏳ Verification in Progress by District MIS & Incharge    │
     │ Monthly odometer readings and route claims are currently  │
     │ being audited. Final approved TA will appear after review.│
     └───────────────────────────────────────────────────────────┘
     ```
2. **Approved TA Display**:
   - When status is `APPROVED`, reveals:
     - Total verified travel distance (`KM`) and approved net payable (`₹`).
     - Breakdown of gross claim, deductions, and deduction reason.
     - Day-by-day inspection card.
3. **24-Hour Dispute Window**:
   - Prominent amber banner with live countdown:
     `⏱️ Dispute Window: 18h 24m remaining to file claim.`
   - Button: `⚠️ Report Deduction Dispute / Claim`.
   - Clicking opens modal:
     - Disputed amount / kilometers input.
     - Detailed explanation textarea.
     - Submitting sends a high-priority dispute flag to Main Incharge and District MIS.
   - After 24 hours: Button transforms to `🔒 Payroll Finalized & Locked`.

---

## 7. API Endpoints Specification

### 7.1 `GET /admin/ta/log` (Enhanced with Caching & Workflow Data)
- **Parameters**: `month`, `district`, `staff_key` (optional), `pin` (for FO read).
- **Backend Optimizations**:
  - Direct Firestore compound query when `district` is provided.
  - Checks `SimpleTTLCache(key=f"ta_roster_{month}_{c_dist}")`.
  - Returns `status`, `submitted_at`, `approved_at`, `revert_reason`, `dispute`.

### 7.2 `POST /api/ta/district-action` (New)
- **Request Body**:
  ```json
  {
    "month": "2026-09",
    "district": "Gaya",
    "action": "submit" | "approve" | "revert",
    "revert_reason": "Specific feedback for MIS...",
    "staff_keys": [] // Optional list for single-staff revert/approve
  }
  ```
- **Authorization**:
  - `action == "submit"`: Allowed for `MIS`, `SUPER_ADMIN`.
  - `action in ["approve", "revert"]`: Strictly required `MAIN_INCHARGE` or `SUPER_ADMIN`.
- **Side Effects**:
  - Updates all target documents in a single batched Firestore commit.
  - Invalidates backend cache `ta_roster_{month}_{district}`.
  - Writes audit log entry.

### 7.3 `POST /api/ta/dispute` (New)
- **Request Body**:
  ```json
  {
    "month": "2026-09",
    "district": "Gaya",
    "staff_key": "sauravkumar",
    "pin": "1234",
    "reason": "Deduction of 45 KM on 12th was an official PHC inspection"
  }
  ```
- **Validation**:
  - Validates staff PIN against directory.
  - Validates `now() - approved_at <= 24 * 3600 seconds`. Returns HTTP 400 if expired.
- **Side Effects**:
  - Sets `dispute.is_disputed = true`, `dispute.reason = reason`, `dispute.status = "PENDING"`.
  - Sets document `status = "DISPUTED"`.
  - Invalidates district cache.

### 7.4 `POST /api/ta/resolve-dispute` (New)
- **Request Body**:
  ```json
  {
    "month": "2026-09",
    "district": "Gaya",
    "staff_key": "sauravkumar",
    "resolution": "accept" | "reject",
    "resolution_note": "Explanation for FO..."
  }
  ```
- **Authorization**: Strictly `MAIN_INCHARGE` or `SUPER_ADMIN`.
- **Side Effects**:
  - If `accept`: Reverts status to `DRAFT` so MIS can adjust entries.
  - If `reject`: Restores status to `APPROVED` with `resolution_note` displayed to FO.

---

## 8. Verification Strategy & Acceptance Criteria

### 8.1 Automated Test Suites
1. **Backend Integration Tests** (`tests/test_ta_approval_workflow.py`):
   - Test MIS submission locks/marks `SUBMITTED`.
   - Test Incharge approval transitions to `APPROVED` and sets `approved_at`.
   - Test Sub-Admin / MIS cannot call `approve` or `revert` (HTTP 403).
   - Test FO dispute within 24 hours succeeds; test dispute after 24h fails with HTTP 400.
   - Test Incharge dispute resolution (`accept` vs `reject`).
   - Test 5-minute TTL cache hit rate and invalidation on write.
2. **Frontend UI Tests** (`tests/test_ta_approval_ui.mjs`):
   - Assert Screen 1 (Roster) renders first in Full Screen.
   - Assert clicking *"Inspect / Edit Now ➔"* renders Screen 2 (Day-by-Day table).
   - Assert Back to Roster button restores Screen 1 without API reload.
   - Assert Pre-fill button is inside discreet context menu (`•••`).
   - Assert FO App displays *"Verification in Progress"* before approval and dispute countdown after approval.
3. **App Verification Battery**:
   - `python -m py_compile main.py` exits 0.
   - `npm --prefix dfy-frontend run lint` exits 0 errors.
   - `npm --prefix dfy-frontend run build` exits 0.
   - Line-by-line `git diff` audit.

---

## 9. Rollout, Safety & Branch Isolation
- All work strictly remains on local branch **`feat/travel-allowance-bike-log`**.
- Zero pushes to `origin/main`.
- Local test environment on `http://127.0.0.1:8000` and `http://127.0.0.1:5173`.
