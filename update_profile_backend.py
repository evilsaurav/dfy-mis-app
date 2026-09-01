import os

with open("main.py", "r", encoding="utf-8") as f:
    text = f.read()

# Add /my-profile-stats endpoint
my_profile_code = """
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
        
        for rep in reports:
            data = rep.to_dict()
            date_str = data.get("date_of_reporting") or data.get("date", "")
            if date_str.startswith(req.month):
                for k in stats.keys():
                    arr = data.get(k + "_ids", [])
                    if isinstance(arr, list):
                        stats[k] += len(arr)
                        
        total_achieved = sum(stats.values())
        
        return {
            "success": True,
            "target": target_val,
            "total_achieved": total_achieved,
            "breakdown": stats
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
"""

text = text + my_profile_code

with open("main.py", "w", encoding="utf-8") as f:
    f.write(text)

