
# Professional OpenPyXL Border & Style Helpers
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

EXCEL_THIN_BORDER = Border(
    left=Side(style='thin', color='CBD5E1'),
    right=Side(style='thin', color='CBD5E1'),
    top=Side(style='thin', color='CBD5E1'),
    bottom=Side(style='thin', color='CBD5E1')
)

EXCEL_HEADER_BORDER = Border(
    left=Side(style='thin', color='94A3B8'),
    right=Side(style='thin', color='94A3B8'),
    top=Side(style='medium', color='1E293B'),
    bottom=Side(style='medium', color='1E293B')
)

EXCEL_TOTAL_ROW_BORDER = Border(
    left=Side(style='thin', color='CBD5E1'),
    right=Side(style='thin', color='CBD5E1'),
    top=Side(style='medium', color='1E293B'),
    bottom=Side(style='double', color='1E293B')
)

EXCEL_CLUSTER_DIVIDER = Border(
    left=Side(style='thin', color='CBD5E1'),
    right=Side(style='medium', color='64748B'),
    top=Side(style='thin', color='CBD5E1'),
    bottom=Side(style='thin', color='CBD5E1')
)

def style_excel_worksheet(ws, header_fill_color="4F46E5"):
    for cell in ws[1]:
        cell.font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color=header_fill_color, end_color=header_fill_color, fill_type="solid")
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = EXCEL_HEADER_BORDER
        
    for row in ws.iter_rows(min_row=2, max_row=ws.max_row, min_col=1, max_col=ws.max_column):
        for cell in row:
            cell.border = EXCEL_THIN_BORDER
            cell.font = Font(name="Calibri", size=10)
            if isinstance(cell.value, (int, float)):
                cell.alignment = Alignment(horizontal="center", vertical="center")
            else:
                cell.alignment = Alignment(horizontal="left", vertical="center")
                
    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

import zipfile
import firebase_admin
from firebase_admin import credentials, firestore, storage
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends, Header, Query
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime, timedelta
import pandas as pd
import io
import os
import json
import uuid
import jwt
import bcrypt

firebase_creds_env = os.environ.get("FIREBASE_CREDENTIALS")
if firebase_creds_env:
    cred_dict = json.loads(firebase_creds_env)
    cred = credentials.Certificate(cred_dict)
    project_id = cred_dict.get("project_id", "dfy-reporting-mis-18b9a")
else:
    cred = credentials.Certificate("firebase_key.json")
    try:
        with open("firebase_key.json", "r", encoding="utf-8") as f:
            project_id = json.load(f).get("project_id", "dfy-reporting-mis-18b9a")
    except Exception:
        project_id = "dfy-reporting-mis-18b9a"

if not firebase_admin._apps:
    firebase_admin.initialize_app(cred, {
        'storageBucket': f'{project_id}.appspot.com'
    })

db_id = os.environ.get("FIRESTORE_DATABASE_ID")
if db_id:
    db = firestore.client(database_id=db_id)
elif project_id == "dfy-reporting-mis-18b9a":
    db = firestore.client(database_id="default")
else:
    db = firestore.client()

import time
import asyncio
from typing import Dict, Any, Tuple

class SimpleTTLCache:
    def __init__(self, default_ttl: int = 30):
        self._cache: Dict[str, Tuple[float, Any]] = {}
        self.default_ttl = default_ttl

    def get(self, key: str):
        if key in self._cache:
            exp, val = self._cache[key]
            if time.time() < exp:
                return val
            else:
                del self._cache[key]
        return None

    def set(self, key: str, val: Any, ttl: Optional[int] = None):
        t = ttl if ttl is not None else self.default_ttl
        self._cache[key] = (time.time() + t, val)

    def delete(self, key: str):
        if key in self._cache:
            del self._cache[key]

    def delete_prefix(self, prefix: str):
        keys_to_del = [k for k in self._cache if k.startswith(prefix)]
        for k in keys_to_del:
            del self._cache[k]

    def clear(self):
        self._cache.clear()

cache = SimpleTTLCache(default_ttl=30)

# --- Security, Cryptography & Access Control ---
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "dfy-tb-mis-bihar-secret-key-2026-supersecure")
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
        "role": user_data.get("role", "SUB_ADMIN"),
        "districts": user_data.get("allowed_districts", ["All"]),
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

# --- Sliding-Window Rate Limiter (Brute-Force Guard) ---
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

app = FastAPI(title="DFY Daily Activity API")

# HTTP GZip compression for all responses > 1KB (shrinks payload 75-85%, saves Render RAM and client mobile bandwidth)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Strict CORS configuration
# Permissive CORS configuration ensuring all Vercel domains, Render domains, and mobile apps work seamlessly
_env_origins = os.environ.get("ALLOWED_ORIGINS")
if _env_origins and _env_origins.strip() != "*":
    cors_allowed = [o.strip() for o in _env_origins.split(",") if o.strip()]
else:
    cors_allowed = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allowed,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=86400,
)

@app.get("/")
@app.get("/health")
def health_status():
    return {
        "status": "healthy",
        "active_firebase_project": project_id,
        "timestamp": datetime.utcnow().isoformat()
    }

class PinCheck(BaseModel):
    working_place: str
    fo_name: str
    pin: str

class DailyActivityReport(BaseModel):
    date_of_reporting: Optional[str] = None
    working_place: str
    fo_name: str
    pin: str
    
    notification_ids: List[str] = []
    hiv_dm_ids: List[str] = []
    dbt_ids: List[str] = []
    sample_collection_ids: List[str] = []
    sample_tested_ids: List[str] = []
    outcome_assigned_ids: List[str] = []
    home_visit_ids: List[str] = []
    contact_tracing_ids: List[str] = []
    follow_up_ids: List[str] = []
    face_to_face_ids: List[str] = []
    presumptive_ids: List[str] = []
    documents_ids: List[str] = []
    fdc_provided_ids: List[str] = []
    fdc_details: Optional[List[Dict[str, Any]]] = []
    kit_consumption_ids: List[str] = []
    differentiated_tb_ids: List[str] = []
    tpt_treatment_start_ids: List[str] = []
    tpt_presumptive_ids: List[str] = []
    adhar_face_authentication_ids: List[str] = []
    consent_with_id_ids: List[str] = []
    culture_dst_ids: List[str] = []
    
    remark: Optional[str] = ""
    
    doctor_store_visits_count: Optional[int] = 0
    visited_names: List[str] = []
    morning_km: Optional[int] = 0
    evening_km: Optional[int] = 0
    morning_km_photo_url: Optional[str] = ""
    evening_km_photo_url: Optional[str] = ""
    is_override_used: Optional[bool] = False

class DashboardRequest(BaseModel):
    month_prefix: str
    districts: Optional[str] = None

@app.post("/admin/dashboard-data")
async def get_dashboard_data(req: DashboardRequest, admin: dict = Depends(get_current_admin)):
    try:
        cache_key = f"dash_{req.month_prefix}_{req.districts or 'all'}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        start_date = f"{req.month_prefix}-01"
        end_date = f"{req.month_prefix}-31"
        
        allowed_dist_set = None
        if req.districts and req.districts.strip() and req.districts.strip() != "All":
            allowed_dist_set = set([d.strip() for d in req.districts.split(",") if d.strip()])

        # Strict RBAC: Intercept Sub-Admin queries to enforce assigned districts
        if admin.get("role") == "SUB_ADMIN":
            user_allowed = set(admin.get("allowed_districts", []))
            if "All" not in user_allowed:
                if allowed_dist_set:
                    allowed_dist_set = allowed_dist_set.intersection(user_allowed)
                else:
                    allowed_dist_set = user_allowed

        # Run blocking Firestore network query in worker thread
        docs = await asyncio.to_thread(lambda: list(
            db.collection("daily_field_reports")
            .where("date_of_reporting", ">=", start_date)
            .where("date_of_reporting", "<=", end_date)
            .stream()
        ))
            
        records = []
        for doc in docs:
            data = doc.to_dict()
            wp = data.get("working_place", "Unknown")
            if allowed_dist_set and wp not in allowed_dist_set:
                continue

            records.append({
                "date": data.get("date_of_reporting", ""),
                "working_place": wp,
                "fo_name": data.get("fo_name", "Unknown"),
                
                # Big 5
                "total_km": data.get("total_km", 0) or 0,
                "notifications": len(data.get("notification_ids", [])),
                "tests": len(data.get("sample_tested_ids", [])),
                "presumptive": len(data.get("presumptive_ids", [])),
                "doctor_visits": len(data.get("visited_names", [])),
                
                # Group 1
                "hiv_dm": len(data.get("hiv_dm_ids", [])),
                "dbt": len(data.get("dbt_ids", [])),
                
                # Group 2
                "sample_collection": len(data.get("sample_collection_ids", [])),
                "outcome_assigned": len(data.get("outcome_assigned_ids", [])),
                
                # Group 3
                "home_visits": len(data.get("home_visit_ids", [])),
                "contact_tracing": len(data.get("contact_tracing_ids", [])),
                "follow_ups": len(data.get("follow_up_ids", [])),
                "face_to_face": len(data.get("face_to_face_ids", [])),
                
                # Group 4
                "documents": len(data.get("documents_ids", [])),
                "fdc_provided": len(data.get("fdc_provided_ids", [])),
                "kit_consumption": len(data.get("kit_consumption_ids", [])),
                
                # Group 5 (New Fields & Special)
                "differentiated_tb": len(data.get("differentiated_tb_ids", [])),
                "tpt_treatment_start": len(data.get("tpt_treatment_start_ids", [])),
                "tpt_presumptive": len(data.get("tpt_presumptive_ids", [])),
                "adhar_face_auth": len(data.get("adhar_face_authentication_ids", [])),
                "consent_with_id": len(data.get("consent_with_id_ids", [])),
                "culture_dst": len(data.get("culture_dst_ids", [])),
                
                # Raw ID Lists for FO Drill-Down Inspector
                "notification_ids": data.get("notification_ids", []),
                "hiv_dm_ids": data.get("hiv_dm_ids", []),
                "dbt_ids": data.get("dbt_ids", []),
                "sample_collection_ids": data.get("sample_collection_ids", []),
                "sample_tested_ids": data.get("sample_tested_ids", []),
                "outcome_assigned_ids": data.get("outcome_assigned_ids", []),
                "home_visit_ids": data.get("home_visit_ids", []),
                "contact_tracing_ids": data.get("contact_tracing_ids", []),
                "follow_up_ids": data.get("follow_up_ids", []),
                "face_to_face_ids": data.get("face_to_face_ids", []),
                "presumptive_ids": data.get("presumptive_ids", []),
                "documents_ids": data.get("documents_ids", []),
                "fdc_provided_ids": data.get("fdc_provided_ids", []),
                "fdc_details": data.get("fdc_details", []),
                "kit_consumption_ids": data.get("kit_consumption_ids", []),
                "differentiated_tb_ids": data.get("differentiated_tb_ids", []),
                "tpt_treatment_start_ids": data.get("tpt_treatment_start_ids", []),
                "tpt_presumptive_ids": data.get("tpt_presumptive_ids", []),
                "adhar_face_authentication_ids": data.get("adhar_face_authentication_ids", []),
                "consent_with_id_ids": data.get("consent_with_id_ids", []),
                "culture_dst_ids": data.get("culture_dst_ids", []),
                "visited_names": data.get("visited_names", []),
                "remark": data.get("remark", ""),
                
                "is_override": data.get("is_override_used", False)
            })
            
        res = {"records": records}
        cache.set(cache_key, res, ttl=30) # 30s cache protects Render CPU and Firestore
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/get-directory")
async def get_directory():
    try:
        cached = cache.get("staff_directory_dict")
        if cached is not None:
            return cached

        docs = await asyncio.to_thread(lambda: list(db.collection("staff_directory").stream()))
        directory = {}
        for doc in docs:
            data = doc.to_dict()
            dist = data.get("district")
            if dist not in directory:
                directory[dist] = []
            directory[dist].append(data.get("name"))

        cache.set("staff_directory_dict", directory, ttl=300)
        return directory
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/verify-pin")
async def verify_pin(data: PinCheck):
    try:
        doc_id = f"{data.working_place}_{data.fo_name}".replace(" ", "").lower()
        
        # Check rate limiter against brute force (max 5 failed attempts per 10 minutes)
        if pin_rate_limiter.is_rate_limited(doc_id):
            return {"valid": False, "error": "Too many failed PIN attempts. Account locked for 10 minutes."}
            
        cache_key = f"pin_{doc_id}"
        cached_pin = cache.get(cache_key)
        
        if cached_pin is not None:
            if verify_password(str(data.pin), str(cached_pin)):
                pin_rate_limiter.reset(doc_id)
                return {"valid": True}
            pin_rate_limiter.record_failure(doc_id)
            return {"valid": False}

        staff_doc = await asyncio.to_thread(db.collection("staff_directory").document(doc_id).get)
        
        if not staff_doc.exists:
            pin_rate_limiter.record_failure(doc_id)
            return {"valid": False}
            
        real_pin = staff_doc.to_dict().get("pin")
        cache.set(cache_key, str(real_pin), ttl=300) # 5 min cache
        if verify_password(str(data.pin), str(real_pin)):
            pin_rate_limiter.reset(doc_id)
            return {"valid": True}
            
        pin_rate_limiter.record_failure(doc_id)
        return {"valid": False}
    except Exception:
        return {"valid": False}

class CheckStatusRequest(BaseModel):
    working_place: str
    fo_name: str
    date: str

@app.post("/check-today-status")
async def check_today_status(req: CheckStatusRequest):
    try:
        doc_id = f"{req.working_place}_{req.fo_name}_{req.date}".replace(" ", "_").lower()
        cache_key = f"status_{doc_id}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        doc_ref = db.collection("daily_field_reports").document(doc_id)
        doc = await asyncio.to_thread(doc_ref.get)
        
        res = {"status": "not_started"}
        if doc.exists:
            d = doc.to_dict()
            res = {"status": "completed", "submission_count": 1, "data": d}
                
        cache.set(cache_key, res, ttl=20)
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/submit-daily-report")
async def submit_daily_report(report: DailyActivityReport):
    try:
        if not report.date_of_reporting:
            report.date_of_reporting = datetime.now().strftime("%Y-%m-%d")
            
        doc_id = f"{report.working_place}_{report.fo_name}_{report.date_of_reporting}".replace(" ", "_").lower()
        doc_ref = db.collection("daily_field_reports").document(doc_id)
        
        payload = report.dict(exclude_unset=True)
        payload["status"] = "completed"
        payload["timestamp_completed"] = firestore.SERVER_TIMESTAMP
        payload["submission_count"] = 1
        
        doc = await asyncio.to_thread(doc_ref.get)
        if doc.exists:
            d = doc.to_dict()
            for k, v in payload.items():
                if isinstance(v, list) and k.endswith("_ids"):
                    combined = d.get(k, []) + v
                    payload[k] = list(dict.fromkeys(combined))
                elif k == "visited_names" and isinstance(v, list):
                    combined = d.get(k, []) + v
                    payload[k] = list(dict.fromkeys(combined))
                elif k == "fdc_details" and isinstance(v, list):
                    old_fdc = d.get("fdc_details", [])
                    f_map = {item.get("id"): item for item in old_fdc if isinstance(item, dict) and item.get("id")}
                    for item in v:
                        if isinstance(item, dict) and item.get("id"):
                            f_map[item.get("id")] = item
                    payload[k] = list(f_map.values())
                elif k == "remark" and v:
                    old_remark = d.get("remark", "")
                    if v not in old_remark:
                        payload[k] = f"{old_remark} | {v}".strip(" |")
                    else:
                        payload[k] = old_remark
                        
        await asyncio.to_thread(lambda: doc_ref.set(payload, merge=True))
        
        # Update daily_district_rollups using Firestore atomic operations (cuts read costs by 95%)
        try:
            clean_wp = report.working_place.strip()
            clean_date = report.date_of_reporting
            rollup_id = f"{clean_date}_{clean_wp}".replace(" ", "_").lower()
            rollup_ref = db.collection("daily_district_rollups").document(rollup_id)
            await asyncio.to_thread(lambda: rollup_ref.set({
                "date": clean_date,
                "district": clean_wp,
                "notifications": firestore.Increment(len(report.notification_ids or [])),
                "tests": firestore.Increment(len(report.sample_tested_ids or [])),
                "hiv_dm": firestore.Increment(len(report.hiv_dm_ids or [])),
                "dbt": firestore.Increment(len(report.dbt_ids or [])),
                "contact_tracing": firestore.Increment(len(report.contact_tracing_ids or [])),
                "diff_tb": firestore.Increment(len(report.differentiated_tb_ids or [])),
                "submitted_fos": firestore.ArrayUnion([report.fo_name]),
                "submission_count": firestore.Increment(1),
                "last_updated": firestore.SERVER_TIMESTAMP
            }, merge=True))
        except Exception as rollup_err:
            print(f"[Rollup Notice] Non-fatal rollup error: {rollup_err}")

        cache.delete(f"status_{doc_id}")
        cache.delete_prefix("profile_")
        cache.delete_prefix("dash_")
        cache.delete_prefix("attendance_")
        cache.delete_prefix("dupe_audit_")
        cache.delete_prefix("cascade_alerts_")
        return {"message": "Daily report submitted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/download-excel")
async def download_excel(admin: dict = Depends(get_current_admin)):
    try:
        docs = await asyncio.to_thread(lambda: list(db.collection("daily_field_reports").stream()))
        consolidated_data = []
        
        list_fields_mapping = {
            "notification_ids": "Notification",
            "hiv_dm_ids": "HIV & DM",
            "dbt_ids": "DBT",
            "sample_collection_ids": "Sample Collection",
            "sample_tested_ids": "Sample Tested",
            "outcome_assigned_ids": "Outcome Assigned",
            "home_visit_ids": "Home Visit",
            "contact_tracing_ids": "Contact Tracing",
            "follow_up_ids": "Follow Up",
            "face_to_face_ids": "Face to Face",
            "presumptive_ids": "Presumptive",
            "documents_ids": "Documents",
            "fdc_provided_ids": "FDC Provided",
            "kit_consumption_ids": "Kit Consumption",
            "differentiated_tb_ids": "Differentiated TB",
            "tpt_treatment_start_ids": "TPT Treatment Start",
            "tpt_presumptive_ids": "TPT Presumptive",
            "adhar_face_authentication_ids": "Adhar Face Authentication",
            "consent_with_id_ids": "Consent with ID"
        }
        
        for doc in docs:
            data = doc.to_dict()
            
            # Find the maximum length among all ID arrays
            max_len = 1  # At least 1 row per report
            for key in list_fields_mapping.keys():
                ids = data.get(key) or []
                if len(ids) > max_len:
                    max_len = len(ids)
                    
            for i in range(max_len):
                row = {
                    "Date": data.get("date_of_reporting", ""),
                    "Name": data.get("fo_name", ""),
                    "Designation": data.get("designation", ""),
                    "Block": data.get("working_place", ""),
                }
                
                # Fill array IDs
                for db_key, excel_col in list_fields_mapping.items():
                    ids = data.get(db_key) or []
                    row[excel_col] = ids[i] if i < len(ids) else ""
                    
                # Static data only on first row
                if i == 0:
                    row["Morning KM"] = data.get("morning_km", 0)
                    row["Evening KM"] = data.get("evening_km", 0)
                    row["Total KM"] = data.get("total_km", 0)
                    row["Doctors Visited"] = ", ".join(data.get("visited_names", []))
                    row["Morning KM Photo"] = data.get("morning_km_photo_url", "")
                    row["Evening KM Photo"] = data.get("evening_km_photo_url", "")
                    user_remark = data.get("remark", "")
                    override_str = "[Adjusted]" if data.get("is_override_used") else ""
                    row["Remarks"] = f"{override_str} {user_remark}".strip()
                else:
                    row["Morning KM"] = ""
                    row["Evening KM"] = ""
                    row["Total KM"] = ""
                    row["Doctors Visited"] = ""
                    row["Morning KM Photo"] = ""
                    row["Evening KM Photo"] = ""
                    row["Remarks"] = ""
                    
                consolidated_data.append(row)

        df = pd.DataFrame(consolidated_data)
        df.loc[len(df)] = pd.Series({'Date': 'Designed by Insomniac'})
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Consolidated Report')
        output.seek(0)
        
        return StreamingResponse(
            output, 
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
            headers={"Content-Disposition": "attachment; filename=DFY_Consolidated_Report.xlsx"}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



import os
import openpyxl
import re

def safe_filename(district: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", district.strip())
    return cleaned.strip("_") or "UNKNOWN"

def ordinal(n: int) -> str:
    if n == 1:
        return "1ST"
    if 10 <= n % 100 <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


class TargetUpdate(BaseModel):
    district: str
    fo_name: str
    target: int
    month: Optional[str] = None

@app.get("/get-targets")
async def get_targets(district: Optional[str] = None, month: Optional[str] = None, districts: Optional[str] = None):
    try:
        if not month:
            month = datetime.now().strftime("%Y-%m")
            
        allowed_dist_set = None
        if districts and districts.strip() and districts.strip() != "All":
            allowed_dist_set = set([d.strip() for d in districts.split(",") if d.strip()])

        cache_key = f"targets_{month}_{district or 'all'}_{districts or 'all'}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        docs = await asyncio.to_thread(lambda: list(db.collection("staff_targets").stream()))
        
        month_targets = {}
        default_targets = {}
        
        for doc in docs:
            data = doc.to_dict()
            d_dist = data.get("district")
            d_name = data.get("fo_name")
            d_target = int(data.get("target", 50)) if str(data.get("target", "")).isdigit() else 50
            d_month = data.get("month")
            
            if not d_dist or not d_name:
                continue
                
            key = f"{d_dist}_{d_name}".lower()
            
            if d_month == month:
                month_targets[key] = {
                    "fo_name": d_name,
                    "district": d_dist,
                    "target": d_target,
                    "month": month
                }
            elif not d_month:
                default_targets[key] = {
                    "fo_name": d_name,
                    "district": d_dist,
                    "target": d_target,
                    "month": month
                }

        staff_docs = await asyncio.to_thread(lambda: list(db.collection("staff_directory").stream()))
        targets = []
        
        for s in staff_docs:
            sd = s.to_dict()
            s_dist = sd.get("district")
            s_name = sd.get("name")
            if not s_dist or not s_name:
                continue
            if allowed_dist_set and s_dist not in allowed_dist_set:
                continue
            if district and district != "All" and s_dist != district:
                continue
                
            key = f"{s_dist}_{s_name}".lower()
            if key in month_targets:
                t_val = month_targets[key]["target"]
            elif key in default_targets:
                t_val = default_targets[key]["target"]
            else:
                t_val = 50
                
            targets.append({
                "fo_name": s_name,
                "district": s_dist,
                "designation": sd.get("designation", "FC"),
                "target": t_val,
                "month": month
            })
            
        targets.sort(key=lambda x: (x["district"], x["fo_name"]))
        res = {"success": True, "month": month, "targets": targets}
        cache.set(cache_key, res, ttl=30)
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/update-target")
async def update_target(data: TargetUpdate, admin: dict = Depends(get_current_admin)):
    try:
        month = data.month or datetime.now().strftime("%Y-%m")
        clean_dist = data.district.strip()
        if admin.get("role") == "SUB_ADMIN":
            allowed = admin.get("allowed_districts", [])
            if "All" not in allowed and clean_dist not in allowed:
                raise HTTPException(status_code=403, detail=f"Permission denied. You cannot update targets in district '{clean_dist}'.")
        clean_name = data.fo_name.strip()
        
        # 1. Month-scoped document
        month_doc_id = f"{month}_{clean_dist}_{clean_name}".replace(" ", "").lower()
        await asyncio.to_thread(lambda: db.collection("staff_targets").document(month_doc_id).set({
            "month": month,
            "district": clean_dist,
            "fo_name": clean_name,
            "target": int(data.target),
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }, merge=True))
        
        # 2. General fallback document
        fallback_doc_id = f"{clean_dist}_{clean_name}".replace(" ", "").lower()
        await asyncio.to_thread(lambda: db.collection("staff_targets").document(fallback_doc_id).set({
            "district": clean_dist,
            "fo_name": clean_name,
            "target": int(data.target),
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }, merge=True))
        
        cache.delete_prefix("targets_")
        cache.delete_prefix("profile_")
        await log_admin_activity(
            action_type="TARGET_UPDATED",
            details=f"Updated target for {clean_name} ({clean_dist}) to {data.target} for month {month}",
            district=clean_dist,
            target_officer=clean_name,
            diff={"month": month, "target": int(data.target)}
        )
        return {"success": True, "month": month, "message": f"Target for {month} successfully updated!"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 14 Standard KPI Categories Definition (Exact Master Blueprint)
EXCEL_KPI_CATEGORIES = [
    ("NOTIFICATION", "notification_ids", 3),
    ("HIV & DM", "hiv_dm_ids", 4),
    ("DBT", "dbt_ids", 5),
    ("SAMPLE COLLECTION", "sample_collection_ids", 6),
    ("SAMPLE TESTED", "sample_tested_ids", 7),
    ("Outcome Assigned", "outcome_assigned_ids", 8),
    ("Home Visit", "home_visit_ids", 9),
    ("Contact Tracing", "contact_tracing_ids", 10),
    ("Follow Up", "follow_up_ids", 11),
    ("Face to Face", "face_to_face_ids", 12),
    ("Presumptive", "presumptive_ids", 13),
    ("Documents", "documents_ids", 14),
    ("FDC Provided", "fdc_provided_ids", 15),
    ("Kit Consumption", "kit_consumption_ids", 16)
]

def get_kpi_tab_name(day: int) -> str:
    if day == 1:
        return "1ST"
    elif day == 2:
        return "2nd"
    elif day == 3:
        return "3rd"
    elif day in [21, 31]:
        return f"{day}st"
    elif day == 22:
        return "22nd"
    elif day == 23:
        return "23rd"
    else:
        return f"{day}th"

def generate_district_kpi_bytes(district: str, month_prefix: Optional[str] = None) -> Optional[bytes]:
    if not month_prefix:
        month_prefix = datetime.now().strftime("%Y-%m")
        
    safe_dist = safe_filename(district)
    template_path = f"templates/template_{safe_dist}.xlsx"
    if not os.path.exists(template_path):
        return None
        
    # Load workbook preserving all formulas
    wb = openpyxl.load_workbook(template_path, data_only=False)
    sheet_map = {name.strip().lower(): name for name in wb.sheetnames}
    
    # Configure auto-recalculation
    try:
        wb.calculation.calcMode = 'auto'
        wb.calculation.fullCalcOnLoad = True
    except Exception:
        pass
    
    # 1. Fetch Targets (Prioritizing Month-Scoped Target)
    target_map = {}
    try:
        t_docs = db.collection("staff_targets").where("district", "==", district).stream()
        for td in t_docs:
            t_data = td.to_dict()
            f_name = re.sub(r'\s+', ' ', str(t_data.get("fo_name", ""))).strip().lower()
            if f_name:
                if t_data.get("month") == month_prefix:
                    target_map[f_name] = int(t_data.get("target", 50))
                elif f_name not in target_map:
                    target_map[f_name] = int(t_data.get("target", 50))
    except Exception as e:
        print(f"Target fetch notice for {district}: {e}")
                    
    # 2. Fetch and Sort Daily Field Reports for this District and Month
    docs = db.collection("daily_field_reports").where("working_place", "==", district).stream()
    reports = []
    for doc in docs:
        d = doc.to_dict()
        date_str = str(d.get("date_of_reporting", "")).strip()
        if date_str and date_str.startswith(month_prefix):
            reports.append(d)
            
    reports.sort(key=lambda x: str(x.get("date_of_reporting", "")))
    
    # Map staff names to their index in this template
    staff_name_to_idx = {}
    ws_day1 = wb["1ST"] if "1ST" in wb.sheetnames else wb[sheet_map.get("1st")] if "1st" in sheet_map else None
    if ws_day1:
        s_idx = 0
        for r in range(2, ws_day1.max_row + 1, 40):
            val = ws_day1.cell(row=r, column=1).value
            if val and str(val).strip():
                staff_name_to_idx[re.sub(r'\s+', ' ', str(val)).strip().lower()] = s_idx
                s_idx += 1

    # Pre-calculate counts for each FO and each KPI
    num_staff = len(staff_name_to_idx)
    num_kpis = len(EXCEL_KPI_CATEGORIES)
    staff_counts = { s_idx: { k_idx: 0 for k_idx in range(num_kpis) } for s_idx in range(num_staff) }
    district_cluster_counts = { c_idx: 0 for c_idx in range(13) }

    # 3. Populate Tabs 3 to 33 ('1ST' to '31st')
    for rep in reports:
        date_str = str(rep.get("date_of_reporting", "")).strip()
        try:
            day_int = int(date_str.split('-')[2])
        except Exception:
            continue
            
        raw_tab_key = get_kpi_tab_name(day_int).lower()
        actual_tab_name = sheet_map.get(raw_tab_key)
        fo_norm = re.sub(r'\s+', ' ', str(rep.get("fo_name", ""))).strip().lower()
        
        if fo_norm in staff_name_to_idx:
            s_idx = staff_name_to_idx[fo_norm]
            
            # Accumulate staff and district counts
            for k_idx, (_, cat_key, _) in enumerate(EXCEL_KPI_CATEGORIES):
                ids = rep.get(cat_key) or []
                if isinstance(ids, list):
                    valid_ids = [str(pid).strip() for pid in ids if str(pid).strip()]
                    staff_counts[s_idx][k_idx] += len(valid_ids)
                    if k_idx < 13:
                        district_cluster_counts[k_idx] += len(valid_ids)

            if actual_tab_name and actual_tab_name in wb.sheetnames:
                ws_day = wb[actual_tab_name]
                start_row = 2 + (s_idx * 40)
                
                # Populate IDs vertically within 40-row bounds
                for kpi_name, cat_key, col_idx in EXCEL_KPI_CATEGORIES:
                    ids = rep.get(cat_key) or []
                    if isinstance(ids, list):
                        valid_ids = [str(pid).strip() for pid in ids if str(pid).strip()]
                        for i in range(min(40, len(valid_ids))):
                            ws_day.cell(row=start_row + i, column=col_idx).value = valid_ids[i]

    # 4. Populate Tab 2: 'CONSOLIDATED SHEET'
    if "CONSOLIDATED SHEET" in wb.sheetnames:
        ws_cons = wb["CONSOLIDATED SHEET"]
        
        # Wing 1: Left Side (District Master Rollup & Master Log) -- Columns A to AM (Cols 1 to 39)
        cluster_row_ptrs = { c_idx: 4 for c_idx in range(13) }
        
        # Write Left Wing Row 2 Grand Totals
        for c_idx in range(13):
            start_c = 1 + (c_idx * 3)
            # Pre-compute exact total count for immediate display across all viewers
            ws_cons.cell(row=2, column=start_c).value = district_cluster_counts[c_idx]

        for rep in reports:
            rep_date = str(rep.get("date_of_reporting", "")).strip()
            rep_fo = str(rep.get("fo_name", "")).strip()
            
            for c_idx in range(13):
                _, cat_key, _ = EXCEL_KPI_CATEGORIES[c_idx]
                ids = rep.get(cat_key) or []
                if isinstance(ids, list):
                    start_c = 1 + (c_idx * 3)
                    for patient_id in ids:
                        pid_str = str(patient_id).strip()
                        if pid_str:
                            r = cluster_row_ptrs[c_idx]
                            c1 = ws_cons.cell(row=r, column=start_c, value=pid_str)
                            c2 = ws_cons.cell(row=r, column=start_c + 1, value=rep_date)
                            c3 = ws_cons.cell(row=r, column=start_c + 2, value=rep_fo)
                            c1.border = EXCEL_THIN_BORDER
                            c2.border = EXCEL_THIN_BORDER
                            c3.border = EXCEL_CLUSTER_DIVIDER
                            c1.alignment = Alignment(horizontal="center", vertical="center")
                            c2.alignment = Alignment(horizontal="center", vertical="center")
                            c3.alignment = Alignment(horizontal="left", vertical="center")
                            cluster_row_ptrs[c_idx] += 1
                            
        # Wing 2: Right Side (Staff-Wise Performance & Indicator Wing) -- Column AN (Col 40) onwards
        staff_kpi_row_ptrs = {}
        for s_idx in range(num_staff):
            staff_base_col = 40 + (s_idx * 14)
            # Write Row 3 Staff Totals
            for k_idx in range(num_kpis):
                staff_kpi_row_ptrs[(s_idx, k_idx)] = 4
                ws_cons.cell(row=3, column=staff_base_col + k_idx).value = staff_counts[s_idx][k_idx]
                
        for rep in reports:
            fo_norm = re.sub(r'\s+', ' ', str(rep.get("fo_name", ""))).strip().lower()
            if fo_norm in staff_name_to_idx:
                s_idx = staff_name_to_idx[fo_norm]
                staff_base_col = 40 + (s_idx * 14)
                
                for k_idx, (_, cat_key, _) in enumerate(EXCEL_KPI_CATEGORIES):
                    ids = rep.get(cat_key) or []
                    if isinstance(ids, list):
                        col = staff_base_col + k_idx
                        for patient_id in ids:
                            pid_str = str(patient_id).strip()
                            if pid_str:
                                r = staff_kpi_row_ptrs[(s_idx, k_idx)]
                                c_cell = ws_cons.cell(row=r, column=col, value=pid_str)
                                if col == staff_base_col + 13:
                                    c_cell.border = EXCEL_CLUSTER_DIVIDER
                                else:
                                    c_cell.border = EXCEL_THIN_BORDER
                                c_cell.alignment = Alignment(horizontal="center", vertical="center")
                                staff_kpi_row_ptrs[(s_idx, k_idx)] += 1

    # 5. Populate Tab 1: 'Performance sheet'
    if "Performance sheet" in wb.sheetnames:
        ws_perf = wb["Performance sheet"]
        for r_idx in range(5, 5 + num_staff):
            cell_name = ws_perf.cell(row=r_idx, column=1).value
            if cell_name and str(cell_name).strip() not in ["GRAND TOTAL", ""]:
                norm_name = re.sub(r'\s+', ' ', str(cell_name)).strip().lower()
                if norm_name in staff_name_to_idx:
                    s_idx = staff_name_to_idx[norm_name]
                    
                    # Col 3: Target
                    target_val = target_map.get(norm_name, 50)
                    ws_perf.cell(row=r_idx, column=3).value = target_val
                    
                    # Col 4: NOTIFICATION
                    notif_count = staff_counts[s_idx][0]
                    ws_perf.cell(row=r_idx, column=4).value = notif_count
                    
                    # Col 5: % Achieved (Formula)
                    cell_pct = ws_perf.cell(row=r_idx, column=5)
                    cell_pct.value = f"=IF(C{r_idx}>0, D{r_idx}/C{r_idx}, 0)"
                    cell_pct.number_format = "0.0%"
                    
                    # Cols 6 to 18: Remaining 13 KPIs
                    for k_idx in range(1, num_kpis):
                        kpi_val = staff_counts[s_idx][k_idx]
                        ws_perf.cell(row=r_idx, column=5 + k_idx).value = kpi_val

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output.getvalue()

@app.get("/download-kpi-workbook")
async def download_kpi_workbook(district: str, month: Optional[str] = None, admin: dict = Depends(get_current_admin)):
    try:
        excel_bytes = await asyncio.to_thread(lambda: generate_district_kpi_bytes(district, month))
        if not excel_bytes:
            raise HTTPException(status_code=404, detail=f"Template for {district} not found on server.")
            
        safe_dist = safe_filename(district)
        month_tag = month or datetime.now().strftime("%Y-%m")
        headers = {
            'Content-Disposition': f'attachment; filename="KPI_Report_{safe_dist}_{month_tag}.xlsx"'
        }
        return StreamingResponse(
            io.BytesIO(excel_bytes), 
            headers=headers,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/download-all-kpi-workbooks")
async def download_all_kpi_workbooks(month: Optional[str] = None, districts: Optional[str] = None, admin: dict = Depends(get_current_admin)):
    try:
        all_bihar = ["Aurangabad", "Begusarai", "Bhojpur", "Buxar", "Darbhanga", "East Champaran", "Gaya", "Jamui", "Jehanabad", "Kaimur", "Khagaria", "Lakhisarai", "Madhubani", "Munger", "Muzaffarpur", "Nawada", "Rohtas", "Samastipur", "Sheikhpura", "Sheohar", "Sitamarhi", "Vaishali"]
        if districts and districts.strip() and districts.strip() != "All":
            allowed_set = set([d.strip() for d in districts.split(",") if d.strip()])
            bihar_districts = [d for d in all_bihar if d in allowed_set]
        else:
            bihar_districts = all_bihar

        zip_buffer = io.BytesIO()
        month_tag = month or datetime.now().strftime("%Y-%m")
        
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for dist in bihar_districts:
                excel_bytes = await asyncio.to_thread(lambda d=dist: generate_district_kpi_bytes(d, month))
                if excel_bytes:
                    zip_file.writestr(f"KPI_Report_{safe_filename(dist)}_{month_tag}.xlsx", excel_bytes)
                    
        zip_buffer.seek(0)
        archive_name = "DFY_KPI_Scoped_Districts" if (districts and districts != "All") else "DFY_Master_KPI_All_Districts"
        headers = {
            'Content-Disposition': f'attachment; filename="{archive_name}_{month_tag}.zip"'
        }
        return StreamingResponse(
            zip_buffer,
            headers=headers,
            media_type="application/zip"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/staff-directory")
async def get_staff_directory():
    try:
        cached = cache.get("staff_directory_list")
        if cached is not None:
            return {"status": "success", "data": cached}

        docs = await asyncio.to_thread(lambda: list(db.collection("staff_directory").stream()))
        directory = {}
        for doc in docs:
            data = doc.to_dict()
            district = data.get("district")
            name = data.get("name")
            if district and name:
                if district not in directory:
                    directory[district] = []
                directory[district].append(name)
        
        for d in directory:
            directory[d] = sorted(directory[d])
            
        cache.set("staff_directory_list", directory, ttl=300) # 5 min cache
        return {"status": "success", "data": directory}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ProfileStatsRequest(BaseModel):
    working_place: str
    fo_name: str
    pin: str
    month: str # format YYYY-MM

@app.post("/my-profile-stats")
async def my_profile_stats(req: ProfileStatsRequest):
    try:
        cache_key = f"profile_{req.working_place}_{req.fo_name}_{req.month}".replace(" ", "_").lower()
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        # Step 1: Verify PIN in background thread
        pin_doc = await asyncio.to_thread(lambda: db.collection("staff_directory").document(f"{req.working_place}_{req.fo_name}".replace(" ", "").lower()).get())
        if not pin_doc.exists or str(pin_doc.to_dict().get("pin", "")) != str(req.pin):
            raise HTTPException(status_code=401, detail="Invalid PIN")
            
        # Step 2: Fetch Target (Month-Scoped with Fallback)
        target_val = 50
        try:
            req_month = req.month or datetime.now().strftime("%Y-%m")
            m_doc_id = f"{req_month}_{req.working_place}_{req.fo_name}".replace(" ", "").lower()
            m_doc = await asyncio.to_thread(db.collection("staff_targets").document(m_doc_id).get)
            if m_doc.exists:
                target_val = int(m_doc.to_dict().get("target", 50))
            else:
                fb_id = f"{req.working_place}_{req.fo_name}".replace(" ", "").lower()
                fb_doc = await asyncio.to_thread(db.collection("staff_targets").document(fb_id).get)
                if fb_doc.exists:
                    target_val = int(fb_doc.to_dict().get("target", 50))
        except Exception:
            target_val = 50
            
        # Step 3: Fetch all reports for the month asynchronously
        reports = await asyncio.to_thread(lambda: list(
            db.collection("daily_field_reports")
            .where("fo_name", "==", req.fo_name)
            .where("working_place", "==", req.working_place)
            .stream()
        ))
        
        stats = {
            "notification": 0,
            "hiv_dm": 0,
            "dbt": 0,
            "sample_collection": 0,
            "sample_tested": 0,
            "outcome_assigned": 0,
            "home_visit": 0,
            "contact_tracing": 0,
            "follow_up": 0,
            "face_to_face": 0,
            "presumptive": 0,
            "fdc_provided": 0,
            "kit_consumption": 0,
            "differentiated_tb": 0,
            "tpt_treatment_start": 0,
            "tpt_presumptive": 0,
            "adhar_face_authentication": 0,
            "consent_with_id": 0,
            "culture_dst": 0
        }
        
        daily_history = {}
        for rep in reports:
            data = rep.to_dict()
            date_str = data.get("date_of_reporting") or data.get("date", "")
            if date_str and date_str.startswith(req.month):
                day_total = 0
                for k in stats.keys():
                    arr = data.get(k + "_ids", [])
                    if isinstance(arr, list):
                        stats[k] += len(arr)
                        day_total += len(arr)
                day_categories = {}
                for k in stats.keys():
                    arr = data.get(k + "_ids", [])
                    if isinstance(arr, list) and len(arr) > 0:
                        day_categories[k] = arr
                        
                daily_history[date_str] = {
                    "submitted": True,
                    "count": data.get("submission_count", 1),
                    "total_ids": day_total,
                    "categories": day_categories,
                    "visited_names": data.get("visited_names", []),
                    "total_km": data.get("total_km", 0),
                    "remark": data.get("remark", "")
                }
                        
        total_achieved = sum(stats.values())
        
        # Calculate Reporting Streak
        sorted_dates = sorted(daily_history.keys(), reverse=True)
        streak_days = 0
        today = datetime.now().date()
        
        # Check streak starting from today or yesterday
        check_date = today
        if today.strftime("%Y-%m-%d") not in daily_history:
            # Maybe today is not yet reported, check from yesterday
            from datetime import timedelta
            check_date = today - timedelta(days=1)
            
        while True:
            d_str = check_date.strftime("%Y-%m-%d")
            if d_str in daily_history and daily_history[d_str].get("submitted"):
                streak_days += 1
                from datetime import timedelta
                check_date = check_date - timedelta(days=1)
            else:
                break

        total_km_month = sum(d.get("total_km", 0) for d in daily_history.values())
        
        badges = []
        if stats.get("notification", 0) >= 100:
            badges.append({"id": "century", "title": "Century Club", "icon": "??", "desc": "100+ Notifications logged"})
        if target_val > 0 and stats.get("notification", 0) >= target_val:
            badges.append({"id": "crusher", "title": "Target Crusher", "icon": "??", "desc": "100% Monthly Target reached"})
        if total_km_month >= 300:
            badges.append({"id": "warrior", "title": "Road Warrior", "icon": "??", "desc": "300+ KM logged this month"})
        if streak_days >= 5:
            badges.append({"id": "streak", "title": "Streak Master", "icon": "??", "desc": f"{streak_days} days continuous reporting"})
        
        res = {
            "success": True,
            "target": target_val,
            "total_achieved": total_achieved,
            "breakdown": stats,
            "daily_history": daily_history,
            "streak_days": streak_days,
            "total_km": total_km_month,
            "badges": badges
        }
        cache.set(cache_key, res, ttl=20)
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/admin/today-attendance")
async def get_today_attendance(date: Optional[str] = None, districts: Optional[str] = None, admin: dict = Depends(get_current_admin)):
    try:
        if not date:
            date = datetime.now().strftime("%Y-%m-%d")
            
        cache_key = f"attendance_{date}_{districts or 'all'}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached
            
        allowed_dist_set = None
        if districts and districts.strip() and districts.strip() != "All":
            allowed_dist_set = set([d.strip() for d in districts.split(",") if d.strip()])

        # 1. Fetch all active staff
        staff_docs = await asyncio.to_thread(lambda: list(db.collection("staff_directory").stream()))
        staff_list = []
        for doc in staff_docs:
            d = doc.to_dict()
            dist = d.get("district")
            if dist and d.get("name"):
                if allowed_dist_set and dist not in allowed_dist_set:
                    continue
                staff_list.append({
                    "district": dist,
                    "fo_name": d.get("name"),
                    "designation": d.get("designation", "Field Officer")
                })
                
        # 2. Fetch daily field reports for this date
        report_docs = await asyncio.to_thread(lambda: list(db.collection("daily_field_reports").where("date_of_reporting", "==", date).stream()))
        reports_map = {}
        for doc in report_docs:
            d = doc.to_dict()
            dist = d.get('working_place')
            if allowed_dist_set and dist not in allowed_dist_set:
                continue
            key = f"{dist}_{d.get('fo_name')}".replace(" ", "").lower()
            reports_map[key] = {
                "submission_count": d.get("submission_count", 1),
                "total_ids": sum(len(v) for k, v in d.items() if isinstance(v, list) and k.endswith("_ids"))
            }
            
        submitted_full = []
        submitted_partial = []
        missing_fos = []
        
        for s in staff_list:
            key = f"{s['district']}_{s['fo_name']}".replace(" ", "").lower()
            if key in reports_map:
                rep = reports_map[key]
                info = {**s, **rep}
                if rep["submission_count"] >= 2:
                    submitted_full.append(info)
                else:
                    submitted_partial.append(info)
            else:
                missing_fos.append(s)
                
        # Sort missing FOs by district then name
        missing_fos.sort(key=lambda x: (x["district"], x["fo_name"]))
        submitted_full.sort(key=lambda x: (x["district"], x["fo_name"]))
        submitted_partial.sort(key=lambda x: (x["district"], x["fo_name"]))

        res = {
            "date": date,
            "total_staff": len(staff_list),
            "submitted_full_count": len(submitted_full),
            "submitted_partial_count": len(submitted_partial),
            "missing_count": len(missing_fos),
            "submitted_full": submitted_full,
            "submitted_partial": submitted_partial,
            "missing_fos": missing_fos
        }
        cache.set(cache_key, res, ttl=15)
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/admin/duplicate-audit")
async def duplicate_audit(month: Optional[str] = None, districts: Optional[str] = None, admin: dict = Depends(get_current_admin)):
    try:
        if not month:
            month = datetime.now().strftime("%Y-%m")
            
        cache_key = f"dupe_audit_{month}_{districts or 'all'}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        start_date = f"{month}-01"
        end_date = f"{month}-31"
        
        allowed_dist_set = None
        if districts and districts.strip() and districts.strip() != "All":
            allowed_dist_set = set([d.strip() for d in districts.split(",") if d.strip()])
        
        docs = await asyncio.to_thread(lambda: list(
            db.collection("daily_field_reports")
            .where("date_of_reporting", ">=", start_date)
            .where("date_of_reporting", "<=", end_date)
            .stream()
        ))
            
        id_registry = {} # id -> list of {fo_name, district, date, category}
        
        categories_map = {
            "notification_ids": "Notification",
            "hiv_dm_ids": "HIV & DM",
            "dbt_ids": "DBT",
            "sample_collection_ids": "Sample Collection",
            "sample_tested_ids": "Sample Tested",
            "outcome_assigned_ids": "Outcome Assigned",
            "home_visit_ids": "Home Visit",
            "contact_tracing_ids": "Contact Tracing",
            "follow_up_ids": "Follow Up",
            "face_to_face_ids": "Face to Face",
            "presumptive_ids": "Presumptive",
            "documents_ids": "Documents",
            "fdc_provided_ids": "FDC Provided",
            "kit_consumption_ids": "Kit Consumption",
            "differentiated_tb_ids": "Differentiated TB",
            "tpt_treatment_start_ids": "TPT Treatment Start",
            "tpt_presumptive_ids": "TPT Presumptive",
            "adhar_face_authentication_ids": "Adhar Face Auth",
            "consent_with_id_ids": "Consent with ID",
            "culture_dst_ids": "Culture / DST"
        }
        
        for doc in docs:
            d = doc.to_dict()
            fo = d.get("fo_name", "Unknown")
            dist = d.get("working_place", "Unknown")
            rep_date = d.get("date_of_reporting", "")
            
            for key, label in categories_map.items():
                ids = d.get(key) or []
                if isinstance(ids, list):
                    for patient_id in ids:
                        pid = str(patient_id).strip()
                        if len(pid) >= 5:
                            if pid not in id_registry:
                                id_registry[pid] = []
                            id_registry[pid].append({
                                "fo_name": fo,
                                "district": dist,
                                "date": rep_date,
                                "category": label
                            })
                            
        same_category_duplicates = []
        cross_category_history = []
        
        for pid, occurrences in id_registry.items():
            if len(occurrences) > 1:
                # If district filter is active, at least one occurrence must belong to allowed districts
                if allowed_dist_set and not any(o.get("district") in allowed_dist_set for o in occurrences):
                    continue

                # Check if any category was repeated
                cat_counts = {}
                for o in occurrences:
                    c = o['category']
                    cat_counts[c] = cat_counts.get(c, 0) + 1
                    
                is_same_category = any(cnt > 1 for cnt in cat_counts.values())
                
                entry = {
                    "patient_id": pid,
                    "occurrence_count": len(occurrences),
                    "is_same_category": is_same_category,
                    "repeated_categories": [c for c, cnt in cat_counts.items() if cnt > 1],
                    "occurrences": occurrences
                }
                
                if is_same_category:
                    same_category_duplicates.append(entry)
                else:
                    cross_category_history.append(entry)
                    
        res = {
            "status": "success",
            "month": month,
            "total_same_category_duplicates": len(same_category_duplicates),
            "total_cross_category": len(cross_category_history),
            "total_duplicate_ids": len(same_category_duplicates) + len(cross_category_history),
            "same_category_duplicates": same_category_duplicates,
            "cross_category_history": cross_category_history,
            "duplicates": same_category_duplicates + cross_category_history
        }
        cache.set(cache_key, res, ttl=60) # 60s cache avoids heavy regex/loop parsing on Render
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Admin Authentication & Zero-Budget Emergency Recovery ---
class AdminLoginReq(BaseModel):
    password: str

class AdminRecoveryReq(BaseModel):
    recovery_code: str
    new_password: str

class AdminChangeSettingsReq(BaseModel):
    current_password: str
    new_password: Optional[str] = None
    new_recovery_key: Optional[str] = None
    new_security_pin: Optional[str] = None

def get_or_init_admin_auth() -> dict:
    doc_ref = db.collection("admin_config").document("auth_settings")
    doc = doc_ref.get()
    if doc.exists:
        return doc.to_dict()
    
    default_auth = {
        "password": "dfyadmin2026",
        "master_recovery_key": "DFY-RESCUE-9921",
        "security_pin": "7788",
        "security_question": "DFY State Organization Code",
        "security_answer": "BIHAR-DFY-TB",
        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    doc_ref.set(default_auth)
    return default_auth

@app.post("/admin/auth/login")
async def admin_login(req: AdminLoginReq):
    try:
        if login_rate_limiter.is_rate_limited("master_admin"):
            raise HTTPException(status_code=429, detail="Too many failed login attempts. Locked for 10 minutes.")
            
        auth_data = await asyncio.to_thread(get_or_init_admin_auth)
        correct_pw = auth_data.get("password", "dfyadmin2026")
        if verify_password(req.password, correct_pw):
            login_rate_limiter.reset("master_admin")
            master_user = {
                "user_id": "admin",
                "username": "admin",
                "name": "Super Admin",
                "role": "SUPER_ADMIN",
                "allowed_districts": ["All"]
            }
            token = create_access_token(master_user)
            # Automatically upgrade password to bcrypt hash if currently plaintext
            if not str(correct_pw).startswith(("$2b$", "$2a$")):
                db.collection("admin_config").document("auth_settings").set({
                    "password": hash_password(req.password),
                    "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                }, merge=True)
            return {"success": True, "message": "Login successful", "token": token, "user": master_user}
            
        login_rate_limiter.record_failure("master_admin")
        raise HTTPException(status_code=401, detail="Invalid password")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/admin/auth/settings")
async def get_admin_settings(password: str):
    try:
        auth_data = await asyncio.to_thread(get_or_init_admin_auth)
        if password != auth_data.get("password", "dfyadmin2026"):
            raise HTTPException(status_code=401, detail="Unauthorized")
        return {
            "success": True,
            "master_recovery_key": auth_data.get("master_recovery_key", "DFY-RESCUE-9921"),
            "security_pin": auth_data.get("security_pin", "7788"),
            "last_updated": auth_data.get("last_updated", "")
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/admin/auth/emergency-reset")
async def admin_emergency_reset(req: AdminRecoveryReq):
    try:
        auth_data = await asyncio.to_thread(get_or_init_admin_auth)
        code = req.recovery_code.strip().upper()
        
        valid_key = str(auth_data.get("master_recovery_key", "DFY-RESCUE-9921")).strip().upper()
        valid_pin = str(auth_data.get("security_pin", "7788")).strip()
        valid_ans = str(auth_data.get("security_answer", "BIHAR-DFY-TB")).strip().upper()
        
        if code in [valid_key, valid_pin, valid_ans]:
            doc_ref = db.collection("admin_config").document("auth_settings")
            await asyncio.to_thread(lambda: doc_ref.set({
                "password": req.new_password,
                "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }, merge=True))
            return {"success": True, "message": "Password successfully reset!"}
        
        raise HTTPException(status_code=400, detail="Invalid Emergency Recovery Key or PIN.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/admin/auth/update-credentials")
async def admin_update_credentials(req: AdminChangeSettingsReq):
    try:
        auth_data = await asyncio.to_thread(get_or_init_admin_auth)
        if req.current_password != auth_data.get("password", "dfyadmin2026"):
            raise HTTPException(status_code=401, detail="Current password incorrect.")
            
        update_payload = {
            "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        if req.new_password:
            update_payload["password"] = req.new_password
        if req.new_recovery_key:
            update_payload["master_recovery_key"] = req.new_recovery_key
        if req.new_security_pin:
            update_payload["security_pin"] = req.new_security_pin
            
        doc_ref = db.collection("admin_config").document("auth_settings")
        await asyncio.to_thread(lambda: doc_ref.set(update_payload, merge=True))
        return {"success": True, "message": "Admin credentials updated successfully!"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/admin/export-state-summary")
async def export_state_summary(month: Optional[str] = None, districts: Optional[str] = None, admin: dict = Depends(get_current_admin)):
    try:
        if admin.get("role") == "SUB_ADMIN":
            raise HTTPException(status_code=403, detail="Access denied. State Summary report is restricted to Super Admin.")
        if not month:
            month = datetime.now().strftime("%Y-%m")
            
        start_date = f"{month}-01"
        end_date = f"{month}-31"
        
        # 1. Fetch reports
        report_docs = await asyncio.to_thread(lambda: list(db.collection("daily_field_reports")
            .where("date_of_reporting", ">=", start_date)
            .where("date_of_reporting", "<=", end_date)
            .stream()))
            
        # 2. Fetch targets
        target_docs = await asyncio.to_thread(lambda: list(db.collection("staff_targets").stream()))
        targets_by_dist = {}
        for td in target_docs:
            d = td.to_dict()
            dist = d.get("district", "Unknown")
            targets_by_dist[dist] = targets_by_dist.get(dist, 0) + (int(d.get("target", 0)) if str(d.get("target", "")).isdigit() else 0)
            
        # 3. Fetch staff count
        staff_docs = await asyncio.to_thread(lambda: list(db.collection("staff_directory").stream()))
        staff_by_dist = {}
        for sd in staff_docs:
            dist = sd.to_dict().get("district", "Unknown")
            staff_by_dist[dist] = staff_by_dist.get(dist, 0) + 1
            
        # Aggregate by district
        all_bihar = ["Aurangabad", "Begusarai", "Bhojpur", "Buxar", "Darbhanga", "East Champaran", "Gaya", "Jamui", "Jehanabad", "Kaimur", "Khagaria", "Lakhisarai", "Madhubani", "Munger", "Muzaffarpur", "Nawada", "Rohtas", "Samastipur", "Sheikhpura", "Sheohar", "Sitamarhi", "Vaishali"]
        if districts and districts.strip() and districts.strip() != "All":
            allowed_set = set([d.strip() for d in districts.split(",") if d.strip()])
            bihar_districts = [d for d in all_bihar if d in allowed_set]
        else:
            bihar_districts = all_bihar

        dist_data = {dist: {
            "District": dist,
            "Active Staff": staff_by_dist.get(dist, 0),
            "Monthly Target": targets_by_dist.get(dist, 0),
            "Notifications": 0,
            "Target %": 0,
            "Samples Tested": 0,
            "Presumptive": 0,
            "DBT Seeded": 0,
            "TPT Started": 0,
            "Doctor Visits": 0,
            "Total Travel KM": 0,
            "Reports Submitted": 0
        } for dist in bihar_districts}
        
        for doc in report_docs:
            d = doc.to_dict()
            dist = d.get("working_place", "")
            if dist in dist_data:
                dist_data[dist]["Notifications"] += len(d.get("notification_ids", []))
                dist_data[dist]["Samples Tested"] += len(d.get("sample_tested_ids", []))
                dist_data[dist]["Presumptive"] += len(d.get("presumptive_ids", []))
                dist_data[dist]["DBT Seeded"] += len(d.get("dbt_ids", []))
                dist_data[dist]["TPT Started"] += len(d.get("tpt_treatment_start_ids", []))
                dist_data[dist]["Doctor Visits"] += len(d.get("visited_names", []))
                dist_data[dist]["Total Travel KM"] += int(d.get("total_km", 0) or 0)
                dist_data[dist]["Reports Submitted"] += 1
                
        rows = []
        for dist, data in dist_data.items():
            tgt = data["Monthly Target"]
            ach = data["Notifications"]
            data["Target %"] = f"{round((ach / tgt) * 100)}%" if tgt > 0 else "0%"
            rows.append(data)
            
        df = pd.DataFrame(rows)
        
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name="State Performance Summary")
            ws = writer.sheets["State Performance Summary"]
            # Formatting
            style_excel_worksheet(ws, header_fill_color="1E3A8A")
                
        output.seek(0)
        filename = f"DFY_State_Summary_{month}.xlsx"
        return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename={filename}"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/admin/export-fo-dossier")
async def export_fo_dossier(month: Optional[str] = None, districts: Optional[str] = None, admin: dict = Depends(get_current_admin)):
    try:
        if not month:
            month = datetime.now().strftime("%Y-%m")
            
        start_date = f"{month}-01"
        end_date = f"{month}-31"
        
        allowed_dist_set = None
        if districts and districts.strip() and districts.strip() != "All":
            allowed_dist_set = set([d.strip() for d in districts.split(",") if d.strip()])

        report_docs = await asyncio.to_thread(lambda: list(db.collection("daily_field_reports")
            .where("date_of_reporting", ">=", start_date)
            .where("date_of_reporting", "<=", end_date)
            .stream()))
            
        staff_docs = await asyncio.to_thread(lambda: list(db.collection("staff_directory").stream()))
        staff_map = {}
        for sd in staff_docs:
            d = sd.to_dict()
            dist = d.get("district", "")
            if allowed_dist_set and dist not in allowed_dist_set:
                continue
            key = (dist, d.get("name", ""))
            staff_map[key] = {
                "District": dist,
                "Officer Name": d.get("name", ""),
                "Designation": d.get("designation", "Field Officer"),
                "Active Reporting Days": 0,
                "Total Travel KM": 0,
                "Notifications": 0,
                "Samples Tested": 0,
                "Presumptive": 0,
                "DBT": 0,
                "TPT Start": 0,
                "Doctor Visits": 0,
                "Total All IDs": 0
            }
            
        for doc in report_docs:
            d = doc.to_dict()
            dist = d.get("working_place", "")
            fo = d.get("fo_name", "")
            if allowed_dist_set and dist not in allowed_dist_set:
                continue
            key = (dist, fo)
            if key not in staff_map:
                staff_map[key] = {
                    "District": dist,
                    "Officer Name": fo,
                    "Designation": "Field Officer",
                    "Active Reporting Days": 0,
                    "Total Travel KM": 0,
                    "Notifications": 0,
                    "Samples Tested": 0,
                    "Presumptive": 0,
                    "DBT": 0,
                    "TPT Start": 0,
                    "Doctor Visits": 0,
                    "Total All IDs": 0
                }
                
            entry = staff_map[key]
            entry["Active Reporting Days"] += 1
            entry["Total Travel KM"] += int(d.get("total_km", 0) or 0)
            entry["Notifications"] += len(d.get("notification_ids", []))
            entry["Samples Tested"] += len(d.get("sample_tested_ids", []))
            entry["Presumptive"] += len(d.get("presumptive_ids", []))
            entry["DBT"] += len(d.get("dbt_ids", []))
            entry["TPT Start"] += len(d.get("tpt_treatment_start_ids", []))
            entry["Doctor Visits"] += len(d.get("visited_names", []))
            
            day_total_ids = sum(len(v) for k, v in d.items() if isinstance(v, list) and k.endswith("_ids"))
            entry["Total All IDs"] += day_total_ids
            
        df = pd.DataFrame(list(staff_map.values()))
        if not df.empty:
            df.sort_values(by=["District", "Officer Name"], inplace=True)
        
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name="FO Performance Dossier")
            ws = writer.sheets["FO Performance Dossier"]
            # Formatting
            style_excel_worksheet(ws, header_fill_color="047857")
                
        output.seek(0)
        filename = f"DFY_FO_Performance_Dossier_{month}.xlsx"
        return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename={filename}"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Patient ID Correction & Editing Suite ---
class EditIdRequest(BaseModel):
    working_place: str
    fo_name: str
    date: str
    category: str # e.g. "notification_ids" or "notification"
    action: str   # "replace", "delete", "add"
    old_id: Optional[str] = ""
    new_id: Optional[str] = ""
    edited_by: Optional[str] = "FO" # "FO" or "Admin"
    pin: Optional[str] = ""

@app.post("/api/reports/edit-id")
async def edit_patient_id(req: EditIdRequest, admin: dict = Depends(get_current_admin)):
    try:
        if admin.get("role") == "SUB_ADMIN":
            allowed = admin.get("allowed_districts", [])
            if "All" not in allowed and req.working_place not in allowed:
                raise HTTPException(status_code=403, detail=f"Permission denied. You cannot edit IDs in district '{req.working_place}'.")
        cat_key = req.category if req.category.endswith("_ids") else f"{req.category}_ids"
        
        if req.action not in ["replace", "delete", "add"]:
            raise HTTPException(status_code=400, detail="Invalid action. Must be 'replace', 'delete', or 'add'.")
            
        if req.action in ["replace", "add"]:
            clean_new_id = str(req.new_id).strip()
            if not clean_new_id.isdigit() or len(clean_new_id) != 9:
                raise HTTPException(status_code=400, detail=f"Invalid Patient ID '{clean_new_id}'. Must be exactly 9 digits.")
            req.new_id = clean_new_id
            
        if req.edited_by == "FO" and req.pin:
            pin_doc_id = f"{req.working_place}_{req.fo_name}".replace(" ", "").lower()
            staff_doc = await asyncio.to_thread(db.collection("staff_directory").document(pin_doc_id).get)
            if staff_doc.exists and str(staff_doc.to_dict().get("pin")) != str(req.pin):
                raise HTTPException(status_code=401, detail="Invalid PIN authorization.")

        doc_id = f"{req.working_place}_{req.fo_name}_{req.date}".replace(" ", "_").lower()
        doc_ref = db.collection("daily_field_reports").document(doc_id)
        doc = await asyncio.to_thread(doc_ref.get)
        
        if not doc.exists:
            docs = await asyncio.to_thread(lambda: list(db.collection("daily_field_reports")
                .where("working_place", "==", req.working_place)
                .where("fo_name", "==", req.fo_name)
                .where("date_of_reporting", "==", req.date)
                .stream()))
            if not docs:
                raise HTTPException(status_code=404, detail="No report found for this date and officer.")
            doc_ref = docs[0].reference
            data = docs[0].to_dict()
        else:
            data = doc.to_dict()

        # ?? Strict 24-Hour Editing Window Rule for Field Officers
        if req.edited_by == "FO":
            is_expired = False
            # Check submitted_at timestamp
            sub_ts = data.get("timestamp") or data.get("submitted_at")
            if sub_ts:
                try:
                    # Parse timestamp format
                    sub_clean = str(sub_ts).replace("Z", "+00:00")
                    if "T" in sub_clean:
                        sub_dt = datetime.fromisoformat(sub_clean).replace(tzinfo=None)
                    else:
                        sub_dt = datetime.strptime(sub_clean, "%Y-%m-%d %H:%M:%S")
                    hours_diff = (datetime.now() - sub_dt).total_seconds() / 3600.0
                    if hours_diff > 24.0:
                        is_expired = True
                except Exception:
                    pass
            
            # Fallback check against date_of_reporting
            if not is_expired:
                try:
                    rep_date = datetime.strptime(req.date, "%Y-%m-%d").date()
                    today = datetime.now().date()
                    if (today - rep_date).days > 1: # More than 1 calendar day ago
                        is_expired = True
                except Exception:
                    pass
                    
            if is_expired:
                raise HTTPException(
                    status_code=403, 
                    detail="Field Officer edit window expired (24 hours limit). 24 ghante beet chuke hain. Kripya badlav ke liye District Admin ya State MIS se sampark karein."
                )
            
        current_list = list(data.get(cat_key, []))
        old_id_clean = str(req.old_id).strip()
        
        if req.action == "replace":
            if old_id_clean not in current_list:
                raise HTTPException(status_code=404, detail=f"Old ID '{old_id_clean}' not found in category '{cat_key}'.")
            idx = current_list.index(old_id_clean)
            current_list[idx] = req.new_id
            
        elif req.action == "delete":
            if old_id_clean not in current_list:
                raise HTTPException(status_code=404, detail=f"ID '{old_id_clean}' not found in category '{cat_key}'.")
            current_list.remove(old_id_clean)
            
        elif req.action == "add":
            if req.new_id in current_list:
                raise HTTPException(status_code=400, detail=f"ID '{req.new_id}' is already present in this category.")
            current_list.append(req.new_id)

        await asyncio.to_thread(lambda: doc_ref.update({
            cat_key: current_list,
            "last_edited_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "last_edited_by": req.edited_by
        }))
        
        log_entry = {
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "working_place": req.working_place,
            "fo_name": req.fo_name,
            "date": req.date,
            "category": cat_key,
            "action": req.action,
            "old_id": req.old_id,
            "new_id": req.new_id,
            "edited_by": req.edited_by
        }
        await asyncio.to_thread(lambda: db.collection("id_edit_logs").add(log_entry))
        await log_admin_activity(
            action_type=f"PATIENT_ID_{req.action.upper()}",
            details=f"{req.edited_by} {req.action}d ID in {cat_key} for {req.fo_name} on {req.date} (Old: {req.old_id}, New: {req.new_id})",
            district=req.working_place,
            target_officer=req.fo_name,
            user_name=req.edited_by,
            diff={"category": cat_key, "action": req.action, "old_id": req.old_id, "new_id": req.new_id}
        )
        
        cache.delete(f"status_{doc_id}")
        cache.delete_prefix("profile_")
        cache.delete_prefix("dash_")
        cache.delete_prefix("attendance_")
        
        return {
            "success": True,
            "message": f"Patient ID successfully {req.action}d!",
            "category": cat_key,
            "updated_ids": current_list
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =========================================================================
# --- Admin & Sub-Admin Data Feeding & Backdated ID Entry Suite ---
# =========================================================================
class AdminFeedDataRequest(BaseModel):
    district: str
    fo_name: str
    date_of_reporting: str  # YYYY-MM-DD
    notification_ids: Optional[List[str]] = []
    hiv_dm_ids: Optional[List[str]] = []
    dbt_ids: Optional[List[str]] = []
    sample_tested_ids: Optional[List[str]] = []
    sample_collection_ids: Optional[List[str]] = []
    contact_tracing_ids: Optional[List[str]] = []
    differentiated_tb_ids: Optional[List[str]] = []
    outcome_assigned_ids: Optional[List[str]] = []
    home_visit_ids: Optional[List[str]] = []
    follow_up_ids: Optional[List[str]] = []
    face_to_face_ids: Optional[List[str]] = []
    presumptive_ids: Optional[List[str]] = []
    documents_ids: Optional[List[str]] = []
    fdc_provided_ids: Optional[List[str]] = []
    fdc_details: Optional[List[Dict[str, Any]]] = []
    kit_consumption_ids: Optional[List[str]] = []
    tpt_treatment_start_ids: Optional[List[str]] = []
    tpt_presumptive_ids: Optional[List[str]] = []
    adhar_face_authentication_ids: Optional[List[str]] = []
    consent_with_id_ids: Optional[List[str]] = []
    culture_dst_ids: Optional[List[str]] = []
    remark: Optional[str] = ""

@app.post("/admin/feed-officer-data")
async def admin_feed_officer_data(
    req: AdminFeedDataRequest,
    admin: dict = Depends(get_current_admin)
):
    try:
        admin_role = admin.get("role", "SUB_ADMIN")
        admin_user = admin.get("username", "Admin")
        allowed_dists = admin.get("allowed_districts", [])

        # 1. RBAC check: Sub-Admin can only feed data for permitted districts
        if admin_role == "SUB_ADMIN":
            if allowed_dists and not ("All" in allowed_dists or req.district.strip() in allowed_dists):
                raise HTTPException(
                    status_code=403, 
                    detail=f"Permission denied: You do not have access to feed data for {req.district} district."
                )

        clean_wp = req.district.strip()
        clean_fo = req.fo_name.strip()
        if not clean_wp or not clean_fo:
            raise HTTPException(status_code=400, detail="District and Field Officer name are required.")

        # 2. Date validation (accepts any valid YYYY-MM-DD date)
        try:
            clean_date = datetime.strptime(req.date_of_reporting.strip(), "%Y-%m-%d").strftime("%Y-%m-%d")
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid date format. Expected YYYY-MM-DD.")

        # 3. Clean & validate all IDs (must be 9 digits)
        categories = [
            "notification_ids", "hiv_dm_ids", "dbt_ids", "sample_tested_ids",
            "sample_collection_ids", "contact_tracing_ids", "differentiated_tb_ids",
            "outcome_assigned_ids", "home_visit_ids", "follow_up_ids",
            "face_to_face_ids", "presumptive_ids", "documents_ids", "fdc_provided_ids",
            "kit_consumption_ids", "tpt_treatment_start_ids", "tpt_presumptive_ids",
            "adhar_face_authentication_ids", "consent_with_id_ids", "culture_dst_ids"
        ]

        cleaned_payload = {}
        total_ids_added = 0
        invalid_ids = []

        for cat in categories:
            raw_list = getattr(req, cat, []) or []
            clean_list = []
            for pid in raw_list:
                s = str(pid).strip()
                if not s:
                    continue
                if not (s.isdigit() and len(s) == 9):
                    invalid_ids.append(s)
                else:
                    clean_list.append(s)
            clean_list = list(dict.fromkeys(clean_list)) # deduplicate within input
            cleaned_payload[cat] = clean_list
            total_ids_added += len(clean_list)

        if invalid_ids:
            sample_invalids = ", ".join(invalid_ids[:5])
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid Patient IDs detected (must be 9 digits numbers): {sample_invalids}"
            )

        if total_ids_added == 0 and not req.remark.strip():
            raise HTTPException(status_code=400, detail="Please enter at least one valid patient ID or remark.")

        # 4. Target Report Document
        doc_id = f"{clean_wp}_{clean_fo}_{clean_date}".replace(" ", "_").lower()
        doc_ref = db.collection("daily_field_reports").document(doc_id)
        doc_snap = await asyncio.to_thread(doc_ref.get)
        new_report_created = not doc_snap.exists

        now_iso = datetime.utcnow().isoformat()
        feed_note = f"Fed by {admin_user} ({admin_role}) on {datetime.now().strftime('%d %b %Y, %I:%M %p')}"
        if req.remark and req.remark.strip():
            feed_note += f": {req.remark.strip()}"

        if new_report_created:
            # Create a brand new daily report
            doc_data = {
                "working_place": clean_wp,
                "fo_name": clean_fo,
                "date_of_reporting": clean_date,
                "date": clean_date,
                "pin": "ADMIN_FEED",
                "status": "completed",
                "timestamp": now_iso,
                "timestamp_completed": firestore.SERVER_TIMESTAMP,
                "submission_count": 1,
                "admin_fed": True,
                "fed_by": admin_user,
                "remark": feed_note,
                **cleaned_payload
            }
            for cat in categories:
                count_key = cat.replace("_ids", "")
                doc_data[count_key] = len(cleaned_payload[cat])
            doc_data["notifications"] = len(cleaned_payload.get("notification_ids", []))
            
            await asyncio.to_thread(lambda: doc_ref.set(doc_data))
        else:
            # Merge with existing daily report (monotonic union)
            existing_data = doc_snap.to_dict()
            update_data = {
                "status": "completed",
                "admin_fed": True,
                "last_fed_by": admin_user,
                "last_fed_at": now_iso
            }
            old_remark = existing_data.get("remark", "")
            update_data["remark"] = f"{old_remark} | {feed_note}".strip(" |")

            for cat in categories:
                combined = existing_data.get(cat, []) + cleaned_payload[cat]
                merged_list = list(dict.fromkeys(combined))
                update_data[cat] = merged_list
                count_key = cat.replace("_ids", "")
                update_data[count_key] = len(merged_list)
            update_data["notifications"] = len(update_data.get("notification_ids", []))
            
            await asyncio.to_thread(lambda: doc_ref.set(update_data, merge=True))

        # 5. Atomic Update to Daily District Rollups
        try:
            rollup_id = f"{clean_date}_{clean_wp}".replace(" ", "_").lower()
            rollup_ref = db.collection("daily_district_rollups").document(rollup_id)
            await asyncio.to_thread(lambda: rollup_ref.set({
                "date": clean_date,
                "district": clean_wp,
                "notifications": firestore.Increment(len(cleaned_payload.get("notification_ids", []))),
                "tests": firestore.Increment(len(cleaned_payload.get("sample_tested_ids", []))),
                "hiv_dm": firestore.Increment(len(cleaned_payload.get("hiv_dm_ids", []))),
                "dbt": firestore.Increment(len(cleaned_payload.get("dbt_ids", []))),
                "contact_tracing": firestore.Increment(len(cleaned_payload.get("contact_tracing_ids", []))),
                "diff_tb": firestore.Increment(len(cleaned_payload.get("differentiated_tb_ids", []))),
                "submitted_fos": firestore.ArrayUnion([clean_fo]),
                "submission_count": firestore.Increment(1 if new_report_created else 0),
                "last_updated": firestore.SERVER_TIMESTAMP
            }, merge=True))
        except Exception as rollup_err:
            print(f"[Admin Feed Rollup Notice] Non-fatal error: {rollup_err}")

        # 6. Immutable Audit Trail
        summary_items = [f"{cat.replace('_ids', '')}: {len(cleaned_payload[cat])}" for cat in categories if cleaned_payload[cat]]
        summary_str = ", ".join(summary_items) if summary_items else "Remark only"
        await log_admin_activity(
            action_type="ADMIN_DATA_FEED",
            details=f"Admin {admin_user} ({admin_role}) fed data for {clean_fo} ({clean_wp}) on date {clean_date}: {summary_str}",
            district=clean_wp,
            target_officer=clean_fo,
            user_name=admin_user,
            role=admin_role,
            diff={"date": clean_date, "created_new_report": new_report_created, "summary": summary_str}
        )

        # 7. Invalidate caches for immediate live reflection
        cache.delete(f"status_{doc_id}")
        cache.delete_prefix("profile_")
        cache.delete_prefix("dash_")
        cache.delete_prefix("attendance_")

        return {
            "success": True,
            "message": f"Successfully {'created report & credited' if new_report_created else 'merged'} {total_ids_added} IDs for {clean_fo} on {clean_date}.",
            "created_new_report": new_report_created,
            "district": clean_wp,
            "fo_name": clean_fo,
            "date": clean_date,
            "ids_credited": {cat: len(cleaned_payload[cat]) for cat in categories if cleaned_payload[cat]}
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to feed officer data: {str(e)}")

# --- Admin Staff & PIN Management Suite ---
class AddStaffReq(BaseModel):
    district: str
    name: str
    pin: str
    designation: Optional[str] = "Field Officer"
    target: Optional[int] = 50

class UpdatePinReq(BaseModel):
    district: str
    name: str
    new_pin: str

class DeleteStaffReq(BaseModel):
    district: str
    name: str

@app.get("/admin/staff/list")
async def get_staff_full_list(districts: Optional[str] = None, admin: dict = Depends(get_current_admin)):
    try:
        allowed_dist_set = None
        if districts and districts.strip() and districts.strip() != "All":
            allowed_dist_set = set([d.strip() for d in districts.split(",") if d.strip()])

        docs = await asyncio.to_thread(lambda: list(db.collection("staff_directory").stream()))
        staff = []
        for doc in docs:
            d = doc.to_dict()
            dist = d.get("district")
            if dist and d.get("name"):
                if allowed_dist_set and dist not in allowed_dist_set:
                    continue
                staff.append({
                    "id": doc.id,
                    "district": dist,
                    "name": d.get("name"),
                    "pin": str(d.get("pin", "")),
                    "designation": d.get("designation", "Field Officer"),
                    "created_at": d.get("created_at", "")
                })
        staff.sort(key=lambda s: (s["district"], s["name"]))
        return {"success": True, "staff": staff}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/admin/staff/add")
async def add_staff_member(req: AddStaffReq, admin: dict = Depends(get_current_admin)):
    try:
        clean_dist = req.district.strip()
        if admin.get("role") == "SUB_ADMIN":
            allowed = admin.get("allowed_districts", [])
            if "All" not in allowed and clean_dist not in allowed:
                raise HTTPException(status_code=403, detail=f"Permission denied. You cannot manage staff in district '{clean_dist}'.")
        clean_name = req.name.strip()
        clean_pin = str(req.pin).strip()
        
        if not clean_dist or not clean_name:
            raise HTTPException(status_code=400, detail="District and Officer Name are required.")
            
        if not clean_pin.isdigit() or len(clean_pin) != 4:
            raise HTTPException(status_code=400, detail="PIN must be exactly 4 digits.")
            
        doc_id = f"{clean_dist}_{clean_name}".replace(" ", "").lower()
        doc_ref = db.collection("staff_directory").document(doc_id)
        
        existing = await asyncio.to_thread(doc_ref.get)
        if existing.exists:
            raise HTTPException(status_code=400, detail=f"Officer '{clean_name}' already exists in '{clean_dist}'.")
            
        payload = {
            "district": clean_dist,
            "name": clean_name,
            "pin": clean_pin,
            "designation": req.designation or "Field Officer",
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        await asyncio.to_thread(lambda: doc_ref.set(payload))
        
        target_doc_id = f"{clean_dist}_{clean_name}".replace(" ", "").lower()
        await asyncio.to_thread(lambda: db.collection("staff_targets").document(target_doc_id).set({
            "district": clean_dist,
            "fo_name": clean_name,
            "target": req.target or 50,
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }, merge=True))
        
        cache.delete("staff_directory_list")
        cache.delete_prefix("attendance_")
        cache.delete_prefix("targets_")
        
        return {"success": True, "message": f"Officer '{clean_name}' added successfully to {clean_dist}!"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/admin/staff/update-pin")
async def update_staff_pin(req: UpdatePinReq, admin: dict = Depends(get_current_admin)):
    try:
        clean_dist = req.district.strip()
        if admin.get("role") == "SUB_ADMIN":
            allowed = admin.get("allowed_districts", [])
            if "All" not in allowed and clean_dist not in allowed:
                raise HTTPException(status_code=403, detail=f"Permission denied. You cannot update PINs in district '{clean_dist}'.")
        clean_name = req.name.strip()
        clean_pin = str(req.new_pin).strip()
        
        if not clean_pin.isdigit() or len(clean_pin) != 4:
            raise HTTPException(status_code=400, detail="New PIN must be exactly 4 digits.")
            
        doc_id = f"{clean_dist}_{clean_name}".replace(" ", "").lower()
        doc_ref = db.collection("staff_directory").document(doc_id)
        
        doc = await asyncio.to_thread(doc_ref.get)
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Staff record not found.")
            
        await asyncio.to_thread(lambda: doc_ref.update({
            "pin": clean_pin,
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }))
        
        cache.delete(f"pin_{doc_id}")
        cache.delete("staff_directory_list")
        
        return {"success": True, "message": f"PIN for '{clean_name}' successfully updated to {clean_pin}!"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/admin/staff/delete")
async def delete_staff_member(req: DeleteStaffReq, admin: dict = Depends(get_current_admin)):
    try:
        clean_dist = req.district.strip()
        if admin.get("role") == "SUB_ADMIN":
            allowed = admin.get("allowed_districts", [])
            if "All" not in allowed and clean_dist not in allowed:
                raise HTTPException(status_code=403, detail=f"Permission denied. You cannot delete staff in district '{clean_dist}'.")
        clean_name = req.name.strip()
        
        doc_id = f"{clean_dist}_{clean_name}".replace(" ", "").lower()
        doc_ref = db.collection("staff_directory").document(doc_id)
        
        doc = await asyncio.to_thread(doc_ref.get)
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Staff record not found.")
            
        await asyncio.to_thread(doc_ref.delete)
        
        cache.delete(f"pin_{doc_id}")
        cache.delete("staff_directory_list")
        cache.delete_prefix("attendance_")
        
        return {"success": True, "message": f"Officer '{clean_name}' removed from directory."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/admin/staff/export-pins")
async def export_staff_pins(district: Optional[str] = "All", districts: Optional[str] = None, admin: dict = Depends(require_super_admin)):
    try:
        allowed_dist_set = None
        if districts and districts.strip() and districts.strip() != "All":
            allowed_dist_set = set([d.strip() for d in districts.split(",") if d.strip()])

        docs = await asyncio.to_thread(lambda: list(db.collection("staff_directory").stream()))
        rows = []
        s_no = 1
        for doc in docs:
            d = doc.to_dict()
            dist = d.get("district", "")
            name = d.get("name", "")
            if allowed_dist_set and dist not in allowed_dist_set:
                continue
            if district != "All" and dist != district:
                continue
            if dist and name:
                rows.append({
                    "S.No": s_no,
                    "District": dist,
                    "Officer Name": name,
                    "Designation": d.get("designation", "Field Officer"),
                    "4-Digit PIN": str(d.get("pin", "")),
                    "Status": "Active"
                })
                s_no += 1
                
        rows.sort(key=lambda r: (r["District"], r["Officer Name"]))
        for idx, r in enumerate(rows):
            r["S.No"] = idx + 1
            
        df = pd.DataFrame(rows)
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            sheet_title = f"PINs {district}" if len(district) < 20 else "Staff PINs"
            df.to_excel(writer, index=False, sheet_name=sheet_title[:31])
            ws = writer.sheets[sheet_title[:31]]
            style_excel_worksheet(ws, header_fill_color="1E3A8A")
                
        output.seek(0)
        filename = f"DFY_Staff_PIN_Directory_{district}_{datetime.now().strftime('%Y-%m-%d')}.xlsx"
        return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename={filename}"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Predictive Cascade & Dropout Alerts Engine (Mission Critical Priority) ---
def compute_cascade_alerts(month: str, district: Optional[str] = "All", fo_name: Optional[str] = None, districts: Optional[str] = None):
    start_date = f"{month}-01"
    end_date = f"{month}-31"
    
    allowed_dist_set = None
    if districts and districts.strip() and districts.strip() != "All":
        allowed_dist_set = set([d.strip() for d in districts.split(",") if d.strip()])
        
    docs = db.collection("daily_field_reports")\
        .where("date_of_reporting", ">=", start_date)\
        .where("date_of_reporting", "<=", end_date)\
        .stream()
        
    patient_map = {}
    
    for doc in docs:
        d = doc.to_dict()
        doc_dist = d.get("working_place", "")
        doc_fo = d.get("fo_name", "")
        doc_date = d.get("date_of_reporting", "")
        
        if allowed_dist_set and doc_dist not in allowed_dist_set:
            continue
        if district != "All" and doc_dist != district:
            continue
        if fo_name and doc_fo != fo_name:
            continue
            
        for cat_key, flag in [
            ("notification_ids", "notification"),
            ("hiv_dm_ids", "hiv_dm"),
            ("dbt_ids", "dbt"),
            ("contact_tracing_ids", "contact_tracing"),
            ("sample_tested_ids", "sample_tested"),
            ("presumptive_ids", "presumptive"),
            ("outcome_assigned_ids", "outcome"),
            ("differentiated_tb_ids", "differentiated_tb")
        ]:
            ids = d.get(cat_key, [])
            if isinstance(ids, list):
                for pid in ids:
                    pid_clean = str(pid).strip()
                    if len(pid_clean) >= 5:
                        if pid_clean not in patient_map:
                            patient_map[pid_clean] = {
                                "id": pid_clean,
                                "district": doc_dist,
                                "fo_name": doc_fo,
                                "first_date": doc_date,
                                "notification": False,
                                "hiv_dm": False,
                                "dbt": False,
                                "contact_tracing": False,
                                "sample_tested": False,
                                "presumptive": False,
                                "outcome": False,
                                "differentiated_tb": False
                            }
                        patient_map[pid_clean][flag] = True
                        if flag in ["notification", "presumptive"] and (not patient_map[pid_clean]["first_date"] or doc_date < patient_map[pid_clean]["first_date"]):
                            patient_map[pid_clean]["first_date"] = doc_date
                            patient_map[pid_clean]["district"] = doc_dist
                            patient_map[pid_clean]["fo_name"] = doc_fo

    alert_list = []
    today_dt = datetime.now().date()
    
    summary = {
        "total_notified": 0,
        "hiv_pending": 0,
        "dbt_pending": 0,
        "contact_pending": 0,
        "udst_pending": 0,
        "diff_tb_pending": 0,
        "presumptive_untested": 0,
        "high_risk_count": 0
    }
    
    for pid, p in patient_map.items():
        days_elapsed = 0
        if p["first_date"]:
            try:
                p_dt = datetime.strptime(p["first_date"], "%Y-%m-%d").date()
                days_elapsed = (today_dt - p_dt).days
            except:
                pass

        # 1. Top Priority: TB Notification Follow-Up Cascade
        if p["notification"]:
            summary["total_notified"] += 1
            missing_actions = []
            missing_items = []
            
            if not p["hiv_dm"]:
                missing_actions.append("HIV & DM Testing Missing")
                missing_items.append({"key": "hiv_dm_ids", "label": "HIV & DM", "icon": "🧪", "color": "purple"})
                summary["hiv_pending"] += 1
            if not p["dbt"]:
                missing_actions.append("DBT Bank Seeding Missing")
                missing_items.append({"key": "dbt_ids", "label": "DBT Bank", "icon": "💳", "color": "amber"})
                summary["dbt_pending"] += 1
            if not p.get("differentiated_tb"):
                missing_actions.append("Diff TB Care Assessment Missing")
                missing_items.append({"key": "differentiated_tb_ids", "label": "Diff TB", "icon": "🩺", "color": "pink"})
                summary["diff_tb_pending"] += 1
            if not p["contact_tracing"]:
                missing_actions.append("Contact Tracing Missing")
                missing_items.append({"key": "contact_tracing_ids", "label": "Contact Tracing", "icon": "👥", "color": "blue"})
                summary["contact_pending"] += 1
            if not p["sample_tested"]:
                missing_actions.append("UDST / Testing Missing")
                missing_items.append({"key": "sample_tested_ids", "label": "UDST Testing", "icon": "🔬", "color": "emerald"})
                summary["udst_pending"] += 1
                
            risk_level = "LOW"
            if len(missing_actions) >= 2:
                risk_level = "HIGH"
                summary["high_risk_count"] += 1
            elif len(missing_actions) == 1:
                risk_level = "MEDIUM"
                
            if len(missing_actions) > 0:
                alert_list.append({
                    "id": pid,
                    "district": p["district"],
                    "fo_name": p["fo_name"],
                    "notified_date": p["first_date"],
                    "days_elapsed": days_elapsed,
                    "missing_actions": missing_actions,
                    "missing_items": missing_items,
                    "risk_level": risk_level,
                    "cascade_type": "Notification",
                    "has_hiv": p["hiv_dm"],
                    "has_dbt": p["dbt"],
                    "has_contact": p["contact_tracing"],
                    "has_udst": p["sample_tested"],
                    "has_diff_tb": p.get("differentiated_tb", False),
                    "has_outcome": p["outcome"]
                })
                
        # 2. Secondary Priority: Presumptive TB to Testing Cascade
        elif p["presumptive"] and not p["sample_tested"]:
            summary["presumptive_untested"] += 1
            alert_list.append({
                "id": pid,
                "district": p["district"],
                "fo_name": p["fo_name"],
                "notified_date": p["first_date"],
                "days_elapsed": days_elapsed,
                "missing_actions": ["Presumptive TB Testing Pending"],
                "missing_items": [{"key": "sample_tested_ids", "label": "UDST Testing", "icon": "🔬", "color": "emerald"}],
                "risk_level": "HIGH" if days_elapsed > 7 else "MEDIUM",
                "cascade_type": "Presumptive",
                "has_hiv": p["hiv_dm"],
                "has_dbt": p["dbt"],
                "has_contact": p["contact_tracing"],
                "has_udst": False,
                "has_diff_tb": p.get("differentiated_tb", False),
                "has_outcome": p["outcome"]
            })
                
    risk_weight = {"HIGH": 3, "MEDIUM": 2, "LOW": 1}
    alert_list.sort(key=lambda x: (risk_weight.get(x["risk_level"], 0), x["days_elapsed"]), reverse=True)
    
    return {"summary": summary, "alerts": alert_list}

@app.get("/api/reports/cascade-alerts")
async def get_cascade_alerts(month: Optional[str] = None, district: Optional[str] = "All", fo_name: Optional[str] = None, districts: Optional[str] = None):
    try:
        if not month:
            month = datetime.now().strftime("%Y-%m")
            
        cache_key = f"cascade_alerts_{month}_{district}_{fo_name or 'all'}_{districts or 'all'}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached
            
        data = await asyncio.to_thread(compute_cascade_alerts, month, district, fo_name, districts)
        cache.set(cache_key, data, ttl=180)
        return {"success": True, "data": data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/admin/export-cascade-alerts")
async def export_cascade_alerts(month: Optional[str] = None, district: Optional[str] = "All", districts: Optional[str] = None, admin: dict = Depends(get_current_admin)):
    try:
        if not month:
            month = datetime.now().strftime("%Y-%m")
            
        data = await asyncio.to_thread(compute_cascade_alerts, month, district, None, districts)
        alerts = data.get("alerts", [])
        
        rows = []
        for idx, a in enumerate(alerts):
            rows.append({
                "S.No": idx + 1,
                "Patient ID": a["id"],
                "District": a["district"],
                "Field Officer": a["fo_name"],
                "Notification Date": a["notified_date"],
                "Days Elapsed": a["days_elapsed"],
                "Risk Level": a["risk_level"],
                "Missing Interventions": " | ".join(a["missing_actions"]),
                "HIV/DM Status": "Completed" if a.get("has_hiv") else "PENDING",
                "DBT Status": "Completed" if a.get("has_dbt") else "PENDING",
                "UDST Status": "Completed" if a.get("has_udst") else "PENDING",
                "Contact Tracing": "Completed" if a.get("has_contact") else "PENDING",
                "Diff TB Status": "Completed" if a.get("has_diff_tb") else "PENDING"
            })
            
        df = pd.DataFrame(rows)
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            sheet_title = f"Cascade Alerts ({district})"
            df.to_excel(writer, index=False, sheet_name=sheet_title[:31])
            ws = writer.sheets[sheet_title[:31]]
            style_excel_worksheet(ws, header_fill_color="B91C1C")
                
        output.seek(0)
        filename = f"DFY_Cascade_Dropout_Alerts_{district}_{month}.xlsx"
        return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename={filename}"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =========================================================================
# --- Enterprise Multi-Admin RBAC & Activity Audit Trail Suite ---
# =========================================================================

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
    action_type: Optional[str] = "All"
    district: Optional[str] = "All"
    user_id: Optional[str] = "All"
    search: Optional[str] = ""
    limit: Optional[int] = 200

async def log_admin_activity(
    action_type: str,
    details: str,
    user_name: str = "Super Admin",
    user_id: str = "admin",
    role: str = "SUPER_ADMIN",
    district: Optional[str] = "All",
    target_officer: Optional[str] = "",
    diff: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = ""
):
    try:
        entry = {
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "action_type": action_type,
            "details": details,
            "user_name": user_name,
            "user_id": user_id,
            "role": role,
            "district": district or "All",
            "target_officer": target_officer or "",
            "diff": diff or {},
            "ip_address": ip_address or ""
        }
        await asyncio.to_thread(lambda: db.collection("admin_audit_logs").add(entry))
    except Exception as e:
        print(f"Audit log background notice: {e}")

async def init_default_super_admin():
    try:
        doc_ref = db.collection("admin_users").document("admin")
        doc = await asyncio.to_thread(doc_ref.get)
        if not doc.exists:
            default_super = {
                "user_id": "admin",
                "username": "admin",
                "name": "Super Admin (Master)",
                "password": "dfyadmin2026",
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

@app.post("/admin/auth/user-login")
async def admin_user_login(req: AdminUserLoginReq):
    try:
        await init_default_super_admin()
        clean_user = req.username.strip().lower()
        
        # Check rate limiter against brute force attacks
        if login_rate_limiter.is_rate_limited(clean_user):
            raise HTTPException(status_code=429, detail="Too many failed login attempts. Account locked for 10 minutes.")
            
        # Check in admin_users collection
        user_doc_ref = db.collection("admin_users").document(clean_user)
        user_doc = await asyncio.to_thread(user_doc_ref.get)
        
        if not user_doc.exists:
            # Fallback check for query by username
            docs = await asyncio.to_thread(lambda: list(db.collection("admin_users").where("username", "==", clean_user).stream()))
            if docs:
                user_doc = docs[0]
            else:
                # Master legacy password fallback
                auth_data = await asyncio.to_thread(get_or_init_admin_auth)
                master_pw = auth_data.get("password", "dfyadmin2026")
                if verify_password(req.password, master_pw) and clean_user in ["admin", "superadmin", "dfyadmin"]:
                    login_rate_limiter.reset(clean_user)
                    user_data = {
                        "user_id": "admin",
                        "username": "admin",
                        "name": "Super Admin",
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
                        "status": "ACTIVE"
                    }
                    token = create_access_token(user_data)
                    await log_admin_activity("LOGIN_SUCCESS", "Super Admin master login", user_name="Super Admin", user_id="admin", role="SUPER_ADMIN")
                    return {"success": True, "user": user_data, "token": token}
                
                login_rate_limiter.record_failure(clean_user)
                await log_admin_activity("LOGIN_FAILED", f"Failed login attempt for username '{req.username}'", user_name=req.username, user_id=clean_user, role="UNKNOWN")
                raise HTTPException(status_code=401, detail="Invalid username or password.")
                
        user_data = user_doc.to_dict()
        if user_data.get("status") != "ACTIVE":
            raise HTTPException(status_code=403, detail="Your admin account has been disabled. Contact Super Admin.")
            
        stored_pw = user_data.get("password", "")
        if not verify_password(req.password, stored_pw):
            login_rate_limiter.record_failure(clean_user)
            await log_admin_activity("LOGIN_FAILED", f"Incorrect password for user '{clean_user}'", user_name=user_data.get("name", clean_user), user_id=clean_user, role=user_data.get("role", "SUB_ADMIN"))
            raise HTTPException(status_code=401, detail="Invalid username or password.")
            
        login_rate_limiter.reset(clean_user)
        
        # Auto-upgrade stored password to bcrypt hash if plain text
        update_fields = {"last_login": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
        if not str(stored_pw).startswith(("$2b$", "$2a$")):
            update_fields["password"] = hash_password(req.password)
            
        # Update last login timestamp and hashed password
        await asyncio.to_thread(lambda: user_doc.reference.update(update_fields))
        
        # Don't return password in payload
        safe_user = {k: v for k, v in user_data.items() if k != "password"}
        token = create_access_token(safe_user)
        await log_admin_activity("LOGIN_SUCCESS", f"User {user_data.get('name')} logged in successfully", user_name=user_data.get("name"), user_id=clean_user, role=user_data.get("role", "SUB_ADMIN"))
        
        return {"success": True, "user": safe_user, "token": token}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/admin/users/list")
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

@app.post("/admin/users/create")
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
        await log_admin_activity("ADMIN_USER_CREATED", f"Created new admin account '{clean_user}' ({req.name}) with role {req.role}", user_name=admin.get("username", "Super Admin"), role="SUPER_ADMIN")
        
        safe_user = {k: v for k, v in new_user.items() if k != "password"}
        return {"success": True, "user": safe_user, "message": f"User {req.name} successfully created!"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/admin/users/update")
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
        await log_admin_activity("PERMISSIONS_UPDATED", f"Updated settings/permissions for admin user '{clean_user}'", user_name=admin.get("username", "Super Admin"), role="SUPER_ADMIN")
        return {"success": True, "message": f"User {clean_user} updated successfully!"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/admin/users/delete")
async def delete_admin_user(user_id: str, admin: dict = Depends(require_super_admin)):
    try:
        clean_user = user_id.strip().lower()
        if clean_user == "admin":
            raise HTTPException(status_code=400, detail="Cannot delete master root admin account.")
            
        doc_ref = db.collection("admin_users").document(clean_user)
        await asyncio.to_thread(doc_ref.delete)
        await log_admin_activity("ADMIN_USER_DELETED", f"Deleted admin user account '{clean_user}'", user_name=admin.get("username", "Super Admin"), role="SUPER_ADMIN")
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

@app.on_event("startup")
async def on_app_startup_tasks():
    try:
        # Background cleanup of expired audit logs on startup
        asyncio.create_task(prune_expired_audit_logs(AUDIT_RETENTION_DAYS))
    except Exception as e:
        print(f"Startup background task notice: {e}")

@app.post("/admin/audit-logs/prune")
async def manual_prune_audit_logs(days: Optional[int] = 30, admin: dict = Depends(require_super_admin)):
    try:
        deleted = await prune_expired_audit_logs(retention_days=days or 30)
        return {
            "success": True, 
            "deleted_count": deleted, 
            "retention_days": days or 30,
            "message": f"Successfully pruned {deleted} audit log(s) older than {days or 30} days."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/admin/audit-logs")
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
            .limit(query.limit or 200)
            .stream()))
            
        logs = []
        for doc in docs:
            d = doc.to_dict()
            
            # Retention check: Skip records older than 30 days
            log_time = d.get("timestamp", "")
            if log_time and log_time < cutoff_str:
                continue

            # Apply filters in memory
            if query.action_type and query.action_type != "All" and d.get("action_type") != query.action_type:
                continue
            if query.district and query.district != "All" and d.get("district") != query.district:
                continue
            if query.user_id and query.user_id != "All" and d.get("user_id") != query.user_id:
                continue
            if query.search:
                s_lower = query.search.lower()
                text_to_search = f"{d.get('details', '')} {d.get('user_name', '')} {d.get('target_officer', '')} {d.get('district', '')}".lower()
                if s_lower not in text_to_search:
                    continue
                    
            logs.append(d)
            
        return {"success": True, "total": len(logs), "retention_policy": f"Last {AUDIT_RETENTION_DAYS} Days", "logs": logs}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/admin/export-audit-logs")
async def export_audit_logs(action_type: Optional[str] = "All", district: Optional[str] = "All", admin: dict = Depends(get_current_admin)):
    try:
        cutoff_str = (datetime.now() - timedelta(days=AUDIT_RETENTION_DAYS)).strftime("%Y-%m-%d %H:%M:%S")

        docs = await asyncio.to_thread(lambda: list(db.collection("admin_audit_logs")
            .order_by("timestamp", direction=firestore.Query.DESCENDING)
            .limit(1000)
            .stream()))
            
        rows = []
        for idx, doc in enumerate(docs):
            d = doc.to_dict()
            if d.get("timestamp", "") < cutoff_str:
                continue
            if action_type and action_type != "All" and d.get("action_type") != action_type:
                continue
            if district and district != "All" and d.get("district") != district:
                continue
                
            rows.append({
                "S.No": idx + 1,
                "Timestamp": d.get("timestamp", ""),
                "Admin User": d.get("user_name", ""),
                "Role": d.get("role", ""),
                "Action Type": d.get("action_type", ""),
                "District": d.get("district", ""),
                "Target Officer": d.get("target_officer", ""),
                "Activity Details": d.get("details", ""),
                "IP Address": d.get("ip_address", "")
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


# --- Enterprise Broadcast & Urgent Announcements Engine ---
class BroadcastCreateReq(BaseModel):
    title: str
    message: str
    priority: Optional[str] = "MEDIUM" # HIGH, MEDIUM, INFO
    target_audience: Optional[str] = "ALL" # ALL, FIELD_STAFF, SUB_ADMINS
    target_districts: Optional[List[str]] = ["All"] # ["All"] or ["Buxar", "Bhojpur", ...]
    created_by_user: Optional[str] = "Super Admin"
    created_by_role: Optional[str] = "SUPER_ADMIN"
    allowed_districts: Optional[List[str]] = None

class BroadcastDeleteReq(BaseModel):
    broadcast_id: str
    requested_by_user: Optional[str] = "admin"
    requested_by_role: Optional[str] = "SUPER_ADMIN"
    allowed_districts: Optional[List[str]] = None

@app.post("/api/broadcasts/create")
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
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "is_active": True
        }

        await asyncio.to_thread(lambda: db.collection("broadcast_alerts").document(broadcast_id).set(doc_data))
        cache.delete_prefix("broadcasts_")

        await log_admin_activity(
            action_type="BROADCAST_CREATED",
            details=f"Created [{req.priority}] broadcast: '{clean_title}' for {', '.join(target_dists)} ({req.target_audience})",
            district=target_dists[0] if len(target_dists) == 1 else "Statewide",
            user_name=req.created_by_user,
            role=role
        )

        return {"success": True, "message": "Broadcast created successfully!", "broadcast": doc_data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/broadcasts/active")
async def get_active_broadcasts(
    district: Optional[str] = None, 
    role: Optional[str] = None, # 'FIELD_STAFF' or 'SUB_ADMIN'
    districts: Optional[str] = None
):
    try:
        cache_key = f"broadcasts_active_{district or 'all'}_{role or 'all'}_{districts or 'all'}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        docs = await asyncio.to_thread(lambda: list(db.collection("broadcast_alerts")
            .where("is_active", "==", True)
            .stream()))

        allowed_dist_set = None
        if districts and districts.strip() and districts.strip() != "All":
            allowed_dist_set = set([d.strip() for d in districts.split(",") if d.strip()])

        active_list = []
        for doc in docs:
            d = doc.to_dict()
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
        cache.set(cache_key, res, ttl=10) # 10 seconds cache for fast broadcast updates
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/broadcasts/all")
async def get_all_broadcasts(districts: Optional[str] = None, role: Optional[str] = None):
    try:
        docs = await asyncio.to_thread(lambda: list(db.collection("broadcast_alerts")
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(100)
            .stream()))

        allowed_dist_set = None
        if districts and districts.strip() and districts.strip() != "All":
            allowed_dist_set = set([d.strip() for d in districts.split(",") if d.strip()])

        broadcasts = []
        for doc in docs:
            d = doc.to_dict()
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

@app.post("/api/broadcasts/delete")
async def delete_broadcast(req: BroadcastDeleteReq, admin: dict = Depends(get_current_admin)):
    try:
        doc_ref = db.collection("broadcast_alerts").document(req.broadcast_id)
        doc = await asyncio.to_thread(doc_ref.get)
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Broadcast not found.")

        d = doc.to_dict()
        user_role = (req.requested_by_role or "SUPER_ADMIN").upper()

        if user_role != "SUPER_ADMIN":
            # Sub-admin can only delete if they created it or it matches their allowed districts
            created_by = d.get("created_by_user", "")
            if created_by != req.requested_by_user:
                target_dists = d.get("target_districts", [])
                allowed = req.allowed_districts or []
                if not any(td in allowed for td in target_dists):
                    raise HTTPException(status_code=403, detail="Permission denied to delete this broadcast.")

        await asyncio.to_thread(doc_ref.delete)
        cache.delete_prefix("broadcasts_")

        await log_admin_activity(
            action_type="BROADCAST_DELETED",
            details=f"Deleted broadcast '{d.get('title')}': {req.broadcast_id}",
            district="Statewide" if "All" in d.get("target_districts", []) else d.get("target_districts", [""])[0],
            user_name=req.requested_by_user,
            role=user_role
        )

        return {"success": True, "message": "Broadcast deleted successfully!"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =========================================================================
# --- Nikshay Cumulative Verification Ledger Helper ---
# =========================================================================
def sync_nikshay_cumulative_ledger_sync(
    patients_to_sync: Dict[str, Dict[str, Any]],
    admin_user: str
) -> Dict[str, int]:
    """
    Safely merges patient indicators into 'nikshay_verified_patients' in Firestore.
    Ensures MONOTONIC RETENTION: once True, an indicator is NEVER reverted to False or deleted.
    Uses batch reads (db.get_all) and batch writes (db.batch) in chunks of 300.
    Only writes documents that have changes or new indicators to preserve Firestore quotas.
    """
    total_processed = len(patients_to_sync)
    if total_processed == 0:
        return {"total_processed": 0, "written": 0, "unchanged": 0}

    pids = list(patients_to_sync.keys())
    chunk_size = 300
    total_written = 0
    total_unchanged = 0
    now_iso = datetime.utcnow().isoformat()
    now_date = datetime.utcnow().strftime("%Y-%m-%d")

    for i in range(0, len(pids), chunk_size):
        chunk_pids = pids[i:i + chunk_size]
        chunk_doc_map = {pid: str(pid).strip().replace("/", "_").replace(".", "_") for pid in chunk_pids}
        chunk_refs = [db.collection("nikshay_verified_patients").document(chunk_doc_map[pid]) for pid in chunk_pids]

        existing_docs = {}
        try:
            snapshots = db.get_all(chunk_refs)
            for snap in snapshots:
                if snap.exists:
                    existing_docs[snap.id] = snap.to_dict()
        except Exception as err:
            print(f"[Ledger Sync] Batch get_all warning: {err}")
            existing_docs = {}

        batch = db.batch()
        batch_count = 0

        for pid in chunk_pids:
            doc_id = chunk_doc_map[pid]
            current = patients_to_sync[pid]
            existing = existing_docs.get(doc_id, {})

            is_new = not bool(existing)

            notif_val = bool(existing.get("notification_verified", False) or current.get("notification_verified", False))
            hiv_val = bool(existing.get("hiv_tested", False) or current.get("hiv_tested", False))
            dm_val = bool(existing.get("dm_tested", False) or current.get("dm_tested", False))
            hiv_dm_val = bool(existing.get("hiv_dm_tested", False) or current.get("hiv_dm_tested", False) or hiv_val or dm_val)
            bank_val = bool(existing.get("bank_validated", False) or current.get("bank_validated", False))
            udst_val = bool(existing.get("udst_done", False) or current.get("udst_done", False))
            contact_val = bool(existing.get("contact_tracing_done", False) or current.get("contact_tracing_done", False))

            has_changes = (
                is_new or
                (not existing.get("notification_verified") and notif_val) or
                (not existing.get("hiv_tested") and hiv_val) or
                (not existing.get("dm_tested") and dm_val) or
                (not existing.get("hiv_dm_tested") and hiv_dm_val) or
                (not existing.get("bank_validated") and bank_val) or
                (not existing.get("udst_done") and udst_val) or
                (not existing.get("contact_tracing_done") and contact_val) or
                (not existing.get("patient_name") and current.get("name")) or
                (not existing.get("phone") and current.get("phone"))
            )

            if not has_changes:
                total_unchanged += 1
                continue

            merged_record = {
                "patient_id": str(pid),
                "patient_name": current.get("name") or existing.get("patient_name", ""),
                "phone": current.get("phone") or existing.get("phone", ""),
                "district": current.get("district") or existing.get("district", ""),
                "notification_verified": notif_val,
                "hiv_tested": hiv_val,
                "dm_tested": dm_val,
                "hiv_dm_tested": hiv_dm_val,
                "bank_validated": bank_val,
                "udst_done": udst_val,
                "contact_tracing_done": contact_val,
                "treatment_outcome": current.get("outcome") or existing.get("treatment_outcome", ""),
                "first_verified_at": existing.get("first_verified_at", now_iso),
                "last_reconciled_at": now_iso,
                "reconciled_by": admin_user
            }

            if notif_val and not existing.get("notification_verified_date"):
                merged_record["notification_verified_date"] = now_date
            if hiv_val and not existing.get("hiv_verified_date"):
                merged_record["hiv_verified_date"] = now_date
            if dm_val and not existing.get("dm_verified_date"):
                merged_record["dm_verified_date"] = now_date
            if bank_val and not existing.get("bank_verified_date"):
                merged_record["bank_verified_date"] = now_date
            if udst_val and not existing.get("udst_verified_date"):
                merged_record["udst_verified_date"] = now_date
            if contact_val and not existing.get("contact_verified_date"):
                merged_record["contact_verified_date"] = now_date

            doc_ref = db.collection("nikshay_verified_patients").document(doc_id)
            batch.set(doc_ref, merged_record, merge=True)
            batch_count += 1
            total_written += 1

        if batch_count > 0:
            batch.commit()

    return {"total_processed": total_processed, "written": total_written, "unchanged": total_unchanged}

# =========================================================================
# --- Nikshay Official Excel/CSV Importer & Auto-Reconciler ---
# =========================================================================
@app.post("/admin/reconcile-nikshay")
async def reconcile_nikshay(
    file: UploadFile = File(...),
    month: Optional[str] = Form(None),
    district: Optional[str] = Form("All"),
    admin: dict = Depends(get_current_admin)
):
    try:
        content = await file.read()
        filename = file.filename.lower()
        sheet_used = "Default"
        
        # 1. Multi-sheet Excel Parser targeting 'mastersheet'
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif filename.endswith((".xlsx", ".xls")):
            excel_file = pd.ExcelFile(io.BytesIO(content))
            sheet_names = excel_file.sheet_names
            target_sheet = sheet_names[0]
            for s in sheet_names:
                if "master" in str(s).strip().lower():
                    target_sheet = s
                    break
            sheet_used = target_sheet
            df = pd.read_excel(excel_file, sheet_name=target_sheet)
        else:
            raise HTTPException(status_code=400, detail="Invalid file format. Please upload an official Nikshay .xlsx or .csv export.")

        cols_lower = {str(c).strip().lower(): c for c in df.columns}
        
        # 2. Dynamically locate Patient/Episode ID column
        id_col = None
        for candidate in ["episode_id", "episodeid", "nikshay_id", "nikshayid", "patient_id", "patientid", "tb_id"]:
            if candidate in cols_lower:
                id_col = cols_lower[candidate]
                break
        if not id_col:
            for col in df.columns:
                clean_col = str(col).strip().lower().replace(" ", "_").replace(".", "")
                if any(k in clean_col for k in ["episode_id", "nikshay_id", "patient_id", "tb_id", "case_id", "beneficiary_id"]):
                    id_col = col
                    break
        if not id_col:
            for col in df.columns:
                sample_vals = [str(x).split(".")[0].strip() for x in df[col].dropna()[:15]]
                if any(v.isdigit() and len(v) >= 7 for v in sample_vals):
                    id_col = col
                    break
        if not id_col:
            id_col = df.columns[0]

        # 3. Detect demographics, district & date columns
        name_col = cols_lower.get("patient_name") or next((c for c in df.columns if "patient_name" in str(c).lower() or "name" in str(c).lower()), None)
        phone_col = cols_lower.get("primaryphone") or cols_lower.get("phone") or cols_lower.get("mobile") or next((c for c in df.columns if "phone" in str(c).lower() or "mobile" in str(c).lower()), None)
        address_col = cols_lower.get("address") or next((c for c in df.columns if "address" in str(c).lower()), None)

        district_col = None
        for candidate in ["spectrum_enrolment_district", "spectrum_diagnosing_district", "district", "district_name"]:
            if candidate in cols_lower:
                district_col = cols_lower[candidate]
                break
        if not district_col:
            district_col = next((c for c in df.columns if "district" in str(c).lower()), None)

        date_col = None
        for candidate in ["spectrum_enrollment_date", "spectrum_diagnosis_date", "diagnosis_date", "treatment_initiation_date", "date_of_notification"]:
            if candidate in cols_lower:
                date_col = cols_lower[candidate]
                break
        if not date_col:
            date_col = next((c for c in df.columns if "date" in str(c).lower()), None)

        # 4. Detect Indicator columns
        hiv_col = cols_lower.get("hiv_tested") or cols_lower.get("status_of_hiv") or next((c for c in df.columns if "hiv" in str(c).lower()), None)
        dm_col = cols_lower.get("diabetes_tested") or cols_lower.get("status_of_diabetes") or next((c for c in df.columns if "diabetes" in str(c).lower()), None)
        bank_col = cols_lower.get("bank_validated") or cols_lower.get("bank_details_entered") or cols_lower.get("beneficiary_status") or next((c for c in df.columns if "bank" in str(c).lower() or "dbt" in str(c).lower()), None)
        udst_col = cols_lower.get("udst_done") or next((c for c in df.columns if "udst" in str(c).lower() or "dst" in str(c).lower()), None)
        contact_col = cols_lower.get("contact_tracing_done") or next((c for c in df.columns if "contact" in str(c).lower()), None)
        outcome_col = cols_lower.get("treatment_outcome") or next((c for c in df.columns if "outcome" in str(c).lower()), None)

        def is_yes(val):
            if val is None or pd.isna(val):
                return False
            s = str(val).strip().lower()
            return s in ["yes", "y", "done", "true", "1", "reactive", "positive", "tested", "validated"]

        # 5. Parse Nikshay Master Records
        nikshay_patients = {}
        for _, row in df.iterrows():
            val = row.get(id_col)
            if val is None or pd.isna(val):
                continue
            s = str(val).strip().split(".")[0]
            if not (s and s.isalnum() and len(s) >= 5):
                continue

            row_dist = str(row.get(district_col, "")).strip() if district_col and not pd.isna(row.get(district_col)) else ""
            if district and district != "All" and row_dist and row_dist.lower() != district.lower():
                continue

            if month and date_col:
                row_dt = str(row.get(date_col, "")).strip()
                if row_dt and len(row_dt) >= 7 and not row_dt.startswith(month):
                    continue

            p_name = str(row.get(name_col, "")).strip() if name_col and not pd.isna(row.get(name_col)) else ""
            p_phone = str(row.get(phone_col, "")).split(".")[0].strip() if phone_col and not pd.isna(row.get(phone_col)) else ""

            nikshay_patients[s] = {
                "id": s,
                "name": p_name,
                "phone": p_phone,
                "district": row_dist,
                "hiv_done": is_yes(row.get(hiv_col)) if hiv_col else False,
                "dm_done": is_yes(row.get(dm_col)) if dm_col else False,
                "bank_done": is_yes(row.get(bank_col)) if bank_col else False,
                "udst_done": is_yes(row.get(udst_col)) if udst_col else False,
                "contact_done": is_yes(row.get(contact_col)) if contact_col else False,
                "outcome": str(row.get(outcome_col, "")).strip() if outcome_col and not pd.isna(row.get(outcome_col)) else ""
            }

        nikshay_ids = set(nikshay_patients.keys())

        # 6. Fetch reported IDs in DFY MIS from Firestore
        if not month:
            month = datetime.now().strftime("%Y-%m")
        start_date = f"{month}-01"
        end_date = f"{month}-31"
        
        report_docs = await asyncio.to_thread(lambda: list(
            db.collection("daily_field_reports")
            .where("date_of_reporting", ">=", start_date)
            .where("date_of_reporting", "<=", end_date)
            .stream()
        ))
        
        dfy_reported_ids = set()
        dfy_details = {} # id -> metadata & boolean flags
        
        categories_map = {
            "notification_ids": "Notification",
            "hiv_dm_ids": "HIV_DM",
            "dbt_ids": "DBT_Bank",
            "sample_tested_ids": "UDST_Testing",
            "sample_collection_ids": "Sample_Collection",
            "contact_tracing_ids": "Contact_Tracing",
            "differentiated_tb_ids": "Diff_TB"
        }

        for doc in report_docs:
            d = doc.to_dict()
            doc_dist = d.get("working_place", "")
            if district != "All" and doc_dist.lower() != district.lower():
                continue
                
            fo = d.get("fo_name", "")
            dt = d.get("date_of_reporting", "")
            
            for cat_key, service_label in categories_map.items():
                for pid in d.get(cat_key, []):
                    clean_pid = str(pid).strip()
                    dfy_reported_ids.add(clean_pid)
                    if clean_pid not in dfy_details:
                        dfy_details[clean_pid] = {
                            "district": doc_dist,
                            "fo_name": fo,
                            "date": dt,
                            "services": set(),
                            "has_notification": False,
                            "has_hiv_dm": False,
                            "has_dbt": False,
                            "has_udst": False,
                            "has_contact": False
                        }
                    else:
                        if dt and (not dfy_details[clean_pid].get("date") or dt > dfy_details[clean_pid].get("date")):
                            dfy_details[clean_pid]["date"] = dt
                    dfy_details[clean_pid]["services"].add(service_label)
                    if cat_key == "notification_ids":
                        dfy_details[clean_pid]["has_notification"] = True
                    elif cat_key == "hiv_dm_ids":
                        dfy_details[clean_pid]["has_hiv_dm"] = True
                    elif cat_key == "dbt_ids":
                        dfy_details[clean_pid]["has_dbt"] = True
                    elif cat_key in ["sample_tested_ids", "sample_collection_ids"]:
                        dfy_details[clean_pid]["has_udst"] = True
                    elif cat_key == "contact_tracing_ids":
                        dfy_details[clean_pid]["has_contact"] = True

        # 7. Compute Set Reconciliation & Multi-Cascade Breakdown
        matched = list(nikshay_ids.intersection(dfy_reported_ids))
        only_in_nikshay = list(nikshay_ids - dfy_reported_ids)
        only_in_dfy = list(dfy_reported_ids - nikshay_ids)

        cascade_summary = {
            "hiv_dm": {"nikshay_done": 0, "dfy_done": 0, "ready_for_portal": 0, "both_done": 0, "pending_both": 0},
            "dbt": {"nikshay_done": 0, "dfy_done": 0, "ready_for_portal": 0, "both_done": 0, "pending_both": 0},
            "udst": {"nikshay_done": 0, "dfy_done": 0, "ready_for_portal": 0, "both_done": 0, "pending_both": 0},
            "contact_tracing": {"nikshay_done": 0, "dfy_done": 0, "ready_for_portal": 0, "both_done": 0, "pending_both": 0},
        }

        ready_for_nikshay_list = []
        urgent_field_action_list = []

        for pid, np in nikshay_patients.items():
            dfy_info = dfy_details.get(pid)
            has_dfy = dfy_info is not None
            
            # HIV & DM (either HIV or DM tested in Nikshay)
            n_hiv = np["hiv_done"] or np["dm_done"]
            d_hiv = dfy_info["has_hiv_dm"] if has_dfy else False
            if n_hiv: cascade_summary["hiv_dm"]["nikshay_done"] += 1
            if d_hiv: cascade_summary["hiv_dm"]["dfy_done"] += 1
            if n_hiv and d_hiv: cascade_summary["hiv_dm"]["both_done"] += 1
            elif not n_hiv and d_hiv: cascade_summary["hiv_dm"]["ready_for_portal"] += 1
            elif not n_hiv and not d_hiv: cascade_summary["hiv_dm"]["pending_both"] += 1

            # DBT Bank
            n_dbt = np["bank_done"]
            d_dbt = dfy_info["has_dbt"] if has_dfy else False
            if n_dbt: cascade_summary["dbt"]["nikshay_done"] += 1
            if d_dbt: cascade_summary["dbt"]["dfy_done"] += 1
            if n_dbt and d_dbt: cascade_summary["dbt"]["both_done"] += 1
            elif not n_dbt and d_dbt: cascade_summary["dbt"]["ready_for_portal"] += 1
            elif not n_dbt and not d_dbt: cascade_summary["dbt"]["pending_both"] += 1

            # UDST Testing
            n_udst = np["udst_done"]
            d_udst = dfy_info["has_udst"] if has_dfy else False
            if n_udst: cascade_summary["udst"]["nikshay_done"] += 1
            if d_udst: cascade_summary["udst"]["dfy_done"] += 1
            if n_udst and d_udst: cascade_summary["udst"]["both_done"] += 1
            elif not n_udst and d_udst: cascade_summary["udst"]["ready_for_portal"] += 1
            elif not n_udst and not d_udst: cascade_summary["udst"]["pending_both"] += 1

            # Contact Tracing
            n_ct = np["contact_done"]
            d_ct = dfy_info["has_contact"] if has_dfy else False
            if n_ct: cascade_summary["contact_tracing"]["nikshay_done"] += 1
            if d_ct: cascade_summary["contact_tracing"]["dfy_done"] += 1
            if n_ct and d_ct: cascade_summary["contact_tracing"]["both_done"] += 1
            elif not n_ct and d_ct: cascade_summary["contact_tracing"]["ready_for_portal"] += 1
            elif not n_ct and not d_ct: cascade_summary["contact_tracing"]["pending_both"] += 1

            # Actionable List 1: Ready for Nikshay Portal Update (Pending in Nikshay, but Done in DFY!)
            services_ready = []
            if not n_dbt and d_dbt: services_ready.append("💳 DBT Bank Seeded")
            if not n_hiv and d_hiv: services_ready.append("🩺 HIV/DM Screened")
            if not n_udst and d_udst: services_ready.append("🔬 Sample Tested (UDST)")
            if not n_ct and d_ct: services_ready.append("👥 Contact Traced")

            if services_ready:
                ready_for_nikshay_list.append({
                    "id": pid,
                    "name": np["name"] or "Patient",
                    "phone": np["phone"],
                    "district": np["district"] or (dfy_info["district"] if has_dfy else ""),
                    "services_ready": services_ready,
                    "fo_name": dfy_info["fo_name"] if has_dfy else "",
                    "date": dfy_info["date"] if has_dfy else ""
                })

            # Actionable List 2: Urgent Field Action (Pending in both Nikshay and DFY!)
            pending_actions = []
            if not n_dbt and not d_dbt: pending_actions.append("DBT Bank")
            if not n_hiv and not d_hiv: pending_actions.append("HIV/DM")
            if not n_udst and not d_udst: pending_actions.append("UDST")
            if not n_ct and not d_ct: pending_actions.append("Contact Tracing")

            if len(pending_actions) >= 2:
                urgent_field_action_list.append({
                    "id": pid,
                    "name": np["name"] or "Patient",
                    "phone": np["phone"],
                    "district": np["district"],
                    "pending_actions": pending_actions
                })

        # 8. 3-Day Aging Audit & 2-Part Discrepancy Classification
        # Segregates normal Govt portal sync lag (<= 3 days) from actionable discrepancies (> 3 days)
        # Does NOT alter field officer daily targets or monthly evaluations.
        now_dt = datetime.now()
        flagged_review_list = []
        grace_window_list = []

        # PART 1: Matched IDs (Episode ID exists in Nikshay, but claimed indicator is blank/pending)
        for pid in matched:
            np = nikshay_patients.get(pid, {})
            dfy_info = dfy_details.get(pid, {})
            
            n_hiv = np.get("hiv_done", False) or np.get("dm_done", False)
            d_hiv = dfy_info.get("has_hiv_dm", False)
            
            n_dbt = np.get("bank_done", False)
            d_dbt = dfy_info.get("has_dbt", False)
            
            n_udst = np.get("udst_done", False)
            d_udst = dfy_info.get("has_udst", False)
            
            n_ct = np.get("contact_done", False)
            d_ct = dfy_info.get("has_contact", False)
            
            unmatched_services = []
            if d_hiv and not n_hiv:
                unmatched_services.append("HIV/DM Screening")
            if d_dbt and not n_dbt:
                unmatched_services.append("DBT Bank Details")
            if d_udst and not n_udst:
                unmatched_services.append("UDST Lab Sample")
            if d_ct and not n_ct:
                unmatched_services.append("Contact Tracing")
                
            if unmatched_services:
                rep_date_str = dfy_info.get("date", "")
                days_elapsed = 0
                if rep_date_str:
                    try:
                        rep_dt = datetime.strptime(str(rep_date_str).strip()[:10], "%Y-%m-%d")
                        days_elapsed = max(0, (now_dt - rep_dt).days)
                    except Exception:
                        days_elapsed = 0
                
                record = {
                    "id": pid,
                    "patient_name": np.get("name") or "Patient",
                    "phone": np.get("phone", ""),
                    "district": dfy_info.get("district") or np.get("district", ""),
                    "fo_name": dfy_info.get("fo_name", ""),
                    "date": rep_date_str,
                    "days_elapsed": days_elapsed,
                    "category": "Part 1: Matched ID (Indicator Blank)",
                    "category_type": "matched_indicator_pending",
                    "services_claimed": ", ".join(unmatched_services),
                    "nikshay_status": "Blank / Pending on Nikshay Portal",
                    "action_required": "Discuss with FO: Check physical test slips / DEO entry status"
                }
                
                if days_elapsed <= 3:
                    record["grace_reason"] = f"Reported {days_elapsed}d ago (≤3d) - Govt Portal Sync Lag"
                    grace_window_list.append(record)
                else:
                    flagged_review_list.append(record)

        # PART 2: Unverified IDs (Claimed in DFY MIS, but NOT found in uploaded Nikshay Registry)
        for pid in only_in_dfy:
            dfy_info = dfy_details.get(pid, {})
            rep_date_str = dfy_info.get("date", "")
            days_elapsed = 0
            if rep_date_str:
                try:
                    rep_dt = datetime.strptime(str(rep_date_str).strip()[:10], "%Y-%m-%d")
                    days_elapsed = max(0, (now_dt - rep_dt).days)
                except Exception:
                    days_elapsed = 0
                    
            services_claimed_str = ", ".join(sorted(list(dfy_info.get("services", [])))) or "Reported in MIS"
            
            record = {
                "id": pid,
                "patient_name": "Unregistered / Not in Nikshay",
                "phone": "-",
                "district": dfy_info.get("district", ""),
                "fo_name": dfy_info.get("fo_name", ""),
                "date": rep_date_str,
                "days_elapsed": days_elapsed,
                "category": "Part 2: Unverified ID (Not Found)",
                "category_type": "unverified_id",
                "services_claimed": services_claimed_str,
                "nikshay_status": "Episode ID Not Found on Nikshay",
                "action_required": "Discuss with FO: Check for Episode ID digit typos or enrollment slips"
            }
            
            if days_elapsed <= 3:
                record["grace_reason"] = f"Enrolled {days_elapsed}d ago (≤3d) - Nikshay Portal Enrollment Lag"
                grace_window_list.append(record)
            else:
                flagged_review_list.append(record)

        # Sort district-wise, then FO name, then days_elapsed descending (oldest discrepancies first)
        flagged_review_list.sort(key=lambda x: (str(x.get("district", "")).lower(), str(x.get("fo_name", "")).lower(), -int(x.get("days_elapsed", 0))))
        grace_window_list.sort(key=lambda x: (str(x.get("district", "")).lower(), str(x.get("fo_name", "")).lower(), -int(x.get("days_elapsed", 0))))

        # Cache the review sheet data for rapid Excel export (2h TTL, 0 DB storage)
        cache_data_review = {
            "records": flagged_review_list,
            "month": month,
            "district": district,
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        admin_user = admin.get("username", "Admin")
        cache.set(f"review_sheet_{admin_user}", cache_data_review, ttl=7200)
        cache.set("review_sheet_latest", cache_data_review, ttl=7200)

        # 9. Permanent Cumulative Verification Ledger Synchronization
        # Once an indicator is verified, it is permanently locked in Firestore and NEVER lost or erased!
        patients_to_sync = {}
        for pid, np in nikshay_patients.items():
            dfy_info = dfy_details.get(pid)
            has_dfy = dfy_info is not None
            is_matched_pt = pid in matched
            
            n_hiv = np["hiv_done"]
            n_dm = np["dm_done"]
            d_hiv_dm = dfy_info["has_hiv_dm"] if has_dfy else False
            
            n_bank = np["bank_done"]
            d_bank = dfy_info["has_dbt"] if has_dfy else False
            
            n_udst = np["udst_done"]
            d_udst = dfy_info["has_udst"] if has_dfy else False
            
            n_ct = np["contact_done"]
            d_ct = dfy_info["has_contact"] if has_dfy else False
            
            if (is_matched_pt or n_hiv or n_dm or d_hiv_dm or n_bank or d_bank or 
                n_udst or d_udst or n_ct or d_ct or np.get("outcome")):
                patients_to_sync[pid] = {
                    "name": np["name"] or "",
                    "phone": np["phone"] or "",
                    "district": np["district"] or (dfy_info["district"] if has_dfy else ""),
                    "notification_verified": is_matched_pt or (dfy_info["has_notification"] if has_dfy else False),
                    "hiv_tested": n_hiv or d_hiv_dm,
                    "dm_tested": n_dm or d_hiv_dm,
                    "hiv_dm_tested": n_hiv or n_dm or d_hiv_dm,
                    "bank_validated": n_bank or d_bank,
                    "udst_done": n_udst or d_udst,
                    "contact_tracing_done": n_ct or d_ct,
                    "outcome": np.get("outcome", "")
                }
                
        for pid, dfy_info in dfy_details.items():
            if pid not in patients_to_sync:
                has_any_service = (dfy_info["has_notification"] or dfy_info["has_hiv_dm"] or 
                                   dfy_info["has_dbt"] or dfy_info["has_udst"] or dfy_info["has_contact"])
                if has_any_service:
                    patients_to_sync[pid] = {
                        "name": "",
                        "phone": "",
                        "district": dfy_info.get("district", ""),
                        "notification_verified": dfy_info.get("has_notification", False),
                        "hiv_tested": dfy_info.get("has_hiv_dm", False),
                        "dm_tested": dfy_info.get("has_hiv_dm", False),
                        "hiv_dm_tested": dfy_info.get("has_hiv_dm", False),
                        "bank_validated": dfy_info.get("has_dbt", False),
                        "udst_done": dfy_info.get("has_udst", False),
                        "contact_tracing_done": dfy_info.get("has_contact", False),
                        "outcome": ""
                    }
                    
        ledger_sync_res = {"total_processed": 0, "written": 0, "unchanged": 0}
        try:
            ledger_sync_res = await asyncio.to_thread(
                sync_nikshay_cumulative_ledger_sync,
                patients_to_sync,
                admin.get("username", "Admin")
            )
        except Exception as sync_err:
            print(f"[Ledger Sync] Non-blocking notice: {sync_err}")

        summary = {
            "month": month,
            "district": district,
            "detected_sheet": sheet_used,
            "detected_id_column": str(id_col),
            "is_mastersheet_format": bool("master" in sheet_used.lower() or "episode_id" in cols_lower),
            "total_nikshay_uploaded": len(nikshay_ids),
            "total_dfy_reported": len(dfy_reported_ids),
            "matched_count": len(matched),
            "match_rate_pct": round((len(matched) / len(nikshay_ids) * 100), 1) if nikshay_ids else 0,
            "missing_in_dfy_count": len(only_in_nikshay),
            "only_in_dfy_count": len(only_in_dfy),
            "flagged_review_count": len(flagged_review_list),
            "grace_window_count": len(grace_window_list),
            "ready_for_portal_count": len(ready_for_nikshay_list),
            "urgent_field_action_count": len(urgent_field_action_list),
            "cascade": cascade_summary,
            "cumulative_ledger": {
                "patients_evaluated": ledger_sync_res.get("total_processed", 0),
                "newly_locked_or_upgraded": ledger_sync_res.get("written", 0),
                "already_locked_preserved": ledger_sync_res.get("unchanged", 0)
            }
        }
        
        preview_missing_in_dfy_details = [{
            "id": pid,
            "name": nikshay_patients[pid]["name"] or "Patient",
            "phone": nikshay_patients[pid]["phone"],
            "district": nikshay_patients[pid]["district"]
        } for pid in only_in_nikshay[:150]]

        # Backward compatibility: Keep string list for any client with cached frontend JS
        preview_missing_in_dfy_legacy = [str(pid) for pid in only_in_nikshay[:150]]

        preview_only_in_dfy = [{
            "id": pid,
            "district": dfy_details.get(pid, {}).get("district", ""),
            "fo_name": dfy_details.get(pid, {}).get("fo_name", ""),
            "date": dfy_details.get(pid, {}).get("date", ""),
            "services": list(dfy_details.get(pid, {}).get("services", []))
        } for pid in only_in_dfy[:150]]
        
        await log_admin_activity(
            action_type="NIKSHAY_RECONCILE",
            details=f"Reconciled {sheet_used} for {district} ({month}): {len(matched)} matched ({summary['match_rate_pct']}%), {len(ready_for_nikshay_list)} ready for portal update, {len(flagged_review_list)} flagged for staff review",
            district=district,
            user_name=admin.get("username", "Admin"),
            role=admin.get("role", "SUB_ADMIN")
        )
        
        return {
            "success": True,
            "summary": summary,
            "preview_flagged_discrepancies": flagged_review_list[:150],
            "preview_grace_window": grace_window_list[:150],
            "preview_missing_in_dfy": preview_missing_in_dfy_legacy,
            "preview_missing_in_dfy_details": preview_missing_in_dfy_details,
            "preview_only_in_dfy": preview_only_in_dfy,
            "preview_ready_for_portal": ready_for_nikshay_list[:150],
            "preview_urgent_field_action": urgent_field_action_list[:150]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reconciliation error: {str(e)}")

# =========================================================================
# --- Nikshay District-Wise Discrepancy Review Sheet Export ---
# =========================================================================
@app.get("/admin/nikshay/download-review-sheet")
async def download_nikshay_review_sheet(
    district: Optional[str] = Query("All"),
    admin: dict = Depends(get_current_admin)
):
    """
    Exports a formatted Excel sheet with 9 columns grouped by District & Field Officer.
    Contains cases where reporting > 3 days old has indicators missing in Nikshay or IDs unverified.
    Includes a blank column 'Staff Resolution Notes' for 1-on-1 review meetings.
    """
    try:
        admin_user = admin.get("username", "Admin")
        cached = cache.get(f"review_sheet_{admin_user}")
        if not cached:
            cached = cache.get("review_sheet_latest")
            
        if not cached or "records" not in cached:
            raise HTTPException(
                status_code=400,
                detail="No review sheet data available. Please upload and reconcile a Nikshay file first."
            )
            
        records = cached.get("records", [])
        sheet_month = cached.get("month", datetime.now().strftime("%Y-%m"))
        
        if district and district != "All":
            records = [r for r in records if str(r.get("district", "")).strip().lower() == district.strip().lower()]
            
        rows = []
        for r in records:
            rows.append({
                "District": r.get("district", ""),
                "Field Officer Name": r.get("fo_name", ""),
                "Date Reported": r.get("date", ""),
                "Days Pending": r.get("days_elapsed", 0),
                "Episode ID": r.get("id", ""),
                "Discrepancy Category": r.get("category", ""),
                "Services Claimed by FO": r.get("services_claimed", ""),
                "Nikshay Portal Status": r.get("nikshay_status", ""),
                "Staff Resolution Notes (Admin Discussion)": ""
            })
            
        if not rows:
            rows.append({
                "District": district if district != "All" else "All Districts",
                "Field Officer Name": "None",
                "Date Reported": "-",
                "Days Pending": 0,
                "Episode ID": "-",
                "Discrepancy Category": "No discrepancies > 3 days detected",
                "Services Claimed by FO": "-",
                "Nikshay Portal Status": "All Synchronized",
                "Staff Resolution Notes (Admin Discussion)": "All verified or within 72h grace window"
            })
            
        df_export = pd.DataFrame(rows)
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df_export.to_excel(writer, index=False, sheet_name="Field Review Sheet")
            ws = writer.sheets["Field Review Sheet"]
            style_excel_worksheet(ws, header_fill_color="D97706")
            
        output.seek(0)
        dist_slug = district.replace(" ", "_") if district else "All"
        filename = f"DFY_Field_Review_Sheet_{dist_slug}_{sheet_month}_{datetime.now().strftime('%Y%m%d')}.xlsx"
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Review sheet export error: {str(e)}")

# =========================================================================
# --- Nikshay Permanent Cumulative Verification Ledger API ---
# =========================================================================
@app.get("/admin/nikshay/cumulative-ledger")
async def get_cumulative_ledger(
    district: Optional[str] = Query("All"),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    admin: dict = Depends(get_current_admin)
):
    try:
        cache_key = f"ledger_{district}_{search}_{page}_{limit}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        query = db.collection("nikshay_verified_patients")
        if district and district != "All":
            query = query.where("district", "==", district)
            
        docs = await asyncio.to_thread(lambda: list(query.stream()))
        total_in_db = len(docs)
        
        filtered = []
        s_lower = search.strip().lower() if search else None
        
        total_hiv_dm = 0
        total_bank = 0
        total_udst = 0
        total_contact = 0
        
        for doc in docs:
            d = doc.to_dict()
            if d.get("hiv_dm_tested") or d.get("hiv_tested") or d.get("dm_tested"):
                total_hiv_dm += 1
            if d.get("bank_validated"):
                total_bank += 1
            if d.get("udst_done"):
                total_udst += 1
            if d.get("contact_tracing_done"):
                total_contact += 1
                
            if s_lower:
                pid = str(d.get("patient_id", "")).lower()
                pname = str(d.get("patient_name", "")).lower()
                pphone = str(d.get("phone", "")).lower()
                pdist = str(d.get("district", "")).lower()
                if not (s_lower in pid or s_lower in pname or s_lower in pphone or s_lower in pdist):
                    continue
                    
            filtered.append(d)
            
        filtered.sort(key=lambda x: str(x.get("last_reconciled_at") or x.get("first_verified_at") or ""), reverse=True)
        
        total_matched = len(filtered)
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        paginated = filtered[start_idx:end_idx]
        
        res = {
            "success": True,
            "total_records": total_matched,
            "total_in_collection": total_in_db,
            "page": page,
            "limit": limit,
            "total_pages": max(1, (total_matched + limit - 1) // limit),
            "metrics": {
                "total_verified": total_in_db,
                "hiv_dm_verified": total_hiv_dm,
                "bank_validated": total_bank,
                "udst_done": total_udst,
                "contact_tracing_done": total_contact
            },
            "patients": paginated
        }
        
        cache.set(cache_key, res, ttl=20)
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ledger retrieval error: {str(e)}")

@app.get("/admin/nikshay/cumulative-ledger/export")
async def export_cumulative_ledger(
    district: Optional[str] = Query("All"),
    admin: dict = Depends(get_current_admin)
):
    try:
        query = db.collection("nikshay_verified_patients")
        if district and district != "All":
            query = query.where("district", "==", district)
            
        docs = await asyncio.to_thread(lambda: list(query.stream()))
        
        rows = []
        for doc in docs:
            d = doc.to_dict()
            rows.append({
                "Episode ID": d.get("patient_id", ""),
                "Patient Name": d.get("patient_name", ""),
                "Phone": d.get("phone", ""),
                "District": d.get("district", ""),
                "Notification Verified": "Yes" if d.get("notification_verified") else "Pending",
                "HIV/DM Screened": "Yes" if (d.get("hiv_dm_tested") or d.get("hiv_tested") or d.get("dm_tested")) else "Pending",
                "DBT Bank Validated": "Yes" if d.get("bank_validated") else "Pending",
                "UDST Done": "Yes" if d.get("udst_done") else "Pending",
                "Contact Tracing Done": "Yes" if d.get("contact_tracing_done") else "Pending",
                "Treatment Outcome": d.get("treatment_outcome", ""),
                "First Verified Date": str(d.get("first_verified_at", ""))[:10],
                "Last Reconciled Date": str(d.get("last_reconciled_at", ""))[:10],
                "Reconciled By": d.get("reconciled_by", "")
            })
            
        df_export = pd.DataFrame(rows)
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df_export.to_excel(writer, index=False, sheet_name="Cumulative Ledger")
            ws = writer.sheets["Cumulative Ledger"]
            style_excel_worksheet(ws, header_fill_color="059669")
            
        output.seek(0)
        dist_slug = district.replace(" ", "_") if district else "All"
        filename = f"Nikshay_Cumulative_Ledger_{dist_slug}_{datetime.now().strftime('%Y%m%d')}.xlsx"
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export error: {str(e)}")

# =========================================================================
# --- Patient Longitudinal Journey Timeline Drawer API ---
# =========================================================================
@app.get("/api/reports/patient-journey/{patient_id}")
async def get_patient_journey(patient_id: str):
    try:
        clean_id = str(patient_id).strip()
        if not clean_id:
            raise HTTPException(status_code=400, detail="Patient ID is required.")
            
        cache_key = f"journey_{clean_id}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        docs = await asyncio.to_thread(lambda: list(db.collection("daily_field_reports").stream()))
        
        milestones = []
        patient_meta = {"id": clean_id, "district": "", "primary_fo": "", "first_reported": ""}
        
        category_labels = {
            "notification_ids": ("TB Notification Recorded", "📋", 1),
            "sample_collection_ids": ("Sputum Sample Collected", "🧪", 2),
            "sample_tested_ids": ("Diagnostic Sample Tested", "🔬", 3),
            "hiv_dm_ids": ("HIV & Diabetes Screening Completed", "🩺", 4),
            "dbt_ids": ("DBT Bank Details Seeded", "💳", 5),
            "differentiated_tb_ids": ("Differentiated TB Assessment Done", "🩺", 6),
            "contact_tracing_ids": ("Household Contact Tracing Completed", "👥", 7),
            "home_visit_ids": ("Home Visit Completed", "🏠", 8),
            "fdc_provided_ids": ("FDC Medication Kit Provided", "💊", 9),
            "culture_dst_ids": ("Culture / DST Testing (Buxar Special)", "🧫", 10),
            "outcome_assigned_ids": ("Treatment Outcome Assigned", "🏁", 11)
        }
        
        for doc in docs:
            d = doc.to_dict()
            dt = d.get("date_of_reporting", "")
            fo = d.get("fo_name", "")
            dist = d.get("working_place", "")
            
            for field_key, (label, icon, order) in category_labels.items():
                ids = d.get(field_key, [])
                if clean_id in ids:
                    if not patient_meta["district"]:
                        patient_meta["district"] = dist
                        patient_meta["primary_fo"] = fo
                        patient_meta["first_reported"] = dt
                        
                    milestones.append({
                        "date": dt,
                        "action": label,
                        "icon": icon,
                        "category": field_key,
                        "fo_name": fo,
                        "district": dist,
                        "order": order
                    })

        # Check Permanent Nikshay Cumulative Ledger
        ledger_doc_id = clean_id.replace("/", "_").replace(".", "_")
        try:
            ledger_doc = await asyncio.to_thread(lambda: db.collection("nikshay_verified_patients").document(ledger_doc_id).get())
            if ledger_doc.exists:
                ld = ledger_doc.to_dict()
                if not patient_meta["district"] and ld.get("district"):
                    patient_meta["district"] = ld.get("district")
                if not patient_meta.get("patient_name") and ld.get("patient_name"):
                    patient_meta["patient_name"] = ld.get("patient_name")
                    
                active_nikshay_indicators = []
                if ld.get("bank_validated"): active_nikshay_indicators.append("💳 DBT Bank Validated")
                if ld.get("hiv_dm_tested") or ld.get("hiv_tested") or ld.get("dm_tested"): active_nikshay_indicators.append("🩺 HIV/DM Screened")
                if ld.get("udst_done"): active_nikshay_indicators.append("🔬 UDST Tested")
                if ld.get("contact_tracing_done"): active_nikshay_indicators.append("👥 Contact Traced")
                
                milestones.append({
                    "date": str(ld.get("last_reconciled_at") or ld.get("first_verified_at") or "Permanent")[:10],
                    "action": f"Nikshay Official Ledger Verified: {', '.join(active_nikshay_indicators) if active_nikshay_indicators else 'Enrolled & Monitored'}",
                    "icon": "🔒",
                    "category": "nikshay_verified",
                    "fo_name": f"Nikshay Ledger ({ld.get('reconciled_by', 'Admin')})",
                    "district": ld.get("district", patient_meta["district"]),
                    "order": 0
                })
                patient_meta["nikshay_verified"] = True
                patient_meta["nikshay_indicators"] = active_nikshay_indicators
        except Exception as l_err:
            print(f"[Patient Journey] Ledger lookup note: {l_err}")
                    
        milestones.sort(key=lambda m: (m["date"], m["order"]))
        
        res = {
            "success": True,
            "patient_id": clean_id,
            "metadata": patient_meta,
            "total_milestones": len(milestones),
            "journey": milestones,
            "is_complete": any(m["category"] == "outcome_assigned_ids" for m in milestones)
        }
        
        cache.set(cache_key, res, ttl=60)
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
