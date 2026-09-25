import pytest
from fastapi.testclient import TestClient
from main import app, db

client = TestClient(app)

def test_emergency_reset_endpoint_disabled_or_removed():
    """Verify that unauthenticated emergency reset backdoor endpoint is completely removed."""
    res = client.post("/admin/auth/emergency-reset", json={
        "recovery_code": "7788",
        "new_password": "hackedpassword"
    })
    # Must return 404 Not Found since endpoint is removed
    assert res.status_code == 404, f"Expected 404 for removed endpoint, got {res.status_code}"

def test_admin_auth_settings_endpoint_removed():
    """Verify that the unauthenticated/query-param settings endpoint leaking master recovery keys is removed."""
    res = client.get("/admin/auth/settings?password=dfyadmin2026")
    assert res.status_code == 404, f"Expected 404 for removed endpoint, got {res.status_code}"

def test_no_backdoor_password_bypass_in_user_login():
    """Verify that hardcoded backdoor passwords like DFY-RESCUE-9921 do not grant instant Super Admin login."""
    res = client.post("/admin/auth/user-login", json={
        "username": "admin",
        "password": "DFY-RESCUE-9921"
    })
    # Should be 401 Unauthorized (unless the actual hashed password happens to be that, which it isn't)
    assert res.status_code in [401, 429], f"Backdoor password must not succeed! Got {res.status_code}"

def test_admin_update_credentials_requires_super_admin_auth():
    """Verify that credential updating requires an authenticated Super Admin session."""
    res = client.post("/admin/auth/update-credentials", json={
        "current_password": "wrong",
        "new_password": "newpassword123"
    })
    # Unauthenticated call must be rejected
    assert res.status_code in [401, 403], f"Unauthenticated credential update must fail! Got {res.status_code}"
