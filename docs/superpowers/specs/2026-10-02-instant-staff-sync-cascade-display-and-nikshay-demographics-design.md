# Design Specification: Instant Staff Sync, Cascade Radar Display & Nikshay Demographics Capture

- **Date**: October 2, 2026
- **Status**: Approved
- **Target Files**:
  - `dfy-frontend/src/AdminDashboard.jsx`
  - `dfy-frontend/src/hooks/useAdminModals.js`
  - `backend/routers/nikshay.py`
  - `tests/test_staff_optimistic_instant_sync.mjs`
  - `tests/test_cascade_alerts_data_unwrap.mjs`
  - `tests/test_nikshay_demographics_flexible_match.py`

---

## 1. Problem Statement & Objectives

1. **Staff Management Latency & Synchronicity**:
   - When administrators add, delete, or toggle staff members, the modal remains open with a loading spinner for 2–3 seconds while awaiting round-trip API responses and 5 consecutive network refetches in `Promise.all`.
   - Furthermore, `setStaffList` and `setStaffDirectory` are not currently passed into `useAdminModals`, preventing immediate optimistic updates in the local UI table and FO dropdowns.
   - **Objective**: Provide instantaneous (0ms perceived latency) UI updates using optimistic state mutation, closing modals immediately with success toasts, while background asynchronous sync handles server persistence and cache reconciliation.

2. **Predictive Clinical Cascade & Dropout Radar Display**:
   - Backend endpoint `/admin/cascade-alerts` returns `{ "success": true, "data": { "summary": {...}, "alerts": [...] } }`.
   - In `useAdminModals.js`, `setCascadeData(data)` stores the wrapper object directly into `cascadeData`, causing `CascadeAlertsModal.jsx` to find `cascadeData.summary?.total_notified` as `undefined`.
   - **Objective**: Unwrap `data?.data || data` so `cascadeData.summary` and `cascadeData.alerts` bind seamlessly to the modal UI. Also ensure Sub-Admin district query parameters are properly attached.

3. **Nikshay Reconciler Patient Name and Mobile Number Capture**:
   - When Nikshay dumps are uploaded, variations in column naming (e.g. `"Name of Patient"`, `"Name of the Patient"`, `"Contact Number"`, `"Mobile No."`) fail rigid substring checks, resulting in `name_col = None` and blank names/phones.
   - When month filtering is applied, records with diagnosis/notification dates outside the exact selected month string are skipped entirely, causing DFY MIS fallback records to be saved with blank names and phones.
   - **Objective**: Implement ultra-flexible column detection for names and phones. Ensure that any Nikshay patient found in the uploaded dump has their demographic metadata (`patient_name` and `phone`) captured in the Permanent Verification Ledger (`nikshay_verified_patients`), preventing blank fields.

---

## 2. Technical Architecture & Component Design

### 2.1. Instant Staff Management with Optimistic UI
In `AdminDashboard.jsx`:
- Pass `setStaffList` and `setStaffDirectory` into `useAdminModals`.

In `useAdminModals.js`:
- **Add Staff**:
  - Immediately close `setAddStaffModal(null)`.
  - Immediately show `showToast("✓ New staff officer registered!", "success")`.
  - Optimistically append `{ name, district, pin, designation, target, status: 'active', is_active: true }` to `staffList` via `setStaffList(prev => [...prev, newOfficer])`.
  - Optimistically add `name` to `staffDirectory[district]` via `setStaffDirectory(prev => ({ ...prev, [district]: [...(prev[district] || []), name].sort() }))`.
  - Execute background API call and cache invalidation. If network errors occur, rollback state with an error toast.
- **Delete Staff**:
  - Immediately close `setDeleteStaffModal(null)`.
  - Immediately show `showToast(\`✓ Officer ${name} removed from registry.\`, "success")`.
  - Optimistically remove `{ name, district }` from `staffList` and `staffDirectory`.
  - Execute background API call. Rollback on failure.
- **Toggle Status**:
  - Immediately close `setStaffToggleModal(null)`.
  - Optimistically flip `status` / `is_active` in `staffList`.
  - Execute background API call. Rollback on failure.

### 2.2. Cascade Radar Response Unwrapping
In `useAdminModals.js` (`fetchCascadeAlerts`):
- Compute effective district query string:
  ```javascript
  let q = `?month=${month}`;
  if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
    q += `&districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}`;
  }
  const res = await authFetch(`${API_BASE_URL}/admin/cascade-alerts${q}`);
  if (res.ok) {
    const json = await res.json();
    setCascadeData(json?.data || json || { summary: {}, alerts: [] });
  }
  ```

### 2.3. Nikshay Flexible Header Detection & Demographics Retention
In `backend/routers/nikshay.py`:
- Replace brittle substring checks with comprehensive multi-pattern functions:
  ```python
  def is_name_header(c: str) -> bool:
      h = str(c).strip().lower().replace(" ", "_").replace(".", "")
      if any(k in h for k in ["patient_name", "patientname", "beneficiary_name", "case_name", "client_name"]):
          return True
      if "name" in h and any(k in h for k in ["patient", "beneficiary", "case", "client", "person"]):
          return True
      if h in ["name", "patient", "patient_name", "name_of_patient", "name_of_the_patient", "beneficiary"]:
          return True
      return False

  def is_phone_header(c: str) -> bool:
      h = str(c).strip().lower().replace(" ", "_").replace(".", "")
      return any(k in h for k in ["primaryphone", "phone", "mobile", "contact", "cell"])
  ```
- In `reconcile_nikshay`:
  - When parsing the uploaded file, store demographics (`name`, `phone`, `district`) for all valid Nikshay IDs into an all-patients map, regardless of date filtering.
  - When syncing to `nikshay_verified_patients`, populate `patient_name` and `phone` from this map whenever available, ensuring patient names and mobile numbers are never blank.

---

## 3. Security, RBAC & Data Integrity
- Sub-Admin cross-district security constraints remain strictly enforced.
- Monotonic retention guarantee in `nikshay_verified_patients`: indicators once verified as True never revert to False.
- Concurrency guards, Render RAM protection, and Firestore read optimizations remain intact.
