import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient
from pathlib import Path
import sys

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from main import (
    app,
    cache,
    ENABLE_IN_MEMORY_DERIVATION,
    get_profile_cache_key,
    evict_officer_profile_cache,
)

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_cache():
    cache.clear()
    yield
    cache.clear()

def test_enable_in_memory_derivation_default():
    """Verify that ENABLE_IN_MEMORY_DERIVATION defaults to True."""
    assert ENABLE_IN_MEMORY_DERIVATION is True

def test_get_profile_cache_key_standardization():
    """Verify standardizing district, officer name, and YYYY-MM into uniform keys."""
    # Punctuation and spaces in officer name
    key1 = get_profile_cache_key("East Champaran", "Arun Kumar.", "2026-10-05")
    assert key1 == "profile_east_champaran_arunkumar_2026-10"

    # Lowercase variant and partial date
    key2 = get_profile_cache_key("east champaran", "arun kumar", "2026-10")
    assert key2 == "profile_east_champaran_arunkumar_2026-10"

    # Uppercase district, special chars
    key3 = get_profile_cache_key("PATNA", "Ravi Shankar (FO)", "2026-09-30")
    assert key3 == "profile_patna_ravishankarfo_2026-09"

    # Empty inputs handled gracefully
    key_empty = get_profile_cache_key("", "", "")
    assert key_empty.startswith("profile_")

def test_evict_officer_profile_cache_scoped():
    """Verify that evict_officer_profile_cache only deletes the target officer's key."""
    key_a = get_profile_cache_key("Patna", "Officer A", "2026-10")
    key_b = get_profile_cache_key("Gaya", "Officer B", "2026-10")
    key_c = get_profile_cache_key("Patna", "Officer C", "2026-10")

    cache.set(key_a, {"data": "A"})
    cache.set(key_b, {"data": "B"})
    cache.set(key_c, {"data": "C"})

    # Evict only Officer A
    evict_officer_profile_cache("Patna", "Officer A", "2026-10-15")

    assert cache.get(key_a) is None, "Officer A cache should be evicted"
    assert cache.get(key_b) == {"data": "B"}, "Officer B cache must be preserved"
    assert cache.get(key_c) == {"data": "C"}, "Officer C cache must be preserved"

    # Evict with old_district
    key_old_dist = get_profile_cache_key("Bhojpur", "Officer B", "2026-10")
    cache.set(key_old_dist, {"data": "B_old"})
    evict_officer_profile_cache("Gaya", "Officer B", "2026-10-01", old_district="Bhojpur")
    assert cache.get(key_b) is None
    assert cache.get(key_old_dist) is None

def test_my_profile_stats_fast_path():
    """Verify that my_profile_stats derives stats in-memory from cached directory and master ledger."""
    mock_staff = [
        {"district": "Patna", "name": "Alok Kumar", "pin": "1234", "is_active": True}
    ]
    mock_targets = [
        {"district": "Patna", "fo_name": "Alok Kumar", "target": 65}
    ]
    mock_reports = [
        {
            "working_place": "Patna",
            "fo_name": "Alok Kumar",
            "date_of_reporting": "2026-10-02",
            "notification_ids": ["N1", "N2", "N3"],
            "total_km": 15
        }
    ]

    with patch("main.get_cached_staff_directory_raw", AsyncMock(return_value=mock_staff)), \
         patch("main.get_cached_staff_targets_for_month", AsyncMock(return_value=mock_targets)), \
         patch("main.get_raw_monthly_reports", AsyncMock(return_value=mock_reports)), \
         patch("main.db") as mock_db:

        def mock_col(name):
            if name in ("daily_field_reports", "staff_directory"):
                raise AssertionError(f"Should not query Firestore collection '{name}' in fast path!")
            col = MagicMock()
            col.stream.return_value = []
            col.where.return_value = col
            col.document.return_value.get.return_value = MagicMock(exists=False)
            return col

        mock_db.collection.side_effect = mock_col

        payload = {
            "working_place": "Patna",
            "fo_name": "Alok Kumar",
            "pin": "1234",
            "month": "2026-10"
        }
        resp = client.post("/my-profile-stats", json=payload)
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["success"] is True
        assert data["target"] == 65
        assert data["breakdown"]["notification"] == 3
        assert data["total_km"] == 15

        # Warm profile cache check: second call makes zero collection or doc calls
        mock_db.collection.side_effect = AssertionError("Warm cache must make zero Firestore collection calls!")
        resp2 = client.post("/my-profile-stats", json=payload)
        assert resp2.status_code == 200
        assert resp2.json()["target"] == 65

def test_my_profile_stats_new_staff_fallback():
    """Verify fallback to single Firestore document get if officer not yet in cached directory."""
    empty_staff = []

    mock_doc = MagicMock()
    mock_doc.exists = True
    mock_doc.to_dict.return_value = {
        "name": "Brand New FO",
        "district": "Patna",
        "pin": "9999",
        "is_active": True
    }

    with patch("main.get_cached_staff_directory_raw", AsyncMock(return_value=empty_staff)), \
         patch("main.get_cached_staff_targets_for_month", AsyncMock(return_value=[])), \
         patch("main.get_raw_monthly_reports", AsyncMock(return_value=[])), \
         patch("main.db") as mock_db:

        def mock_col(name):
            col = MagicMock()
            col.stream.return_value = []
            col.where.return_value = col
            col.document.return_value.get.return_value = mock_doc
            return col

        mock_db.collection.side_effect = mock_col

        payload = {
            "working_place": "Patna",
            "fo_name": "Brand New FO",
            "pin": "9999",
            "month": "2026-10"
        }
        resp = client.post("/my-profile-stats", json=payload)
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["success"] is True
        assert mock_db.collection.called

def test_my_profile_stats_auto_failover_on_error():
    """Verify silent failover to legacy Firestore queries if an unexpected in-memory exception occurs."""
    with patch("main.ENABLE_IN_MEMORY_DERIVATION", True), \
         patch("main.get_cached_staff_directory_raw", AsyncMock(side_effect=RuntimeError("Memory corruption glitch"))), \
         patch("main.legacy_my_profile_stats", AsyncMock(return_value={
             "success": True,
             "target": 50,
             "total_achieved": 10,
             "source": "legacy_fallback"
         })) as mock_legacy:

        payload = {
            "working_place": "Patna",
            "fo_name": "Alok Kumar",
            "pin": "1234",
            "month": "2026-10"
        }
        resp = client.post("/my-profile-stats", json=payload)
        # Zero 500 error!
        assert resp.status_code == 200, resp.text
        assert resp.json()["source"] == "legacy_fallback"
        assert mock_legacy.called

def test_my_profile_stats_kill_switch_disabled():
    """Verify that when ENABLE_IN_MEMORY_DERIVATION is False, legacy helper is directly used."""
    with patch("main.ENABLE_IN_MEMORY_DERIVATION", False), \
         patch("main.legacy_my_profile_stats", AsyncMock(return_value={
             "success": True,
             "target": 50,
             "source": "kill_switch_legacy"
         })) as mock_legacy:

        payload = {
            "working_place": "Patna",
            "fo_name": "Alok Kumar",
            "pin": "1234",
            "month": "2026-10"
        }
        resp = client.post("/my-profile-stats", json=payload)
        assert resp.status_code == 200, resp.text
        assert resp.json()["source"] == "kill_switch_legacy"
        assert mock_legacy.called
