import os
import json
from typing import Optional, Dict, Any, List
from datetime import datetime

_supabase_client = None

def get_supabase_client():
    """Lazily initializes Supabase client from environment variables."""
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client

    url = os.environ.get("SUPABASE_URL")
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_SERVICE_KEY")
        or os.environ.get("SUPABASE_KEY")
        or os.environ.get("SUPABASE_ANON_KEY")
    )
    if url and key:
        try:
            from supabase import create_client
            _supabase_client = create_client(url, key)
            return _supabase_client
        except Exception as e:
            print(f"[Supabase Init Notice] {e}")
    return None

def get_postgres_connection():
    """Establishes connection to PostgreSQL using standard connection URLs."""
    db_url = (
        os.environ.get("DATABASE_URL")
        or os.environ.get("POSTGRES_URL")
        or os.environ.get("SUPABASE_DB_URL")
        or os.environ.get("POSTGRESQL_URL")
    )
    if not db_url:
        return None
    try:
        import psycopg2
        # Fix Heroku/Render standard postgres:// URI scheme for psycopg2
        if db_url.startswith("postgres://"):
            db_url = db_url.replace("postgres://", "postgresql://", 1)
        conn = psycopg2.connect(db_url, connect_timeout=5)
        return conn
    except Exception as e:
        print(f"[PostgreSQL Connection Notice] {e}")
        return None

def _normalize_admin_user_row(row: dict) -> dict:
    """Normalizes admin user dictionary from PostgreSQL/Supabase table schema."""
    d = dict(row)
    if "user_id" not in d and "id" in d:
        d["user_id"] = str(d["id"])
    if "username" not in d and "user_id" in d:
        d["username"] = str(d["user_id"])
    if "password" not in d and "password_hash" in d:
        d["password"] = d["password_hash"]

    # Normalize allowed_districts
    districts = d.get("allowed_districts")
    if isinstance(districts, str):
        try:
            d["allowed_districts"] = json.loads(districts)
        except Exception:
            d["allowed_districts"] = [s.strip() for s in districts.split(",") if s.strip()]
    elif not districts:
        d["allowed_districts"] = ["All"]

    # Normalize permissions
    perms = d.get("permissions")
    if isinstance(perms, str):
        try:
            d["permissions"] = json.loads(perms)
        except Exception:
            d["permissions"] = {}
    elif not perms:
        d["permissions"] = {
            "can_view_dashboard": True,
            "can_edit_targets": True if d.get("role") == "SUPER_ADMIN" else False,
            "can_manage_staff": True if d.get("role") == "SUPER_ADMIN" else False,
            "can_edit_patient_ids": True if d.get("role") == "SUPER_ADMIN" else False,
            "can_export_reports": True,
            "can_view_audit_logs": True if d.get("role") == "SUPER_ADMIN" else False
        }

    d["status"] = d.get("status") or "ACTIVE"
    d["role"] = d.get("role") or "SUB_ADMIN"
    return d

def get_default_super_admin() -> dict:
    from backend.core.security import hash_password
    return {
        "user_id": "admin",
        "username": "admin",
        "name": "Super Admin (Master)",
        "password": hash_password("dfyadmin2026"),
        "role": "SUPER_ADMIN",
        "allowed_districts": ["All"],
        "permissions": {
            "can_view_dashboard": True,
            "can_edit_targets": True,
            "can_manage_staff": True,
            "can_edit_patient_ids": True,
            "can_export_reports": True,
            "can_view_audit_logs": True
        },
        "status": "ACTIVE",
        "created_by": "System Root",
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "last_login": ""
    }

def fetch_admin_user(clean_user: str) -> Optional[Dict[str, Any]]:
    """
    Fetches an admin user record by username or user_id from:
    1. Supabase table ('admin_users')
    2. PostgreSQL direct connection (DATABASE_URL)
    3. Fail-safe Root Super Admin fallback
    """
    clean_user = clean_user.strip().lower()

    # 1. Supabase REST query
    sb = get_supabase_client()
    if sb:
        try:
            res = (
                sb.table("admin_users")
                .select("*")
                .or_(f"username.ilike.{clean_user},user_id.ilike.{clean_user}")
                .limit(1)
                .execute()
            )
            if res.data and len(res.data) > 0:
                return _normalize_admin_user_row(res.data[0])
        except Exception as se:
            print(f"[Supabase Admin Query Notice] {se}")

    # 2. PostgreSQL direct connection via psycopg2
    conn = get_postgres_connection()
    if conn:
        try:
            import psycopg2.extras
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    "SELECT * FROM admin_users WHERE LOWER(username) = %s OR LOWER(user_id) = %s LIMIT 1",
                    (clean_user, clean_user)
                )
                row = cur.fetchone()
                if row:
                    return _normalize_admin_user_row(dict(row))
        except Exception as pe:
            print(f"[PostgreSQL Admin Query Notice] {pe}")
        finally:
            try:
                conn.close()
            except Exception:
                pass

    # 3. Fail-safe Root Super Admin fallback
    if clean_user == "admin":
        return get_default_super_admin()

    return None

def update_admin_user_login_info(clean_user: str, last_login_str: str, new_password_hash: Optional[str] = None):
    """Updates last_login timestamp and optionally password hash upon successful login."""
    clean_user = clean_user.strip().lower()

    # 1. Supabase
    sb = get_supabase_client()
    if sb:
        try:
            payload = {"last_login": last_login_str}
            if new_password_hash:
                payload["password"] = new_password_hash
            sb.table("admin_users").update(payload).or_(f"username.ilike.{clean_user},user_id.ilike.{clean_user}").execute()
            return
        except Exception as se:
            print(f"[Supabase Login Update Notice] {se}")

    # 2. PostgreSQL
    conn = get_postgres_connection()
    if conn:
        try:
            with conn.cursor() as cur:
                if new_password_hash:
                    cur.execute(
                        "UPDATE admin_users SET last_login = %s, password = %s WHERE LOWER(username) = %s OR LOWER(user_id) = %s",
                        (last_login_str, new_password_hash, clean_user, clean_user)
                    )
                else:
                    cur.execute(
                        "UPDATE admin_users SET last_login = %s WHERE LOWER(username) = %s OR LOWER(user_id) = %s",
                        (last_login_str, clean_user, clean_user)
                    )
            conn.commit()
        except Exception as pe:
            print(f"[PostgreSQL Login Update Notice] {pe}")
        finally:
            try:
                conn.close()
            except Exception:
                pass

def fetch_all_admin_users() -> List[Dict[str, Any]]:
    """Retrieves all admin accounts for list views."""
    # 1. Supabase
    sb = get_supabase_client()
    if sb:
        try:
            res = sb.table("admin_users").select("*").execute()
            if res.data:
                return [_normalize_admin_user_row(r) for r in res.data]
        except Exception as se:
            print(f"[Supabase List Users Notice] {se}")

    # 2. PostgreSQL
    conn = get_postgres_connection()
    if conn:
        try:
            import psycopg2.extras
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("SELECT * FROM admin_users ORDER BY name ASC")
                rows = cur.fetchall()
                if rows:
                    return [_normalize_admin_user_row(dict(r)) for r in rows]
        except Exception as pe:
            print(f"[PostgreSQL List Users Notice] {pe}")
        finally:
            try:
                conn.close()
            except Exception:
                pass

    # Fallback to default super admin
    return [get_default_super_admin()]
