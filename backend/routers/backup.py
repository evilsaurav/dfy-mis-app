"""
Postgres-Native Google Drive Backup & Recovery Router for DFY TB MIS.

Implements full database snapshots, external cron triggering via GitHub Actions,
advisory locking, Google Drive storage via BackupStorageProvider, and safe two-phase
disaster restoration with OVERRIDING SYSTEM VALUE and sequence resynchronization.
Specification: docs/backup_rebuild_design.md v1.4
"""

import os
import io
import json
import gzip
import tempfile
import asyncio
import logging
import gc
import hmac
import base64
from datetime import datetime, date as dt_date, timedelta, timezone
from decimal import Decimal
from contextlib import contextmanager
from typing import Optional, List, Dict, Any, Set, Tuple

from fastapi import APIRouter, HTTPException, Depends, Request, Query, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.core.backup_storage import get_storage_provider, BackupStorageError
from backend.core.supabase import get_db_connection, pg_execute_raw
from backend.core.security import get_current_admin, require_super_admin
from backend.core.helpers import log_admin_activity, get_ist_now
from backend.core.cache import cache

logger = logging.getLogger("backup")
router = APIRouter(tags=["backup"])

# Concurrency & Lock Constants
BACKUP_ADVISORY_LOCK_ID = 749281
BACKUP_SEMAPHORE = asyncio.Semaphore(1)
BACKUP_RETENTION_DAYS = 30

# The 19 Base Tables in Topological FK Dependency Order (Tiers 1 -> 4)
BACKUP_TABLES = [
    # Tier 1: Root Parents (0 Foreign Keys)
    "districts",
    "admin_users",
    "district_targets",
    "pacing_settings",
    # Tier 2: Intermediate Parents (Depend solely on Tier 1)
    "staff_directory",
    "admin_permissions",
    "admin_district_access",
    # Tier 3: Transaction Parents (Depend on Tier 1 and Tier 2)
    "daily_field_reports",
    "daily_staff_leaves",
    "staff_targets",
    "patient_id_edit_logs",
    "admin_audit_logs",
    "nikshay_verified_patients",
    "nikshay_sync_runs",
    # Tier 4: Transaction Children (Depend on Tier 3)
    "report_kpi_entries",
    "report_fdc_details",
    "report_visited_names",
    "nikshay_sync_flagged_records",
    "nikshay_sync_grace_records",
]

# The 17 Tables with PostgreSQL GENERATED ALWAYS AS IDENTITY Sequences
# (Excludes 'district_targets' and 'pacing_settings' which use text primary keys)
IDENTITY_TABLES = [
    "admin_audit_logs",
    "admin_district_access",
    "admin_permissions",
    "admin_users",
    "daily_field_reports",
    "daily_staff_leaves",
    "districts",
    "nikshay_sync_flagged_records",
    "nikshay_sync_grace_records",
    "nikshay_sync_runs",
    "nikshay_verified_patients",
    "patient_id_edit_logs",
    "report_fdc_details",
    "report_kpi_entries",
    "report_visited_names",
    "staff_directory",
    "staff_targets",
]

# Resolution 2 Partitioning for Tier 1-3 Tables
GROUP_A_TABLES = {
    "admin_users",
    "staff_directory",
    "daily_staff_leaves",
    "staff_targets",
    "district_targets",
    "pacing_settings",
    "admin_permissions",
}

GROUP_B_TABLES = {
    "districts",
    "admin_district_access",
    "admin_audit_logs",
    "patient_id_edit_logs",
    "nikshay_verified_patients",
}

CHILD_TABLES = {
    "report_kpi_entries",
    "report_fdc_details",
    "report_visited_names",
    "nikshay_sync_flagged_records",
    "nikshay_sync_grace_records",
}


def postgres_json_serializer(obj: Any) -> Any:
    """
    Lossless serializer for Postgres types.
    Strictly serializes Decimals to strings to ban IEEE 754 float precision loss.
    """
    if isinstance(obj, (datetime, dt_date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return str(obj)
    if isinstance(obj, (bytes, bytearray)):
        return base64.b64encode(obj).decode("ascii")
    if hasattr(obj, "__str__"):
        return str(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


@contextmanager
def hold_advisory_lock(lock_id: int):
    """
    Acquires a PostgreSQL session-level advisory lock on a dedicated connection,
    holds that exact connection open across the entire backup/restore operation,
    and guarantees pg_advisory_unlock is executed on that same connection before
    returning it to the pool.
    """
    with get_db_connection() as conn:
        if not conn:
            # Fallback for unit test harness / mock DB
            yield
            return

        import psycopg2.extras
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT pg_try_advisory_lock(%s) AS acquired;", [lock_id])
            res = cur.fetchone()
            acquired = bool(res and res.get("acquired"))
            if not acquired:
                raise HTTPException(status_code=409, detail="Backup execution already in progress")

        try:
            yield
        finally:
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT pg_advisory_unlock(%s);", [lock_id])
                conn.commit()
            except Exception as unlock_err:
                logger.warning(f"[Advisory Lock] Could not release lock {lock_id}: {unlock_err}")


def _sync_dump_table_data(table_name: str) -> List[Dict[str, Any]]:
    """Dumps all rows from a Postgres table into a list of dicts."""
    with get_db_connection() as conn:
        if not conn:
            return []
        import psycopg2.extras
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(f'SELECT * FROM "{table_name}" ORDER BY id ASC;')
            rows = cur.fetchall()
            return [dict(r) for r in rows] if rows else []


def _sync_create_database_snapshot(source: str = "automated_daily") -> Dict[str, Any]:
    """
    Synchronous worker executed in a background thread via asyncio.to_thread.
    Streams all 19 base tables in topological order into a GZip-compressed disk
    temporary file in batches, keeping peak memory strictly bounded (< 15 MB).
    """
    import psycopg2.extras

    ist_now = get_ist_now()
    ist_date_str = ist_now.strftime("%Y-%m-%d")
    ist_time_str = ist_now.strftime("%Y-%m-%d %I:%M:%S %p")
    timestamp_compact = ist_now.strftime("%H%M%S")

    # Resolution 4 naming convention: backup_manual_{YYYY-MM-DD}_{HHMMSS}.json.gz
    if source == "automated_daily":
        filename = f"backup_{ist_date_str}.json.gz"
    else:
        filename = f"backup_manual_{ist_date_str}_{timestamp_compact}.json.gz"

    with tempfile.NamedTemporaryFile(suffix=".json.gz", delete=False) as tmp_file:
        tmp_path = tmp_file.name

    try:
        # Phase 1: Fast table count query in single connection (~20ms)
        counts: Dict[str, int] = {}
        total_records = 0
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                for table_name in BACKUP_TABLES:
                    cur.execute(f'SELECT COUNT(*) FROM "{table_name}";')
                    cnt = cur.fetchone()[0]
                    counts[table_name] = cnt
                    total_records += cnt

        metadata_obj = {
            "version": "2.0",
            "engine": "postgresql",
            "backup_source": source,
            "created_at_utc": datetime.now(timezone.utc).isoformat(),
            "created_at_ist": ist_time_str,
            "backup_date": ist_date_str,
            "filename": filename,
            "table_counts": counts,
            "total_records": total_records,
            "total_documents": total_records,
        }

        # Phase 2: Stream-write GZip to disk temp file in batches of 1,000 rows
        uncompressed_bytes_count = 0

        with open(tmp_path, "wb") as f_raw:
            with gzip.GzipFile(fileobj=f_raw, mode="wb", compresslevel=6) as gz_out:
                header_chunk = b'{"metadata": ' + json.dumps(metadata_obj, default=postgres_json_serializer, ensure_ascii=False).encode("utf-8") + b', "tables": {'
                gz_out.write(header_chunk)
                uncompressed_bytes_count += len(header_chunk)

                with get_db_connection() as conn:
                    for i, table_name in enumerate(BACKUP_TABLES):
                        prefix = b', "' if i > 0 else b'"'
                        key_chunk = prefix + table_name.encode("utf-8") + b'": ['
                        gz_out.write(key_chunk)
                        uncompressed_bytes_count += len(key_chunk)

                        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                            cur.execute(f'SELECT * FROM "{table_name}" ORDER BY id ASC;')
                            first_row = True
                            while True:
                                batch = cur.fetchmany(1000)
                                if not batch:
                                    break
                                for row in batch:
                                    sep = b'' if first_row else b', '
                                    first_row = False
                                    row_bytes = sep + json.dumps(dict(row), default=postgres_json_serializer, ensure_ascii=False).encode("utf-8")
                                    gz_out.write(row_bytes)
                                    uncompressed_bytes_count += len(row_bytes)
                                del batch

                        gz_out.write(b']')
                        uncompressed_bytes_count += 1
                        gc.collect()

                closing_chunk = b'}}'
                gz_out.write(closing_chunk)
                uncompressed_bytes_count += len(closing_chunk)

        compressed_size = os.path.getsize(tmp_path)

        metadata = {
            "backup_date": ist_date_str,
            "backup_source": source,
            "total_documents": str(total_records),
            "total_records": str(total_records),
            "uncompressed_bytes": str(uncompressed_bytes_count),
            "compressed_bytes": str(compressed_size),
            "created_at_ist": ist_time_str,
        }

        return {
            "filename": filename,
            "temp_path": tmp_path,
            "metadata": metadata,
            "total_records": total_records,
            "total_documents": total_records,
            "table_counts": counts,
            "size_kb": round(compressed_size / 1024, 2),
            "uncompressed_kb": round(uncompressed_bytes_count / 1024, 2),
            "created_at": ist_time_str,
        }
    except Exception:
        if os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
        raise


# ============================================================================
# ENDPOINT 1: GET /admin/backup/status
# ============================================================================

@router.get("/admin/backup/status")
async def get_backup_status(admin: dict = Depends(require_super_admin)):
    """
    Returns live backup status from Google Drive.
    Restricted strictly to SUPER_ADMIN.
    Contract preserves exact properties expected by BackupModal.jsx.
    """
    try:
        provider = get_storage_provider()
        folder_id = os.environ.get("GDRIVE_FOLDER_ID", "DFY-MIS-Backups")
        ist_now = get_ist_now()
        ist_today = ist_now.strftime("%Y-%m-%d")
        today_filename = f"backup_{ist_today}.json.gz"

        all_backups = await provider.list_backups()

        backups_list = []
        today_backup_exists = False

        for b in all_backups:
            b_name = b.get("filename", "")
            if not b_name.endswith(".json.gz"):
                continue

            is_today = (b_name == today_filename)
            if is_today:
                today_backup_exists = True

            size_bytes = b.get("size_bytes") or 0
            size_kb = round(size_bytes / 1024, 2)
            created_at = b.get("created_at") or "N/A"
            date_str = b_name.replace("backup_manual_", "").replace("backup_", "").split("_")[0].replace(".json.gz", "")

            # Exact lowercase source per Resolution 4 & BackupModal.jsx lines 181-183
            raw_source = b.get("source", "")
            if "manual" in b_name or raw_source == "manual_superadmin":
                source_val = "manual_superadmin"
            else:
                source_val = "automated_daily"

            backups_list.append({
                "filename": b_name,
                "remote_id": b.get("remote_id"),
                "size_kb": size_kb,
                "created_at": created_at,
                "date": date_str,
                "source": source_val,
                "total_documents": b.get("total_records") or b.get("total_documents") or "N/A",
                "total_records": b.get("total_records") or b.get("total_documents") or "N/A",
                "is_today": is_today,
            })

        latest_backup = backups_list[0] if backups_list else None

        return {
            "status": "ACTIVE",
            "storage_provider": "Google Drive",
            "bucket_name": f"Google Drive ({folder_id})",  # Fallback for BackupModal.jsx line 85
            "folder_id": folder_id,
            "region": "asia-south1 (Mumbai)",
            "today_backup_exists": today_backup_exists,
            "today_backup_completed": today_backup_exists,  # Alias
            "today_backup_filename": today_filename if today_backup_exists else None,
            "last_backup_time": latest_backup["created_at"] if latest_backup else "None",
            "total_backups_count": len(backups_list),
            "retention_policy": f"{BACKUP_RETENTION_DAYS} Days Automatic Retention",
            "backups": backups_list[:30],
        }
    except BackupStorageError as bse:
        logger.error(f"[Backup Status Error] Storage provider failure: {bse}")
        raise HTTPException(status_code=502, detail=f"Cloud storage provider error: {bse.message}")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[Backup Status Error]")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ENDPOINT 2: POST /admin/backup/trigger-now
# ============================================================================

@router.post("/admin/backup/trigger-now")
async def trigger_manual_backup(admin: dict = Depends(require_super_admin)):
    """
    On-demand snapshot generator for Super Admin.
    Snapshots PostgreSQL database, compresses to GZip, uploads to Google Drive,
    and writes an audit log. Protected by advisory lock.
    """
    admin_user = admin.get("name") or admin.get("username", "Super Admin")
    admin_id = admin.get("user_id") or admin.get("username", "admin")

    try:
        with hold_advisory_lock(BACKUP_ADVISORY_LOCK_ID):
            async with BACKUP_SEMAPHORE:
                result = await asyncio.to_thread(_sync_create_database_snapshot, source="manual_superadmin")
                provider = get_storage_provider()
                temp_path = result.pop("temp_path")
                metadata = result.pop("metadata")
                try:
                    await provider.upload(temp_path, result["filename"], metadata=metadata)
                finally:
                    if temp_path and os.path.exists(temp_path):
                        try:
                            os.unlink(temp_path)
                        except Exception as e:
                            logger.warning(f"[Backup] Failed to remove temp file {temp_path}: {e}")

            await log_admin_activity(
                action_type="DATABASE_BACKUP_MANUAL",
                details=f"Manual cloud backup generated: {result['filename']} ({result['size_kb']} KB, {result['total_records']} records)",
                user_name=admin_user,
                user_id=admin_id,
                role="SUPER_ADMIN"
            )

            return {
                "success": True,
                "message": "Full database cloud backup successfully created!",
                **result
            }
    except HTTPException:
        raise
    except BackupStorageError as bse:
        logger.error(f"[Manual Backup Error] Storage failure: {bse}")
        raise HTTPException(status_code=502, detail=f"Failed to upload backup to cloud storage: {bse.message}")
    except Exception as e:
        logger.exception("[Manual Backup Error]")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ENDPOINT 3: POST /admin/backup/trigger-cron
# ============================================================================

@router.post("/admin/backup/trigger-cron")
async def trigger_cron_backup(request: Request):
    """
    Daily automated backup endpoint invoked by GitHub Actions cron.
    Authenticated via X-Backup-Cron-Secret header matching BACKUP_CRON_SECRET.
    Bypasses interactive JWT. Performs daily snapshot and auto-prunes > 30 days.
    """
    token = request.headers.get("X-Backup-Cron-Secret", "")
    expected = os.environ.get("BACKUP_CRON_SECRET", "")
    if not expected or not token or not hmac.compare_digest(token, expected):
        raise HTTPException(status_code=403, detail="Invalid backup cron secret")

    try:
        with hold_advisory_lock(BACKUP_ADVISORY_LOCK_ID):
            async with BACKUP_SEMAPHORE:
                result = await asyncio.to_thread(_sync_create_database_snapshot, source="automated_daily")
                provider = get_storage_provider()
                temp_path = result.pop("temp_path")
                metadata = result.pop("metadata")
                try:
                    await provider.upload(temp_path, result["filename"], metadata=metadata)
                finally:
                    if temp_path and os.path.exists(temp_path):
                        try:
                            os.unlink(temp_path)
                        except Exception as e:
                            logger.warning(f"[Backup] Failed to remove temp file {temp_path}: {e}")

                # Auto-prune backups older than 30 days
                pruned_count = await provider.prune_older_than(BACKUP_RETENTION_DAYS)
                result["pruned_old_backups"] = pruned_count

            await log_admin_activity(
                action_type="DATABASE_BACKUP_AUTO",
                details=f"Automated daily cloud backup completed: {result['filename']} ({result['size_kb']} KB, {result['total_records']} records, {pruned_count} pruned)",
                user_name="System Cron Watchdog",
                user_id="system_cron",
                role="SYSTEM"
            )

            return {
                "status": "SUCCESS",
                "details": result
            }
    except HTTPException:
        raise
    except BackupStorageError as bse:
        logger.error(f"[Cron Backup Error] Storage failure: {bse}")
        await log_admin_activity(
            action_type="DATABASE_BACKUP_FAILED",
            details=f"Automated daily backup failed: {bse.message}",
            user_name="System Cron Watchdog",
            user_id="system_cron",
            role="SYSTEM"
        )
        raise HTTPException(status_code=502, detail=f"Storage failure during automated backup: {bse.message}")
    except Exception as e:
        logger.exception("[Cron Backup Error]")
        await log_admin_activity(
            action_type="DATABASE_BACKUP_FAILED",
            details=f"Automated daily backup encountered unhandled error: {str(e)}",
            user_name="System Cron Watchdog",
            user_id="system_cron",
            role="SYSTEM"
        )
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ENDPOINT 4: GET /admin/backup/download/{filename}
# ============================================================================

@router.get("/admin/backup/download/{filename}")
async def download_backup_file(
    filename: str,
    admin: dict = Depends(require_super_admin)
):
    """
    Streams requested backup archive directly to Super Admin.
    Strict sanitization prevents path traversal.
    """
    try:
        clean_name = os.path.basename(filename.strip())
        if not clean_name.endswith(".json.gz"):
            raise HTTPException(status_code=400, detail="Invalid backup filename format.")

        provider = get_storage_provider()
        compressed_data = await provider.download(clean_name)

        await log_admin_activity(
            action_type="DATABASE_BACKUP_DOWNLOAD",
            details=f"Super Admin downloaded cloud backup file: {clean_name} ({len(compressed_data)/1024:.1f} KB)",
            user_name=admin.get("name") or admin.get("username", "Super Admin"),
            user_id=admin.get("user_id") or admin.get("username", "admin"),
            role="SUPER_ADMIN"
        )

        return StreamingResponse(
            io.BytesIO(compressed_data),
            media_type="application/gzip",
            headers={"Content-Disposition": f'attachment; filename="{clean_name}"'}
        )
    except BackupStorageError as bse:
        logger.error(f"[Download Backup Error] {bse}")
        raise HTTPException(status_code=404, detail=f"Backup file '{filename}' not found in cloud storage.")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[Download Backup Error]")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ENDPOINT 5: POST /admin/backup/restore
# ============================================================================

class BackupRestoreReq(BaseModel):
    filename: str
    confirmation_code: str
    conflict_strategy: Optional[str] = "timestamp_guard"  # "timestamp_guard" | "force_overwrite"


@router.post("/admin/backup/restore")
async def restore_database_backup(
    req: BackupRestoreReq,
    dry_run: bool = Query(False),
    admin: dict = Depends(require_super_admin)
):
    """
    Disaster recovery endpoint. Executes Two-Phase Dependent Restore in
    topological order with OVERRIDING SYSTEM VALUE and sequence resynchronization.
    Supports dry_run=true preview mode with zero database writes.
    """
    # INTENTIONALLY PRESERVED & UNREACHABLE: All original two-phase restore logic below is
    # preserved without modification, reserved for a dedicated future performance-fix session.
    raise HTTPException(
        status_code=501,
        detail="Database restore subsystem is temporarily disabled pending a "
               "batch-performance redesign (sequential per-row execution was "
               "benchmarked at ~97 minutes for a full 19-table archive). "
               "Backup creation, status, download, and storage-health endpoints "
               "remain fully operational. See internal backlog item #8."
    )

    clean_name = os.path.basename(req.filename.strip())
    if not clean_name.endswith(".json.gz"):
        raise HTTPException(status_code=400, detail="Invalid backup archive filename.")

    if req.conflict_strategy == "force_overwrite":
        raise HTTPException(
            status_code=400,
            detail="conflict_strategy 'force_overwrite' is not yet implemented in this version. Only 'timestamp_guard' is currently supported."
        )

    # Authorization secret check for non-dry-run executions
    if not dry_run:
        expected_secret = os.environ.get("RESTORE_CONFIRMATION_CODE", "")
        if not expected_secret:
            raise HTTPException(
                status_code=403,
                detail="Restore subsystem locked: RESTORE_CONFIRMATION_CODE environment secret not configured on server."
            )
        if not hmac.compare_digest(req.confirmation_code.strip(), expected_secret.strip()):
            raise HTTPException(
                status_code=400,
                detail="Disaster recovery authorization denied. Confirmation code mismatch."
            )

    provider = get_storage_provider()
    try:
        compressed_data = await provider.download(clean_name)
    except BackupStorageError as bse:
        raise HTTPException(status_code=404, detail=f"Backup file '{clean_name}' not found in cloud storage: {bse.message}")

    try:
        json_str = gzip.decompress(compressed_data).decode("utf-8")
        snapshot = json.loads(json_str)
        del compressed_data
        gc.collect()
    except Exception as dec_err:
        raise HTTPException(status_code=400, detail=f"Corrupt or unreadable archive: {dec_err}")

    archive_tables = snapshot.get("tables") or snapshot.get("collections", {})
    if not isinstance(archive_tables, dict):
        raise HTTPException(status_code=400, detail="Malformed snapshot: missing tables dictionary.")

    # ------------------------------------------------------------------------
    # DRY-RUN / PREVIEW MODE (Zero Database Writes)
    # ------------------------------------------------------------------------
    if dry_run:
        table_diff: Dict[str, Any] = {}
        total_archive_records = 0
        total_live_records = 0

        with get_db_connection() as conn:
            if conn:
                import psycopg2.extras
                with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                    for t in BACKUP_TABLES:
                        cur.execute(f'SELECT COUNT(*) as count FROM "{t}";')
                        res = cur.fetchone()
                        live_count = res["count"] if res else 0
                        arch_rows = archive_tables.get(t, [])
                        arch_count = len(arch_rows) if isinstance(arch_rows, list) else 0

                        total_archive_records += arch_count
                        total_live_records += live_count

                        diff_entry: Dict[str, Any] = {
                            "in_archive": arch_count,
                            "in_live_db": live_count,
                            "delta": live_count - arch_count,
                        }

                        # Check timestamp conflicts for daily_field_reports
                        if t == "daily_field_reports" and arch_rows:
                            cur.execute(
                                'SELECT id, COALESCE(last_edited_at, created_at) as ts FROM "daily_field_reports";'
                            )
                            live_ts_map = {r["id"]: r["ts"] for r in cur.fetchall()}
                            conflicts = 0
                            for ar in arch_rows:
                                r_id = ar.get("id")
                                if r_id in live_ts_map:
                                    arch_ts_str = ar.get("last_edited_at") or ar.get("created_at")
                                    if arch_ts_str and live_ts_map[r_id]:
                                        try:
                                            arch_dt = datetime.fromisoformat(str(arch_ts_str))
                                            live_dt = live_ts_map[r_id]
                                            if live_dt.tzinfo is None:
                                                live_dt = live_dt.replace(tzinfo=timezone.utc)
                                            if arch_dt.tzinfo is None:
                                                arch_dt = arch_dt.replace(tzinfo=timezone.utc)
                                            if live_dt > arch_dt:
                                                conflicts += 1
                                        except Exception:
                                            pass
                            diff_entry["conflicts_newer_in_db"] = conflicts

                        # Check timestamp conflicts for nikshay_sync_runs
                        elif t == "nikshay_sync_runs" and arch_rows:
                            cur.execute(
                                'SELECT id, synced_at as ts FROM "nikshay_sync_runs";'
                            )
                            live_ts_map = {r["id"]: r["ts"] for r in cur.fetchall()}
                            conflicts = 0
                            for ar in arch_rows:
                                r_id = ar.get("id")
                                if r_id in live_ts_map:
                                    arch_ts_str = ar.get("synced_at")
                                    if arch_ts_str and live_ts_map[r_id]:
                                        try:
                                            arch_dt = datetime.fromisoformat(str(arch_ts_str))
                                            live_dt = live_ts_map[r_id]
                                            if live_dt.tzinfo is None:
                                                live_dt = live_dt.replace(tzinfo=timezone.utc)
                                            if arch_dt.tzinfo is None:
                                                arch_dt = arch_dt.replace(tzinfo=timezone.utc)
                                            if live_dt > arch_dt:
                                                conflicts += 1
                                        except Exception:
                                            pass
                            diff_entry["conflicts_newer_in_db"] = conflicts

                        table_diff[t] = diff_entry

        return {
            "dry_run": True,
            "archive_filename": clean_name,
            "created_at_ist": snapshot.get("metadata", {}).get("created_at_ist", "N/A"),
            "summary": {
                "total_tables": len(BACKUP_TABLES),
                "archive_record_count": total_archive_records,
                "live_db_record_count": total_live_records,
            },
            "table_diff": table_diff,
            "ready_for_execution": True,
        }

    # ------------------------------------------------------------------------
    # RESTORE EXECUTION (Two-Phase Dependent Transaction)
    # ------------------------------------------------------------------------
    def _execute_two_phase_restore() -> Dict[str, Any]:
        with get_db_connection() as conn:
            if not conn:
                raise RuntimeError("PostgreSQL database connection pool unavailable.")
            import psycopg2.extras
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                written_report_ids: Set[Any] = set()
                skipped_report_ids: Set[Any] = set()
                written_sync_run_ids: Set[Any] = set()
                skipped_sync_run_ids: Set[Any] = set()
                restored_counts: Dict[str, int] = {}

                # ------------------------------------------------------------
                # PHASE 1: Restore Tiers 1-3 in Forward Dependency Order
                # ------------------------------------------------------------
                tier_1_3_tables = [t for t in BACKUP_TABLES if t not in CHILD_TABLES]

                for t in tier_1_3_tables:
                    rows = archive_tables.get(t, [])
                    if not rows or not isinstance(rows, list):
                        restored_counts[t] = 0
                        continue

                    # Sample first row to extract column names
                    sample_cols = [k for k in rows[0].keys() if not k.startswith("_")]
                    if not sample_cols:
                        restored_counts[t] = 0
                        continue

                    cols_sql = ", ".join([f'"{c}"' for c in sample_cols])
                    vals_placeholder = ", ".join(["%s"] * len(sample_cols))
                    is_identity_table = t in IDENTITY_TABLES
                    override_clause = "OVERRIDING SYSTEM VALUE" if is_identity_table else ""

                    # (A) Special Parent 1: daily_field_reports
                    if t == "daily_field_reports":
                        update_cols = [c for c in sample_cols if c != "id"]
                        update_set_sql = ", ".join([f'"{c}" = EXCLUDED."{c}"' for c in update_cols])
                        sql = f"""
                            INSERT INTO "{t}" ({cols_sql})
                            {override_clause}
                            VALUES ({vals_placeholder})
                            ON CONFLICT (id) DO UPDATE SET
                                {update_set_sql}
                            WHERE COALESCE(EXCLUDED.last_edited_at, EXCLUDED.created_at) >=
                                  COALESCE("{t}".last_edited_at, "{t}".created_at)
                            RETURNING id;
                        """
                        t_written = 0
                        for row in rows:
                            row_vals = [row.get(c) for c in sample_cols]
                            cur.execute(sql, row_vals)
                            res = cur.fetchone()
                            if res and res.get("id"):
                                written_report_ids.add(res["id"])
                                t_written += 1
                            else:
                                skipped_report_ids.add(row.get("id"))
                        restored_counts[t] = t_written

                    # (B) Special Parent 2: nikshay_sync_runs
                    elif t == "nikshay_sync_runs":
                        update_cols = [c for c in sample_cols if c != "id"]
                        update_set_sql = ", ".join([f'"{c}" = EXCLUDED."{c}"' for c in update_cols])
                        sql = f"""
                            INSERT INTO "{t}" ({cols_sql})
                            {override_clause}
                            VALUES ({vals_placeholder})
                            ON CONFLICT (id) DO UPDATE SET
                                {update_set_sql}
                            WHERE EXCLUDED.synced_at >= "{t}".synced_at
                            RETURNING id;
                        """
                        t_written = 0
                        for row in rows:
                            row_vals = [row.get(c) for c in sample_cols]
                            cur.execute(sql, row_vals)
                            res = cur.fetchone()
                            if res and res.get("id"):
                                written_sync_run_ids.add(res["id"])
                                t_written += 1
                            else:
                                skipped_sync_run_ids.add(row.get("id"))
                        restored_counts[t] = t_written

                    # (C) Group A: Timestamp Guard Pattern
                    elif t in GROUP_A_TABLES:
                        update_cols = [c for c in sample_cols if c != "id"]
                        update_set_sql = ", ".join([f'"{c}" = EXCLUDED."{c}"' for c in update_cols])
                        sql = f"""
                            INSERT INTO "{t}" ({cols_sql})
                            {override_clause}
                            VALUES ({vals_placeholder})
                            ON CONFLICT (id) DO UPDATE SET
                                {update_set_sql}
                            WHERE COALESCE(EXCLUDED.updated_at, '1970-01-01'::timestamptz) >= COALESCE("{t}".updated_at, '1970-01-01'::timestamptz)
                            RETURNING id;
                        """
                        t_written = 0
                        for row in rows:
                            row_vals = [row.get(c) for c in sample_cols]
                            cur.execute(sql, row_vals)
                            if cur.fetchone():
                                t_written += 1
                        restored_counts[t] = t_written

                    # (D) Group B: Insert-if-Missing Pattern (ON CONFLICT (id) DO NOTHING)
                    else:
                        sql = f"""
                            INSERT INTO "{t}" ({cols_sql})
                            {override_clause}
                            VALUES ({vals_placeholder})
                            ON CONFLICT (id) DO NOTHING
                            RETURNING id;
                        """
                        t_written = 0
                        for row in rows:
                            row_vals = [row.get(c) for c in sample_cols]
                            cur.execute(sql, row_vals)
                            if cur.fetchone():
                                t_written += 1
                        restored_counts[t] = t_written

                # ------------------------------------------------------------
                # PHASE 2: Restore Tier 4 Child Tables (Derived Acceptance)
                # ------------------------------------------------------------
                for t in ["report_kpi_entries", "report_fdc_details", "report_visited_names", "nikshay_sync_flagged_records", "nikshay_sync_grace_records"]:
                    rows = archive_tables.get(t, [])
                    if not rows or not isinstance(rows, list):
                        restored_counts[t] = 0
                        continue

                    # Filter eligible rows derived strictly from Phase 1 parent acceptance
                    if t in ("report_kpi_entries", "report_fdc_details", "report_visited_names"):
                        eligible_rows = [r for r in rows if r.get("report_id") in written_report_ids]
                    else:
                        eligible_rows = [r for r in rows if r.get("sync_run_id") in written_sync_run_ids]

                    if not eligible_rows:
                        restored_counts[t] = 0
                        continue

                    sample_cols = [k for k in eligible_rows[0].keys() if not k.startswith("_")]
                    cols_sql = ", ".join([f'"{c}"' for c in sample_cols])
                    vals_placeholder = ", ".join(["%s"] * len(sample_cols))
                    update_cols = [c for c in sample_cols if c != "id"]
                    update_set_sql = ", ".join([f'"{c}" = EXCLUDED."{c}"' for c in update_cols])

                    # Resolution 1: UPSERT-only semantics, NEVER delete
                    sql = f"""
                        INSERT INTO "{t}" ({cols_sql})
                        OVERRIDING SYSTEM VALUE
                        VALUES ({vals_placeholder})
                        ON CONFLICT (id) DO UPDATE SET
                            {update_set_sql};
                    """
                    t_written = 0
                    for row in eligible_rows:
                        row_vals = [row.get(c) for c in sample_cols]
                        cur.execute(sql, row_vals)
                        t_written += 1
                    restored_counts[t] = t_written

                # ------------------------------------------------------------
                # Resolution 3: Sequence Resynchronization for 17 Identity Tables
                # ------------------------------------------------------------
                for seq_table in IDENTITY_TABLES:
                    try:
                        cur.execute(f"""
                            SELECT setval(
                                pg_get_serial_sequence('{seq_table}', 'id'),
                                COALESCE((SELECT MAX(id) FROM "{seq_table}"), 1)
                            );
                        """)
                    except Exception as seq_err:
                        logger.warning(f"[Restore Notice] Could not resync sequence for {seq_table}: {seq_err}")

                conn.commit()
                return {
                    "restored_counts": restored_counts,
                    "written_report_ids_count": len(written_report_ids),
                    "skipped_report_ids_count": len(skipped_report_ids),
                    "written_sync_run_ids_count": len(written_sync_run_ids),
                    "skipped_sync_run_ids_count": len(skipped_sync_run_ids),
                }

    try:
        with hold_advisory_lock(BACKUP_ADVISORY_LOCK_ID):
            restore_result = await asyncio.to_thread(_execute_two_phase_restore)

        cache.clear()

        total_restored = sum(restore_result["restored_counts"].values())

        await log_admin_activity(
            action_type="DATABASE_RESTORE_COMPLETED",
            details=f"Full database disaster restore executed from {clean_name}: {total_restored} records merged across 19 tables.",
            user_name=admin.get("name") or admin.get("username", "Super Admin"),
            user_id=admin.get("user_id") or admin.get("username", "admin"),
            role="SUPER_ADMIN"
        )

        return {
            "success": True,
            "message": f"Database successfully restored from snapshot {clean_name}!",
            "restored_documents": total_restored,  # Required by useAdminModals.js line 451
            "restored_tables_count": len(BACKUP_TABLES),
            "details": restore_result
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[Disaster Restore Error]")
        raise HTTPException(status_code=500, detail=f"Restore operation error: {str(e)}")


# ============================================================================
# ENDPOINT 6: GET /admin/system/storage-health
# ============================================================================

@router.get("/admin/system/storage-health")
async def get_storage_health(admin: dict = Depends(get_current_admin)):
    """
    Returns live PostgreSQL storage footprint across all tables
    using pg_stat_user_tables and pg_total_relation_size.
    Rebuilt per docs/backup_rebuild_design.md Section 6.
    """
    try:
        sql = """
            SELECT 
                relname AS table_name,
                COALESCE(n_live_tup, 0) AS estimated_rows,
                pg_total_relation_size(relid) AS total_bytes
            FROM pg_stat_user_tables
            ORDER BY total_bytes DESC;
        """
        rows = pg_execute_raw(sql, fetch=True) or []

        table_stats = []
        total_records = 0
        total_bytes = 0

        for r in rows:
            t_name = r.get("table_name", "")
            t_rows = int(r.get("estimated_rows") or 0)
            t_bytes = int(r.get("total_bytes") or 0)

            total_records += t_rows
            total_bytes += t_bytes
            table_stats.append({
                "table": t_name,
                "rows": t_rows,
                "size_mb": round(t_bytes / (1024 * 1024), 2),
            })

        database_size_mb = round(total_bytes / (1024 * 1024), 2)
        free_tier_limit_mb = 500.0
        capacity_used_pct = round((database_size_mb / free_tier_limit_mb) * 100, 2)

        # Query latest backup status from admin_audit_logs
        last_backup_info = {
            "status": "NONE",
            "timestamp_ist": "N/A",
            "archive_filename": "None",
            "size_mb": 0.0,
        }
        try:
            audit_sql = """
                SELECT action_type, details, occurred_at
                FROM admin_audit_logs
                WHERE action_type IN ('DATABASE_BACKUP_AUTO', 'DATABASE_BACKUP_MANUAL', 'DATABASE_BACKUP_FAILED')
                ORDER BY id DESC
                LIMIT 1;
            """
            recent_audit = pg_execute_raw(audit_sql, fetch=True)
            if recent_audit:
                log_entry = recent_audit[0]
                action = log_entry.get("action_type", "")
                status_val = "SUCCESS" if action != "DATABASE_BACKUP_FAILED" else "FAILED"
                dt = log_entry.get("occurred_at")
                last_backup_info["status"] = status_val
                last_backup_info["timestamp_ist"] = dt.strftime("%Y-%m-%d %I:%M:%S %p") if isinstance(dt, datetime) else str(dt or "N/A")
                details_text = str(log_entry.get("details", ""))
                # Extract filename if present
                for token in details_text.split():
                    if token.startswith("backup_") and token.endswith(".json.gz"):
                        last_backup_info["archive_filename"] = token
        except Exception as audit_err:
            logger.debug(f"[Storage Health] Audit log query notice: {audit_err}")

        is_healthy = capacity_used_pct < 80.0 and last_backup_info["status"] != "FAILED"

        return {
            "status": "HEALTHY" if is_healthy else "ATTENTION NEEDED",
            "total_tables": len(table_stats),
            "total_records": total_records,
            "database_size_mb": database_size_mb,
            "supabase_free_tier_limit_mb": free_tier_limit_mb,
            "capacity_used_pct": capacity_used_pct,
            "last_backup": last_backup_info,
            "tables": table_stats,
            "timestamp": get_ist_now().strftime("%Y-%m-%d %H:%M:%S"),
        }
    except Exception as e:
        logger.exception("[Storage Health Error]")
        raise HTTPException(status_code=500, detail=str(e))
