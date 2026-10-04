import os
import re
import gc
import time
import asyncio
import calendar
from datetime import datetime, timedelta, timezone, date
from typing import Optional, Dict, Any, List, Set

from backend.core.cache import cache, ACTIVE_MONTHLY_CACHE_KEYS
from backend.core.database import db
from backend.core.helpers import (
    get_ist_now,
    format_to_ist_time,
    parse_to_ist_datetime,
    canonicalize_district,
    canonicalize_fo_name,
    get_previous_month,
    load_baseline_staff_directory,
    get_month_date_range
)
from backend.core.supabase import pg_query_table, pg_fetch_one, pg_upsert_row, pg_execute_raw


STAFF_CACHE_KEY_RAW = "staff_directory_raw_records"

async def get_cached_staff_directory_raw(force_refresh: bool = False) -> List[dict]:
    import sys
    main_mod = sys.modules.get("main")
    if main_mod and hasattr(main_mod, "get_cached_staff_directory_raw"):
        custom = getattr(main_mod, "get_cached_staff_directory_raw")
        if custom is not get_cached_staff_directory_raw:
            res = custom(force_refresh=force_refresh)
            if asyncio.iscoroutine(res):
                return await res
            return res
    is_mock = (
        hasattr(db, "mock_calls") 
        or hasattr(db, "_mock_return_value") 
        or type(db).__name__ in ["Mock", "MagicMock", "MockFirestore"]
        or hasattr(db, "store")
        or hasattr(getattr(db, "collection", None), "mock_calls")
        or type(getattr(db, "collection", None)).__name__ in ["Mock", "MagicMock"]
    )

    if not force_refresh and not is_mock:
        cached = cache.get(STAFF_CACHE_KEY_RAW)
        if cached is not None and isinstance(cached, list) and len(cached) > 0:
            return cached

    try:
        # Primary: PostgreSQL via Supabase/psycopg2
        pg_rows = pg_query_table("staff_directory")
        if pg_rows:
            records = []
            for row in pg_rows:
                d = dict(row)
                doc_id = d.get("id") or d.get("doc_id") or f"{d.get('district','')}_{d.get('name','')}".replace(" ", "").lower()
                d["id"] = str(doc_id)
                d["doc_id"] = str(doc_id)
                records.append(d)
            if records and not is_mock:
                cache.set(STAFF_CACHE_KEY_RAW, records, ttl=3600)
            return records

        # Fallback: Firestore stream (dummy no-ops locally)
        docs = await asyncio.to_thread(lambda: list(db.collection("staff_directory").stream()))
        records = []
        for doc in docs:
            if hasattr(doc, "to_dict") and callable(doc.to_dict):
                d = doc.to_dict() or {}
            elif isinstance(doc, dict):
                d = doc
            else:
                d = {}
            doc_id = getattr(doc, "id", None) or d.get("id") or ""
            d["id"] = doc_id
            d["doc_id"] = doc_id
            records.append(d)
        if records and not is_mock:
            cache.set(STAFF_CACHE_KEY_RAW, records, ttl=3600)
        return records
    except Exception as fe:
        print(f"[Staff Cache] Stream failed (quota/network): {fe}")


    # Fallback to existing cached if any
    cached = cache.get(STAFF_CACHE_KEY_RAW)
    if cached is not None and isinstance(cached, list):
        return cached

    # Baseline fallback
    baseline = load_baseline_staff_directory()
    synthetic_records = []
    for dist, names in baseline.items():
        for name in names:
            clean_d = re.sub(r'[^a-zA-Z0-9]', '', dist).lower()
            clean_n = re.sub(r'[^a-zA-Z0-9]', '', name).lower()
            synthetic_records.append({
                "id": f"{clean_d}_{clean_n}",
                "district": dist,
                "name": name,
                "is_active": True,
                "status": "active",
                "designation": "Field Officer",
                "target": 50
            })
    return synthetic_records

def invalidate_staff_directory_cache():
    """Busts all staff directory in-memory caches upon staff create/update/delete."""
    cache.delete(STAFF_CACHE_KEY_RAW)
    cache.delete("staff_directory_list")
    cache.delete("staff_directory_dict")
    cache.delete("staff_directory_map")
    cache.delete("inactive_staff_keys")
    cache.delete_prefix("admin_staff_full_list")
    cache.delete_prefix("staff_targets_raw_")

async def get_cached_staff_targets_for_month(month: str) -> List[dict]:
    import sys
    main_mod = sys.modules.get("main")
    if main_mod and hasattr(main_mod, "get_cached_staff_targets_for_month"):
        custom = getattr(main_mod, "get_cached_staff_targets_for_month")
        if custom is not get_cached_staff_targets_for_month:
            res = custom(month)
            if asyncio.iscoroutine(res):
                return await res
            return res
    is_mock = (
        hasattr(db, "mock_calls") 
        or hasattr(db, "_mock_return_value") 
        or type(db).__name__ in ["Mock", "MagicMock", "MockFirestore"]
        or hasattr(db, "store")
        or hasattr(getattr(db, "collection", None), "mock_calls")
        or type(getattr(db, "collection", None)).__name__ in ["Mock", "MagicMock"]
    )
    clean_month = month.strip() if month else get_ist_now().strftime("%Y-%m")
    cache_key = f"staff_targets_raw_{clean_month}"
    if not is_mock:
        cached = cache.get(cache_key)
        if cached is not None and isinstance(cached, list):
            return cached

    try:
        prev_month = get_previous_month(clean_month)

        # Primary: PostgreSQL via Supabase/psycopg2 with staff_directory JOIN
        m_dates = [f"{clean_month}-01"]
        if prev_month:
            m_dates.append(f"{prev_month}-01")

        join_sql = """
            SELECT st.id, st.month, st.target, s.name as fo_name, s.district, s.pin, st.legacy_doc_id
            FROM staff_targets st
            LEFT JOIN staff_directory s ON st.staff_id = s.id
            WHERE st.month::text = ANY(%s)
        """
        combined_pg = []
        try:
            combined_pg = pg_execute_raw(join_sql, [m_dates], fetch=True)
        except Exception:
            pass

        if not combined_pg:
            # Fallback for mock store or flat schema
            pg_rows = pg_query_table("staff_targets", filters={"month": clean_month})
            prev_pg_rows = pg_query_table("staff_targets", filters={"month": prev_month}) if prev_month else []
            combined_pg = (pg_rows or []) + (prev_pg_rows or [])
            if not combined_pg:
                combined_pg = pg_query_table("staff_targets") or []

        if combined_pg:
            target_records = []
            for r in combined_pg:
                d = dict(r)
                if hasattr(d.get("month"), "strftime"):
                    d["month"] = d["month"].strftime("%Y-%m")
                target_records.append(d)
            cache.set(cache_key, target_records, ttl=600)
            return target_records

        # Fallback: Firestore (dummy no-ops locally)
        month_docs = await asyncio.to_thread(lambda: list(
            db.collection("staff_targets").where("month", "==", clean_month).stream()
        ))
        prev_docs = []
        if prev_month:
            prev_docs = await asyncio.to_thread(lambda: list(
                db.collection("staff_targets").where("month", "==", prev_month).stream()
            ))

        target_records = []
        for doc in month_docs:
            d = doc.to_dict() if hasattr(doc, "to_dict") and callable(doc.to_dict) and doc.to_dict() else (doc if isinstance(doc, dict) else {})
            if d:
                target_records.append(d)

        for doc in prev_docs:
            d = doc.to_dict() if hasattr(doc, "to_dict") and callable(doc.to_dict) and doc.to_dict() else (doc if isinstance(doc, dict) else {})
            if d:
                target_records.append(d)

        if not target_records:
            all_docs = await asyncio.to_thread(lambda: list(db.collection("staff_targets").stream()))
            for doc in all_docs:
                d = doc.to_dict() if hasattr(doc, "to_dict") and callable(doc.to_dict) and doc.to_dict() else (doc if isinstance(doc, dict) else {})
                if d:
                    target_records.append(d)

        cache.set(cache_key, target_records, ttl=600)
        return target_records
    except Exception as e:
        print(f"[Staff Targets Cache] Query notice: {e}")
        return []


LAST_REPORTS_MODIFIED_TS: float = time.time()
DELETED_REPORTS_TOMBSTONES: List[Dict[str, Any]] = []

def get_last_mutation_str() -> str:
    dt = datetime.fromtimestamp(LAST_REPORTS_MODIFIED_TS, timezone(timedelta(hours=5, minutes=30)))
    return dt.strftime("%Y-%m-%d %H:%M:%S")

def _upsert_into_cached_list(cache_key: str, target_id: str, report_data: dict, action: str):
    cached_list = cache.get(cache_key)
    if not isinstance(cached_list, list):
        return
    idx = -1
    for i, item in enumerate(cached_list):
        if (item.get("id") or item.get("doc_id")) == target_id:
            idx = i
            break
    if action == "delete":
        if idx != -1:
            cached_list.pop(idx)
    elif idx != -1:
        # Shallow merge: naye report_data ke jo bhi keys hain wo override 
        # karengi, jo keys report_data mein MAUJOOD NAHI hain unki purani 
        # value cache mein SAFE rahegi. Isse partial/incomplete report_data 
        # (jaisa edit_patient_id se aata hai - sirf 1 category ke saath) 
        # poori cached report ko corrupt nahi karega.
        merged = dict(cached_list[idx])
        merged.update(report_data)
        cached_list[idx] = merged
    else:
        cached_list.append(report_data)
    cache.set(cache_key, cached_list, ttl=3600)

def upsert_in_memory_report(
    month_prefix: str, 
    report_data: dict, 
    action: str = "submit",
    old_district: str = ""
):
    """
    In-place upsert/deletion of a single report within shared monthly caches.
    Prevents cache eviction cascades on daily report submissions and edits.
    Synchronizes both statewide cache and district-partitioned caches (for Sub-Admins).
    """
    if not month_prefix or not report_data or not isinstance(report_data, dict):
        return

    target_id = report_data.get("id") or report_data.get("doc_id")
    if not target_id:
        c_wp = canonicalize_district(report_data.get("working_place", "") or report_data.get("district", ""))
        fo = str(report_data.get("fo_name", "")).strip()
        dt = str(report_data.get("date_of_reporting", "") or report_data.get("date", "")).strip()
        if c_wp and fo and dt:
            target_id = f"{c_wp}_{fo}_{dt}".replace(" ", "_").lower()

    if not target_id:
        return

    # Ensure consistent keys
    if "id" not in report_data:
        report_data["id"] = target_id
    if "doc_id" not in report_data:
        report_data["doc_id"] = target_id

    # 1. Update statewide shared monthly cache
    _upsert_into_cached_list(f"shared_raw_month_{month_prefix}", target_id, report_data, action)

    # 2. Update any district-partitioned shared monthly caches (for Sub-Admins)
    c_wp = canonicalize_district(report_data.get("working_place", "") or report_data.get("district", ""))
    wp_tag = c_wp.replace(" ", "_").lower() if c_wp else ""
    old_wp = canonicalize_district(old_district) if old_district else ""
    old_wp_tag = old_wp.replace(" ", "_").lower() if old_wp else ""

    dist_cache_keys = cache.get_keys_with_prefix(f"shared_raw_month_{month_prefix}_")

    for k in dist_cache_keys:
        if wp_tag and wp_tag in k:
            _upsert_into_cached_list(k, target_id, report_data, action)
        elif old_wp_tag and old_wp_tag in k and old_wp_tag != wp_tag:
            _upsert_into_cached_list(k, target_id, report_data, action="delete")

def record_report_mutation(
    action: str = "submit", 
    doc_id: str = "", 
    district: str = "", 
    date: str = "", 
    old_district: str = "",
    report_data: Optional[Dict[str, Any]] = None
):
    global LAST_REPORTS_MODIFIED_TS
    LAST_REPORTS_MODIFIED_TS = time.time()
    try:
        clean_dist = canonicalize_district(district) if district else ""
        clean_old_dist = canonicalize_district(old_district) if old_district else ""
        
        target_districts = set()
        if clean_dist:
            target_districts.add(clean_dist)
            target_districts.add(clean_dist.lower())
            target_districts.add(clean_dist.title())
        if clean_old_dist:
            target_districts.add(clean_old_dist)
            target_districts.add(clean_old_dist.lower())
            target_districts.add(clean_old_dist.title())

        # 1. District Notification Registry (Scoped strictly by District)
        if target_districts:
            for td in target_districts:
                cache.delete_prefix(f"dist_notif_registry_{td}_")
        else:
            cache.delete_prefix("dist_notif_registry_")

        # 2. Monthly Shared Cache (Anti-Wipe In-Place Upsert)
        month_prefix = ""
        if date and len(str(date).strip()) >= 7:
            month_prefix = str(date).strip()[:7]
            
        if month_prefix and report_data and isinstance(report_data, dict):
            upsert_in_memory_report(month_prefix, report_data, action=action, old_district=clean_old_dist)
            cache.delete_prefix(f"dash_{month_prefix}_")
            cache.delete_prefix(f"dupe_scan_{month_prefix}")
        elif month_prefix and action == "delete" and doc_id:
            upsert_in_memory_report(month_prefix, {"id": doc_id, "district": clean_dist}, action="delete")
            cache.delete_prefix(f"dash_{month_prefix}_")
            cache.delete_prefix(f"dupe_scan_{month_prefix}")
        elif month_prefix:
            cache.delete_prefix(f"shared_raw_month_{month_prefix}")
            cache.delete_prefix(f"dash_{month_prefix}_")
            cache.delete_prefix(f"dupe_scan_{month_prefix}")
        else:
            cache.delete_prefix("shared_raw_month_")
            cache.delete_prefix("dash_")
            cache.delete_prefix("dupe_scan_")
            
        # 3. Targeted Attendance Radar Invalidation
        if date and len(str(date).strip()) >= 10:
            clean_date = str(date).strip()[:10]
            cache.delete_prefix(f"attendance_{clean_date}")
        elif date and len(str(date).strip()) >= 7:
            clean_date = str(date).strip()[:7]
            cache.delete_prefix(f"attendance_{clean_date}")
        else:
            cache.delete_prefix("attendance_")

        # 4. Cascade Alerts (Scoped by District)
        if target_districts:
            for td in target_districts:
                cache.delete_prefix(f"cascade_alerts_{td}_")
        else:
            cache.delete_prefix("cascade_alerts_")

        # 5. Top Performers Cache Invalidation
        if month_prefix:
            cache.delete_prefix(f"statewide_top_performers_{month_prefix}_")
            cache.delete_prefix("statewide_top_performers_")
            cache.delete_prefix(f"statewide_top_{month_prefix}")
            cache.delete_prefix("statewide_top_")

        # 6. Duplicate Audit Cache (Scoped by Month)
        if month_prefix:
            cache.delete_prefix(f"dupe_audit_{month_prefix}")
        else:
            cache.delete_prefix("dupe_audit_")

        # 7. Append deletion tombstone for Delta Sync
        if action == "delete" and doc_id:
            DELETED_REPORTS_TOMBSTONES.append({
                "doc_id": str(doc_id).strip(),
                "id": str(doc_id).strip(),
                "district": clean_dist,
                "deleted_at": get_ist_now().strftime("%Y-%m-%d %H:%M:%S")
            })
            if len(DELETED_REPORTS_TOMBSTONES) > 500:
                DELETED_REPORTS_TOMBSTONES.pop(0)
    except Exception as e:
        print(f"[Mutation Tracking Notice] Non-fatal cache tracking issue: {e}")

async def get_raw_monthly_reports(
    month_prefix: str, 
    force: bool = False, 
    district_filter: Optional[Set[str]] = None
) -> list:
    import sys
    main_mod = sys.modules.get("main")
    if main_mod and hasattr(main_mod, "get_raw_monthly_reports"):
        custom = getattr(main_mod, "get_raw_monthly_reports")
        if custom is not get_raw_monthly_reports:
            if not force and district_filter is None:
                res = custom(month_prefix)
            else:
                try:
                    res = custom(month_prefix, force=force, district_filter=district_filter)
                except TypeError:
                    res = custom(month_prefix)
            if asyncio.iscoroutine(res):
                return await res
            return res
    """
    Shared in-memory cache for monthly daily_field_reports.
    Avoids redundant 2,000-read collection streams when /admin/dashboard-data,
    /admin/duplicate-audit, and pacing queries run concurrently.
    Queries Firestore by monthly date range and performs in-memory canonical district filtering.
    """
    clean_dists = set()
    if district_filter:
        clean_dists = {canonicalize_district(d) for d in district_filter if d and str(d).strip().lower() != "all"}

    full_cache_key = f"shared_raw_month_{month_prefix}"
    dist_cache_key = full_cache_key
    if clean_dists:
        dist_cache_key = f"{full_cache_key}_{'_'.join(sorted(clean_dists)).replace(' ', '_').lower()}"

    # 1. Check if statewide full cache is in memory
    if not force:
        cached_full = cache.get(full_cache_key)
        if cached_full is not None and isinstance(cached_full, list):
            # LRU update: promote accessed month to most-recently-used
            if full_cache_key in ACTIVE_MONTHLY_CACHE_KEYS:
                ACTIVE_MONTHLY_CACHE_KEYS.remove(full_cache_key)
            ACTIVE_MONTHLY_CACHE_KEYS.append(full_cache_key)
            if len(ACTIVE_MONTHLY_CACHE_KEYS) > 2:
                evicted_key = ACTIVE_MONTHLY_CACHE_KEYS.pop(0)
                cache.delete(evicted_key)
                cache.delete_prefix(f"{evicted_key}_")
                gc.collect()

            if clean_dists:
                return [d for d in cached_full if canonicalize_district(d.get("working_place") or d.get("district", "")) in clean_dists]
            return cached_full

        # 2. Check if district-scoped cache is in memory
        if clean_dists:
            cached_dist = cache.get(dist_cache_key)
            if cached_dist is not None and isinstance(cached_dist, list):
                return cached_dist

    start_date, end_date = get_month_date_range(month_prefix)

    # 3. Try PostgreSQL primary source first
    raw_list = []
    try:
        where_clause = "WHERE r.date_of_reporting >= %s AND r.date_of_reporting <= %s"
        pg_params = [start_date, end_date]
        if clean_dists:
            where_clause += " AND (LOWER(TRIM(r.working_place)) = ANY(%s) OR r.district_id::text = ANY(%s))"
            dists_param = list({str(d).lower() for d in clean_dists} | {str(d) for d in clean_dists})
            pg_params.extend([dists_param, dists_param])

        hydrated_sql = f"""
            WITH target_reports AS (
                SELECT r.* FROM daily_field_reports r
                {where_clause}
            ),
            kpi_agg AS (
                SELECT 
                    report_id, 
                    json_object_agg(category, ids) as kpi_data
                FROM (
                    SELECT report_id, category, json_agg(patient_id) as ids
                    FROM report_kpi_entries
                    WHERE report_id IN (SELECT id FROM target_reports)
                    GROUP BY report_id, category
                ) cat_grouped
                GROUP BY report_id
            ),
            fdc_agg AS (
                SELECT 
                    report_id,
                    json_agg(json_build_object(
                        'patient_id', patient_id,
                        'fdc_type', fdc_type,
                        'regimen_name', regimen_name,
                        'phase', phase,
                        'daily_dose_text', daily_dose_text,
                        'patient_name', patient_name,
                        'patient_type', patient_type,
                        'weight_kg', weight_kg,
                        'weight_band', weight_band,
                        'daily_tablets', daily_tablets,
                        'strips', strips,
                        'recommended_strips', recommended_strips,
                        'supply_issued', supply_issued
                    ) ORDER BY position) as fdc_data
                FROM report_fdc_details
                WHERE report_id IN (SELECT id FROM target_reports)
                GROUP BY report_id
            ),
            names_agg AS (
                SELECT 
                    report_id,
                    json_agg(name ORDER BY position) as names_data
                FROM report_visited_names
                WHERE report_id IN (SELECT id FROM target_reports)
                GROUP BY report_id
            )
            SELECT 
                r.*,
                COALESCE(k.kpi_data, '{{}}'::json) as _kpi_json,
                COALESCE(f.fdc_data, '[]'::json) as _fdc_json,
                COALESCE(v.names_data, '[]'::json) as _visited_names_json
            FROM target_reports r
            LEFT JOIN kpi_agg k ON r.id = k.report_id
            LEFT JOIN fdc_agg f ON r.id = f.report_id
            LEFT JOIN names_agg v ON r.id = v.report_id
        """

        pg_rows = []
        try:
            pg_rows = pg_execute_raw(hydrated_sql, pg_params, fetch=True)
        except Exception:
            pass

        if not pg_rows:
            # Flat query fallback for mock store or simplified schema
            flat_sql = "SELECT * FROM daily_field_reports WHERE date_of_reporting >= %s AND date_of_reporting <= %s"
            flat_params = [start_date, end_date]
            if clean_dists:
                flat_sql += " AND (LOWER(TRIM(working_place)) = ANY(%s) OR district_id::text = ANY(%s))"
                flat_params.extend([dists_param, dists_param])
            pg_rows = pg_execute_raw(
                flat_sql,
                flat_params,
                fetch=True
            )

        if pg_rows:
            for row in pg_rows:
                item = dict(row)
                kpi_map = item.pop("_kpi_json", {}) or {}
                fdc_list = item.pop("_fdc_json", []) or []
                names_list = item.pop("_visited_names_json", []) or []

                if hasattr(item.get("date_of_reporting"), "strftime"):
                    item["date_of_reporting"] = item["date_of_reporting"].strftime("%Y-%m-%d")

                did = item.get("id") or item.get("doc_id")
                if not did or isinstance(did, int):
                    c_wp = canonicalize_district(item.get("working_place", "") or item.get("district", ""))
                    fo = str(item.get("fo_name", "")).strip()
                    dt = str(item.get("date_of_reporting", "")).strip()
                    did = f"{c_wp}_{fo}_{dt}".replace(" ", "_").lower()
                item["id"] = did
                item.setdefault("doc_id", did)

                # Deserialize JSON columns or hydrate from child table kpi_map
                for list_field in (
                    "notification_ids", "hiv_dm_ids", "dbt_ids", "sample_collection_ids",
                    "sample_tested_ids", "outcome_assigned_ids", "home_visit_ids",
                    "contact_tracing_ids", "follow_up_ids", "face_to_face_ids",
                    "presumptive_ids", "fdc_provided_ids", "differentiated_tb_ids",
                    "tpt_treatment_start_ids", "tpt_presumptive_ids",
                    "adhar_face_authentication_ids", "consent_with_id_ids",
                    "culture_dst_ids", "kit_consumption_ids", "documents_ids"
                ):
                    if list_field in kpi_map:
                        item[list_field] = kpi_map[list_field]
                    else:
                        val = item.get(list_field)
                        if isinstance(val, str):
                            try:
                                import json as _json
                                item[list_field] = _json.loads(val)
                            except Exception:
                                item[list_field] = []
                        elif not isinstance(val, list):
                            item[list_field] = []

                item["fdc_details"] = fdc_list if fdc_list else (item.get("fdc_details") or [])
                item["visited_names"] = names_list if names_list else (item.get("visited_names") or [])
                raw_list.append(item)
    except Exception as pge:
        print(f"[get_raw_monthly_reports] PG query notice: {pge}")

    # 3b. Fallback: Firestore stream if PG returned nothing (dummy no-ops locally)
    if not raw_list:
        try:
            docs = await asyncio.to_thread(lambda: list(
                db.collection("daily_field_reports")
                .where("date_of_reporting", ">=", start_date)
                .where("date_of_reporting", "<=", end_date)
                .stream()
            ))
            for d in docs:
                item = d.to_dict() if hasattr(d, "to_dict") else dict(d)
                did = getattr(d, "id", None) or item.get("id") or item.get("doc_id")
                if not did:
                    c_wp = canonicalize_district(item.get("working_place", "") or item.get("district", ""))
                    fo = str(item.get("fo_name", "")).strip()
                    dt = str(item.get("date_of_reporting", "")).strip()
                    did = f"{c_wp}_{fo}_{dt}".replace(" ", "_").lower()
                if "id" not in item:
                    item["id"] = did
                if "doc_id" not in item:
                    item["doc_id"] = did
                raw_list.append(item)
        except Exception as fe:
            print(f"[get_raw_monthly_reports] Firestore fallback notice: {fe}")


    if clean_dists:
        filtered_list = [d for d in raw_list if canonicalize_district(d.get("working_place") or d.get("district", "")) in clean_dists]
        if dist_cache_key != full_cache_key:
            cache.set(dist_cache_key, filtered_list, ttl=3600)
        return filtered_list

    # Save statewide monthly cache
    cache.set(full_cache_key, raw_list, ttl=3600) # 1-hour shared cache

    # Enforce LRU 2-Month Bound & RAM Watchdog
    if full_cache_key in ACTIVE_MONTHLY_CACHE_KEYS:
        ACTIVE_MONTHLY_CACHE_KEYS.remove(full_cache_key)
    ACTIVE_MONTHLY_CACHE_KEYS.append(full_cache_key)
    if len(ACTIVE_MONTHLY_CACHE_KEYS) > 2:
        evicted_key = ACTIVE_MONTHLY_CACHE_KEYS.pop(0)
        cache.delete(evicted_key)
        cache.delete_prefix(f"{evicted_key}_")
        gc.collect()

    return raw_list

def format_dashboard_record(data: dict, allowed_dist_set: Optional[set] = None) -> Optional[dict]:
    if not isinstance(data, dict):
        return None
    wp = data.get("working_place", "Unknown") or data.get("district", "Unknown")
    c_wp = canonicalize_district(wp)
    if allowed_dist_set and c_wp not in allowed_dist_set:
        return None

    fo = str(data.get("fo_name", "Unknown")).strip()
    dt = str(data.get("date_of_reporting", "") or data.get("date", "")).strip()
    did = data.get("id") or data.get("doc_id")
    if not did:
        did = f"{c_wp}_{fo}_{dt}".replace(" ", "_").lower()

    raw_ts = data.get("timestamp_completed") or data.get("timestamp") or data.get("submitted_at")
    submitted_time = format_to_ist_time(raw_ts)
    dt_ist = parse_to_ist_datetime(raw_ts)
    if dt_ist:
        iso_ts = dt_ist.isoformat()
    elif hasattr(raw_ts, 'isoformat'):
        iso_ts = raw_ts.isoformat()
    else:
        iso_ts = str(raw_ts) if raw_ts else ""
    is_next_day = bool(data.get("is_next_day_submission"))
    raw_m = data.get("submitted_morning_time")
    morning_time = format_to_ist_time(raw_m) if raw_m else ""
    morning_label = data.get("morning_submission_label") or (f"Next day morning {morning_time or submitted_time}" if is_next_day else "")
    total_ids = sum(len(v) for k, v in data.items() if isinstance(v, list) and k.endswith("_ids"))

    return {
        "id": did,
        "doc_id": did,
        "date": dt,
        "date_of_reporting": dt,
        "working_place": c_wp,
        "fo_name": canonicalize_fo_name(fo, c_wp),
        
        # Timestamps & Radar Submission Metadata
        "timestamp_completed": iso_ts,
        "timestamp_raw": iso_ts,
        "submitted_time": submitted_time,
        "total_ids": total_ids,
        "is_next_day_submission": is_next_day,
        "submitted_morning_time": morning_time,
        "morning_submission_label": morning_label,
        
        # Big 5
        "total_km": data.get("total_km", 0) or 0,
        "notifications": len(data.get("notification_ids", [])),
        "tests": len(data.get("sample_tested_ids", [])),
        "presumptive": len(data.get("presumptive_ids", [])),
        "doctor_visits": len(data.get("visited_names", [])),
        
        # Group 1
        "hiv_dm": len(data.get("hiv_dm_ids", [])),
        "dbt": len(data.get("dbt_ids", [])),
        
        # Group 2
        "sample_collection": len(data.get("sample_collection_ids", [])),
        "outcome_assigned": len(data.get("outcome_assigned_ids", [])),
        
        # Group 3 (with singular aliases for backward compatibility)
        "home_visits": len(data.get("home_visit_ids", [])),
        "home_visit": len(data.get("home_visit_ids", [])),
        "contact_tracing": len(data.get("contact_tracing_ids", [])),
        "follow_ups": len(data.get("follow_up_ids", [])),
        "follow_up": len(data.get("follow_up_ids", [])),
        "face_to_face": len(data.get("face_to_face_ids", [])),
        
        # Group 4
        "documents": len(data.get("documents_ids", [])),
        "fdc_provided": len(data.get("fdc_provided_ids", [])),
        "fdc_details": data.get("fdc_details", []),
        "kit_consumption": len(data.get("kit_consumption_ids", [])),
        
        # Group 5 (New Fields & Special)
        "differentiated_tb": len(data.get("differentiated_tb_ids", [])),
        "tpt_treatment_start": len(data.get("tpt_treatment_start_ids", [])),
        "tpt_presumptive": len(data.get("tpt_presumptive_ids", [])),
        "adhar_face_auth": len(data.get("adhar_face_authentication_ids", [])),
        "adhar_face_authentication": len(data.get("adhar_face_authentication_ids", [])),
        "consent_with_id": len(data.get("consent_with_id_ids", [])),
        "culture_dst": len(data.get("culture_dst_ids", [])),
        
        # Raw ID Lists for FO Drill-Down Inspector & Cohort Engine
        "notification_ids": data.get("notification_ids", []),
        "hiv_dm_ids": data.get("hiv_dm_ids", []),
        "dbt_ids": data.get("dbt_ids", []),
        "sample_collection_ids": data.get("sample_collection_ids", []),
        "sample_tested_ids": data.get("sample_tested_ids", []),
        "outcome_assigned_ids": data.get("outcome_assigned_ids", []),
        "home_visit_ids": data.get("home_visit_ids", []),
        "contact_tracing_ids": data.get("contact_tracing_ids", []),
        "follow_up_ids": data.get("follow_up_ids", []),
        "face_to_face_ids": data.get("face_to_face_ids", []),
        "presumptive_ids": data.get("presumptive_ids", []),
        "documents_ids": data.get("documents_ids", []),
        "fdc_provided_ids": data.get("fdc_provided_ids", []),
        "kit_consumption_ids": data.get("kit_consumption_ids", []),
        "differentiated_tb_ids": data.get("differentiated_tb_ids", []),
        "tpt_treatment_start_ids": data.get("tpt_treatment_start_ids", []),
        "tpt_presumptive_ids": data.get("tpt_presumptive_ids", []),
        "adhar_face_authentication_ids": data.get("adhar_face_authentication_ids", []),
        "consent_with_id_ids": data.get("consent_with_id_ids", []),
        "culture_dst_ids": data.get("culture_dst_ids", []),
        "visited_names": data.get("visited_names", []),
        
        # Remarks & Flags
        "remark": data.get("remark", ""),
        "admin_remark": data.get("admin_remark", ""),
        "admin_remark_by": data.get("admin_remark_by", ""),
        "submission_count": data.get("submission_count", 1),
        "is_override": bool(data.get("is_override_used")),
        "is_override_used": bool(data.get("is_override_used"))
    }

def is_exempt_day(d: date, daily_history: dict) -> bool:
    """
    Checks if a calendar date is exempt from mandatory reporting.
    Exempt days:
    - Sundays (weekly off in standard health administration, d.weekday() == 6)
    - Approved staff leaves (Casual, Medical, Official Duty, Declared Holiday, or is_leave == True)
    """
    if d.weekday() == 6:
        return True
    d_str = d.strftime("%Y-%m-%d")
    record = daily_history.get(d_str)
    if not isinstance(record, dict):
        return False
    if record.get("is_leave") is True or bool(record.get("is_leave")):
        return True
    status = str(record.get("status", "")).strip().lower()
    if status in ("leave", "holiday", "declared holiday", "casual", "medical", "official duty"):
        return True
    reason = str(record.get("reason_type", "")).strip().lower()
    if reason in ("leave", "holiday", "declared holiday", "casual", "medical", "official duty"):
        return True
    return False

def calculate_reporting_streak(daily_history: dict, today: Optional[date] = None) -> int:
    """
    Calculates consecutive reporting streak in days.
    Preserves streak across Sundays (weekly off), approved leaves, and declared holidays.
    """
    if today is None:
        today = get_ist_now().date()

    today_str = today.strftime("%Y-%m-%d")
    today_submitted = bool((daily_history.get(today_str) or {}).get("submitted"))

    check_date = today if today_submitted else (today - timedelta(days=1))

    streak_days = 0
    days_checked = 0
    max_days = 60

    while days_checked < max_days:
        days_checked += 1
        d_str = check_date.strftime("%Y-%m-%d")
        record = daily_history.get(d_str) or {}
        is_submitted = bool(record.get("submitted"))

        if is_submitted:
            streak_days += 1
            check_date -= timedelta(days=1)
        elif is_exempt_day(check_date, daily_history):
            check_date -= timedelta(days=1)
        else:
            break

    return streak_days

async def compute_profile_response(
    reports: List[dict],
    target_val: int,
    req_month: str,
    c_wp: str,
    clean_fo: str
) -> dict:
    stats = {
        "notification": 0,
        "hiv_dm": 0,
        "dbt": 0,
        "sample_collection": 0,
        "sample_tested": 0,
        "outcome_assigned": 0,
        "home_visit": 0,
        "contact_tracing": 0,
        "follow_up": 0,
        "face_to_face": 0,
        "presumptive": 0,
        "fdc_provided": 0,
        "kit_consumption": 0,
        "differentiated_tb": 0,
        "tpt_treatment_start": 0,
        "tpt_presumptive": 0,
        "adhar_face_authentication": 0,
        "consent_with_id": 0,
        "culture_dst": 0
    }
    
    daily_history = {}
    for rep in reports:
        data = rep.to_dict() if hasattr(rep, "to_dict") else rep
        date_str = str(data.get("date_of_reporting") or data.get("date") or "").strip()
        if date_str and date_str.startswith(req_month):
            day_total = 0
            for k in stats.keys():
                arr = data.get(k + "_ids", [])
                if isinstance(arr, list):
                    stats[k] += len(arr)
                    day_total += len(arr)
            day_categories = {}
            for k in stats.keys():
                arr = data.get(k + "_ids", [])
                if isinstance(arr, list) and len(arr) > 0:
                    day_categories[k] = arr
                    
            daily_history[date_str] = {
                "submitted": True,
                "count": data.get("submission_count", 1),
                "total_ids": day_total,
                "categories": day_categories,
                "visited_names": data.get("visited_names", []),
                "total_km": data.get("total_km", 0),
                "remark": data.get("remark", ""),
                "fdc_details": data.get("fdc_details", []),
                "admin_remark": data.get("admin_remark") or "",
                "admin_remark_by": data.get("admin_remark_by") or ""
            }
                    
    total_achieved = sum(stats.values())

    # Hydrate leave records from daily_staff_leaves with in-memory caching
    leave_cache_key = f"daily_leaves_{c_wp}_{req_month}"
    cached_leaves = cache.get(leave_cache_key)
    if cached_leaves is not None and isinstance(cached_leaves, list):
        leave_records = cached_leaves
    else:
        start_date, end_date = get_month_date_range(req_month)
        try:
            leave_rows = pg_execute_raw(
                "SELECT * FROM daily_staff_leaves WHERE district = %s AND date >= %s AND date <= %s",
                [c_wp, start_date, end_date],
                fetch=True
            ) or []
            leave_records = [dict(r) for r in leave_rows]
        except Exception as l_err:
            print(f"Notice: Failed to query daily_staff_leaves from PG: {l_err}")
            leave_records = []

        cache.set(leave_cache_key, leave_records, ttl=1800)


    for l_data in leave_records:
        if not isinstance(l_data, dict):
            continue
        l_fo = re.sub(r'[^a-zA-Z0-9]', '', str(l_data.get("fo_name", ""))).lower()
        doc_id = str(l_data.get("id", ""))
        if l_fo != clean_fo and not (doc_id and doc_id.endswith(f"_{clean_fo}")):
            continue

        l_date = str(l_data.get("date", "")).strip()
        if l_date and l_date.startswith(req_month):
            leave_remark = l_data.get("remark") or l_data.get("admin_remark") or ""
            leave_marked_by = l_data.get("marked_by_name") or "Admin"
            is_actual_leave = bool(l_data.get("is_override") or not l_data.get("is_inspection_remark"))
            if l_date not in daily_history:
                daily_history[l_date] = {
                    "submitted": False,
                    "count": 0,
                    "total_ids": 0,
                    "categories": {},
                    "is_leave": is_actual_leave,
                    "status": l_data.get("status", "leave") if is_actual_leave else "unsubmitted",
                    "reason_type": l_data.get("reason_type", "Casual") if is_actual_leave else "",
                    "remark": l_data.get("remark", ""),
                    "admin_remark": leave_remark,
                    "marked_by": leave_marked_by,
                    "admin_remark_by": leave_marked_by,
                    "marked_at": l_data.get("marked_at", "")
                }
            else:
                if leave_remark:
                    daily_history[l_date]["admin_remark"] = leave_remark
                if leave_marked_by:
                    daily_history[l_date]["admin_remark_by"] = leave_marked_by
                if l_data.get("is_override") and not l_data.get("is_inspection_remark"):
                    daily_history[l_date]["is_leave"] = True
                    daily_history[l_date]["status"] = l_data.get("status", "leave")
                    daily_history[l_date]["reason_type"] = l_data.get("reason_type", "Casual")
                    daily_history[l_date]["leave_info"] = {
                        "status": l_data.get("status", "leave"),
                        "reason_type": l_data.get("reason_type", "Casual"),
                        "remark": l_data.get("remark", ""),
                        "marked_by": leave_marked_by
                    }
                elif l_data.get("is_inspection_remark"):
                    daily_history[l_date]["is_leave"] = False
                    if "leave_info" in daily_history[l_date]:
                        del daily_history[l_date]["leave_info"]
                elif not l_data.get("is_inspection_remark"):
                    daily_history[l_date]["is_leave"] = True
                    daily_history[l_date]["leave_info"] = {
                        "status": l_data.get("status", "leave"),
                        "reason_type": l_data.get("reason_type", "Casual"),
                        "remark": l_data.get("remark", ""),
                        "marked_by": leave_marked_by
                    }
    
    # Calculate Reporting Streak
    streak_days = calculate_reporting_streak(daily_history, today=get_ist_now().date())
    total_km_month = sum(d.get("total_km", 0) for d in daily_history.values())
    
    badges = []
    if stats.get("notification", 0) >= 100:
        badges.append({"id": "century", "title": "Century Club", "icon": "🏅", "desc": "100+ Notifications logged"})
    if target_val > 0 and stats.get("notification", 0) >= target_val:
        badges.append({"id": "crusher", "title": "Target Crusher", "icon": "🎯", "desc": "100% Monthly Target reached"})
    if total_km_month >= 300:
        badges.append({"id": "warrior", "title": "Road Warrior", "icon": "🛵", "desc": "300+ KM logged this month"})
    if streak_days >= 5:
        badges.append({"id": "streak", "title": "Streak Master", "icon": "🔥", "desc": f"{streak_days} days continuous reporting"})
    
    # Pacing and Holidays
    declared_holidays = 1
    try:
        p_cache_key = f"pacing_settings_{req_month}_{c_wp}"
        cached_pacing = cache.get(p_cache_key)
        if cached_pacing and isinstance(cached_pacing, dict):
            declared_holidays = int(cached_pacing.get("declared_holidays", 1))
        else:
            dist_doc_id = f"{req_month}_{c_wp}"
            doc_snap = pg_fetch_one("pacing_settings", filters={"id": dist_doc_id})
            if doc_snap:
                declared_holidays = int(doc_snap.get("declared_holidays", 1))
                cache.set(p_cache_key, {"declared_holidays": declared_holidays, "district": c_wp, "month": req_month}, ttl=1800)
            else:
                state_doc_snap = pg_fetch_one("pacing_settings", filters={"id": req_month})
                if state_doc_snap:
                    declared_holidays = int(state_doc_snap.get("declared_holidays", 1))
                else:
                    declared_holidays = 1
                cache.set(p_cache_key, {"declared_holidays": declared_holidays, "district": "all", "month": req_month}, ttl=1800)

    except Exception as p_err:
        print(f"Notice: Failed to fetch pacing settings for {req_month} {c_wp}: {p_err}")
        declared_holidays = 1

    try:
        y_str, m_str = req_month.split("-")
        year_val, month_val = int(y_str), int(m_str)
        _, total_days = calendar.monthrange(year_val, month_val)
    except Exception:
        now_d = get_ist_now().date()
        year_val, month_val = now_d.year, now_d.month
        _, total_days = calendar.monthrange(year_val, month_val)

    ist_today = get_ist_now().date()
    today_month_str = ist_today.strftime("%Y-%m")
    if req_month == today_month_str:
        day_of_month = ist_today.day
    elif req_month < today_month_str:
        day_of_month = total_days
    else:
        day_of_month = 0

    sundays_in_month = 0
    elapsed_sundays = 0
    for d_idx in range(1, total_days + 1):
        dt_cur = datetime(year_val, month_val, d_idx).date()
        if dt_cur.weekday() == 6:  # Sunday
            sundays_in_month += 1
            if d_idx <= day_of_month:
                elapsed_sundays += 1

    total_working_days = max(1, total_days - sundays_in_month - declared_holidays)
    if req_month < today_month_str:
        elapsed_working_days = total_working_days
        remaining_working_days = 0
    elif req_month > today_month_str:
        elapsed_working_days = 0
        remaining_working_days = total_working_days
    else:
        elapsed_working_days = max(0, min(total_working_days, day_of_month - elapsed_sundays - min(declared_holidays, int((day_of_month / total_days) * declared_holidays))))
        remaining_working_days = max(0, total_working_days - elapsed_working_days)

    notif_achieved = stats.get("notification", 0)
    remaining_target = max(0, target_val - notif_achieved)
    if req_month < today_month_str:
        required_run_rate = 0.0
    elif remaining_working_days > 0:
        required_run_rate = round(remaining_target / remaining_working_days, 1)
    else:
        required_run_rate = float(remaining_target)

    current_run_rate = round(notif_achieved / max(1, elapsed_working_days), 1)
    expected_to_date = round((target_val * elapsed_working_days) / total_working_days)
    pace_diff = notif_achieved - expected_to_date

    working_days_info = {
        "month": req_month,
        "total_days": total_days,
        "sundays": sundays_in_month,
        "declared_holidays": declared_holidays,
        "total_working_days": total_working_days,
        "elapsed_working_days": elapsed_working_days,
        "remaining_working_days": remaining_working_days,
        "required_run_rate": required_run_rate,
        "current_run_rate": current_run_rate,
        "expected_to_date": expected_to_date,
        "pace_diff": pace_diff
    }

    return {
        "success": True,
        "target": target_val,
        "total_achieved": total_achieved,
        "breakdown": stats,
        "daily_history": daily_history,
        "streak_days": streak_days,
        "total_km": total_km_month,
        "badges": badges,
        "working_days_info": working_days_info
    }

async def get_directory() -> dict:
    import sys
    main_mod = sys.modules.get("main")
    if main_mod and hasattr(main_mod, "get_directory"):
        custom = getattr(main_mod, "get_directory")
        if custom is not get_directory:
            res = custom()
            if asyncio.iscoroutine(res):
                return await res
            return res
    try:
        from backend.core.helpers import DEFAULT_BIHAR_DISTRICTS
        cached = cache.get("staff_directory_dict")
        if cached is not None and isinstance(cached, dict) and len(cached) >= len(DEFAULT_BIHAR_DISTRICTS):
            return cached

        try:
            records = await get_cached_staff_directory_raw()
            directory = {d: [] for d in DEFAULT_BIHAR_DISTRICTS}
            for data in records:
                if data.get("is_active") is False or data.get("status") == "inactive":
                    continue
                dist = canonicalize_district(data.get("district"))
                name = data.get("name")
                if dist in directory and name:
                    if name not in directory[dist]:
                        directory[dist].append(name)

            for d in directory:
                directory[d] = sorted(directory[d])

            cache.set("staff_directory_dict", directory, ttl=3600)
            return directory
        except Exception as fe:
            print(f"get_directory read notice (quota/network): {fe}")
            return load_baseline_staff_directory()
    except Exception as e:
        return load_baseline_staff_directory()

