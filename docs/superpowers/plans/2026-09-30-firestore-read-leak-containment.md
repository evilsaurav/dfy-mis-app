# Firestore Read Leak Containment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate catastrophic Firestore read spikes (5M–8M reads/day down to < 50k reads/day) by replacing unbounded collection streams in Nikshay Cumulative Ledger with server-side bounded pagination, scoping profile cache eviction to individual submitting officers, and removing dangerous statewide fallback streams.

**Architecture:** 
1. **Nikshay Cumulative Ledger:** Replace statewide `query.stream()` and client-side RAM slicing with server-side indexed queries, direct single-document lookups for Episode ID searches, and 15-minute cached district summaries.
2. **Profile & Registry Cache Scoping:** Replace global `cache.delete_prefix("profile_")` on every report submission with targeted single-officer key deletion, preventing the cascade that forces 200+ mobile apps to re-stream Firestore data. Eliminate statewide 90-day fallback queries in `fetch_district_notification_registry`.

**Tech Stack:** FastAPI, Python 3.14 / 3.12, Google Cloud Firestore, pytest, pytest-asyncio.

**Spec:** `docs/superpowers/specs/2026-09-30-firestore-read-leak-containment-design.md`

## Global Constraints
- **LIVE PRODUCTION ENVIRONMENT:** This application is live in 22 districts of Bihar for TB patient tracking. Zero runtime crashes, zero 500 errors, zero downtime.
- **ZERO FRONTEND BREAKING CHANGES:** Backend response schemas for `/admin/nikshay/cumulative-ledger`, `/my-profile-stats`, and `/api/district-notification-registry` must match 100% with what `AdminDashboard.jsx` and `App.jsx` expect.
- **STRICT DISTRICT RBAC:** Sub-Admins must never access or view records outside their permitted districts.
- **ZERO UNTESTED PUSHES:** All changes committed locally only. Verification battery (Python compilation, automated test suites, Vite build) must pass 100% before requesting user approval to push.

---

### Task 1: Server-Side Bounded Query & Exact-ID Fast Path for Nikshay Cumulative Ledger

**Files:**
- Test: `tests/test_nikshay_cumulative_ledger_bounded_reads.py`
- Modify: `main.py:8860-8938` (`get_cumulative_ledger`)

**Interfaces:**
- Endpoint: `GET /admin/nikshay/cumulative-ledger`
- Parameters: `page: int = 1`, `limit: int = 30`, `search: Optional[str] = None`, `district: Optional[str] = "All"`
- Output Schema:
  ```json
  {
    "success": true,
    "total_records": 120,
    "total_in_collection": 120,
    "page": 1,
    "limit": 30,
    "total_pages": 4,
    "metrics": {
      "total_verified": 120,
      "hiv_dm_verified": 95,
      "bank_validated": 80,
      "udst_done": 60,
      "contact_tracing_done": 50
    },
    "patients": [...]
  }
  ```

- [ ] **Step 1: Write the failing test for bounded reads and exact Episode ID search**

Create `tests/test_nikshay_cumulative_ledger_bounded_reads.py` verifying:
1. Exact Episode ID search uses single document get (`db.collection(...).document(id).get()`), NOT `query.stream()`.
2. Paginated queries enforce `.limit(limit)` on Firestore queries and never stream the whole collection.
3. Sub-Admin RBAC denies access (HTTP 403) to unauthorized districts.
4. Response schema exactly matches the 8 expected fields.

```python
import pytest
import asyncio
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from main import app, cache, create_access_token

client = TestClient(app)

def make_admin_token(role="SUPER_ADMIN", allowed=None):
    return create_access_token({
        "user_id": "test_admin",
        "username": "test_admin",
        "role": role,
        "allowed_districts": allowed or ["All"]
    })

@pytest.fixture(autouse=True)
def clean_cache():
    cache.clear()
    yield
    cache.clear()

def test_exact_episode_id_search_single_get():
    token = make_admin_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    with patch("main.db") as mock_db:
        mock_doc = MagicMock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {
            "patient_id": "12345678",
            "patient_name": "Ramesh Kumar",
            "district": "Patna",
            "hiv_dm_tested": True
        }
        mock_doc_ref = MagicMock()
        mock_doc_ref.get.return_value = mock_doc
        mock_col = MagicMock()
        mock_col.document.return_value = mock_doc_ref
        mock_db.collection.return_value = mock_col
        
        response = client.get("/admin/nikshay/cumulative-ledger?search=12345678", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert len(data["patients"]) == 1
        assert data["patients"][0]["patient_id"] == "12345678"
        # Confirm stream() was NEVER called
        assert not mock_col.stream.called
```

- [ ] **Step 2: Run test to confirm failure (RED)**

Run:
```powershell
python -m pytest tests/test_nikshay_cumulative_ledger_bounded_reads.py -v
```
Expected: Fails or stream was called instead of direct document get.

- [ ] **Step 3: Implement bounded queries and direct document lookup in `main.py`**

In `main.py` (`get_cumulative_ledger`, lines 8860–8938):
1. Normalize and canonicalize inputs (`district`, `search`).
2. If `search` is provided and looks like an ID (no spaces or matches document format), check `db.collection("nikshay_verified_patients").document(clean_search_id).get()`. If found, return immediate 1-read response.
3. For paginated list queries:
   - Cache summary metrics per district with a 1-hour TTL (`ledger_metrics_{district}`).
   - Query Firestore applying `.limit(limit)` with pagination offset/cursor instead of loading all 50k+ records.
   - Cache page results with a 15-minute TTL (`ledger_page_{district}_{page}_{limit}`).

- [ ] **Step 4: Run tests to verify green (GREEN)**

Run:
```powershell
python -m pytest tests/test_nikshay_cumulative_ledger_bounded_reads.py -v
```
Expected: 100% pass.

- [ ] **Step 5: Run Python compilation check**

Run:
```powershell
python -m py_compile main.py
```
Expected: Exit code 0.

- [ ] **Step 6: Commit Task 1 locally**

```powershell
git add main.py tests/test_nikshay_cumulative_ledger_bounded_reads.py
git commit -m "fix(perf): replace unbounded nikshay ledger collection streams with server-side bounded pagination and exact id lookup"
```

---

### Task 2: Scoped Single-Officer Profile Eviction & Safe District Registry Fallback

**Files:**
- Test: `tests/test_scoped_profile_and_registry_invalidation.py`
- Modify: `main.py:2125-2135` (`submit_daily_report`)
- Modify: `main.py:846-852` (`record_report_mutation`)
- Modify: `main.py:1840-1860` (`fetch_district_notification_registry`)

**Interfaces:**
- Function: `record_report_mutation(action, doc_id, district, date, old_district, report_data)`
- Function: `fetch_district_notification_registry(clean_dist, months)`

- [ ] **Step 1: Write the failing test for scoped cache eviction and safe registry boundaries**

Create `tests/test_scoped_profile_and_registry_invalidation.py` verifying:
1. When Officer A in Gaya submits a report, Officer B in Patna's profile cache (`profile_patna_officer_b_2026-09`) remains warm in `cache`.
2. District notification registry for unrelated districts (`dist_notif_registry_Muzaffarpur_...`) is NOT deleted when Gaya submits.
3. `fetch_district_notification_registry` never issues a full-collection stream without district bounds even if `working_place` query returns empty.

```python
import pytest
import asyncio
from unittest.mock import MagicMock, patch
from main import cache, submit_daily_report, record_report_mutation, fetch_district_notification_registry, DailyReport

@pytest.fixture(autouse=True)
def clean_cache():
    cache.clear()
    yield
    cache.clear()

def test_profile_cache_scoped_eviction():
    # Warm up caches for Officer A (Gaya) and Officer B (Patna)
    cache.set("profile_gaya_officera_2026-09", {"stats": "officer_a"}, ttl=1800)
    cache.set("profile_patna_officerb_2026-09", {"stats": "officer_b"}, ttl=1800)
    
    # Officer A submits
    # After submission, officer B's cache must still be present!
    # Officer A's cache must be evicted.
```

- [ ] **Step 2: Run test to confirm failure (RED)**

Run:
```powershell
python -m pytest tests/test_scoped_profile_and_registry_invalidation.py -v
```
Expected: Fails because `cache.delete_prefix("profile_")` currently evicts both.

- [ ] **Step 3: Implement scoped cache eviction and registry safety in `main.py`**

1. In `submit_daily_report` (line 2131):
   - Replace `cache.delete_prefix("profile_")` with targeted deletion for submitting officer:
     ```python
     clean_wp_tag = re.sub(r'[^a-zA-Z0-9]', '', str(report.working_place)).lower()
     clean_fo_tag = re.sub(r'[^a-zA-Z0-9]', '', str(report.fo_name)).lower()
     month_tag = str(report.date_of_reporting)[:7]
     cache.delete(f"profile_{clean_wp_tag}_{clean_fo_tag}_{month_tag}")
     cache.delete(f"profile_{report.working_place}_{report.fo_name}_{month_tag}".replace(" ", "_").lower())
     ```
2. In `record_report_mutation` (lines 846-852):
   - Only invalidate the specific target district's registry prefix (`dist_notif_registry_{clean_dist}_`), never statewide wildcard.
3. In `fetch_district_notification_registry` (lines 1851-1857):
   - Remove the unbounded statewide fallback `where("date_of_reporting", ">=", start_date).stream()`. Enforce strict district scope with `.where("working_place", "==", clean_dist).limit(1500)`.

- [ ] **Step 4: Run tests to verify green (GREEN)**

Run:
```powershell
python -m pytest tests/test_scoped_profile_and_registry_invalidation.py -v
```
Expected: 100% pass.

- [ ] **Step 5: Run full regression test suite**

Run:
```powershell
python -m pytest tests/test_attendance_leaves_and_lifecycle.py tests/test_district_registry.py tests/test_fo_leave_sync_and_calendar.py -v
```
Expected: 100% pass across all regression tests.

- [ ] **Step 6: Run Python compilation and Frontend verification battery**

Run:
```powershell
python -m py_compile main.py
npm --prefix dfy-frontend run lint
npm --prefix dfy-frontend run build
```
Expected: Zero compilation errors, 0 linter syntax errors, Vite build exit code 0.

- [ ] **Step 7: Commit Task 2 locally**

```powershell
git add main.py tests/test_scoped_profile_and_registry_invalidation.py
git commit -m "fix(cache): scope profile and notification registry evictions to submitting officer and district"
```

---

## Verification & Rollout Battery Before User Approval

Before asking for user approval to push:
1. `python -m py_compile main.py` must exit 0.
2. `python -m pytest tests/test_nikshay_cumulative_ledger_bounded_reads.py tests/test_scoped_profile_and_registry_invalidation.py` must pass 100%.
3. `npm --prefix dfy-frontend run lint` must show 0 syntax errors.
4. `npm --prefix dfy-frontend run build` must succeed with exit code 0.
5. `git diff` audit line-by-line confirming only intended backend performance and cache scoping lines are modified.
6. Present complete test evidence and verification output to the user.
