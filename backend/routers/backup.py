import os
import io
import json
import gzip
import asyncio
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from firebase_admin import storage

from backend.core.database import db
from backend.core.cache import cache
from backend.core.security import get_current_admin, require_super_admin
from backend.core.helpers import log_admin_activity

router = APIRouter(tags=["backup"])

BACKUP_BUCKET_NAME = os.environ.get("BACKUP_BUCKET_NAME", "dfy-mis-backups-2026")
BACKUP_RETENTION_DAYS = 30
BACKUP_COLLECTIONS = [
    "daily_field_reports",
    "daily_district_rollups",
    "staff_directory",
    "staff_targets",
    "admin_users",
    "broadcast_alerts",
    "nikshay_verified_patients",
    "admin_audit_logs",
    "id_edit_logs",
    "admin_config"
]

_last_backup_check_date = ""
_backup_in_progress = False

def get_backup_storage_bucket():
    """Returns the Google Cloud Storage bucket object for backups."""
    try:
        return storage.bucket(BACKUP_BUCKET_NAME)
    except Exception as e:
        print(f"[Cloud Backup Error] Failed to connect to bucket {BACKUP_BUCKET_NAME}: {e}")
        return None

def _sync_create_database_snapshot(source: str = "automated_daily") -> dict:
    """
    Synchronous worker executing in a background thread (asyncio.to_thread).
    Streams all Firestore collections, formats document payloads,
    compresses into GZip JSON archive (~32KB - 95KB), uploads to Google Cloud Storage (Mumbai),
    and auto-prunes backups older than 30 days.
    """
    ist_now = datetime.utcnow() + timedelta(hours=5, minutes=30)
    ist_date_str = ist_now.strftime("%Y-%m-%d")
    ist_time_str = ist_now.strftime("%Y-%m-%d %I:%M:%S %p")
    timestamp_compact = ist_now.strftime("%Y%m%d_%H%M%S")
    
    if source == "automated_daily":
        filename = f"backup_{ist_date_str}.json.gz"
        blob_path = f"daily_backups/{filename}"
    else:
        filename = f"backup_manual_{ist_date_str}_{timestamp_compact}.json.gz"
        blob_path = f"manual_backups/{filename}"

    collections_data = {}
    counts = {}
    total_docs = 0

    for col_name in BACKUP_COLLECTIONS:
        try:
            col_ref = db.collection(col_name)
            docs = list(col_ref.stream())
            doc_list = []
            for doc in docs:
                doc_list.append({"_doc_id": doc.id, "data": doc.to_dict()})
            collections_data[col_name] = doc_list
            counts[col_name] = len(doc_list)
            total_docs += len(doc_list)
        except Exception as col_err:
            print(f"[Cloud Backup] Warning dumping collection {col_name}: {col_err}")
            collections_data[col_name] = []
            counts[col_name] = 0

    snapshot = {
        "metadata": {
            "version": "1.0",
            "backup_source": source,
            "created_at_utc": datetime.utcnow().isoformat() + "Z",
            "created_at_ist": ist_time_str,
            "backup_date": ist_date_str,
            "filename": filename,
            "counts": counts,
            "total_documents": total_docs
        },
        "collections": collections_data
    }

    json_bytes = json.dumps(snapshot, default=str, ensure_ascii=False).encode("utf-8")
    uncompressed_size = len(json_bytes)
    compressed_bytes = gzip.compress(json_bytes, compresslevel=6)
    compressed_size = len(compressed_bytes)

    bucket = get_backup_storage_bucket()
    if not bucket:
        raise RuntimeError("Google Cloud Storage backup bucket is unavailable.")

    blob = bucket.blob(blob_path)
    blob.metadata = {
        "backup_date": ist_date_str,
        "backup_source": source,
        "total_documents": str(total_docs),
        "uncompressed_bytes": str(uncompressed_size),
        "compressed_bytes": str(compressed_size)
    }
    blob.upload_from_string(compressed_bytes, content_type="application/gzip")

    # Auto-prune backups older than BACKUP_RETENTION_DAYS (Mumbai bucket)
    pruned_count = 0
    try:
        cutoff_date = (ist_now - timedelta(days=BACKUP_RETENTION_DAYS)).strftime("%Y-%m-%d")
        all_blobs = bucket.list_blobs(prefix="daily_backups/")
        for b in all_blobs:
            b_name = os.path.basename(b.name)
            if b_name.startswith("backup_") and b_name.endswith(".json.gz"):
                date_part = b_name.replace("backup_", "").replace(".json.gz", "")
                if date_part < cutoff_date:
                    b.delete()
                    pruned_count += 1
    except Exception as prune_err:
        print(f"[Cloud Backup Pruning Warning] {prune_err}")

    return {
        "filename": filename,
        "blob_path": blob_path,
        "total_documents": total_docs,
        "counts": counts,
        "size_kb": round(compressed_size / 1024, 2),
        "uncompressed_kb": round(uncompressed_size / 1024, 2),
        "created_at": ist_time_str,
        "pruned_old_backups": pruned_count
    }

async def check_and_trigger_daily_backup():
    """
    Called by background scheduler or on-demand trigger.
    Checks if today's automated backup has already run. If not, runs it.
    """
    global _last_backup_check_date, _backup_in_progress
    if _backup_in_progress:
        return
    ist_today = (datetime.utcnow() + timedelta(hours=5, minutes=30)).strftime("%Y-%m-%d")
    if _last_backup_check_date == ist_today:
        return

    _backup_in_progress = True
    try:
        bucket = get_backup_storage_bucket()
        if not bucket:
            return
        
        target_filename = f"backup_{ist_today}.json.gz"
        blob = bucket.blob(f"daily_backups/{target_filename}")
        exists = await asyncio.to_thread(blob.exists)
        
        if not exists:
            result = await asyncio.to_thread(_sync_create_database_snapshot, source="automated_daily")
            print(f"[Cloud Backup Success] Automatically captured daily backup: {result['filename']} ({result['size_kb']} KB)")
            await log_admin_activity(
                action_type="DATABASE_BACKUP_AUTO",
                details=f"Automated daily cloud backup completed: {result['filename']} ({result['size_kb']} KB, {result['total_documents']} documents)",
                user_name="System Watchdog",
                user_id="system",
                role="SYSTEM"
            )
        _last_backup_check_date = ist_today
    except Exception as e:
        print(f"[Cloud Backup Auto-Trigger Notice] {e}")
    finally:
        _backup_in_progress = False

def ensure_daily_backup_scheduled():
    """
    Zero-overhead hook called on key requests.
    If today's backup has not yet been processed, kicks off non-blocking background task.
    """
    global _last_backup_check_date, _backup_in_progress
    ist_today = (datetime.utcnow() + timedelta(hours=5, minutes=30)).strftime("%Y-%m-%d")
    if _last_backup_check_date != ist_today and not _backup_in_progress:
        asyncio.create_task(check_and_trigger_daily_backup())

@router.get("/admin/system/storage-health")
async def get_storage_health(admin: dict = Depends(get_current_admin)):
    """
    Returns document count and estimated storage footprint across collections
    to verify database remains safely under the 1 GB storage threshold.
    """
    try:
        collections = ["daily_field_reports", "daily_district_rollups", "staff_directory", "staff_targets", "admin_audit_logs", "id_edit_logs", "nikshay_verified_patients"]
        counts = {}
        for c in collections:
            try:
                coll_ref = db.collection(c)
                count_query = coll_ref.count()
                count_res = await asyncio.to_thread(count_query.get)
                counts[c] = count_res[0][0].value
            except Exception:
                counts[c] = "N/A"
                
        total_docs = sum(v for v in counts.values() if isinstance(v, int))
        estimated_mb = round((total_docs * 2.0) / 1024, 2)
        
        return {
            "counts": counts,
            "total_documents": total_docs,
            "estimated_storage_mb": estimated_mb,
            "storage_limit_mb": 1024,
            "status": "HEALTHY (< 1GB)" if estimated_mb < 800 else "ATTENTION NEEDED",
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/admin/backup/status")
async def get_backup_status(admin: dict = Depends(require_super_admin)):
    """
    Returns live backup status from Google Cloud Storage (Mumbai).
    Restricted strictly to SUPER_ADMIN.
    """
    try:
        bucket = get_backup_storage_bucket()
        if not bucket:
            raise HTTPException(status_code=500, detail="Google Cloud Storage backup bucket is inaccessible.")

        ist_now = datetime.utcnow() + timedelta(hours=5, minutes=30)
        ist_today = ist_now.strftime("%Y-%m-%d")

        def _fetch_backup_blobs():
            daily_blobs = list(bucket.list_blobs(prefix="daily_backups/"))
            manual_blobs = list(bucket.list_blobs(prefix="manual_backups/"))
            all_blobs = daily_blobs + manual_blobs
            all_blobs.sort(key=lambda b: b.time_created or datetime.min, reverse=True)
            return all_blobs

        all_blobs = await asyncio.to_thread(_fetch_backup_blobs)

        backups_list = []
        today_backup_exists = False
        today_filename = f"backup_{ist_today}.json.gz"

        for b in all_blobs:
            b_name = os.path.basename(b.name)
            if not b_name.endswith(".json.gz"):
                continue
            is_today = (b_name == today_filename)
            if is_today:
                today_backup_exists = True

            meta = b.metadata or {}
            created_at = b.time_created.strftime("%Y-%m-%d %I:%M:%S %p") if b.time_created else "N/A"
            size_kb = round((b.size or 0) / 1024, 2)
            backups_list.append({
                "filename": b_name,
                "full_path": b.name,
                "size_kb": size_kb,
                "created_at": created_at,
                "source": "Automated Daily" if "daily_backups" in b.name else "Manual Admin",
                "total_documents": meta.get("total_documents", "N/A"),
                "is_today": is_today
            })

        latest_backup = backups_list[0] if backups_list else None

        return {
            "status": "ACTIVE",
            "bucket_name": BACKUP_BUCKET_NAME,
            "region": "asia-south1 (Mumbai)",
            "today_backup_completed": today_backup_exists,
            "today_backup_filename": today_filename if today_backup_exists else None,
            "last_backup_time": latest_backup["created_at"] if latest_backup else "None",
            "total_backups_count": len(backups_list),
            "retention_policy": f"{BACKUP_RETENTION_DAYS} Days Automatic Retention",
            "backups": backups_list[:30]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/backup/trigger-now")
async def trigger_manual_backup(admin: dict = Depends(require_super_admin)):
    """
    On-demand snapshot generator for Super Admin.
    Snapshots database, compresses to GZip, uploads to GCS, and writes an audit log.
    """
    try:
        admin_user = admin.get("name") or admin.get("username", "Super Admin")
        admin_id = admin.get("user_id") or admin.get("username", "admin")
        result = await asyncio.to_thread(_sync_create_database_snapshot, source="manual_superadmin")
        
        await log_admin_activity(
            action_type="DATABASE_BACKUP_MANUAL",
            details=f"Manual cloud backup generated: {result['filename']} ({result['size_kb']} KB, {result['total_documents']} docs)",
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/admin/backup/download/{filename}")
async def download_backup_file(
    filename: str,
    admin: dict = Depends(require_super_admin)
):
    """
    Streams requested backup archive directly to Super Admin.
    Strict sanitization prevents directory traversal.
    """
    try:
        clean_name = os.path.basename(filename.strip())
        if not clean_name.endswith(".json.gz"):
            raise HTTPException(status_code=400, detail="Invalid backup filename format.")

        bucket = get_backup_storage_bucket()
        if not bucket:
            raise HTTPException(status_code=500, detail="Google Cloud Storage backup bucket is inaccessible.")

        blob = await asyncio.to_thread(bucket.blob, f"daily_backups/{clean_name}")
        exists = await asyncio.to_thread(blob.exists)
        if not exists:
            blob = await asyncio.to_thread(bucket.blob, f"manual_backups/{clean_name}")
            exists = await asyncio.to_thread(blob.exists)

        if not exists:
            raise HTTPException(status_code=404, detail=f"Backup file '{clean_name}' not found in cloud storage.")

        compressed_data = await asyncio.to_thread(blob.download_as_bytes)
        
        await log_admin_activity(
            action_type="DATABASE_BACKUP_DOWNLOAD",
            details=f"Super Admin downloaded cloud backup file: {clean_name} ({len(compressed_data)/1024:.1f} KB)",
            user_name=admin.get("name") or admin.get("username", "Super Admin"),
            user_id=admin.get("user_id", "admin"),
            role="SUPER_ADMIN"
        )

        return StreamingResponse(
            io.BytesIO(compressed_data),
            media_type="application/gzip",
            headers={"Content-Disposition": f'attachment; filename="{clean_name}"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class BackupRestoreReq(BaseModel):
    filename: str
    confirmation_code: str

@router.post("/admin/backup/restore")
async def restore_database_backup(
    req: BackupRestoreReq,
    admin: dict = Depends(require_super_admin)
):
    """
    Emergency disaster recovery endpoint. Restores documents from a cloud snapshot into Firestore.
    Requires exact confirmation keyword 'RESTORE-CONFIRM'.
    """
    if req.confirmation_code != "RESTORE-CONFIRM":
        raise HTTPException(
            status_code=400, 
            detail="Disaster recovery authorization denied. Please type RESTORE-CONFIRM exactly to execute restore."
        )

    clean_name = os.path.basename(req.filename.strip())
    bucket = get_backup_storage_bucket()
    if not bucket:
        raise HTTPException(status_code=500, detail="Google Cloud Storage backup bucket is inaccessible.")

    blob = await asyncio.to_thread(bucket.blob, f"daily_backups/{clean_name}")
    exists = await asyncio.to_thread(blob.exists)
    if not exists:
        blob = await asyncio.to_thread(bucket.blob, f"manual_backups/{clean_name}")
        exists = await asyncio.to_thread(blob.exists)

    if not exists:
        raise HTTPException(status_code=404, detail=f"Backup file '{clean_name}' not found.")

    def _execute_restore():
        compressed_data = blob.download_as_bytes()
        json_str = gzip.decompress(compressed_data).decode("utf-8")
        snapshot = json.loads(json_str)
        collections = snapshot.get("collections", {})

        restored_counts = {}
        for col_name, doc_list in collections.items():
            if not isinstance(doc_list, list):
                continue
            batch = db.batch()
            batch_count = 0
            restored_col_docs = 0

            for item in doc_list:
                doc_id = item.get("_doc_id")
                data = item.get("data")
                if not doc_id or data is None:
                    continue
                doc_ref = db.collection(col_name).document(doc_id)
                batch.set(doc_ref, data, merge=True)
                batch_count += 1
                restored_col_docs += 1

                if batch_count >= 400:
                    batch.commit()
                    batch = db.batch()
                    batch_count = 0

            if batch_count > 0:
                batch.commit()

            restored_counts[col_name] = restored_col_docs

        return restored_counts

    try:
        restored = await asyncio.to_thread(_execute_restore)
        cache.clear()
        
        await log_admin_activity(
            action_type="DATABASE_RESTORE_COMPLETED",
            details=f"Full database disaster restore executed from {clean_name}: {sum(restored.values())} documents restored across {len(restored)} collections.",
            user_name=admin.get("name") or admin.get("username", "Super Admin"),
            user_id=admin.get("user_id", "admin"),
            role="SUPER_ADMIN"
        )
        return {
            "success": True,
            "message": f"Database successfully restored from snapshot {clean_name}!",
            "restored_documents": sum(restored.values()),
            "details": restored
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Restore operation error: {str(e)}")
