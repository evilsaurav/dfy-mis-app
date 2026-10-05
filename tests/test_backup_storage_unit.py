"""
Unit tests for backend/core/backup_storage.py.

Runs in complete isolation with zero real network calls or credentials.
Uses mocks to verify the abstraction layer, GoogleDriveProvider, retry logic,
exception wrapping, pagination, and factory function.
"""

import io
import os
import sys
import json
import socket
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone, timedelta
from googleapiclient.errors import HttpError
from httplib2 import Response

from backend.core.backup_storage import (
    BackupStorageError,
    BackupStorageProvider,
    GoogleDriveProvider,
    get_storage_provider,
)


def make_http_error(status_code: int, reason: str = "Test Error") -> HttpError:
    """Helper to construct googleapiclient HttpError."""
    resp = Response({"status": str(status_code), "reason": reason})
    resp.status = status_code
    return HttpError(resp, b'{"error": {"message": "Test Error"}}')


class TestBackupStorageError:
    def test_error_attributes_and_formatting(self):
        orig = socket.timeout("timed out")
        err = BackupStorageError(
            operation="upload",
            provider="gdrive",
            message="Connection failed",
            original_error=orig,
            remote_id="file_abc_123",
        )
        assert err.operation == "upload"
        assert err.provider == "gdrive"
        assert err.message == "Connection failed"
        assert err.original_error is orig
        assert err.remote_id == "file_abc_123"
        assert "[GDRIVE UPLOAD FAILED] Connection failed" in str(err)
        assert "timed out" in str(err).lower() or "timeout" in str(err).lower()


class TestGoogleDriveProviderInit:
    def test_init_missing_env_vars_raises_value_error(self, monkeypatch):
        # Clear all GDRIVE env vars
        monkeypatch.delenv("GDRIVE_CLIENT_ID", raising=False)
        monkeypatch.delenv("GDRIVE_CLIENT_SECRET", raising=False)
        monkeypatch.delenv("GDRIVE_REFRESH_TOKEN", raising=False)
        monkeypatch.delenv("GDRIVE_FOLDER_ID", raising=False)

        with pytest.raises(ValueError) as excinfo:
            GoogleDriveProvider()

        msg = str(excinfo.value)
        assert "Missing required Google Drive configuration" in msg
        assert "GDRIVE_CLIENT_ID" in msg
        assert "GDRIVE_CLIENT_SECRET" in msg
        assert "GDRIVE_REFRESH_TOKEN" in msg
        assert "GDRIVE_FOLDER_ID" in msg

    def test_init_with_explicit_arguments_succeeds(self, monkeypatch):
        monkeypatch.delenv("GDRIVE_CLIENT_ID", raising=False)
        provider = GoogleDriveProvider(
            client_id="test_client_id",
            client_secret="test_secret",
            refresh_token="test_refresh",
            folder_id="test_folder",
        )
        assert provider.client_id == "test_client_id"
        assert provider.client_secret == "test_secret"
        assert provider.refresh_token == "test_refresh"
        assert provider.folder_id == "test_folder"

    def test_init_with_env_vars_succeeds(self, monkeypatch):
        monkeypatch.setenv("GDRIVE_CLIENT_ID", "env_cid")
        monkeypatch.setenv("GDRIVE_CLIENT_SECRET", "env_csec")
        monkeypatch.setenv("GDRIVE_REFRESH_TOKEN", "env_rtoken")
        monkeypatch.setenv("GDRIVE_FOLDER_ID", "env_fid")

        provider = GoogleDriveProvider()
        assert provider.client_id == "env_cid"
        assert provider.folder_id == "env_fid"


@pytest.mark.asyncio
class TestGoogleDriveProviderOperations:
    @pytest.fixture
    def mock_service(self):
        return MagicMock()

    @pytest.fixture
    def provider(self, mock_service):
        return GoogleDriveProvider(
            client_id="cid",
            client_secret="csec",
            refresh_token="rtoken",
            folder_id="fid_123",
            service=mock_service,
            retry_initial_delay=0.001,  # Fast tests
            max_retries=3,
        )

    async def test_upload_success(self, provider, mock_service):
        mock_create = MagicMock()
        mock_create.execute.return_value = {
            "id": "drive_file_999",
            "name": "backup_2026-10-06.json.gz",
        }
        mock_service.files().create.return_value = mock_create

        test_data = b"compressed-gzip-bytes-12345"
        remote_id = await provider.upload(
            test_data,
            "backup_2026-10-06.json.gz",
            metadata={"source": "pytest", "version": "1.0"},
        )

        assert remote_id == "drive_file_999"
        mock_service.files().create.assert_called_once()
        call_kwargs = mock_service.files().create.call_args[1]
        assert call_kwargs["body"]["name"] == "backup_2026-10-06.json.gz"
        assert call_kwargs["body"]["parents"] == ["fid_123"]
        assert "pytest" in call_kwargs["body"]["description"]

    async def test_upload_retry_on_transient_error(self, provider, mock_service):
        mock_create = MagicMock()
        # First call fails with 503, second succeeds
        mock_create.execute.side_effect = [
            make_http_error(503, "Service Unavailable"),
            {"id": "drive_file_retry_success"},
        ]
        mock_service.files().create.return_value = mock_create

        remote_id = await provider.upload(b"data", "backup.json.gz")
        assert remote_id == "drive_file_retry_success"
        assert mock_create.execute.call_count == 2

    async def test_upload_retry_exhaustion_raises_backup_storage_error(self, provider, mock_service):
        mock_create = MagicMock()
        # Simulate 3 consecutive 503 transient errors (exhausting max_retries=3)
        mock_create.execute.side_effect = [
            make_http_error(503, "Service Unavailable Attempt 1"),
            make_http_error(503, "Service Unavailable Attempt 2"),
            make_http_error(503, "Service Unavailable Attempt 3"),
        ]
        mock_service.files().create.return_value = mock_create

        with pytest.raises(BackupStorageError) as excinfo:
            await provider.upload(b"test_payload", "backup.json.gz")

        # (a) Raises BackupStorageError (not raw HttpError)
        assert isinstance(excinfo.value, BackupStorageError)
        # (b) Underlying call was attempted exactly max_retries times
        assert mock_create.execute.call_count == provider.max_retries
        assert mock_create.execute.call_count == 3
        # (c) Operation field is 'upload'
        assert excinfo.value.operation == "upload"
        assert excinfo.value.provider == "gdrive"

    async def test_upload_fatal_error_raises_backup_storage_error(self, provider, mock_service):
        mock_create = MagicMock()
        mock_create.execute.side_effect = make_http_error(403, "Forbidden")
        mock_service.files().create.return_value = mock_create

        with pytest.raises(BackupStorageError) as excinfo:
            await provider.upload(b"data", "backup.json.gz")

        assert excinfo.value.operation == "upload"
        assert excinfo.value.provider == "gdrive"
        assert "403" in str(excinfo.value)
        # 403 is non-transient, should NOT retry
        assert mock_create.execute.call_count == 1

    async def test_list_backups_with_pagination(self, provider, mock_service):
        mock_list = MagicMock()
        # Page 1 has token, Page 2 ends
        mock_list.execute.side_effect = [
            {
                "files": [
                    {
                        "id": "file_1",
                        "name": "backup_2026-10-05.json.gz",
                        "size": "1048576",
                        "createdTime": "2026-10-05T02:00:00Z",
                    }
                ],
                "nextPageToken": "page_2_tok",
            },
            {
                "files": [
                    {
                        "id": "file_2",
                        "name": "backup_2026-10-04.json.gz",
                        "size": "2097152",
                        "createdTime": "2026-10-04T02:00:00Z",
                    }
                ],
                "nextPageToken": None,
            },
        ]
        mock_service.files().list.return_value = mock_list

        backups = await provider.list_backups()

        assert len(backups) == 2
        assert backups[0]["remote_id"] == "file_1"
        assert backups[0]["filename"] == "backup_2026-10-05.json.gz"
        assert backups[0]["size_bytes"] == 1048576
        assert backups[0]["source"] == "gdrive"

        assert backups[1]["remote_id"] == "file_2"
        assert backups[1]["size_bytes"] == 2097152
        assert mock_list.execute.call_count == 2

    async def test_download_by_remote_id_success(self, provider, mock_service):
        expected_bytes = b"sample-decompressed-database-data"

        with patch("backend.core.backup_storage.MediaIoBaseDownload") as mock_downloader_cls:
            mock_downloader_instance = MagicMock()

            def fake_next_chunk():
                return MagicMock(), True  # done = True

            mock_downloader_instance.next_chunk.side_effect = fake_next_chunk

            # Hook into fh buffer write
            def mock_init(fh, request):
                fh.write(expected_bytes)

            mock_downloader_cls.side_effect = lambda fh, req: (mock_init(fh, req), mock_downloader_instance)[1]

            downloaded = await provider.download("drive_file_999")
            assert downloaded == expected_bytes
            mock_service.files().get_media.assert_called_with(fileId="drive_file_999")

    async def test_download_by_filename_resolves_id(self, provider, mock_service):
        expected_bytes = b"resolved-filename-data"

        # Mock filename resolution
        mock_list = MagicMock()
        mock_list.execute.return_value = {
            "files": [{"id": "resolved_id_777", "name": "backup_yesterday.json.gz"}]
        }
        mock_service.files().list.return_value = mock_list

        with patch("backend.core.backup_storage.MediaIoBaseDownload") as mock_downloader_cls:
            mock_downloader_instance = MagicMock()
            mock_downloader_instance.next_chunk.return_value = (MagicMock(), True)

            def mock_init(fh, request):
                fh.write(expected_bytes)

            mock_downloader_cls.side_effect = lambda fh, req: (mock_init(fh, req), mock_downloader_instance)[1]

            downloaded = await provider.download("backup_yesterday.json.gz")
            assert downloaded == expected_bytes
            mock_service.files().get_media.assert_called_with(fileId="resolved_id_777")

    async def test_download_retry_on_transient_error(self, provider, mock_service):
        expected_bytes = b"retry-downloaded-bytes"

        with patch("backend.core.backup_storage.MediaIoBaseDownload") as mock_downloader_cls:
            mock_downloader_instance = MagicMock()
            call_count = 0

            def fake_next_chunk():
                nonlocal call_count
                call_count += 1
                if call_count == 1:
                    raise socket.timeout("Read timed out")
                return MagicMock(), True

            mock_downloader_instance.next_chunk.side_effect = fake_next_chunk

            def mock_init(fh, request):
                fh.write(expected_bytes)

            mock_downloader_cls.side_effect = lambda fh, req: (mock_init(fh, req), mock_downloader_instance)[1]

            downloaded = await provider.download("file_id_123")
            assert downloaded == expected_bytes
            assert call_count == 2

    async def test_delete_success(self, provider, mock_service):
        mock_delete = MagicMock()
        mock_delete.execute.return_value = {}
        mock_service.files().delete.return_value = mock_delete

        result = await provider.delete("file_to_delete")
        assert result is True
        mock_service.files().delete.assert_called_with(fileId="file_to_delete")

    async def test_delete_404_returns_false(self, provider, mock_service):
        mock_delete = MagicMock()
        mock_delete.execute.side_effect = make_http_error(404, "File Not Found")
        mock_service.files().delete.return_value = mock_delete

        result = await provider.delete("non_existent_file")
        assert result is False

    async def test_delete_error_raises_backup_storage_error(self, provider, mock_service):
        mock_delete = MagicMock()
        mock_delete.execute.side_effect = make_http_error(403, "Access Denied")
        mock_service.files().delete.return_value = mock_delete

        with pytest.raises(BackupStorageError) as excinfo:
            await provider.delete("file_123")

        assert excinfo.value.operation == "delete"
        assert excinfo.value.provider == "gdrive"

    async def test_prune_older_than(self, provider, monkeypatch):
        now = datetime.now(timezone.utc)
        t_40_days_ago = (now - timedelta(days=40)).isoformat()
        t_35_days_ago = (now - timedelta(days=35)).isoformat()
        t_5_days_ago = (now - timedelta(days=5)).isoformat()

        fake_backups = [
            {"remote_id": "old_1", "created_at": t_40_days_ago},
            {"remote_id": "old_2", "created_at": t_35_days_ago},
            {"remote_id": "recent_1", "created_at": t_5_days_ago},
            {"remote_id": "no_date", "created_at": None},
        ]

        deleted_ids = []

        async def fake_list():
            return fake_backups

        async def fake_delete(remote_id):
            deleted_ids.append(remote_id)
            return True

        monkeypatch.setattr(provider, "list_backups", fake_list)
        monkeypatch.setattr(provider, "delete", fake_delete)

        pruned = await provider.prune_older_than(retention_days=30)
        assert pruned == 2
        assert deleted_ids == ["old_1", "old_2"]


class TestStorageProviderFactory:
    def test_factory_returns_gdrive(self, monkeypatch):
        monkeypatch.setenv("GDRIVE_CLIENT_ID", "cid")
        monkeypatch.setenv("GDRIVE_CLIENT_SECRET", "csec")
        monkeypatch.setenv("GDRIVE_REFRESH_TOKEN", "rtoken")
        monkeypatch.setenv("GDRIVE_FOLDER_ID", "fid")

        provider = get_storage_provider("gdrive")
        assert isinstance(provider, GoogleDriveProvider)
        assert isinstance(provider, BackupStorageProvider)

    def test_factory_defaults_to_env_or_gdrive(self, monkeypatch):
        monkeypatch.setenv("GDRIVE_CLIENT_ID", "cid")
        monkeypatch.setenv("GDRIVE_CLIENT_SECRET", "csec")
        monkeypatch.setenv("GDRIVE_REFRESH_TOKEN", "rtoken")
        monkeypatch.setenv("GDRIVE_FOLDER_ID", "fid")
        monkeypatch.delenv("BACKUP_STORAGE_BACKEND", raising=False)

        provider = get_storage_provider()
        assert isinstance(provider, GoogleDriveProvider)

    def test_factory_unsupported_raises_value_error(self):
        with pytest.raises(ValueError) as excinfo:
            get_storage_provider("s3")
        assert "Unsupported backup storage backend" in str(excinfo.value)

    def test_factory_supabase_not_implemented(self):
        with pytest.raises(NotImplementedError) as excinfo:
            get_storage_provider("supabase")
        assert "SupabaseStorageProvider is not yet implemented" in str(excinfo.value)
