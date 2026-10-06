"""
Storage Abstraction Layer for Postgres-Native Backups.

Provides a provider-agnostic interface (BackupStorageProvider) and a concrete
Google Drive v3 implementation (GoogleDriveProvider) using OAuth 2.0 refresh tokens.
"""

import os
import io
import json
import time
import random
import socket
import ssl
import logging
import asyncio
from abc import ABC, abstractmethod
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional, Union
from googleapiclient.http import MediaIoBaseUpload, MediaIoBaseDownload, MediaFileUpload
from googleapiclient.errors import HttpError

logger = logging.getLogger("backup_storage")


class BackupStorageError(Exception):
    """
    Standard exception raised by any BackupStorageProvider implementation.
    Enables uniform error handling and structured diagnostics in router endpoints.
    """

    def __init__(
        self,
        operation: str,                              # 'upload' | 'download' | 'list' | 'delete' | 'prune' | 'init'
        provider: str,                               # 'gdrive' | 'supabase' | 's3'
        message: str,                                # Human-readable error explanation
        original_error: Optional[Exception] = None,  # Caught underlying library exception
        remote_id: Optional[str] = None,             # Remote file ID / filename if applicable
    ):
        self.operation = operation
        self.provider = provider
        self.message = message
        self.original_error = original_error
        self.remote_id = remote_id
        underlying_desc = (
            f"{type(original_error).__name__}: {original_error}"
            if original_error is not None
            else "None"
        )
        super().__init__(
            f"[{provider.upper()} {operation.upper()} FAILED] {message} "
            f"(underlying: {underlying_desc})"
        )


class BackupStorageProvider(ABC):
    """Abstract interface defining required methods for all backup storage providers."""

    @abstractmethod
    async def upload(
        self,
        file_data: Union[bytes, str],
        filename: str,
        metadata: Optional[Dict[str, str]] = None,
    ) -> str:
        """
        Uploads archive bytes or file path.
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
        Returns True if deleted, False if not found.
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


class GoogleDriveProvider(BackupStorageProvider):
    """
    Google Drive API v3 storage provider.
    Authenticates via OAuth 2.0 refresh token under the drive.file scope.
    """

    def __init__(
        self,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        refresh_token: Optional[str] = None,
        folder_id: Optional[str] = None,
        service: Optional[Any] = None,
        retry_initial_delay: float = 2.0,
        max_retries: int = 3,
    ):
        self.client_id = (client_id or os.environ.get("GDRIVE_CLIENT_ID", "")).strip()
        self.client_secret = (client_secret or os.environ.get("GDRIVE_CLIENT_SECRET", "")).strip()
        self.refresh_token = (refresh_token or os.environ.get("GDRIVE_REFRESH_TOKEN", "")).strip()
        self.folder_id = (folder_id or os.environ.get("GDRIVE_FOLDER_ID", "")).strip()
        self._service = service
        self.retry_initial_delay = retry_initial_delay
        self.max_retries = max_retries

        if not self._service:
            missing = []
            if not self.client_id:
                missing.append("GDRIVE_CLIENT_ID")
            if not self.client_secret:
                missing.append("GDRIVE_CLIENT_SECRET")
            if not self.refresh_token:
                missing.append("GDRIVE_REFRESH_TOKEN")
            if not self.folder_id:
                missing.append("GDRIVE_FOLDER_ID")
            if missing:
                raise ValueError(
                    f"Missing required Google Drive configuration: {', '.join(missing)}"
                )

    def _get_service(self):
        """Lazily initialize Google Drive service client."""
        if self._service is not None:
            return self._service

        try:
            from google.oauth2.credentials import Credentials
            from googleapiclient.discovery import build

            creds = Credentials(
                token=None,
                refresh_token=self.refresh_token,
                token_uri="https://oauth2.googleapis.com/token",
                client_id=self.client_id,
                client_secret=self.client_secret,
                scopes=["https://www.googleapis.com/auth/drive.file"],
            )
            self._service = build("drive", "v3", credentials=creds, cache_discovery=False)
            return self._service
        except Exception as exc:
            raise BackupStorageError(
                operation="init",
                provider="gdrive",
                message=f"Failed to initialize Google Drive service: {exc}",
                original_error=exc,
            ) from exc

    def _is_transient_error(self, exc: Exception) -> bool:
        """Determines if an exception is transient and eligible for automatic retry."""
        try:
            from googleapiclient.errors import HttpError
            if isinstance(exc, HttpError):
                status = getattr(exc.resp, "status", None) or getattr(exc, "status_code", None)
                if status in (429, 500, 502, 503, 504):
                    return True
        except ImportError:
            pass

        if isinstance(exc, (socket.timeout, TimeoutError, ConnectionError, ssl.SSLError)):
            return True

        err_str = str(exc).lower()
        if any(sig in err_str for sig in ("timed out", "connection reset", "connection refused", "503", "502", "504")):
            return True

        return False

    def _execute_with_retry(self, operation: str, func, *args, **kwargs):
        """
        Executes a callable with exponential backoff and jitter for transient errors.
        3 retries with delays 2s, 4s, 8s (customizable via retry_initial_delay).
        """
        delay = self.retry_initial_delay
        for attempt in range(1, self.max_retries + 1):
            try:
                return func(*args, **kwargs)
            except Exception as exc:
                if isinstance(exc, BackupStorageError):
                    raise

                is_transient = self._is_transient_error(exc)
                if not is_transient or attempt >= self.max_retries:
                    raise BackupStorageError(
                        operation=operation,
                        provider="gdrive",
                        message=f"{operation} failed after attempt {attempt}/{self.max_retries}: {exc}",
                        original_error=exc,
                    ) from exc

                jitter = random.uniform(0.1, 0.5)
                sleep_duration = delay + jitter
                logger.warning(
                    "Google Drive %s failed with transient error (attempt %d/%d). Retrying in %.2fs: %s",
                    operation, attempt, self.max_retries, sleep_duration, exc
                )
                time.sleep(sleep_duration)
                delay *= 2.0

    def _find_file_id_by_name_sync(self, filename: str) -> Optional[str]:
        """Looks up the most recent non-trashed file in the target folder by filename."""
        try:
            service = self._get_service()
            escaped_name = filename.replace("'", "\\'")
            query = f"'{self.folder_id}' in parents and name = '{escaped_name}' and trashed = false"
            res = service.files().list(
                q=query,
                fields="files(id, name, createdTime)",
                pageSize=10,
                orderBy="createdTime desc",
            ).execute()
            files = res.get("files", [])
            if files:
                return files[0]["id"]
            return None
        except Exception as exc:
            logger.warning("Could not resolve filename '%s' in folder: %s", filename, exc)
            return None

    def _resolve_file_id_sync(self, remote_id_or_filename: str) -> str:
        """Resolves an input string that may be either a Google Drive file ID or a filename."""
        if "." in remote_id_or_filename or " " in remote_id_or_filename:
            found_id = self._find_file_id_by_name_sync(remote_id_or_filename)
            if found_id:
                return found_id
        return remote_id_or_filename

    # -------------------------------------------------------------------------
    # KNOWN & ACCEPTED LIMITATION: Idempotency & Partial-Upload Cleanup Scope
    # -------------------------------------------------------------------------
    # 1. Duplicate Creation on Ambiguous Timeout:
    #    If files().create() HTTP POST succeeds on Google's server but the client
    #    encounters a socket timeout before receiving the response, retry logic
    #    dispatches another files().create(). Drive API v3 files().create() is
    #    non-idempotent without client keys, which may produce duplicate files.
    # 2. No Client-Side Cleanup on Upload Failure:
    #    Because files().create(resumable=False) executes in a single HTTP request,
    #    the remote file ID is only returned upon HTTP 200. If upload fails mid-
    #    stream or raises an error, the client possesses no remote ID to delete.
    #
    # Mitigation path for future hardening:
    # 1. Before executing a retry, query _find_file_id_by_name_sync(filename) to check
    #    if a file with this name was already created within the last 60 seconds.
    # 2. Or migrate to resumable=True uploads (ResumableUpload) where the session
    #    URI establishes an idempotent boundary and tracks partial chunks.
    # This limitation is currently accepted as backups are timestamp-unique and
    # prune_older_than safely handles multiple files.
    # -------------------------------------------------------------------------
    def _upload_sync(
        self,
        file_data: Union[bytes, str],
        filename: str,
        metadata: Optional[Dict[str, str]] = None,
    ) -> str:
        """Synchronous implementation of archive upload."""
        service = self._get_service()

        file_metadata: Dict[str, Any] = {
            "name": filename,
            "parents": [self.folder_id],
        }
        if metadata:
            file_metadata["description"] = json.dumps(metadata)

        def _do_upload() -> str:
            # Recreate buffer/upload object on every attempt so retries read from offset 0
            if isinstance(file_data, str) and os.path.exists(file_data):
                media = MediaFileUpload(
                    file_data,
                    mimetype="application/gzip",
                    resumable=False,
                )
            else:
                bio = io.BytesIO(file_data)
                media = MediaIoBaseUpload(
                    bio,
                    mimetype="application/gzip",
                    resumable=False,
                )
            created = service.files().create(
                body=file_metadata,
                media_body=media,
                fields="id, name, size, createdTime",
            ).execute()
            return created.get("id")

        try:
            return self._execute_with_retry("upload", _do_upload)
        except Exception as exc:
            if isinstance(exc, BackupStorageError):
                raise
            raise BackupStorageError(
                operation="upload",
                provider="gdrive",
                message=f"Failed to upload {filename}: {exc}",
                original_error=exc,
            ) from exc

    def _list_sync(self) -> List[Dict[str, Any]]:
        """Synchronous implementation of listing folder contents."""
        service = self._get_service()
        try:
            query = f"'{self.folder_id}' in parents and trashed = false"
            fields = "nextPageToken, files(id, name, size, createdTime, description)"
            all_files: List[Dict[str, Any]] = []
            page_token = None

            while True:
                res = service.files().list(
                    q=query,
                    fields=fields,
                    pageSize=1000,
                    pageToken=page_token,
                    orderBy="createdTime desc",
                ).execute()

                for f in res.get("files", []):
                    size_val = f.get("size")
                    all_files.append({
                        "remote_id": f.get("id"),
                        "filename": f.get("name"),
                        "size_bytes": int(size_val) if size_val is not None else 0,
                        "created_at": f.get("createdTime"),
                        "source": "gdrive",
                    })

                page_token = res.get("nextPageToken")
                if not page_token:
                    break

            return all_files
        except Exception as exc:
            if isinstance(exc, BackupStorageError):
                raise
            raise BackupStorageError(
                operation="list",
                provider="gdrive",
                message=f"Failed to list backups: {exc}",
                original_error=exc,
            ) from exc

    def _download_sync(self, remote_id_or_filename: str) -> bytes:
        """Synchronous implementation of archive download."""
        service = self._get_service()
        file_id = self._resolve_file_id_sync(remote_id_or_filename)

        def _do_download() -> bytes:
            request = service.files().get_media(fileId=file_id)
            fh = io.BytesIO()
            downloader = MediaIoBaseDownload(fh, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()
            return fh.getvalue()

        try:
            return self._execute_with_retry("download", _do_download)
        except Exception as exc:
            if isinstance(exc, BackupStorageError):
                exc.remote_id = file_id
                raise
            raise BackupStorageError(
                operation="download",
                provider="gdrive",
                message=f"Failed to download {remote_id_or_filename}: {exc}",
                original_error=exc,
                remote_id=file_id,
            ) from exc

    def _delete_sync(self, remote_id_or_filename: str) -> bool:
        """Synchronous implementation of file deletion."""
        service = self._get_service()
        file_id = self._resolve_file_id_sync(remote_id_or_filename)

        try:
            service.files().delete(fileId=file_id).execute()
            return True
        except HttpError as http_err:
            status = getattr(http_err.resp, "status", None) or getattr(http_err, "status_code", None)
            if status == 404:
                return False
            raise BackupStorageError(
                operation="delete",
                provider="gdrive",
                message=f"Google Drive HTTP {status} deleting {remote_id_or_filename}: {http_err}",
                original_error=http_err,
                remote_id=file_id,
            ) from http_err
        except Exception as exc:
            if isinstance(exc, BackupStorageError):
                raise
            raise BackupStorageError(
                operation="delete",
                provider="gdrive",
                message=f"Failed to delete {remote_id_or_filename}: {exc}",
                original_error=exc,
                remote_id=file_id,
            ) from exc

    async def upload(
        self,
        file_data: Union[bytes, str],
        filename: str,
        metadata: Optional[Dict[str, str]] = None,
    ) -> str:
        """Uploads archive bytes or file path asynchronously via worker thread."""
        return await asyncio.to_thread(self._upload_sync, file_data, filename, metadata)

    async def list_backups(self) -> List[Dict[str, Any]]:
        """Lists available backup archives asynchronously via worker thread."""
        return await asyncio.to_thread(self._list_sync)

    async def download(self, remote_id_or_filename: str) -> bytes:
        """Downloads archive bytes asynchronously via worker thread."""
        return await asyncio.to_thread(self._download_sync, remote_id_or_filename)

    async def delete(self, remote_id_or_filename: str) -> bool:
        """Deletes a remote archive asynchronously via worker thread."""
        return await asyncio.to_thread(self._delete_sync, remote_id_or_filename)

    async def prune_older_than(self, retention_days: int = 30) -> int:
        """
        Deletes archives older than retention_days.
        Returns count of deleted archives.
        """
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
            backups = await self.list_backups()
            deleted_count = 0

            for b in backups:
                created_str = b.get("created_at")
                if not created_str:
                    continue

                try:
                    if created_str.endswith("Z"):
                        dt = datetime.fromisoformat(created_str[:-1] + "+00:00")
                    else:
                        dt = datetime.fromisoformat(created_str)
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                except Exception:
                    continue

                if dt < cutoff:
                    success = await self.delete(b["remote_id"])
                    if success:
                        deleted_count += 1

            return deleted_count
        except BackupStorageError:
            raise
        except Exception as exc:
            raise BackupStorageError(
                operation="prune",
                provider="gdrive",
                message=f"Failed to prune backups older than {retention_days} days: {exc}",
                original_error=exc,
            ) from exc


def get_storage_provider(backend: Optional[str] = None) -> BackupStorageProvider:
    """
    Factory function returning the configured backup storage provider.
    Reads BACKUP_STORAGE_BACKEND from environment (defaults to 'gdrive').
    """
    backend_name = (backend or os.environ.get("BACKUP_STORAGE_BACKEND", "gdrive")).lower().strip()
    if backend_name == "gdrive":
        return GoogleDriveProvider()
    elif backend_name == "supabase":
        raise NotImplementedError("SupabaseStorageProvider is not yet implemented.")
    else:
        raise ValueError(f"Unsupported backup storage backend: '{backend_name}'")
