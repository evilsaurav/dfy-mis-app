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
    
    doctor_store_visits_count: Optional[int] = 0
    visited_names: List[str] = []
    morning_km: Optional[int] = 0
    evening_km: Optional[int] = 0
    total_km: Optional[int] = 0
    
    morning_km_photo_url: Optional[str] = None
    evening_km_photo_url: Optional[str] = None
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
        # First check if there is an incomplete past report for this user
        past_docs = db.collection("daily_field_reports").where("fo_name", "==", req.fo_name).stream()
        past_docs_list = [d.to_dict() for d in past_docs]
        
        # Sort by date descending in memory to avoid needing composite indexes in Firestore
        past_docs_list.sort(key=lambda x: x.get("date_of_reporting") or x.get("date", ""), reverse=True)
        
        if past_docs_list:
            last_doc = past_docs_list[0]
            last_date = last_doc.get("date_of_reporting") or last_doc.get("date", "")
            # If the most recent report is BEFORE today, and its status is still in_progress
            if last_date < req.date and last_doc.get("status") == "in_progress":
                return {"status": "pending_previous", "data": last_doc}

        # If no pending previous, check today's status normally
        doc_id = f"{req.working_place}_{req.fo_name}_{req.date}".replace(" ", "_").lower()
        doc_ref = db.collection("daily_field_reports").document(doc_id)
        doc = doc_ref.get()
        if doc.exists:
            return {"status": doc.to_dict().get("status", "in_progress"), "data": doc.to_dict()}
        return {"status": "not_started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/start-day")
async def start_day(req: StartDayRequest):
    try:
        doc_id = f"{req.working_place}_{req.fo_name}_{req.date}".replace(" ", "_").lower()
        doc_ref = db.collection("daily_field_reports").document(doc_id)
        
        payload = req.dict()
        payload["date_of_reporting"] = req.date
        payload["status"] = "in_progress"
        payload["timestamp_started"] = firestore.SERVER_TIMESTAMP
        
        doc_ref.set(payload)
        return {"message": "Day started successfully"}
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
            "kit_consumption_ids": "Kit Consumption"
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
                    row["Remarks"] = "Entry Adjusted (Time Override Used)" if data.get("is_override_used") else ""
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


