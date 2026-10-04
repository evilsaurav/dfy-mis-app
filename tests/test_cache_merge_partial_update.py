import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import pytest
from backend.core.cache import cache
from backend.core.master_ledger import upsert_in_memory_report, _upsert_into_cached_list


def test_cache_merge_preserves_absent_categories_on_partial_update():
    """
    Simulates the exact user bug:
    1. Report initially submitted with notification_ids=['A','B'], hiv_dm_ids=['X'],
       dbt_ids=['Y'], outcome_assigned_ids=['Z'].
    2. FO or Admin adds a new ID ('C') to notifications. edit_patient_id produces a
       partial update containing ONLY notification_ids=['A','B','C'] with other category
       arrays omitted.
    3. Assert that cache merge retains hiv_dm_ids, dbt_ids, outcome_assigned_ids safely,
       while successfully updating notification_ids to ['A','B','C'].
    """
    cache_key = "shared_raw_month_2026-10"
    target_id = "patna_ramesh_kumar_2026-10-04"

    # Reset and initialize monthly cache list (simulating active in-memory ledger)
    cache.delete(cache_key)
    cache.delete_prefix(f"{cache_key}_")
    cache.set(cache_key, [])

    initial_report = {
        "id": target_id,
        "doc_id": target_id,
        "working_place": "Patna",
        "district": "Patna",
        "fo_name": "Ramesh Kumar",
        "date_of_reporting": "2026-10-04",
        "notification_ids": ["A", "B"],
        "notifications": 2,
        "hiv_dm_ids": ["X"],
        "hiv_dm": 1,
        "dbt_ids": ["Y"],
        "dbt": 1,
        "outcome_assigned_ids": ["Z"],
        "outcome_assigned": 1,
        "total_km": 15
    }

    # Step A: Seed initial full report into cache
    upsert_in_memory_report("2026-10", initial_report, action="submit")

    cached_list = cache.get(cache_key)
    assert cached_list is not None
    assert len(cached_list) == 1
    assert cached_list[0]["notification_ids"] == ["A", "B"]
    assert cached_list[0]["hiv_dm_ids"] == ["X"]
    assert cached_list[0]["dbt_ids"] == ["Y"]
    assert cached_list[0]["outcome_assigned_ids"] == ["Z"]

    # Step B: Partial update simulating edit_patient_id mutation
    # (hiv_dm_ids, dbt_ids, outcome_assigned_ids keys are completely absent)
    partial_update = {
        "id": target_id,
        "doc_id": target_id,
        "working_place": "Patna",
        "district": "Patna",
        "fo_name": "Ramesh Kumar",
        "date_of_reporting": "2026-10-04",
        "notification_ids": ["A", "B", "C"],
        "notifications": 3,
        "last_edited_at": "2026-10-04 23:00:00",
        "last_edited_by": "FO"
    }

    upsert_in_memory_report("2026-10", partial_update, action="edit")

    # Step C: Assert that notification_ids updated, and other categories were preserved
    cached_after = cache.get(cache_key)
    assert cached_after is not None
    assert len(cached_after) == 1

    updated_item = cached_after[0]
    assert updated_item["notification_ids"] == ["A", "B", "C"]
    assert updated_item["notifications"] == 3
    assert updated_item["hiv_dm_ids"] == ["X"], "hiv_dm_ids must remain safe and NOT be wiped out!"
    assert updated_item["hiv_dm"] == 1
    assert updated_item["dbt_ids"] == ["Y"], "dbt_ids must remain safe!"
    assert updated_item["dbt"] == 1
    assert updated_item["outcome_assigned_ids"] == ["Z"], "outcome_assigned_ids must remain safe!"
    assert updated_item["outcome_assigned"] == 1
    assert updated_item["total_km"] == 15, "Non-KPI scalar fields must also be preserved"
    assert updated_item["last_edited_by"] == "FO"


def test_cache_merge_explicit_empty_list_and_delete_action():
    """
    Verifies that:
    1. Explicitly sending an empty list (notification_ids=[]) updates the category to []
       (does not remain stuck on the old value).
    2. action='delete' completely removes the item from the cached list.
    """
    cache_key = "shared_raw_month_2026-10"
    target_id = "gaya_suresh_2026-10-04"

    cache.delete(cache_key)
    cache.delete_prefix(f"{cache_key}_")
    cache.set(cache_key, [])

    initial_report = {
        "id": target_id,
        "doc_id": target_id,
        "working_place": "Gaya",
        "fo_name": "Suresh Kumar",
        "date_of_reporting": "2026-10-04",
        "notification_ids": ["A", "B"],
        "notifications": 2,
        "hiv_dm_ids": ["X"]
    }

    upsert_in_memory_report("2026-10", initial_report, action="submit")

    # Clear notification_ids explicitly (e.g. last ID deleted in that category)
    empty_cat_update = {
        "id": target_id,
        "doc_id": target_id,
        "working_place": "Gaya",
        "fo_name": "Suresh Kumar",
        "date_of_reporting": "2026-10-04",
        "notification_ids": [],
        "notifications": 0
    }

    upsert_in_memory_report("2026-10", empty_cat_update, action="edit")

    cached_list = cache.get(cache_key)
    assert cached_list[0]["notification_ids"] == [], "notification_ids must be cleared to empty list"
    assert cached_list[0]["notifications"] == 0
    assert cached_list[0]["hiv_dm_ids"] == ["X"], "Other categories must still be preserved"

    # Now verify action='delete' removes the report completely
    upsert_in_memory_report("2026-10", {"id": target_id, "district": "Gaya"}, action="delete")

    cached_after_del = cache.get(cache_key)
    assert len(cached_after_del) == 0, "Report must be removed when action='delete'"


def test_cache_merge_generic_across_arbitrary_categories():
    """
    Confirms that the shallow merge fix is completely generic and works for ANY category:
    1. Seed cache with full report: notification_ids=['A','B'], hiv_dm_ids=['X'],
       dbt_ids=['Y'], outcome_assigned_ids=['Z'].
    2. Mutate ONLY hiv_dm_ids (e.g. ['X', 'NEW_HIV_ID']), notification_ids is NOT present in payload.
    3. Assert:
       - hiv_dm_ids == ['X', 'NEW_HIV_ID'] (updated)
       - notification_ids == ['A', 'B'] (SAFE)
       - dbt_ids == ['Y'] (SAFE)
       - outcome_assigned_ids == ['Z'] (SAFE)
    """
    cache_key = "shared_raw_month_2026-10"
    target_id = "muzaffarpur_anita_2026-10-04"

    cache.delete(cache_key)
    cache.delete_prefix(f"{cache_key}_")
    cache.set(cache_key, [])

    initial_report = {
        "id": target_id,
        "doc_id": target_id,
        "working_place": "Muzaffarpur",
        "district": "Muzaffarpur",
        "fo_name": "Anita Kumari",
        "date_of_reporting": "2026-10-04",
        "notification_ids": ["A", "B"],
        "notifications": 2,
        "hiv_dm_ids": ["X"],
        "hiv_dm": 1,
        "dbt_ids": ["Y"],
        "dbt": 1,
        "outcome_assigned_ids": ["Z"],
        "outcome_assigned": 1
    }

    upsert_in_memory_report("2026-10", initial_report, action="submit")

    # Partial update: ONLY hiv_dm_ids updated, notifications/dbt/outcome absent
    hiv_partial_update = {
        "id": target_id,
        "doc_id": target_id,
        "working_place": "Muzaffarpur",
        "district": "Muzaffarpur",
        "fo_name": "Anita Kumari",
        "date_of_reporting": "2026-10-04",
        "hiv_dm_ids": ["X", "NEW_HIV_ID"],
        "hiv_dm": 2,
        "last_edited_at": "2026-10-04 23:15:00",
        "last_edited_by": "Anita Kumari"
    }

    upsert_in_memory_report("2026-10", hiv_partial_update, action="edit")

    cached_list = cache.get(cache_key)
    assert cached_list is not None
    assert len(cached_list) == 1

    item = cached_list[0]
    # Assert hiv_dm_ids updated
    assert item["hiv_dm_ids"] == ["X", "NEW_HIV_ID"], "hiv_dm_ids must be updated"
    assert item["hiv_dm"] == 2

    # Assert other categories remain untouched and SAFE
    assert item["notification_ids"] == ["A", "B"], "notification_ids must remain completely safe!"
    assert item["notifications"] == 2
    assert item["dbt_ids"] == ["Y"], "dbt_ids must remain completely safe!"
    assert item["dbt"] == 1
    assert item["outcome_assigned_ids"] == ["Z"], "outcome_assigned_ids must remain completely safe!"
    assert item["outcome_assigned"] == 1

