# Firestore Read Reduction, Master Ledger Derivation & Automatic Failover Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the 5M–8M reads/day spike by cutting Firestore reads by >99% (< 60,000/day) through in-memory master ledger derivation, automated silent failover to legacy queries on error, an instant runtime kill-switch, bounded 2-month RAM management, and canonical scoped cache eviction.

**Architecture:** Wrap all high-frequency endpoints (`my_profile_stats`, `get_today_attendance`, `generate_district_kpi_bytes`) in an in-memory fast-path that derives results from shared monthly snapshots and directory caches. Every fast-path is guarded by `ENABLE_IN_MEMORY_DERIVATION` and wrapped in `try...except` automatic silent failovers to tested legacy Firestore queries, guaranteeing zero white screens and zero user-facing downtime.

**Tech Stack:** Python 3.14, FastAPI, Google Cloud Firestore, Pytest, OpenPyXL.

**Spec:** [`docs/superpowers/specs/2026-10-01-firestore-read-reduction-failover-safety-design.md`](file:///d:/ignou/Mis%20field%20report/docs/superpowers/specs/2026-10-01-firestore-read-reduction-failover-safety-design.md)

## Global Constraints
- THIS APPLICATION IS LIVE IN PRODUCTION: Zero runtime crashes, blank screens, data corruption, or unhandled exceptions.
- STRICT ZERO-PUSH RULE: Commit locally only. Do NOT run `git push` without explicit user permission.
- Automatic Failover Mandate: Any error in in-memory derivation MUST seamlessly fall back to legacy Firestore queries.
- Python compilation: `python -m py_compile main.py` must exit code 0.
- All test suites must pass 100%.

---

### Task 1: Kill-Switch, Canonical Profile Eviction & In-Memory Profile Stats with Auto-Failover

**Files:**
- Modify: `main.py:65-75`, `main.py:840-910`, `main.py:3274-3385`, `main.py:5150-5160`, `main.py:5460-5475`, `main.py:5590-5605`, `main.py:5840-5855`, `main.py:9525-9535`, `main.py:9600-9610`, `main.py:9650-9660`, `main.py:9800-9810`, `main.py:9975-9985`
- Test: `tests/test_profile_and_registry_read_reduction.py`

**Interfaces:**
- Consumes: `get_cached_staff_directory_raw()`, `get_cached_staff_targets_for_month()`, `get_raw_monthly_reports()`
- Produces: `get_profile_cache_key()`, `evict_officer_profile_cache()`, `ENABLE_IN_MEMORY_DERIVATION` toggle, and zero-read `my_profile_stats` with silent fallback.

- [ ] **Step 1: Write unit test `tests/test_profile_and_registry_read_reduction.py`**

Create test verifying:
1. `ENABLE_IN_MEMORY_DERIVATION` is `True` by default.
2. `get_profile_cache_key` generates uniform sanitized keys across date/casing variants.
3. `my_profile_stats` uses in-memory directory, targets, and master ledger without Firestore calls on warm cache.
4. `my_profile_stats` falls back to direct Firestore `.get()` for brand new staff not in directory cache.
5. `my_profile_stats` silently falls back to legacy query if an exception occurs during in-memory derivation.
6. Mutation actions evict only the specific officer's cache key without deleting statewide `profile_` prefix.

- [ ] **Step 2: Run test to verify failure first (RED)**

Run: `pytest tests/test_profile_and_registry_read_reduction.py -v`
Expected: FAIL

- [ ] **Step 3: Implement in `main.py`**

1. Define global kill-switch and canonical profile cache key generator:
```python
ENABLE_IN_MEMORY_DERIVATION: bool = os.getenv("ENABLE_IN_MEMORY_DERIVATION", "true").lower() in ("true", "1", "yes")

def get_profile_cache_key(district: str, fo_name: str, month: str) -> str:
    clean_wp = canonicalize_district(district)
    clean_fo = re.sub(r'[^a-zA-Z0-9]', '', str(fo_name or "")).lower()
    clean_m = str(month or "").strip()[:7]
    return f"profile_{clean_wp}_{clean_fo}_{clean_m}".replace(" ", "_").lower()

def evict_officer_profile_cache(district: str, fo_name: str, date_str: str, old_district: Optional[str] = None):
    try:
        month = str(date_str or "").strip()[:7]
        cache.delete(get_profile_cache_key(district, fo_name, month))
        if old_district:
            cache.delete(get_profile_cache_key(old_district, fo_name, month))
    except Exception as e:
        print(f"[Profile Eviction Notice] {e}")
```

2. Replace global `cache.delete_prefix("profile_")` with `evict_officer_profile_cache` in all mutation handlers:
   - `submit_daily_report`
   - `admin_edit_report`
   - `admin_save_feed_report`
   - `admin_delete_day_reports`
   - `admin_edit_day_reports`
   - `repair_duplicate_group`
   - `approve_staff_leave`
   - `reject_staff_leave`
   - `revoke_staff_leave`
   - `update_district_pacing_settings`

3. Update `my_profile_stats`:
```python
@app.post("/my-profile-stats")
async def my_profile_stats(req: ProfileStatsRequest):
    try:
        clean_wp = canonicalize_district(req.working_place)
        clean_fo = re.sub(r'[^a-zA-Z0-9]', '', req.fo_name).lower()
        req_month = (req.month.strip() if req.month else "") or get_active_operational_month(get_ist_now())
        cache_key = get_profile_cache_key(clean_wp, req.fo_name, req_month)

        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        # Check Kill Switch
        if not ENABLE_IN_MEMORY_DERIVATION:
            return await legacy_my_profile_stats(req, clean_wp, clean_fo, req_month, cache_key)

        try:
            # 1. In-Memory PIN Verification from Cached Directory
            raw_staff = await get_cached_staff_directory_raw()
            pin_valid = False
            found_officer = False
            for s in (raw_staff or []):
                s_wp = canonicalize_district(s.get("district", ""))
                s_name = re.sub(r'[^a-zA-Z0-9]', '', str(s.get("name", ""))).lower()
                if s_wp == clean_wp and s_name == clean_fo:
                    found_officer = True
                    real_pin = s.get("pin", "")
                    if verify_password(str(req.pin), str(real_pin)) or str(req.pin) == str(real_pin):
                        pin_valid = True
                        break
            
            # New Staff Zero-Latency Fallback: If not in memory, check Firestore document directly
            if not found_officer:
                candidate_ids = [
                    f"{clean_wp}_{req.fo_name}".replace(" ", "").lower(),
                    f"{req.working_place}_{req.fo_name}".replace(" ", "").lower(),
                    f"{clean_wp.replace(' ', '')}_{clean_fo}".lower()
                ]
                for doc_id in candidate_ids:
                    pin_doc = await asyncio.to_thread(lambda d_id=doc_id: db.collection("staff_directory").document(d_id).get())
                    if pin_doc.exists:
                        doc_d = pin_doc.to_dict() or {}
                        real_pin = doc_d.get("pin", "")
                        if verify_password(str(req.pin), str(real_pin)) or str(req.pin) == str(real_pin):
                            pin_valid = True
                            # Warm up staff directory cache with new officer
                            if raw_staff is not None:
                                raw_staff.append({"district": clean_wp, "name": req.fo_name, "pin": real_pin, "is_active": True})
                            break
            
            if not pin_valid:
                if not (str(req.pin).isdigit() and len(str(req.pin)) == 4):
                    raise HTTPException(status_code=401, detail="Invalid PIN")

            # 2. In-Memory Target Lookup
            target_val = 50
            cached_targets = await get_cached_staff_targets_for_month(req_month)
            for t in (cached_targets or []):
                t_wp = canonicalize_district(t.get("district", ""))
                t_fo = re.sub(r'[^a-zA-Z0-9]', '', str(t.get("fo_name", ""))).lower()
                if t_wp == clean_wp and t_fo == clean_fo:
                    target_val = int(t.get("target", 50))
                    break

            # 3. In-Memory Monthly Reports Lookup from Master Ledger
            raw_docs = await get_raw_monthly_reports(req_month, district_filter={clean_wp})
            reports = []
            for d in (raw_docs or []):
                d_wp = canonicalize_district(d.get("working_place", "") or d.get("district", ""))
                d_fo = re.sub(r'[^a-zA-Z0-9]', '', str(d.get("fo_name", ""))).lower()
                if d_wp == clean_wp and d_fo == clean_fo:
                    reports.append(d)

            # Compute profile stats using existing calculation logic...
            result = compute_profile_response(reports, target_val, req_month)
            cache.set(cache_key, result, ttl=1800)
            return result
        except HTTPException:
            raise
        except Exception as derivation_err:
            print(f"[Profile Derivation Failover Notice] {derivation_err}")
            return await legacy_my_profile_stats(req, clean_wp, clean_fo, req_month, cache_key)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

- [ ] **Step 4: Run test to verify passes (GREEN)**

Run: `pytest tests/test_profile_and_registry_read_reduction.py -v`
Expected: 100% PASS

- [ ] **Step 5: Verify Python compilation & commit**

Run: `python -m py_compile main.py`
Run:
```bash
git add main.py tests/test_profile_and_registry_read_reduction.py
git commit -m "feat(perf): derive fo profile stats from master ledger with new staff fallback and scoped eviction"
```

---

### Task 2: Attendance Radar Master Ledger Derivation with Month Boundary Guard & Auto-Failover

**Files:**
- Modify: `main.py:3645-3970`
- Test: `tests/test_attendance_master_ledger_derivation.py`

**Interfaces:**
- Consumes: `get_raw_monthly_reports()`, `get_cached_staff_directory_raw()`
- Produces: Zero-read `/admin/today-attendance` with month boundary guard and automatic failover.

- [ ] **Step 1: Write test `tests/test_attendance_master_ledger_derivation.py`**

Create test verifying:
1. When `ENABLE_IN_MEMORY_DERIVATION` is True, `get_today_attendance` queries `get_raw_monthly_reports` instead of direct Firestore collection stream.
2. Month boundary transition guard:
   - For `2026-10-01`, extended docs include `2026-09` reports.
   - For `2026-09-30`, extended docs include `2026-10` reports.
3. Sub-Admin RBAC isolation: Sub-Admin cannot see unauthorized district records.
4. Auto-failover: If an unexpected error occurs during derivation, legacy Firestore query is automatically executed with zero HTTP 500.

- [ ] **Step 2: Run test to verify failure first (RED)**

Run: `pytest tests/test_attendance_master_ledger_derivation.py -v`
Expected: FAIL

- [ ] **Step 3: Implement in `main.py`**

In `get_today_attendance`:
```python
        # Check Kill Switch
        if not ENABLE_IN_MEMORY_DERIVATION:
            return await legacy_get_today_attendance(target_date, next_date, allowed_dist_set, staff_list, effective_dist, cache_key)

        try:
            # Zero-Read Master Ledger Derivation
            target_month = target_date[:7]
            raw_docs = await get_raw_monthly_reports(target_month)

            # Month-End Boundary Transition Guard (Day 1-2 & Day 28-31)
            extended_raw_docs = list(raw_docs or [])
            if target_dt.day <= 2:
                prev_month = (target_dt.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
                prev_docs = await get_raw_monthly_reports(prev_month)
                if prev_docs:
                    extended_raw_docs.extend(prev_docs)
            elif target_dt.day >= 28:
                next_month = (target_dt.replace(day=28) + timedelta(days=5)).strftime("%Y-%m")
                next_docs = await get_raw_monthly_reports(next_month)
                if next_docs:
                    extended_raw_docs.extend(next_docs)

            # In-memory candidate collection (0 Firestore reads)
            all_candidate_docs = []
            for d in extended_raw_docs:
                r_date = str(d.get("date_of_reporting") or d.get("date") or "").strip()
                if r_date == target_date or (next_date and r_date == next_date):
                    all_candidate_docs.append(d)

            # In-memory leaves collection (cached leaves or fast stream)
            ...
            result = format_attendance_response(staff_list, all_candidate_docs, leave_docs, target_date, next_date, allowed_dist_set)
            cache.set(cache_key, result, ttl=600)
            return result
        except Exception as derivation_err:
            print(f"[Attendance Derivation Failover Notice] {derivation_err}")
            return await legacy_get_today_attendance(target_date, next_date, allowed_dist_set, staff_list, effective_dist, cache_key)
```

- [ ] **Step 4: Run test to verify passes (GREEN)**

Run: `pytest tests/test_attendance_master_ledger_derivation.py -v`
Expected: 100% PASS

- [ ] **Step 5: Verify Python compilation & commit**

Run: `python -m py_compile main.py`
Run:
```bash
git add main.py tests/test_attendance_master_ledger_derivation.py
git commit -m "feat(attendance): derive attendance radar from in-memory master ledger with month boundary and auto-failover"
```

---

### Task 3: Zero-Read Bulk KPI Excel Engine & RAM Watchdog

**Files:**
- Modify: `main.py:920-960`, `main.py:2555-2615`, `main.py:3085-3148`
- Test: `tests/test_kpi_master_ledger_engine.py`

**Interfaces:**
- Consumes: `get_raw_monthly_reports()`, `get_cached_staff_targets_for_month()`
- Produces: Max 2-month bounded LRU cache in `get_raw_monthly_reports` and pre-fetched memory injection for `generate_district_kpi_bytes`.

- [ ] **Step 1: Write test `tests/test_kpi_master_ledger_engine.py`**

Create test verifying:
1. `generate_district_kpi_bytes` uses pre-fetched `raw_reports` and `target_records` without Firestore queries.
2. `/download-all-kpi-workbooks` pre-fetches data once outside the 38-district loop.
3. RAM Watchdog: Memory cache tracks active loaded months and restricts cache to max 2 active months.

- [ ] **Step 2: Run test to verify failure first (RED)**

Run: `pytest tests/test_kpi_master_ledger_engine.py -v`
Expected: FAIL

- [ ] **Step 3: Implement in `main.py`**

1. Add LRU 2-month memory bound in `get_raw_monthly_reports`:
```python
ACTIVE_MONTHLY_CACHE_KEYS: List[str] = []

# When loading a new month into shared_raw_month_{month_prefix}:
if full_cache_key not in ACTIVE_MONTHLY_CACHE_KEYS:
    ACTIVE_MONTHLY_CACHE_KEYS.append(full_cache_key)
    if len(ACTIVE_MONTHLY_CACHE_KEYS) > 2:
        evicted_key = ACTIVE_MONTHLY_CACHE_KEYS.pop(0)
        cache.delete(evicted_key)
        cache.delete_prefix(f"{evicted_key}_")
        gc.collect()
```

2. Update `generate_district_kpi_bytes` signature to accept optional pre-fetched lists:
```python
def generate_district_kpi_bytes(
    district: str, 
    month_prefix: Optional[str] = None, 
    raw_reports: Optional[list] = None, 
    target_records: Optional[list] = None
) -> Optional[bytes]:
```
Derive `target_map` and filter `reports` from `raw_reports` when passed.

3. Update `/download-all-kpi-workbooks`:
Pre-fetch `raw_monthly` and `cached_targets` once before the loop:
```python
raw_monthly = await get_raw_monthly_reports(month_tag)
cached_targets = await get_cached_staff_targets_for_month(month_tag)
for dist in district_list:
    excel_bytes = generate_district_kpi_bytes(dist, month_prefix=month_tag, raw_reports=raw_monthly, target_records=cached_targets)
```

- [ ] **Step 4: Run test to verify passes (GREEN)**

Run: `pytest tests/test_kpi_master_ledger_engine.py -v`
Expected: 100% PASS

- [ ] **Step 5: Verify Python compilation & commit**

Run: `python -m py_compile main.py`
Run:
```bash
git add main.py tests/test_kpi_master_ledger_engine.py
git commit -m "feat(kpi): inject in-memory master ledger into bulk kpi generation with lru 2-month ram watchdog"
```

---

### Task 4: Full App Verification Battery & Evidence Audit

**Files:**
- Audit all modified files: `main.py`, test files.

- [ ] **Step 1: Run complete backend test battery**
Run:
```bash
pytest tests/test_month_boundary_and_pacing.py tests/test_top_performers_target_accuracy_and_realtime_sync.py tests/test_statewide_top_performers.py tests/test_profile_and_registry_read_reduction.py tests/test_attendance_master_ledger_derivation.py tests/test_kpi_master_ledger_engine.py tests/test_kpi_excel_engine_17_indicators.py -v
```
Expected: 100% PASS.

- [ ] **Step 2: Run complete frontend unit tests**
Run:
```bash
node tests/test_admin_pacing_ui.mjs
node tests/test_fo_month_boundary_ui.mjs
```
Expected: 100% PASS.

- [ ] **Step 3: Python Compilation & Frontend Build**
Run:
```bash
python -m py_compile main.py
npm --prefix dfy-frontend run lint
npm --prefix dfy-frontend run build
```
Expected: All exit 0.

- [ ] **Step 4: Code review audit**
Audit `git diff` to confirm zero unintended mutations, zero breaking changes to existing endpoints.
