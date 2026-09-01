with open("main.py", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

old_kpi_func = """def generate_district_kpi_bytes(district: str) -> Optional[bytes]:
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
                excel_bytes = await asyncio.to_thread(lambda: generate_district_kpi_bytes(dist))
                if excel_bytes:
                    zip_file.writestr(f"KPI_Report_{dist}.xlsx", excel_bytes)
                    
        zip_buffer.seek(0)
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename=DFY_Master_KPI_All_Districts_{datetime.now().strftime('%Y_%m_%d')}.zip"}
        )"""

new_kpi_func = """def generate_district_kpi_bytes(district: str, month_prefix: Optional[str] = None) -> Optional[bytes]:
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
            f_name = re.sub(r'\\s+', ' ', str(t_data.get("fo_name", ""))).strip().lower()
            if f_name:
                target_map[f_name] = t_data.get("target", 0)
    except Exception as e:
        print(f"Target fetch notice for {district}: {e}")
        
    if "Performance sheet" in wb.sheetnames:
        ws_perf = wb["Performance sheet"]
        for r_idx in range(2, ws_perf.max_row + 1):
            cell_name = ws_perf.cell(row=r_idx, column=1).value
            if cell_name and str(cell_name).strip() != "GRAND TOTAL":
                norm_name = re.sub(r'\\s+', ' ', str(cell_name)).strip().lower()
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
        fo_name = re.sub(r'\\s+', ' ', str(data.get("fo_name", ""))).strip().lower()
        
        # 1. Update Daily Tab
        if actual_tab_name and actual_tab_name in wb.sheetnames:
            ws = wb[actual_tab_name]
            start_row = -1
            for r_idx in range(1, ws.max_row + 1):
                cell_val = ws.cell(row=r_idx, column=1).value
                if cell_val and re.sub(r'\\s+', ' ', str(cell_val)).strip().lower() == fo_name:
                    start_row = r_idx
                    break
            
            if start_row != -1:
                BLOCK_SIZE = 40
                for key, col_idx in KPI_MAP.items():
                    ids = data.get(key) or []
                    for i in range(BLOCK_SIZE):
                        if i < len(ids):
                            ws.cell(row=start_row + i, column=col_idx).value = str(ids[i]).strip()

        # 2. Update CONSOLIDATED SHEET
        if "CONSOLIDATED SHEET" in wb.sheetnames:
            ws_cons = wb["CONSOLIDATED SHEET"]
            base_col = -1
            for c_idx in range(22, ws_cons.max_column + 1):
                cell_val = ws_cons.cell(row=1, column=c_idx).value
                if cell_val and re.sub(r'\\s+', ' ', str(cell_val)).strip().lower() == fo_name:
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
                excel_bytes = await asyncio.to_thread(lambda: generate_district_kpi_bytes(dist, month))
                if excel_bytes:
                    zip_file.writestr(f"KPI_Report_{dist}_{month_tag}.xlsx", excel_bytes)
                    
        zip_buffer.seek(0)
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename=DFY_Master_KPI_All_Districts_{month_tag}.zip"}
        )"""

if old_kpi_func in text:
    text = text.replace(old_kpi_func, new_kpi_func)
    print("generate_district_kpi_bytes & download endpoints upgraded successfully")
else:
    print("old_kpi_func not found")

with open("main.py", "w", encoding="utf-8") as f:
    f.write(text)

