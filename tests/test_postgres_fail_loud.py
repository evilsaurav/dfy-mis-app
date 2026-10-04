import pytest
import os
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from backend.core.supabase import pg_execute_raw

def test_pg_execute_raw_raises_runtime_error_in_production_when_conn_none():
    """Verify that in non-test/production mode, pg_execute_raw raises RuntimeError loudly instead of silent failure."""
    with patch("backend.core.supabase.get_postgres_connection", return_value=None), \
         patch("backend.core.supabase.get_active_db", return_value=None), \
         patch.dict(os.environ, {"DATABASE_URL": "postgresql://test:test@aws.pooler.supabase.com:6543/postgres"}, clear=False), \
         patch("sys.modules", {k: v for k, v in sys.modules.items() if k != "pytest"}), \
         patch.dict(os.environ, {"PYTEST_CURRENT_TEST": ""}):
        
        with pytest.raises(RuntimeError, match="Database connection unavailable"):
            pg_execute_raw("SELECT * FROM staff_directory LIMIT 1", fetch=True)

def test_pg_execute_raw_raises_and_rolls_back_on_query_failure():
    """Verify that when a SQL query fails, rollback is triggered and the exception is re-raised."""
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_cur.execute.side_effect = Exception("syntax error at or near 'INVALID'")
    mock_conn.cursor.return_value.__enter__.return_value = mock_cur

    with patch("backend.core.supabase.get_postgres_connection", return_value=mock_conn):
        with pytest.raises(Exception, match="syntax error"):
            pg_execute_raw("INVALID SQL STATEMENT")
        
        # Verify rollback was called
        mock_conn.rollback.assert_called_once()
        mock_conn.close.assert_called_once()

def test_pg_execute_raw_success_commits():
    """Verify that successful queries commit and return results."""
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_cur.fetchall.return_value = [{"id": 1, "name": "Test Staff"}]
    mock_conn.cursor.return_value.__enter__.return_value = mock_cur

    with patch("backend.core.supabase.get_postgres_connection", return_value=mock_conn):
        res = pg_execute_raw("SELECT id, name FROM staff_directory", fetch=True)
        assert res == [{"id": 1, "name": "Test Staff"}]
        mock_conn.commit.assert_called_once()
        mock_conn.close.assert_called_once()
