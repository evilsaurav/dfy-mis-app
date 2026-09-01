import re

with open('main.py', 'r', encoding='utf-8') as f:
    content = f.read()

new_logic = r"""@app.get("/download-excel")
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
        raise HTTPException(status_code=500, detail=str(e))"""

content = re.sub(r'@app\.get\("/download-excel"\).*?raise HTTPException\(status_code=500, detail=str\(e\)\)', new_logic, content, flags=re.DOTALL)

with open('main.py', 'w', encoding='utf-8') as f:
    f.write(content)
