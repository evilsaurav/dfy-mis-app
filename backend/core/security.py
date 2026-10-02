import os
import time
import jwt
import bcrypt
from datetime import datetime, timedelta
from typing import Optional, Dict, List
from fastapi import HTTPException, Header, Query, Depends

JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "dfy-tb-mis-bihar-secret-key-2026-supersecure")
JWT_SECRET = JWT_SECRET_KEY
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 7

def hash_password(plain: str) -> str:
    """Salted bcrypt hash for admin passwords and staff PINs."""
    if not plain:
        return ""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(str(plain).encode('utf-8'), salt).decode('utf-8')

def verify_password(plain: str, hashed_or_plain: str) -> bool:
    """Validates plain credentials against bcrypt hash or backward-compatible plaintext."""
    if not hashed_or_plain or not plain:
        return False
    str_plain = str(plain).strip()
    str_stored = str(hashed_or_plain).strip()
    if str_stored.startswith(("$2b$", "$2a$")):
        try:
            return bcrypt.checkpw(str_plain.encode('utf-8'), str_stored.encode('utf-8'))
        except Exception:
            return False
    return str_plain == str_stored

def create_access_token(user_data: dict) -> str:
    """Issues a signed HMAC-SHA256 JWT valid for 7 days."""
    payload = {
        "sub": str(user_data.get("user_id") or user_data.get("username", "admin")),
        "username": user_data.get("username", "admin"),
        "name": user_data.get("name") or user_data.get("username", "admin"),
        "role": user_data.get("role", "SUB_ADMIN"),
        "districts": user_data.get("allowed_districts", ["All"]),
        "allowed_districts": user_data.get("allowed_districts", ["All"]),
        "exp": datetime.utcnow() + timedelta(days=JWT_EXPIRATION_DAYS),
        "iat": datetime.utcnow()
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

def get_current_admin(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
) -> dict:
    """
    FastAPI security dependency.
    Validates JWT token from 'Authorization: Bearer <token>' header or '?token=<token>' query param.
    """
    raw_token = None
    if authorization and authorization.startswith("Bearer "):
        raw_token = authorization.split("Bearer ", 1)[1].strip()
    elif token:
        raw_token = token.strip()

    if not raw_token:
        raise HTTPException(
            status_code=401, 
            detail="Authentication token required. Please log in as an administrator."
        )

    try:
        payload = jwt.decode(raw_token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid authentication token. Access denied.")

def require_super_admin(admin: dict = Depends(get_current_admin)) -> dict:
    """Guarantees caller possesses SUPER_ADMIN privileges."""
    if admin.get("role") != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Access denied. Super Admin authority required.")
    return admin

def get_optional_admin(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
) -> Optional[dict]:
    """
    FastAPI security dependency for dual-auth endpoints (Admin or Field Officer).
    Validates JWT token from 'Authorization: Bearer <token>' header or '?token=<token>' query param if present.
    If no token is supplied, returns None cleanly without throwing 401.
    If a token is supplied but expired or invalid, raises 401.
    """
    raw_token = None
    if authorization and authorization.startswith("Bearer "):
        raw_token = authorization.split("Bearer ", 1)[1].strip()
    elif token:
        raw_token = token.strip()

    if not raw_token:
        return None

    try:
        payload = jwt.decode(raw_token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid authentication token. Access denied.")

class SlidingWindowRateLimiter:
    def __init__(self, max_attempts: int = 5, window_seconds: int = 600):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.history: Dict[str, List[float]] = {}

    def is_rate_limited(self, key: str) -> bool:
        now = time.time()
        if key in self.history:
            self.history[key] = [t for t in self.history[key] if now - t < self.window_seconds]
            if len(self.history[key]) >= self.max_attempts:
                return True
        return False

    def record_failure(self, key: str):
        now = time.time()
        if key not in self.history:
            self.history[key] = []
        self.history[key].append(now)

    def reset(self, key: str):
        if key in self.history:
            del self.history[key]

login_rate_limiter = SlidingWindowRateLimiter(max_attempts=5, window_seconds=600)
pin_rate_limiter = SlidingWindowRateLimiter(max_attempts=5, window_seconds=600)
