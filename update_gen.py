import os

with open("generate_templates.py", "r", encoding="utf-8") as f:
    text = f.read()

# Add Total Row to build_performance_sheet
perf_sheet = """    for i, (name, designation) in enumerate(staff_list):
        r = 2 + i
        ws.cell(row=r, column=1, value=name).font = BODY_FONT
        ws.cell(row=r, column=2, value=designation).font = BODY_FONT
        for col_idx, perf_header in enumerate(PERFORMANCE_HEADERS[3:], start=4):
            kpi_name = PERFORMANCE_KPI_MAP[perf_header]
            kpi_col = get_column_letter(3 + KPI_COLUMNS.index(kpi_name))
            ws.cell(row=r, column=col_idx,
                     value=f"='CONSOLIDATED SHEET'!{kpi_col}{r}").font = BODY_FONT

    autosize(ws, {1: 24, 2: 22, 3: 10,
                  **{c: 15 for c in range(4, len(PERFORMANCE_HEADERS) + 1)}})
    return ws"""

perf_sheet_new = """    for i, (name, designation) in enumerate(staff_list):
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
    return ws"""
text = text.replace(perf_sheet, perf_sheet_new)


# Add Total Row to build_consolidated_sheet
cons_sheet = """        for k, kpi in enumerate(KPI_COLUMNS):
            col_letter = get_column_letter(3 + k)
            terms = "+".join(
                f"COUNTA('{tab}'!{col_letter}{row_start}:{col_letter}{row_end})"
                for tab in daily_tab_names
            )
            formula = f"={terms}"
            ws.cell(row=r, column=3 + k, value=formula).font = BODY_FONT

    autosize(ws, {1: 24, 2: 22, **{3 + k: 15 for k in range(len(KPI_COLUMNS))}})"""

cons_sheet_new = """        for k, kpi in enumerate(KPI_COLUMNS):
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

    autosize(ws, {1: 24, 2: 22, **{3 + k: 15 for k in range(len(KPI_COLUMNS))}})"""
text = text.replace(cons_sheet, cons_sheet_new)

with open("generate_templates.py", "w", encoding="utf-8") as f:
    f.write(text)
