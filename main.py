import zipfile
import firebase_admin
from firebase_admin import credentials, firestore, storage
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import pandas as pd
import io
import os
import json
import uuid

firebase_creds_env = os.environ.get("FIREBASE_CREDENTIALS")
if firebase_creds_env:
    cred_dict = json.loads(firebase_creds_env)
    cred = credentials.Certificate(cred_dict)
else:
    cred = credentials.Certificate("firebase_key.json")

if not firebase_admin._apps:
    firebase_admin.initialize_app(cred, {
        'storageBucket': 'dfy-reporting-mis.appspot.com'
    })
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


app = FastAPI(title="DFY Daily Activity API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    kit_consumption_ids: List[str] = []
    differentiated_tb_ids: List[str] = []
    tpt_treatment_start_ids: List[str] = []
    tpt_presumptive_ids: List[str] = []
    adhar_face_authentication_ids: List[str] = []
    consent_with_id_ids: List[str] = []
    
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

@app.post("/admin/dashboard-data")
async def get_dashboard_data(req: DashboardRequest):
    try:
        start_date = f"{req.month_prefix}-01"
        end_date = f"{req.month_prefix}-31"
        
        docs = db.collection("daily_field_reports")\
            .where("date_of_reporting", ">=", start_date)\
            .where("date_of_reporting", "<=", end_date)\
            .stream()
            
        records = []
        for doc in docs:
            data = doc.to_dict()
            records.append({
                "date": data.get("date_of_reporting", ""),
                "working_place": data.get("working_place", "Unknown"),
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
                
                # Group 5 (New Fields)
                "differentiated_tb": len(data.get("differentiated_tb_ids", [])),
                "tpt_treatment_start": len(data.get("tpt_treatment_start_ids", [])),
                "tpt_presumptive": len(data.get("tpt_presumptive_ids", [])),
                "adhar_face_auth": len(data.get("adhar_face_authentication_ids", [])),
                "consent_with_id": len(data.get("consent_with_id_ids", [])),
                
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
                "kit_consumption_ids": data.get("kit_consumption_ids", []),
                "differentiated_tb_ids": data.get("differentiated_tb_ids", []),
                "tpt_treatment_start_ids": data.get("tpt_treatment_start_ids", []),
                "tpt_presumptive_ids": data.get("tpt_presumptive_ids", []),
                "adhar_face_authentication_ids": data.get("adhar_face_authentication_ids", []),
                "consent_with_id_ids": data.get("consent_with_id_ids", []),
                "visited_names": data.get("visited_names", []),
                "remark": data.get("remark", ""),
                
                "is_override": data.get("is_override_used", False)
            })
            
        return {"records": records}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/get-directory")
async def get_directory():
    try:
        docs = db.collection("staff_directory").stream()
        directory = {}
        for doc in docs:
            data = doc.to_dict()
            dist = data.get("district")
            if dist not in directory:
                directory[dist] = []
            directory[dist].append(data.get("name"))
        return directory
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/verify-pin")
async def verify_pin(data: PinCheck):
    try:
        doc_id = f"{data.working_place}_{data.fo_name}".replace(" ", "").lower()
        cache_key = f"pin_{doc_id}"
        cached_pin = cache.get(cache_key)
        
        if cached_pin is not None:
            return {"valid": str(data.pin) == str(cached_pin)}

        staff_doc = await asyncio.to_thread(db.collection("staff_directory").document(doc_id).get)
        
        if not staff_doc.exists:
            return {"valid": False}
            
        real_pin = staff_doc.to_dict().get("pin")
        cache.set(cache_key, str(real_pin), ttl=300) # 5 min cache
        if str(data.pin) == str(real_pin):
            return {"valid": True}
        return {"valid": False}
    except Exception:
        return {"valid": False}

@app.post("/upload-image")
async def upload_image(file: UploadFile = File(...)):
    try:
        bucket = storage.bucket()
        blob = bucket.blob(f"km_photos/{uuid.uuid4()}_{file.filename}")
        blob.upload_from_string(await file.read(), content_type=file.content_type)
        blob.make_public()
        return {"url": blob.public_url}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image upload failed: {str(e)}")

class CheckStatusRequest(BaseModel):
    working_place: str
    fo_name: str
    date: str

class StartDayRequest(BaseModel):
    working_place: str
    fo_name: str
    date: str
    morning_km: int
    morning_km_photo_url: str

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
            subs = d.get("submission_count", 0)
            if subs >= 2:
                res = {"status": "max_limit_reached", "submission_count": subs, "data": d}
            elif subs == 1:
                res = {"status": "not_started", "submission_count": 1, "data": {}}
            else:
                res = {"status": d.get("status", "in_progress"), "submission_count": subs, "data": d}
                
        cache.set(cache_key, res, ttl=20) # 20s TTL cache for rapid checking
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
        
        doc = doc_ref.get()
        if doc.exists:
            d = doc.to_dict()
            subs = d.get("submission_count", 0)
            if subs >= 2:
                raise HTTPException(status_code=400, detail="Daily limit reached")
                
            for k, v in payload.items():
                if isinstance(v, list) and k.endswith("_ids"):
                    combined = d.get(k, []) + v
                    payload[k] = list(dict.fromkeys(combined))
                elif k == "visited_names" and isinstance(v, list):
                    combined = d.get(k, []) + v
                    payload[k] = list(dict.fromkeys(combined))
                elif k == "remark" and v:
                    old_remark = d.get("remark", "")
                    payload[k] = f"{old_remark} | {v}".strip(" |")
                    
            payload["submission_count"] = subs + 1
        else:
            payload["submission_count"] = 1
            
        doc_ref.set(payload, merge=True)
        cache.delete(f"status_{doc_id}")
        cache.delete_prefix("profile_")
        cache.delete_prefix("dash_")
        return {"message": "Daily report submitted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/download-excel")
async def download_excel():
    try:
        docs = db.collection("daily_field_reports").stream()
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

@app.get("/get-targets")
async def get_targets(district: str = None):
    try:
        targets = []
        docs = db.collection("staff_targets").stream()
        for doc in docs:
            data = doc.to_dict()
            if district and data.get("district") != district:
                continue
            targets.append({
                "fo_name": data.get("fo_name"),
                "district": data.get("district"),
                "target": data.get("target", 0)
            })
        return {"success": True, "targets": targets}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/update-target")
async def update_target(data: TargetUpdate):
    try:
        doc_id = f"{data.district}_{data.fo_name}".replace(" ", "").lower()
        db.collection("staff_targets").document(doc_id).set({
            "district": data.district,
            "fo_name": data.fo_name,
            "target": data.target
        }, merge=True)
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def generate_district_kpi_bytes(district: str, month_prefix: Optional[str] = None) -> Optional[bytes]:
    if not month_prefix:
        month_prefix = datetime.now().strftime("%Y-%m")
        
    safe_dist = safe_filename(district)
    template_path = f"templates/template_{safe_dist}.xlsx"
    if not os.path.exists(template_path):
        return None
        
    wb = openpyxl.load_workbook(template_path)
    sheet_map = {name.strip().lower(): name for name in wb.sheetnames}
    
    # 1. Fetch Targets & Populate 'Performance sheet'
    target_map = {}
    try:
        t_docs = db.collection("staff_targets").where("district", "==", district).stream()
        for td in t_docs:
            t_data = td.to_dict()
            f_name = re.sub(r'\s+', ' ', str(t_data.get("fo_name", ""))).strip().lower()
            if f_name:
                target_map[f_name] = t_data.get("target", 0)
    except Exception as e:
        print(f"Target fetch notice for {district}: {e}")
        
    if "Performance sheet" in wb.sheetnames:
        ws_perf = wb["Performance sheet"]
        for r_idx in range(2, ws_perf.max_row + 1):
            cell_name = ws_perf.cell(row=r_idx, column=1).value
            if cell_name and str(cell_name).strip() != "GRAND TOTAL":
                norm_name = re.sub(r'\s+', ' ', str(cell_name)).strip().lower()
                if norm_name in target_map:
                    ws_perf.cell(row=r_idx, column=3).value = target_map[norm_name]
                    
    # 2. Filter Reports by Month
    docs = db.collection("daily_field_reports").where("working_place", "==", district).stream()
    
    KPI_MAP = {
        "notification_ids": 3, "hiv_dm_ids": 4, "dbt_ids": 5, "sample_collection_ids": 6,
        "sample_tested_ids": 7, "outcome_assigned_ids": 8, "home_visit_ids": 9,
        "contact_tracing_ids": 10, "follow_up_ids": 11, "face_to_face_ids": 12,
        "presumptive_ids": 13, "documents_ids": 14, "fdc_provided_ids": 15, "kit_consumption_ids": 16,
        "differentiated_tb_ids": 17, "tpt_treatment_start_ids": 18, "tpt_presumptive_ids": 19,
        "adhar_face_authentication_ids": 20, "consent_with_id_ids": 21
    }
    
    for doc in docs:
        data = doc.to_dict()
        date_str = str(data.get("date_of_reporting", "")).strip()
        if not date_str or not date_str.startswith(month_prefix):
            continue
            
        try:
            day_int = int(date_str.split('-')[2])
        except Exception:
            continue
            
        raw_tab_key = ordinal(day_int).lower()
        actual_tab_name = sheet_map.get(raw_tab_key)
        fo_name = re.sub(r'\s+', ' ', str(data.get("fo_name", ""))).strip().lower()
        
        # 1. Update Daily Tab
        if actual_tab_name and actual_tab_name in wb.sheetnames:
            ws = wb[actual_tab_name]
            start_row = -1
            for r_idx in range(1, ws.max_row + 1):
                cell_val = ws.cell(row=r_idx, column=1).value
                if cell_val and re.sub(r'\s+', ' ', str(cell_val)).strip().lower() == fo_name:
                    start_row = r_idx
                    break
            
            if start_row != -1:
                BLOCK_SIZE = 40
                for key, col_idx in KPI_MAP.items():
                    ids = data.get(key) or []
                    for i in range(BLOCK_SIZE):
                        if i < len(ids):
                            ws.cell(row=start_row + i, column=col_idx).value = str(ids[i]).strip()

        # 2. Update CONSOLIDATED SHEET Attendance & Counts
        if "CONSOLIDATED SHEET" in wb.sheetnames:
            ws_cons = wb["CONSOLIDATED SHEET"]
            base_col = -1
            for c_idx in range(22, ws_cons.max_column + 1):
                cell_val = ws_cons.cell(row=1, column=c_idx).value
                if cell_val and re.sub(r'\s+', ' ', str(cell_val)).strip().lower() == fo_name:
                    base_col = c_idx
                    break
            
            if base_col != -1:
                cons_row = 1 + day_int
                ws_cons.cell(row=cons_row, column=base_col + 1).value = "Present"
                ws_cons.cell(row=cons_row, column=base_col + 2).value = len(data.get("hiv_dm_ids") or [])
                ws_cons.cell(row=cons_row, column=base_col + 3).value = len(data.get("dbt_ids") or [])
                
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output.getvalue()

@app.get("/download-kpi-workbook")
async def download_kpi_workbook(district: str, month: Optional[str] = None):
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
async def download_all_kpi_workbooks(month: Optional[str] = None):
    try:
        districts = ["Aurangabad", "Bhojpur", "Buxar", "Jamui", "Jehanabad", "Kaimur", "Lakhisarai", "Munger", "Nawada", "Sheikhpura"]
        zip_buffer = io.BytesIO()
        month_tag = month or datetime.now().strftime("%Y-%m")
        
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for dist in districts:
                excel_bytes = await asyncio.to_thread(lambda d=dist: generate_district_kpi_bytes(d, month))
                if excel_bytes:
                    zip_file.writestr(f"KPI_Report_{safe_filename(dist)}_{month_tag}.xlsx", excel_bytes)
                    
        zip_buffer.seek(0)
        headers = {
            'Content-Disposition': f'attachment; filename="DFY_Master_KPI_All_Districts_{month_tag}.zip"'
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
        # Step 1: Verify PIN
        pin_doc = db.collection("staff_directory").document(f"{req.working_place}_{req.fo_name}".replace(" ", "").lower()).get()
        if not pin_doc.exists or pin_doc.to_dict().get("pin") != req.pin:
            raise HTTPException(status_code=401, detail="Invalid PIN")
            
        # Step 2: Fetch Target
        target_val = 0
        target_docs = db.collection("staff_targets").where("district", "==", req.working_place).where("fo_name", "==", req.fo_name).stream()
        for t in target_docs:
            target_val = t.to_dict().get("target", 0)
            break
            
        # Step 3: Fetch all reports for the month
        # Since we don't have indexes for fo_name + date, we can fetch by fo_name and filter in memory
        reports = db.collection("daily_field_reports").where("fo_name", "==", req.fo_name).where("working_place", "==", req.working_place).stream()
        
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
            "consent_with_id": 0
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
        
        return {
            "success": True,
            "target": target_val,
            "total_achieved": total_achieved,
            "breakdown": stats,
            "daily_history": daily_history,
            "streak_days": streak_days,
            "total_km": total_km_month,
            "badges": badges
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/admin/today-attendance")
async def get_today_attendance(date: Optional[str] = None):
    try:
        if not date:
            date = datetime.now().strftime("%Y-%m-%d")
            
        cache_key = f"attendance_{date}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached
            
        # 1. Fetch all active staff
        staff_docs = await asyncio.to_thread(lambda: list(db.collection("staff_directory").stream()))
        staff_list = []
        for doc in staff_docs:
            d = doc.to_dict()
            if d.get("district") and d.get("name"):
                staff_list.append({
                    "district": d.get("district"),
                    "fo_name": d.get("name"),
                    "designation": d.get("designation", "Field Officer")
                })
                
        # 2. Fetch daily field reports for this date
        report_docs = await asyncio.to_thread(lambda: list(db.collection("daily_field_reports").where("date_of_reporting", "==", date).stream()))
        reports_map = {}
        for doc in report_docs:
            d = doc.to_dict()
            key = f"{d.get('working_place')}_{d.get('fo_name')}".replace(" ", "").lower()
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
async def duplicate_audit(month: Optional[str] = None):
    try:
        if not month:
            month = datetime.now().strftime("%Y-%m")
            
        start_date = f"{month}-01"
        end_date = f"{month}-31"
        
        docs = db.collection("daily_field_reports")\
            .where("date_of_reporting", ">=", start_date)\
            .where("date_of_reporting", "<=", end_date)\
            .stream()
            
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
            "consent_with_id_ids": "Consent with ID"
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
                    
        return {
            "status": "success",
            "month": month,
            "total_same_category_duplicates": len(same_category_duplicates),
            "total_cross_category": len(cross_category_history),
            "total_duplicate_ids": len(same_category_duplicates) + len(cross_category_history),
            "same_category_duplicates": same_category_duplicates,
            "cross_category_history": cross_category_history,
            "duplicates": same_category_duplicates + cross_category_history
        }
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
        auth_data = await asyncio.to_thread(get_or_init_admin_auth)
        correct_pw = auth_data.get("password", "dfyadmin2026")
        if req.password == correct_pw:
            return {"success": True, "message": "Login successful"}
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
async def export_state_summary(month: Optional[str] = None):
    try:
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
        bihar_districts = ["Aurangabad", "Bhojpur", "Buxar", "Jamui", "Jehanabad", "Kaimur", "Lakhisarai", "Munger", "Nawada", "Sheikhpura"]
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
            for cell in ws[1]:
                cell.font = openpyxl.styles.Font(bold=True, color="FFFFFF")
                cell.fill = openpyxl.styles.PatternFill(start_color="4F46E5", end_color="4F46E5", fill_type="solid")
                cell.alignment = openpyxl.styles.Alignment(horizontal="center")
                
        output.seek(0)
        filename = f"DFY_State_Summary_{month}.xlsx"
        return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename={filename}"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/admin/export-fo-dossier")
async def export_fo_dossier(month: Optional[str] = None):
    try:
        if not month:
            month = datetime.now().strftime("%Y-%m")
            
        start_date = f"{month}-01"
        end_date = f"{month}-31"
        
        report_docs = await asyncio.to_thread(lambda: list(db.collection("daily_field_reports")
            .where("date_of_reporting", ">=", start_date)
            .where("date_of_reporting", "<=", end_date)
            .stream()))
            
        staff_docs = await asyncio.to_thread(lambda: list(db.collection("staff_directory").stream()))
        staff_map = {}
        for sd in staff_docs:
            d = sd.to_dict()
            key = (d.get("district", ""), d.get("name", ""))
            staff_map[key] = {
                "District": d.get("district", ""),
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
        df.sort_values(by=["District", "Officer Name"], inplace=True)
        
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name="FO Performance Dossier")
            ws = writer.sheets["FO Performance Dossier"]
            for cell in ws[1]:
                cell.font = openpyxl.styles.Font(bold=True, color="FFFFFF")
                cell.fill = openpyxl.styles.PatternFill(start_color="10B981", end_color="10B981", fill_type="solid")
                cell.alignment = openpyxl.styles.Alignment(horizontal="center")
                
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
async def edit_patient_id(req: EditIdRequest):
    try:
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
async def get_staff_full_list():
    try:
        docs = await asyncio.to_thread(lambda: list(db.collection("staff_directory").stream()))
        staff = []
        for doc in docs:
            d = doc.to_dict()
            if d.get("district") and d.get("name"):
                staff.append({
                    "id": doc.id,
                    "district": d.get("district"),
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
async def add_staff_member(req: AddStaffReq):
    try:
        clean_dist = req.district.strip()
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
async def update_staff_pin(req: UpdatePinReq):
    try:
        clean_dist = req.district.strip()
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
async def delete_staff_member(req: DeleteStaffReq):
    try:
        clean_dist = req.district.strip()
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
async def export_staff_pins(district: Optional[str] = "All"):
    try:
        docs = await asyncio.to_thread(lambda: list(db.collection("staff_directory").stream()))
        rows = []
        s_no = 1
        for doc in docs:
            d = doc.to_dict()
            dist = d.get("district", "")
            name = d.get("name", "")
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
            sheet_title = f"PINs {district}"
            df.to_excel(writer, index=False, sheet_name=sheet_title[:31])
            ws = writer.sheets[sheet_title[:31]]
            for cell in ws[1]:
                cell.font = openpyxl.styles.Font(bold=True, color="FFFFFF")
                cell.fill = openpyxl.styles.PatternFill(start_color="4F46E5", end_color="4F46E5", fill_type="solid")
                cell.alignment = openpyxl.styles.Alignment(horizontal="center")
                
        output.seek(0)
        filename = f"DFY_Staff_PIN_Directory_{district}_{datetime.now().strftime('%Y-%m-%d')}.xlsx"
        return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename={filename}"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
