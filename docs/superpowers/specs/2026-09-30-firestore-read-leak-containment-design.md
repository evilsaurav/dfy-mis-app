# Technical Design Spec: Firestore Read Leak Containment & Bounded Query Architecture

> **Date:** September 30, 2026  
> **Status:** Draft / Ready for Implementation  
> **Target:** `d:/ignou/Mis field report/main.py`  
> **Constraint:** Zero breaking changes to React Frontend (`AdminDashboard.jsx`, `App.jsx`) and zero production disruption.

---

## 1. Problem Statement & Root Cause Mechanics

### Issue 1: Nikshay Cumulative Ledger Unbounded Stream
- **Endpoint:** `GET /admin/nikshay/cumulative-ledger`
- **Location:** `main.py:8871-8876` and `8945-8950`
- **Defect:** 
  ```python
  query = db.collection("nikshay_verified_patients")
  if district and district != "All":
      query = query.where("district", "==", district)
  docs = await asyncio.to_thread(lambda: list(query.stream()))
  ```
- **Consequence:** The collection contains tens of thousands of cumulative verified TB patients across Bihar. Every cache-miss (TTL is only 180s) or page navigation streams all 30k+ documents into memory, then performs in-memory slicing `filtered[start_idx:end_idx]`. 100 admin clicks generate **3,000,000 to 5,000,000 reads**.

### Issue 2: Global Cache-Busting Cascade on Every Daily Report Submission
- **Endpoint:** `POST /submit-daily-report` and `record_report_mutation`
- **Location:** `main.py:2131` and `main.py:849-851`
- **Defect:**
  ```python
  cache.delete_prefix("profile_")
  cache.delete_prefix("dist_notif_registry_")
  ```
- **Consequence:** 200+ Field Officers across 22 districts submit reports throughout the afternoon and evening. When Officer A in Gaya submits, `delete_prefix("profile_")` deletes the profile cache for all 200+ officers in all districts. Their mobile apps then make `POST /my-profile-stats`, which queries `daily_field_reports` for that officer. Simultaneously, `dist_notif_registry_` is wiped for all districts, triggering 90-day multi-month collection streams across the state.

---

## 2. Technical Design & Architecture

### Component 1: Server-Side Bounded Queries & Exact ID Fast-Path
1. **Exact Episode ID Lookup:**
   When `search` is provided and represents an Episode ID (e.g. alphanumeric or numeric without spaces), check direct document existence first:
   `db.collection("nikshay_verified_patients").document(clean_search).get()`
   - Cost: **1 read** (instead of 30,000+ reads).
2. **Bounded Firestore Pagination:**
   For paginated requests without exact ID:
   `query = query.order_by("first_verified_at", direction=firestore.Query.DESCENDING).limit(limit).offset((page - 1) * limit)`
   - Cost: **30 reads per page** (instead of 30,000+ reads).
3. **Cached District Summary Metrics:**
   District aggregate metrics (`total_verified`, `hiv_dm_verified`, `bank_validated`, etc.) are cached per district with a 1-hour TTL (`ledger_metrics_{district}`).
4. **Exact Compatibility:**
   The output JSON schema retains all 8 fields:
   `{ success: true, total_records: ..., total_in_collection: ..., page: ..., limit: ..., total_pages: ..., metrics: {...}, patients: [...] }`

### Component 2: Scoped Cache Eviction & Safe Registry Fallback
1. **Single-Officer Profile Invalidation:**
   In `submit_daily_report`:
   ```python
   clean_wp = re.sub(r'[^a-zA-Z0-9]', '', str(report.working_place)).lower()
   clean_fo = re.sub(r'[^a-zA-Z0-9]', '', str(report.fo_name)).lower()
   month_tag = str(report.date_of_reporting)[:7]
   cache.delete(f"profile_{clean_wp}_{clean_fo}_{month_tag}")
   ```
   All other 199+ officers' caches remain warm in memory and on disk.
2. **District-Scoped Registry Invalidation:**
   In `record_report_mutation`:
   Only evict `dist_notif_registry_{clean_dist}_` for the specific district of the mutated report.
3. **Safe Registry Fallback Removal:**
   In `fetch_district_notification_registry`:
   Remove the unbounded fallback `where("date_of_reporting", ">=", start_date).stream()`. Always bound by district `where("working_place", "==", clean_dist).limit(1500)`.

---

## 3. Verification & Safety Protocol

1. **Compilation Gate:** `python -m py_compile main.py` exit 0.
2. **Automated Unit Tests:**
   - `tests/test_nikshay_cumulative_ledger_bounded_reads.py`
   - `tests/test_scoped_profile_and_registry_invalidation.py`
3. **Regression Suite:** All existing attendance, FDC, and RBAC tests must pass 100%.
4. **Frontend Build & Linter Check:** Confirm zero impact on `dfy-frontend/`.
5. **Human Approval:** Explicit user consent required before any git push.
