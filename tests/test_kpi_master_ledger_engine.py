import os
import sys
import io
import openpyxl
import pytest
from unittest.mock import patch, MagicMock, AsyncMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import main
from main import generate_district_kpi_bytes, cache, db
try:
    from main import generate_district_kpi_bytes_async
except ImportError:
    generate_district_kpi_bytes_async = None


@pytest.mark.asyncio
async def test_kpi_generator_uses_master_ledger_zero_firestore_reads():
    """Verify that generate_district_kpi_bytes_async derives data from master ledger and never hits Firestore."""
    assert generate_district_kpi_bytes_async is not None, "generate_district_kpi_bytes_async must be defined in main.py"

    district = "Khagaria"
    month = "2026-09"

    mock_reports = [
        {
            "id": "khagaria_rep1_2026-09-01",
            "working_place": "Khagaria",
            "fo_name": "Rambilash Paswan",
            "date_of_reporting": "2026-09-01",
            "notification_ids": ["NOTIF101", "NOTIF102"],
            "sample_tested_ids": ["SAMP201"],
            "differentiated_tb_ids": ["DIFF301"],
            "tpt_treatment_start_ids": ["TPTS401"],
            "tpt_presumptive_ids": ["TPTP501"]
        }
    ]

    mock_targets = [
        {"district": "Khagaria", "fo_name": "Rambilash Paswan", "target": 65, "month": "2026-09"}
    ]

    with patch("main.get_raw_monthly_reports", new_callable=AsyncMock) as mock_raw, \
         patch("main.get_cached_staff_targets_for_month", new_callable=AsyncMock) as mock_targets_fn, \
         patch.object(main.db, "collection", side_effect=AssertionError("Direct db.collection should not be called in KPI engine!")):

        mock_raw.return_value = mock_reports
        mock_targets_fn.return_value = mock_targets

        excel_bytes = await generate_district_kpi_bytes_async(district, month)
        assert excel_bytes is not None
        assert len(excel_bytes) > 5000

        # Verify parsed openpyxl contents
        wb = openpyxl.load_workbook(io.BytesIO(excel_bytes), data_only=False)
        assert "Performance sheet" in wb.sheetnames
        ws_perf = wb["Performance sheet"]
        # Staff 0 is Rambilash Paswan in Row 5
        assert ws_perf.cell(row=5, column=1).value == "Rambilash Paswan"
        assert ws_perf.cell(row=5, column=3).value == 65 # Target
        assert ws_perf.cell(row=5, column=4).value == 2  # NOTIFICATION
        assert ws_perf.cell(row=5, column=19).value == 1 # DIFF TB
        assert ws_perf.cell(row=5, column=20).value == 1 # TPT START
        assert ws_perf.cell(row=5, column=21).value == 1 # TPT PRESUMPTIVE
        wb.close()


def test_kpi_generator_sync_accepts_in_memory_lists():
    """Verify that directly passing raw_reports and target_records operates 100% in memory with zero db calls."""
    district = "Khagaria"
    month = "2026-09"

    mock_reports = [
        {
            "id": "khagaria_rep1_2026-09-01",
            "working_place": "Khagaria",
            "fo_name": "Rambilash Paswan",
            "date_of_reporting": "2026-09-01",
            "notification_ids": ["NOTIF101", "NOTIF102"],
            "sample_tested_ids": ["SAMP201"],
            "differentiated_tb_ids": ["DIFF301"],
            "tpt_treatment_start_ids": ["TPTS401"],
            "tpt_presumptive_ids": ["TPTP501"]
        }
    ]

    mock_targets = [
        {"district": "Khagaria", "fo_name": "Rambilash Paswan", "target": 70, "month": "2026-09"}
    ]

    with patch.object(main.db, "collection", side_effect=AssertionError("Direct db.collection should not be called!")):
        excel_bytes = generate_district_kpi_bytes(
            district, 
            month, 
            raw_reports=mock_reports, 
            target_records=mock_targets
        )
        assert excel_bytes is not None
        assert len(excel_bytes) > 5000

        wb = openpyxl.load_workbook(io.BytesIO(excel_bytes), data_only=False)
        assert "Performance sheet" in wb.sheetnames
        ws_perf = wb["Performance sheet"]
        assert ws_perf.cell(row=5, column=1).value == "Rambilash Paswan"
        assert ws_perf.cell(row=5, column=3).value == 70
        assert ws_perf.cell(row=5, column=4).value == 2
        wb.close()


def test_kpi_generator_sync_falls_back_to_cache_keys():
    """Verify that if raw_reports or target_records are None, cache keys are checked before Firestore."""
    district = "Khagaria"
    month = "2026-09"

    mock_reports = [
        {
            "id": "khagaria_rep1_2026-09-01",
            "working_place": "Khagaria",
            "fo_name": "Rambilash Paswan",
            "date_of_reporting": "2026-09-01",
            "notification_ids": ["NOTIF201"],
        }
    ]

    mock_targets = [
        {"district": "Khagaria", "fo_name": "Rambilash Paswan", "target": 80, "month": "2026-09"}
    ]

    cache.set(f"shared_raw_month_{month}", mock_reports, ttl=300)
    cache.set(f"staff_targets_raw_{month}", mock_targets, ttl=300)

    try:
        with patch.object(main.db, "collection", side_effect=AssertionError("Direct db.collection should not be called!")):
            excel_bytes = generate_district_kpi_bytes(district, month)
            assert excel_bytes is not None
            assert len(excel_bytes) > 5000

            wb = openpyxl.load_workbook(io.BytesIO(excel_bytes), data_only=False)
            ws_perf = wb["Performance sheet"]
            assert ws_perf.cell(row=5, column=1).value == "Rambilash Paswan"
            assert ws_perf.cell(row=5, column=3).value == 80
            assert ws_perf.cell(row=5, column=4).value == 1
            wb.close()
    finally:
        cache.delete(f"shared_raw_month_{month}")
        cache.delete(f"staff_targets_raw_{month}")
