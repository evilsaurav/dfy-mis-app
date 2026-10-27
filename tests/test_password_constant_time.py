import sys
from pathlib import Path
import pytest
import bcrypt

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from backend.core.security import verify_password, hash_password

def test_verify_password_bcrypt():
    """Verify that bcrypt hashes match correctly and invalid passwords fail."""
    pw = "SuperSecureDFY2026!"
    hashed = hash_password(pw)
    assert hashed.startswith(("$2b$", "$2a$"))

    # Correct password
    assert verify_password(pw, hashed) is True
    # Wrong password
    assert verify_password("WrongPassword123", hashed) is False
    # Empty inputs
    assert verify_password("", hashed) is False
    assert verify_password(pw, "") is False

def test_verify_password_plaintext_constant_time():
    """Verify backward compatibility with plaintext credentials using constant-time comparison."""
    plain = "legacy_secret_pin_123"
    assert verify_password(plain, plain) is True
    assert verify_password("wrong_pin", plain) is False
    assert verify_password(plain, "wrong_pin") is False

def test_verify_password_whitespace_tolerance():
    """Verify that leading/trailing whitespaces are stripped cleanly before comparison."""
    pw = "testpin99"
    assert verify_password("  testpin99  ", pw) is True
    assert verify_password(pw, "  testpin99  ") is True
