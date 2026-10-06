import asyncio
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from backend.core.database import db
from backend.core.cache import cache
from backend.core.security import get_current_admin
from backend.core.helpers import log_admin_activity, get_ist_now
from backend.core.supabase import (
    pg_query_table,
    pg_fetch_one,
    pg_upsert_row,
    pg_delete_rows,
    get_active_db,
)

router = APIRouter(tags=["broadcasts"])

class BroadcastCreateReq(BaseModel):
    title: str
    message: str
    priority: Optional[str] = "MEDIUM"  # HIGH, MEDIUM, INFO
    target_audience: Optional[str] = "ALL"  # ALL, FIELD_STAFF, SUB_ADMINS
    target_districts: Optional[List[str]] = ["All"]  # ["All"] or ["Buxar", "Bhojpur", ...]
    created_by_user: Optional[str] = "Super Admin"
    created_by_role: Optional[str] = "SUPER_ADMIN"
    allowed_districts: Optional[List[str]] = None

class BroadcastDeleteReq(BaseModel):
    broadcast_id: str
    requested_by_user: Optional[str] = "admin"
    requested_by_role: Optional[str] = "SUPER_ADMIN"
    allowed_districts: Optional[List[str]] = None

@router.post("/api/broadcasts/create")
async def create_broadcast(req: BroadcastCreateReq, admin: dict = Depends(get_current_admin)):
    try:
        clean_title = req.title.strip()
        clean_msg = req.message.strip()
        if not clean_title or not clean_msg:
            raise HTTPException(status_code=400, detail="Title and message content are required.")

        role = (req.created_by_role or "SUPER_ADMIN").upper()
        # RBAC Check for Sub-Admin:
        target_dists = req.target_districts or ["All"]
        if role == "SUB_ADMIN":
            user_allowed = req.allowed_districts or []
            if "All" in target_dists:
                # Sub-admin cannot broadcast to 'All' Bihar districts, must be scoped to user_allowed
                target_dists = [d for d in user_allowed if d != "All"]
            else:
                # Ensure all selected districts are in user_allowed
                target_dists = [d for d in target_dists if d in user_allowed]
            if not target_dists:
                raise HTTPException(status_code=403, detail="Sub-Admins can only broadcast to their assigned districts.")

        broadcast_id = f"bc_{int(datetime.now().timestamp() * 1000)}"
        doc_data = {
            "id": broadcast_id,
            "title": clean_title,
            "message": clean_msg,
            "priority": (req.priority or "MEDIUM").upper(),
            "target_audience": (req.target_audience or "ALL").upper(),
            "target_districts": target_dists,
            "created_by_user": req.created_by_user or "Admin",
            "created_by_role": role,
            "created_at": get_ist_now().replace(microsecond=0).isoformat(),
            "is_active": True
        }

        ok = pg_upsert_row("broadcast_alerts", doc_data, conflict_columns=["id"])
        if not ok:
            raise HTTPException(status_code=500, detail="Failed to save broadcast to database.")
        active_db = get_active_db()
        if active_db and hasattr(active_db, "collection"):
            try:
                await asyncio.to_thread(lambda: active_db.collection("broadcast_alerts").document(broadcast_id).set(doc_data))
            except Exception:
                pass
        cache.delete_prefix("broadcasts_")

        actor_name = admin.get("name") or admin.get("username") or req.created_by_user or "Admin"
        actor_id = admin.get("user_id") or admin.get("username", "admin")
        actor_role = admin.get("role") or role
        await log_admin_activity(
            action_type="BROADCAST_CREATED",
            details=f"Created [{req.priority}] broadcast: '{clean_title}' for {', '.join(target_dists)} ({req.target_audience})",
            district=target_dists[0] if len(target_dists) == 1 else "Statewide",
            user_name=actor_name,
            user_id=actor_id,
            role=actor_role
        )

        return {"success": True, "message": "Broadcast created successfully!", "broadcast": doc_data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/broadcasts/active")
@router.get("/admin/broadcasts/active")
async def get_active_broadcasts(
    district: Optional[str] = None, 
    role: Optional[str] = None,  # 'FIELD_STAFF' or 'SUB_ADMIN'
    districts: Optional[str] = None
):
    try:
        cache_key = f"broadcasts_active_{district or 'all'}_{role or 'all'}_{districts or 'all'}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        docs_data = pg_query_table("broadcast_alerts", filters={"is_active": True}, order_by="created_at", order_desc=True)
        if not docs_data:
            active_db = get_active_db()
            if active_db and hasattr(active_db, "collection"):
                try:
                    docs = await asyncio.to_thread(lambda: list(active_db.collection("broadcast_alerts")
                        .where("is_active", "==", True)
                        .stream()))
                    docs_data = [d.to_dict() if hasattr(d, "to_dict") and callable(d.to_dict) else dict(d) for d in docs]
                except Exception:
                    docs_data = []

        allowed_dist_set = None
        if districts and districts.strip() and districts.strip() != "All":
            allowed_dist_set = set([d.strip() for d in districts.split(",") if d.strip()])

        active_list = []
        for d in docs_data:
            target_aud = d.get("target_audience", "ALL").upper()
            target_dists = d.get("target_districts", ["All"])

            # 1. Audience Filter
            if role:
                r_upper = role.upper()
                if r_upper == "FIELD_STAFF" and target_aud not in ["ALL", "FIELD_STAFF"]:
                    continue
                if r_upper == "SUB_ADMIN" and target_aud not in ["ALL", "SUB_ADMINS"]:
                    continue

            # 2. District Filter
            # If specific district is passed (e.g. Field Officer in Buxar):
            if district and district != "All":
                if "All" not in target_dists and district not in target_dists:
                    continue

            # If multi-district list is passed (e.g. Sub-Admin with Buxar, Bhojpur):
            if allowed_dist_set:
                if "All" not in target_dists and not any(td in allowed_dist_set for td in target_dists):
                    continue

            active_list.append(d)

        active_list.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        res = {"success": True, "broadcasts": active_list}
        cache.set(cache_key, res, ttl=10)  # 10 seconds cache for fast broadcast updates
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/broadcasts/all")
async def get_all_broadcasts(districts: Optional[str] = None, role: Optional[str] = None):
    try:
        docs_data = pg_query_table("broadcast_alerts", limit=100, order_by="created_at", order_desc=True)
        if not docs_data:
            active_db = get_active_db()
            if active_db and hasattr(active_db, "collection"):
                try:
                    docs = await asyncio.to_thread(lambda: list(active_db.collection("broadcast_alerts")
                        .order_by("created_at", direction="DESCENDING")
                        .limit(100)
                        .stream()))
                    docs_data = [d.to_dict() if hasattr(d, "to_dict") and callable(d.to_dict) else dict(d) for d in docs]
                except Exception:
                    docs_data = []

        allowed_dist_set = None
        if districts and districts.strip() and districts.strip() != "All":
            allowed_dist_set = set([d.strip() for d in districts.split(",") if d.strip()])

        broadcasts = []
        for d in docs_data:
            target_dists = d.get("target_districts", ["All"])
            if allowed_dist_set:
                if "All" not in target_dists and not any(td in allowed_dist_set for td in target_dists):
                    continue
            broadcasts.append(d)

        return {"success": True, "broadcasts": broadcasts}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/broadcasts/delete")
async def delete_broadcast(req: BroadcastDeleteReq, admin: dict = Depends(get_current_admin)):
    try:
        d = pg_fetch_one("broadcast_alerts", filters={"id": req.broadcast_id})
        active_db = get_active_db()
        if not d and active_db and hasattr(active_db, "collection"):
            try:
                doc_ref = active_db.collection("broadcast_alerts").document(req.broadcast_id)
                doc = await asyncio.to_thread(doc_ref.get)
                if doc and getattr(doc, "exists", False):
                    d = doc.to_dict() if hasattr(doc, "to_dict") and callable(doc.to_dict) else dict(doc)
            except Exception:
                pass

        if not d:
            raise HTTPException(status_code=404, detail="Broadcast not found.")

        user_role = (req.requested_by_role or "SUPER_ADMIN").upper()

        if user_role != "SUPER_ADMIN":
            # Sub-admin can only delete if they created it or it matches their allowed districts
            created_by = d.get("created_by_user", "")
            if created_by != req.requested_by_user:
                target_dists = d.get("target_districts", [])
                allowed = req.allowed_districts or []
                if not any(td in allowed for td in target_dists):
                    raise HTTPException(status_code=403, detail="Permission denied to delete this broadcast.")

        pg_delete_rows("broadcast_alerts", filters={"id": req.broadcast_id})
        if active_db and hasattr(active_db, "collection"):
            try:
                await asyncio.to_thread(lambda: active_db.collection("broadcast_alerts").document(req.broadcast_id).delete())
            except Exception:
                pass
        cache.delete_prefix("broadcasts_")

        actor_name = admin.get("name") or admin.get("username") or req.requested_by_user or "Admin"
        actor_id = admin.get("user_id") or admin.get("username", "admin")
        actor_role = admin.get("role") or user_role
        await log_admin_activity(
            action_type="BROADCAST_DELETED",
            details=f"Deleted broadcast '{d.get('title')}': {req.broadcast_id}",
            district="Statewide" if "All" in d.get("target_districts", []) else d.get("target_districts", [""])[0],
            user_name=actor_name,
            user_id=actor_id,
            role=actor_role
        )

        return {"success": True, "message": "Broadcast deleted successfully!"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
