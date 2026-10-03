import os
import io
import re
import math
import json
import asyncio
import calendar
import logging
from datetime import datetime, timedelta, date as dt_date, timezone
from typing import Optional, List, Dict, Any, Tuple, Set
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from google.cloud import firestore

from backend.core.database import db
from backend.core.cache import cache
from backend.core.security import get_current_admin, require_super_admin
from backend.core.helpers import (
    get_ist_now,
    canonicalize_district,
    is_officer_name_match,
    log_admin_activity
)
from backend.core.master_ledger import (
    get_raw_monthly_reports
)
from backend.core.supabase import (
    pg_query_table,
    pg_fetch_one,
    pg_upsert_row,
    pg_update_row,
    pg_delete_rows,
    pg_execute_raw,
    get_active_db,
)
from backend.core.styles import (
    safe_filename,
    ExcelStreamingResponse,
    style_excel_worksheet,
    EXCEL_HEADER_BORDER,
    EXCEL_THIN_BORDER,
    EXCEL_TOTAL_ROW_BORDER,
    EXCEL_CLUSTER_DIVIDER
)

router = APIRouter(tags=["nikshay"])
logger = logging.getLogger("nikshay")
NIKSHAY_EXPORT_SEMAPHORE = asyncio.Semaphore(1)

# --- Nikshay Column Header Matching Helpers ---
# =========================================================================
def is_name_header(c: Any) -> bool:
    if c is None or (isinstance(c, float) and math.isnan(c)):
        return False
    h = str(c).strip().lower().replace(" ", "_").replace(".", "").replace("'", "")
    # Exclude institutional or administrative names
    if any(k in h for k in ["district", "facility", "hospital", "phi", "state", "tu_name", "unit_name", "user_name", "username"]):
        return False
    if any(k in h for k in ["patient_name", "patientname", "beneficiary_name", "case_name", "client_name"]):
        return True
    if "name" in h and any(k in h for k in ["patient", "beneficiary", "case", "client", "person"]):
        return True
    if h in ["name", "patient", "patient_name", "name_of_patient", "name_of_the_patient", "beneficiary", "case_name", "client_name"]:
        return True
    return False

def is_phone_header(c: Any) -> bool:
    if c is None or (isinstance(c, float) and math.isnan(c)):
        return False
    h = str(c).strip().lower().replace(" ", "_").replace(".", "").replace("'", "")
    if any(k in h for k in ["tracing", "trace", "outcome", "status", "date", "action"]):
        return False
    return any(k in h for k in ["primaryphone", "phone", "mobile", "contact", "cell"])


# --- Nikshay Cumulative Verification Ledger Helper ---
# =========================================================================
def sync_nikshay_cumulative_ledger_sync(
    patients_to_sync: Dict[str, Dict[str, Any]],
    admin_user: str
) -> Dict[str, int]:
    """
    Safely merges patient indicators into 'nikshay_verified_patients' in Firestore.
    Ensures MONOTONIC RETENTION: once True, an indicator is NEVER reverted to False or deleted.
    Uses batch reads (db.get_all) and batch writes (db.batch) in chunks of 300.
    Only writes documents that have changes or new indicators to preserve Firestore quotas.
    """
    total_processed = len(patients_to_sync)
    if total_processed == 0:
        return {"total_processed": 0, "written": 0, "unchanged": 0}

    pids = list(patients_to_sync.keys())
    chunk_size = 300
    total_written = 0
    total_unchanged = 0
    now_iso = datetime.utcnow().isoformat()
    now_date = datetime.utcnow().strftime("%Y-%m-%d")
    active_db = get_active_db()
    for i in range(0, len(pids), chunk_size):
        chunk_pids = pids[i:i + chunk_size]
        chunk_doc_map = {pid: str(pid).strip().replace("/", "_").replace(".", "_") for pid in chunk_pids}
        chunk_refs = [active_db.collection("nikshay_verified_patients").document(chunk_doc_map[pid]) for pid in chunk_pids]
        doc_ids_list = list(chunk_doc_map.values())

        existing_docs = {}
        try:
            pg_existing = pg_execute_raw(
                "SELECT * FROM nikshay_verified_patients WHERE id = ANY(%s)",
                [doc_ids_list],
                fetch=True
            )
            if pg_existing:
                for row in pg_existing:
                    existing_docs[row.get("id")] = dict(row)
        except Exception as err:
            print(f"[Ledger Sync] PG select warning: {err}")
            existing_docs = {}

        if not existing_docs:
            try:
                snapshots = active_db.get_all(chunk_refs) if hasattr(active_db, "get_all") else [r.get() for r in chunk_refs]
                for snap in snapshots:
                    if getattr(snap, "exists", False):
                        existing_docs[snap.id] = snap.to_dict() if hasattr(snap, "to_dict") and callable(snap.to_dict) else dict(snap)
            except Exception as err:
                print(f"[Ledger Sync] Batch get_all warning: {err}")

        batch = active_db.batch() if hasattr(active_db, "batch") else None
        batch_count = 0

        for pid in chunk_pids:
            doc_id = chunk_doc_map[pid]
            current = patients_to_sync[pid]
            existing = existing_docs.get(doc_id, {})

            is_new = not bool(existing)

            notif_val = bool(existing.get("notification_verified", False) or current.get("notification_verified", False))
            hiv_val = bool(existing.get("hiv_tested", False) or current.get("hiv_tested", False))
            dm_val = bool(existing.get("dm_tested", False) or current.get("dm_tested", False))
            hiv_dm_val = bool(existing.get("hiv_dm_tested", False) or current.get("hiv_dm_tested", False) or hiv_val or dm_val)
            bank_val = bool(existing.get("bank_validated", False) or current.get("bank_validated", False))
            udst_val = bool(existing.get("udst_done", False) or current.get("udst_done", False))
            contact_val = bool(existing.get("contact_tracing_done", False) or current.get("contact_tracing_done", False))

            existing_name = str(existing.get("patient_name") or "").strip()
            existing_phone = str(existing.get("phone") or "").strip()
            curr_name = str(current.get("name") or current.get("patient_name") or "").strip()
            curr_phone = str(current.get("phone") or "").strip()

            final_name = curr_name if curr_name else existing_name
            final_phone = curr_phone if curr_phone else existing_phone

            name_changed = bool(curr_name and curr_name != existing_name)
            phone_changed = bool(curr_phone and curr_phone != existing_phone)

            has_changes = (
                is_new or
                (not existing.get("notification_verified") and notif_val) or
                (not existing.get("hiv_tested") and hiv_val) or
                (not existing.get("dm_tested") and dm_val) or
                (not existing.get("hiv_dm_tested") and hiv_dm_val) or
                (not existing.get("bank_validated") and bank_val) or
                (not existing.get("udst_done") and udst_val) or
                (not existing.get("contact_tracing_done") and contact_val) or
                name_changed or
                phone_changed
            )

            if not has_changes:
                total_unchanged += 1
                continue

            merged_record = {
                "id": doc_id,
                "patient_id": str(pid),
                "patient_name": final_name,
                "phone": final_phone,
                "district": current.get("district") or existing.get("district", ""),
                "notification_verified": notif_val,
                "hiv_tested": hiv_val,
                "dm_tested": dm_val,
                "hiv_dm_tested": hiv_dm_val,
                "bank_validated": bank_val,
                "udst_done": udst_val,
                "contact_tracing_done": contact_val,
                "treatment_outcome": current.get("outcome") or existing.get("treatment_outcome", ""),
                "first_verified_at": existing.get("first_verified_at", now_iso),
                "last_reconciled_at": now_iso,
                "reconciled_by": admin_user
            }

            if notif_val and not existing.get("notification_verified_date"):
                merged_record["notification_verified_date"] = now_date
            if hiv_val and not existing.get("hiv_verified_date"):
                merged_record["hiv_verified_date"] = now_date
            if dm_val and not existing.get("dm_verified_date"):
                merged_record["dm_verified_date"] = now_date
            if bank_val and not existing.get("bank_verified_date"):
                merged_record["bank_verified_date"] = now_date
            if udst_val and not existing.get("udst_verified_date"):
                merged_record["udst_verified_date"] = now_date
            if contact_val and not existing.get("contact_verified_date"):
                merged_record["contact_verified_date"] = now_date

            pg_upsert_row("nikshay_verified_patients", merged_record, conflict_columns=["id"])
            if batch is not None and hasattr(batch, "set"):
                try:
                    batch.set(active_db.collection("nikshay_verified_patients").document(doc_id), merged_record, merge=True)
                    batch_count += 1
                except Exception:
                    pass
            total_written += 1

        if batch is not None and batch_count > 0 and hasattr(batch, "commit"):
            try:
                batch.commit()
            except Exception:
                pass

    if total_written > 0:
        cache.delete_prefix("ledger_")
        cache.delete_prefix("journey_")

    return {"total_processed": total_processed, "written": total_written, "unchanged": total_unchanged}


# =========================================================================
# --- Nikshay Official Excel/CSV Importer & Auto-Reconciler ---
# =========================================================================
@router.post("/admin/reconcile-nikshay")
async def reconcile_nikshay(
    file: UploadFile = File(...),
    month: Optional[str] = Form(None),
    district: Optional[str] = Form("All"),
    admin: dict = Depends(require_super_admin)
):
    try:
        content = await file.read()
        filename = file.filename.lower()
        sheet_used = "Default"
        import pandas as pd  # lazy — only loaded when upload is processed
        # 1. Multi-sheet Excel Parser targeting 'mastersheet'
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif filename.endswith((".xlsx", ".xls")):
            excel_file = pd.ExcelFile(io.BytesIO(content))
            sheet_names = excel_file.sheet_names
            target_sheet = sheet_names[0]
            for s in sheet_names:
                if "master" in str(s).strip().lower():
                    target_sheet = s
                    break
            sheet_used = target_sheet
            df = pd.read_excel(excel_file, sheet_name=target_sheet)
        else:
            raise HTTPException(status_code=400, detail="Invalid file format. Please upload an official Nikshay .xlsx or .csv export.")

        cols_lower = {str(c).strip().lower(): c for c in df.columns}
        
        # 2. Dynamically locate Patient/Episode ID column
        id_col = None
        for candidate in ["episode_id", "episodeid", "nikshay_id", "nikshayid", "patient_id", "patientid", "tb_id"]:
            if candidate in cols_lower:
                id_col = cols_lower[candidate]
                break
        if not id_col:
            for col in df.columns:
                clean_col = str(col).strip().lower().replace(" ", "_").replace(".", "")
                if any(k in clean_col for k in ["episode_id", "nikshay_id", "patient_id", "tb_id", "case_id", "beneficiary_id"]):
                    id_col = col
                    break
        if not id_col:
            for col in df.columns:
                sample_vals = [str(x).split(".")[0].strip() for x in df[col].dropna()[:15]]
                if any(v.isdigit() and len(v) >= 7 for v in sample_vals):
                    id_col = col
                    break
        if not id_col:
            id_col = df.columns[0]

        # 3. Detect demographics, district & date columns
        phone_col = next((c for c in df.columns if is_phone_header(c)), None)
        name_col = next((c for c in df.columns if is_name_header(c)), None)
        address_col = cols_lower.get("address") or next((c for c in df.columns if "address" in str(c).strip().lower()), None)

        district_col = None
        for candidate in ["spectrum_enrolment_district", "spectrum_diagnosing_district", "district", "district_name"]:
            if candidate in cols_lower:
                district_col = cols_lower[candidate]
                break
        if not district_col:
            district_col = next((c for c in df.columns if "district" in str(c).lower()), None)

        date_col = None
        for candidate in ["spectrum_enrollment_date", "spectrum_diagnosis_date", "diagnosis_date", "treatment_initiation_date", "date_of_notification"]:
            if candidate in cols_lower:
                date_col = cols_lower[candidate]
                break
        if not date_col:
            date_col = next((c for c in df.columns if "date" in str(c).lower()), None)

        # 4. Detect Indicator columns
        hiv_col = cols_lower.get("hiv_tested") or cols_lower.get("status_of_hiv") or next((c for c in df.columns if "hiv" in str(c).lower()), None)
        dm_col = cols_lower.get("diabetes_tested") or cols_lower.get("status_of_diabetes") or next((c for c in df.columns if "diabetes" in str(c).lower()), None)
        bank_col = cols_lower.get("bank_validated") or cols_lower.get("bank_details_entered") or cols_lower.get("beneficiary_status") or next((c for c in df.columns if "bank" in str(c).lower() or "dbt" in str(c).lower()), None)
        udst_col = cols_lower.get("udst_done") or next((c for c in df.columns if "udst" in str(c).lower() or "dst" in str(c).lower()), None)
        contact_col = cols_lower.get("contact_tracing_done") or next((c for c in df.columns if "contact" in str(c).lower()), None)
        outcome_col = cols_lower.get("treatment_outcome") or next((c for c in df.columns if "outcome" in str(c).lower()), None)

        def is_yes(val):
            if val is None or pd.isna(val):
                return False
            s = str(val).strip().lower()
            return s in ["yes", "y", "done", "true", "1", "reactive", "positive", "tested", "validated"]

        # 5. Parse Nikshay Master Records & Full-Sheet Demographics Lookup
        nikshay_patients = {}
        nikshay_demographics_lookup = {}
        for _, row in df.iterrows():
            val = row.get(id_col)
            if val is None or pd.isna(val):
                continue
            s = str(val).strip().split(".")[0]
            s_clean = s.replace("_", "").replace("-", "").replace("/", "")
            if not (s and s_clean.isalnum() and len(s_clean) >= 5):
                continue

            row_dist = str(row.get(district_col, "")).strip() if district_col and not pd.isna(row.get(district_col)) else ""
            p_phone = re.sub(r'\D', '', str(row.get(phone_col, "")).split(".")[0])[-10:] if phone_col and not pd.isna(row.get(phone_col)) else ""
            p_name = str(row.get(name_col, "")).strip() if name_col and not pd.isna(row.get(name_col)) else ""

            # Capture demographics across the ENTIRE sheet (regardless of month or district filter)
            if p_name or p_phone:
                nikshay_demographics_lookup[s] = {
                    "name": p_name,
                    "phone": p_phone,
                    "district": row_dist
                }

            if district and district != "All" and row_dist and row_dist.lower() != district.lower():
                continue

            if month and date_col:
                row_dt = str(row.get(date_col, "")).strip()
                if row_dt and len(row_dt) >= 7 and not row_dt.startswith(month):
                    continue

            nikshay_patients[s] = {
                "id": s,
                "name": p_name,
                "phone": p_phone,
                "district": row_dist,
                "hiv_done": is_yes(row.get(hiv_col)) if hiv_col else False,
                "dm_done": is_yes(row.get(dm_col)) if dm_col else False,
                "bank_done": is_yes(row.get(bank_col)) if bank_col else False,
                "udst_done": is_yes(row.get(udst_col)) if udst_col else False,
                "contact_done": is_yes(row.get(contact_col)) if contact_col else False,
                "outcome": str(row.get(outcome_col, "")).strip() if outcome_col and not pd.isna(row.get(outcome_col)) else ""
            }

        nikshay_ids = set(nikshay_patients.keys())

        # 🛡️ Memory Guard: Release raw Excel DataFrame and binary content to keep RAM under 35 MB
        try:
            del df
            del content
            import gc
            gc.collect()
        except Exception:
            pass

        # 6. Fetch reported IDs in DFY MIS
        if not month:
            month = datetime.now().strftime("%Y-%m")
        
        report_docs = await get_raw_monthly_reports(month)
        
        dfy_reported_ids = set()
        dfy_details = {} # id -> metadata & boolean flags
        
        categories_map = {
            "notification_ids": "Notification",
            "hiv_dm_ids": "HIV_DM",
            "dbt_ids": "DBT_Bank",
            "sample_tested_ids": "UDST_Testing",
            "sample_collection_ids": "Sample_Collection",
            "contact_tracing_ids": "Contact_Tracing",
            "differentiated_tb_ids": "Diff_TB"
        }

        for doc in report_docs:
            d = doc if isinstance(doc, dict) else (doc.to_dict() if hasattr(doc, "to_dict") else {})

            doc_dist = d.get("working_place", "")
            if district != "All" and doc_dist.lower() != district.lower():
                continue
                
            fo = d.get("fo_name", "")
            dt = d.get("date_of_reporting", "")
            
            for cat_key, service_label in categories_map.items():
                for pid in d.get(cat_key, []):
                    clean_pid = str(pid).strip()
                    dfy_reported_ids.add(clean_pid)
                    if clean_pid not in dfy_details:
                        dfy_details[clean_pid] = {
                            "district": doc_dist,
                            "fo_name": fo,
                            "date": dt,
                            "services": set(),
                            "has_notification": False,
                            "has_hiv_dm": False,
                            "has_dbt": False,
                            "has_udst": False,
                            "has_contact": False
                        }
                    else:
                        if dt and (not dfy_details[clean_pid].get("date") or dt > dfy_details[clean_pid].get("date")):
                            dfy_details[clean_pid]["date"] = dt
                    dfy_details[clean_pid]["services"].add(service_label)
                    if cat_key == "notification_ids":
                        dfy_details[clean_pid]["has_notification"] = True
                    elif cat_key == "hiv_dm_ids":
                        dfy_details[clean_pid]["has_hiv_dm"] = True
                    elif cat_key == "dbt_ids":
                        dfy_details[clean_pid]["has_dbt"] = True
                    elif cat_key in ["sample_tested_ids", "sample_collection_ids"]:
                        dfy_details[clean_pid]["has_udst"] = True
                    elif cat_key == "contact_tracing_ids":
                        dfy_details[clean_pid]["has_contact"] = True

        # Enrich DFY reported patients with demographics resolved from the full Nikshay upload
        for clean_pid, d_info in dfy_details.items():
            if clean_pid in nikshay_demographics_lookup:
                demo = nikshay_demographics_lookup[clean_pid]
                if demo.get("name"):
                    d_info["patient_name"] = demo["name"]
                if demo.get("phone"):
                    d_info["phone"] = demo["phone"]
                if not d_info.get("district") and demo.get("district"):
                    d_info["district"] = demo["district"]

        # 7. Compute Set Reconciliation & Multi-Cascade Breakdown
        matched = list(nikshay_ids.intersection(dfy_reported_ids))
        only_in_nikshay = list(nikshay_ids - dfy_reported_ids)
        only_in_dfy = list(dfy_reported_ids - nikshay_ids)

        cascade_summary = {
            "hiv_dm": {"nikshay_done": 0, "dfy_done": 0, "ready_for_portal": 0, "both_done": 0, "pending_both": 0},
            "dbt": {"nikshay_done": 0, "dfy_done": 0, "ready_for_portal": 0, "both_done": 0, "pending_both": 0},
            "udst": {"nikshay_done": 0, "dfy_done": 0, "ready_for_portal": 0, "both_done": 0, "pending_both": 0},
            "contact_tracing": {"nikshay_done": 0, "dfy_done": 0, "ready_for_portal": 0, "both_done": 0, "pending_both": 0},
        }

        ready_for_nikshay_list = []
        urgent_field_action_list = []

        for pid, np in nikshay_patients.items():
            dfy_info = dfy_details.get(pid)
            has_dfy = dfy_info is not None
            
            # HIV & DM (either HIV or DM tested in Nikshay)
            n_hiv = np["hiv_done"] or np["dm_done"]
            d_hiv = dfy_info["has_hiv_dm"] if has_dfy else False
            if n_hiv: cascade_summary["hiv_dm"]["nikshay_done"] += 1
            if d_hiv: cascade_summary["hiv_dm"]["dfy_done"] += 1
            if n_hiv and d_hiv: cascade_summary["hiv_dm"]["both_done"] += 1
            elif not n_hiv and d_hiv: cascade_summary["hiv_dm"]["ready_for_portal"] += 1
            elif not n_hiv and not d_hiv: cascade_summary["hiv_dm"]["pending_both"] += 1

            # DBT Bank
            n_dbt = np["bank_done"]
            d_dbt = dfy_info["has_dbt"] if has_dfy else False
            if n_dbt: cascade_summary["dbt"]["nikshay_done"] += 1
            if d_dbt: cascade_summary["dbt"]["dfy_done"] += 1
            if n_dbt and d_dbt: cascade_summary["dbt"]["both_done"] += 1
            elif not n_dbt and d_dbt: cascade_summary["dbt"]["ready_for_portal"] += 1
            elif not n_dbt and not d_dbt: cascade_summary["dbt"]["pending_both"] += 1

            # UDST Testing
            n_udst = np["udst_done"]
            d_udst = dfy_info["has_udst"] if has_dfy else False
            if n_udst: cascade_summary["udst"]["nikshay_done"] += 1
            if d_udst: cascade_summary["udst"]["dfy_done"] += 1
            if n_udst and d_udst: cascade_summary["udst"]["both_done"] += 1
            elif not n_udst and d_udst: cascade_summary["udst"]["ready_for_portal"] += 1
            elif not n_udst and not d_udst: cascade_summary["udst"]["pending_both"] += 1

            # Contact Tracing
            n_ct = np["contact_done"]
            d_ct = dfy_info["has_contact"] if has_dfy else False
            if n_ct: cascade_summary["contact_tracing"]["nikshay_done"] += 1
            if d_ct: cascade_summary["contact_tracing"]["dfy_done"] += 1
            if n_ct and d_ct: cascade_summary["contact_tracing"]["both_done"] += 1
            elif not n_ct and d_ct: cascade_summary["contact_tracing"]["ready_for_portal"] += 1
            elif not n_ct and not d_ct: cascade_summary["contact_tracing"]["pending_both"] += 1

            # Actionable List 1: Ready for Nikshay Portal Update (Pending in Nikshay, but Done in DFY!)
            services_ready = []
            if not n_dbt and d_dbt: services_ready.append("💳 DBT Bank Seeded")
            if not n_hiv and d_hiv: services_ready.append("🩺 HIV/DM Screened")
            if not n_udst and d_udst: services_ready.append("🔬 Sample Tested (UDST)")
            if not n_ct and d_ct: services_ready.append("👥 Contact Traced")

            if services_ready:
                ready_for_nikshay_list.append({
                    "id": pid,
                    "name": np["name"] or "Patient",
                    "phone": np["phone"],
                    "district": np["district"] or (dfy_info["district"] if has_dfy else ""),
                    "services_ready": services_ready,
                    "fo_name": dfy_info["fo_name"] if has_dfy else "",
                    "date": dfy_info["date"] if has_dfy else ""
                })

            # Actionable List 2: Urgent Field Action (Pending in both Nikshay and DFY!)
            pending_actions = []
            if not n_dbt and not d_dbt: pending_actions.append("DBT Bank")
            if not n_hiv and not d_hiv: pending_actions.append("HIV/DM")
            if not n_udst and not d_udst: pending_actions.append("UDST")
            if not n_ct and not d_ct: pending_actions.append("Contact Tracing")

            if len(pending_actions) >= 2:
                urgent_field_action_list.append({
                    "id": pid,
                    "name": np["name"] or "Patient",
                    "phone": np["phone"],
                    "district": np["district"],
                    "pending_actions": pending_actions
                })

        # 8. 3-Day Aging Audit & 2-Part Discrepancy Classification
        # Segregates normal Govt portal sync lag (<= 3 days) from actionable discrepancies (> 3 days)
        # Does NOT alter field officer daily targets or monthly evaluations.
        now_dt = datetime.now()
        flagged_review_list = []
        grace_window_list = []

        # PART 1: Matched IDs (Episode ID exists in Nikshay, but claimed indicator is blank/pending)
        for pid in matched:
            np = nikshay_patients.get(pid, {})
            dfy_info = dfy_details.get(pid, {})
            
            n_hiv = np.get("hiv_done", False) or np.get("dm_done", False)
            d_hiv = dfy_info.get("has_hiv_dm", False)
            
            n_dbt = np.get("bank_done", False)
            d_dbt = dfy_info.get("has_dbt", False)
            
            n_udst = np.get("udst_done", False)
            d_udst = dfy_info.get("has_udst", False)
            
            n_ct = np.get("contact_done", False)
            d_ct = dfy_info.get("has_contact", False)
            
            unmatched_services = []
            if d_hiv and not n_hiv:
                unmatched_services.append("HIV/DM Screening")
            if d_dbt and not n_dbt:
                unmatched_services.append("DBT Bank Details")
            if d_udst and not n_udst:
                unmatched_services.append("UDST Lab Sample")
            if d_ct and not n_ct:
                unmatched_services.append("Contact Tracing")
                
            if unmatched_services:
                rep_date_str = dfy_info.get("date", "")
                days_elapsed = 0
                if rep_date_str:
                    try:
                        rep_dt = datetime.strptime(str(rep_date_str).strip()[:10], "%Y-%m-%d")
                        days_elapsed = max(0, (now_dt - rep_dt).days)
                    except Exception:
                        days_elapsed = 0
                
                record = {
                    "id": pid,
                    "patient_name": np.get("name") or "Patient",
                    "phone": np.get("phone", ""),
                    "district": dfy_info.get("district") or np.get("district", ""),
                    "fo_name": dfy_info.get("fo_name", ""),
                    "date": rep_date_str,
                    "days_elapsed": days_elapsed,
                    "category": "Part 1: Matched ID (Indicator Blank)",
                    "category_type": "matched_indicator_pending",
                    "services_claimed": ", ".join(unmatched_services),
                    "nikshay_status": "Blank / Pending on Nikshay Portal",
                    "action_required": "⚠️ CHECK SERVICE SLIP: Episode ID portal par mil gayi hai lekin claimed test/DBT blank hai. FO se physical lab/test slip mangwayein."
                }
                
                if days_elapsed <= 3:
                    record["grace_reason"] = f"Reported {days_elapsed}d ago (≤72h) - Govt Portal Sync Lag"
                    grace_window_list.append(record)
                else:
                    flagged_review_list.append(record)

        # PART 2: Unverified IDs (Claimed in DFY MIS, but NOT found in uploaded Nikshay Registry)
        for pid in only_in_dfy:
            dfy_info = dfy_details.get(pid, {})
            rep_date_str = dfy_info.get("date", "")
            days_elapsed = 0
            if rep_date_str:
                try:
                    rep_dt = datetime.strptime(str(rep_date_str).strip()[:10], "%Y-%m-%d")
                    days_elapsed = max(0, (now_dt - rep_dt).days)
                except Exception:
                    days_elapsed = 0
                    
            services_claimed_str = ", ".join(sorted(list(dfy_info.get("services", [])))) or "Reported in MIS"
            
            demo = nikshay_demographics_lookup.get(pid, {})
            pt_name = dfy_info.get("patient_name") or demo.get("name") or "Unregistered / Not in Nikshay"
            pt_phone = dfy_info.get("phone") or demo.get("phone") or "-"

            record = {
                "id": pid,
                "patient_name": pt_name,
                "phone": pt_phone,
                "district": dfy_info.get("district", ""),
                "fo_name": dfy_info.get("fo_name", ""),
                "date": rep_date_str,
                "days_elapsed": days_elapsed,
                "category": "Part 2: Unverified ID (Not Found)",
                "category_type": "unverified_id",
                "services_claimed": services_claimed_str,
                "nikshay_status": "Episode ID Not Found on Nikshay",
                "action_required": "🚨 ACTION REQUIRED: Pehle Nikshay Portal ke Search bar me ID type karke manual check karein. Agar 72 ghante ke baad bhi nahi mil rahi, toh FO se clarify karein ya target claim reject karein."
            }
            
            if days_elapsed <= 3:
                record["grace_reason"] = f"Enrolled {days_elapsed}d ago (≤72h) - Nikshay Portal Enrollment Lag"
                grace_window_list.append(record)
            else:
                flagged_review_list.append(record)

        # Sort district-wise, then FO name, then days_elapsed descending (oldest discrepancies first)
        flagged_review_list.sort(key=lambda x: (str(x.get("district", "")).lower(), str(x.get("fo_name", "")).lower(), -int(x.get("days_elapsed", 0))))
        grace_window_list.sort(key=lambda x: (str(x.get("district", "")).lower(), str(x.get("fo_name", "")).lower(), -int(x.get("days_elapsed", 0))))

        # 9. Permanent Cumulative Verification Ledger Synchronization
        # Once an indicator is verified, it is permanently locked in Firestore and NEVER lost or erased!
        patients_to_sync = {}
        for pid, np in nikshay_patients.items():
            dfy_info = dfy_details.get(pid)
            has_dfy = dfy_info is not None
            is_matched_pt = pid in matched
            
            n_hiv = np["hiv_done"]
            n_dm = np["dm_done"]
            d_hiv_dm = dfy_info["has_hiv_dm"] if has_dfy else False
            
            n_bank = np["bank_done"]
            d_bank = dfy_info["has_dbt"] if has_dfy else False
            
            n_udst = np["udst_done"]
            d_udst = dfy_info["has_udst"] if has_dfy else False
            
            n_ct = np["contact_done"]
            d_ct = dfy_info["has_contact"] if has_dfy else False
            
            if (is_matched_pt or n_hiv or n_dm or d_hiv_dm or n_bank or d_bank or 
                n_udst or d_udst or n_ct or d_ct or np.get("outcome")):
                p_name = np.get("name") or (dfy_info.get("patient_name") if has_dfy else "") or nikshay_demographics_lookup.get(pid, {}).get("name", "")
                p_phone = np.get("phone") or (dfy_info.get("phone") if has_dfy else "") or nikshay_demographics_lookup.get(pid, {}).get("phone", "")
                patients_to_sync[pid] = {
                    "name": p_name,
                    "patient_name": p_name,
                    "phone": p_phone,
                    "district": np["district"] or (dfy_info["district"] if has_dfy else ""),
                    "notification_verified": is_matched_pt or (dfy_info["has_notification"] if has_dfy else False),
                    "hiv_tested": n_hiv or d_hiv_dm,
                    "dm_tested": n_dm or d_hiv_dm,
                    "hiv_dm_tested": n_hiv or n_dm or d_hiv_dm,
                    "bank_validated": n_bank or d_bank,
                    "udst_done": n_udst or d_udst,
                    "contact_tracing_done": n_ct or d_ct,
                    "outcome": np.get("outcome", "")
                }
                
        for pid, dfy_info in dfy_details.items():
            if pid not in patients_to_sync:
                has_any_service = (dfy_info["has_notification"] or dfy_info["has_hiv_dm"] or 
                                   dfy_info["has_dbt"] or dfy_info["has_udst"] or dfy_info["has_contact"])
                if has_any_service:
                    demo = nikshay_demographics_lookup.get(pid, {})
                    p_name = dfy_info.get("patient_name") or demo.get("name", "")
                    p_phone = dfy_info.get("phone") or demo.get("phone", "")
                    patients_to_sync[pid] = {
                        "name": p_name,
                        "patient_name": p_name,
                        "phone": p_phone,
                        "district": dfy_info.get("district", ""),
                        "notification_verified": dfy_info.get("has_notification", False),
                        "hiv_tested": dfy_info.get("has_hiv_dm", False),
                        "dm_tested": dfy_info.get("has_hiv_dm", False),
                        "hiv_dm_tested": dfy_info.get("has_hiv_dm", False),
                        "bank_validated": dfy_info.get("has_dbt", False),
                        "udst_done": dfy_info.get("has_udst", False),
                        "contact_tracing_done": dfy_info.get("has_contact", False),
                        "outcome": ""
                    }
                    
        ledger_sync_res = {"total_processed": 0, "written": 0, "unchanged": 0}
        try:
            sync_fn = sync_nikshay_cumulative_ledger_sync
            import sys
            main_mod = sys.modules.get("main")
            if main_mod and hasattr(main_mod, "sync_nikshay_cumulative_ledger_sync"):
                custom = getattr(main_mod, "sync_nikshay_cumulative_ledger_sync")
                if custom is not sync_nikshay_cumulative_ledger_sync:
                    sync_fn = custom
            ledger_sync_res = await asyncio.to_thread(
                sync_fn,
                patients_to_sync,
                admin.get("username", "Admin")
            )
        except Exception as sync_err:
            print(f"[Ledger Sync] Non-blocking notice: {sync_err}")

        summary = {
            "month": month,
            "district": district,
            "detected_sheet": sheet_used,
            "detected_id_column": str(id_col),
            "is_mastersheet_format": bool("master" in sheet_used.lower() or "episode_id" in cols_lower),
            "total_nikshay_uploaded": len(nikshay_ids),
            "total_dfy_reported": len(dfy_reported_ids),
            "matched_count": len(matched),
            "match_rate_pct": round((len(matched) / len(nikshay_ids) * 100), 1) if nikshay_ids else 0,
            "missing_in_dfy_count": len(only_in_nikshay),
            "only_in_dfy_count": len(only_in_dfy),
            "flagged_review_count": len(flagged_review_list),
            "grace_window_count": len(grace_window_list),
            "ready_for_portal_count": len(ready_for_nikshay_list),
            "urgent_field_action_count": len(urgent_field_action_list),
            "cascade": cascade_summary,
            "cumulative_ledger": {
                "patients_evaluated": ledger_sync_res.get("total_processed", 0),
                "newly_locked_or_upgraded": ledger_sync_res.get("written", 0),
                "already_locked_preserved": ledger_sync_res.get("unchanged", 0)
            }
        }

        # 🕒 Save Persistent Sync Status in Firestore so Render dyno sleep never loses it!
        now_utc = datetime.now(timezone.utc)
        now_ist = now_utc + timedelta(hours=5, minutes=30)
        ist_formatted = now_ist.strftime("%d %b %Y, %I:%M %p")
        actor_name = admin.get("name") or admin.get("username", "Super Admin")
        actor_id = admin.get("user_id") or admin.get("username", "admin")

        sync_meta_doc = {
            "synced_at": now_utc.isoformat(),
            "synced_at_ist": ist_formatted,
            "synced_by": actor_name,
            "synced_by_id": actor_id,
            "filename": file.filename,
            "sheet_used": sheet_used,
            "month": month,
            "district": district,
            "total_matched": len(matched),
            "total_grace_under_72h": len(grace_window_list),
            "total_flagged_over_72h": len(flagged_review_list),
            "match_rate_pct": summary.get("match_rate_pct", 0),
            "flagged_records": flagged_review_list[:500],
            "grace_records": grace_window_list[:300],
            "last_updated": now_utc.strftime("%Y-%m-%d %H:%M:%S")
        }
        try:
            import json as _json
            pg_upsert_row("admin_config", {
                "id": "nikshay_sync_meta",
                "key": "nikshay_sync_meta",
                "value": _json.dumps(sync_meta_doc),
                "data": _json.dumps(sync_meta_doc),
                "updated_at": now_utc.strftime("%Y-%m-%d %H:%M:%S")
            }, conflict_columns=["id"])
            cache.delete("nikshay_sync_meta_light")
        except Exception as meta_err:
            logger.warning(f"Error persisting nikshay_sync_meta: {meta_err}")


        # Cache the review sheet data for rapid Excel export (2h TTL, 0 DB storage)
        cache_data_review = {
            "records": flagged_review_list,
            "month": month,
            "district": district,
            "generated_at": ist_formatted
        }
        admin_user = admin.get("username", "Admin")
        cache.set(f"review_sheet_{admin_user}", cache_data_review, ttl=7200)
        cache.set("review_sheet_latest", cache_data_review, ttl=7200)
        
        preview_missing_in_dfy_details = [{
            "id": pid,
            "name": nikshay_patients[pid]["name"] or "Patient",
            "phone": nikshay_patients[pid]["phone"],
            "district": nikshay_patients[pid]["district"]
        } for pid in only_in_nikshay[:150]]

        # Backward compatibility: Keep string list for any client with cached frontend JS
        preview_missing_in_dfy_legacy = [str(pid) for pid in only_in_nikshay[:150]]

        preview_only_in_dfy = [{
            "id": pid,
            "district": dfy_details.get(pid, {}).get("district", ""),
            "fo_name": dfy_details.get(pid, {}).get("fo_name", ""),
            "date": dfy_details.get(pid, {}).get("date", ""),
            "services": list(dfy_details.get(pid, {}).get("services", []))
        } for pid in only_in_dfy[:150]]
        
        actor_name = admin.get("name") or admin.get("username", "Super Admin")
        actor_id = admin.get("user_id") or admin.get("username", "admin")
        actor_role = admin.get("role", "SUPER_ADMIN")
        await log_admin_activity(
            action_type="NIKSHAY_RECONCILE",
            details=f"Reconciled {sheet_used} for {district} ({month}): {len(matched)} matched ({summary['match_rate_pct']}%), {len(ready_for_nikshay_list)} ready for portal update, {len(flagged_review_list)} flagged for staff review",
            district=district,
            user_name=actor_name,
            user_id=actor_id,
            role=actor_role
        )
        
        return {
            "success": True,
            "summary": summary,
            "preview_flagged_discrepancies": flagged_review_list[:150],
            "preview_grace_window": grace_window_list[:150],
            "preview_missing_in_dfy": preview_missing_in_dfy_legacy,
            "preview_missing_in_dfy_details": preview_missing_in_dfy_details,
            "preview_only_in_dfy": preview_only_in_dfy,
            "preview_ready_for_portal": ready_for_nikshay_list[:150],
            "preview_urgent_field_action": urgent_field_action_list[:150]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reconciliation error: {str(e)}")

# =========================================================================
# --- Nikshay Sync Status & Audit Telemetry API ---
# =========================================================================
@router.get("/admin/nikshay/sync-status")
async def get_nikshay_sync_status(admin: dict = Depends(get_current_admin)):
    """Returns persistent Nikshay sync metadata indicating when dump was last updated and by whom."""
    cached = cache.get("nikshay_sync_meta_light")
    if cached is not None:
        return cached
    try:
        row = pg_fetch_one("admin_config", filters={"id": "nikshay_sync_meta"})
        if not row:
            row = pg_fetch_one("admin_config", filters={"key": "nikshay_sync_meta"})
        if row:
            import json as _json
            d = row
            if "data" in row and isinstance(row["data"], str):
                try:
                    d = _json.loads(row["data"])
                except Exception:
                    pass
            elif "value" in row and isinstance(row["value"], str):
                try:
                    d = _json.loads(row["value"])
                except Exception:
                    pass
            res = {
                "success": True,
                "has_sync": True,
                "synced_at": d.get("synced_at"),
                "synced_at_ist": d.get("synced_at_ist"),
                "synced_by": d.get("synced_by", "Super Admin"),
                "filename": d.get("filename", ""),
                "month": d.get("month", ""),
                "district": d.get("district", "All"),
                "total_matched": d.get("total_matched", 0),
                "total_grace_under_72h": d.get("total_grace_under_72h", 0),
                "total_flagged_over_72h": d.get("total_flagged_over_72h", 0),
                "match_rate_pct": d.get("match_rate_pct", 0)
            }
            cache.set("nikshay_sync_meta_light", res, ttl=300)
            return res
    except Exception as e:
        logger.warning(f"Error reading nikshay_sync_meta: {e}")
    return {"success": True, "has_sync": False}

# =========================================================================
# --- Nikshay District-Wise Discrepancy Review Sheet Export ---
# =========================================================================
@router.get("/admin/nikshay/download-review-sheet")
async def download_nikshay_review_sheet(
    district: Optional[str] = Query("All"),
    admin: dict = Depends(get_current_admin)
):
    """
    Exports a formatted Excel sheet with 11 columns grouped by District & Field Officer.
    Contains cases where reporting > 72 hours old has indicators missing in Nikshay or IDs unverified.
    Includes explicit action directives instructing Admin to manually verify Episode ID on Nikshay before penalizing.
    """
    try:
        admin_user = admin.get("username", "Admin")
        cached = cache.get(f"review_sheet_{admin_user}")
        if not cached:
            cached = cache.get("review_sheet_latest")
            
        if not cached or "records" not in cached:
            # 🛡️ Resilient Persistence Fallback: Read from admin_config/nikshay_sync_meta
            row = pg_fetch_one("admin_config", filters={"id": "nikshay_sync_meta"})
            if not row:
                row = pg_fetch_one("admin_config", filters={"key": "nikshay_sync_meta"})
            if row:
                import json as _json
                doc_data = row
                if "data" in row and isinstance(row["data"], str):
                    try:
                        doc_data = _json.loads(row["data"])
                    except Exception:
                        pass
                elif "value" in row and isinstance(row["value"], str):
                    try:
                        doc_data = _json.loads(row["value"])
                    except Exception:
                        pass
                cached = {
                    "records": doc_data.get("flagged_records", []),
                    "month": doc_data.get("month", datetime.now().strftime("%Y-%m")),
                    "district": doc_data.get("district", "All")
                }
                cache.set("review_sheet_latest", cached, ttl=3600)
            else:
                raise HTTPException(
                    status_code=400,
                    detail="No review sheet data available. Please ask Super Admin to upload and reconcile an official Nikshay dump first."
                )

            
        records = cached.get("records", [])
        sheet_month = cached.get("month", datetime.now().strftime("%Y-%m"))
        
        if district and district != "All":
            records = [r for r in records if str(r.get("district", "")).strip().lower() == district.strip().lower()]
            
        rows = []
        for r in records:
            cat = r.get("category", "")
            action_prompt = r.get("action_required", "")
            if not action_prompt:
                if "Part 2" in cat or "Unverified" in cat:
                    action_prompt = "🚨 ACTION REQUIRED: Manually check Episode ID in Nikshay search bar. If still not found > 72h, demand physical OPD slip from FO or reject target."
                else:
                    action_prompt = "⚠️ CHECK TEST SLIP: ID found on portal, but claimed service is blank. Verify physical TRF/lab slip."

            days_e = r.get("days_elapsed", 0)
            verdict = "🚨 Missing > 72h (Manual Nikshay Check Required)" if days_e > 3 else "⏳ Pending Portal Sync (< 72h Grace Window)"
            if "Part 1" in cat or "Matched" in cat:
                verdict = "⚠️ ID Found, but Service Blank on Nikshay"

            rows.append({
                "District": r.get("district", ""),
                "Field Officer Name": r.get("fo_name", ""),
                "Date Reported in MIS": r.get("date", ""),
                "Days Elapsed (Audit Lag)": f"{days_e} days",
                "Episode ID": r.get("id", ""),
                "72-Hour Audit Verdict": verdict,
                "Services Claimed by FO": r.get("services_claimed", ""),
                "Nikshay Portal Live Status": r.get("nikshay_status", ""),
                "Action Directive (Manual Check)": action_prompt,
                "Admin / Sub-Admin Manual Check Outcome": "",
                "Final Decision (Approved / Rejected Fake ID)": ""
            })
            
        if not rows:
            rows.append({
                "District": district if district != "All" else "All Districts",
                "Field Officer Name": "None",
                "Date Reported in MIS": "-",
                "Days Elapsed (Audit Lag)": "0 days",
                "Episode ID": "-",
                "72-Hour Audit Verdict": "All Synchronized",
                "Services Claimed by FO": "-",
                "Nikshay Portal Live Status": "All Synchronized",
                "Action Directive (Manual Check)": "No discrepancies > 72 hours detected. All verified or within sync grace window.",
                "Admin / Sub-Admin Manual Check Outcome": "Clean Record",
                "Final Decision (Approved / Rejected Fake ID)": "Approved"
            })
            
        import pandas as pd  # lazy — only loaded when export is requested
        df_export = pd.DataFrame(rows)
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df_export.to_excel(writer, index=False, sheet_name="Field Review Sheet")
            ws = writer.sheets["Field Review Sheet"]
            style_excel_worksheet(ws, header_fill_color="D97706")
            
        output.seek(0)
        dist_slug = district.replace(" ", "_") if district else "All"
        filename = f"DFY_Field_Review_Sheet_{dist_slug}_{sheet_month}_{datetime.now().strftime('%Y%m%d')}.xlsx"
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Review sheet export error: {str(e)}")

# =========================================================================
# --- Nikshay Permanent Cumulative Verification Ledger API ---
# =========================================================================
@router.get("/admin/nikshay/cumulative-ledger")
async def get_cumulative_ledger(
    district: Optional[str] = Query("All"),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    admin: dict = Depends(get_current_admin)
):
    try:
        # Sub-Admin RBAC validation
        admin_role = admin.get("role", "SUB_ADMIN")
        if admin_role == "SUB_ADMIN":
            admin_allowed = admin.get("allowed_districts", []) or admin.get("districts", [])
            allowed_c = [canonicalize_district(d).lower() for d in admin_allowed if d]
            if "all" not in allowed_c:
                if district and district.lower() != "all":
                    clean_d = canonicalize_district(district).lower()
                    if clean_d not in allowed_c:
                        raise HTTPException(status_code=403, detail=f"Permission denied. You do not have access to district '{district}'.")
                else:
                    if allowed_c:
                        district = admin_allowed[0]
                    else:
                        raise HTTPException(status_code=403, detail="Permission denied. No allowed districts assigned.")

        cache_key = f"ledger_{district}_{search}_{page}_{limit}"
        cached = cache.get(cache_key)
        if cached is not None:
            print(f"\n[FIRESTORE AUDIT] >>> Cumulative Ledger: CACHE HIT for '{cache_key}' (0 Firestore reads)")
            return cached

        # Fast Path: Exact Episode ID Search (Direct row get)
        s_clean = search.strip() if search else None
        if s_clean and (" " not in s_clean) and (len(s_clean) >= 4):
            doc_id = s_clean.replace("/", "_").replace(".", "_")
            doc_dict = pg_fetch_one("nikshay_verified_patients", filters={"id": doc_id})
            if not doc_dict:
                doc_dict = pg_fetch_one("nikshay_verified_patients", filters={"patient_id": s_clean})
            if doc_dict:
                p_dist = canonicalize_district(doc_dict.get("district", ""))
                if not district or district == "All" or p_dist.lower() == canonicalize_district(district).lower():
                    exact_res = {
                        "success": True,
                        "total_records": 1,
                        "total_in_collection": 1,
                        "page": 1,
                        "limit": limit,
                        "total_pages": 1,
                        "metrics": {
                            "total_verified": 1,
                            "hiv_dm_verified": 1 if (doc_dict.get("hiv_dm_tested") or doc_dict.get("hiv_tested") or doc_dict.get("dm_tested")) else 0,
                            "bank_validated": 1 if doc_dict.get("bank_validated") else 0,
                            "udst_done": 1 if doc_dict.get("udst_done") else 0,
                            "contact_tracing_done": 1 if doc_dict.get("contact_tracing_done") else 0
                        },
                        "patients": [doc_dict]
                    }
                    cache.set(cache_key, exact_res, ttl=300)
                    return exact_res

        # Paginated Bounded Query with District Filtering from PostgreSQL
        filters = {}
        if district and district != "All":
            filters["district"] = canonicalize_district(district)

        paginated = pg_query_table(
            "nikshay_verified_patients",
            filters=filters if filters else None,
            order_by="first_verified_at",
            order_desc=True,
            limit=limit,
            offset=(page - 1) * limit
        )

        # Calculate metrics from the current bounded page
        total_hiv_dm = sum(1 for d in paginated if d.get("hiv_dm_tested") or d.get("hiv_tested") or d.get("dm_tested"))
        total_bank = sum(1 for d in paginated if d.get("bank_validated"))
        total_udst = sum(1 for d in paginated if d.get("udst_done"))
        total_contact = sum(1 for d in paginated if d.get("contact_tracing_done"))

        res = {
            "success": True,
            "total_records": len(paginated) if len(paginated) < limit else (page * limit + 1),
            "total_in_collection": len(paginated),
            "page": page,
            "limit": limit,
            "total_pages": page + 1 if len(paginated) == limit else page,
            "metrics": {
                "total_verified": len(paginated),
                "hiv_dm_verified": total_hiv_dm,
                "bank_validated": total_bank,
                "udst_done": total_udst,
                "contact_tracing_done": total_contact
            },
            "patients": paginated
        }
        cache.set(cache_key, res, ttl=300) # 5-minute cache
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ledger retrieval error: {str(e)}")

@router.get("/admin/nikshay/cumulative-ledger/export")
async def export_cumulative_ledger(
    district: Optional[str] = Query("All"),
    admin: dict = Depends(get_current_admin)
):
    try:
        async with NIKSHAY_EXPORT_SEMAPHORE:
            filters = {}
            if district and district != "All":
                filters["district"] = canonicalize_district(district)

            docs = pg_query_table(
                "nikshay_verified_patients",
                filters=filters if filters else None,
                limit=5000
            )

            rows = []
            for d in docs:

                rows.append({
                    "Episode ID": d.get("patient_id", ""),
                    "Patient Name": d.get("patient_name", ""),
                    "Phone": d.get("phone", ""),
                    "District": d.get("district", ""),
                    "Notification Verified": "Yes" if d.get("notification_verified") else "Pending",
                    "HIV/DM Screened": "Yes" if (d.get("hiv_dm_tested") or d.get("hiv_tested") or d.get("dm_tested")) else "Pending",
                    "DBT Bank Validated": "Yes" if d.get("bank_validated") else "Pending",
                    "UDST Done": "Yes" if d.get("udst_done") else "Pending",
                    "Contact Tracing Done": "Yes" if d.get("contact_tracing_done") else "Pending",
                    "Treatment Outcome": d.get("treatment_outcome", ""),
                    "First Verified Date": str(d.get("first_verified_at", ""))[:10],
                    "Last Reconciled Date": str(d.get("last_reconciled_at", ""))[:10],
                    "Reconciled By": d.get("reconciled_by", "")
                })
            import pandas as pd  # lazy import
            df_export = pd.DataFrame(rows)
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                df_export.to_excel(writer, index=False, sheet_name="Cumulative Ledger")
                ws = writer.sheets["Cumulative Ledger"]
                style_excel_worksheet(ws, header_fill_color="059669")

            del df_export
            gc.collect()
            output.seek(0)
            dist_slug = district.replace(" ", "_") if district else "All"
        filename = f"Nikshay_Cumulative_Ledger_{dist_slug}_{datetime.now().strftime('%Y%m%d')}.xlsx"
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export error: {str(e)}")

# =========================================================================
# --- Patient Longitudinal Journey Timeline Drawer API ---
# =========================================================================
@router.get("/api/reports/patient-journey/{patient_id}")
@router.get("/api/nikshay/patient-journey/{patient_id}")
@router.get("/api/nikshay/patient-journey")
@router.get("/api/reports/patient-journey")
async def get_patient_journey(patient_id: Optional[str] = None):
    try:
        clean_id = str(patient_id).strip()
        if not clean_id:
            raise HTTPException(status_code=400, detail="Patient ID is required.")
            
        cache_key = f"journey_{clean_id}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        # Step 1: Check Permanent Nikshay Cumulative Ledger first to discover district
        ledger_doc_id = clean_id.replace("/", "_").replace(".", "_")
        known_district = ""
        ledger_data = None
        try:
            ledger_data = pg_fetch_one("nikshay_verified_patients", filters={"id": ledger_doc_id})
            if not ledger_data:
                ledger_data = pg_fetch_one("nikshay_verified_patients", filters={"patient_id": clean_id})
            if ledger_data:
                known_district = canonicalize_district(ledger_data.get("district", ""))
        except Exception:
            pass

        # Step 2: Search in-memory cached reports for recent months first
        now = get_ist_now()
        cur_m = now.strftime("%Y-%m")
        prev_m = (now.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
        docs = []
        for m in [cur_m, prev_m]:
            c_reports = cache.get(f"shared_raw_month_{m}")
            if c_reports and isinstance(c_reports, list):
                docs.extend(c_reports)

        found_in_cache = False
        for d in docs:
            item = d if isinstance(d, dict) else (d.to_dict() if hasattr(d, "to_dict") else {})
            for field_key in ["notification_ids", "sample_tested_ids", "dbt_ids", "hiv_dm_ids", "contact_tracing_ids"]:
                if clean_id in (item.get(field_key) or []):
                    found_in_cache = True
                    break
            if found_in_cache:
                break

        # Step 3: Targeted PostgreSQL query if not resolved from in-memory cache
        if not found_in_cache:
            start_date = (now - timedelta(days=180)).strftime("%Y-%m-01")
            if known_district:
                target_places = list(dict.fromkeys([known_district, known_district.title(), known_district.lower()]))[:10]
                docs = pg_execute_raw(
                    "SELECT * FROM daily_field_reports WHERE working_place = ANY(%s) AND date_of_reporting >= %s",
                    [target_places, start_date],
                    fetch=True
                ) or []
            else:
                docs = pg_execute_raw(
                    "SELECT * FROM daily_field_reports WHERE date_of_reporting >= %s AND (notification_ids::text LIKE %s OR sample_tested_ids::text LIKE %s OR dbt_ids::text LIKE %s)",
                    [start_date, f"%{clean_id}%", f"%{clean_id}%", f"%{clean_id}%"],
                    fetch=True
                ) or []
            # Normalize JSON list fields if PostgreSQL returned them as strings
            import json as _json
            for doc_item in docs:
                for col in ["notification_ids", "sample_tested_ids", "dbt_ids", "hiv_dm_ids", "contact_tracing_ids", "differentiated_tb_ids"]:
                    val = doc_item.get(col)
                    if isinstance(val, str):
                        try:
                            doc_item[col] = _json.loads(val)
                        except Exception:
                            doc_item[col] = []

        
        milestones = []
        patient_meta = {
            "id": clean_id, 
            "district": known_district, 
            "primary_fo": "", 
            "first_reported": "",
            "patient_name": "",
            "phone": ""
        }
        
        category_labels = {
            "notification_ids": ("TB Notification Recorded", "📋", 1),
            "sample_collection_ids": ("Sputum Sample Collected", "🧪", 2),
            "sample_tested_ids": ("Diagnostic Sample Tested", "🔬", 3),
            "hiv_dm_ids": ("HIV & Diabetes Screening Completed", "🩺", 4),
            "dbt_ids": ("DBT Bank Details Seeded", "💳", 5),
            "differentiated_tb_ids": ("Differentiated TB Assessment Done", "🩺", 6),
            "contact_tracing_ids": ("Household Contact Tracing Completed", "👥", 7),
            "home_visit_ids": ("Home Visit Completed", "🏠", 8),
            "fdc_provided_ids": ("FDC Medication Kit Provided", "💊", 9),
            "culture_dst_ids": ("Culture / DST Testing (Buxar Special)", "🧫", 10),
            "outcome_assigned_ids": ("Treatment Outcome Assigned", "🏁", 11)
        }
        
        for doc in docs:
            d = doc.to_dict() if hasattr(doc, "to_dict") else (doc if isinstance(doc, dict) else {})
            dt = d.get("date_of_reporting", "")
            fo = d.get("fo_name", "")
            dist = d.get("working_place", "")
            
            for field_key, (label, icon, order) in category_labels.items():
                ids = d.get(field_key, []) or []
                if clean_id in ids:
                    if not patient_meta["district"]:
                        patient_meta["district"] = dist
                    if not patient_meta["primary_fo"]:
                        patient_meta["primary_fo"] = fo
                    if not patient_meta["first_reported"] or dt < patient_meta["first_reported"]:
                        patient_meta["first_reported"] = dt
                        
                    milestones.append({
                        "date": dt,
                        "action": label,
                        "icon": icon,
                        "category": field_key,
                        "fo_name": fo,
                        "district": dist,
                        "order": order
                    })

        # Apply Permanent Nikshay Cumulative Ledger Metadata
        if ledger_data:
            if not patient_meta.get("district") and ledger_data.get("district"):
                patient_meta["district"] = ledger_data.get("district")
            if not patient_meta.get("patient_name"):
                patient_meta["patient_name"] = ledger_data.get("patient_name") or ledger_data.get("name") or ""
            if not patient_meta.get("phone"):
                patient_meta["phone"] = ledger_data.get("phone") or ""
                    
            active_nikshay_indicators = []
            if ledger_data.get("bank_validated"): active_nikshay_indicators.append("💳 DBT Bank Validated")
            if ledger_data.get("hiv_dm_tested") or ledger_data.get("hiv_tested") or ledger_data.get("dm_tested"): active_nikshay_indicators.append("🩺 HIV/DM Screened")
            if ledger_data.get("udst_done"): active_nikshay_indicators.append("🔬 UDST Tested")
            if ledger_data.get("contact_tracing_done"): active_nikshay_indicators.append("👥 Contact Traced")
            
            milestones.append({
                "date": str(ledger_data.get("last_reconciled_at") or ledger_data.get("first_verified_at") or "Permanent")[:10],
                "action": f"Nikshay Official Ledger Verified: {', '.join(active_nikshay_indicators) if active_nikshay_indicators else 'Enrolled & Monitored'}",
                "icon": "🔒",
                "category": "nikshay_verified",
                "fo_name": f"Nikshay Ledger ({ledger_data.get('reconciled_by', 'Admin')})",
                "district": ledger_data.get("district", patient_meta["district"]),
                "order": 0
            })
            patient_meta["nikshay_verified"] = True
            patient_meta["nikshay_indicators"] = active_nikshay_indicators
                    
        milestones.sort(key=lambda m: (m["date"], m["order"]))
        
        res = {
            "success": True,
            "patient_id": clean_id,
            "metadata": patient_meta,
            "total_milestones": len(milestones),
            "journey": milestones,
            "is_complete": any(m["category"] == "outcome_assigned_ids" for m in milestones)
        }
        
        cache.set(cache_key, res, ttl=1800)
        return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

