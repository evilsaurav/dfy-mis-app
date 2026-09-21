# Specification: Multi-Tier Duplicate Notification Prevention & Auto-Repair Architecture

- **Author:** Antigravity / Engineering Team
- **Date:** 2026-09-21
- **Status:** Approved for Implementation
- **Target Release:** v2.7.4

---

## 1. Executive Summary & Problem Context

### 1.1 The Clinical & Operational Rule
Under the National Tuberculosis Elimination Program (NTEP), a TB patient receives an Episode ID upon initial diagnosis and **Notification**. 
- **Rule 1 (Strict Notification Uniqueness):** A patient can be **Notified ONLY ONCE** in the entire active treatment period (cross-month / last 90 days). A second notification for the same ID anywhere in the district/system is a **critical data corruption anomaly** that artificially inflates district targets and government reporting metrics.
- **Rule 2 (Intervention Multiplicity):** Clinical interventions (e.g., Home Visits, FDC Drug Refills, Follow-ups, DBT Seeding, Contact Tracing) can occur multiple times across a patient's 6-month treatment journey. These require **soft confirmation warnings**, not hard blocks.

### 1.2 The Real-World Incident
In September 2026, a Field Officer submitted daily reports up to 05 Sep. On 06 Sep, the officer re-reported all his IDs from 01 to 05 Sep inside the 06 Sep submission. 
- Because Firestore document IDs are `{district}_{fo_name}_{date_of_reporting}`, the 06 Sep record was treated as brand new.
- `daily_district_rollups` incremented by the full duplicate batch, doubling notification counts for those patients.
- The existing frontend toast warning (`showToast`) was non-blocking and faded in 3 seconds, allowing the submission to proceed.
- The offline PWA queue had zero awareness of already-notified IDs.

---

## 2. Strict RBAC & Cross-District Isolation (Mandatory)

Per **`GEMINI.md` Rule 4**, all new endpoints and UI components must enforce cross-district isolation:
1. **Sub-Admin Restriction on Scan & Repair:**
   - In `GET /admin/scan-duplicate-notifications` and `POST /admin/repair-duplicate-notifications`, Sub-Admin users can **ONLY** scan and repair records within their assigned `allowed_districts`.
   - Any attempt by a Sub-Admin to repair another district's data returns `HTTP 403 Forbidden`.
2. **Canonical Matching:**
   - All district comparisons use `canonicalize_district(d).lower()`.
3. **Audit Logging:**
   - Every repair mutation logs the executing admin's `user_id`, role, target district, and list of pruned IDs into `admin_audit_logs`.

---

## 3. Architecture & System Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            FIELD OFFICER CLIENT                             │
│                                                                             │
│  ┌───────────────────────┐             ┌─────────────────────────────────┐  │
│  │   IndexedDB Store     │             │       Form Input Gate           │  │
│  │ "district_notified_   │◄────────────┤ • Notification: Strict Red Modal│  │
│  │       registry"       │ (Instant    │ • Other: Amber Confirm Modal    │  │
│  └───────────▲───────────┘ 0ms lookup) └────────────────┬────────────────┘  │
│              │                                          │                   │
│              │ (Login / Online sync)                    ▼                   │
│              │                         ┌─────────────────────────────────┐  │
│              │                         │ IndexedDB "offline_reports_     │  │
│              │                         │             queue"              │  │
│              │                         └────────────────┬────────────────┘  │
└──────────────┼──────────────────────────────────────────┼───────────────────┘
               │                                          │ (Auto-sync when online)
               │                                          ▼
┌──────────────┴──────────────────────────────────────────────────────────────┐
│                            FASTAPI BACKEND                                  │
│                                                                             │
│  [GET /api/district-notification-registry]                                  │
│   • Streams last 90 days of notification IDs (~18 KB compact JSON)          │
│                                                                             │
│  [POST /submit-daily-report]  <-- Ingestion Defense Gate                    │
│   • Matches incoming notification_ids against 90-day district records       │
│   • Auto-prunes duplicate notification IDs                                   │
│   • Preserves all valid work (DBT, Visits, Doctor Visits, Remarks)          │
│   • Increments daily_district_rollups ONLY by valid new notifications       │
│   • Returns detailed feedback: { pruned_duplicate_notifications: [...] }    │
│                                                                             │
│  [POST /admin/repair-duplicate-notifications]                               │
│   • RBAC Protected (Sub-Admin isolated)                                     │
│   • Removes duplicates from subsequent date reports                         │
│   • Decrements inflated rollups atomically (Increment(-N))                  │
│   • Invalidates shared cache keys & records audit log                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Detailed Component Specifications

### 4.1 Backend APIs

#### Endpoint 1: `GET /api/district-notification-registry`
- **Access:** Authenticated FO or Admin.
- **Parameters:** `district: str`, `months: Optional[int] = 3`.
- **Logic:**
  1. Computes date range: from `(today - 90 days)` to `today`.
  2. Fetches `daily_field_reports` for canonical district within date range.
  3. Constructs a deduplicated map:
     ```json
     {
       "district": "Aurangabad",
       "total_count": 842,
       "registry": {
         "123456789": { "date": "2026-09-02", "fo_name": "Ramesh Kumar" },
         "987654321": { "date": "2026-08-18", "fo_name": "Suresh Paswan" }
       },
       "cached_at": "2026-09-21T14:30:00"
     }
     ```
  4. Cached in memory (`registry_{district}_{month}`) with 2-hour TTL, invalidated on report mutations.

#### Endpoint 2: `POST /submit-daily-report` (Ingestion Defense Enhancement)
- **Logic:**
  1. When processing `report.notification_ids`:
     - Query existing reports in that district over the last 90 days.
     - Build `existing_notified_set` (excluding the current report being updated if editing today's draft).
     - Split incoming IDs:
       - `valid_new_notifications = [pid for pid in incoming if pid not in existing_notified_set]`
       - `pruned_duplicates = [pid for pid in incoming if pid in existing_notified_set]`
  2. If `pruned_duplicates` is non-empty:
     - `payload["notification_ids"] = valid_new_notifications`
     - Log warning: `f"[Duplicate Pruned] {len(pruned_duplicates)} notification IDs stripped from {doc_id}"`.
  3. `delta_counts["notifications"] = len(set(valid_new_notifications) - old_notifs)`.
  4. Return response:
     ```json
     {
       "message": "Daily report submitted successfully",
       "pruned_duplicate_notifications": pruned_duplicates,
       "pruned_count": len(pruned_duplicates)
     }
     ```

#### Endpoint 3: `GET /admin/scan-duplicate-notifications`
- **Access:** Admin / Sub-Admin (`Depends(get_current_admin)`).
- **Parameters:** `month: str` (e.g., `2026-09`).
- **RBAC:** Sub-Admin only sees records where `canonicalize_district(working_place)` is in `admin["allowed_districts"]`.
- **Logic:**
  1. Streams all reports for the month, sorted chronologically (`date_of_reporting ASC`).
  2. Tracks `first_seen_notif[pid] = { date, fo_name, doc_id }`.
  3. Flags any report where an already-seen PID is re-notified.
  4. Returns:
     ```json
     {
       "month": "2026-09",
       "total_inflated_count": 14,
       "instances": [
         {
           "district": "Aurangabad",
           "fo_name": "Ramesh Kumar",
           "repeat_date": "2026-09-06",
           "repeat_doc_id": "aurangabad_ramesh_kumar_2026-09-06",
           "duplicate_ids": ["123456789", "123456780"],
           "original_occurrences": [
             { "id": "123456789", "date": "2026-09-02", "fo_name": "Ramesh Kumar" }
           ]
         }
       ]
     }
     ```

#### Endpoint 4: `POST /admin/repair-duplicate-notifications`
- **Access:** Admin / Sub-Admin (`Depends(get_current_admin)`).
- **Payload:** `{ month: str, district: str, instance_doc_id: str, duplicate_ids: List[str] }` or `{ month: str, auto_repair_all: bool }`.
- **RBAC:** Strictly verifies target district against Sub-Admin permissions. Raises `HTTP 403` if unauthorized.
- **Execution:**
  1. Reads target document `instance_doc_id`.
  2. Filters `notification_ids` = `[pid for pid in current_ids if pid not in duplicate_ids]`.
  3. Updates report document with cleaned list.
  4. Atomically decrements `daily_district_rollups` for that date:
     `rollup_ref.set({"notifications": firestore.Increment(-len(duplicate_ids))}, merge=True)`.
  5. Invalidates cache keys (`dash_`, `shared_raw_month_`, `dupe_audit_`).
  6. Writes audit record in `admin_audit_logs`.

---

### 4.2 Frontend Mobile Application (`App.jsx` & `offlineQueue.js`)

#### 1. Local Offline Registry Storage (`offlineQueue.js`)
- Add IndexedDB Object Store: `district_notified_registry`.
- Helper functions:
  - `saveDistrictRegistry(district, registryMap)`
  - `getDistrictRegistry(district)`
  - `isPatientIdNotified(district, patientId)` -> returns `{ notified: boolean, date?: string, fo_name?: string }`.

#### 2. Mobile UI Modals in `App.jsx`
1. **Red Strict Block Modal (`DuplicateNotificationBlockModal`):**
   - Triggers when an ID is added to `notification_ids` and exists in `district_notified_registry`.
   - Prevents addition to `formData.notification_ids`.
   - Shows original reporting officer, date, and helpful NTEP clinical guidance.
2. **Amber Confirmation Modal (`RepeatInterventionConfirmModal`):**
   - Triggers when an ID is added to other indicators and was already reported in that category this month.
   - Provides two explicit buttons:
     - `[ Haan, Dobara Visit Hui Hai (Add) ]`
     - `[ ❌ Galti Se Ho Gaya (Cancel) ]`
3. **WhatsApp Batch Paste Handler:**
   - Automatically detects and filters duplicate notifications.
   - Displays a clean summary dialog of filtered vs added IDs.

---

### 4.3 Admin Dashboard Enhancement (`AdminDashboard.jsx`)
- Inside `Duplicate Radar` modal:
  - Add Tab: **"🚨 Notification Inflation & 1-Click Fix"**.
  - Renders scan preview with officer name, repeat date, duplicate count, and affected rollups.
  - Sub-Admin users only see their assigned districts.
  - Features high-contrast button: `[ 🧹 Clean Duplicate IDs & Correct Rollups ]`.
  - On click: Executes repair, displays confirmation toast, and triggers instant dashboard re-fetch.

---

## 5. Verification & Testing Plan

1. **Compilation & Build:**
   - `python -m py_compile main.py` exits 0.
   - `npm run lint` in `dfy-frontend/` passes with 0 errors.
   - `npm run build` in `dfy-frontend/` exits 0.
2. **Backend Automated Tests:**
   - Test `/api/district-notification-registry` returns accurate deduplicated map.
   - Test `/submit-daily-report` auto-prunes duplicate notification IDs and increments rollups accurately.
   - Test Sub-Admin RBAC: Sub-Admin cannot repair a different district.
   - Test `/admin/repair-duplicate-notifications` properly decrements rollups and cleans reports.
3. **Manual Flow Verification:**
   - Enter duplicate notification ID offline in mobile form -> verify Red Modal blocks entry.
   - Enter duplicate Home Visit ID -> verify Amber Modal asks for confirmation.
   - Open Duplicate Radar in Admin Dashboard -> verify scan shows the 06 Sep duplicate instance and 1-click repair corrects the rollup.
