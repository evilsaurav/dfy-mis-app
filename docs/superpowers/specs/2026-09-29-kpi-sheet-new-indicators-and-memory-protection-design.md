# Engineering Design Specification: 33-Tab KPI Excel Architecture Extension with 3 New Clinical Indicators, Strict RBAC Download Gates & Render Anti-OOM Memory Engine

**Date:** 2026-09-29  
**Branch:** `feat/kpi-sheet-new-indicators` (Isolated from live `origin/main`)  
**Status:** Approved Design Document — Ready for Implementation Planning  
**Target Subsystems:** `generate_templates.py`, `main.py`, `templates/template_*.xlsx`, `dfy-frontend/src/AdminDashboard.jsx`

---

## 1. Executive Summary & Objective

In the Doctors For You (DFY) Bihar Tuberculosis Elimination MIS Portal, the 33-Tab District KPI Excel Workbook is the official reporting artifact utilized by State Health Coordinators, District Tuberculosis Officers (DTOs), and program directors.

This specification details the end-to-end architectural enhancements to:
1. **Incorporate 3 New Clinical Indicators:** `DIFF TB` (Differentiated Care), `TPT START` (TB Preventive Treatment Started), and `TPT PRESUMTIVE` (TPT Presumptive) across all 33 sheets (**Performance Sheet**, **Consolidated Sheet**, and daily tabs **1st to 31st**).
2. **Preserve Master Layout Integrity:** Standardize on **Option A** (appending new indicators at positions 15, 16, 17) to maintain backward compatibility for historical columns 1 to 14.
3. **Prevent Render Memory Out-Of-Memory (OOM) Crashes:** Replace in-memory RAM ZIP buffering with disk-spooled temporary files, enforce explicit garbage collection (`gc.collect()`), and implement relaxed queue pacing (750ms throttles) to guarantee memory never exceeds Render's 512 MB hard ceiling.
4. **Implement District Isolation & RBAC Download Gates:** Restrict single workbook downloads strictly to authorized districts (HTTP 403 enforcement), and restrict multi-district bulk ZIP exports exclusively to Super Admins and multi-district coordinators on both backend and frontend.

---

## 2. Clinical Indicator Data Mapping

The three new indicators are already captured in `daily_field_reports` documents in Firestore. They will be mapped directly into the Excel engine:

| Display Header | Internal Firestore Field | Data Type | Description |
|---|---|---|---|
| **`DIFF TB`** | `differentiated_tb_ids` (fallback: `diff_tb`) | `List[str]` (Array of Patient IDs) | Patients initiated on Differentiated TB Care. |
| **`TPT START`** | `tpt_treatment_start_ids` (fallback: `tpt_treatment_start`) | `List[str]` (Array of Patient IDs) | Household contacts initiated on TB Preventive Treatment. |
| **`TPT PRESUMTIVE`** | `tpt_presumptive_ids` (fallback: `tpt_presumptive`) | `List[str]` (Array of Patient IDs) | Household contacts screened as presumptive for TB. |

### Complete 17-Indicator Master Sequence:
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

---

## 3. Master 33-Sheet Layout Blueprint

### 3.1. Tab 1: 'Performance sheet' (Staff Evaluation Matrix)
- **Row 1-2:** Title banner merged across columns A to AA (`A1:AA2`).
- **Row 3:** Subtitle row.
- **Row 4 (Headers):**
  - Col 1: `Employee Name`
  - Col 2: `DESIG.`
  - Col 3: `Target`
  - Col 4: `NOTIFICATION`
  - Col 5: `% Achieved` (Formula: `=IF(C{r}>0, D{r}/C{r}, 0)`)
  - Cols 6 to 18: Existing 13 KPIs (`HIV & DM` to `Kit Consumption`)
  - **Col 19 (New):** `DIFF TB`
  - **Col 20 (New):** `TPT START`
  - **Col 21 (New):** `TPT PRESUMTIVE`
  - **Cols 22 to 27 (Shifted Cohorts):**
    - Col 22: `HIV (Cur Month)`
    - Col 23: `HIV (Prev Backlog)`
    - Col 24: `UDST (Cur Month)`
    - Col 25: `UDST (Prev Backlog)`
    - Col 26: `Contact Tr (Cur Month)`
    - Col 27: `Contact Tr (Prev Backlog)`
- **Staff Rows (Row 5 to 5 + num_staff - 1):**
  - Values populated from pre-calculated `staff_counts` for all 17 KPIs.
  - Cohort breakdown values populated in columns 22 to 27.
- **GRAND TOTAL Row:**
  - Col 1: `GRAND TOTAL`
  - Col 3: `=SUM(C5:C{total_r-1})`
  - Col 4: `=SUM(D5:D{total_r-1})`
  - Col 5: `=IF(C{total_r}>0, D{total_r}/C{total_r}, 0)`
  - Cols 6 to 27: Dynamic `=SUM({col_letter}5:{col_letter}{total_r-1})` for all 17 KPIs and 6 cohort columns.
  - Cell formatting: Navy fill (`#1E3A8A`), bold white text, double-underline bottom border.

### 3.2. Tab 2: 'CONSOLIDATED SHEET' (District Master Rollup & Staff Breakdown)
- **Wing 1: Left Side (District Master Rollup — Columns A to AV / Cols 1 to 48):**
  - 16 Patient Log Clusters (Kit Consumption is numeric and omitted from the 3-column patient log).
  - Existing 13 clusters: Columns 1 to 39 (`NOTIFICATION` to `FDC Provided`).
  - **Cluster 14 (Cols 40-42):** `DIFF TB` *(Col 40: Patient ID, Col 41: Date, Col 42: Reported by)*.
  - **Cluster 15 (Cols 43-45):** `TPT START` *(Col 43: Patient ID, Col 44: Date, Col 45: Reported by)*.
  - **Cluster 16 (Cols 46-48):** `TPT PRESUMTIVE` *(Col 46: Patient ID, Col 47: Date, Col 48: Reported by)*.
  - **Row 1:** Merged cluster header with Dark Blue fill (`#1E3A8A`).
  - **Row 2:** Pre-computed grand total count for the district with Indigo fill (`#4338CA`).
  - **Row 3:** Subheaders (`Patient ID`, `Date`, `Reported by`) with Gray fill (`#374151`).
  - **Row 4 onwards:** Complete itemized patient entry log.
- **Wing 2: Right Side (Staff-Wise Performance — Column AW / Col 49 onwards):**
  - Base offset calculation: `staff_start_col = 49 + (s_idx * 17)`.
  - For each staff member:
    - **Row 1:** Staff Name merged across 17 columns with Green fill (`#047857`).
    - **Row 2:** KPI Name headers (Cols 0 to 16: `NOTIFICATION` through `TPT PRESUMTIVE`).
    - **Row 3:** Pre-computed staff monthly total count with Gold fill (`#FEF3C7`).
    - **Row 4 onwards:** Patient IDs submitted by this specific staff member.

### 3.3. Tabs 3 to 33: Daily Tabs ('1ST' to '31st')
- **Row 1 (Headers):**
  - Col 1: `NAME`
  - Col 2: `DESIGNATION`
  - Cols 3 to 16: `NOTIFICATION` to `Kit Consumption`
  - **Col 17 (New):** `DIFF TB`
  - **Col 18 (New):** `TPT START`
  - **Col 19 (New):** `TPT PRESUMTIVE`
- **Staff Blocks:**
  - 40 rows per staff member: `fo_start_row = 2 + (s_idx * 40)`.
  - Col 1: Staff Name
  - Col 2: Designation
  - Cols 3 to 19: Patient IDs vertically populated up to 40 entries for the specific reporting date.

---

## 4. Render Anti-OOM Memory Engine & Queue Throttling

To permanently resolve the Render 512 MB memory limit crash:

### 4.1. Disk-Spooling for Bulk ZIP Export (`download_all_kpi_workbooks`)
- Instead of allocating an unbounded `io.BytesIO()` in Python heap RAM:
  ```python
  with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp_zip:
      temp_zip_path = tmp_zip.name

  with zipfile.ZipFile(temp_zip_path, "w", zipfile.ZIP_DEFLATED) as zip_file:
      for dist in bihar_districts:
          excel_bytes = await asyncio.to_thread(lambda d=dist: generate_district_kpi_bytes(d, month))
          if excel_bytes:
              zip_file.writestr(f"KPI_Report_{safe_filename(dist)}_{month_tag}.xlsx", excel_bytes)
              del excel_bytes
              gc.collect()
          # Relaxed queue pacing to allow event loop and memory to settle
          await asyncio.sleep(0.75)
  ```
- Return a `FileResponse` (or streaming chunk generator) from `temp_zip_path`, with a background task deleting the temporary file post-transfer.
- **RAM Impact:** Reduces memory usage of bulk ZIP from **250+ MB down to < 5 MB**.

### 4.2. In-Loop Object Garbage Collection
- In `generate_district_kpi_bytes`:
  - Enforce `del wb` and `gc.collect()` immediately after saving workbook bytes.
  - Set `wb.close()` inside a `finally:` block.
- Throttling pacing: Relax the pause between workbooks from `50ms` to **`750ms`**.

---

## 5. Security & RBAC Download Gates

### 5.1. Single District Export Gate (`GET /download-kpi-workbook`)
- Validate requesting user against district permissions:
  ```python
  c_dist = canonicalize_district(district).lower()
  if admin_role == "SUB_ADMIN" and admin_allowed and "all" not in allowed_c:
      if c_dist not in allowed_c and district.lower() not in allowed_c:
          raise HTTPException(status_code=403, detail="Access denied: You do not have permission to download KPI reports for this district.")
  ```

### 5.2. Multi-District Bulk ZIP Export Gate (`GET /download-all-kpi-workbooks`)
- Only permit users who manage multiple districts:
  ```python
  if admin_role == "SUB_ADMIN" and "All" not in admin_allowed and len(admin_allowed) <= 1:
      raise HTTPException(
          status_code=403, 
          detail="Bulk ZIP download is restricted to multi-district administrators. Please download your individual district KPI workbook."
      )
  ```

### 5.3. Frontend UI Gate (`AdminDashboard.jsx`)
- In Reports Studio, evaluate `canDownloadBulkZip`:
  ```javascript
  const canDownloadBulkZip = currentUser?.role === 'SUPER_ADMIN' || 
    (currentUser?.allowed_districts && (currentUser.allowed_districts.includes('All') || currentUser.allowed_districts.length > 1));
  ```
- If `canDownloadBulkZip` is false, hide the "📦 Download All District KPI Workbooks (ZIP)" button completely, preventing single-district Sub-Admins from initiating heavy batch jobs.

---

## 6. Implementation Deliverables

1. **`generate_templates.py`:**
   - Update `KPI_CATEGORIES` to 17 entries.
   - Adjust column widths, formatting, and formulas for Performance Sheet, Consolidated Sheet (Wings 1 & 2), and Daily Sheets.
   - Execute script to regenerate all 22 templates in `templates/template_*.xlsx`.
2. **`main.py`:**
   - Update `EXCEL_KPI_CATEGORIES` to 17 entries with accurate column offsets.
   - Update `generate_district_kpi_bytes`:
     - Accumulate `differentiated_tb_ids`, `tpt_treatment_start_ids`, `tpt_presumptive_ids`.
     - Write to columns 17, 18, 19 in Daily sheets.
     - Write to clusters 14, 15, 16 in Consolidated sheet Left Wing (cols 40-48).
     - Write to Col 49+ for Right Wing staff clusters (17 columns per staff).
     - Write to cols 19, 20, 21 in Performance sheet and shift cohort columns to cols 22-27.
     - Update Grand Total `=SUM()` formulas across all 27 columns.
   - Update `download_all_kpi_workbooks`: Temp file spooling, 750ms queue pacing, multi-district RBAC check.
   - Update `download_kpi_workbook`: Strict single-district RBAC boundary check.
3. **`dfy-frontend/src/AdminDashboard.jsx`:**
   - Add `canDownloadBulkZip` role check in Reports Studio to conditionally render the ZIP download button.
   - Update indicator reference tags or tooltips where applicable.

---

## 7. Verification & Production Protocol

1. **Automated Backend Testing:**
   - Create `tests/test_kpi_excel_17_indicators.py` verifying:
     - All 33 sheets exist.
     - Performance sheet has columns 1 to 27 populated with valid `=SUM()` formulas.
     - Consolidated sheet Left Wing has 48 columns (16 clusters) and Right Wing starts at Col 49.
     - Daily sheets have 19 columns with IDs populated.
   - Create `tests/test_kpi_rbac_and_memory.py` verifying:
     - HTTP 403 on unauthorized single district download.
     - HTTP 403 on single-district user attempting bulk ZIP.
     - Memory usage stays bounded under `gc.collect()`.
2. **Compilation & Quality Gates:**
   - `python -m py_compile main.py` exits code 0.
   - `npm --prefix dfy-frontend run lint` exits with 0 syntax errors.
   - `npm --prefix dfy-frontend run build` exits code 0.
3. **Zero Push Rule:**
   - All commits remain strictly local on `feat/kpi-sheet-new-indicators`.
   - Wait for explicit user review and command before any deployment.
