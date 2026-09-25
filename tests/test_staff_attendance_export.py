import io
import pytest
import pandas as pd
from unittest.mock import patch, MagicMock
from datetime import datetime
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import main

@pytest.mark.asyncio
async def test_staff_attendance_export_dual_sheet_structure():
    mock_admin = {"username": "admin", "role": "SUPER_ADMIN"}
    
    with patch("main.get_raw_monthly_reports") as mock_reports, \
         patch("main.db.collection") as mock_coll:
        
        # Mock staff directory
        staff_doc = MagicMock()
        staff_doc.to_dict.return_value = {
            "name": "Rahul Kumar",
            "district": "Muzaffarpur",
            "designation": "Field Officer"
        }
        
        def collection_side_effect(coll_name):
            mock_inst = MagicMock()
            if coll_name == "staff_directory":
                mock_inst.stream.return_value = [staff_doc]
            elif coll_name == "daily_staff_leaves":
                mock_inst.where.return_value.where.return_value.stream.return_value = []
                mock_inst.stream.return_value = []
            return mock_inst

        mock_coll.side_effect = collection_side_effect
        
        # Mock daily field reports
        mock_reports.return_value = [{
            "working_place": "Muzaffarpur",
            "fo_name": "Rahul Kumar",
            "date_of_reporting": "2026-09-15",
            "submission_count": 1,
            "total_km": 25,
            "notification_ids": ["123456789"],
            "sample_tested_ids": [],
            "dbt_ids": [],
            "visited_names": ["Dr. Sharma"]
        }]
        
        response = await main.export_staff_attendance(
            month="2026-09",
            district="Muzaffarpur",
            admin=mock_admin
        )
        
        assert response.status_code == 200
        content = response.body
        excel_file = io.BytesIO(content)
        xls = pd.ExcelFile(excel_file)
        
        assert "Attendance Matrix" in xls.sheet_names, "Workbook must contain Sheet 1: 'Attendance Matrix'"
        assert "Daily Activity Log" in xls.sheet_names, "Workbook must contain Sheet 2: 'Daily Activity Log'"
        
        df_matrix = pd.read_excel(xls, sheet_name="Attendance Matrix")
        assert "Officer Name" in df_matrix.columns
        assert "Total Days" in df_matrix.columns
        assert "Present" in df_matrix.columns
        assert "Travel KM" in df_matrix.columns
        
        # Check values
        assert len(df_matrix) >= 1
        rahul_row = df_matrix[df_matrix["Officer Name"] == "Rahul Kumar"].iloc[0]
        assert rahul_row["Present"] == 1
        assert rahul_row["Travel KM"] == 25
        # Day 15 column (either integer 15 or string '15')
        day_col = 15 if 15 in df_matrix.columns else "15"
        assert str(rahul_row[day_col]).strip() == "P"
        
        df_log = pd.read_excel(xls, sheet_name="Daily Activity Log")
        assert "Date" in df_log.columns
        assert "District" in df_log.columns
        assert "Officer Name" in df_log.columns
        assert "Status" in df_log.columns
        assert "Total IDs" in df_log.columns
        assert "Notifications" in df_log.columns
        assert "Samples Tested" in df_log.columns
        assert "DBT Seeded" in df_log.columns
        assert "Travel KM" in df_log.columns
        assert "Visited Doctors / Facilities" in df_log.columns
        assert "Admin Remark" in df_log.columns

        # Verify Day 15 log row
        log_rows = df_log[(df_log["Officer Name"] == "Rahul Kumar") & (df_log["Date"] == "2026-09-15")]
        assert len(log_rows) == 1
        day15 = log_rows.iloc[0]
        assert day15["Status"] == "Present"
        assert day15["Travel KM"] == 25
        assert day15["Notifications"] == 1
        assert "Dr. Sharma" in str(day15["Visited Doctors / Facilities"])


@pytest.mark.asyncio
async def test_staff_attendance_export_subadmin_rbac_isolation():
    mock_subadmin = {"username": "subadmin", "role": "SUB_ADMIN", "allowed_districts": ["Buxar"]}
    
    with pytest.raises(main.HTTPException) as excinfo:
        await main.export_staff_attendance(
            month="2026-09",
            district="Muzaffarpur",
            admin=mock_subadmin
        )
    assert excinfo.value.status_code == 403, "Sub-admin must be forbidden from exporting outside allowed districts"


@pytest.mark.asyncio
async def test_staff_attendance_export_leaves_and_status_codes():
    mock_admin = {"username": "admin", "role": "SUPER_ADMIN"}
    
    with patch("main.get_raw_monthly_reports") as mock_reports, \
         patch("main.db.collection") as mock_coll:
        
        staff_doc = MagicMock()
        staff_doc.to_dict.return_value = {
            "name": "Priya Singh",
            "district": "Patna",
            "designation": "Field Officer"
        }
        
        leave_doc = MagicMock()
        leave_doc.to_dict.return_value = {
            "district": "Patna",
            "fo_name": "Priya Singh",
            "date": "2026-09-10",
            "status": "leave",
            "reason_type": "Medical",
            "remark": "High fever doctor note attached"
        }
        
        def collection_side_effect(coll_name):
            mock_inst = MagicMock()
            if coll_name == "staff_directory":
                mock_inst.stream.return_value = [staff_doc]
            elif coll_name == "daily_staff_leaves":
                mock_inst.where.return_value.where.return_value.stream.return_value = [leave_doc]
                mock_inst.stream.return_value = [leave_doc]
            return mock_inst

        mock_coll.side_effect = collection_side_effect
        mock_reports.return_value = []
        
        response = await main.export_staff_attendance(
            month="2026-09",
            district="Patna",
            admin=mock_admin
        )
        
        excel_file = io.BytesIO(response.body)
        xls = pd.ExcelFile(excel_file)
        df_matrix = pd.read_excel(xls, sheet_name="Attendance Matrix")
        
        priya_row = df_matrix[df_matrix["Officer Name"] == "Priya Singh"].iloc[0]
        day_col = 10 if 10 in df_matrix.columns else "10"
        assert str(priya_row[day_col]).strip() == "ML", "Medical leave must be coded as ML"
        assert priya_row["Leaves"] >= 1


@pytest.mark.asyncio
async def test_staff_attendance_export_sunday_weekly_off():
    mock_admin = {"username": "admin", "role": "SUPER_ADMIN"}
    
    with patch("main.get_raw_monthly_reports") as mock_reports, \
         patch("main.db.collection") as mock_coll:
        
        staff_doc = MagicMock()
        staff_doc.to_dict.return_value = {
            "name": "Amit Sharma",
            "district": "Gaya",
            "designation": "Field Officer"
        }
        
        def collection_side_effect(coll_name):
            mock_inst = MagicMock()
            if coll_name == "staff_directory":
                mock_inst.stream.return_value = [staff_doc]
            elif coll_name == "daily_staff_leaves":
                mock_inst.where.return_value.where.return_value.stream.return_value = []
                mock_inst.stream.return_value = []
            return mock_inst

        mock_coll.side_effect = collection_side_effect
        mock_reports.return_value = []
        
        # September 2026: Day 6 is a Sunday (2026-09-06 is Sunday)
        response = await main.export_staff_attendance(
            month="2026-09",
            district="Gaya",
            admin=mock_admin
        )
        
        excel_file = io.BytesIO(response.body)
        xls = pd.ExcelFile(excel_file)
        df_matrix = pd.read_excel(xls, sheet_name="Attendance Matrix")
        
        amit_row = df_matrix[df_matrix["Officer Name"] == "Amit Sharma"].iloc[0]
        day6_col = 6 if 6 in df_matrix.columns else "6"
        assert str(amit_row[day6_col]).strip() == "WO", "Sunday must be marked WO when no report was submitted"


@pytest.mark.asyncio
async def test_legacy_aliases_call_export_staff_attendance():
    mock_admin = {"username": "admin", "role": "SUPER_ADMIN"}
    with patch("main.export_staff_attendance") as mock_export:
        mock_export.return_value = MagicMock(status_code=200)
        
        res = await main.export_summary_metrics(month="2026-09", district="Patna", admin=mock_admin)
        assert mock_export.called
        mock_export.assert_called_with(month="2026-09", district="Patna", districts=None, admin=mock_admin)


@pytest.mark.asyncio
async def test_staff_attendance_export_next_day_morning_remarks():
    mock_admin = {"username": "admin", "role": "SUPER_ADMIN"}
    
    with patch("main.get_raw_monthly_reports") as mock_reports, \
         patch("main.db.collection") as mock_coll:
        
        staff_doc = MagicMock()
        staff_doc.to_dict.return_value = {
            "name": "Shashi Ranjan",
            "district": "Patna",
            "designation": "Field Officer"
        }
        
        def collection_side_effect(coll_name):
            mock_inst = MagicMock()
            if coll_name == "staff_directory":
                mock_inst.stream.return_value = [staff_doc]
            elif coll_name == "daily_staff_leaves":
                mock_inst.where.return_value.where.return_value.stream.return_value = []
                mock_inst.stream.return_value = []
            return mock_inst

        mock_coll.side_effect = collection_side_effect
        
        mock_reports.return_value = [{
            "working_place": "Patna",
            "fo_name": "Shashi Ranjan",
            "date_of_reporting": "2026-09-24",
            "submission_count": 1,
            "total_km": 15,
            "notification_ids": ["987654321"],
            "sample_tested_ids": [],
            "dbt_ids": [],
            "visited_names": [],
            "is_next_day_submission": True,
            "submitted_morning_time": "09:26 AM",
            "morning_submission_label": "Next day morning 09:26 AM"
        }]
        
        response = await main.export_staff_attendance(
            month="2026-09",
            district="Patna",
            admin=mock_admin
        )
        
        assert response.status_code == 200
        excel_file = io.BytesIO(response.body)
        xls = pd.ExcelFile(excel_file)
        
        df_matrix = pd.read_excel(xls, sheet_name="Attendance Matrix")
        shashi_row = df_matrix[df_matrix["Officer Name"] == "Shashi Ranjan"].iloc[0]
        remarks_val = str(shashi_row["Remarks"])
        assert "Submitted next morning" in remarks_val
        assert "09:26 AM" in remarks_val


