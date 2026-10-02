import re
import math
import calendar
import asyncio
from datetime import datetime, timedelta, date as dt_date
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends

from backend.core.database import db
from backend.core.cache import cache
from backend.core.security import get_current_admin
from backend.core.helpers import (
    get_ist_now,
    canonicalize_district,
    is_officer_name_match,
    get_active_operational_month,
    get_reporting_cutoff_hour,
    DEFAULT_BIHAR_DISTRICTS,
    canonicalize_fo_name,
    normalize_staff_key
)
from backend.core.master_ledger import (
    get_raw_monthly_reports,
    get_cached_staff_targets_for_month,
    get_cached_staff_directory_raw
)
from backend.routers.targets import get_targets

router = APIRouter(tags=["top_performers"])


@router.get("/api/statewide-top-performers")
async def get_statewide_top_performers(
    month: Optional[str] = None,
    period: str = "monthly",
    target_mode: str = "official",
    admin: dict = Depends(get_current_admin)
):
    """
    Statewide Leaderboard for Bihar Top Performers Studio.
    Bypasses Sub-Admin district RBAC by design so all coordinators can view statewide champions.
    Returns Top 5 Districts and Top 5 Field Officers for the specified period ('weekly', 'fortnightly', 'monthly').
    Supports dual-target benchmarking via target_mode ('official' vs 'frontline').
    """
    try:
        import sys
        main_mod = sys.modules.get("main")
        dt_cls = getattr(main_mod, "datetime", datetime) if main_mod else datetime
        now_dt = dt_cls.utcnow() + timedelta(hours=5, minutes=30)
        today_str = now_dt.strftime("%Y-%m-%d")
        if not month:
            month = get_active_operational_month(now_dt)
            
        period = (period or "monthly").lower().strip()
        if period not in ("weekly", "fortnightly", "monthly"):
            period = "monthly"

        clean_target_mode = (target_mode or "official").lower().strip()
        if clean_target_mode not in ("official", "frontline"):
            clean_target_mode = "official"

        cache_key = f"statewide_top_{month}_{period}_{clean_target_mode}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        # Calculate date range
        start_date = None
        if period == "weekly":
            start_date = (now_dt - timedelta(days=6)).strftime("%Y-%m-%d")
        elif period == "fortnightly":
            start_date = (now_dt - timedelta(days=14)).strftime("%Y-%m-%d")

        # Load all monthly reports without district restrictions (statewide)
        raw_reports = await get_raw_monthly_reports(month, force=False) or []

        # Filter by date if weekly or fortnightly
        if start_date:
            filtered_reports = [
                r for r in raw_reports 
                if (r.get("date_of_reporting") or r.get("date") or "") >= start_date 
                and (r.get("date_of_reporting") or r.get("date") or "") <= today_str
            ]
        else:
            filtered_reports = raw_reports

        # Load staff directory metadata (designations, targets, is_active) with in-memory caching
        staff_meta = cache.get("staff_directory_map")
        if staff_meta is None or not isinstance(staff_meta, dict):
            staff_meta = {}
            try:
                raw_records = await get_cached_staff_directory_raw()
                for d in raw_records:
                    dist = canonicalize_district(d.get("district") or "")
                    fo_name = (d.get("name") or d.get("fo_name") or "").strip()
                    if dist and fo_name:
                        k = normalize_staff_key(dist, fo_name)
                        is_active = (d.get("is_active") is not False) and (d.get("status") != "inactive")
                        raw_t = d.get("target")
                        if raw_t is not None and str(raw_t).strip() != "":
                            try:
                                t_val = float(raw_t)
                            except (ValueError, TypeError):
                                t_val = 50.0
                        else:
                            t_val = 50.0
                        staff_meta[k] = {
                            "name": fo_name,
                            "designation": (d.get("designation") or "Field Officer").strip(),
                            "target": t_val,
                            "is_active": is_active
                        }
                cache.set("staff_directory_map", staff_meta, ttl=3600)
            except Exception as e_meta:
                print(f"[Leaderboard] Notice loading staff_directory_map: {e_meta}")
                staff_meta = {}

        # Inactive staff keys
        inactive_keys = set(cache.get("inactive_staff_keys") or [])
        if not inactive_keys:
            for k, meta in staff_meta.items():
                if not meta.get("is_active", True):
                    inactive_keys.add(k)
            if inactive_keys:
                cache.set("inactive_staff_keys", list(inactive_keys), ttl=300)

        # Load district targets and staff month-specific targets
        dist_targets = {}
        staff_month_targets = {}
        frontline_sums = {}
        official_dist_targets = {}
        try:
            targets_fn = getattr(main_mod, "get_targets", get_targets) if main_mod else get_targets
            target_res = targets_fn(district=None, month=month)
            if asyncio.iscoroutine(target_res):
                target_res = await target_res
            if isinstance(target_res, dict):
                official_dist_targets = target_res.get("official_targets_by_district") or {}
                if "targets" in target_res:
                    for t in target_res["targets"]:
                        d_clean = canonicalize_district(t.get("district") or "")
                        raw_t = t.get("target")
                        if raw_t is not None and str(raw_t).strip() != "":
                            try:
                                t_num = float(raw_t)
                            except (ValueError, TypeError):
                                t_num = 50.0
                        else:
                            t_num = 50.0
                        frontline_sums[d_clean] = frontline_sums.get(d_clean, 0.0) + t_num
                        fo_raw = (t.get("fo_name") or t.get("name") or "").strip()
                        if d_clean and fo_raw:
                            norm_k = normalize_staff_key(d_clean, fo_raw)
                            staff_month_targets[norm_k] = t_num

            all_known_dists = set(official_dist_targets.keys()).union(set(frontline_sums.keys()))
            for d_name in all_known_dists:
                if clean_target_mode == "official":
                    off_val = official_dist_targets.get(d_name)
                    if off_val is not None and isinstance(off_val, (int, float)) and off_val > 0:
                        dist_targets[d_name] = float(off_val)
                    else:
                        dist_targets[d_name] = frontline_sums.get(d_name, 50.0)
                else:
                    dist_targets[d_name] = frontline_sums.get(d_name, 50.0)
        except Exception as e_targets:
            print(f"[Leaderboard] Notice loading targets for statewide: {e_targets}")

        # Aggregate by District and by Staff designation roles
        district_counts = {}
        fo_counts = {}
        lt_counts = {}
        sct_counts = {}
        tc_counts = {}

        for r in filtered_reports:
            c_dist = canonicalize_district(r.get("working_place") or r.get("district") or "")
            raw_fo = (r.get("fo_name") or "").strip()
            c_fo = canonicalize_fo_name(raw_fo, c_dist)
            
            if not c_dist or not c_fo:
                continue

            notifs = len(r.get("notification_ids") or [])
            if notifs == 0:
                notifs = int(r.get("notifications") or 0)

            tests = len(r.get("sample_tested_ids") or [])
            if tests == 0:
                tests = int(r.get("tests") or 0)

            samples_collected = len(r.get("sample_collection_ids") or [])
            if samples_collected == 0:
                samples_collected = int(r.get("sample_collection") or r.get("samples_collected") or 0)

            home_visits = len(r.get("home_visit_ids") or [])
            if home_visits == 0:
                home_visits = int(r.get("home_visits") or r.get("home_visit") or 0)

            hiv_dm = len(r.get("hiv_dm_ids") or [])
            if hiv_dm == 0:
                hiv_dm = int(r.get("hiv_dm") or r.get("hiv") or 0)

            dbt = len(r.get("dbt_ids") or [])
            if dbt == 0:
                dbt = int(r.get("dbt") or 0)

            # District aggregate
            if c_dist not in district_counts:
                district_counts[c_dist] = {
                    "district": c_dist,
                    "notifications": 0,
                    "target": dist_targets[c_dist] if c_dist in dist_targets else 50.0,
                    "percentage": 0.0
                }
            district_counts[c_dist]["notifications"] += notifs

            # Staff aggregate (exclude deactivated staff)
            norm_key = normalize_staff_key(c_dist, c_fo)
            is_deactivated = (
                norm_key in inactive_keys or
                not staff_meta.get(norm_key, {}).get("is_active", True) or
                any(k in norm_key for k in ["purushotam", "purushottam"])
            )
            if is_deactivated:
                continue

            meta = staff_meta.get(norm_key, {})
            display_name = meta.get("name") or c_fo
            desig = (meta.get("designation") or "Field Officer").strip()
            desig_upper = desig.upper()
            staff_key = f"{c_dist}_{c_fo}"

            is_tc = bool(re.search(r'\bTC\b', desig_upper) or "TREATMENT COORDINATOR" in desig_upper)

            if "LT" in desig_upper or "LAB TECHNICIAN" in desig_upper:
                if staff_key not in lt_counts:
                    lt_counts[staff_key] = {
                        "fo_name": display_name,
                        "district": c_dist,
                        "designation": desig or "Lab Technician (LT)",
                        "tests": 0,
                        "notifications": 0
                    }
                lt_counts[staff_key]["tests"] += tests
                lt_counts[staff_key]["notifications"] += notifs
            elif "SCT" in desig_upper or "SPUTUM" in desig_upper:
                if staff_key not in sct_counts:
                    sct_counts[staff_key] = {
                        "fo_name": display_name,
                        "district": c_dist,
                        "designation": desig or "SCT Agent",
                        "samples_collected": 0,
                        "notifications": 0
                    }
                sct_counts[staff_key]["samples_collected"] += samples_collected
                sct_counts[staff_key]["notifications"] += notifs
            elif is_tc:
                if staff_key not in tc_counts:
                    tc_counts[staff_key] = {
                        "fo_name": display_name,
                        "district": c_dist,
                        "designation": desig or "Treatment Coordinator (TC)",
                        "home_visits": 0,
                        "notifications": 0,
                        "hiv_dm": 0,
                        "dbt": 0,
                        "samples_collected": 0,
                        "tests": 0
                    }
                tc_counts[staff_key]["home_visits"] += home_visits
                tc_counts[staff_key]["notifications"] += notifs
                tc_counts[staff_key]["hiv_dm"] += hiv_dm
                tc_counts[staff_key]["dbt"] += dbt
                tc_counts[staff_key]["samples_collected"] += samples_collected
                tc_counts[staff_key]["tests"] += tests
            else:
                if staff_key not in fo_counts:
                    # Check month-specific target first, then fallback to directory metadata
                    assigned_target = staff_month_targets.get(norm_key)
                    if assigned_target is None:
                        raw_t = meta.get("target")
                        if raw_t is not None and str(raw_t).strip() != "":
                            try:
                                assigned_target = float(raw_t)
                            except (ValueError, TypeError):
                                assigned_target = 50.0
                        else:
                            assigned_target = 50.0
                    fo_counts[staff_key] = {
                        "fo_name": display_name,
                        "district": c_dist,
                        "designation": desig or "Field Officer",
                        "notifications": 0,
                        "target": float(assigned_target),
                        "percentage": 0.0
                    }
                fo_counts[staff_key]["notifications"] += notifs

        # Compute percentages for districts
        for d in district_counts.values():
            t_val = float(d.get("target", 50.0))
            if t_val <= 0:
                eff_target = 1.0
            elif period == "weekly":
                eff_target = max(1.0, float(round(t_val * 7 / 24)))
            elif period == "fortnightly":
                eff_target = max(1.0, float(round(t_val * 15 / 24)))
            else:
                eff_target = max(1.0, float(t_val))
            d["percentage"] = round((d["notifications"] / eff_target) * 100, 1)

        # Compute percentages for FO staff
        for s in fo_counts.values():
            s_target = float(s.get("target", 50.0))
            if s_target <= 0:
                eff_target = 1.0
            elif period == "weekly":
                eff_target = max(1.0, float(round(s_target * 7 / 24)))
            elif period == "fortnightly":
                eff_target = max(1.0, float(round(s_target * 15 / 24)))
            else:
                eff_target = max(1.0, float(s_target))
            s["percentage"] = round((s["notifications"] / eff_target) * 100, 1)

        # Sort districts (1. District Champions (DC): Rank Target % se banegi, tie-breaker: notifications)
        sorted_districts = list(district_counts.values())
        sorted_districts.sort(key=lambda x: (x["percentage"], x["notifications"]), reverse=True)

        # Assign rank and take top 5
        top_districts = []
        for i, d in enumerate(sorted_districts[:5]):
            top_districts.append({
                "rank": i + 1,
                "district": d["district"],
                "notifications": d["notifications"],
                "target": int(d["target"]),
                "percentage": d["percentage"]
            })

        # Sort FO & Hub Agents (2. Top FO & Hub Agents: Rank TB Notification se banegi, tie-breaker: Target %)
        sorted_fo = list(fo_counts.values())
        sorted_fo.sort(key=lambda x: (x["notifications"], x["percentage"]), reverse=True)
        top_fo = []
        for i, s in enumerate(sorted_fo[:5]):
            top_fo.append({
                "rank": i + 1,
                "fo_name": s["fo_name"],
                "district": s["district"],
                "designation": s.get("designation") or "Field Officer",
                "notifications": s["notifications"],
                "percentage": s["percentage"],
                "metric_value": s["notifications"],
                "metric_label": "notifications"
            })

        # Sort Lab Technicians (4. Top Lab Technicians (LT): Rank Diagnostic Tests se banegi, tie-breaker: Notification)
        sorted_lt = list(lt_counts.values())
        sorted_lt.sort(key=lambda x: (x["tests"], x["notifications"]), reverse=True)
        top_lt = []
        for i, s in enumerate(sorted_lt[:5]):
            top_lt.append({
                "rank": i + 1,
                "fo_name": s["fo_name"],
                "district": s["district"],
                "designation": s.get("designation") or "Lab Technician (LT)",
                "tests": s["tests"],
                "notifications": s["notifications"],
                "metric_value": s["tests"],
                "metric_label": "tests"
            })

        # Sort SCT Agents (5. Top SCT Agents: Rank Sputum Samples Collected se banegi, tie-breaker: Notification)
        sorted_sct = list(sct_counts.values())
        sorted_sct.sort(key=lambda x: (x["samples_collected"], x["notifications"]), reverse=True)
        top_sct = []
        for i, s in enumerate(sorted_sct[:5]):
            top_sct.append({
                "rank": i + 1,
                "fo_name": s["fo_name"],
                "district": s["district"],
                "designation": s.get("designation") or "SCT Agent",
                "samples_collected": s["samples_collected"],
                "notifications": s["notifications"],
                "metric_value": s["samples_collected"],
                "metric_label": "collections"
            })

        # Calculate composite other clinical indicators score for TC (3. Top TC: Rank Verified Home Visits se banegi, tie-breaker: HIV, DM, DBT, Samples, Tests)
        for s in tc_counts.values():
            s["other_clinical_score"] = (
                s.get("hiv_dm", 0) + 
                s.get("dbt", 0) + 
                s.get("samples_collected", 0) + 
                s.get("tests", 0)
            )

        # Sort Treatment Coordinators (Ranked by home_visits, tie-breaker: other clinical indicators, tertiary: notifications)
        sorted_tc = list(tc_counts.values())
        sorted_tc.sort(key=lambda x: (x["home_visits"], x["other_clinical_score"], x["notifications"]), reverse=True)
        top_tc = []
        for i, s in enumerate(sorted_tc[:5]):
            top_tc.append({
                "rank": i + 1,
                "fo_name": s["fo_name"],
                "district": s["district"],
                "designation": s.get("designation") or "Treatment Coordinator (TC)",
                "home_visits": s["home_visits"],
                "notifications": s["notifications"],
                "hiv_dm": s.get("hiv_dm", 0),
                "dbt": s.get("dbt", 0),
                "samples_collected": s.get("samples_collected", 0),
                "tests": s.get("tests", 0),
                "other_clinical_score": s.get("other_clinical_score", 0),
                "metric_value": s["home_visits"],
                "metric_label": "home visits"
            })

        result = {
            "success": True,
            "month": month,
            "period": period,
            "target_mode": clean_target_mode,
            "start_date": start_date or f"{month}-01",
            "end_date": today_str,
            "top_districts": top_districts,
            "top_fo": top_fo,
            "top_tc": top_tc,
            "top_lt": top_lt,
            "top_sct": top_sct,
            "top_staff": top_fo
        }
        cache.set(cache_key, result, ttl=180) # 3-minute cache
        return result
    except Exception as e:
        print(f"Error in get_statewide_top_performers: {e}")
        return {
            "success": False,
            "error": str(e),
            "top_districts": [],
            "top_fo": [],
            "top_tc": [],
            "top_lt": [],
            "top_sct": [],
            "top_staff": []
        }

