import re
import asyncio
from datetime import datetime
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel

from backend.core.database import db
from backend.core.cache import cache
from backend.core.supabase import fetch_admin_user, pg_fetch_one, pg_upsert_row, pg_update_row

from backend.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    require_super_admin,
    login_rate_limiter,
    pin_rate_limiter
)
from backend.core.helpers import (
    canonicalize_district,
    load_baseline_staff_directory,
    extract_client_info,
    get_ip_location,
    log_admin_activity
)

router = APIRouter(tags=["auth"])

class AdminLoginReq(BaseModel):
    password: str

class AdminChangePasswordReq(BaseModel):
    current_password: str
    new_password: str

class PinCheck(BaseModel):
    working_place: str
    fo_name: str
    pin: str

def get_or_init_admin_auth() -> dict:
    user = fetch_admin_user("admin")
    if user and user.get("password"):
        return {"password": user["password"]}
    return {
        "password": hash_password("dfyadmin2026"),
        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

@router.post("/admin/auth/login")
async def admin_login(req: AdminLoginReq, request: Request):
    try:
        client_ip, client_device = extract_client_info(request)
        client_location = await get_ip_location(client_ip)
        client_diff = {"ip": client_ip, "device": client_device, "location": client_location}

        if login_rate_limiter.is_rate_limited("master_admin"):
            await log_admin_activity("LOGIN_BLOCKED", f"Master admin lockout triggered from {client_device} (Locked for 10m)", user_name="Super Admin", user_id="admin", role="SUPER_ADMIN", ip_address=client_ip, diff=client_diff, location=client_location)
            raise HTTPException(status_code=429, detail="Too many failed login attempts. Locked for 10 minutes.")
            
        try:
            auth_data = await asyncio.to_thread(get_or_init_admin_auth)
            correct_pw = auth_data.get("password", "")
        except Exception:
            correct_pw = ""

        if correct_pw and verify_password(req.password, correct_pw):
            login_rate_limiter.reset("master_admin")
            master_user = {
                "user_id": "admin",
                "username": "admin",
                "name": "Super Admin",
                "role": "SUPER_ADMIN",
                "allowed_districts": ["All"]
            }
            token = create_access_token(master_user)
            await log_admin_activity("LOGIN_SUCCESS", f"Super Admin legacy login from {client_device}", user_name="Super Admin", user_id="admin", role="SUPER_ADMIN", ip_address=client_ip, diff=client_diff, location=client_location)
            return {"success": True, "message": "Login successful", "token": token, "user": master_user}
            
        login_rate_limiter.record_failure("master_admin")
        await log_admin_activity("LOGIN_FAILED", f"Incorrect master password attempt from {client_device}", user_name="Super Admin", user_id="admin", role="SUPER_ADMIN", ip_address=client_ip, diff=client_diff, location=client_location)
        raise HTTPException(status_code=401, detail="Invalid password")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/auth/update-credentials")
async def admin_update_credentials(req: AdminChangePasswordReq, request: Request, admin: dict = Depends(require_super_admin)):
    try:
        user_id = admin.get("user_id") or admin.get("username") or "admin"
        if not req.new_password or len(req.new_password.strip()) < 6:
            raise HTTPException(status_code=400, detail="New password must be at least 6 characters long.")
            
        user_row = pg_fetch_one("admin_users", filters={"username": user_id})
        if not user_row:
            user_row = pg_fetch_one("admin_users", filters={"user_id": user_id})
        
        current_hash = None
        if user_row:
            current_hash = user_row.get("password")
        else:
            auth_data = await asyncio.to_thread(get_or_init_admin_auth)
            current_hash = auth_data.get("password")

        if not current_hash or not verify_password(req.current_password, current_hash):
            raise HTTPException(status_code=401, detail="Current password incorrect.")

        new_hashed = hash_password(req.new_password.strip())
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        pg_update_row("admin_users", {
            "password": new_hashed,
            "last_password_change": now_str
        }, {"username": user_id})

        if user_id == "admin":
            pg_upsert_row("admin_config", {
                "id": "auth_settings",
                "key": "auth_settings",
                "password": new_hashed,
                "last_updated": now_str
            }, conflict_columns=["id"])


        client_ip, client_device = extract_client_info(request)
        client_location = await get_ip_location(client_ip)
        client_diff = {"ip": client_ip, "device": client_device, "location": client_location}
        await log_admin_activity("ADMIN_PASSWORD_CHANGED", f"Master password updated by {admin.get('name', user_id)}", user_name=admin.get("name", user_id), user_id=user_id, role="SUPER_ADMIN", ip_address=client_ip, diff=client_diff, location=client_location)

        return {"success": True, "message": "Password updated successfully!"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/verify-pin")
async def verify_pin(data: PinCheck):
    cached_pin = None
    try:
        c_wp = canonicalize_district(data.working_place)
        clean_fo = re.sub(r'[^a-zA-Z0-9]', '', data.fo_name).lower()
        
        # Candidate doc_ids to ensure alias resilience
        candidate_ids = [
            f"{c_wp}_{data.fo_name}".replace(" ", "").lower(),
            f"{data.working_place}_{data.fo_name}".replace(" ", "").lower(),
            f"{c_wp.replace(' ', '')}_{clean_fo}".lower()
        ]
        if "aurangabad" in c_wp.lower():
            candidate_ids.extend([f"aurangabad_{clean_fo}", f"aurangabad_{data.fo_name}".replace(" ", "").lower()])
        if "champaran" in c_wp.lower():
            candidate_ids.extend([f"eastchamparan_{clean_fo}", f"east_champaran_{clean_fo}"])
        if "bhojpur" in c_wp.lower():
            candidate_ids.extend([f"bhojpur_{clean_fo}"])
            
        candidate_ids = list(dict.fromkeys(candidate_ids))
        primary_id = candidate_ids[0]

        # Check rate limiter against brute force (max 5 failed attempts per 10 minutes)
        if pin_rate_limiter.is_rate_limited(primary_id):
            return {"valid": False, "error": "Too many failed PIN attempts. Account locked for 10 minutes."}
            
        cache_key = f"pin_{primary_id}"
        cached_pin = cache.get(cache_key)
        
        if cached_pin is not None:
            if cached_pin == "__DEACTIVATED__":
                pin_rate_limiter.record_failure(primary_id)
                return {"valid": False, "error": "Account deactivated. Please contact your District MIS or State Admin."}
            if verify_password(str(data.pin), str(cached_pin)) or str(data.pin) == str(cached_pin):
                pin_rate_limiter.reset(primary_id)
                return {"valid": True}
            pin_rate_limiter.record_failure(primary_id)
            return {"valid": False}

        try:
            for doc_id in candidate_ids:
                staff_row = pg_fetch_one("staff_directory", filters={"id": doc_id})
                if staff_row:
                    doc_data = staff_row
                    if doc_data.get("is_active") is False or doc_data.get("status") == "inactive":
                        cache.set(cache_key, "__DEACTIVATED__", ttl=3600)
                        pin_rate_limiter.record_failure(primary_id)
                        return {"valid": False, "error": "Account deactivated. Please contact your District MIS or State Admin."}
                    real_pin = doc_data.get("pin")
                    cache.set(cache_key, str(real_pin), ttl=3600)
                    if verify_password(str(data.pin), str(real_pin)) or str(data.pin) == str(real_pin):
                        pin_rate_limiter.reset(primary_id)
                        return {"valid": True}
                    pin_rate_limiter.record_failure(primary_id)
                    return {"valid": False}
        except Exception as fe:
            print(f"PIN PostgreSQL check notice: {fe}")

            if cached_pin == "__DEACTIVATED__":
                pin_rate_limiter.record_failure(primary_id)
                return {"valid": False, "error": "Account deactivated. Please contact your District MIS or State Admin."}
            try:
                baseline = load_baseline_staff_directory()
                active_fos = [name.strip().lower() for name in baseline.get(c_wp, [])]
                if active_fos and data.fo_name.strip().lower() not in active_fos:
                    return {"valid": False, "error": "Account deactivated. Please contact your District MIS or State Admin."}
            except Exception:
                pass
            if str(data.pin).isdigit() and len(str(data.pin)) == 4:
                return {"valid": True, "fallback": True}

        pin_rate_limiter.record_failure(primary_id)
        return {"valid": False}
    except Exception:
        if cached_pin == "__DEACTIVATED__":
            return {"valid": False, "error": "Account deactivated. Please contact your District MIS or State Admin."}
        if str(data.pin).isdigit() and len(str(data.pin)) == 4:
            return {"valid": True, "fallback": True}
        return {"valid": False}
