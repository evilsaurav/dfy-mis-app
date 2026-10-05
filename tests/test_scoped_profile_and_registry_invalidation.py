import pytest
import asyncio
from unittest.mock import MagicMock, patch
from pathlib import Path
import sys

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from main import (
    cache,
    submit_daily_report,
    record_report_mutation,
    fetch_district_notification_registry,
    DailyActivityReport
)
 
@pytest.fixture(autouse=True)
def mock_postgres_insert():
    def fake_execute_raw(sql, params=None, fetch=False):
        sql_upper = sql.upper()
        if "INSERT INTO DAILY_FIELD_REPORTS" in sql_upper and "RETURNING ID" in sql_upper:
            return [{"id": 1001}]
        return [] if fetch else True

    with patch("backend.routers.reports.pg_execute_raw", side_effect=fake_execute_raw):
        yield

@pytest.fixture(autouse=True)
def clean_cache():
    cache.clear()
    yield
    cache.clear()

@pytest.mark.asyncio
async def test_profile_cache_scoped_eviction_on_submission():
    """Verify that Officer A's report submission only evicts Officer A's cache, preserving Officer B's."""
    # Seed caches
    cache.set("profile_gaya_officera_2026-09", {"stats": "officer_a"}, ttl=1800)
    cache.set("profile_patna_officerb_2026-09", {"stats": "officer_b"}, ttl=1800)
    
    # Verify both are present
    assert cache.get("profile_gaya_officera_2026-09") is not None
    assert cache.get("profile_patna_officerb_2026-09") is not None
    
    report = DailyActivityReport(
        working_place="Gaya",
        fo_name="officera",
        pin="1234",
        date_of_reporting="2026-09-30",
        remark="Followed up with 2 patients",
        notification_ids=["10001", "10002"]
    )
    
    with patch("main.db") as mock_db, \
         patch("main.get_district_90day_notified_ids", return_value=set()):
        mock_doc_ref = MagicMock()
        mock_db.collection.return_value.document.return_value = mock_doc_ref
        
        await submit_daily_report(report)
        
        # Officer A's cache must be evicted
        assert cache.get("profile_gaya_officera_2026-09") is None
        # Officer B's cache must remain warm and intact
        assert cache.get("profile_patna_officerb_2026-09") is not None
        assert cache.get("profile_patna_officerb_2026-09") == {"stats": "officer_b"}

def test_registry_mutation_scoped_to_district():
    """Verify that mutating a report in Gaya does not wipe Muzaffarpur or Patna notification registry caches."""
    cache.set("dist_notif_registry_gaya_3", {"10001": {"date": "2026-09-01"}}, ttl=7200)
    cache.set("dist_notif_registry_patna_3", {"20001": {"date": "2026-09-01"}}, ttl=7200)
    cache.set("dist_notif_registry_muzaffarpur_3", {"30001": {"date": "2026-09-01"}}, ttl=7200)
    
    # Mutate a report in Gaya
    record_report_mutation(
        action="submit",
        doc_id="gaya_fo1_2026-09-30",
        district="Gaya",
        date="2026-09-30",
        report_data={"working_place": "Gaya", "date_of_reporting": "2026-09-30"}
    )
    
    # Gaya registry must be invalidated
    assert cache.get("dist_notif_registry_gaya_3") is None
    # Patna and Muzaffarpur registries must remain cached
    assert cache.get("dist_notif_registry_patna_3") is not None
    assert cache.get("dist_notif_registry_muzaffarpur_3") is not None

@pytest.mark.asyncio
async def test_fetch_district_registry_never_falls_back_to_unbounded_statewide_stream():
    """Verify that querying a district with 0 reports never streams all statewide records."""
    with patch("main.db") as mock_db:
        mock_query = MagicMock()
        # District query returns 0 documents
        mock_query.stream.return_value = []
        mock_query.where.return_value = mock_query
        
        mock_col = MagicMock()
        mock_col.where.return_value = mock_query
        mock_db.collection.return_value = mock_col
        
        result = await fetch_district_notification_registry("Sheohar", months=3)
        assert result.get("registry") == {}
        
        # Verify that where("working_place", "in", ...) was called
        # But a date-only unbounded statewide query was NOT called
        for call in mock_col.where.call_args_list:
            field, op, val = call[0]
            # Ensure every query filters by working_place or clean_dist
            assert field in ["working_place", "district"], f"Unbounded query executed on field: {field}"
