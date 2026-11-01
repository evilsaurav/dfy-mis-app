import os
import sys
import re
import argparse
from pathlib import Path
from datetime import datetime, date

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import openpyxl
from backend.core.supabase import pg_execute_raw
from backend.core.cache import cache

DEFAULT_EXCEL_PATH = r"C:\Users\Saurav\Downloads\All Employees Master Data - Doctors for you.xlsx"

def normalize_name(n_val: str) -> str:
    if not n_val:
        return ""
    s = str(n_val).lower().strip()
    s = s.replace(".", " ")
    s = s.replace("kuamr", "kumar")
    s = s.replace("ahmed", "ahmad")
    s = s.replace("sourabh", "saurabh")
    s = re.sub(r'[^a-z0-9\s]', '', s)
    return " ".join(s.split())

def normalize_location(loc_val: str) -> str:
    if not loc_val:
        return ""
    s = str(loc_val).lower().strip()
    s = s.replace("chamaparan", "champaran")
    s = s.replace("darbhangha", "darbhanga")
    return s

def normalize_blood_group(bg_raw: str) -> str:
    if not bg_raw or str(bg_raw).strip().lower() in ("not available", "none", "nan", "-"):
        return None
    s = str(bg_raw).strip()
    # e.g., 'O+ (O Positive)' -> 'O+', 'AB+ (AB Positive)' -> 'AB+'
    m = re.match(r'^([ABO]+[+-])', s, re.IGNORECASE)
    if m:
        return m.group(1).upper()
    return s.split()[0].upper() if s else None

def clean_phone(phone_raw) -> str:
    if not phone_raw:
        return None
    digits = re.sub(r'\D', '', str(phone_raw).split('.')[0])
    if len(digits) >= 10:
        return digits[-10:]
    return None

def clean_date(d_val):
    if not d_val:
        return None
    if isinstance(d_val, (datetime, date)):
        return d_val.strftime("%Y-%m-%d")
    s = str(d_val).strip()
    if len(s) >= 10 and re.match(r'^\d{4}-\d{2}-\d{2}', s):
        return s[:10]
    return None

def load_excel_employees(file_path: str):
    wb = openpyxl.load_workbook(file_path, read_only=True)
    sheet = wb.active
    employees = []
    
    for row in sheet.iter_rows(min_row=2, values_only=True):
        if not row or not any(row):
            continue
        emp_no = str(row[0]).strip() if row[0] else None
        name = str(row[1]).strip() if len(row) > 1 and row[1] else None
        if not name:
            continue
            
        email = str(row[2]).strip().lower() if len(row) > 2 and row[2] else None
        dob = clean_date(row[3]) if len(row) > 3 else None
        gender = str(row[4]).strip() if len(row) > 4 and row[4] else None
        marital = str(row[5]).strip() if len(row) > 5 and row[5] else None
        blood = normalize_blood_group(row[7]) if len(row) > 7 else None
        phone = clean_phone(row[8]) if len(row) > 8 else None
        location = str(row[9]).strip() if len(row) > 9 and row[9] else None
        dept = str(row[12]).strip() if len(row) > 12 and row[12] else None
        job_title = str(row[13]).strip() if len(row) > 13 and row[13] else None
        rep_to = str(row[14]).strip() if len(row) > 14 and row[14] else None
        rep_no = str(row[15]).strip() if len(row) > 15 and row[15] else None
        date_joined = clean_date(row[16]) if len(row) > 16 else None
        status = str(row[18]).strip() if len(row) > 18 and row[18] else 'Active'
        
        employees.append({
            "emp_no": emp_no,
            "name": name,
            "email": email,
            "dob": dob,
            "gender": gender,
            "marital_status": marital,
            "blood_group": blood,
            "phone": phone,
            "location": location,
            "department": dept,
            "job_title": job_title,
            "reporting_to": rep_to,
            "reporting_manager_emp_no": rep_no,
            "date_joined": date_joined,
            "status": status
        })
    return employees

def run_seed(excel_path: str = DEFAULT_EXCEL_PATH, execute: bool = False):
    print(f"=== DFY Staff Master Dossier Seeding Engine ===")
    print(f"Excel Source: {excel_path}")
    print(f"Mode: {'EXECUTE (Live Database Update)' if execute else 'DRY RUN (Preview Only)'}\n")
    
    excel_employees = load_excel_employees(excel_path)
    print(f"Loaded {len(excel_employees)} employees from Excel.")
    
    app_staff = pg_execute_raw(
        "SELECT id, name, district, pin, designation, is_active, phone, emp_no FROM staff_directory ORDER BY id ASC;",
        fetch=True
    ) or []
    print(f"Loaded {len(app_staff)} staff records from database.\n")
    
    # Build lookups
    excel_by_name = {normalize_name(e["name"]): e for e in excel_employees}
    excel_by_phone = {e["phone"]: e for e in excel_employees if e.get("phone")}
    
    tier1_exact = 0
    tier2_phone = 0
    tier3_token = 0
    matched_pairs = []
    unmatched_staff = []
    
    for s in app_staff:
        sid = s["id"]
        sname = str(s["name"]).strip()
        sdist = str(s.get("district", "")).strip().lower()
        sphone = clean_phone(s.get("phone"))
        name_key = normalize_name(sname)
        
        matched_emp = None
        match_reason = None
        
        # Tier 1: Exact Name (normalized)
        if name_key in excel_by_name:
            matched_emp = excel_by_name[name_key]
            match_reason = "Tier 1: Exact Name"
            tier1_exact += 1
            
        # Tier 2: Phone match (if DB has phone or by alias)
        elif sphone and sphone in excel_by_phone:
            matched_emp = excel_by_phone[sphone]
            match_reason = f"Tier 2: Phone Match ({sphone})"
            tier2_phone += 1
            
        # Tier 3: Token / District overlap
        else:
            s_tokens = set(name_key.split())
            best_e = None
            best_overlap = 0
            for e in excel_employees:
                e_norm = normalize_name(e["name"])
                e_tokens = set(e_norm.split())
                overlap = len(s_tokens.intersection(e_tokens))
                # If 2 words match or name is single word and matches
                if overlap >= 2 or (len(s_tokens) == 1 and overlap == 1 and len(e_tokens) == 1):
                    if overlap > best_overlap:
                        best_overlap = overlap
                        best_e = e
                # Also check district name in location
                elif overlap >= 1 and sdist and normalize_location(sdist) in normalize_location(str(e.get("location", ""))):
                    if overlap >= best_overlap:
                        best_overlap = overlap
                        best_e = e
            if best_e:
                matched_emp = best_e
                match_reason = f"Tier 3: Token/District Overlap ({best_e['name']})"
                tier3_token += 1
                
        if matched_emp:
            matched_pairs.append({
                "db_staff": s,
                "excel_emp": matched_emp,
                "reason": match_reason
            })
        else:
            unmatched_staff.append(s)
            
    total_matched = len(matched_pairs)
    total_db = len(app_staff)
    match_pct = (total_matched / total_db * 100) if total_db > 0 else 0
    
    print("--- MATCHING AUDIT BREAKDOWN ---")
    print(f"Tier 1 (Exact Clean Name):     {tier1_exact}")
    print(f"Tier 2 (10-Digit Phone Match): {tier2_phone}")
    print(f"Tier 3 (Token / District):     {tier3_token}")
    print(f"TOTAL MATCHED:                {total_matched} / {total_db} ({match_pct:.1f}%)")
    print(f"Unmatched in App:              {len(unmatched_staff)}")
    
    if unmatched_staff:
        print("\nSample Unmatched Staff (Manual Check):")
        for u in unmatched_staff[:10]:
            print(f" - #{u['id']} {u['name']} ({u['district']})")
            
    if execute:
        print("\nApplying database updates...")
        updated_count = 0
        for pair in matched_pairs:
            db_s = pair["db_staff"]
            e = pair["excel_emp"]
            
            sql = """
                UPDATE staff_directory
                SET 
                    emp_no = %s,
                    email = %s,
                    phone = COALESCE(NULLIF(%s, ''), staff_directory.phone),
                    blood_group = %s,
                    dob = %s,
                    date_joined = %s,
                    gender = %s,
                    marital_status = %s,
                    job_title = %s,
                    reporting_to = %s,
                    reporting_manager_emp_no = %s,
                    location = %s,
                    updated_at = NOW()
                WHERE id = %s;
            """
            params = [
                e["emp_no"],
                e["email"],
                e["phone"],
                e["blood_group"],
                e["dob"],
                e["date_joined"],
                e["gender"],
                e["marital_status"],
                e["job_title"],
                e["reporting_to"],
                e["reporting_manager_emp_no"],
                e["location"],
                db_s["id"]
            ]
            try:
                pg_execute_raw(sql, params)
                updated_count += 1
            except Exception as up_err:
                print(f"Error updating #{db_s['id']} ({db_s['name']}): {up_err}")
                
        try:
            cache.delete_prefix("staff_")
            cache.delete("staff_directory_all")
        except Exception:
            pass
            
        print(f"\n[SUCCESS] Updated {updated_count} staff records with full HR Dossier attributes!")
    else:
        print("\n[DRY RUN COMPLETE] Run with --execute to commit updates to database.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed Staff HR Master Dossier into PostgreSQL")
    parser.add_argument("--file", default=DEFAULT_EXCEL_PATH, help="Path to Employee Master Excel file")
    parser.add_argument("--execute", action="store_true", help="Execute database updates")
    args = parser.parse_args()
    
    run_seed(excel_path=args.file, execute=args.execute)
