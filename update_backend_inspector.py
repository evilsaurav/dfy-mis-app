with open("main.py", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

# 1. Update admin/dashboard-data records
old_record_block = """                # Group 5 (New Fields)
                "differentiated_tb": len(data.get("differentiated_tb_ids", [])),
                "tpt_treatment_start": len(data.get("tpt_treatment_start_ids", [])),
                "tpt_presumptive": len(data.get("tpt_presumptive_ids", [])),
                "adhar_face_auth": len(data.get("adhar_face_authentication_ids", [])),
                "consent_with_id": len(data.get("consent_with_id_ids", [])),
                
                "is_override": data.get("is_override_used", False)
            })"""

new_record_block = """                # Group 5 (New Fields)
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
            })"""

if old_record_block in text:
    text = text.replace(old_record_block, new_record_block)
    print("dashboard-data enriched with ID arrays")
else:
    print("old_record_block not found")

# 2. Update my_profile_stats daily_history
old_profile_history = """                daily_history[date_str] = {
                    "submitted": True,
                    "count": data.get("submission_count", 1),
                    "total_ids": day_total
                }"""

new_profile_history = """                day_categories = {}
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
                }"""

if old_profile_history in text:
    text = text.replace(old_profile_history, new_profile_history)
    print("my_profile_stats daily_history enriched with full categories and details")
else:
    print("old_profile_history not found")

with open("main.py", "w", encoding="utf-8") as f:
    f.write(text)

