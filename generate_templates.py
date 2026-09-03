# -*- coding: utf-8 -*-
"""
generate_templates.py
Master Blueprint: District KPI Multi-Tab Excel Engine Template Generator
Creates 33-tab production-grade KPI templates for all 10 Bihar districts.
"""
import os
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

DISTRICT_STAFF = {
    "Aurangabad": ["Prince Kumar", "Rahul Kumar", "Ram Ji Singh", "Rishu Kumar"],
    "Bhojpur": ["Ashwani Kr Keshri", "Mukesh Tiwari", "Naveen Kumar", "Rahul Kumar", "Ram Prasad", "Surya Pratap"],
    "Buxar": ["Krishna Kumar", "Mukul Kumar", "Nilesh Ranjan", "Raj Tiwari", "Randhir Kumar", "Shailesh Kumar", "Srishty Singh"],
    "Jamui": ["Bablu Kumar", "Monu Kumar", "Rajiv Kumar", "Rinki Kumari"],
    "Jehanabad": ["Sammer Arya", "Shashi Ranjan", "Suraj Kumar"],
    "Kaimur": ["Durgesh Kumar", "Praphull Kumar", "Raushan Kumar", "Vinit Kumar"],
    "Lakhisarai": ["Ankit Kumar", "Ram Prakash"],
    "Munger": ["Amit Kumar", "Devrath Kumar", "Jayant Kumar", "Md. Raza Uddin", "Saif Khan", "Shyam Kumar Gupta", "Sudhanshu Prasad", "Sumit Kr Singh"],
    "Nawada": ["Devraj Kumar", "Rajesh Kumar", "Rajiv Kumar"],
    "Sheikhpura": ["Dhiraj Kumar", "Nilkamal Kumar"]
}

KPI_CATEGORIES = [
    ("NOTIFICATION", "notification_ids"),
    ("HIV & DM", "hiv_dm_ids"),
    ("DBT", "dbt_ids"),
    ("SAMPLE COLLECTION", "sample_collection_ids"),
    ("SAMPLE TESTED", "sample_tested_ids"),
    ("Outcome Assigned", "outcome_assigned_ids"),
    ("Home Visit", "home_visit_ids"),
    ("Contact Tracing", "contact_tracing_ids"),
    ("Follow Up", "follow_up_ids"),
    ("Face to Face", "face_to_face_ids"),
    ("Presumptive", "presumptive_ids"),
    ("Documents", "documents_ids"),
    ("FDC Provided", "fdc_provided_ids"),
    ("Kit Consumption", "kit_consumption_ids")
]

def get_ordinal_tab_name(day: int) -> str:
    if day == 1:
        return "1ST"
    elif day == 2:
        return "2nd"
    elif day == 3:
        return "3rd"
    elif day in [21, 31]:
        return f"{day}st"
    elif day == 22:
        return "22nd"
    elif day == 23:
        return "23rd"
    else:
        return f"{day}th"

# Styling definitions
font_title = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
font_header = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
font_bold = Font(name="Calibri", size=10, bold=True, color="000000")
font_regular = Font(name="Calibri", size=10, bold=False, color="000000")

fill_navy = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid") # Dark Blue
fill_indigo = PatternFill(start_color="4338CA", end_color="4338CA", fill_type="solid")
fill_gray_header = PatternFill(start_color="374151", end_color="374151", fill_type="solid")
fill_green_header = PatternFill(start_color="047857", end_color="047857", fill_type="solid")
fill_gold_total = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")

thin_border = Border(
    left=Side(style='thin', color='D1D5DB'),
    right=Side(style='thin', color='D1D5DB'),
    top=Side(style='thin', color='D1D5DB'),
    bottom=Side(style='thin', color='D1D5DB')
)

align_center = Alignment(horizontal="center", vertical="center", wrap_text=True)

def generate_district_template(district: str, staff_list: list, output_path: str):
    wb = openpyxl.Workbook()
    default_sheet = wb.active
    
    daily_tab_names = [get_ordinal_tab_name(d) for d in range(1, 32)]
    
    # -------------------------------------------------------------
    # 1. TAB 1: 'Performance sheet'
    # -------------------------------------------------------------
    ws_perf = wb.create_sheet(title="Performance sheet")
    ws_perf.views.sheetView[0].showGridLines = True
    
    # Title Banner
    ws_perf.merge_cells("A1:R2")
    ws_perf["A1"] = f"DOCTORS FOR YOU (DFY) -- DISTRICT KPI PERFORMANCE SHEET ({district.upper()})"
    ws_perf["A1"].font = Font(name="Calibri", size=14, bold=True, color="FFFFFF")
    ws_perf["A1"].fill = fill_navy
    ws_perf["A1"].alignment = align_center
    
    # Subtitle Row 3
    ws_perf["A3"] = f"Monthly Evaluation & Notification Target Achievement Matrix"
    ws_perf["A3"].font = Font(name="Calibri", size=10, italic=True, color="6B7280")
    
    # Row 4: Headers
    perf_headers = [
        "Employee Name", "DESIG.", "Target", "NOTIFICATION", "% Achieved"
    ] + [kpi[0] for kpi in KPI_CATEGORIES[1:]] # HIV & DM to Kit Consumption
    
    for c_idx, h in enumerate(perf_headers, start=1):
        cell = ws_perf.cell(row=4, column=c_idx, value=h)
        cell.font = font_header
        cell.fill = fill_indigo if c_idx <= 5 else fill_gray_header
        cell.alignment = align_center
        cell.border = thin_border
        
    # Row 5 onwards: Staff Rows
    start_r = 5
    for idx, staff_name in enumerate(staff_list):
        r = start_r + idx
        ws_perf.cell(row=r, column=1, value=staff_name).font = font_bold
        ws_perf.cell(row=r, column=2, value="Field Officer").font = font_regular
        ws_perf.cell(row=r, column=3, value=50).font = font_bold # Target
        ws_perf.cell(row=r, column=3).alignment = align_center
        
        # In CONSOLIDATED SHEET Right Wing:
        # Staff idx block starts at column 40 + (idx * 14)
        cons_start_col = 40 + (idx * 14)
        
        # Col D (NOTIFICATION) -> references Row 3 of this staff in CONSOLIDATED SHEET
        notif_col_letter = get_column_letter(cons_start_col)
        ws_perf.cell(row=r, column=4, value=f"='CONSOLIDATED SHEET'!{notif_col_letter}3").font = font_bold
        ws_perf.cell(row=r, column=4).alignment = align_center
        
        # Col E (% Achieved) -> Formula =IF(C{r}>0, D{r}/C{r}, 0)
        cell_pct = ws_perf.cell(row=r, column=5, value=f"=IF(C{r}>0, D{r}/C{r}, 0)")
        cell_pct.font = font_bold
        cell_pct.alignment = align_center
        cell_pct.number_format = "0.0%"
        
        # Cols F to R (Remaining 13 KPIs)
        for k_idx in range(1, len(KPI_CATEGORIES)):
            col_target = 5 + k_idx # Col 6 is F
            cons_kpi_col = get_column_letter(cons_start_col + k_idx)
            c = ws_perf.cell(row=r, column=col_target, value=f"='CONSOLIDATED SHEET'!{cons_kpi_col}3")
            c.font = font_regular
            c.alignment = align_center
            c.border = thin_border
            
        for c in range(1, len(perf_headers) + 1):
            ws_perf.cell(row=r, column=c).border = thin_border
            
    # Grand Total Row
    total_r = start_r + len(staff_list)
    ws_perf.cell(row=total_r, column=1, value="GRAND TOTAL").font = font_title
    ws_perf.cell(row=total_r, column=1).fill = fill_navy
    ws_perf.cell(row=total_r, column=2, value="").fill = fill_navy
    
    # Target Total
    ws_perf.cell(row=total_r, column=3, value=f"=SUM(C{start_r}:C{total_r-1})").font = font_title
    ws_perf.cell(row=total_r, column=3).fill = fill_navy
    ws_perf.cell(row=total_r, column=3).alignment = align_center
    
    # Notif Total
    ws_perf.cell(row=total_r, column=4, value=f"=SUM(D{start_r}:D{total_r-1})").font = font_title
    ws_perf.cell(row=total_r, column=4).fill = fill_navy
    ws_perf.cell(row=total_r, column=4).alignment = align_center
    
    # Overall % Achieved Total
    cell_tot_pct = ws_perf.cell(row=total_r, column=5, value=f"=IF(C{total_r}>0, D{total_r}/C{total_r}, 0)")
    cell_tot_pct.font = font_title
    cell_tot_pct.fill = fill_navy
    cell_tot_pct.alignment = align_center
    cell_tot_pct.number_format = "0.0%"
    
    for k_idx in range(1, len(KPI_CATEGORIES)):
        col_target = 5 + k_idx
        col_letter = get_column_letter(col_target)
        c = ws_perf.cell(row=total_r, column=col_target, value=f"=SUM({col_letter}{start_r}:{col_letter}{total_r-1})")
        c.font = font_title
        c.fill = fill_navy
        c.alignment = align_center
        c.border = thin_border
        
    for c in range(1, len(perf_headers) + 1):
        ws_perf.cell(row=total_r, column=c).border = thin_border

    ws_perf.column_dimensions['A'].width = 24
    ws_perf.column_dimensions['B'].width = 14
    ws_perf.column_dimensions['C'].width = 12
    ws_perf.column_dimensions['D'].width = 15
    ws_perf.column_dimensions['E'].width = 14
    for c in range(6, len(perf_headers) + 1):
        ws_perf.column_dimensions[get_column_letter(c)].width = 16

    # -------------------------------------------------------------
    # 2. TAB 2: 'CONSOLIDATED SHEET'
    # -------------------------------------------------------------
    ws_cons = wb.create_sheet(title="CONSOLIDATED SHEET")
    ws_cons.views.sheetView[0].showGridLines = True
    
    # Wing 1: Left Side (District Master Rollup & Master Log) -- Columns A to AM (Cols 1 to 39)
    left_clusters = [kpi[0] for kpi in KPI_CATEGORIES[:13]]
    
    for c_idx, cluster_name in enumerate(left_clusters):
        start_c = 1 + (c_idx * 3)
        end_c = start_c + 2
        
        ws_cons.merge_cells(start_row=1, start_column=start_c, end_row=1, end_column=end_c)
        r1_cell = ws_cons.cell(row=1, column=start_c, value=cluster_name)
        r1_cell.font = font_title
        r1_cell.fill = fill_navy
        r1_cell.alignment = align_center
        
        c_letter = get_column_letter(start_c)
        ws_cons.merge_cells(start_row=2, start_column=start_c, end_row=2, end_column=end_c)
        r2_cell = ws_cons.cell(row=2, column=start_c, value=f"=COUNTA({c_letter}4:{c_letter}5000)")
        r2_cell.font = font_title
        r2_cell.fill = fill_indigo
        r2_cell.alignment = align_center
        
        subheaders = ["Patient ID", "Date", "Reported by"]
        for s_idx, sh in enumerate(subheaders):
            sub_cell = ws_cons.cell(row=3, column=start_c + s_idx, value=sh)
            sub_cell.font = font_header
            sub_cell.fill = fill_gray_header
            sub_cell.alignment = align_center
            sub_cell.border = thin_border
            
        for r in range(1, 4):
            for c in range(start_c, end_c + 1):
                ws_cons.cell(row=r, column=c).border = thin_border
                
        ws_cons.column_dimensions[get_column_letter(start_c)].width = 14
        ws_cons.column_dimensions[get_column_letter(start_c+1)].width = 12
        ws_cons.column_dimensions[get_column_letter(start_c+2)].width = 18

    # Wing 2: Right Side (Staff-Wise Performance & Indicator Wing) -- Column AN (Col 40) onwards
    for s_idx, staff_name in enumerate(staff_list):
        staff_start_c = 40 + (s_idx * 14)
        staff_end_c = staff_start_c + 13
        
        ws_cons.merge_cells(start_row=1, start_column=staff_start_c, end_row=1, end_column=staff_end_c)
        r1_staff = ws_cons.cell(row=1, column=staff_start_c, value=staff_name)
        r1_staff.font = font_title
        r1_staff.fill = fill_green_header
        r1_staff.alignment = align_center
        
        fo_start_row = 2 + (s_idx * 40)
        fo_end_row = 1 + ((s_idx + 1) * 40)
        
        for k_idx, (kpi_name, _) in enumerate(KPI_CATEGORIES):
            c_num = staff_start_c + k_idx
            
            h_cell = ws_cons.cell(row=2, column=c_num, value=kpi_name)
            h_cell.font = font_header
            h_cell.fill = fill_gray_header
            h_cell.alignment = align_center
            h_cell.border = thin_border
            
            daily_col_letter = get_column_letter(3 + k_idx)
            sum_terms = [f"COUNTA('{tab}'!{daily_col_letter}{fo_start_row}:{daily_col_letter}{fo_end_row})" for tab in daily_tab_names]
            formula_3d = "=" + "+".join(sum_terms)
            
            r3_cell = ws_cons.cell(row=3, column=c_num, value=formula_3d)
            r3_cell.font = font_bold
            r3_cell.fill = fill_gold_total
            r3_cell.alignment = align_center
            r3_cell.border = thin_border
            
            ws_cons.column_dimensions[get_column_letter(c_num)].width = 15
            
        for r in range(1, 4):
            for c in range(staff_start_c, staff_end_c + 1):
                ws_cons.cell(row=r, column=c).border = thin_border

    # -------------------------------------------------------------
    # 3. TABS 3 to 33: Daily Tabs ('1ST' to '31st')
    # -------------------------------------------------------------
    daily_headers = ["NAME", "DESIGNATION"] + [kpi[0] for kpi in KPI_CATEGORIES]
    
    for day_int in range(1, 32):
        tab_title = get_ordinal_tab_name(day_int)
        ws_day = wb.create_sheet(title=tab_title)
        ws_day.views.sheetView[0].showGridLines = True
        
        for c_idx, h in enumerate(daily_headers, start=1):
            cell = ws_day.cell(row=1, column=c_idx, value=h)
            cell.font = font_header
            cell.fill = fill_navy if c_idx <= 2 else fill_gray_header
            cell.alignment = align_center
            cell.border = thin_border
            
        for s_idx, staff_name in enumerate(staff_list):
            fo_start_r = 2 + (s_idx * 40)
            
            ws_day.cell(row=fo_start_r, column=1, value=staff_name).font = font_bold
            ws_day.cell(row=fo_start_r, column=2, value="Field Officer").font = font_regular
            
            for r in range(fo_start_r, fo_start_r + 40):
                for c in range(1, len(daily_headers) + 1):
                    ws_day.cell(row=r, column=c).border = thin_border
                    
        ws_day.column_dimensions['A'].width = 22
        ws_day.column_dimensions['B'].width = 14
        for c in range(3, len(daily_headers) + 1):
            ws_day.column_dimensions[get_column_letter(c)].width = 15

    if default_sheet.title in wb.sheetnames and len(wb.sheetnames) > 33:
        wb.remove(default_sheet)
    elif "Sheet" in wb.sheetnames:
        wb.remove(wb["Sheet"])
        
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    wb.save(output_path)
    print(f"[SUCCESS] Generated Template for {district}: {output_path} ({len(wb.sheetnames)} tabs)")

def main():
    print("="*60)
    print("Generating Master KPI Excel Templates for all 10 Bihar Districts...")
    print("="*60)
    for district, staff in DISTRICT_STAFF.items():
        out_file = f"templates/template_{district}.xlsx"
        generate_district_template(district, staff, out_file)
    print("\n[ALL TEMPLATES GENERATED SUCCESSFULLY]")

if __name__ == "__main__":
    main()