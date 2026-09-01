with open("main.py", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

# Check if zipfile is imported
if "import zipfile" not in text:
    text = "import zipfile\n" + text

# Refactor KPI generation into helper function and update download_kpi_workbook and add download_all_kpi_workbooks
old_kpi_block = """@app.get("/download-kpi-workbook")
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
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))"""

new_kpi_block = """def generate_district_kpi_bytes(district: str) -> Optional[bytes]:
    safe_dist = safe_filename(district)
    template_path = f"templates/template_{safe_dist}.xlsx"
    if not os.path.exists(template_path):
        return None
        
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

        # 2. Update CONSOLIDATED SHEET
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
    return output.getvalue()

@app.get("/download-kpi-workbook")
async def download_kpi_workbook(district: str):
    try:
        excel_bytes = await asyncio.to_thread(lambda: generate_district_kpi_bytes(district))
        if not excel_bytes:
            raise HTTPException(status_code=404, detail=f"Template for {district} not found on server.")
            
        safe_dist = safe_filename(district)
        headers = {
            'Content-Disposition': f'attachment; filename="KPI_Report_{safe_dist}.xlsx"'
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
async def download_all_kpi_workbooks():
    try:
        districts = ["Aurangabad", "Bhojpur", "Buxar", "Jamui", "Jehanabad", "Kaimur", "Lakhisarai", "Munger", "Nawada", "Sheikhpura"]
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for dist in districts:
                excel_bytes = await asyncio.to_thread(lambda d=dist: generate_district_kpi_bytes(d))
                if excel_bytes:
                    zip_file.writestr(f"KPI_Report_{safe_filename(dist)}.xlsx", excel_bytes)
                    
        zip_buffer.seek(0)
        now_str = datetime.now().strftime("%Y_%m_%d")
        headers = {
            'Content-Disposition': f'attachment; filename="DFY_Master_KPI_All_Districts_{now_str}.zip"'
        }
        return StreamingResponse(
            zip_buffer,
            headers=headers,
            media_type="application/zip"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))"""

if old_kpi_block in text:
    text = text.replace(old_kpi_block, new_kpi_block)
    print("KPI blocks updated")
else:
    print("old_kpi_block not found")

# Add /admin/today-attendance endpoint
attendance_endpoint = """
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
"""

if "/admin/today-attendance" not in text:
    text += "\n" + attendance_endpoint
    print("attendance_endpoint added")

# Update my_profile_stats to include daily_history
old_profile_backend = """        for rep in reports:
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
        }"""

new_profile_backend = """        daily_history = {}
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
                daily_history[date_str] = {
                    "submitted": True,
                    "count": data.get("submission_count", 1),
                    "total_ids": day_total
                }
                        
        total_achieved = sum(stats.values())
        
        return {
            "success": True,
            "target": target_val,
            "total_achieved": total_achieved,
            "breakdown": stats,
            "daily_history": daily_history
        }"""

if old_profile_backend in text:
    text = text.replace(old_profile_backend, new_profile_backend)
    print("my_profile_stats daily_history updated")
else:
    print("old_profile_backend not found")

with open("main.py", "w", encoding="utf-8") as f:
    f.write(text)

