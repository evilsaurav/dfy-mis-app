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
                
                "is_override": data.get("is_override_used", False)
            })
            
        return {"records": records}
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/verify-pin")
async def verify_pin(data: PinCheck):
    try:
        doc_id = f"{data.working_place}_{data.fo_name}".replace(" ", "").lower()
        staff_doc = db.collection("staff_directory").document(doc_id).get()
        
        if not staff_doc.exists:
            return {"valid": False}
            
        real_pin = staff_doc.to_dict().get("pin")
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
        doc_ref = db.collection("daily_field_reports").document(doc_id)
        doc = doc_ref.get()
        if doc.exists:
            d = doc.to_dict()
            subs = d.get("submission_count", 0)
            if subs >= 2:
                return {"status": "max_limit_reached"}
            elif subs == 1:
                return {"status": "not_started", "data": {}}
            else:
                return {"status": d.get("status", "in_progress"), "data": d}
        return {"status": "not_started"}
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
        return {"message": "Daily report submitted successfully"}
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/download-kpi-workbook")
async def download_kpi_workbook(district: str):
    try:
        safe_dist = safe_filename(district)
        template_path = f"templates/template_{safe_dist}.xlsx"
        if not os.path.exists(template_path):
            raise HTTPException(status_code=404, detail=f"Template for {district} not found on server.")
        
        wb = openpyxl.load_workbook(template_path)
        
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
            date_str = data.get("date_of_reporting")
            if not date_str:
                continue
                
            try:
                day_int = int(date_str.split('-')[2])
            except:
                continue
                
            tab_name = ordinal(day_int)
            fo_name = data.get("fo_name", "").strip().lower()
            
            # 1. Update Daily Tab
            if tab_name in wb.sheetnames:
                ws = wb[tab_name]
                start_row = -1
                for r_idx in range(1, ws.max_row + 1):
                    cell_val = ws.cell(row=r_idx, column=1).value
                    if cell_val and str(cell_val).strip().lower() == fo_name:
                        start_row = r_idx
                        break
                
                if start_row != -1:
                    BLOCK_SIZE = 40
                    for key, col_idx in KPI_MAP.items():
                        ids = data.get(key) or []
                        for i in range(BLOCK_SIZE):
                            if i < len(ids):
                                ws.cell(row=start_row + i, column=col_idx).value = str(ids[i])

            # 2. Update CONSOLIDATED SHEET (Right Section)
            if "CONSOLIDATED SHEET" in wb.sheetnames:
                ws_cons = wb["CONSOLIDATED SHEET"]
                base_col = -1
                for c_idx in range(1, ws_cons.max_column + 1):
                    cell_val = ws_cons.cell(row=1, column=c_idx).value
                    if cell_val and str(cell_val).strip().lower() == fo_name:
                        base_col = c_idx
                        break
                
                if base_col != -1:
                    cons_row = 2 + day_int
                    ws_cons.cell(row=cons_row, column=base_col + 1).value = "Present"
                    ws_cons.cell(row=cons_row, column=base_col + 2).value = len(data.get("hiv_dm_ids") or [])
                    ws_cons.cell(row=cons_row, column=base_col + 3).value = len(data.get("dbt_ids") or [])
                    
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        
        headers = {
            'Content-Disposition': f'attachment; filename="KPI_Report_{safe_dist}.xlsx"'
        }
        return StreamingResponse(
            output, 
            headers=headers,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/staff-directory")
async def get_staff_directory():
    try:
        docs = db.collection("staff_directory").stream()
        directory = {}
        for doc in docs:
            data = doc.to_dict()
            district = data.get("district")
            name = data.get("name")
            if district and name:
                if district not in directory:
                    directory[district] = []
                directory[district].append(name)
        
        # Sort names within districts
        for d in directory:
            directory[d] = sorted(directory[d])
            
        # Return sorted by district name too if preferred, but dict is fine
        return {"status": "success", "data": directory}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
