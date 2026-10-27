import sys
from pathlib import Path
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from main import app, create_access_token
from backend.core.security import export_rate_limiter

client = TestClient(app)

def make_admin_token(role="SUPER_ADMIN", user_id="rate_limit_admin"):
    return create_access_token({
        "user_id": user_id,
        "username": user_id,
        "name": "Rate Limit Admin",
        "role": role,
        "allowed_districts": ["All"]
    })

def test_export_rate_limiter_blocks_rapid_clicks():
    """Verify that hammering the bulk export endpoint triggers 429 Too Many Requests."""
    user_id = "test_rapid_downloader"
    token = make_admin_token(user_id=user_id)
    headers = {"Authorization": f"Bearer {token}"}
    export_rate_limiter.reset(user_id)

    with patch("backend.routers.kpi.DEFAULT_BIHAR_DISTRICTS", ["Patna"]):
        # Simulate rapid calls
        for _ in range(3):
            export_rate_limiter.record_hit(user_id)
        
        # 4th request within 15 seconds must be blocked with 429
        res = client.get("/download-all-kpi-workbooks", headers=headers)
        assert res.status_code == 429, f"Expected 429 Too Many Requests, got: {res.status_code}"
        assert "rate limit" in res.json().get("detail", "").lower() or "wait" in res.json().get("detail", "").lower()

def test_kpi_error_masking_sanitizes_stack_traces():
    """Verify that unhandled internal errors return sanitized messages rather than leaking tracebacks."""
    user_id = "test_err_masking_admin"
    token = make_admin_token(user_id=user_id)
    headers = {"Authorization": f"Bearer {token}"}
    export_rate_limiter.reset(user_id)

    # Force an unhandled exception inside the endpoint
    with patch("backend.routers.kpi.get_raw_monthly_reports", side_effect=RuntimeError("FATAL_SECRET_DB_TABLE_LEAK_ERROR_xyz123")):
        res = client.get("/download-all-kpi-workbooks?month=2026-10", headers=headers)
        assert res.status_code in [500, 429]
        if res.status_code == 500:
            body = res.text
            # The raw secret error string must NOT be leaked to the client
            assert "FATAL_SECRET_DB_TABLE_LEAK_ERROR_xyz123" not in body
