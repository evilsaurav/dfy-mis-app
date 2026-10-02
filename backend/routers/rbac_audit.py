import io
import time
import asyncio
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import pandas as pd
from google.cloud import firestore

from backend.core.database import db
from backend.core.cache import cache
from backend.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_admin,
    require_super_admin,
    login_rate_limiter
)
from backend.core.helpers import (
    get_ist_now,
    canonicalize_district,
    extract_client_info,
    get_ip_location,
    log_admin_activity
)
from backend.core.styles import style_excel_worksheet

router = APIRouter(tags=["rbac_audit"])

AUDIT_RETENTION_DAYS = 30
_last_audit_prune_epoch = 0


class AdminUserLoginReq(BaseModel):
    username: str
    password: str

class AdminUserCreateReq(BaseModel):
    username: str
    name: str
    password: str
    role: Optional[str] = "SUB_ADMIN" # "SUPER_ADMIN" or "SUB_ADMIN"
    allowed_districts: Optional[List[str]] = ["All"]
    permissions: Optional[Dict[str, bool]] = {
        "can_view_dashboard": True,
        "can_edit_targets": False,
        "can_manage_staff": False,
        "can_edit_patient_ids": False,
        "can_export_reports": True,
        "can_view_audit_logs": False
    }
    status: Optional[str] = "ACTIVE"
    created_by: Optional[str] = "Super Admin"

class AdminUserUpdateReq(BaseModel):
    user_id: str
    name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    allowed_districts: Optional[List[str]] = None
    permissions: Optional[Dict[str, bool]] = None
    status: Optional[str] = None

class AuditLogQueryReq(BaseModel):
    action_type: Optional[str] = None
    action_filter: Optional[str] = None
    district: Optional[str] = None
    district_filter: Optional[str] = None
    user_id: Optional[str] = None
    user_filter: Optional[str] = None
    search: Optional[str] = ""
    limit: Optional[int] = 300
# get_ist_now is defined at the top of the module for global availability


async def init_default_super_admin():
    try:
        doc_ref = db.collection("admin_users").document("admin")
        doc = await asyncio.to_thread(doc_ref.get)
        if not doc.exists:
            default_super = {
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
            await asyncio.to_thread(lambda: doc_ref.set(default_super))
    except Exception as e:
        print(f"Super admin init notice: {e}")

@router.post("/admin/auth/user-login")
@router.post("/admin/login")
@router.post("/login")
async def admin_user_login(req: AdminUserLoginReq, request: Request):
    try:
        clean_user = req.username.strip().lower()
        client_ip, client_device = extract_client_info(request)
        client_location = await get_ip_location(client_ip)
        client_diff = {"ip": client_ip, "device": client_device, "location": client_location}

        # Check rate limiter against brute force attacks
        if login_rate_limiter.is_rate_limited(clean_user):
            await log_admin_activity("LOGIN_BLOCKED", f"Brute-force lockout triggered for '{clean_user}' from {client_device} (Account locked for 10m)", user_name=req.username, user_id=clean_user, role="UNKNOWN", ip_address=client_ip, diff=client_diff, location=client_location)
            raise HTTPException(status_code=429, detail="Too many failed login attempts. Account locked for 10 minutes.")
            
        try:
            await init_default_super_admin()
        except Exception:
            pass

        user_doc = None
        try:
            user_doc_ref = db.collection("admin_users").document(clean_user)
            user_doc = await asyncio.to_thread(user_doc_ref.get)
        except Exception as fe:
            print(f"Firestore user lookup notice (quota/network): {fe}")
            raise HTTPException(status_code=503, detail="Database currently unavailable. Please try again later.")
        
        if not user_doc or not user_doc.exists:
            # Fallback check for query by username
            docs = await asyncio.to_thread(lambda: list(db.collection("admin_users").where("username", "==", clean_user).stream()))
            if docs:
                user_doc = docs[0]
            else:
                login_rate_limiter.record_failure(clean_user)
                await log_admin_activity("LOGIN_FAILED", f"Failed login attempt for nonexistent user '{req.username}' from {client_device}", user_name=req.username, user_id=clean_user, role="UNKNOWN", ip_address=client_ip, diff=client_diff, location=client_location)
                raise HTTPException(status_code=401, detail="Invalid username or password.")
                
        user_data = user_doc.to_dict()
        if user_data.get("status") != "ACTIVE":
            await log_admin_activity("LOGIN_FAILED", f"Disabled user '{clean_user}' attempted login from {client_device}", user_name=user_data.get("name", clean_user), user_id=clean_user, role=user_data.get("role", "SUB_ADMIN"), ip_address=client_ip, diff=client_diff, location=client_location)
            raise HTTPException(status_code=403, detail="Your admin account has been disabled. Contact Super Admin.")
            
        stored_pw = user_data.get("password", "")
        if not verify_password(req.password, stored_pw):
            login_rate_limiter.record_failure(clean_user)
            await log_admin_activity("LOGIN_FAILED", f"Incorrect password for user '{clean_user}' from {client_device}", user_name=user_data.get("name", clean_user), user_id=clean_user, role=user_data.get("role", "SUB_ADMIN"), ip_address=client_ip, diff=client_diff, location=client_location)
            raise HTTPException(status_code=401, detail="Invalid username or password.")
            
        login_rate_limiter.reset(clean_user)
        
        # Auto-upgrade stored password to bcrypt hash if plain text
        update_fields = {"last_login": get_ist_now().strftime("%Y-%m-%d %I:%M:%S %p")}
        if not str(stored_pw).startswith(("$2b$", "$2a$")):
            update_fields["password"] = hash_password(req.password)
            
        # Update last login timestamp and hashed password
        await asyncio.to_thread(lambda: user_doc.reference.update(update_fields))
        
        # Don't return password in payload
        safe_user = {k: v for k, v in user_data.items() if k != "password"}
        token = create_access_token(safe_user)
        await log_admin_activity("LOGIN_SUCCESS", f"User {user_data.get('name')} logged in successfully from {client_device}", user_name=user_data.get("name"), user_id=clean_user, role=user_data.get("role", "SUB_ADMIN"), ip_address=client_ip, diff=client_diff, location=client_location)
        
        return {"success": True, "user": safe_user, "token": token}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/admin/users/list")
async def list_admin_users(admin: dict = Depends(require_super_admin)):
    try:
        await init_default_super_admin()
        docs = await asyncio.to_thread(lambda: list(db.collection("admin_users").stream()))
        users = []
        for doc in docs:
            d = doc.to_dict()
            safe_d = {k: v for k, v in d.items() if k != "password"}
            users.append(safe_d)
            
        users.sort(key=lambda x: (x.get("role") != "SUPER_ADMIN", x.get("name", "")))
        return {"success": True, "users": users}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/users/create")
async def create_admin_user(req: AdminUserCreateReq, admin: dict = Depends(require_super_admin)):
    try:
        clean_user = req.username.strip().lower()
        if not clean_user or not req.password:
            raise HTTPException(status_code=400, detail="Username and password are required.")
            
        doc_ref = db.collection("admin_users").document(clean_user)
        existing = await asyncio.to_thread(doc_ref.get)
        if existing.exists:
            raise HTTPException(status_code=400, detail=f"Username '{clean_user}' is already taken.")
            
        new_user = {
            "user_id": clean_user,
            "username": clean_user,
            "name": req.name.strip(),
            "password": hash_password(req.password),
            "role": req.role or "SUB_ADMIN",
            "allowed_districts": req.allowed_districts or ["All"],
            "permissions": req.permissions or {
                "can_view_dashboard": True,
                "can_edit_targets": False,
                "can_manage_staff": False,
                "can_edit_patient_ids": False,
                "can_export_reports": True,
                "can_view_audit_logs": False
            },
            "status": req.status or "ACTIVE",
            "created_by": req.created_by or admin.get("username", "Super Admin"),
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "last_login": ""
        }
        await asyncio.to_thread(lambda: doc_ref.set(new_user))
        actor_name = admin.get("name") or admin.get("username", "Super Admin")
        actor_id = admin.get("user_id") or admin.get("username", "admin")
        await log_admin_activity("ADMIN_USER_CREATED", f"Created new admin account '{clean_user}' ({req.name}) with role {req.role}", user_name=actor_name, user_id=actor_id, role="SUPER_ADMIN")
        
        safe_user = {k: v for k, v in new_user.items() if k != "password"}
        return {"success": True, "user": safe_user, "message": f"User {req.name} successfully created!"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/users/update")
async def update_admin_user(req: AdminUserUpdateReq, admin: dict = Depends(require_super_admin)):
    try:
        clean_user = req.user_id.strip().lower()
        doc_ref = db.collection("admin_users").document(clean_user)
        doc = await asyncio.to_thread(doc_ref.get)
        if not doc.exists:
            raise HTTPException(status_code=404, detail=f"Admin user '{clean_user}' not found.")
            
        update_data = {"updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
        if req.name is not None:
            update_data["name"] = req.name.strip()
        if req.password:
            update_data["password"] = hash_password(req.password)
        if req.role is not None:
            update_data["role"] = req.role
        if req.allowed_districts is not None:
            update_data["allowed_districts"] = req.allowed_districts
        if req.permissions is not None:
            update_data["permissions"] = req.permissions
        if req.status is not None:
            update_data["status"] = req.status
            
        await asyncio.to_thread(lambda: doc_ref.update(update_data))
        actor_name = admin.get("name") or admin.get("username", "Super Admin")
        actor_id = admin.get("user_id") or admin.get("username", "admin")
        await log_admin_activity("PERMISSIONS_UPDATED", f"Updated settings/permissions for admin user '{clean_user}'", user_name=actor_name, user_id=actor_id, role="SUPER_ADMIN")
        return {"success": True, "message": f"User {clean_user} updated successfully!"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/users/delete")
async def delete_admin_user(user_id: str, admin: dict = Depends(require_super_admin)):
    try:
        clean_user = user_id.strip().lower()
        if clean_user == "admin":
            raise HTTPException(status_code=400, detail="Cannot delete master root admin account.")
            
        doc_ref = db.collection("admin_users").document(clean_user)
        await asyncio.to_thread(doc_ref.delete)
        actor_name = admin.get("name") or admin.get("username", "Super Admin")
        actor_id = admin.get("user_id") or admin.get("username", "admin")
        await log_admin_activity("ADMIN_USER_DELETED", f"Deleted admin user account '{clean_user}'", user_name=actor_name, user_id=actor_id, role="SUPER_ADMIN")
        return {"success": True, "message": f"User {clean_user} deleted successfully!"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =========================================================================
# --- Enterprise Audit Retention & Auto-Pruning Engine (30-Day Policy) ---
# =========================================================================
_last_audit_prune_epoch = 0
AUDIT_RETENTION_DAYS = 30

async def prune_expired_audit_logs(retention_days: int = AUDIT_RETENTION_DAYS) -> int:
    """
    Auto-prune audit logs older than retention_days (default 30 days / 1 month).
    Deletes expired records in Firestore batches to prevent database bloat.
    """
    global _last_audit_prune_epoch
    _last_audit_prune_epoch = time.time()
    try:
        cutoff_str = (datetime.now() - timedelta(days=retention_days)).strftime("%Y-%m-%d %H:%M:%S")
        expired_docs = await asyncio.to_thread(lambda: list(
            db.collection("admin_audit_logs")
            .where("timestamp", "<", cutoff_str)
            .limit(300)
            .stream()
        ))
        
        if not expired_docs:
            return 0
            
        deleted_count = 0
        batch = db.batch()
        for doc in expired_docs:
            batch.delete(doc.reference)
            deleted_count += 1
            
        await asyncio.to_thread(batch.commit)
        print(f"[Audit Retention] Successfully auto-pruned {deleted_count} expired audit logs older than {cutoff_str}")
        return deleted_count
    except Exception as e:
        print(f"[Audit Retention Notice] Pruning skipped or error: {e}")
        return 0



@router.post("/admin/audit-logs/prune")
async def manual_prune_audit_logs(days: Optional[int] = 30, admin: dict = Depends(require_super_admin)):
    try:
        deleted = await prune_expired_audit_logs(retention_days=days or 30)
        actor_name = admin.get("name") or admin.get("username", "Super Admin")
        actor_id = admin.get("user_id") or admin.get("username", "admin")
        await log_admin_activity(
            action_type="AUDIT_PRUNED",
            details=f"Super Admin {actor_name} manually pruned {deleted} audit log(s) older than {days or 30} days",
            user_name=actor_name,
            user_id=actor_id,
            role="SUPER_ADMIN"
        )
        return {
            "success": True, 
            "deleted_count": deleted, 
            "retention_days": days or 30,
            "message": f"Successfully pruned {deleted} audit log(s) older than {days or 30} days."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/audit-logs")
async def get_audit_logs(query: AuditLogQueryReq, admin: dict = Depends(get_current_admin)):
    try:
        # Trigger background auto-pruning if > 6 hours have passed since last run
        global _last_audit_prune_epoch
        if time.time() - _last_audit_prune_epoch > 21600:
            asyncio.create_task(prune_expired_audit_logs(AUDIT_RETENTION_DAYS))

        # Enforce 30-day retention cutoff so client never receives expired logs
        cutoff_str = (datetime.now() - timedelta(days=AUDIT_RETENTION_DAYS)).strftime("%Y-%m-%d %H:%M:%S")

        # Fetch audit logs ordered chronologically descending
        docs = await asyncio.to_thread(lambda: list(db.collection("admin_audit_logs")
            .order_by("timestamp", direction=firestore.Query.DESCENDING)
            .limit(query.limit or 300)
            .stream()))
            
        def format_log_to_ist(ts_str: str, is_ist: bool = False) -> str:
            if not ts_str:
                return ""
            try:
                if "AM" in ts_str or "PM" in ts_str:
                    return ts_str
                clean_ts = str(ts_str).strip().replace("T", " ")[:19]
                dt = datetime.strptime(clean_ts, "%Y-%m-%d %H:%M:%S")
                if not is_ist:
                    dt = dt + timedelta(hours=5, minutes=30)
                return dt.strftime("%d %b %Y, %I:%M:%S %p")
            except Exception:
                return str(ts_str)

        effective_action = query.action_type or query.action_filter or "All"
        effective_district = query.district or query.district_filter or "All"
        effective_user = query.user_id or query.user_filter or "All"

        logs = []
        for doc in docs:
            d = doc.to_dict()
            
            # Retention check: Skip records older than 30 days
            log_time = d.get("timestamp", "")
            if log_time and log_time < cutoff_str:
                continue

            # Apply filters in memory
            if effective_action != "All" and d.get("action_type") != effective_action:
                continue
            if effective_district != "All" and d.get("district") != effective_district:
                continue
            if effective_user != "All" and d.get("user_id") != effective_user:
                continue
            if query.search:
                s_lower = query.search.lower()
                text_to_search = f"{d.get('details', '')} {d.get('user_name', '')} {d.get('target_officer', '')} {d.get('district', '')} {d.get('ip_address', '')} {d.get('location', '')} {(d.get('diff') or {}).get('location', '')}".lower()
                if s_lower not in text_to_search:
                    continue
                    
            d["timestamp_formatted"] = d.get("timestamp_ist") or format_log_to_ist(d.get("timestamp"), d.get("is_ist", False))
            d["location"] = d.get("location") or (d.get("diff") or {}).get("location", "")
            logs.append(d)
            
        return {"success": True, "total": len(logs), "retention_policy": f"Last {AUDIT_RETENTION_DAYS} Days", "logs": logs}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/admin/export-audit-logs")
async def export_audit_logs(action_type: Optional[str] = "All", district: Optional[str] = "All", user_id: Optional[str] = "All", admin: dict = Depends(get_current_admin)):
    try:
        cutoff_str = (datetime.now() - timedelta(days=AUDIT_RETENTION_DAYS)).strftime("%Y-%m-%d %H:%M:%S")

        docs = await asyncio.to_thread(lambda: list(db.collection("admin_audit_logs")
            .order_by("timestamp", direction=firestore.Query.DESCENDING)
            .limit(1000)
            .stream()))

        def format_log_to_ist(ts_str: str, is_ist: bool = False) -> str:
            if not ts_str:
                return ""
            try:
                if "AM" in ts_str or "PM" in ts_str:
                    return ts_str
                clean_ts = str(ts_str).strip().replace("T", " ")[:19]
                dt = datetime.strptime(clean_ts, "%Y-%m-%d %H:%M:%S")
                if not is_ist:
                    dt = dt + timedelta(hours=5, minutes=30)
                return dt.strftime("%d %b %Y, %I:%M:%S %p")
            except Exception:
                return str(ts_str)
            
        rows = []
        for idx, doc in enumerate(docs):
            d = doc.to_dict()
            if d.get("timestamp", "") < cutoff_str:
                continue
            if action_type and action_type != "All" and d.get("action_type") != action_type:
                continue
            if district and district != "All" and d.get("district") != district:
                continue
            if user_id and user_id != "All" and d.get("user_id") != user_id:
                continue
                
            formatted_time = d.get("timestamp_ist") or format_log_to_ist(d.get("timestamp"), d.get("is_ist", False))
            client_dev = (d.get("diff") or {}).get("device", "")
            client_loc = d.get("location") or (d.get("diff") or {}).get("location", "")
            rows.append({
                "S.No": idx + 1,
                "Timestamp (IST)": formatted_time,
                "Admin User": d.get("user_name", ""),
                "Role": d.get("role", ""),
                "Action Type": d.get("action_type", ""),
                "District": d.get("district", ""),
                "Target Officer": d.get("target_officer", ""),
                "Activity Details": d.get("details", ""),
                "IP Address": d.get("ip_address", ""),
                "Location": client_loc,
                "Device": client_dev
            })
            
        df = pd.DataFrame(rows)
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name="Admin Audit Trail")
            ws = writer.sheets["Admin Audit Trail"]
            style_excel_worksheet(ws, header_fill_color="1E293B")
            
        output.seek(0)
        filename = f"DFY_Admin_Audit_Trail_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

