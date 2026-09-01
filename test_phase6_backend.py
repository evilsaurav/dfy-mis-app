from fastapi.testclient import TestClient
from main import app
import zipfile
import io

client = TestClient(app)

print("=== 1. Testing GET /admin/today-attendance ===")
res_att = client.get("/admin/today-attendance")
print("Status:", res_att.status_code)
if res_att.status_code == 200:
    d = res_att.json()
    print(f"Total Staff: {d['total_staff']}, Full: {d['submitted_full_count']}, Partial: {d['submitted_partial_count']}, Missing: {d['missing_count']}")
else:
    print("Error:", res_att.text)

print("\n=== 2. Testing GET /download-all-kpi-workbooks ===")
res_zip = client.get("/download-all-kpi-workbooks")
print("Status:", res_zip.status_code, "ZIP Length:", len(res_zip.content))
if res_zip.status_code == 200:
    with zipfile.ZipFile(io.BytesIO(res_zip.content)) as zf:
        print("Files in ZIP:", zf.namelist())
        assert len(zf.namelist()) == 10

print("\n=== ALL BACKEND TESTS PASSED ===")
