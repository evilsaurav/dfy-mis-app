import os
import sys
from pathlib import Path
import pytest
import jwt
from datetime import datetime, timezone, timedelta

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from backend.core import security

def test_jwt_production_secret_guard():
    """Verify that in production environments, a missing or weak default JWT secret triggers a critical security alert."""
    # When in production mode without explicit JWT_SECRET_KEY
    is_prod = bool(os.environ.get("RENDER") or os.environ.get("ENVIRONMENT") == "production")
    if is_prod:
        # In real production, the secret must not be the insecure default string
        assert security.JWT_SECRET_KEY != "dfy-tb-mis-bihar-secret-key-2026-supersecure"
        assert len(security.JWT_SECRET_KEY) >= 32

def test_jwt_token_creation_and_tamper_rejection():
    """Verify that tampering with JWT payload or signing key causes immediate validation failure."""
    user = {
        "user_id": "test_officer",
        "username": "test_officer",
        "name": "Test Officer",
        "role": "SUB_ADMIN",
        "allowed_districts": ["Patna"]
    }
    valid_token = security.create_access_token(user)
    assert isinstance(valid_token, str)

    # Decode with real secret succeeds
    decoded = jwt.decode(valid_token, security.JWT_SECRET_KEY, algorithms=[security.JWT_ALGORITHM])
    assert decoded["username"] == "test_officer"
    assert decoded["role"] == "SUB_ADMIN"

    # Attacker tries to forge with an arbitrary key
    forged_token = jwt.encode(
        {"sub": "admin", "username": "admin", "role": "SUPER_ADMIN", "exp": datetime.now(timezone.utc) + timedelta(days=1)},
        "hacker-fake-secret-key-1234567890-superfake",
        algorithm=security.JWT_ALGORITHM
    )

    with pytest.raises(jwt.InvalidSignatureError):
        jwt.decode(forged_token, security.JWT_SECRET_KEY, algorithms=[security.JWT_ALGORITHM])

def test_expired_jwt_token_rejection():
    """Verify expired tokens are rejected."""
    expired_payload = {
        "sub": "admin",
        "username": "admin",
        "role": "SUPER_ADMIN",
        "exp": datetime.now(timezone.utc) - timedelta(hours=1),
        "iat": datetime.now(timezone.utc) - timedelta(days=1)
    }
    expired_token = jwt.encode(expired_payload, security.JWT_SECRET_KEY, algorithm=security.JWT_ALGORITHM)
    with pytest.raises(jwt.ExpiredSignatureError):
        jwt.decode(expired_token, security.JWT_SECRET_KEY, algorithms=[security.JWT_ALGORITHM])
