with open("main.py", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

# 1. Update my_profile_stats with streaks & badges
old_profile_return = """        total_achieved = sum(stats.values())
        
        return {
            "success": True,
            "target": target_val,
            "total_achieved": total_achieved,
            "breakdown": stats,
            "daily_history": daily_history
        }"""

new_profile_return = """        total_achieved = sum(stats.values())
        
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
        }"""

if old_profile_return in text:
    text = text.replace(old_profile_return, new_profile_return)
    print("my_profile_stats updated with streaks & badges")
else:
    print("old_profile_return not found")

# 2. Add /admin/duplicate-audit endpoint at the end of main.py
duplicate_audit_endpoint = """
@app.get("/admin/duplicate-audit")
async def duplicate_audit(month: Optional[str] = None):
    try:
        if not month:
            month = datetime.now().strftime("%Y-%m")
            
        start_date = f"{month}-01"
        end_date = f"{month}-31"
        
        docs = db.collection("daily_field_reports")\\
            .where("date_of_reporting", ">=", start_date)\\
            .where("date_of_reporting", "<=", end_date)\\
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
                            
        # Filter for actual duplicates
        duplicates = []
        for pid, occurrences in id_registry.items():
            if len(occurrences) > 1:
                # Check if occurrences are from different FOs or different dates
                unique_keys = set(f"{o['district']}_{o['fo_name']}_{o['date']}_{o['category']}" for o in occurrences)
                if len(unique_keys) > 1 or len(occurrences) > 1:
                    duplicates.append({
                        "patient_id": pid,
                        "occurrence_count": len(occurrences),
                        "occurrences": occurrences
                    })
                    
        return {
            "status": "success",
            "month": month,
            "total_duplicate_ids": len(duplicates),
            "duplicates": duplicates
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
"""

if "/admin/duplicate-audit" not in text:
    text += duplicate_audit_endpoint
    print("/admin/duplicate-audit endpoint added")

with open("main.py", "w", encoding="utf-8") as f:
    f.write(text)

