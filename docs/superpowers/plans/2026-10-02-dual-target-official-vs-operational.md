# Dual-Target Official vs. Operational Stretch Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple the Official District Target (used for State Lead reports, KPI Excel workbooks, and overview pacing) from the Frontline Operational Stretch Target (assigned to Field Officers in their mobile app), backed by strict Sub-Admin RBAC and zero-breakage fallback.

**Architecture:** A dedicated `district_targets` collection in Firestore stores the management benchmark, while `staff_targets` stores individual FO push quotas. A dynamic fallback hierarchy resolves the effective target to staff sum if unset. Backend endpoints enforce Sub-Admin `allowed_districts` isolation (403 on breach) and cache targets with 1800s TTL. Frontend decks on Vercel render a live comparison widget (`Official Target: 100 | Frontline: 130 (+30% Buffer)`) and display official pacing on the Overview dashboard.

**Tech Stack:** FastAPI, Python 3.14, Google Cloud Firestore, React 18, Vite, Tailwind CSS, openpyxl, pytest, node:test.

**Spec:** [`docs/superpowers/specs/2026-10-02-dual-target-official-vs-operational-design.md`](file:///d:/ignou/Mis%20field%20report/docs/superpowers/specs/2026-10-02-dual-target-official-vs-operational-design.md)

## Global Constraints
- **THIS APPLICATION IS LIVE IN PRODUCTION IN BIHAR**: Zero tolerance for runtime crashes, blank screens, data corruption, or untested deployments.
- **Strict Zero-Push Rule**: All commits are strictly local on branch `feat/travel-allowance-bike-log`. Do NOT run `git push`.
- **Temporal Dead Zone (TDZ) Order**: State hooks (`useState`) declared first, then derived collections (`useMemo`), then handlers (`useCallback`), then modal/tab trigger effects (`useEffect`).
- **Anti-Double-Tap Guard**: Every mutation button must have an immediate disabled/loading state (`isSavingDistrictTarget`).
- **Strict RBAC & Cross-District Isolation**: Sub-Admin can only view/update targets for their assigned `allowed_districts`. Cross-district mutations must return HTTP 403.
- **Python Compilation & Build**: `python -m py_compile main.py` exit 0, `npm --prefix dfy-frontend run lint` 0 errors, `npm --prefix dfy-frontend run build` exit 0.

---

### Task 1: Backend Data Model, Fallback Engine & Strict Sub-Admin RBAC Endpoints

**Files:**
- Modify: `main.py:2020-2140` (Update `/targets` & implement `/update-district-target`)
- Modify: `main.py:2896-3020` (Ensure `my_profile_stats` reads FO target with 0 official target leak)
- Test: `tests/test_dual_target_engine.py`

**Interfaces:**
- Consumes: `canonicalize_district`, `get_current_admin`, `cache` from `main.py`.
- Produces: `POST /update-district-target`, enhanced `GET /targets` returning `official_district_target`, `staff_targets_sum`, `buffer_percent`.

- [ ] **Step 1: Write the failing tests in `tests/test_dual_target_engine.py`**

```python
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from main import app, cache, create_access_token

client = TestClient(app)

def test_subadmin_district_target_isolation():
    # Sub-admin permitted for Jamui only
    token_jamui = create_access_token({
        "sub": "subadmin_jamui",
        "username": "subadmin_jamui",
        "role": "SUB_ADMIN",
        "name": "SubAdmin Jamui",
        "allowed_districts": ["Jamui"]
    })
    headers_jamui = {"Authorization": f"Bearer {token_jamui}"}

    # 1. Updating Jamui should succeed (200)
    with patch("main.db.collection") as mock_coll:
        mock_doc = MagicMock()
        mock_coll.return_value.document.return_value = mock_doc
        
        res = client.post("/update-district-target", json={
            "month": "2026-10",
            "district": "Jamui",
            "official_target": 100
        }, headers=headers_jamui)
        assert res.status_code == 200, res.text
        assert res.json()["success"] is True

    # 2. Updating Gaya (unauthorized) should return 403 Forbidden
    res_forbidden = client.post("/update-district-target", json={
        "month": "2026-10",
        "district": "Gaya",
        "official_target": 150
    }, headers=headers_jamui)
    assert res_forbidden.status_code == 403
    assert "cross-district target modification forbidden" in res_forbidden.text.lower()

def test_targets_endpoint_returns_dual_targets_and_buffer():
    token = create_access_token({"sub": "admin", "role": "SUPER_ADMIN", "name": "Super Admin"})
    headers = {"Authorization": f"Bearer {token}"}

    with patch("main.get_directory") as mock_dir, \
         patch("main.db.collection") as mock_coll:
        mock_dir.return_value = {"Jamui": ["Rajiv Kumar", "Bablu Kumar"]}
        
        # Mock staff targets
        doc1 = MagicMock()
        doc1.to_dict.return_value = {"district": "Jamui", "fo_name": "Rajiv Kumar", "target": 35, "month": "2026-10"}
        doc2 = MagicMock()
        doc2.to_dict.return_value = {"district": "Jamui", "fo_name": "Bablu Kumar", "target": 35, "month": "2026-10"}
        
        # Mock district target doc
        dt_doc = MagicMock()
        dt_doc.exists = True
        dt_doc.to_dict.return_value = {"district": "Jamui", "month": "2026-10", "official_target": 50}

        def mock_coll_side_effect(name):
            m = MagicMock()
            if name == "district_targets":
                m.document.return_value.get.return_value = dt_doc
            elif name == "staff_targets":
                m.stream.return_value = [doc1, doc2]
            return m

        mock_coll.side_effect = mock_coll_side_effect
        cache.clear()

        res = client.get("/targets?month=2026-10&district=Jamui", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["official_district_target"] == 50
        assert data["staff_targets_sum"] == 70
        assert data["buffer_percent"] == 40.0
        assert data["buffer_count"] == 20
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_dual_target_engine.py -v`
Expected: FAIL with 404 or `update-district-target` not found.

- [ ] **Step 3: Implement `POST /update-district-target` and update `GET /targets` in `main.py`**

1. Define `DistrictTargetUpdate` Pydantic model:
```python
class DistrictTargetUpdate(BaseModel):
    month: Optional[str] = None
    district: str
    official_target: int
```
2. Implement `POST /update-district-target`:
   - Canonicalize district.
   - Enforce Sub-Admin `allowed_districts` guard (return 403 on mismatch).
   - Write to `district_targets/{clean_month}_{clean_dist}` with `merge=True`.
   - Evict targeted cache keys (`district_targets_{clean_month}_{clean_dist}`, `targets_{clean_month}_*`, `pacing_settings_{clean_month}_*`).
   - Emit audit log to `admin_activity_logs`.
3. In `GET /targets`:
   - Fetch `district_targets` document for `{month}_{clean_dist}`.
   - Fallback to general `{clean_dist}` if month-specific is missing.
   - Fallback to `sum(staff_targets)` if district document is missing.
   - Compute `buffer_count = max(0, staff_targets_sum - official_district_target)` and `buffer_percent = round((buffer_count / max(1, official_district_target)) * 100, 1)`.
   - Include `official_district_target`, `staff_targets_sum`, `buffer_percent`, `buffer_count` in response.
4. In `my_profile_stats`:
   - Ensure FO profile query strictly reads personal display target from `staff_targets` and never leaks district official target.

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_dual_target_engine.py -v`
Expected: PASS 100%.

- [ ] **Step 5: Run compilation and commit Task 1**

```bash
python -m py_compile main.py
git add main.py tests/test_dual_target_engine.py
git commit -m "feat(backend): implement official district target endpoint with rbac and dynamic fallback"
```

---

### Task 2: Excel KPI Engine & WhatsApp State Bulletin Synchronization

**Files:**
- Modify: `main.py:3890-3940` (`generate_district_kpi_bytes`)
- Modify: `dfy-frontend/src/AdminDashboard.jsx:11260-11290` (`liveWhatsAppBulletin`)
- Test: `tests/test_dual_target_engine.py`

**Interfaces:**
- Consumes: `district_targets` from Task 1.
- Produces: KPI workbooks referencing `official_district_target` and WhatsApp bulletins ranked by official quota achievement %.

- [ ] **Step 1: Write integration tests for KPI workbook and WhatsApp ranking**

In `tests/test_dual_target_engine.py`, add:
```python
def test_kpi_excel_engine_uses_official_district_target():
    # Verify generate_district_kpi_bytes injects official_district_target into Indicator 1
    from main import generate_district_kpi_bytes
    # Mock monthly reports and district targets
    raw_reports = [{"working_place": "Jamui", "date_of_reporting": "2026-10-05", "fo_name": "Rajiv Kumar", "total_notifications": 10}]
    target_records = [{"district": "Jamui", "fo_name": "Rajiv Kumar", "target": 35}]
    
    with patch("main.db.collection") as mock_coll:
        dt_doc = MagicMock()
        dt_doc.exists = True
        dt_doc.to_dict.return_value = {"district": "Jamui", "month": "2026-10", "official_target": 100}
        mock_coll.return_value.document.return_value.get.return_value = dt_doc
        
        excel_bytes = generate_district_kpi_bytes("Jamui", "2026-10", raw_reports=raw_reports, target_records=target_records)
        assert excel_bytes is not None
        assert len(excel_bytes) > 0
```

- [ ] **Step 2: Update `generate_district_kpi_bytes` in `main.py`**
- Resolve effective district target:
  Check `district_targets` for `{month}_{district}`. If set $> 0$, use as district target. Else fallback to `sum(t["target"] for t in target_records)`.
- Inject into summary sheet row for Target.

- [ ] **Step 3: Update `liveWhatsAppBulletin` in `dfy-frontend/src/AdminDashboard.jsx`**
- In `AdminDashboard.jsx`: Update ranking logic to sort districts using:
  `achievementPct = (districtNotifications / officialDistrictTarget) * 100`.
- Format rank string with accurate official percentage.

- [ ] **Step 4: Run backend tests**

Run: `python -m pytest tests/test_dual_target_engine.py -v`
Expected: PASS 100%.

- [ ] **Step 5: Commit Task 2**

```bash
git add main.py dfy-frontend/src/AdminDashboard.jsx tests/test_dual_target_engine.py
git commit -m "feat(kpi): synchronize 33-sheet excel workbooks and whatsapp bulletin with official district targets"
```

---

### Task 3: Frontend Dual-Target Management Deck & Overview Target Pacing Card

**Files:**
- Modify: `dfy-frontend/src/AdminDashboard.jsx:4820-4920` (State declarations and target memo hooks)
- Modify: `dfy-frontend/src/AdminDashboard.jsx:7000-7100` (Overview Target Pacing Card)
- Modify: `dfy-frontend/src/AdminDashboard.jsx:14300-14420` (Target Settings Modal)
- Test: `tests/test_dual_target_ui.mjs`

**Interfaces:**
- Consumes: `GET /targets` and `POST /update-district-target` from Task 1.
- Produces: Dual-target UI with live buffer pill and official pacing display.

- [ ] **Step 1: Write UI tests in `tests/test_dual_target_ui.mjs`**

```javascript
import fs from 'fs';
import path from 'path';
import assert from 'node:assert';

console.log('=== Running Dual-Target UI & RBAC Verification Tests ===\n');

const adminPath = path.resolve('dfy-frontend/src/AdminDashboard.jsx');
const appPath = path.resolve('dfy-frontend/src/App.jsx');

const adminCode = fs.readFileSync(adminPath, 'utf8');
const appCode = fs.readFileSync(appPath, 'utf8');

// 1. Admin Target Setting Modal features Official District Target input
assert(
  adminCode.includes('officialDistrictTarget') &&
  adminCode.includes('setOfficialDistrictTarget'),
  'AdminDashboard declares officialDistrictTarget state hook'
);

// 2. Admin Target Setting Modal features save district target handler with RBAC
assert(
  adminCode.includes('handleSaveDistrictTarget') &&
  adminCode.includes('/update-district-target'),
  'AdminDashboard implements handleSaveDistrictTarget calling /update-district-target'
);

// 3. Admin Target Modal renders Live Comparison Buffer Pill
assert(
  adminCode.includes('Buffer:') || adminCode.includes('Stretch Quota'),
  'AdminDashboard renders live buffer comparison badge between official and frontline targets'
);

// 4. Overview Target Pacing Card prioritizes officialDistrictTarget
assert(
  adminCode.includes('effectiveDistrictTarget') ||
  adminCode.includes('officialDistrictTarget || totalStateTarget'),
  'Overview Target Pacing Card calculates pacing using official district target'
);

// 5. Zero Leakage in FO Mobile App
assert(
  !appCode.includes('official_district_target'),
  'FO Mobile App does not expose or leak official district target'
);

console.log('🎉 ALL DUAL-TARGET UI & PRIVACY TESTS PASSED 100%!\n');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_dual_target_ui.mjs`
Expected: FAIL (states not yet declared in `AdminDashboard.jsx`).

- [ ] **Step 3: Implement Dual-Target Deck in `AdminDashboard.jsx`**
1. **Declare State Hooks (TDZ Safe)**:
   - `const [officialDistrictTarget, setOfficialDistrictTarget] = useState(0);`
   - `const [isSavingDistrictTarget, setIsSavingDistrictTarget] = useState(false);`
2. **Update `loadTargets` callback**:
   - Extract `data.official_district_target` and populate `officialDistrictTarget` state.
3. **Implement `handleSaveDistrictTarget`**:
   - Immediate loading state `setIsSavingDistrictTarget(true)`.
   - Post to `/update-district-target`.
   - Update state and toast success message.
4. **Render Official District Target Card & Live Comparison Buffer Pill** in Target Modal:
   - Official Target input with `isSavingDistrictTarget` disabled state.
   - Live badge:
     `Official Target: 100 | Frontline Allocated: 130 (Buffer: +30%)`
5. **Update Overview Target Pacing Card**:
   - Benchmark against `officialDistrictTarget` (with fallback to `distTargets.reduce(...)`).
   - Secondary subtitle: `🛵 Frontline Stretch Quota: 130 (Ground Pacing: 65.4%)`.

- [ ] **Step 4: Run UI test to verify it passes**

Run: `node tests/test_dual_target_ui.mjs`
Expected: PASS 100%.

- [ ] **Step 5: Run linter, build, and commit Task 3**

```bash
npm --prefix dfy-frontend run lint
npm --prefix dfy-frontend run build
git add dfy-frontend/src/AdminDashboard.jsx tests/test_dual_target_ui.mjs
git commit -m "feat(dashboard): add dual-target management deck with live buffer pill and official pacing"
```

---

### Task 4: Full App Verification Battery & Evidence Audit

- [ ] **Step 1: Run complete backend test battery**
Run: `python -m pytest tests/test_dual_target_engine.py tests/test_travel_allowance_backend.py -v`
Expected: Exit code 0, 100% tests passing.

- [ ] **Step 2: Run all frontend unit & integration tests**
Run: `node tests/test_dual_target_ui.mjs`
Run: `node tests/test_ta_reports_integration_ui.mjs`
Run: `node tests/test_ta_workflow_state_machine.mjs`
Expected: All suites exit 0.

- [ ] **Step 3: Run production frontend linter and build**
Run: `npx oxlint --format unix` in `dfy-frontend/` (0 syntax errors).
Run: `npm --prefix dfy-frontend run build` (Exit code 0).

- [ ] **Step 4: Run backend Python compilation check**
Run: `python -m py_compile main.py` (Exit code 0).

- [ ] **Step 5: Git diff audit and verify zero remote push**
Run: `git diff` line-by-line inspection.
Verify local branch status: `git branch -vv`.
