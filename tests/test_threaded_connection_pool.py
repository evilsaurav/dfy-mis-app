import pytest
import os
import sys
import threading
from pathlib import Path
from unittest.mock import patch, MagicMock

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from backend.core.supabase import (
    get_postgres_pool,
    close_postgres_pool,
    get_db_connection,
    pg_execute_raw
)

def test_threaded_connection_pool_init_params():
    """Verify ThreadedConnectionPool initializes with minconn=2, maxconn=8 and sslmode=require."""
    mock_pool_cls = MagicMock()
    mock_pool_instance = MagicMock()
    mock_pool_instance.closed = False
    mock_pool_cls.return_value = mock_pool_instance

    with patch("psycopg2.pool.ThreadedConnectionPool", mock_pool_cls), \
         patch.dict(os.environ, {"DATABASE_URL": "postgresql://user:pass@aws.pooler.supabase.com:6543/postgres"}, clear=False), \
         patch("sys.modules", {k: v for k, v in sys.modules.items() if k != "pytest"}), \
         patch.dict(os.environ, {"PYTEST_CURRENT_TEST": ""}):
        
        # Reset any cached pool
        import backend.core.supabase as sb_mod
        sb_mod._postgres_pool = None

        p = get_postgres_pool(minconn=2, maxconn=8)
        assert p is mock_pool_instance
        mock_pool_cls.assert_called_once()
        args, kwargs = mock_pool_cls.call_args
        assert kwargs.get("minconn") == 2
        assert kwargs.get("maxconn") == 8
        assert kwargs.get("sslmode") == "require"

        close_postgres_pool()
        mock_pool_instance.closeall.assert_called_once()
        assert sb_mod._postgres_pool is None

def test_get_db_connection_context_manager_acquires_and_releases():
    """Verify get_db_connection gets conn from pool and calls putconn upon exit."""
    mock_pool = MagicMock()
    mock_pool.closed = False
    mock_conn = MagicMock()
    mock_pool.getconn.return_value = mock_conn

    with patch("backend.core.supabase.get_postgres_pool", return_value=mock_pool):
        with get_db_connection() as conn:
            assert conn is mock_conn
            mock_pool.getconn.assert_called_once()
        
        mock_pool.putconn.assert_called_once_with(mock_conn)

def test_concurrent_pool_simulation_20_threads():
    """Simulate 20 concurrent threads querying via ThreadedConnectionPool without connection leaks."""
    mock_pool = MagicMock()
    mock_pool.closed = False
    
    # Simulate available connection acquisition
    connections = [MagicMock() for _ in range(8)]
    conn_idx = 0
    lock = threading.Lock()

    def fake_getconn():
        nonlocal conn_idx
        with lock:
            c = connections[conn_idx % len(connections)]
            conn_idx += 1
            return c

    mock_pool.getconn.side_effect = fake_getconn

    errors = []
    def worker():
        try:
            with patch("backend.core.supabase.get_postgres_pool", return_value=mock_pool):
                with get_db_connection() as conn:
                    assert conn is not None
        except Exception as e:
            errors.append(e)

    threads = [threading.Thread(target=worker) for _ in range(20)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(errors) == 0
    assert mock_pool.putconn.call_count == 20
