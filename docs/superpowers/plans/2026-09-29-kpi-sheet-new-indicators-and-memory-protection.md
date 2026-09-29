# 33-Tab KPI Excel Architecture Extension with 17 Clinical Indicators, RBAC Gates & Anti-OOM Memory Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the 33-tab District KPI Excel generator across all sheets (Performance Sheet, Consolidated Sheet, Daily Tabs 1st–31st) to support 3 new clinical indicators (`DIFF TB`, `TPT START`, `TPT PRESUMTIVE`), protect Render against 512MB RAM Out-Of-Memory crashes with disk-spooled ZIP generation, and enforce district isolation RBAC on single and bulk KPI workbook downloads.

**Architecture:** Master template generation (`generate_templates.py`) defines 17 standard indicators (Option A sequence) and regenerates all 22 district template `.xlsx` workbooks. The FastAPI backend (`main.py`) populates daily tabs (cols 17-19), Consolidated Left Wing (cols 40-48) and Right Wing (col 49+), Performance Sheet (cols 19-21, shifted cohorts 22-27, and updated Grand Total `=SUM()` formulas). Bulk export streams to disk via `tempfile.NamedTemporaryFile` with 750ms queue pacing and garbage collection. Single and bulk endpoints strictly enforce RBAC (HTTP 403).

**Tech Stack:** Python 3.10+ | openpyxl | FastAPI | pytest | React 19 / Vite | Tailwind CSS

**Spec:** [`docs/superpowers/specs/2026-09-29-kpi-sheet-new-indicators-and-memory-protection-design.md`](file:///d:/ignou/Mis%20field%20report/docs/superpowers/specs/2026-09-29-kpi-sheet-new-indicators-and-memory-protection-design.md)

## Global Constraints
- Target branch is strictly `feat/kpi-sheet-new-indicators` (isolated from live `origin/main`).
- ZERO mention or inclusion of Travel Allowance code from `feat/travel-allowance-bike-log`.
- STRICT ZERO-PUSH RULE: Commit locally only. Do NOT run `git push`!
- Zero runtime crashes, white screens, data corruption, or broken Excel formulas.
- `python -m py_compile main.py` must exit code 0.
- `npm --prefix dfy-frontend run lint` must pass with 0 syntax errors.
- `npm --prefix dfy-frontend run build` must succeed (exit 0).

---

### Task 1: Master Template Generator Extension & 22-District Workbook Regeneration

**Files:**
- Modify: `generate_templates.py:32-47, 151-247, 254-339, 343-382`
- Output: `templates/template_*.xlsx` (22 district workbooks)
- Test: `tests/test_kpi_template_generator.py`

**Interfaces:**
- Consumes: `staff_master.csv` (district-staff list)
- Produces: 22 production-grade 33-tab templates in `templates/` with 17 KPI categories, 16 Consolidated Left Wing clusters (cols 1-48), Right Wing starting at Col 49 (17 columns per staff), and Daily sheets with 19 columns.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_kpi_template_generator.py
import os
import openpyxl
import pytest

def test_template_structure_17_indicators():
    template_path = "templates/template_Bhojpur.xlsx"
    assert os.path.exists(template_path), f"Template missing: {template_path}"
    wb = openpyxl.load_workbook(template_path, data_only=False)
    
    # 1. 33 Sheets exist
    assert "Performance sheet" in wb.sheetnames
    assert "CONSOLIDATED SHEET" in wb.sheetnames
    assert "1ST" in wb.sheetnames or "1st" in wb.sheetnames
    assert "31st" in wb.sheetnames or "31ST" in wb.sheetnames
    
    # 2. Performance sheet layout
    ws_perf = wb["Performance sheet"]
    assert ws_perf.cell(row=4, column=19).value == "DIFF TB"
    assert ws_perf.cell(row=4, column=20).value == "TPT START"
    assert ws_perf.cell(row=4, column=21).value == "TPT PRESUMTIVE"
    
    # Check Grand Total row formula includes cols 19-21
    gt_row = None
    for r in range(5, ws_perf.max_row + 1):
        if ws_perf.cell(row=r, column=1).value == "GRAND TOTAL":
            gt_row = r
            break
    assert gt_row is not None
    assert "=SUM(S5:S" in str(ws_perf.cell(row=gt_row, column=19).value)
    assert "=SUM(T5:T" in str(ws_perf.cell(row=gt_row, column=20).value)
    assert "=SUM(U5:U" in str(ws_perf.cell(row=gt_row, column=21).value)
    
    # 3. Daily Sheet layout (1ST)
    ws_day1 = wb["1ST"] if "1ST" in wb.sheetnames else wb["1st"]
    assert ws_day1.cell(row=1, column=17).value == "DIFF TB"
    assert ws_day1.cell(row=1, column=18).value == "TPT START"
    assert ws_day1.cell(row=1, column=19).value == "TPT PRESUMTIVE"
    
    # 4. CONSOLIDATED SHEET layout
    ws_cons = wb["CONSOLIDATED SHEET"]
    # Cluster 14 (Cols 40-42): DIFF TB
    assert ws_cons.cell(row=1, column=40).value == "DIFF TB"
    # Cluster 15 (Cols 43-45): TPT START
    assert ws_cons.cell(row=1, column=43).value == "TPT START"
    # Cluster 16 (Cols 46-48): TPT PRESUMTIVE
    assert ws_cons.cell(row=1, column=46).value == "TPT PRESUMTIVE"
    # Staff 1 starts at Col 49
    staff1_header = ws_cons.cell(row=1, column=49).value
    assert staff1_header is not None and len(str(staff1_header).strip()) > 0
    assert ws_cons.cell(row=2, column=49).value == "NOTIFICATION"
    assert ws_cons.cell(row=2, column=65).value == "TPT PRESUMTIVE"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_kpi_template_generator.py -v`  
Expected: FAIL (because templates currently only have 14 categories).

- [ ] **Step 3: Update `generate_templates.py` and regenerate templates**

In `generate_templates.py`:
1. Extend `KPI_CATEGORIES`:
```python
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
    ("Kit Consumption", "kit_consumption_ids"),
    ("DIFF TB", "differentiated_tb_ids"),
    ("TPT START", "tpt_treatment_start_ids"),
    ("TPT PRESUMTIVE", "tpt_presumptive_ids")
]
```
2. In `Performance sheet`:
   - `perf_headers = ["Employee Name", "DESIG.", "Target", "NOTIFICATION", "% Achieved"] + [kpi[0] for kpi in KPI_CATEGORIES[1:]]` (Cols 1 to 21).
   - In Grand Total row: loop up to column 21 to calculate `=SUM(...)` for all 17 KPIs.
   - Set widths up to column 21.
3. In `CONSOLIDATED SHEET`:
   - Left Wing: `left_clusters = [kpi[0] for kpi in KPI_CATEGORIES if kpi[0] != "Kit Consumption"]` (16 clusters, Cols 1 to 48).
   - Right Wing: For each staff member `s_idx`:
     `staff_start_c = 49 + (s_idx * 17)`
     `staff_end_c = staff_start_c + 16`
     Row 1: Staff Name merged across 17 columns.
     Row 2: KPI Name (Cols 0 to 16).
     Row 3: Value 0 (gold total).
4. In Daily Tabs (`1ST` to `31st`):
   - `daily_headers = ["NAME", "DESIGNATION"] + [kpi[0] for kpi in KPI_CATEGORIES]` (Cols 1 to 19).
5. Run `python generate_templates.py` to regenerate all 22 templates in `templates/`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_kpi_template_generator.py -v`  
Expected: PASS 100%.

- [ ] **Step 5: Commit changes locally**

```bash
git add generate_templates.py templates/*.xlsx tests/test_kpi_template_generator.py
git commit -m "feat(kpi): extend excel templates with 17 clinical indicators across 33 sheets"
```

---

### Task 2: Backend KPI Excel Data Population & Shifted Cohort Formulas

**Files:**
- Modify: `main.py:2146-2508` (`EXCEL_KPI_CATEGORIES`, `generate_district_kpi_bytes`)
- Test: `tests/test_kpi_excel_engine_17_indicators.py`

**Interfaces:**
- Consumes: 17 KPI categories from `daily_field_reports` (including `differentiated_tb_ids`, `tpt_treatment_start_ids`, `tpt_presumptive_ids`) and regenerated district templates.
- Produces: `generate_district_kpi_bytes(district, month_prefix)` returning valid `.xlsx` bytes containing accurate patient IDs and counts across all 33 sheets with shifted cohort breakdown columns (cols 22-27) in Performance Sheet.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_kpi_excel_engine_17_indicators.py
import openpyxl
import io
import pytest
from unittest.mock import MagicMock, patch

def test_generate_district_kpi_bytes_17_indicators():
    # Import the function from main
    from main import generate_district_kpi_bytes, EXCEL_KPI_CATEGORIES
    
    assert len(EXCEL_KPI_CATEGORIES) == 17
    assert EXCEL_KPI_CATEGORIES[14][0] == "DIFF TB"
    assert EXCEL_KPI_CATEGORIES[15][0] == "TPT START"
    assert EXCEL_KPI_CATEGORIES[16][0] == "TPT PRESUMTIVE"
    
    # Mock firestore reports for Bhojpur
    sample_report = {
        "date_of_reporting": "2026-09-15",
        "working_place": "Bhojpur",
        "fo_name": "Ashwani Kr Keshri",
        "notification_ids": ["N1001", "N1002"],
        "differentiated_tb_ids": ["DIFF001"],
        "tpt_treatment_start_ids": ["TPT001", "TPT002"],
        "tpt_presumptive_ids": ["PRE001"],
    }
    
    mock_doc = MagicMock()
    mock_doc.id = "rep_1"
    mock_doc.to_dict.return_value = sample_report
    
    with patch("main.db.collection") as mock_col:
        # Targets mock
        mock_col.return_value.where.return_value.stream.return_value = []
        # Reports mock
        mock_col.return_value.where.return_value.where.return_value.where.return_value.stream.return_value = [mock_doc]
        
        excel_bytes = generate_district_kpi_bytes("Bhojpur", "2026-09")
        assert excel_bytes is not None
        
        wb = openpyxl.load_workbook(io.BytesIO(excel_bytes), data_only=False)
        
        # 1. Performance Sheet verification
        ws_perf = wb["Performance sheet"]
        # Ashwani is row 5
        # Col 4: Notification count = 2
        assert ws_perf.cell(row=5, column=4).value == 2
        # Col 19: DIFF TB = 1
        assert ws_perf.cell(row=5, column=19).value == 1
        # Col 20: TPT START = 2
        assert ws_perf.cell(row=5, column=20).value == 2
        # Col 21: TPT PRESUMTIVE = 1
        assert ws_perf.cell(row=5, column=21).value == 1
        
        # Shifted Cohort headers in Row 4 (Cols 22 to 27)
        assert "HIV" in str(ws_perf.cell(row=4, column=22).value)
        assert "UDST" in str(ws_perf.cell(row=4, column=24).value)
        assert "Contact" in str(ws_perf.cell(row=4, column=26).value)
        
        # 2. Daily Sheet (15th Tab) verification
        ws_15 = wb["15th"]
        # Ashwani's block starts at row 2
        # Col 17: DIFF TB -> DIFF001
        assert ws_15.cell(row=2, column=17).value == "DIFF001"
        # Col 18: TPT START -> TPT001, TPT002
        assert ws_15.cell(row=2, column=18).value == "TPT001"
        assert ws_15.cell(row=3, column=18).value == "TPT002"
        # Col 19: TPT PRESUMTIVE -> PRE001
        assert ws_15.cell(row=2, column=19).value == "PRE001"
        
        # 3. Consolidated Sheet Left Wing verification
        ws_cons = wb["CONSOLIDATED SHEET"]
        # Cluster 14 (DIFF TB, Col 40): Grand total count = 1
        assert ws_cons.cell(row=2, column=40).value == 1
        # First entry: Col 40: DIFF001, Col 41: 2026-09-15, Col 42: Ashwani Kr Keshri
        assert ws_cons.cell(row=4, column=40).value == "DIFF001"
        assert ws_cons.cell(row=4, column=41).value == "2026-09-15"
        assert ws_cons.cell(row=4, column=42).value == "Ashwani Kr Keshri"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_kpi_excel_engine_17_indicators.py -v`  
Expected: FAIL (because `main.py` currently has 14 indicators and old column offsets).

- [ ] **Step 3: Update `main.py` Excel engine**

1. Update `EXCEL_KPI_CATEGORIES` in `main.py`:
```python
EXCEL_KPI_CATEGORIES = [
    ("NOTIFICATION", "notification_ids", 3),
    ("HIV & DM", "hiv_dm_ids", 4),
    ("DBT", "dbt_ids", 5),
    ("SAMPLE COLLECTION", "sample_collection_ids", 6),
    ("SAMPLE TESTED", "sample_tested_ids", 7),
    ("Outcome Assigned", "outcome_assigned_ids", 8),
    ("Home Visit", "home_visit_ids", 9),
    ("Contact Tracing", "contact_tracing_ids", 10),
    ("Follow Up", "follow_up_ids", 11),
    ("Face to Face", "face_to_face_ids", 12),
    ("Presumptive", "presumptive_ids", 13),
    ("Documents", "documents_ids", 14),
    ("FDC Provided", "fdc_provided_ids", 15),
    ("Kit Consumption", "kit_consumption_ids", 16),
    ("DIFF TB", "differentiated_tb_ids", 17),
    ("TPT START", "tpt_treatment_start_ids", 18),
    ("TPT PRESUMTIVE", "tpt_presumptive_ids", 19)
]
```
2. In `generate_district_kpi_bytes`:
   - Update `num_kpis = len(EXCEL_KPI_CATEGORIES)` (17).
   - Update `district_cluster_counts = { c_idx: 0 for c_idx in range(16) }` (omits Kit Consumption, includes DIFF TB, TPT START, TPT PRESUMTIVE).
   - In Daily Sheet population: write valid IDs up to `col_idx = 19`.
   - In `CONSOLIDATED SHEET`:
     - Left Wing: write 16 clusters across columns 1 to 48 (`start_c = 1 + (c_idx * 3)`).
     - Right Wing: `staff_base_col = 49 + (s_idx * 17)`. Row 3 writes staff totals for all 17 KPIs.
   - In `Performance sheet`:
     - Cols 19 to 21 write `staff_counts[s_idx][14]`, `[15]`, `[16]`.
     - Shift `cohort_col_defs` to columns 22 to 27:
       ```python
       cohort_col_defs = [
           (22, 'HIV\n(Cur Month)', 'hiv_cur'),
           (23, 'HIV\n(Prev Backlog)', 'hiv_prev'),
           (24, 'UDST\n(Cur Month)', 'udst_cur'),
           (25, 'UDST\n(Prev Backlog)', 'udst_prev'),
           (26, 'Contact Tr\n(Cur Month)', 'con_cur'),
           (27, 'Contact Tr\n(Prev Backlog)', 'con_prev')
       ]
       ```
     - In Grand Total row, populate `=SUM(...)` formulas for columns 19, 20, 21, and cohort columns 22 to 27.
   - Add explicit garbage collection and workbook cleanup:
     ```python
     output = io.BytesIO()
     wb.save(output)
     output.seek(0)
     res_bytes = output.getvalue()
     try:
         wb.close()
     except Exception:
         pass
     del wb
     import gc
     gc.collect()
     return res_bytes
     ```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_kpi_excel_engine_17_indicators.py -v`  
Expected: PASS 100%.

- [ ] **Step 5: Run python compilation check**

Run: `python -m py_compile main.py`  
Expected: Exit code 0.

- [ ] **Step 6: Commit changes locally**

```bash
git add main.py tests/test_kpi_excel_engine_17_indicators.py
git commit -m "feat(backend): implement 17-indicator kpi excel population with shifted cohort formulas and memory release"
```

---

### Task 3: Render Anti-OOM Memory Engine & RBAC Download Security

**Files:**
- Modify: `main.py:2520-2765` (`download_kpi_workbook`, `download_all_kpi_workbooks`)
- Test: `tests/test_kpi_rbac_and_anti_oom.py`

**Interfaces:**
- Consumes: Authenticated admin object from `Depends(get_current_admin)`.
- Produces:
  - `GET /download-kpi-workbook`: returns 403 Forbidden if Sub-Admin is not authorized for the requested district.
  - `GET /download-all-kpi-workbooks`: returns 403 Forbidden if Sub-Admin only manages a single district; streams temporary disk file (`tempfile.NamedTemporaryFile`) with 750ms queue relaxation.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_kpi_rbac_and_anti_oom.py
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

@pytest.fixture
def client():
    from main import app
    return TestClient(app)

def test_download_kpi_workbook_rbac_forbidden(client):
    # Sub-admin permitted only for Buxar tries to download Patna
    sub_admin = {
        "user_id": "sub_buxar",
        "role": "SUB_ADMIN",
        "allowed_districts": ["Buxar"]
    }
    with patch("main.get_current_admin", return_value=sub_admin):
        res = client.get("/download-kpi-workbook?district=Patna&month=2026-09")
        assert res.status_code == 403
        assert "Access denied" in res.json().get("detail", "")

def test_download_all_kpi_workbooks_single_district_forbidden(client):
    # Single-district sub-admin tries bulk ZIP export
    sub_admin = {
        "user_id": "sub_buxar",
        "role": "SUB_ADMIN",
        "allowed_districts": ["Buxar"]
    }
    with patch("main.get_current_admin", return_value=sub_admin):
        res = client.get("/download-all-kpi-workbooks?month=2026-09")
        assert res.status_code == 403
        assert "restricted to multi-district" in res.json().get("detail", "")

def test_download_all_kpi_workbooks_super_admin_tempfile_stream(client):
    super_admin = {
        "user_id": "state_admin",
        "role": "SUPER_ADMIN",
        "allowed_districts": ["All"]
    }
    with patch("main.get_current_admin", return_value=super_admin):
        with patch("main.generate_district_kpi_bytes", return_value=b"dummy_excel_bytes"):
            res = client.get("/download-all-kpi-workbooks?month=2026-09&districts=Buxar,Bhojpur")
            assert res.status_code == 200
            assert "zip" in res.headers.get("content-type", "").lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_kpi_rbac_and_anti_oom.py -v`  
Expected: FAIL (because single-district RBAC and 403 gates are not yet enforced).

- [ ] **Step 3: Implement RBAC gates and tempfile disk spooling in `main.py`**

1. In `download_kpi_workbook`:
```python
@app.get("/download-kpi-workbook")
async def download_kpi_workbook(district: str, month: Optional[str] = None, admin: dict = Depends(get_current_admin)):
    admin_role = admin.get("role", "SUB_ADMIN")
    admin_allowed = admin.get("allowed_districts", [])
    allowed_c = [canonicalize_district(a).lower() for a in admin_allowed]
    c_dist = canonicalize_district(district).lower()

    if admin_role == "SUB_ADMIN" and admin_allowed and "all" not in allowed_c:
        if c_dist not in allowed_c and district.lower() not in allowed_c:
            raise HTTPException(status_code=403, detail="Access denied: You do not have permission to download KPI reports for this district.")
    ...
```

2. In `download_all_kpi_workbooks`:
```python
@app.get("/download-all-kpi-workbooks")
async def download_all_kpi_workbooks(
    background_tasks: BackgroundTasks,
    month: Optional[str] = None, 
    districts: Optional[str] = None, 
    admin: dict = Depends(get_current_admin)
):
    admin_role = admin.get("role", "SUB_ADMIN")
    admin_allowed = admin.get("allowed_districts", [])
    allowed_c = [canonicalize_district(a).lower() for a in admin_allowed]

    # Enforce multi-district requirement: single district users cannot trigger bulk ZIP
    if admin_role == "SUB_ADMIN" and "all" not in allowed_c and len(admin_allowed) <= 1:
        raise HTTPException(
            status_code=403, 
            detail="Bulk ZIP download is restricted to multi-district administrators. Please download your individual district KPI workbook."
        )
    ...
    # Use disk-spooled tempfile instead of RAM BytesIO
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp_file:
        tmp_zip_path = tmp_file.name

    try:
        async with KPI_EXCEL_SEMAPHORE:
            with zipfile.ZipFile(tmp_zip_path, "w", zipfile.ZIP_DEFLATED) as zip_file:
                for dist in bihar_districts:
                    excel_bytes = await asyncio.to_thread(lambda d=dist: generate_district_kpi_bytes(d, month))
                    if excel_bytes:
                        zip_file.writestr(f"KPI_Report_{safe_filename(dist)}_{month_tag}.xlsx", excel_bytes)
                        del excel_bytes
                        import gc
                        gc.collect()
                    # 750ms queue pacing to let Render CPU and event loop breathe
                    await asyncio.sleep(0.75)
    except Exception as e:
        if os.path.exists(tmp_zip_path):
            os.remove(tmp_zip_path)
        raise HTTPException(status_code=500, detail=str(e))

    def cleanup_tmp():
        try:
            if os.path.exists(tmp_zip_path):
                os.remove(tmp_zip_path)
        except Exception:
            pass

    background_tasks.add_task(cleanup_tmp)
    
    return FileResponse(
        tmp_zip_path,
        media_type="application/zip",
        filename=f"{archive_name}_{month_tag}.zip"
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_kpi_rbac_and_anti_oom.py -v`  
Expected: PASS 100%.

- [ ] **Step 5: Run python compilation check**

Run: `python -m py_compile main.py`  
Expected: Exit code 0.

- [ ] **Step 6: Commit changes locally**

```bash
git add main.py tests/test_kpi_rbac_and_anti_oom.py
git commit -m "feat(security): enforce rbac download gates and anti-oom tempfile disk spooling for kpi exports"
```

---

### Task 4: Frontend Reports Studio RBAC Gate & UI Updates

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx:13000-13200`
- Test: `tests/test_reports_studio_kpi_rbac_ui.mjs`

**Interfaces:**
- Consumes: `currentUser` role and `allowed_districts`.
- Produces: Reports Studio KPI download panel where "📦 Download All District KPI Workbooks (ZIP)" is only displayed if `canDownloadBulkZip` is true.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/test_reports_studio_kpi_rbac_ui.mjs
import fs from 'fs';
import path from 'path';
import assert from 'assert';

const adminCode = fs.readFileSync(path.resolve('dfy-frontend/src/AdminDashboard.jsx'), 'utf-8');

// 1. Verify canDownloadBulkZip or multi-district permission check exists
assert(
  adminCode.includes('canDownloadBulkZip') || adminCode.includes('allowed_districts.length > 1'),
  'AdminDashboard.jsx must define canDownloadBulkZip logic to gate bulk ZIP export'
);

// 2. Verify bulk ZIP button is wrapped in conditional check
assert(
  adminCode.includes('canDownloadBulkZip &&') || adminCode.includes('canDownloadBulkZip ?'),
  'Bulk ZIP button must be conditionally rendered based on canDownloadBulkZip'
);

console.log('✅ Reports Studio KPI RBAC UI test passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_reports_studio_kpi_rbac_ui.mjs`  
Expected: FAIL (because `canDownloadBulkZip` is not yet defined).

- [ ] **Step 3: Implement `canDownloadBulkZip` guard in `AdminDashboard.jsx`**

1. In `AdminDashboard.jsx`, compute:
```javascript
const canDownloadBulkZip = currentUser?.role === 'SUPER_ADMIN' || 
  (Array.isArray(currentUser?.allowed_districts) && (
    currentUser.allowed_districts.includes('All') || 
    currentUser.allowed_districts.length > 1
  ));
```
2. Locate the "📦 Download All District KPI Workbooks (ZIP)" button in Reports Studio (around lines 13050-13100) and wrap it:
```jsx
{canDownloadBulkZip && (
  <button
    onClick={handleDownloadAllKpiZip}
    disabled={isDownloadingAllKpi}
    className="..."
  >
    {isDownloadingAllKpi ? 'Generating Workbooks (ZIP)...' : '📦 Download All District KPI Workbooks (ZIP)'}
  </button>
)}
```
3. For single-district Sub-Admins, ensure a helpful note or single district download button is clearly presented without visual regressions.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_reports_studio_kpi_rbac_ui.mjs`  
Expected: PASS.

- [ ] **Step 5: Run frontend lint and build**

Run:
```bash
npm --prefix dfy-frontend run lint
npm --prefix dfy-frontend run build
```
Expected: 0 lint errors, build exit code 0.

- [ ] **Step 6: Commit changes locally**

```bash
git add dfy-frontend/src/AdminDashboard.jsx tests/test_reports_studio_kpi_rbac_ui.mjs
git commit -m "feat(ui): gate bulk kpi zip export to multi-district admins in reports studio"
```

---

### Task 5: End-to-End Verification Battery & Production Safety Verification

**Files:**
- Test: All automated test suites (`test_kpi_template_generator.py`, `test_kpi_excel_engine_17_indicators.py`, `test_kpi_rbac_and_anti_oom.py`, `test_reports_studio_kpi_rbac_ui.mjs`)

- [ ] **Step 1: Run complete backend verification battery**

Run:
```bash
python -m py_compile main.py
python -m py_compile generate_templates.py
pytest tests/test_kpi_template_generator.py -v
pytest tests/test_kpi_excel_engine_17_indicators.py -v
pytest tests/test_kpi_rbac_and_anti_oom.py -v
```
Expected: All exit with code 0 (100% pass).

- [ ] **Step 2: Run complete frontend verification battery**

Run:
```bash
node tests/test_reports_studio_kpi_rbac_ui.mjs
npm --prefix dfy-frontend run lint
npm --prefix dfy-frontend run build
```
Expected: 0 lint errors, build exits code 0.

- [ ] **Step 3: Audit Git diff and verify isolation from TA branch**

Run:
```bash
git diff origin/main --stat
git log origin/main..HEAD --oneline
```
Expected: Only files related to KPI templates, Excel engine, RBAC gates, and Reports Studio are present. ZERO Travel Allowance commits or diffs.

- [ ] **Step 4: Commit changelog entry and final verification documentation**

Update `dfy-frontend/src/changelogData.js` noting v2.8.5 release:
- 17-indicator 33-tab District KPI Excel architecture.
- Added `DIFF TB`, `TPT START`, `TPT PRESUMTIVE` to Daily, Consolidated, and Performance sheets.
- Anti-OOM memory protection with disk-spooled tempfile streaming and 750ms queue pacing.
- Strict district isolation and bulk ZIP RBAC download gates.

```bash
git add dfy-frontend/src/changelogData.js
git commit -m "chore(release): bump changelog to v2.8.5 with 17-indicator kpi engine and anti-oom guards"
```
