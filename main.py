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
        'storageBucket': 'dfy-reporting-mis.firebasestorage.app'
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

@app.post("/submit-daily-report")
async def submit_report(data: DailyActivityReport):
    try:
        doc_id = f"{data.working_place}_{data.fo_name}".replace(" ", "").lower()
        staff_doc = db.collection("staff_directory").document(doc_id).get()
        
        if not staff_doc.exists:
            raise HTTPException(status_code=404, detail="Ye ladka database me nahi hai.")
            
        real_pin = staff_doc.to_dict().get("pin")
        if str(data.pin) != str(real_pin):
            raise HTTPException(status_code=401, detail="Galat PIN bhai. Chori pakdi gayi.")

        payload = data.dict()
        del payload['pin']
        
        if not payload['date_of_reporting']:
            payload['date_of_reporting'] = datetime.now().strftime("%Y-%m-%d")
        
        payload['designation'] = staff_doc.to_dict().get("designation", "FO")
        
        doc_ref = db.collection("daily_field_reports").document()
        doc_ref.set(payload)
        return {"status": "success", "message": "Report Saved"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/download-excel")
async def download_excel():
    try:
        docs = db.collection("daily_field_reports").stream()
        consolidated_data = []
        for doc in docs:
            data = doc.to_dict()
            row = {
                "Date": data.get("date_of_reporting", ""),
                "Name": data.get("fo_name", ""),
                "Designation": data.get("designation", ""),
                "Block": data.get("working_place", ""),
                "Notification": ", ".join(data.get("notification_ids", [])),
                "HIV & DM": ", ".join(data.get("hiv_dm_ids", [])),
                "DBT": ", ".join(data.get("dbt_ids", [])),
                "Sample Collection": ", ".join(data.get("sample_collection_ids", [])),
                "Sample Tested": ", ".join(data.get("sample_tested_ids", [])),
                "Outcome Assigned": ", ".join(data.get("outcome_assigned_ids", [])),
                "Home Visit": ", ".join(data.get("home_visit_ids", [])),
                "Contact Tracing": ", ".join(data.get("contact_tracing_ids", [])),
                "Follow Up": ", ".join(data.get("follow_up_ids", [])),
                "Face to Face": ", ".join(data.get("face_to_face_ids", [])),
                "Presumptive": ", ".join(data.get("presumptive_ids", [])),
                "Documents": ", ".join(data.get("documents_ids", [])),
                "FDC Provided": ", ".join(data.get("fdc_provided_ids", [])),
                "Kit Consumption": ", ".join(data.get("kit_consumption_ids", [])),
                "Morning KM": data.get("morning_km", 0),
                "Evening KM": data.get("evening_km", 0),
                "Total KM": data.get("total_km", 0),
                "Doctors Visited": ", ".join(data.get("visited_names", [])),
                "Morning KM Photo": data.get("morning_km_photo_url", ""),
                "Evening KM Photo": data.get("evening_km_photo_url", ""),
                "Remarks": "Entry Adjusted (Time Override Used)" if data.get("is_override_used") else ""
            }
            consolidated_data.append(row)

        df = pd.DataFrame(consolidated_data)
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