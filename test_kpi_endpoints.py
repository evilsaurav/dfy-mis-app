from fastapi.testclient import TestClient
from main import app
import zipfile
import io
import openpyxl

client = TestClient(app)

print("Testing /download-kpi-workbook?district=Jamui&month=2026-09...")
res = client.get("/download-kpi-workbook?district=Jamui&month=2026-09")
assert res.status_code == 200, f"Failed: {res.status_code}"
wb = openpyxl.load_workbook(io.BytesIO(res.content))
print("Jamui workbook loaded successfully. Sheets:", len(wb.sheetnames))

print("Testing /download-all-kpi-workbooks?month=2026-09...")
res_all = client.get("/download-all-kpi-workbooks?month=2026-09")
assert res_all.status_code == 200, f"All failed: {res_all.status_code}"
with zipfile.ZipFile(io.BytesIO(res_all.content)) as zf:
    names = zf.namelist()
    print("ZIP contents:", len(names), names[:3])
    assert len(names) == 10

print("? All KPI generator backend tests PASSED!")
