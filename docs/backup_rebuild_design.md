# Architecture Design: Postgres-Native Google Drive Backup & Recovery System

**Document Version:** 1.4 (Final Proposal — Incorporating Resolved Clarifications Addendum)  
**Status:** Under Review (Zero Code/Schema Changes)  
**Target Module:** `backend/routers/backup.py` & `backend/core/backup_storage.py`  
**Application:** DFY TB MIS (Live Production)  

---

## Executive Summary

The current `backend/routers/backup.py` is inoperative because the Firebase Admin SDK was decommissioned (`storage = None`). It also references 4 ghost tables that no longer exist and relies on defunct Firestore APIs (`.to_dict()`, `.stream()`, `db.batch()`).

This design specifies a **Postgres-native, provider-agnostic, Google Drive-backed backup and disaster recovery subsystem**. The system will:
1. Extract full relational snapshots directly from Supabase PostgreSQL across all 19 active base tables.
2. Compress and upload encrypted/gzipped archives to a dedicated Google Drive folder (`DFY-MIS-Backups`) via OAuth 2.0 (`drive.file` scope).
3. Provide safe, foreign-key-aware disaster restoration with `OVERRIDING SYSTEM VALUE` support for PostgreSQL `GENERATED ALWAYS AS IDENTITY` columns and non-destructive MERGE semantics.
4. Prevent parent/child relational split-brain corruption via a Two-Phase Dependent Restore process that conditions child-table restoration strictly on parent row acceptance.
5. Replace unreliable opportunistic in-request triggers and sleeping in-process daemons with an external GitHub Actions cron trigger that wakes Render from inactivity sleep and executes safely under a PostgreSQL advisory lock.

---

## 1. Storage Abstraction Layer

To ensure strict separation of concerns and allow zero-friction provider swaps (e.g. Google Drive $\to$ Supabase Storage $\to$ AWS S3), all storage operations will be isolated behind an abstract interface in `backend/core/backup_storage.py`.

```
                    ┌───────────────────────────────┐
                    │     backend/routers/backup.py │
                    └───────────────┬───────────────┘
                                    │ (Calls abstract interface only)
                                    ▼
                    ┌───────────────────────────────┐
                    │      BackupStorageProvider    │  (Abstract Base Class)
                    └───────┬───────────────┬───────┘
                            │               │
            ┌───────────────▼─┐   ┌─────────▼─────────────────┐
            │GoogleDriveProvider│   │ SupabaseStorageProvider   │
            │ (OAuth 2.0 Refresh│   │ (Future S3/REST API swap) │
            └─────────────────┘   └───────────────────────────┘
```

### 1.1 Storage Exception Contract (`BackupStorageError`)

To prevent provider-specific exceptions (e.g. `googleapiclient.errors.HttpError`, socket timeouts, SSL errors) from leaking into router handlers, all providers must wrap underlying failures into a unified exception:

```python
from typing import Optional

class BackupStorageError(Exception):
    """
    Standard exception raised by any BackupStorageProvider implementation.
    Enables uniform error handling and structured diagnostics in router endpoints.
    """
    def __init__(
        self,
        operation: str,                              # 'upload' | 'download' | 'list' | 'delete' | 'prune'
        provider: str,                               # 'gdrive' | 'supabase' | 's3'
        message: str,                                # Human-readable error explanation
        original_error: Optional[Exception] = None,  # Caught underlying library exception
        remote_id: Optional[str] = None              # Remote file ID / filename if applicable
    ):
        self.operation = operation
        self.provider = provider
        self.message = message
        self.original_error = original_error
        self.remote_id = remote_id
        super().__init__(
            f"[{provider.upper()} {operation.upper()} FAILED] {message} "
            f"(underlying: {type(original_error).__name__ if original_error else 'None'}: {original_error})"
        )
```

Router endpoints catch `BackupStorageError` exclusively, returning standardized HTTP 502 Bad Gateway responses with sanitized error details, while logging full stack traces and underlying exception objects to server logs.

### 1.2 Abstract Interface (`BackupStorageProvider`)

```python
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional

class BackupStorageProvider(ABC):
    @abstractmethod
    async def upload(self, file_bytes: bytes, filename: str, metadata: Optional[Dict[str, str]] = None) -> str:
        """
        Uploads archive bytes.
        Returns the remote file ID string.
        Raises BackupStorageError on failure.
        """
        pass

    @abstractmethod
    async def list_backups(self) -> List[Dict[str, Any]]:
        """
        Lists available backup archives.
        Returns list of dicts: [{ 'remote_id', 'filename', 'size_bytes', 'created_at', 'source' }]
        Raises BackupStorageError on failure.
        """
        pass

    @abstractmethod
    async def download(self, remote_id_or_filename: str) -> bytes:
        """
        Downloads archive as raw bytes.
        Raises BackupStorageError on failure.
        """
        pass

    @abstractmethod
    async def delete(self, remote_id_or_filename: str) -> bool:
        """
        Deletes a remote archive.
        Raises BackupStorageError on failure.
        """
        pass

    @abstractmethod
    async def prune_older_than(self, retention_days: int = 30) -> int:
        """
        Deletes archives older than retention_days.
        Returns count of deleted archives.
        Raises BackupStorageError on failure.
        """
        pass
```

### 1.3 `GoogleDriveProvider` Implementation

- **API Library:** `googleapiclient.discovery.build('drive', 'v3', credentials=creds)` with `google.oauth2.credentials.Credentials`.
- **Credential Instantiation:**
  Credentials will be dynamically initialized from environment variables without writing secret files to disk:
  ```python
  from google.oauth2.credentials import Credentials

  creds = Credentials(
      token=None,  # Auto-refreshed using refresh_token
      refresh_token=os.environ["GDRIVE_REFRESH_TOKEN"],
      token_uri="https://oauth2.googleapis.com/token",
      client_id=os.environ["GDRIVE_CLIENT_ID"],
      client_secret=os.environ["GDRIVE_CLIENT_SECRET"],
      scopes=["https://www.googleapis.com/auth/drive.file"]
  )
  ```
- **Standardized Environment Variables:**
  - `GDRIVE_CLIENT_ID`: OAuth 2.0 Web/Desktop Client ID
  - `GDRIVE_CLIENT_SECRET`: OAuth 2.0 Client Secret
  - `GDRIVE_REFRESH_TOKEN`: Long-lived OAuth 2.0 Refresh Token
  - `GDRIVE_FOLDER_ID`: Destination Folder ID (`DFY-MIS-Backups`)
  - `BACKUP_STORAGE_BACKEND`: Provider switch (defaults to `gdrive`)

- **Method Mappings & Provider Error Wrapping:**
  - `upload`: `drive_service.files().create(body={'name': filename, 'parents': [FOLDER_ID], 'description': json.dumps(metadata)}, media_body=MediaIoBaseUpload(...))`
  - `list_backups`: `drive_service.files().list(q=f"'{FOLDER_ID}' in parents and trashed = false", fields="files(id, name, size, createdTime, description)")`
  - `download`: `drive_service.files().get_media(fileId=remote_id)` via `MediaIoBaseDownload`
  - `delete`: `drive_service.files().delete(fileId=remote_id)`
  - `prune_older_than`: Iterates `list_backups()`, compares `createdTime` against cutoff, deletes expired files.
  - Every method executes inside a `try...except Exception as exc:` block that catches `googleapiclient.errors.Error`, `socket.timeout`, and `ssl.SSLError`, re-raising as `BackupStorageError(operation=..., provider="gdrive", message=..., original_error=exc)`.

---

## 2. Table Scope for Backup & Foreign Key Ordering

### 2.1 Current Public Schema Live Audit

Verification query against live Supabase PostgreSQL confirms **19 Base Tables** and **3 Views**:

| Table Name | Type | Current Row Count | Status & Scope Decision |
| :--- | :---: | :---: | :--- |
| `districts` | BASE | 22 | **INCLUDE** (Core registry, Tier 1 parent) |
| `admin_users` | BASE | 20 | **INCLUDE** (Core auth, Tier 1 parent) |
| `admin_permissions` | BASE | 20 | **INCLUDE** (RBAC permissions, Tier 2) |
| `admin_district_access` | BASE | 33 | **INCLUDE** (District assignment, Tier 2) |
| `staff_directory` | BASE | 173 | **INCLUDE** (Field officer registry, Tier 2) |
| `staff_targets` | BASE | 340 | **INCLUDE** (Staff monthly targets, Tier 3) |
| `district_targets` | BASE | 46 | **INCLUDE** (District targets, Tier 1) |
| `pacing_settings` | BASE | 3 | **INCLUDE** (Holidays/working days, Tier 1) |
| `daily_field_reports` | BASE | 4,054 | **INCLUDE** (Parent reports, Tier 3) |
| `report_kpi_entries` | BASE | 83,342 | **INCLUDE** (Child KPI records, Tier 4) |
| `report_fdc_details` | BASE | 2,611 | **INCLUDE** (Child medicine records, Tier 4) |
| `report_visited_names` | BASE | 5,411 | **INCLUDE** (Child visit records, Tier 4) |
| `daily_staff_leaves` | BASE | 4 | **INCLUDE** (Officer leaves, Tier 3) |
| `patient_id_edit_logs` | BASE | 1,666 | **INCLUDE** (Audit logs, Tier 3) |
| `admin_audit_logs` | BASE | 6,228 | **INCLUDE** (Audit logs, Tier 3) |
| `nikshay_verified_patients`| BASE | 11,342 | **INCLUDE** (Clinical ledger, Tier 3) |
| `nikshay_sync_runs` | BASE | 1 | **INCLUDE** (Reconciler logs, Tier 3) |
| `nikshay_sync_flagged_records`| BASE | 500 | **INCLUDE** (Reconciler anomalies, Tier 4) |
| `nikshay_sync_grace_records` | BASE | 300 | **INCLUDE** (Reconciler grace list, Tier 4) |
| `v_admin_users_safe` | VIEW | N/A | **EXCLUDE** (Derived virtual view) |
| `v_staff_monthly_kpi` | VIEW | N/A | **EXCLUDE** (Derived virtual view) |
| `v_staff_safe` | VIEW | N/A | **EXCLUDE** (Derived virtual view) |

### 2.2 Live Foreign Key Constraints Evidence

To eliminate inference and guarantee error-free restoration, a live query was executed against PostgreSQL `information_schema`:

```sql
SELECT
    tc.table_name AS source_table,
    kcu.column_name AS source_column,
    ccu.table_name AS target_table,
    ccu.column_name AS target_column,
    tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;
```

#### Raw Query Output (All 19 Foreign Key Constraints):
```
Total FK constraints found in public schema: 19
  1. admin_audit_logs.district_id             -> districts.id           (constraint: fk_aal_district)
  2. admin_district_access.admin_id           -> admin_users.id         (constraint: fk_ada_admin)
  3. admin_district_access.district_id        -> districts.id           (constraint: fk_ada_district)
  4. admin_permissions.admin_id               -> admin_users.id         (constraint: fk_ap_admin)
  5. daily_field_reports.district_id          -> districts.id           (constraint: fk_dfr_district)
  6. daily_field_reports.staff_id             -> staff_directory.id     (constraint: fk_dfr_staff)
  7. daily_staff_leaves.district_id           -> districts.id           (constraint: fk_sl_district)
  8. daily_staff_leaves.staff_id              -> staff_directory.id     (constraint: fk_sl_staff)
  9. nikshay_sync_flagged_records.sync_run_id -> nikshay_sync_runs.id   (constraint: fk_nsfr_run)
 10. nikshay_sync_grace_records.sync_run_id   -> nikshay_sync_runs.id   (constraint: fk_nsgr_run)
 11. nikshay_sync_runs.district_id            -> districts.id           (constraint: fk_nsr_district)
 12. nikshay_verified_patients.district_id    -> districts.id           (constraint: fk_np_district)
 13. patient_id_edit_logs.district_id         -> districts.id           (constraint: fk_piel_district)
 14. patient_id_edit_logs.staff_id            -> staff_directory.id     (constraint: fk_piel_staff)
 15. report_fdc_details.report_id            -> daily_field_reports.id (constraint: fk_rfd_report)
 16. report_kpi_entries.report_id            -> daily_field_reports.id (constraint: fk_rke_report)
 17. report_visited_names.report_id          -> daily_field_reports.id (constraint: fk_rvn_report)
 18. staff_directory.district_id              -> districts.id           (constraint: fk_staff_district)
 19. staff_targets.staff_id                   -> staff_directory.id     (constraint: fk_staff_targets_staff)
```

### 2.3 Verified 4-Tier Restoration Dependency Order

Cross-referencing the 19 live foreign key constraints confirms the exact 4-tier topological order for database restoration:

```
[Tier 1: Root Parents — 0 Foreign Keys]
  districts
  admin_users
  district_targets
  pacing_settings
       │
       ▼
[Tier 2: Intermediate Parents — Depend solely on Tier 1]
  staff_directory           (FK -> districts)
  admin_permissions         (FK -> admin_users)
  admin_district_access     (FK -> admin_users, districts)
       │
       ▼
[Tier 3: Transaction Parents — Depend on Tier 1 and Tier 2]
  daily_field_reports       (FK -> districts, staff_directory)
  daily_staff_leaves        (FK -> districts, staff_directory)
  staff_targets             (FK -> staff_directory)
  patient_id_edit_logs      (FK -> districts, staff_directory)
  admin_audit_logs          (FK -> districts)
  nikshay_verified_patients (FK -> districts)
  nikshay_sync_runs         (FK -> districts)
       │
       ▼
[Tier 4: Transaction Children — Depend on Tier 3]
  report_kpi_entries        (FK -> daily_field_reports)
  report_fdc_details        (FK -> daily_field_reports)
  report_visited_names      (FK -> daily_field_reports)
  nikshay_sync_flagged_records (FK -> nikshay_sync_runs)
  nikshay_sync_grace_records   (FK -> nikshay_sync_runs)
```

**Restoration Order Rule:**  
Restoration must insert data strictly in forward order: **Tier 1 $\to$ Tier 2 $\to$ Tier 3 $\to$ Tier 4**.  
If a restore operation needs to wipe existing records, it must delete strictly in reverse order: **Tier 4 $\to$ Tier 3 $\to$ Tier 2 $\to$ Tier 1**.

### 2.4 Ghost Tables Dropped from Old Backup Scope

The following 4 collections in old `BACKUP_COLLECTIONS` do not exist in PostgreSQL and are **permanently dropped**:
- `daily_district_rollups` (Ghost — superseded by dynamic SQL rollups)
- `broadcast_alerts` (Ghost — superseded by `broadcast_notifications` / in-app alerts)
- `id_edit_logs` (Ghost — correctly named `patient_id_edit_logs`)
- `admin_config` (Ghost — dead Firestore document)

#### Live Confirmation: Status of `nikshay_sync_meta`
A dedicated query was executed to check for the existence of `nikshay_sync_meta`:
```sql
SELECT table_schema, table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE '%nikshay%';
```
**Raw Query Result:**
```
Tables matching '%nikshay%': 4
  - nikshay_sync_flagged_records (BASE TABLE)
  - nikshay_sync_grace_records (BASE TABLE)
  - nikshay_sync_runs (BASE TABLE)
  - nikshay_verified_patients (BASE TABLE)
Exact match for 'nikshay_sync_meta': 0 rows found.
```
**Decision:** `nikshay_sync_meta` **does NOT exist in PostgreSQL**. It is ghost-table adjacent (similar to `broadcast_alerts` and `daily_district_rollups`) and is explicitly **excluded** from backup and restore scopes.

### 2.5 Critical Real Tables Added to Backup Scope

The following **13 essential PostgreSQL tables** that were previously missing from backups will be **included**:
- `report_kpi_entries` (83k records: all patient IDs across 17 indicators)
- `report_fdc_details` (Patient regimens and medicine strip tracking)
- `report_visited_names` (Patient names)
- `patient_id_edit_logs` (Audit trails for ID corrections)
- `districts` (Master district table)
- `district_targets` (Monthly target allocations)
- `pacing_settings` (Declared holidays)
- `daily_staff_leaves` (Officer leave records)
- `admin_district_access` & `admin_permissions` (Sub-admin security boundaries)
- `nikshay_sync_runs`, `nikshay_sync_flagged_records`, `nikshay_sync_grace_records` (Nikshay reconciliation logs)

### 2.6 Why Views are Excluded
`v_admin_users_safe`, `v_staff_monthly_kpi`, and `v_staff_safe` are PostgreSQL views defined by `CREATE VIEW ... AS SELECT ...`.
- Views do not store underlying data.
- Backing them up duplicates rows already captured in `admin_users`, `staff_directory`, and `daily_field_reports`.
- Attempting to restore into a view fails with PostgreSQL error `cannot insert into view`.
- **Decision:** Excluded from extraction and restore.

---

## 3. Snapshot Format & Serialization Safety

### 3.1 Extraction Pipeline
To prevent memory spikes on Render (512MB RAM limit), extraction will query and serialize table-by-table using chunked cursor iteration rather than holding the entire database in memory at once:

```python
snapshot = {
    "metadata": {
        "version": "2.0",
        "engine": "postgresql",
        "created_at_utc": "2026-10-06T02:00:00Z",
        "created_at_ist": "2026-10-06 07:30:00 AM",
        "source": "dfy-mis-production",
        "total_records": 115987,
        "table_counts": { ... }
    },
    "tables": {
        # Table datasets: { "districts": [...], "daily_field_reports": [...], ... }
    }
}
```

### 3.2 Lossless Type Serialization Strategy

PostgreSQL returns rich Python objects (`datetime.datetime`, `datetime.date`, `decimal.Decimal`, `dict/list` for JSONB, `int`, `bool`, `None`).

| PostgreSQL Type | Python Object | Serialized JSON Format | Restoration Deserialization Strategy |
| :--- | :--- | :--- | :--- |
| `timestamptz` | `datetime.datetime` | ISO 8601 String (`2026-10-05T12:00:00+05:30`) | Pass directly to parameterized `%s`; PostgreSQL parses ISO 8601 strings losslessly into `timestamptz`. |
| `date` | `datetime.date` | ISO String (`YYYY-MM-DD`) | Pass directly to parameterized `%s::date`. |
| `numeric` / `decimal`| `decimal.Decimal`| **JSON String** (`"12.30"`, `"1500.00"`) | **CRITICAL: Ban float conversion.** Reconstructed via `Decimal(str_val)` or passed directly as string to `%s::numeric`. Lossless text-to-decimal parsing. |
| `jsonb` | `dict` / `list` | Serialized JSON string / object | `json.dumps(val)` $\to$ `%s::jsonb`. |
| `inet` | `str` (or ipaddress) | String (`192.168.1.1`) | Pass directly to parameterized `%s::inet`. |
| `bigint` / `smallint`| `int` | JSON Number | Pass directly to parameterized `%s`. |
| `boolean` | `bool` | JSON Boolean | Pass directly to parameterized `%s`. |

**Custom Serializer Function:**
```python
import base64
from datetime import datetime, date as dt_date
from decimal import Decimal

def postgres_json_serializer(obj):
    if isinstance(obj, (datetime, dt_date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        # Must serialize as string to prevent IEEE 754 precision loss
        return str(obj)
    if isinstance(obj, (bytes, bytearray)):
        return base64.b64encode(obj).decode("ascii")
    if hasattr(obj, "__str__"):
        return str(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")
```

### 3.3 Decimal Serialization Risk & Prevention
- **The Risk:** Converting `Decimal("199.95")` to Python `float` causes IEEE 754 floating-point inaccuracies (`199.94999999999998863...`). In travel allowances, medicine strip counts, or financial records, precision loss leads to subtle data corruption across repeated backup/restore cycles.
- **The Prevention:** Decimal values are serialized strictly to strings (`str(obj)`). On restoration, strings are inserted into `%s::numeric`, where PostgreSQL's native parser reconstructs the exact arbitrary-precision numeric representation without IEEE 754 artifacts.

### 3.4 Archive Sizing & Memory Benchmark
- 115,000 raw rows in JSON $\approx$ 16MB uncompressed.
- GZip compression at level 6 reduces size by ~75–80% $\to$ **3.2MB – 4.0MB compressed**.
- The entire compressed payload fits comfortably in a single in-memory buffer (`io.BytesIO`) without writing temporary files to disk.

---

## 4. Disaster Recovery & Restore Design

### 4.1 The `GENERATED ALWAYS AS IDENTITY` Problem & Solution

Our audit proved that **17 of the 19 base tables** utilize PostgreSQL `GENERATED ALWAYS AS IDENTITY` on column `id`:
```sql
daily_field_reports.id (Identity: YES, Gen: ALWAYS)
report_kpi_entries.id  (Identity: YES, Gen: ALWAYS)
report_fdc_details.id  (Identity: YES, Gen: ALWAYS)
...
```

**The Danger:**
If restore attempts a standard `INSERT INTO daily_field_reports (id, ...) VALUES (101, ...)` or a standard `ON CONFLICT (id) DO UPDATE`, PostgreSQL raises:
> `ERROR 428C9: cannot insert a non-DEFAULT value into column "id"`  
> `DETAIL: Column "id" is an identity column defined as GENERATED ALWAYS.`

Furthermore, if restore were to omit `id` and allow PostgreSQL to generate new auto-increment IDs:
1. `daily_field_reports.id` would change from `101` to e.g. `8500`.
2. All 83,000 rows in `report_kpi_entries`, 2,600 rows in `report_fdc_details`, and 5,400 rows in `report_visited_names` that reference `report_id = 101` would either fail foreign key validation or become permanently orphaned.

**The Approved Solution:**
1. **Use `OVERRIDING SYSTEM VALUE` Clause:**
   PostgreSQL provides the explicit SQL standard clause `OVERRIDING SYSTEM VALUE` for backup/restore utilities:
   ```sql
   INSERT INTO daily_field_reports (id, staff_id, district_id, ...)
   OVERRIDING SYSTEM VALUE
   VALUES (%s, %s, %s, ...)
   ON CONFLICT (id) DO UPDATE SET ...;
   ```
   This instructs PostgreSQL to accept the explicit `id` from the backup archive without error.

2. **Synchronize Sequence Counters Post-Restore:**
   After records are restored, the identity sequence must be explicitly advanced to the maximum restored ID so subsequent daily operations never produce collision errors:
   ```sql
   SELECT setval(
       pg_get_serial_sequence('daily_field_reports', 'id'),
       COALESCE((SELECT MAX(id) FROM daily_field_reports), 1)
   );
   ```
   This will be executed automatically for all 17 identity tables at the end of the restore transaction.

### 4.2 Restore Semantics & Two-Phase Dependent Restore Architecture

#### Merge Semantics (Non-Destructive to New Rows)
The restore process operates under **MERGE semantics**:
- Rows created in live production *after* the backup snapshot was taken that are **not present in the backup archive are KEPT intact**. They are **never deleted**.
- Missing rows from the archive that do not currently exist in production are inserted cleanly.

#### Live Schema Timestamp Audit
To determine which tables support temporal comparison during conflict resolution, a live audit of `information_schema.columns` was executed across all 19 backup-scope tables:

```
Tables WITH verified usable timestamp/audit columns (14 of 19):
  1. daily_field_reports:       last_edited_at (timestamptz), created_at (timestamptz)
  2. admin_users:               updated_at (timestamptz), created_at (timestamptz)
  3. staff_directory:           updated_at (timestamptz), created_at (timestamptz)
  4. daily_staff_leaves:        updated_at (timestamptz), created_at (timestamptz)
  5. staff_targets:             updated_at (timestamptz)
  6. district_targets:          updated_at (timestamptz)
  7. pacing_settings:           updated_at (timestamptz)
  8. admin_permissions:         updated_at (timestamptz)
  9. admin_district_access:     granted_at (timestamptz)
 10. admin_audit_logs:          occurred_at (timestamptz)
 11. patient_id_edit_logs:      occurred_at (timestamptz)
 12. nikshay_verified_patients: last_reconciled_at (timestamptz), first_verified_at (timestamptz)
 13. nikshay_sync_runs:         synced_at (timestamptz)
 14. districts:                 created_at (timestamptz)

Tables WITHOUT any timestamp/audit columns (5 of 19):
  1. report_kpi_entries        (FK -> daily_field_reports.id)
  2. report_fdc_details        (FK -> daily_field_reports.id)
  3. report_visited_names      (FK -> daily_field_reports.id)
  4. nikshay_sync_flagged_records (FK -> nikshay_sync_runs.id)
  5. nikshay_sync_grace_records   (FK -> nikshay_sync_runs.id)
```

#### The Relational Split-Brain Problem
If child-table restore decisions were evaluated independently of their parents, a critical data integrity bug occurs:
1. An officer modified a report yesterday in production, updating patient IDs.
2. An admin triggers a restore of a 3-day-old backup snapshot under `timestamp_guard`.
3. The parent `daily_field_reports` row is correctly **SKIPPED** because live production has a newer `last_edited_at`.
4. If the 5 child tables (which lack their own timestamp column) were blindly force-overwritten, their child rows (`report_kpi_entries`, `report_fdc_details`, `report_visited_names`) would revert to the 3-day-old backup snapshot.
5. **The Corruption:** Production ends up with parent summary counts reflecting yesterday's live numbers, but child KPI and medicine tables containing stale IDs from 3 days ago. This silent relational mismatch corrupts reports.

#### The Approved Solution: Two-Phase Dependent Restore

To enforce strict relational integrity, child-table restoration decisions are **derived strictly from their parent's guard outcome**:

```
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: RESTORE TIERS 1–3 (ROOT, INTERMEDIATE & TRANSACTION PARENTS) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
       Record exactly which Parent Records were WRITTEN vs SKIPPED:
       - written_report_ids   (daily_field_reports inserted or updated)
       - skipped_report_ids   (daily_field_reports skipped due to newer live DB)
       - written_sync_run_ids (nikshay_sync_runs inserted or updated)
       - skipped_sync_run_ids (nikshay_sync_runs skipped due to newer live DB)
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: RESTORE TIER 4 (TRANSACTION CHILDREN WITH DERIVED FILTER)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
       ┌────────────────────────────┴─────────────────────────────┐
       ▼                                                          ▼
[report_id IN written_report_ids]              [report_id IN skipped_report_ids]
CHILD ROWS RESTORED / SYNCHRONIZED             CHILD ROWS SKIPPED COMPLETELY
(Matches updated parent snapshot)             (Preserves newer production data intact)
```

#### Detailed Phase Execution Under `conflict_strategy="timestamp_guard"`:

1. **Phase 1 (Parent Restoration & Outcome Tracking):**
   - Restores Tiers 1, 2, and 3.
   - For `daily_field_reports`, each archive record is evaluated using PostgreSQL `ON CONFLICT (id)`:
     ```sql
     INSERT INTO daily_field_reports (
         id, staff_id, district_id, fo_name, date_of_reporting,
         working_place, created_at, last_edited_at, ...
     )
     OVERRIDING SYSTEM VALUE
     VALUES (%s, %s, %s, %s, %s, %s, %s, %s, ...)
     ON CONFLICT (id) DO UPDATE SET
         staff_id = EXCLUDED.staff_id,
         district_id = EXCLUDED.district_id,
         fo_name = EXCLUDED.fo_name,
         date_of_reporting = EXCLUDED.date_of_reporting,
         working_place = EXCLUDED.working_place,
         last_edited_at = EXCLUDED.last_edited_at,
         last_edited_by = EXCLUDED.last_edited_by
     WHERE COALESCE(EXCLUDED.last_edited_at, EXCLUDED.created_at) >=
           COALESCE(daily_field_reports.last_edited_at, daily_field_reports.created_at)
     RETURNING id;
     ```
   - The query returns the `id` of rows actually inserted or updated.
   - Any report ID present in the archive that is NOT returned in the write result is added to `skipped_report_ids`.
   - The exact same tracking executes for `nikshay_sync_runs` to record `written_sync_run_ids` and `skipped_sync_run_ids`.

2. **Phase 2 (Child Restoration Filtered by Parent Acceptance):**
   - For `report_kpi_entries`, `report_fdc_details`, and `report_visited_names`:
     - Filter archive child records:
       ```python
       valid_child_records = [
           row for row in archive_child_rows
           if row["report_id"] in written_report_ids
       ]
       ```
     - For any `report_id` in `skipped_report_ids`, all child rows in the archive are **bypassed completely**.
     - For `report_id` in `written_report_ids`, the child rows are inserted/updated with `OVERRIDING SYSTEM VALUE` cleanly.
   - For `nikshay_sync_flagged_records` and `nikshay_sync_grace_records`:
     - Filter archive rows to only those where `sync_run_id in written_sync_run_ids`.
     - Skip child records tied to `skipped_sync_run_ids`.

3. **Policy B: Force Overwrite (`conflict_strategy="force_overwrite"`):**
   - Blindly overwrites all matching rows across all 19 tables with backup data without filtering or timestamp guards.
   - Intended exclusively for disaster rollbacks where live production was corrupted and the administrator explicitly requests restoring the exact snapshot state across all tiers.

The restore endpoint will accept `conflict_strategy: "timestamp_guard" | "force_overwrite"` (defaulting to `"timestamp_guard"`). The mandatory Dry-Run mode will explicitly itemize how many parent records (and dependent child records) are newer in production and would be skipped under Policy A vs overwritten under Policy B.

### 4.3 Dry-Run / Preview Mode (`POST /admin/backup/restore?dry_run=true`)

Restoration is a high-risk operation. To eliminate accidental data loss, the restore endpoint will support a mandatory **Dry-Run Mode**:
- Downloads and decompresses the backup archive.
- Parses the snapshot and counts records per table.
- Compares archive records against current live database state.
- Computes stale-collision statistics (records newer in live DB vs archive) across both parents and dependent children.
- **Makes ZERO database writes.**
- Returns a comprehensive inspection payload:
  ```json
  {
    "dry_run": true,
    "archive_filename": "backup_2026-10-06.json.gz",
    "created_at_ist": "2026-10-06 07:30:00 AM",
    "summary": {
      "total_tables": 19,
      "archive_record_count": 115987,
      "live_db_record_count": 116045
    },
    "table_diff": {
      "daily_field_reports": { "in_archive": 4054, "in_live_db": 4056, "delta": -2, "conflicts_newer_in_db": 12 },
      "report_kpi_entries": { "in_archive": 83342, "in_live_db": 83390, "delta": -48, "skipped_due_to_parent_guard": 184 }
    },
    "ready_for_execution": true
  }
  ```

### 4.4 Restore Confirmation Secret (`RESTORE_CONFIRMATION_CODE`)

To execute actual restoration:
1. The request must be authenticated as `SUPER_ADMIN`.
2. The request body must supply a confirmation secret:
   ```json
   {
     "confirmation_code": "<secret_from_env>",
     "conflict_strategy": "timestamp_guard"
   }
   ```
3. The server compares `confirmation_code` against `os.environ.get("RESTORE_CONFIRMATION_CODE")` using constant-time string comparison (`hmac.compare_digest`).
4. **Safety Default:** If `RESTORE_CONFIRMATION_CODE` is unset or empty in the server environment, all restore attempts are rejected immediately with HTTP 403 Forbidden (`"Restore subsystem locked: RESTORE_CONFIRMATION_CODE environment secret not configured"`).
5. The restore operation executes within a single PostgreSQL transaction (`with conn: ...`); if any table, constraint, or foreign key fails, the entire restore is rolled back automatically.

---

## 5. Scheduling & Trigger Mechanism

### 5.1 Elimination of In-Process Daemon (Option A Ruled Out)
The previous proposal considered an in-process asyncio background task sleeping until 02:00 AM IST.  
**Why Option A is categorically disqualified:**
- The Render production service runs on a standard web service tier and spins down after 15 minutes of inactivity.
- The web service runs a single worker process (`uvicorn main:app`).
- If no user traffic hits the server between 11:00 PM and 02:00 AM IST, the container is asleep; the in-process asyncio event loop does not execute or wake up. The backup would simply never trigger.

### 5.2 Elimination of Opportunistic Request Piggybacking
Currently, `ensure_daily_backup_scheduled()` is called:
- On every single `submit_daily_report` POST in `reports.py` (line 568).
- On every `get_today_attendance` GET in `attendance.py` (line 504).
- On application startup in `main.py` (line 275).

**Why opportunistic piggybacking must be removed:**
1. Adds latency to critical reporting requests.
2. Contends for Render's 512MB RAM and 0.1 vCPU during peak morning reporting hours (09:00 AM – 11:00 AM IST).
3. **Action:** All opportunistic calls in `reports.py` and `attendance.py` will be completely removed.

### 5.3 Recommended Architecture: External GitHub Actions Cron (Option C)

The daily backup will be triggered by a scheduled GitHub Actions workflow in `.github/workflows/daily_backup_cron.yml`:

```yaml
name: Daily Database Backup Trigger
on:
  schedule:
    # 20:30 UTC = 02:00 AM IST (off-peak hours when reporting is idle)
    - cron: '30 20 * * *'
  workflow_dispatch: # Allows manual trigger from GitHub Actions UI

jobs:
  trigger_backup:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Authenticated Backup Endpoint & Wake Render
        run: |
          curl -s -S -X POST "https://dfy-mis-app.onrender.com/admin/backup/trigger-cron" \
            -H "X-Backup-Cron-Secret: ${{ secrets.BACKUP_CRON_SECRET }}" \
            -H "Content-Type: application/json" \
            --retry 3 --retry-delay 15 --max-time 180
```

#### Key Advantages & Explicit Architectural Guarantees:
1. **Solves the Spin-Down Problem:** The incoming HTTP request automatically wakes up Render from sleep. The curl `--retry 3 --retry-delay 15 --max-time 180` accommodates the 30–50 second container spin-up window.
2. **Zero Incurred Infrastructure Cost:** GitHub Actions provides 2,000 free runner minutes per month; a 30-second curl call uses < 15 minutes/month.
3. **Explicit Scope & Authorization Boundaries (Deliberate Design Decisions):**
   - **(a) Secret-Header Authentication Bypasses JWT:** `POST /admin/backup/trigger-cron` is authenticated **exclusively** via the `X-Backup-Cron-Secret` header, deliberately bypassing the standard `SUPER_ADMIN` JWT dependency because GitHub Actions cannot hold an interactive user session.
   - **(b) Capability Strictly Limited to Backup Creation:** The endpoint has **ZERO** ability to initiate a restore, delete tables, prune outside policy, or mutate existing database state under any payload or parameter. It executes strictly `execute_full_backup()`.
   - **(c) Module-Wide Auth Isolation:** No other endpoint in `backend/routers/backup.py` uses this shared-secret auth pattern. Disaster recovery (`POST /admin/backup/restore`) remains strictly guarded by `SUPER_ADMIN` JWT + `RESTORE_CONFIRMATION_CODE`.

### 5.4 Database-Level Concurrency & Anti-Overlap Guard (`pg_try_advisory_lock`)

Even with a single worker process, to guarantee idempotency and safeguard against overlapping runs (e.g. concurrent automated cron + manual admin trigger, or future multi-worker scaling), the backup endpoint acquires a PostgreSQL advisory lock:

```python
BACKUP_ADVISORY_LOCK_ID = 749281

@router.post("/admin/backup/trigger-cron")
async def trigger_cron_backup(request: Request):
    # Verify shared secret
    token = request.headers.get("X-Backup-Cron-Secret", "")
    expected = os.environ.get("BACKUP_CRON_SECRET", "")
    if not expected or not hmac.compare_digest(token, expected):
        raise HTTPException(status_code=403, detail="Invalid backup cron secret")

    # Acquire non-blocking PostgreSQL advisory lock
    locked = pg_execute_raw(
        "SELECT pg_try_advisory_lock(%s) AS acquired;",
        [BACKUP_ADVISORY_LOCK_ID],
        fetch=True
    )
    if not locked or not locked[0]["acquired"]:
        raise HTTPException(status_code=409, detail="Backup execution already in progress")

    try:
        result = await execute_full_backup()
        return {"status": "SUCCESS", "details": result}
    finally:
        pg_execute_raw(
            "SELECT pg_advisory_unlock(%s);",
            [BACKUP_ADVISORY_LOCK_ID]
        )
```

**Why Advisory Locks:**
- Non-blocking: Returns immediately with HTTP 409 if another backup is running.
- Crash-safe: If the Render process crashes or OOMs mid-backup, PostgreSQL automatically releases all session advisory locks when the connection drops.
- Zero database table bloat: No extra lock rows or flags to maintain.

### 5.5 On-Demand Manual Trigger Retained
`POST /admin/backup/trigger-now` is retained for authenticated `SUPER_ADMIN` users to execute instantaneous backups prior to major data operations. It utilizes the same underlying `execute_full_backup()` and advisory lock guard.

---

## 6. Storage-Health Endpoint Rebuild (`GET /admin/system/storage-health`)

The current endpoint calls `coll_ref.count()` against dead Firestore collections.

### 6.1 Proposed Postgres-Native Query
Replace with direct queries against PostgreSQL table sizes and row counts:

```python
@router.get("/admin/system/storage-health")
async def get_storage_health(admin: dict = Depends(get_current_admin)):
    rows = pg_execute_raw("""
        SELECT 
            relname as table_name,
            n_live_tup as estimated_rows,
            pg_total_relation_size(relid) as total_bytes
        FROM pg_stat_user_tables
        ORDER BY total_bytes DESC;
    """, fetch=True)
    ...
```

### 6.2 Response Contract
```json
{
  "status": "HEALTHY",
  "total_tables": 19,
  "total_records": 115987,
  "database_size_mb": 42.8,
  "supabase_free_tier_limit_mb": 500.0,
  "capacity_used_pct": 8.56,
  "last_backup": {
    "status": "SUCCESS",
    "timestamp_ist": "2026-10-06 02:01:14 AM",
    "archive_filename": "backup_2026-10-06.json.gz",
    "size_mb": 3.4
  },
  "tables": [
    { "table": "report_kpi_entries", "rows": 83342, "size_mb": 22.4 },
    { "table": "daily_field_reports", "rows": 4054, "size_mb": 11.2 }
  ],
  "timestamp": "2026-10-06 00:15:00"
}
```

---

## 7. Package Dependencies & `requirements.txt` Proposal

To support Google Drive API with OAuth 2.0 refresh token authorization, the following three libraries were tested and verified in our local environment:

```
google-auth==2.57.0
google-auth-oauthlib==1.5.0
google-api-python-client==2.201.0
```

*(Note: These will be added to `requirements.txt` only upon your approval during the implementation step.)*

---

## 8. Risk Flags & Architectural Safeguards

### 8.1 Render 512MB RAM Budget (Critical Production Rule)
- Dumping 83k rows of `report_kpi_entries` simultaneously can inflate memory if converted to large Python object trees.
- *Safeguard:* Use server-side cursor iteration (`FETCH 5000`), stream gzip output directly into an incremental buffer, and execute `gc.collect()` immediately post-upload. Guard with `asyncio.Semaphore(1)` and `pg_try_advisory_lock` so concurrent backups are impossible.

### 8.2 Google Drive API Rate Limits & Official Documentation Sourcing
- **Official Documentation Citation:**
  - Official Google Workspace Drive API Guides: [https://developers.google.com/drive/api/guides/limits](https://developers.google.com/drive/api/guides/limits)
- **Verified Quota Standards:**
  - In Google Cloud Console (`APIs & Services > Quotas`), default Drive API v3 quotas are measured per **100-second window**:
    - **10,000 to 12,000 queries per 100 seconds per project**
    - **1,000 to 1,200 queries per 100 seconds per user** (~10–12 requests/second sustained)
  - In updated Google Workspace guidelines, Drive API quotas are also designated in Quota Units:
    - **1,000,000 quota units per minute per project**
    - **325,000 quota units per minute per user per project**
  - Storage quota for standard Google account: **15 GB** shared across Google Drive, Gmail, and Photos.
- **Automated Daily Backup Footprint:**
  - 1 `files().create()` (upload snapshot)
  - 1 `files().list()` (fetch existing archives)
  - 1–2 `files().delete()` (prune archives older than 30 days)
  - Total automated requests: **~3–4 API calls per 24-hour day**.
  - Rate limit consumption: **< 0.0003%** of even a single 100-second window.
  - Storage consumption: 3.5MB/day × 30 days = **~105 MB** (< 0.7% of the 15 GB account storage).
- **Conclusion:** Hitting Google Drive API rate limits or quota caps during automated daily operations is statistically impossible under normal operations.

### 8.3 Error Handling Mid-Backup & Partial Upload Cleanup
- **Retry Strategy:**
  - In `upload()` and `download()`, implement 3 automatic retries with exponential backoff and jitter (initial delay 2s, doubling: 2s, 4s, 8s) on transient network or HTTP 5xx errors.
- **Partial Upload Cleanup:**
  - If an upload fails midway or disconnects after creating a remote file ID, execute `provider.delete(remote_id)` in the exception handler to ensure incomplete or corrupt archives never linger in the Google Drive folder.
- **Alerting & Failure Surfacing Reality:**
  - **Explicit Confirmation:** The DFY MIS production app currently has **NO live external alerting channels** (no Slack webhook, Discord bot, PagerDuty, or transactional email integration exists today).
  - **Surfacing Safeguards:**
    1. Log error with full traceback via `logger.exception("Daily backup execution failed")`.
    2. Persist an administrative failure record into PostgreSQL table `admin_audit_logs` (`action_type = 'DATABASE_BACKUP_FAILED'`, `details = json.dumps({"error": str(err), "operation": "upload", "timestamp": get_ist_now().isoformat()})`).
    3. Expose the latest backup failure in `GET /admin/system/storage-health` so the admin dashboard UI displays a visible warning alert on subsequent admin logins.

### 8.4 Decimal & Numeric Precision Preservation
- Serializing `Decimal` to Python `float` introduces IEEE 754 precision loss.
- *Safeguard:* Strict string serialization (`str(obj)`) in `postgres_json_serializer` and direct `%s::numeric` restoration casting guarantees lossless round-trip precision.

### 8.5 Network Timeout Guard on Large Gzip Uploads
- On slow mobile or congested server uplinks, uploading 4MB could exceed standard 10-second client timeouts.
- *Safeguard:* Background thread upload (`asyncio.to_thread`) with an explicit 60-second HTTP socket timeout.

### 8.6 Decoupling from User Request Lifecycles
- Opportunistic calls to `ensure_daily_backup_scheduled()` in `reports.py:568` and `attendance.py:504` will be deleted, decoupling user-facing HTTP requests from background maintenance operations.

### 8.7 Parent/Child Restore Consistency Guard (Previously-Identified Design Risk Fixed)
- In an independent row-level restore, timestamp-less child tables (`report_kpi_entries`, `report_fdc_details`, `report_visited_names`, `nikshay_sync_flagged_records`, `nikshay_sync_grace_records`) could be force-overwritten while their parent reports were skipped under `timestamp_guard`, creating silent parent/child summary-to-detail mismatches. The Two-Phase Dependent Restore Architecture (Section 4.2) eliminates this risk by conditioning all Tier 4 child writes strictly on whether their parent `report_id` or `sync_run_id` passed its Phase 1 timestamp guard.

---

## 9. Pre-Implementation Setup Checklist

Before the backup subsystem can be implemented and tested end-to-end, the following environment variables and secrets must be configured. This checklist is for the administrator to provision; the development agent will not create or set these secrets:

| Variable / Secret Name | Purpose | Target Environment | Current Status | Action Required by User |
| :--- | :--- | :--- | :---: | :--- |
| `GDRIVE_CLIENT_ID` | OAuth 2.0 Web/Desktop Client ID | Render Web Service | **LIVE** | None (Already verified in Render) |
| `GDRIVE_CLIENT_SECRET` | OAuth 2.0 Client Secret | Render Web Service | **LIVE** | None (Already verified in Render) |
| `GDRIVE_REFRESH_TOKEN` | Long-lived OAuth Refresh Token | Render Web Service | **LIVE** | None (Already generated & stored in Render) |
| `GDRIVE_FOLDER_ID` | Google Drive folder `DFY-MIS-Backups` | Render Web Service | **LIVE** | None (Already provisioned in Render) |
| `BACKUP_CRON_SECRET` | Shared secret header for cron endpoint | **GitHub Actions Secrets** AND **Render Web Service** | **PENDING** | **Action:** Generate random 32-char token; add as `BACKUP_CRON_SECRET` in GitHub Repo Secrets AND in Render Environment Variables. |
| `RESTORE_CONFIRMATION_CODE` | Two-man rule secret for disaster restore | **Render Web Service** only | **PENDING** | **Action:** Set high-entropy confirmation code in Render Environment Variables. |

---

## Approval Checkpoint

This completes the revised design document. **No production files or schemas have been altered.**  
Awaiting your review and approval of the design specification before taking any implementation steps.

---

## Addendum v1.4 — Resolved Clarifications

### Resolution 1 — Child Table (Tier 4) Sync Strategy During Restore
All 5 Tier 4 child tables (`report_kpi_entries`, `report_fdc_details`, `report_visited_names`, `nikshay_sync_flagged_records`, `nikshay_sync_grace_records`) use **UPSERT-only semantics** during restore — **never DELETE existing child rows**.
- **SQL Pattern:**
  ```sql
  INSERT INTO <child_table> (id, <parent_fk_col>, <child_columns...>)
  OVERRIDING SYSTEM VALUE
  VALUES (%s, %s, ...)
  ON CONFLICT (id) DO UPDATE SET
      <col_1> = EXCLUDED.<col_1>,
      <col_2> = EXCLUDED.<col_2>,
      ...;
  ```
- **Derivation & Merge Semantics:** This behavior is consistent with and derived directly from the document's established Merge Semantics principle (Section 4.2: *"Rows created in live production after the backup snapshot was taken that are not present in the backup archive are KEPT intact. They are never deleted"*).
- **Gating Mechanism:** Eligibility to execute this UPSERT is strictly gated by Phase 1 parent acceptance:
  - Child rows referencing `report_id IN written_report_ids` or `sync_run_id IN written_sync_run_ids` are upserted.
  - Child rows referencing `report_id IN skipped_report_ids` or `sync_run_id IN skipped_sync_run_ids` are bypassed completely.
  This resolution clarifies *how* the write happens for eligible child rows, without altering *whether* they are eligible.

### Resolution 2 — Per-Table Conflict Behavior for the 12 Tier 1–3 Tables
Conflict handling for the 12 previously-unspecified tables in Tiers 1–3 is explicitly partitioned into two distinct operational groups:

#### Group A: Timestamp Guard Pattern (`conflict_strategy="timestamp_guard"`)
Applies to operational records that undergo updates and maintain an `updated_at` column:
- `admin_users`
- `staff_directory`
- `daily_staff_leaves`
- `staff_targets`
- `district_targets`
- `pacing_settings`
- `admin_permissions`

**SQL Pattern:**
```sql
INSERT INTO <table_name> (id, <columns...>)
[OVERRIDING SYSTEM VALUE] -- applied to identity tables
VALUES (%s, ...)
ON CONFLICT (id) DO UPDATE SET
    <col_1> = EXCLUDED.<col_1>,
    <col_2> = EXCLUDED.<col_2>,
    updated_at = EXCLUDED.updated_at
WHERE EXCLUDED.updated_at >= <table_name>.updated_at;
```
*Note on Text Primary Keys:* For `district_targets` and `pacing_settings`, their primary key column is `id` (type `text`, confirmed via live `information_schema.table_constraints` query). Because these 2 tables do not possess integer identity sequences, `OVERRIDING SYSTEM VALUE` is omitted, but the conflict target remains `ON CONFLICT (id)` matching their text primary key.

#### Group B: Insert-if-Missing / Append-Only Pattern (`ON CONFLICT (id) DO NOTHING`)
Applies to immutable audit logs, access grants, or near-static reference registries that should never be overwritten by potentially stale archive data once they exist in live production:
- `admin_audit_logs` (Append-only audit trail)
- `patient_id_edit_logs` (Append-only patient correction logs)
- `admin_district_access` (Administrative security boundaries)
- `nikshay_verified_patients` (Clinical verified patient ledger)
- `districts` (Canonical master district registry)

**SQL Pattern:**
```sql
INSERT INTO <table_name> (id, <columns...>)
[OVERRIDING SYSTEM VALUE] -- applied to identity tables
VALUES (%s, ...)
ON CONFLICT (id) DO NOTHING;
```

#### Full Summary Matrix for All 12 Tier 1–3 Tables:
| Table Name | Group | Conflict Target Column | Conflict Pattern |
| :--- | :---: | :---: | :--- |
| `admin_users` | Group A | `id` | `ON CONFLICT (id) DO UPDATE ... WHERE EXCLUDED.updated_at >= admin_users.updated_at` |
| `staff_directory` | Group A | `id` | `ON CONFLICT (id) DO UPDATE ... WHERE EXCLUDED.updated_at >= staff_directory.updated_at` |
| `daily_staff_leaves` | Group A | `id` | `ON CONFLICT (id) DO UPDATE ... WHERE EXCLUDED.updated_at >= daily_staff_leaves.updated_at` |
| `staff_targets` | Group A | `id` | `ON CONFLICT (id) DO UPDATE ... WHERE EXCLUDED.updated_at >= staff_targets.updated_at` |
| `district_targets` | Group A | `id` (text PK) | `ON CONFLICT (id) DO UPDATE ... WHERE EXCLUDED.updated_at >= district_targets.updated_at` |
| `pacing_settings` | Group A | `id` (text PK) | `ON CONFLICT (id) DO UPDATE ... WHERE EXCLUDED.updated_at >= pacing_settings.updated_at` |
| `admin_permissions` | Group A | `id` | `ON CONFLICT (id) DO UPDATE ... WHERE EXCLUDED.updated_at >= admin_permissions.updated_at` |
| `districts` | Group B | `id` | `ON CONFLICT (id) DO NOTHING` |
| `admin_district_access` | Group B | `id` | `ON CONFLICT (id) DO NOTHING` |
| `admin_audit_logs` | Group B | `id` | `ON CONFLICT (id) DO NOTHING` |
| `patient_id_edit_logs` | Group B | `id` | `ON CONFLICT (id) DO NOTHING` |
| `nikshay_verified_patients` | Group B | `id` | `ON CONFLICT (id) DO NOTHING` |

### Resolution 3 — Identity / Sequence Resync Scope Correction
Section 4.1 specifies advancing PostgreSQL identity sequences post-restore via `setval(pg_get_serial_sequence(table, 'id'), ...)`.
- **Exact Scope:** Exactly **17 of the 19 base tables** utilize PostgreSQL `GENERATED ALWAYS AS IDENTITY` on integer `id` columns (`smallint` or `bigint`).
- **Explicit Exclusion of 2 Tables:** The 2 tables excluded from sequence resynchronization are:
  1. `district_targets`: Primary key `id` is of type `text` (e.g. `'Patna_2026-10'`). Verified `is_identity = NO`.
  2. `pacing_settings`: Primary key `id` is of type `text` (e.g. `'declared_holidays'`). Verified `is_identity = NO`.
- For these 2 tables, `pg_get_serial_sequence(table, 'id')` evaluates to `NULL` because no sequence exists. Attempting `setval()` on them would raise an error.
- All other 17 tables (`admin_audit_logs`, `admin_district_access`, `admin_permissions`, `admin_users`, `daily_field_reports`, `daily_staff_leaves`, `districts`, `nikshay_sync_flagged_records`, `nikshay_sync_grace_records`, `nikshay_sync_runs`, `nikshay_verified_patients`, `patient_id_edit_logs`, `report_fdc_details`, `report_kpi_entries`, `report_visited_names`, `staff_directory`, `staff_targets`) have active sequences that will be resynchronized:
  ```sql
  SELECT setval(
      pg_get_serial_sequence('<table_name>', 'id'),
      COALESCE((SELECT MAX(id) FROM <table_name>), 1)
  );
  ```

### Resolution 4 — Manual vs Automated Backup Filename Naming Convention (Google Drive Flat Folder)
Google Drive's folder structure uses a flat destination folder (`DFY-MIS-Backups`) without subfolder separation (replacing the legacy Firestore-era `daily_backups/` and `manual_backups/` prefix split). Uniqueness and collision avoidance are enforced directly through the filename string:
1. **Automated Cron Backups (`source="automated_daily"`, via `POST /admin/backup/trigger-cron`):**
   - **Filename Pattern:** `backup_{YYYY-MM-DD}.json.gz`
   - Generated strictly once per calendar day based on Indian Standard Time (IST, UTC+5:30).
2. **Manual Admin Backups (`source="manual_superadmin"`, via `POST /admin/backup/trigger-now`):**
   - **Filename Pattern:** `backup_manual_{YYYY-MM-DD}_{HHMMSS}.json.gz`
   - Always includes a compact 6-digit timestamp suffix (`%H%M%S` in IST).
   - Guarantees that multiple manual snapshots triggered on the same calendar day never collide with each other or overwrite that day's automated daily backup.

