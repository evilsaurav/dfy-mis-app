#!/usr/bin/env python3
"""
generate_templates.py
----------------------
Scalable district-wise Excel master-template generator.
"""

import csv
import os
import re
from collections import OrderedDict

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.comments import Comment

# ==============================================================================
# CONFIG
# ==============================================================================

CSV_PATH = "staff_master.csv"
OUTPUT_DIR = "templates"

KPI_COLUMNS = [
    "Notification",
    "HIV & DM",
    "DBT",
    "Sample Collection",
    "Sample Tested",
    "Outcome Assigned",
    "Home Visit",
    "Contact Tracing",
    "Follow Up",
    "Face to Face",
    "Presumptive",
    "Documents",
    "FDC Provided",
    "Kit Consumption",
    "Differentiated TB",
    "TPT Treatment Start",
    "TPT Presumptive",
    "Adhar Face Authentication",
    "Consent with ID",
]

PERFORMANCE_HEADERS = [
    "Employee Name", "DESIG.", "Target",
    "NOTIFICATION", "HIV & DM", "DBT",
    "SAMPLE COLLECTION", "SAMPLE TESTED", "Outcome Assigned",
]
PERFORMANCE_KPI_MAP = {
    "NOTIFICATION": "Notification",
    "HIV & DM": "HIV & DM",
    "DBT": "DBT",
    "SAMPLE COLLECTION": "Sample Collection",
    "SAMPLE TESTED": "Sample Tested",
    "Outcome Assigned": "Outcome Assigned",
}

NUM_DAYS = 31
BLOCK_SIZE = 40

FONT_NAME = "Arial"
HEADER_FONT = Font(name=FONT_NAME, bold=True, color="FFFFFF", size=10)
HEADER_FILL = PatternFill(start_color="305496", end_color="305496", fill_type="solid")
BODY_FONT = Font(name=FONT_NAME, size=10)
THIN_SIDE = Side(style="thin", color="B7B7B7")
THIN_BORDER = Border(left=THIN_SIDE, right=THIN_SIDE, top=THIN_SIDE, bottom=THIN_SIDE)
CENTER = Alignment(horizontal="center", vertical="center")


def ordinal(n: int) -> str:
    if n == 1:
        return "1ST"
    if 10 <= n % 100 <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"

def safe_filename(district: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", district.strip())
    return cleaned.strip("_") or "UNKNOWN"

def load_staff(csv_path: str):
    districts = OrderedDict()
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        required = {"District", "Name", "Designation"}
        if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
            raise ValueError(
                f"{csv_path} must contain columns: District, Name, Designation "
                f"(found: {reader.fieldnames})"
            )
        for row in reader:
            district = (row["District"] or "").strip()
            name = (row["Name"] or "").strip()
            designation = (row["Designation"] or "").strip()
            if not district or not name:
                continue
            districts.setdefault(district, []).append((name, designation))
    return districts

def style_header_row(ws, num_cols, row=1):
    for col in range(1, num_cols + 1):
        cell = ws.cell(row=row, column=col)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = CENTER
        cell.border = THIN_BORDER

def autosize(ws, widths):
    for col, width in widths.items():
        ws.column_dimensions[get_column_letter(col)].width = width

def build_daily_sheet(wb, tab_name, staff_list):
    ws = wb.create_sheet(tab_name)
    headers = ["NAME", "DESIGNATION"] + KPI_COLUMNS
    for col, h in enumerate(headers, start=1):
        ws.cell(row=1, column=col, value=h)
    style_header_row(ws, len(headers))
    ws.freeze_panes = "A2"

    for i, (name, designation) in enumerate(staff_list):
        r = 2 + i * BLOCK_SIZE
        ws.cell(row=r, column=1, value=name).font = BODY_FONT
        ws.cell(row=r, column=2, value=designation).font = BODY_FONT

    if staff_list:
        ws.cell(row=2, column=1).comment = Comment(
            "Fixed 40-row block per staff member (1 name row + 39 blank "
            "rows) reserved for backend ID data population. "
            "Do not insert or delete rows inside a block.",
            "generate_templates.py",
        )

    autosize(ws, {1: 24, 2: 22, **{3 + k: 15 for k in range(len(KPI_COLUMNS))}})
    return ws

def build_performance_sheet(wb, staff_list):
    ws = wb.create_sheet("Performance sheet")
    for col, h in enumerate(PERFORMANCE_HEADERS, start=1):
        ws.cell(row=1, column=col, value=h)
    style_header_row(ws, len(PERFORMANCE_HEADERS))
    ws.freeze_panes = "A2"

    for i, (name, designation) in enumerate(staff_list):
        r = 2 + i
        ws.cell(row=r, column=1, value=name).font = BODY_FONT
        ws.cell(row=r, column=2, value=designation).font = BODY_FONT
        for col_idx, perf_header in enumerate(PERFORMANCE_HEADERS[3:], start=4):
            kpi_name = PERFORMANCE_KPI_MAP[perf_header]
            kpi_col = get_column_letter(3 + KPI_COLUMNS.index(kpi_name))
            ws.cell(row=r, column=col_idx,
                     value=f"='CONSOLIDATED SHEET'!{kpi_col}{r}").font = BODY_FONT
                     
    # ADD TOTAL ROW
    total_row = 2 + len(staff_list)
    ws.cell(row=total_row, column=1, value="GRAND TOTAL").font = HEADER_FONT
    for col_idx in range(4, len(PERFORMANCE_HEADERS) + 1):
        col_letter = get_column_letter(col_idx)
        ws.cell(row=total_row, column=col_idx, value=f"=SUM({col_letter}2:{col_letter}{total_row-1})").font = HEADER_FONT

    autosize(ws, {1: 24, 2: 22, 3: 10,
                  **{c: 15 for c in range(4, len(PERFORMANCE_HEADERS) + 1)}})
    return ws

def build_consolidated_sheet(wb, staff_list, daily_tab_names):
    ws = wb.create_sheet("CONSOLIDATED SHEET")

    left_headers = ["Employee Name", "Designation"] + KPI_COLUMNS
    for col, h in enumerate(left_headers, start=1):
        ws.cell(row=1, column=col, value=h)
    style_header_row(ws, len(left_headers))

    for i, (name, designation) in enumerate(staff_list):
        r = 2 + i
        ws.cell(row=r, column=1, value=name).font = BODY_FONT
        ws.cell(row=r, column=2, value=designation).font = BODY_FONT

        row_start = 2 + i * BLOCK_SIZE
        row_end = row_start + BLOCK_SIZE - 1
        for k, kpi in enumerate(KPI_COLUMNS):
            col_letter = get_column_letter(3 + k)
            terms = "+".join(
                f"COUNTA('{tab}'!{col_letter}{row_start}:{col_letter}{row_end})"
                for tab in daily_tab_names
            )
            # Add +0 so that empty sum shows exactly 0 in Excel rather than blank
            formula = f"=({terms})+0"
            ws.cell(row=r, column=3 + k, value=formula).font = BODY_FONT

    # ADD TOTAL ROW
    total_row = 2 + len(staff_list)
    ws.cell(row=total_row, column=1, value="GRAND TOTAL").font = HEADER_FONT
    for k in range(len(KPI_COLUMNS)):
        col_letter = get_column_letter(3 + k)
        ws.cell(row=total_row, column=3 + k, value=f"=SUM({col_letter}2:{col_letter}{total_row-1})").font = HEADER_FONT

    autosize(ws, {1: 24, 2: 22, **{3 + k: 15 for k in range(len(KPI_COLUMNS))}})

    spacer_col = 2 + len(KPI_COLUMNS) + 1
    right_start = spacer_col + 1
    block_headers = ["Date", "Reported By", "HIV", "DBT"]
    block_width = len(block_headers)
    block_stride = block_width + 1

    for i, (name, designation) in enumerate(staff_list):
        base_col = right_start + i * block_stride

        ws.merge_cells(start_row=1, start_column=base_col,
                        end_row=1, end_column=base_col + block_width - 1)
        banner = ws.cell(row=1, column=base_col, value=name)
        banner.font, banner.fill, banner.alignment = HEADER_FONT, HEADER_FILL, CENTER

        for offset, h in enumerate(block_headers):
            cell = ws.cell(row=2, column=base_col + offset, value=h)
            cell.font, cell.fill, cell.alignment = HEADER_FONT, HEADER_FILL, CENTER

        for day in range(1, NUM_DAYS + 1):
            r = 2 + day
            date_cell = ws.cell(row=r, column=base_col, value=day)
            date_cell.font, date_cell.alignment = BODY_FONT, CENTER

        for offset in range(block_width):
            ws.column_dimensions[get_column_letter(base_col + offset)].width = 13

    if staff_list:
        ws.cell(row=2, column=right_start).comment = Comment(
            "Per-staff date-wise breakdown. 'Date' is pre-filled 1-31; "
            "'Reported By' / 'HIV' / 'DBT' are populated by the backend "
            "per daily entry.",
            "generate_templates.py",
        )

    ws.freeze_panes = "C2"
    return ws

def build_workbook_for_district(staff_list):
    wb = Workbook()
    wb.remove(wb.active)
    daily_tab_names = [ordinal(d) for d in range(1, NUM_DAYS + 1)]
    build_performance_sheet(wb, staff_list)
    build_consolidated_sheet(wb, staff_list, daily_tab_names)
    for tab_name in daily_tab_names:
        build_daily_sheet(wb, tab_name, staff_list)
    return wb

def main():
    staff_by_district = load_staff(CSV_PATH)
    if not staff_by_district:
        print(f"No usable rows found in {CSV_PATH}.")
        return
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    for district, staff_list in staff_by_district.items():
        wb = build_workbook_for_district(staff_list)
        filename = f"template_{safe_filename(district)}.xlsx"
        path = os.path.join(OUTPUT_DIR, filename)
        wb.save(path)
        print(f"Generated: {path}  ({len(staff_list)} staff, 33 tabs)")

if __name__ == "__main__":
    main()
