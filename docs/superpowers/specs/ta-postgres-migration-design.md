# Specification: PostgreSQL Schema & Relational Redesign for Travel Allowance (TA) Subsystem

- **Date:** 2026-10-07
- **Author:** DFY Engineering Team
- **Status:** DRAFT / PENDING USER APPROVAL GATE (DO NOT APPLY DDL TO PROD DB)

---

## 1. Live Database Audit & Schema Context

The DFY TB MIS database runs on PostgreSQL 17.11 (Supabase). The audit of the production database revealed the following existing normalized relational structures:

1. **`staff_directory`**:
   - `id`: `BIGINT` PK.
   - `district_id`: `SMALLINT` FK -> `districts(id)`.
   - `name`: `TEXT` (Officer name).
   - `pin`: `CHARACTER(4)` (Field officer PIN).
   - `designation`: `TEXT` (Default: 'Field Officer').
   - `is_active`: `BOOLEAN` (Default: true).
   - `deleted_at`: `TIMESTAMPTZ` (Soft delete).
   - `district`: `TEXT` (Denormalized district name).

2. **`daily_field_reports`**:
   - `id`: `BIGINT` PK.
   - `staff_id`: `BIGINT` FK -> `staff_directory(id)`.
   - `district_id`: `SMALLINT` FK -> `districts(id)`.
   - `working_place`: `TEXT` (District name).
   - `fo_name`: `TEXT` (Officer name).
   - `date_of_reporting`: `DATE`.
   - `morning_km`: `INTEGER` (Start odometer reading).
   - `evening_km`: `INTEGER` (End odometer reading).
   - `total_km`: `INTEGER` (Daily travel distance).
   - `remark`: `TEXT`.
   - Child table `report_visited_names`: stores doctor/clinic visits per report.

3. **`districts`**:
   - `id`: `SMALLINT` PK.
   - `name`: `TEXT` (Canonical district name).
   - `canonical_aliases`: `TEXT[]`.

4. **`admin_users` & RBAC Architecture**:
   - `admin_users`: `id BIGINT PK`, `user_id TEXT`, `username TEXT`, `name TEXT`, `role admin_role_t` (`'SUPER_ADMIN'`, `'SUB_ADMIN'`, `'MAIN_INCHARGE'`), `status TEXT`, `has_all_districts BOOLEAN`.
   - `admin_district_access`: `(admin_id BIGINT, district_id SMALLINT)`.
   - `admin_permissions`: `(admin_id BIGINT, can_export_reports BOOLEAN, can_edit_patient_ids BOOLEAN, can_edit_targets BOOLEAN, can_manage_staff BOOLEAN)`.

---

## 2. Relational Schema Design for Travel Allowance

We replace the old Firestore collection `travel_allowance_logs` with a normalized PostgreSQL relational model:

### Table 1: `travel_allowance_settings`
Singleton table holding dynamic rates:
```sql
CREATE TABLE IF NOT EXISTS travel_allowance_settings (
    id TEXT PRIMARY KEY DEFAULT 'global',
    rate_per_km NUMERIC(6, 2) NOT NULL DEFAULT 4.00 CHECK (rate_per_km >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT
);
```

### Table 2: `travel_allowance_rosters`
Master monthly travel record per field officer:
- **Primary Key**: `id BIGSERIAL`.
- **Natural Unique Key**: `UNIQUE(staff_id, month)` — guarantees exactly one roster record per officer per month.
- **Foreign Keys**:
  - `staff_id REFERENCES staff_directory(id) ON DELETE CASCADE`.
  - `district_id REFERENCES districts(id)`.
- **Status Enum/Check**:
  - `status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REVERTED')`.
- **Locking**:
  - `is_locked BOOLEAN NOT NULL DEFAULT false` (automatically true when status becomes `APPROVED`).
- **Dispute Lifecycle**:
  - `dispute_status IN ('NONE', 'PENDING', 'RESOLVED', 'REJECTED')`.
  - Timestamps: `approved_at`, `disputed_at`, `dispute_resolved_at`.
- **Audit Columns**: `submitted_by`, `submitted_at`, `approved_by`, `approved_at`, `reverted_by`, `reverted_at`, `revert_reason`, `unlocked_by`, `unlocked_at`.

### Table 3: `travel_allowance_daily_logs`
Child table storing individual daily bike logs:
- **Foreign Key**: `roster_id REFERENCES travel_allowance_rosters(id) ON DELETE CASCADE`.
- **Columns**: `day SMALLINT CHECK (day >= 1 AND day <= 31)`, `date DATE`, `morning_km NUMERIC(8,2)`, `evening_km NUMERIC(8,2)`, `total_km NUMERIC(8,2)`, `visited_names TEXT`, `purpose TEXT`, `is_manual_override BOOLEAN`, `admin_remarks TEXT`.
- **Unique Constraint**: `UNIQUE(roster_id, day)`.

### Table 4: `travel_allowance_permissions` (Prefill Gate)
Dedicated table for fine-grained prefill access:
```sql
CREATE TABLE IF NOT EXISTS travel_allowance_permissions (
    admin_id BIGINT PRIMARY KEY REFERENCES admin_users(id) ON DELETE CASCADE,
    can_prefill BOOLEAN NOT NULL DEFAULT false,
    granted_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### Justification for Dedicated Table vs Modifying `admin_permissions`:
1. **Zero Blast Radius on Core Auth**: Core authentication (`fetch_admin_user`) executes a 4-table join on `admin_users`, `admin_district_access`, and `admin_permissions` on every API call. Adding a column to `admin_permissions` would alter core auth queries and risks breaking login if schema sync is delayed.
2. **Subsystem Isolation**: `travel_allowance_permissions` cleanly separates Travel Allowance configuration from general MIS access control.
3. **Safety Defaults**:
   - `SUPER_ADMIN` has implicit prefill authority (bypass).
   - `MAIN_INCHARGE` is read-only (never allowed to prefill/edit).
   - `SUB_ADMIN` / `ADMIN`: prefill access is evaluated by querying `travel_allowance_permissions WHERE admin_id = ... AND can_prefill = true`. If no row exists, defaults strictly to `false`.

---

## 3. Super-Admin Permission Gate Endpoints

1. `GET /admin/ta/prefill-access-list`:
   - Role: `SUPER_ADMIN`.
   - Returns list of all active admins/sub-admins with their current `can_prefill` boolean status and `granted_by` metadata.
2. `POST /admin/ta/grant-prefill-access`:
   - Role: `SUPER_ADMIN`.
   - Payload: `{ "admin_id": 123 }` or `{ "username": "patna_coord" }`.
   - Upserts into `travel_allowance_permissions` with `can_prefill = true`.
3. `POST /admin/ta/revoke-prefill-access`:
   - Role: `SUPER_ADMIN`.
   - Payload: `{ "admin_id": 123 }` or `{ "username": "patna_coord" }`.
   - Sets `can_prefill = false`.
4. Enforcement in `POST /admin/ta/prefill`:
   - Checks caller role. If `SUPER_ADMIN` -> allow.
   - If `MAIN_INCHARGE` -> reject with 403.
   - If other admin -> query `travel_allowance_permissions`. If not granted -> raise `HTTPException(403, detail="Prefill access denied. Please contact Super Admin for prefill authorization.")`.

---

## 4. Production Safety Assurance
- **DDL has NOT been applied to production Supabase**.
- Migration file saved at `scripts/migrations/20261007_create_travel_allowance_tables.sql`.
- Pending explicit user approval gate.
