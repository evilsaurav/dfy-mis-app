# -*- coding: utf-8 -*-
"""
tests/test_kpi_rbac_and_anti_oom.py
Unit and integration tests for KPI RBAC download security and anti-OOM disk-spooled tempfile engine.
"""
import io
import os
import sys
import zipfile
from pathlib import Path
from unittest.mock import patch, MagicMock, AsyncMock
import pytest
from fastapi.testclient import TestClient

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import main
from main import app, get_current_admin

client = TestClient(app)


@pytest.fixture(autouse=True)
def cleanup_overrides():
    """Ensure dependency overrides are cleaned up after each test."""
    yield
    app.dependency_overrides.clear()


def test_download_kpi_workbook_rbac_forbidden():
    """Sub-Admin permitted for Buxar receives HTTP 403 when requesting Patna."""
    sub_admin = {
        "username": "subadmin_buxar",
        "role": "SUB_ADMIN",
        "allowed_districts": ["Buxar"]
    }
    app.dependency_overrides[get_current_admin] = lambda: sub_admin

    res = client.get("/download-kpi-workbook?district=Patna&month=2026-09")
    assert res.status_code == 403
    assert res.json()["detail"] == "Access denied: You do not have permission to download KPI reports for this district."


def test_download_kpi_workbook_rbac_allowed():
    """Sub-Admin permitted for Buxar receives HTTP 200 when requesting Buxar."""
    sub_admin = {
        "username": "subadmin_buxar",
        "role": "SUB_ADMIN",
        "allowed_districts": ["Buxar"]
    }
    app.dependency_overrides[get_current_admin] = lambda: sub_admin

    dummy_excel = b"PK\x03\x04testexcelcontent"
    with patch("main.generate_district_kpi_bytes", return_value=dummy_excel) as mock_gen:
        res = client.get("/download-kpi-workbook?district=Buxar&month=2026-09")
        assert res.status_code == 200
        assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in res.headers["content-type"]
        assert "KPI_Report_Buxar_2026-09.xlsx" in res.headers["content-disposition"]
        assert res.content == dummy_excel
        mock_gen.assert_called_once_with("Buxar", "2026-09")


def test_download_all_kpi_workbooks_single_district_forbidden():
    """Sub-Admin permitted for only 1 district receives HTTP 403 on bulk ZIP."""
    sub_admin = {
        "username": "subadmin_buxar",
        "role": "SUB_ADMIN",
        "allowed_districts": ["Buxar"]
    }
    app.dependency_overrides[get_current_admin] = lambda: sub_admin

    res = client.get("/download-all-kpi-workbooks?month=2026-09")
    assert res.status_code == 403
    assert res.json()["detail"] == "Bulk ZIP download is restricted to multi-district administrators. Please download your individual district KPI workbook."


def test_download_all_kpi_workbooks_multi_district_subadmin_allowed():
    """Sub-Admin permitted for multiple districts (e.g. Buxar and Rohtas) is allowed bulk download."""
    multi_admin = {
        "username": "coordinator_multi",
        "role": "SUB_ADMIN",
        "allowed_districts": ["Buxar", "Rohtas"]
    }
    app.dependency_overrides[get_current_admin] = lambda: multi_admin

    dummy_excel = b"PK\x03\x04testexcelcontent"
    with patch("main.generate_district_kpi_bytes", return_value=dummy_excel), \
         patch("asyncio.sleep", new_callable=AsyncMock):
        res = client.get("/download-all-kpi-workbooks?month=2026-09&districts=Buxar,Rohtas")
        assert res.status_code == 200
        assert "application/zip" in res.headers["content-type"]
        zf = zipfile.ZipFile(io.BytesIO(res.content))
        namelist = zf.namelist()
        assert "KPI_Report_Buxar_2026-09.xlsx" in namelist
        assert "KPI_Report_Rohtas_2026-09.xlsx" in namelist


def test_download_all_kpi_workbooks_super_admin_tempfile_stream():
    """Super Admin succeeds with HTTP 200, receives ZIP content type, and uses disk-spooled tempfile."""
    super_admin = {
        "username": "superadmin",
        "role": "SUPER_ADMIN",
        "allowed_districts": ["all"]
    }
    app.dependency_overrides[get_current_admin] = lambda: super_admin

    dummy_excel = b"PK\x03\x04mockexcelcontent"
    # Track created temp file to verify background task cleanup
    import tempfile
    captured_paths = []
    orig_named_temp_file = tempfile.NamedTemporaryFile

    def spy_named_temp_file(*args, **kwargs):
        f = orig_named_temp_file(*args, **kwargs)
        captured_paths.append(f.name)
        return f

    # Patch asyncio.sleep so the test runs instantly
    with patch("main.generate_district_kpi_bytes", return_value=dummy_excel) as mock_gen, \
         patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep, \
         patch("tempfile.NamedTemporaryFile", side_effect=spy_named_temp_file):

        res = client.get("/download-all-kpi-workbooks?month=2026-09&districts=Khagaria,Begusarai")
        assert res.status_code == 200
        assert "application/zip" in res.headers["content-type"]
        assert "DFY_KPI_Selected_Districts_2026-09.zip" in res.headers["content-disposition"]

        # Verify zip contents
        zf = zipfile.ZipFile(io.BytesIO(res.content))
        namelist = zf.namelist()
        assert "KPI_Report_Khagaria_2026-09.xlsx" in namelist
        assert "KPI_Report_Begusarai_2026-09.xlsx" in namelist
        assert zf.read("KPI_Report_Khagaria_2026-09.xlsx") == dummy_excel

        # Verify 750ms queue relaxation was called
        assert mock_sleep.called
        for call in mock_sleep.call_args_list:
            assert call.args[0] == 0.75

        # Verify disk-spooled temp file was cleaned up by background task
        assert len(captured_paths) >= 1
        for p in captured_paths:
            assert not os.path.exists(p), f"Temporary file {p} was not cleaned up!"


def test_generate_district_kpi_bytes_try_finally_cleanup():
    """Verify that generate_district_kpi_bytes invokes gc.collect even if an exception occurs."""
    district = "Khagaria"
    with patch.object(main.db, "collection", side_effect=RuntimeError("Firestore down")), \
         patch("gc.collect") as mock_gc:
        try:
            main.generate_district_kpi_bytes(district, "2026-09")
        except RuntimeError:
            pass
        # gc.collect must have been invoked in the finally block
        assert mock_gc.called
