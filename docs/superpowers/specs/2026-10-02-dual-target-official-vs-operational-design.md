# Dual-Target Architecture: Official District Targets vs. Frontline Operational Stretch Targets

## 1. Executive Summary & Problem Statement

### 1.1 The Operational Conflict
In the Bihar TB Monitoring MIS, field supervision operates under two conflicting target dynamics:
1. **Official State / DTO Quota (Management Benchmark)**:
   - State Health Society / DTO allocates an official target for a district (e.g. 100 notifications/month).
   - State leadership, donors, and district health officers judge performance against this benchmark:
     $$\text{Official Achievement \%} = \frac{\text{Actual Notifications (85)}}{\text{Official District Target (100)}} \times 100 = 85.0\% \quad \text{(Good / Green)}$$
2. **Frontline Push / Stretch Quota (Operational Motivation)**:
   - To ensure frontline field officers (FOs) remain proactive and surpass the official quota, District Coordinators and MIS leads intentionally assign stretched targets across officers (e.g., 4 FOs assigned 35 notifications each = 140 total).

### 1.2 The System Flaw Prior to This Design
Previously, the system only supported a single target field per officer in `staff_targets`. The District Target was computed by simply summing all staff targets:
$$\text{District Target} = \sum \text{staff\_targets} = 140$$
When supervisors entered the stretched targets (35 each) so the boys would see 35 in their mobile app, the entire district target was inflated to 140.
Consequently, when State Leads reviewed the monthly reports:
$$\text{Reported Achievement \%} = \frac{85}{140} \times 100 = 60.7\% \quad \text{(Underperforming / Red Alert)}$$
This penalized high-performing districts in State WhatsApp Bulletins, KPI Excel Workbooks, and Executive Leadership Reviews.

### 1.3 The Solution: Decoupled Dual-Target Engine
This specification introduces a decoupled Dual-Target Architecture:
- **Official District Target**: Stored per district and month in `district_targets`, used exclusively for State Lead Executive Dashboards, District Pacing Cards, State Summary Matrices, WhatsApp Executive Bulletins, and Official 33-Sheet KPI Excel Workbooks.
- **Frontline Display Target**: Stored per officer in `staff_targets`, displayed exclusively in the FO Mobile App profile (`App.jsx`) with dedicated personal run-rates and pacing bars.
- **Zero Leakage**: Field Officers have zero visibility into the internal district buffer or official state quota.

---

## 2. Architecture & Role-Based Access Control (RBAC)

### 2.1 RBAC Matrix

| User Role | View Official District Target | Edit Official District Target | View FO Display Target | Edit FO Display Target | Cross-District Isolation |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **SUPER_ADMIN** | ✅ All 38 Districts | ✅ All 38 Districts | ✅ All 38 Districts | ✅ All 38 Districts | Statewide Access |
| **MAIN_INCHARGE** | ✅ All 38 Districts | ❌ Audit Only | ✅ All 38 Districts | ❌ Audit Only | Statewide Access |
| **SUB_ADMIN / MIS**| ✅ Permitted Districts Only | ✅ Permitted Districts Only | ✅ Permitted Districts Only | ✅ Permitted Districts Only | Strictly Locked to `allowed_districts` |
| **FIELD_OFFICER** | ❌ Strictly Hidden | ❌ Forbidden | ✅ Self Only | ❌ Forbidden | Own Profile Only |

### 2.2 Strict Sub-Admin Cross-District Isolation Guard
- On `GET /targets` or `GET /district-targets`: Sub-Admins only receive target data for districts inside their `allowed_districts` array.
- On `POST /update-district-target`: If `clean_dist` is not in `admin["allowed_districts"]` (and `"All"` is not present), the backend immediately rejects the request with `HTTP 403 Forbidden`:
  ```python
  if admin.get("role") == "SUB_ADMIN":
      allowed = admin.get("allowed_districts", [])
      if "All" not in allowed and clean_dist not in allowed:
          raise HTTPException(
              status_code=403, 
              detail=f"Permission denied. Cross-district target modification forbidden for '{clean_dist}'."
          )
  ```
- If a Sub-Admin account has an empty list `allowed_districts: []`, zero records are leaked and requests return an empty collection or HTTP 403.

---

## 3. Data Models & Firestore Schemas

### 3.1 Collection: `district_targets` (New Collection)
Stores the explicit management benchmark for a district.

* **Document ID**: `{YYYY-MM}_{canonical_district}` (e.g., `2026-10_patna`, `2026-10_jamui`).
* **Document Schema**:
  ```json
  {
    "month": "2026-10",
    "district": "Jamui",
    "official_target": 100,
    "updated_at": "2026-10-02 10:30:00",
    "updated_by": "Saurav Kumar",
    "updated_by_id": "subadmin_jamui",
    "updated_by_role": "SUB_ADMIN"
  }
  ```
* **General Default Document ID**: `{canonical_district}` (e.g. `jamui`) for year-round default fallback if month-specific record is not yet created.

### 3.2 Collection: `staff_targets` (Existing Collection — Preserved)
Stores individual officer targets shown in the frontline mobile application.

* **Document ID**: `{YYYY-MM}_{canonical_district}_{clean_fo_name}`
* **Document Schema**:
  ```json
  {
    "month": "2026-10",
    "district": "Jamui",
    "fo_name": "Rajiv Kumar",
    "target": 35,
    "updated_at": "2026-10-02 10:30:00"
  }
  ```

### 3.3 Dynamic Resolution & Fallback Hierarchy
Whenever the system requires the effective target for district aggregations:
1. Check `district_targets` for `{month}_{district}`. If `official_target > 0` $\to$ **Use `official_target`**.
2. If not found, check `district_targets` for general `{district}`. If `official_target > 0` $\to$ **Use `official_target`**.
3. If not found, fallback to **Sum of Staff Targets** ($\sum \text{staff\_targets}$).
4. If no staff targets exist, fallback to system safe default: **50**.
5. Division-by-zero protection is universally applied: `effective_target = max(1, resolved_target)`.

---

## 4. Backend Endpoints & Computation Engines (`main.py`)

### 4.1 `GET /targets` (Updated)
* **Query Parameters**: `month` (e.g. `2026-10`), `district` (e.g. `Jamui` or `All`).
* **Headers**: `Authorization: Bearer <token>`.
* **Behavior**:
  - Validates Sub-Admin district access against `allowed_districts`.
  - Checks in-memory cache `targets_{month}_{district}_{user_scope}` (TTL: 1800s).
  - Fetches both `district_targets` and `staff_targets`.
* **Response Payload**:
  ```json
  {
    "success": true,
    "month": "2026-10",
    "district": "Jamui",
    "official_district_target": 100,
    "staff_targets_sum": 130,
    "buffer_percent": 30.0,
    "buffer_count": 30,
    "targets": [
      { "fo_name": "Rajiv Kumar", "district": "Jamui", "target": 35, "month": "2026-10" },
      { "fo_name": "Bablu Kumar", "district": "Jamui", "target": 30, "month": "2026-10" },
      { "fo_name": "Monu Kumar", "district": "Jamui", "target": 35, "month": "2026-10" },
      { "fo_name": "Rinki Kumari", "district": "Jamui", "target": 30, "month": "2026-10" }
    ]
  }
  ```

### 4.2 `POST /update-district-target` (New Endpoint)
* **Request Payload**:
  ```json
  {
    "month": "2026-10",
    "district": "Jamui",
    "official_target": 100
  }
  ```
* **RBAC Guard**: Enforces `allowed_districts` for `SUB_ADMIN`.
* **Database Action**: Writes to `district_targets/{month}_{district}` with `merge=True`.
* **Cache Eviction**: Targeted eviction of `district_targets_{month}_{clean_dist}`, `pacing_settings_{month}_{clean_dist}`, and `targets_{month}_*`.
* **Audit Logging**: Emits entry to `admin_activity_logs` with action type `"DISTRICT_TARGET_UPDATED"`.

### 4.3 Frontline Mobile Stats Engine (`my_profile_stats`)
* Endpoint `POST /api/my-profile-stats`:
  - Continues reading from `staff_targets` for `fo_name`.
  - Returns `target_notifications = 35` and computes personal pacing strictly against 35.
  - Returns zero information regarding `official_district_target` or district stretch buffer.

### 4.4 KPI Excel Engine (`generate_district_kpi_bytes`)
* In `main.py:3896`:
  - When computing the district target for Indicator 1 (Total Notifications), uses `official_district_target`.
  - Injects `official_district_target` into summary cells.
  - Ensures Excel cell formulas calculate percentage against the management quota:
    `=(Actual / Official_Target) * 100`.

---

## 5. Frontend UI/UX Specifications (`AdminDashboard.jsx` & `App.jsx`)

### 5.1 Admin Target Management Deck (`AdminDashboard.jsx`)
In the Target Settings tab/modal:
1. **Official District Target Card**:
   - High-contrast card with blue/indigo theme.
   - Number input: `Official District Target` (e.g. `100`).
   - "Save District Target" button with immediate loading and disabled states (`isSavingDistrictTarget`).
2. **Real-time Live Comparison Pill**:
   - Displays dynamic math calculated in React:
     - `Official Target: 100`
     - `Frontline Assigned Sum: 130`
     - `Buffer: +30% (+30 Stretch Quota)`
   - Color coded:
     - Emerald pill if Frontline $\ge$ Official (Healthy Stretch Zone).
     - Amber pill if Frontline $<$ Official (Under-allocated Warning).
3. **Staff Distribution Roster**:
   - Table of active officers with individual target inputs.
   - Instant live update of Frontline Assigned Sum when any staff input changes.

### 5.2 Admin Overview Target Pacing Card (`AdminDashboard.jsx`)
* **Primary Progress Gauge**:
  - Calculates achievement % using `officialDistrictTarget`:
    $$\text{Achievement \%} = \frac{\text{Achieved}}{\text{Official Target}} \times 100$$
  - Displays: `85 / 100 Notifications (85.0%)`.
* **Secondary Sub-Text (Admin Insight Only)**:
  - `🛵 Frontline Stretch Quota: 130 (Ground Pacing: 65.4%)`.

### 5.3 Executive WhatsApp Bulletin (`AdminDashboard.jsx`)
* In `liveWhatsAppBulletin`:
  - District ranking and achievement percentages use `officialDistrictTarget`.
  - Distinguishes high-performing districts accurately according to State expectations.

---

## 6. Resilience, Fallbacks & Anti-OOM Protections

1. **Unset Month Grace**:
   - If an admin does not set an official district target for a new month, the resolver seamlessly uses $\sum \text{staff\_targets}$, preserving uninterrupted operations.
2. **Zero-Read Memory Caching**:
   - `district_targets` are cached in Python L1/L2 cache alongside `staff_targets`. Cache hits incur 0 Firestore reads.
3. **Anti-Double-Tap & Concurrency Guards**:
   - Mutation buttons enforce immediate `disabled={isSaving}` to prevent rapid duplicate writes.
4. **Temporal Dead Zone (TDZ) Order**:
   - All state hooks (`useState`) are declared before derived calculations (`useMemo`), handlers (`useCallback`), and trigger effects (`useEffect`).

---

## 7. Testing & Verification Battery

### 7.1 Automated Backend Tests (`tests/test_dual_target_engine.py`)
- `test_subadmin_district_target_isolation_allowed`: Sub-Admin can set target for permitted district (200 OK).
- `test_subadmin_district_target_isolation_forbidden`: Sub-Admin receives 403 when updating forbidden district.
- `test_district_target_resolution_precedence`: Resolves explicit official target over staff sum.
- `test_district_target_fallback_to_staff_sum`: When official target is missing, smoothly falls back to staff sum.
- `test_fo_my_profile_stats_uses_display_target`: FO profile returns display target (35) with zero leak of official quota.
- `test_kpi_excel_engine_uses_official_district_target`: Confirms exported Excel references official target.

### 7.2 Automated Frontend UI Tests (`tests/test_dual_target_ui.mjs`)
- Verifies Admin Target deck displays Official District Target input and Live Comparison buffer pill.
- Verifies Overview Target Pacing card calculates percentage using official district target.
- Verifies FO mobile app hides district official target and displays only personal stretch target.
