import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from main import app, cache, create_access_token

client = TestClient(app)

def test_subadmin_district_target_isolation():
    # Sub-admin permitted for Jamui only
    token_jamui = create_access_token({
        "sub": "subadmin_jamui",
        "username": "subadmin_jamui",
        "role": "SUB_ADMIN",
        "name": "SubAdmin Jamui",
        "allowed_districts": ["Jamui"]
    })
    headers_jamui = {"Authorization": f"Bearer {token_jamui}"}

    # 1. Updating Jamui should succeed (200)
    with patch("main.db.collection") as mock_coll:
        mock_doc = MagicMock()
        mock_coll.return_value.document.return_value = mock_doc
        
        res = client.post("/update-district-target", json={
            "month": "2026-10",
            "district": "Jamui",
            "official_target": 100
        }, headers=headers_jamui)
        assert res.status_code == 200, res.text
        assert res.json()["success"] is True

    # 2. Updating Gaya (unauthorized) should return 403 Forbidden
    res_forbidden = client.post("/update-district-target", json={
        "month": "2026-10",
        "district": "Gaya",
        "official_target": 150
    }, headers=headers_jamui)
    assert res_forbidden.status_code == 403
    assert "cross-district target modification forbidden" in res_forbidden.text.lower()

def test_targets_endpoint_returns_dual_targets_and_buffer():
    token = create_access_token({"sub": "admin", "role": "SUPER_ADMIN", "name": "Super Admin"})
    headers = {"Authorization": f"Bearer {token}"}

    with patch("main.get_directory") as mock_dir, \
         patch("main.db.collection") as mock_coll:
        mock_dir.return_value = {"Jamui": ["Rajiv Kumar", "Bablu Kumar"]}
        
        # Mock staff targets
        doc1 = MagicMock()
        doc1.to_dict.return_value = {"district": "Jamui", "fo_name": "Rajiv Kumar", "target": 35, "month": "2026-10"}
        doc2 = MagicMock()
        doc2.to_dict.return_value = {"district": "Jamui", "fo_name": "Bablu Kumar", "target": 35, "month": "2026-10"}
        
        # Mock district target doc
        dt_doc = MagicMock()
        dt_doc.exists = True
        dt_doc.to_dict.return_value = {"district": "Jamui", "month": "2026-10", "official_target": 50}

        def mock_coll_side_effect(name):
            m = MagicMock()
            if name == "district_targets":
                m.document.return_value.get.return_value = dt_doc
            elif name == "staff_targets":
                m.stream.return_value = [doc1, doc2]
            return m

        mock_coll.side_effect = mock_coll_side_effect
        cache.clear()

        res = client.get("/targets?month=2026-10&district=Jamui", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["official_district_target"] == 50
        assert data["staff_targets_sum"] == 70
        assert data["buffer_percent"] == 40.0
        assert data["buffer_count"] == 20

def test_targets_endpoint_fallback_when_district_target_unset():
    token = create_access_token({"sub": "admin", "role": "SUPER_ADMIN", "name": "Super Admin"})
    headers = {"Authorization": f"Bearer {token}"}

    with patch("main.get_directory") as mock_dir, \
         patch("main.db.collection") as mock_coll:
        mock_dir.return_value = {"Jamui": ["Rajiv Kumar", "Bablu Kumar"]}
        
        doc1 = MagicMock()
        doc1.to_dict.return_value = {"district": "Jamui", "fo_name": "Rajiv Kumar", "target": 35, "month": "2026-10"}
        doc2 = MagicMock()
        doc2.to_dict.return_value = {"district": "Jamui", "fo_name": "Bablu Kumar", "target": 35, "month": "2026-10"}
        
        dt_doc = MagicMock()
        dt_doc.exists = False
        dt_doc.to_dict.return_value = None

        def mock_coll_side_effect(name):
            m = MagicMock()
            if name == "district_targets":
                m.document.return_value.get.return_value = dt_doc
            elif name == "staff_targets":
                m.stream.return_value = [doc1, doc2]
            return m

        mock_coll.side_effect = mock_coll_side_effect
        cache.clear()

        res = client.get("/targets?month=2026-10&district=Jamui", headers=headers)
        assert res.status_code == 200
        data = res.json()
        # Fallback to staff targets sum (70)
        assert data["official_district_target"] == 70
        assert data["staff_targets_sum"] == 70
        assert data["buffer_percent"] == 0.0
        assert data["buffer_count"] == 0

def test_subadmin_empty_allowed_districts_forbidden():
    token_empty = create_access_token({
        "sub": "subadmin_empty",
        "username": "subadmin_empty",
        "role": "SUB_ADMIN",
        "name": "SubAdmin Empty",
        "allowed_districts": []
    })
    headers = {"Authorization": f"Bearer {token_empty}"}

    res = client.post("/update-district-target", json={
        "month": "2026-10",
        "district": "Jamui",
        "official_target": 100
    }, headers=headers)
    assert res.status_code == 403

def test_negative_target_validation():
    token = create_access_token({"sub": "admin", "role": "SUPER_ADMIN", "name": "Super Admin"})
    headers = {"Authorization": f"Bearer {token}"}

    res = client.post("/update-district-target", json={
        "month": "2026-10",
        "district": "Jamui",
        "official_target": -10
    }, headers=headers)
    assert res.status_code == 400
    assert "cannot be negative" in res.text.lower()

def test_kpi_excel_engine_uses_official_district_target():
    import io
    import openpyxl
    from main import generate_district_kpi_bytes
    
    raw_reports = [{"working_place": "Jamui", "date_of_reporting": "2026-10-05", "fo_name": "Rajiv Kumar", "total_notifications": 10}]
    target_records = [{"district": "Jamui", "fo_name": "Rajiv Kumar", "target": 35}]
    
    with patch("main.db.collection") as mock_coll:
        dt_doc = MagicMock()
        dt_doc.exists = True
        dt_doc.to_dict.return_value = {"district": "Jamui", "month": "2026-10", "official_target": 100}
        mock_coll.return_value.document.return_value.get.return_value = dt_doc
        
        excel_bytes = generate_district_kpi_bytes("Jamui", "2026-10", raw_reports=raw_reports, target_records=target_records)
        assert excel_bytes is not None
        assert len(excel_bytes) > 0
        
        wb = openpyxl.load_workbook(io.BytesIO(excel_bytes), data_only=False)
        assert "Performance sheet" in wb.sheetnames
        ws_perf = wb["Performance sheet"]
        
        # Verify Grand Total target cell has the official district target (100)
        gt_found = False
        for r in range(5, ws_perf.max_row + 1):
            val = ws_perf.cell(row=r, column=1).value
            if val and "GRAND TOTAL" in str(val).upper():
                assert ws_perf.cell(row=r, column=3).value == 100
                gt_found = True
                break
        assert gt_found, "GRAND TOTAL row should be present in Performance sheet"


