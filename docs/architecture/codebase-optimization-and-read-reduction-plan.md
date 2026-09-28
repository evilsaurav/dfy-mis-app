# DFY TB MIS — Codebase Optimization & Firestore Read Reduction Plan
**Branch:** `feat/travel-allowance-bike-log`  
**Status:** Saved for future execution post-TA deployment.  
**Scope:** Firestore Read Reduction (70-95%), N+1 Batching, Centralized Cache Eviction, and Write-Time Rollups.

---

## 1. Executive Summary & Audit Baseline
During the September 2026 audit of `main.py`, `AdminDashboard.jsx`, and `App.jsx`, key hotspots were cataloged:
1. **50 Unfiltered `.stream()` Calls:** Full collection scans (e.g., `main.py:10574` streaming all `travel_allowance_logs` across all months and districts; `main.py:10660` streaming entire `staff_directory` on Excel export).
2. **8 N+1 Sequential Read Loops:** Repetitive single-document queries in loops across candidate PIN verifications and profile statistics (`validate_staff_pin:1421`, `my_profile_stats:2920`, `add_missing_id:4549`, `get_ta_log:9701`, `file_ta_dispute:10161`).
3. **Frontend Waterfall:** Switching district/month triggered 9 parallel requests in `AdminDashboard.jsx` (including duplicate `/staff-directory` and `/admin/staff/list` calls).
4. **Blind Polling:** 45-second background interval polling without checking document visibility state.
5. **Monolithic Bundle:** `AdminDashboard.jsx` compiled to 1.08 MB minified JS.

---

## 2. Risk & Drawbacks Analysis of Pure Caching / Splitting
1. **Cache Invalidation & Stale Data Risk:** In-memory caching without atomic invalidation can serve outdated credentials or deactivated staff. Multi-worker Uvicorn setups on Render can cause cache drift.
2. **Render RAM Pressure:** Render Starter instances have a 512 MB memory limit; unbounded in-memory caches risk Out-Of-Memory (OOM) crashes.
3. **Missing Composite Index Failures:** Changing queries to compound `.where()` requires deployed Firestore indexes; un-indexed combinations trigger `FAILED_PRECONDITION`.
4. **Bihar 3G/4G Network & Lazy Chunks:** Naive `React.lazy` chunk splitting can trigger `ChunkLoadError` white screens during intermittent cellular drops in rural field areas.

---

## 3. Recommended Phased Implementation Strategy (Post-TA Rollout)

### Step 1: Zero-Risk Safe Batching & Scoped Queries
- Replace candidate PIN lookup loops with `db.get_all([candidate_refs])`.
- Ensure `get_ta_analytics` and TA Excel exports use scoped queries (`.where("month", "==", month).where("district", "==", district)`).

### Step 2: Unified Staff Cache with Instant Eviction Guard
- Centralize `staff_directory` reads via a single helper (`get_staff_directory_cached()`).
- Attach immediate cache evictions to all mutation endpoints (`/admin/staff/update-details`, `/admin/staff/update-status`).

### Step 3: Write-Time Rollups (Industry Standard Architecture)
- Introduce single counter/summary documents (`monthly_district_summary/{month}_{district}`) updated via `firestore.Increment()` on report and TA submissions.
- Reduces dashboard read costs from ~3,000 document reads to **1 document read**.

### Step 4: Resilient Client-Side Optimization
- Pause background polling when `document.hidden` is true.
- Deduplicate `/staff-directory` and `/admin/staff/list` fetches.
- Wrap any code-split studios with offline prefetching and retry error boundaries.
