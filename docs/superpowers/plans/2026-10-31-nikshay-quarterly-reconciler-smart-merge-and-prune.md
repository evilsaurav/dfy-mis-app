# Nikshay Quarterly Reconciler, Monotonic Smart Merge, 3-Month Pruning & Sync Telemetry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Nikshay Reconciler to support multi-month/quarterly dumps (e.g. 16,192 rows) with 512 MB RAM safety, non-destructive monotonic smart merging (zero duplicates, additive indicator retention), 3-month rolling retention pruning with Google Drive backup, real-time ETA progress feedback, and fixed persistent sync telemetry.

**Architecture:** A low-memory column-projected parser protected by an `asyncio.Semaphore(1)` concurrency lock feeds a high-speed batch upsert engine (PostgreSQL `execute_values` in 1,000-row chunks) using boolean `OR` delta merging. Sync telemetry reads directly from `nikshay_sync_runs`, and 3-month pruning utilizes a 2-step dry-run + Google Drive compressed archive workflow before database deletion.

**Tech Stack:** FastAPI, Python 3.14, PostgreSQL (psycopg2-binary + execute_values), Pandas / OpenPyXL, React 19, Tailwind CSS v4, Lucide Icons.

**Spec:** `docs/superpowers/specs/2026-10-31-nikshay-quarterly-reconciler-smart-merge-and-prune-design.md`

## Global Constraints
- Render dyno RAM ceiling is strictly 512 MB; peak Python RAM must remain < 65 MB.
- Live PostgreSQL production database records must NEVER be corrupted, lost, or duplicated.
- All testing and execution must happen LOCALLY first; zero push to remote until user explicitly approves.
- Never bypass RBAC (Super Admin restricted actions must remain strictly guarded).
- Monotonic retention: Once an indicator (`hiv_tested`, `udst_done`, etc.) is True, it must NEVER revert to False.

---

### Task 1: Database Migration & Schema Evolution (`diagnosis_date` and Indexing)

**Files:**
- Modify: `backend/routers/nikshay.py:50-100`
- Test: `tests/test_nikshay_quarterly_merge_and_prune.py`

**Interfaces:**
- Consumes: PostgreSQL connection pool from `backend.core.supabase`
- Produces: `diagnosis_date DATE` column and index on `nikshay_verified_patients`

- [ ] **Step 1: Write the failing test for schema check**

```python
# tests/test_nikshay_quarterly_merge_and_prune.py
import pytest
from backend.core.supabase import pg_execute_raw

def test_diagnosis_date_column_exists():
    cols = pg_execute_raw(
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'nikshay_verified_patients' AND column_name = 'diagnosis_date';",
        fetch=True
    )
    assert len(cols) == 1, "diagnosis_date column must exist on nikshay_verified_patients"
    assert cols[0]["data_type"] == "date"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_nikshay_quarterly_merge_and_prune.py::test_diagnosis_date_column_exists -v`
Expected: FAIL with assertion error.

- [ ] **Step 3: Implement database migration helper**

In `backend/routers/nikshay.py`, add schema migration helper:
```python
def ensure_nikshay_schema():
    """Ensures diagnosis_date and relevant performance indexes exist on nikshay_verified_patients."""
    try:
        pg_execute_raw(
            """
            ALTER TABLE nikshay_verified_patients ADD COLUMN IF NOT EXISTS diagnosis_date DATE;
            CREATE INDEX IF NOT EXISTS idx_nikshay_pt_diag_date ON nikshay_verified_patients(diagnosis_date);
            CREATE INDEX IF NOT EXISTS idx_nikshay_pt_dist_diag ON nikshay_verified_patients(district, diagnosis_date);
            """
        )
    except Exception as e:
        logger.warning(f"[Nikshay Schema] Migration notice: {e}")
```
Call `ensure_nikshay_schema()` during router initialization.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_nikshay_quarterly_merge_and_prune.py::test_diagnosis_date_column_exists -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/routers/nikshay.py tests/test_nikshay_quarterly_merge_and_prune.py
git commit -m "feat(nikshay): add diagnosis_date column and performance indexes to nikshay_verified_patients"
```

---

### Task 2: High-Speed Batch Monotonic Smart Merge Engine

**Files:**
- Modify: `backend/routers/nikshay.py:80-250`
- Test: `tests/test_nikshay_quarterly_merge_and_prune.py`

**Interfaces:**
- Consumes: Dictionary of parsed patient records (`patients_to_sync`)
- Produces: `sync_nikshay_cumulative_ledger_sync` returning `{"total_processed", "written", "unchanged"}`

- [ ] **Step 1: Write test for monotonic additive merging & duplicate prevention**

```python
# In tests/test_nikshay_quarterly_merge_and_prune.py
def test_monotonic_smart_merge_logic():
    from backend.routers.nikshay import sync_nikshay_cumulative_ledger_sync
    from backend.core.supabase import pg_fetch_one, pg_execute_raw

    test_pid = "TEST_MERGE_999999"
    # Clean up test row if exists
    pg_execute_raw("DELETE FROM nikshay_verified_patients WHERE patient_id = %s;", [test_pid])

    # Round 1: Ingest patient with HIV only
    p1 = {
        test_pid: {
            "name": "Ramesh Kumar",
            "phone": "9876543210",
            "district": "Patna",
            "diagnosis_date": "2026-08-15",
            "notification_verified": True,
            "hiv_tested": True,
            "dm_tested": False,
            "hiv_dm_tested": True,
            "bank_validated": False,
            "udst_done": False,
            "contact_tracing_done": False,
            "outcome": ""
        }
    }
    res1 = sync_nikshay_cumulative_ledger_sync(p1, "TestAdmin")
    assert res1["written"] >= 1

    row1 = pg_fetch_one("nikshay_verified_patients", filters={"patient_id": test_pid})
    assert row1["hiv_tested"] is True
    assert row1["udst_done"] is False
    assert str(row1["diagnosis_date"]) == "2026-08-15"

    # Round 2: Ingest same patient with UDST only (HIV not mentioned/False in new sheet)
    p2 = {
        test_pid: {
            "name": "Ramesh Kumar",
            "phone": "9876543210",
            "district": "Patna",
            "diagnosis_date": "2026-08-15",
            "notification_verified": True,
            "hiv_tested": False,
            "dm_tested": False,
            "hiv_dm_tested": False,
            "bank_validated": True,
            "udst_done": True,
            "contact_tracing_done": False,
            "outcome": ""
        }
    }
    res2 = sync_nikshay_cumulative_ledger_sync(p2, "TestAdmin")

    # Verify monotonic accumulation: HIV stayed True, UDST became True, Bank became True
    row2 = pg_fetch_one("nikshay_verified_patients", filters={"patient_id": test_pid})
    assert row2["hiv_tested"] is True, "HIV must remain True (monotonic retention)"
    assert row2["udst_done"] is True, "UDST must be updated to True"
    assert row2["bank_validated"] is True, "Bank must be updated to True"

    # Verify zero duplicates
    counts = pg_execute_raw("SELECT COUNT(*) as c FROM nikshay_verified_patients WHERE patient_id = %s;", [test_pid], fetch=True)
    assert counts[0]["c"] == 1, "Must be exactly 1 row (zero duplicate IDs)"

    # Clean up test row
    pg_execute_raw("DELETE FROM nikshay_verified_patients WHERE patient_id = %s;", [test_pid])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_nikshay_quarterly_merge_and_prune.py::test_monotonic_smart_merge_logic -v`
Expected: FAIL

- [ ] **Step 3: Implement batch monotonic merge with `execute_values`**

In `backend/routers/nikshay.py`:
Implement batch upsert using `psycopg2.extras.execute_values` in chunks of 1,000 rows.
Write SQL query with `ON CONFLICT (patient_id) DO UPDATE SET` using boolean `OR` for all indicators:
- `notification_verified = nikshay_verified_patients.notification_verified OR EXCLUDED.notification_verified`
- `hiv_tested = nikshay_verified_patients.hiv_tested OR EXCLUDED.hiv_tested`
- `dm_tested = nikshay_verified_patients.dm_tested OR EXCLUDED.dm_tested`
- `hiv_dm_tested = nikshay_verified_patients.hiv_dm_tested OR EXCLUDED.hiv_dm_tested`
- `bank_validated = nikshay_verified_patients.bank_validated OR EXCLUDED.bank_validated`
- `udst_done = nikshay_verified_patients.udst_done OR EXCLUDED.udst_done`
- `contact_tracing_done = nikshay_verified_patients.contact_tracing_done OR EXCLUDED.contact_tracing_done`
- `diagnosis_date = COALESCE(EXCLUDED.diagnosis_date, nikshay_verified_patients.diagnosis_date)`

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_nikshay_quarterly_merge_and_prune.py::test_monotonic_smart_merge_logic -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/routers/nikshay.py tests/test_nikshay_quarterly_merge_and_prune.py
git commit -m "feat(nikshay): implement high-speed batch monotonic delta upsert engine"
```

---

### Task 3: Quarterly Ingestion, Low-Memory Projection & Concurrency Guard

**Files:**
- Modify: `backend/routers/nikshay.py:250-480`
- Test: `tests/test_nikshay_quarterly_merge_and_prune.py`

**Interfaces:**
- Consumes: Multipart Excel upload file (`UploadFile`), optional `month`, optional `district`
- Produces: Complete quarterly cross-match summary, multi-month DFY report aggregation, and `nikshay_sync_runs` insert

- [ ] **Step 1: Write test for quarterly file parsing with `Spectrum_Diagnosis_Date`**

```python
# In tests/test_nikshay_quarterly_merge_and_prune.py
def test_quarterly_multi_month_detection():
    # Test that dates spanning Jul, Aug, Sep extract distinct months ['2026-07', '2026-08', '2026-09']
    from backend.routers.nikshay import extract_months_from_date_series
    import pandas as pd
    dates = pd.Series(["2026-07-15", "2026-08-01", "2026-09-30", None, "2026-08-20"])
    months = extract_months_from_date_series(dates)
    assert set(months) == {"2026-07", "2026-08", "2026-09"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_nikshay_quarterly_merge_and_prune.py::test_quarterly_multi_month_detection -v`
Expected: FAIL

- [ ] **Step 3: Implement low-memory parser and multi-month MIS aggregation**

In `backend/routers/nikshay.py`:
1. Wrap endpoint execution with `async with NIKSHAY_EXPORT_SEMAPHORE:`
2. Define `TARGET_COLS = {'episode_id', 'spectrum_diagnosis_date', 'patient_name', 'primaryphone', 'spectrum_diagnosing_district', 'status_of_hiv', 'hiv_tested', 'status_of_diabetes', 'diabetes_tested', 'bank_validated', 'udst_done', 'contact_tracing_done', 'treatment_outcome'}` and read with `usecols=lambda c: str(c).strip().lower() in TARGET_COLS`.
3. Extract `Spectrum_Diagnosis_Date` for each patient.
4. Auto-detect all distinct months in the file.
5. If `month` form parameter is empty or "All", query DFY MIS reports across all detected months in parallel:
   `for m in detected_months: reports.extend(await get_raw_monthly_reports(m))`.
6. Insert audit run record into `nikshay_sync_runs`.
7. Call `del df; del content; gc.collect()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_nikshay_quarterly_merge_and_prune.py::test_quarterly_multi_month_detection -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/routers/nikshay.py tests/test_nikshay_quarterly_merge_and_prune.py
git commit -m "feat(nikshay): add low-memory quarterly parser and multi-month MIS cross-matching"
```

---

### Task 4: Sync Status Telemetry Endpoint Fix

**Files:**
- Modify: `backend/routers/nikshay.py:865-908`
- Test: `tests/test_nikshay_quarterly_merge_and_prune.py`

**Interfaces:**
- Consumes: `GET /admin/nikshay/sync-status`
- Produces: JSON `{success: true, has_sync: true, synced_at_ist: "...", synced_by: "...", total_matched: ..., ...}`

- [ ] **Step 1: Write test for sync-status query against `nikshay_sync_runs`**

```python
# In tests/test_nikshay_quarterly_merge_and_prune.py
def test_sync_status_reads_from_sync_runs():
    from backend.routers.nikshay import get_nikshay_sync_status
    import asyncio
    status = asyncio.run(get_nikshay_sync_status(admin={"username": "admin", "role": "SUPER_ADMIN"}))
    assert status["success"] is True
    assert status["has_sync"] is True
    assert "synced_at_ist" in status
    assert status["total_matched"] > 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_nikshay_quarterly_merge_and_prune.py::test_sync_status_reads_from_sync_runs -v`
Expected: FAIL (or returns `has_sync: False`).

- [ ] **Step 3: Update `get_nikshay_sync_status` to query `nikshay_sync_runs`**

In `backend/routers/nikshay.py`:
Query `nikshay_sync_runs ORDER BY id DESC LIMIT 1`. Format `synced_at` into IST (`DD Mon YYYY, HH:MM AM/PM`). Return actual stats.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_nikshay_quarterly_merge_and_prune.py::test_sync_status_reads_from_sync_runs -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/routers/nikshay.py tests/test_nikshay_quarterly_merge_and_prune.py
git commit -m "fix(nikshay): link sync-status endpoint to nikshay_sync_runs table"
```

---

### Task 5: 3-Month Rolling Retention Pruning Endpoint

**Files:**
- Modify: `backend/routers/nikshay.py:1480-1685`
- Test: `tests/test_nikshay_quarterly_merge_and_prune.py`

**Interfaces:**
- Consumes: `POST /admin/nikshay/purge-old-records?dry_run=true&retention_months=3`
- Produces: Dry-run count preview, or live Google Drive backup link + purged count

- [ ] **Step 1: Write test for 3-month retention cutoff query**

```python
# In tests/test_nikshay_quarterly_merge_and_prune.py
def test_3_month_retention_purge_dry_run():
    from backend.routers.nikshay import purge_old_nikshay_records
    import asyncio
    res = asyncio.run(purge_old_nikshay_records(
        dry_run=True,
        retention_months=3,
        admin={"username": "Super Admin", "role": "SUPER_ADMIN"}
    ))
    assert res["dry_run"] is True
    assert "matched_count" in res
    assert "cutoff_date" in res
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_nikshay_quarterly_merge_and_prune.py::test_3_month_retention_purge_dry_run -v`
Expected: FAIL with `unexpected keyword argument 'retention_months'`

- [ ] **Step 3: Update `purge_old_nikshay_records` to accept `retention_months`**

In `backend/routers/nikshay.py`:
1. Add `retention_months: int = Query(3)`.
2. Compute `cutoff_date = (datetime.now() - timedelta(days=retention_months * 30)).strftime("%Y-%m-%d")`.
3. Query rows where `COALESCE(diagnosis_date, last_reconciled_at::date, first_verified_at::date) < %s::date`.
4. In dry-run mode, return preview with cutoff date.
5. In live mode, compress to `.json.gz`, upload to Google Drive via `BackupStorageProvider`, delete matching rows in 500-row chunks, clear cache, and return summary.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_nikshay_quarterly_merge_and_prune.py::test_3_month_retention_purge_dry_run -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/routers/nikshay.py tests/test_nikshay_quarterly_merge_and_prune.py
git commit -m "feat(nikshay): implement 3-month rolling retention prune with Google Drive backup"
```

---

### Task 6: Frontend UI - Live ETA Feedback & Telemetry Display

**Files:**
- Modify: `dfy-frontend/src/components/Admin/modals/NikshayModal.jsx:105-140`
- Modify: `dfy-frontend/src/components/Admin/modals/NikshayModal.jsx:220-265`
- Modify: `dfy-frontend/src/hooks/useAdminModals.js:910-945`

**Interfaces:**
- Consumes: `nikshayLoading`, `nikshaySyncStatus`
- Produces: Live stopwatch timer, estimated duration message, and accurate status pill

- [ ] **Step 1: Add stopwatch and stage feedback state in `useAdminModals.js`**

Add `nikshayElapsedSeconds` timer state that increments every second when `nikshayLoading` is true.

- [ ] **Step 2: Update `NikshayModal.jsx` upload form UI**

Render:
- Live elapsed stopwatch: `⏱️ Elapsed: 00:18s`
- Notice: `⏳ Processing quarterly dataset (~16,000 records) under low-memory guard. Estimated time: ~25-40 seconds.`
- Pulsing progress bar.
- Display `nikshaySyncStatus.synced_at_ist` with green pulse in the header.

- [ ] **Step 3: Verify frontend linter and build**

Run: `cd dfy-frontend; npm run lint; npm run build`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add dfy-frontend/src/components/Admin/modals/NikshayModal.jsx dfy-frontend/src/hooks/useAdminModals.js
git commit -m "feat(ui): add live elapsed timer, low-memory ETA notice, and persistent sync status badge"
```

---

### Task 7: Frontend UI - Prune Old Ledger (>3 Months) Button & Modal

**Files:**
- Modify: `dfy-frontend/src/components/Admin/modals/NikshayModal.jsx:75-105`
- Modify: `dfy-frontend/src/components/Admin/modals/NikshayModal.jsx:550-650`
- Modify: `dfy-frontend/src/hooks/useAdminModals.js`

**Interfaces:**
- Consumes: `isSubAdmin`, `fetchCumulativeLedger`
- Produces: Prune dialog with Dry-Run preview and Google Drive backup confirmation

- [ ] **Step 1: Add Prune Ledger actions in `useAdminModals.js`**

Implement `handlePreviewPruneLedger()` and `handleExecutePruneLedger()`.

- [ ] **Step 2: Add Prune button and modal in `NikshayModal.jsx`**

Add "🧹 Prune Old Records (>3 Months)" button next to Export in Cumulative Ledger view (visible only to Super Admin).
Include dry-run preview modal showing count of records to be pruned, cutoff date, and Google Drive backup confirmation.

- [ ] **Step 3: Verify frontend linter and build**

Run: `cd dfy-frontend; npm run lint; npm run build`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add dfy-frontend/src/components/Admin/modals/NikshayModal.jsx dfy-frontend/src/hooks/useAdminModals.js
git commit -m "feat(ui): add 3-month retention prune controls with dry-run preview and Drive backup"
```

---

### Task 8: Full End-to-End Local Verification Battery

**Files:**
- Verification only (Rule 1 Battery)

- [ ] **Step 1: Compile Python backend**

Run: `python -m py_compile main.py backend/routers/nikshay.py`
Expected: Exit code 0.

- [ ] **Step 2: Run all backend tests**

Run: `python -m pytest tests/test_nikshay_quarterly_merge_and_prune.py -v`
Expected: All tests pass 100%.

- [ ] **Step 3: Run existing regression tests**

Run: `python -m pytest tests/test_fo_monthly_recap_and_ta.py tests/test_travel_allowance_backend.py -v`
Expected: All pass.

- [ ] **Step 4: Run frontend production build & lint**

Run: `cd dfy-frontend; npm run lint; npm run build`
Expected: 0 errors.

- [ ] **Step 5: Local Test Run on Actual File**

Run dev servers locally and upload `C:\Users\Saurav\OneDrive\Desktop\Nishay reconcile.xlsx` through the admin modal to verify:
1. 16,192 records processed smoothly under ~30 seconds.
2. Memory remains stable (< 65 MB).
3. "Last Data Synced" displays actual timestamp.
4. Cumulative Ledger view reflects verified patients without duplicates.
5. Dry-run prune preview works as expected.
