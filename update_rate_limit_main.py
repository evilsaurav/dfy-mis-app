import os

with open("main.py", "r", encoding="utf-8") as f:
    text = f.read()

# Update check-today-status
check_status_code = """@app.post("/check-today-status")
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
        raise HTTPException(status_code=500, detail=str(e))"""

start_check = text.find('@app.post("/check-today-status")')
end_check = text.find('except Exception as e:\n        raise HTTPException(status_code=500, detail=str(e))', start_check) + 82
text = text[:start_check] + check_status_code + text[end_check:]


# Update submit-daily-report
submit_code = """@app.post("/submit-daily-report")
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
        raise HTTPException(status_code=500, detail=str(e))"""

start_submit = text.find('@app.post("/submit-daily-report")')
end_submit = text.find('except Exception as e:\n        raise HTTPException(status_code=500, detail=str(e))', start_submit) + 82
text = text[:start_submit] + submit_code + text[end_submit:]

with open("main.py", "w", encoding="utf-8") as f:
    f.write(text)

