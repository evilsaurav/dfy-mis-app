import openpyxl

wb = openpyxl.load_workbook("templates/template_Jamui.xlsx")
ws = wb["1ST"]

print("--- Day 1 Column Headers ---")
for c in range(1, 25):
    val = ws.cell(row=1, column=c).value
    if val:
        print(f"Col {c:2d}: '{val}'")
