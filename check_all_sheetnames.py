import openpyxl
import glob

for f in sorted(glob.glob("templates/*.xlsx")):
    wb = openpyxl.load_workbook(f, read_only=True)
    print(f"{f}: {wb.sheetnames[:5]}")
