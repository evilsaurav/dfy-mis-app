# DFY MIS Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the DFY TB MIS backend against unauthorized authentication bypass, CORS hijacking, timing attacks, report spoofing, and denial-of-service risks while strictly guaranteeing zero data loss for offline field reporting, zero disruption to field staff, comprehensive local user simulation, and ZERO test data pollution in the live production database.

**Architecture:** 
1. Server authentication: replace silent JWT fallback and loose PIN bypasses with strict environment validation and fail-closed PIN verification.
2. Cross-origin security: anchor CORS regex to exact Vercel production and preview subdomains.
3. Ingestion protection: enforce PIN verification on `/submit-daily-report` with dual-auth admin bypass and zero-loss error responses compatible with IndexedDB offline queue.
4. Cryptographic defense: replace variable-time string comparisons with `hmac.compare_digest` and mask internal database stack traces.
5. Rate limiting: protect heavy export pipelines against RAM exhaustion.
6. Local User Simulation & Zero Pollution: comprehensive test harness simulating every user condition (online, offline queue, retry, admin override) completely isolated from live Supabase/PostgreSQL.

**Tech Stack:** FastAPI, Python 3.11+, Pytest, Starlette TestClient, unittest.mock, bcrypt, HMAC, openpyxl, React 18, IndexedDB.

**Spec:** Security Audit & Penetration Testing Review (Audit Findings 1.1, 1.2, 1.3, 2.1, 3.2, 4.1, 4.2). Note: Finding 2.3 (Plaintext PIN Storage & Export) is explicitly **preserved and untouched** as requested by operational stakeholders.

## Global Constraints
- Live production application for Bihar State Health TB monitoring.
- Zero tolerance for runtime crashes, blank screens, or data corruption.
- Offline reporting and sync via IndexedDB must remain 100% resilient (Zero Data Loss).
- **Zero Live DB Pollution Guarantee:** All tests and user simulations must run in-memory / mocked without creating, modifying, or leaving any records in the live Supabase PostgreSQL database.
- All changes must pass `python -m py_compile main.py`, `pytest`, `npm run build`, and `npm run lint`.
- No git push without explicit user approval gate.

---

### Task 1: Harden JWT Secret Key Configuration & Validation (Finding 1.1)

**Files:**
- Modify: `backend/core/security.py:9-13`
- Test: `tests/test_jwt_security_hardening.py`

**Interfaces:**
- Consumes: `os.environ.get("JWT_SECRET_KEY")`
- Produces: `JWT_SECRET_KEY` validated string, warning/exception in production if unset or default.

- [ ] **Step 1: Write the failing unit test**
  Create `tests/test_jwt_security_hardening.py` to verify that when `JWT_SECRET_KEY` is validated, an explicit secure fallback mechanism warns or errors if running in production without an environment variable, and tokens cannot be forged with arbitrary keys.

- [ ] **Step 2: Run test to observe baseline**
  Run `pytest tests/test_jwt_security_hardening.py` to confirm test setup and baseline behavior.

- [ ] **Step 3: Implement minimal hardening in `backend/core/security.py`**
  Ensure that `backend/core/security.py` uses `JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY")`. If running in production (e.g. `RENDER` or `ENVIRONMENT=production`) and key is missing or set to the default placeholder, log a critical security alert and enforce an explicit key. Preserve test compatibility for local testing harnesses.

- [ ] **Step 4: Run test to ensure it passes**
  Run `pytest tests/test_jwt_security_hardening.py` and verify all tests pass.

- [ ] **Step 5: Commit changes locally**
  `git commit -m "sec(auth): harden JWT secret key validation against silent fallback"`

---

### Task 2: Eliminate Universal PIN Bypass in Online `/verify-pin` (Finding 1.2)

**Files:**
- Modify: `backend/routers/auth.py:265-283`
- Test: `tests/test_verify_pin_security.py`

**Interfaces:**
- Consumes: `PinCheck(working_place, fo_name, pin)`
- Produces: `{"valid": bool, ...}` fail-closed response.

- [ ] **Step 1: Write failing test in `tests/test_verify_pin_security.py`**
  Write tests using mocked DB layer to verify:
  - An unknown FO with a random 4-digit PIN (e.g. `9999`) returns `{"valid": False}` (NOT `{"valid": True, "fallback": True}`).
  - A registered FO with their correct PIN returns `{"valid": True}`.
  - A registered FO with an incorrect PIN returns `{"valid": False}`.
  - Verify live database is NEVER written or touched.

- [ ] **Step 2: Run test to confirm it fails on current codebase**
  Run `pytest tests/test_verify_pin_security.py` to see the current fallback returning `{"valid": True}` for unregistered names.

- [ ] **Step 3: Modify `backend/routers/auth.py`**
  Remove the insecure lines:
  ```python
  if str(data.pin).isdigit() and len(str(data.pin)) == 4:
      return {"valid": True, "fallback": True}
  ```
  Ensure the endpoint enforces fail-closed verification: if the officer is not found in `staff_directory` and baseline, or if the PIN does not match, return `{"valid": False, "error": "Invalid PIN or officer not registered."}`.

- [ ] **Step 4: Re-run test to verify it passes**
  Run `pytest tests/test_verify_pin_security.py` and confirm all cases pass.

- [ ] **Step 5: Commit changes locally**
  `git commit -m "sec(auth): enforce fail-closed validation on /verify-pin endpoint"`

---

### Task 3: Anchor CORS Origin Regex to Strict Vercel Subdomains (Finding 1.3)

**Files:**
- Modify: `main.py:228-237`
- Test: `tests/test_cors.py`

**Interfaces:**
- Consumes: `CORSMiddleware`
- Produces: Exact origin matching for `ALLOWED_ORIGINS` and regex matching only genuine `dfy-frontend` Vercel builds.

- [ ] **Step 1: Add negative and positive test cases to `tests/test_cors.py`**
  Add tests asserting:
  - `https://dfy-frontend.vercel.app` is ALLOWED.
  - `https://dfy-frontend-git-main-saurav.vercel.app` is ALLOWED.
  - `https://dfy-frontend-evil-hacker.vercel.app` is BLOCKED (no allow-origin header).
  - `https://dfy-frontendevil.vercel.app` is BLOCKED.

- [ ] **Step 2: Run `pytest tests/test_cors.py` to see the rogue domains currently allowed**
  Confirm the wildcard regex currently permits arbitrary subdomains.

- [ ] **Step 3: Update `main.py` regex**
  Update `CORS_ORIGIN_REGEX` in `main.py` to:
  `r"^https://dfy-frontend(-[a-zA-Z0-9_-]+)?\.vercel\.app$"`
  Ensuring exact boundary matching (`^` and `$`).

- [ ] **Step 4: Re-run `pytest tests/test_cors.py`**
  Verify all allowed origins pass and rogue origins are cleanly rejected.

- [ ] **Step 5: Commit changes locally**
  `git commit -m "sec(cors): anchor CORS regex to exact production and preview domains"`

---

### Task 4: Enforce Backend PIN Verification on `/submit-daily-report` with Zero-Loss Contract (Finding 2.1)

**Files:**
- Modify: `backend/routers/reports.py:564-610`
- Test: `tests/test_report_pin_ingestion.py`

**Interfaces:**
- Consumes: `DailyActivityReport(working_place, fo_name, pin, ...)`
- Produces: 
  - `200 OK` on valid PIN or valid Admin authorization.
  - `401 Unauthorized` with `{"detail": "...", "error_code": "INVALID_PIN"}` on incorrect PIN.

- [ ] **Step 1: Write tests in `tests/test_report_pin_ingestion.py`**
  Verify:
  - Submitting a report with correct PIN returns 200 OK.
  - Submitting a report with an invalid PIN returns 401 Unauthorized with `error_code: "INVALID_PIN"`.
  - Submitting a report with an Admin JWT token (dual-auth) succeeds even without officer PIN.
  - Confirm error response allows `offlineQueue.js` to preserve the item in IndexedDB without data loss.

- [ ] **Step 2: Run `pytest tests/test_report_pin_ingestion.py` to verify current gap**
  Confirm currently invalid PINs are accepted without 401.

- [ ] **Step 3: Implement PIN verification in `submit_daily_report` (`backend/routers/reports.py`)**
  In `submit_daily_report`:
  1. Add `admin: Optional[dict] = Depends(get_optional_admin)`.
  2. If admin token is valid, allow submission (admin override).
  3. If no admin token, verify `report.pin` against `staff_directory` (PostgreSQL lookup or cached PIN).
  4. If PIN mismatch, raise `HTTPException(status_code=401, detail="PIN verification failed. Kripya apna sahi PIN darj karein.")`.

- [ ] **Step 4: Re-run `pytest tests/test_report_pin_ingestion.py`**
  Verify that valid PINs succeed, invalid PINs fail with 401, and admin override works.

- [ ] **Step 5: Commit changes locally**
  `git commit -m "sec(reports): enforce PIN authentication on daily report submission"`

---

### Task 5: Constant-Time Password Verification (`hmac.compare_digest`) (Finding 3.2)

**Files:**
- Modify: `backend/core/security.py:21-33`
- Test: `tests/test_password_constant_time.py`

**Interfaces:**
- Consumes: `verify_password(plain: str, hashed_or_plain: str)`
- Produces: `bool` result computed via constant-time comparison.

- [ ] **Step 1: Write unit tests in `tests/test_password_constant_time.py`**
  Test `verify_password`:
  - With bcrypt hash `$2b$...` matching password -> `True`.
  - With bcrypt hash `$2b$...` wrong password -> `False`.
  - With plaintext password matching -> `True`.
  - With plaintext password wrong -> `False`.
  - Verify auto-upgrade in `rbac_audit.py` continues to execute seamlessly.

- [ ] **Step 2: Update `verify_password` in `backend/core/security.py`**
  Import `hmac`. Replace `return str_plain == str_stored` with:
  ```python
  return hmac.compare_digest(str_plain, str_stored)
  ```

- [ ] **Step 3: Run `pytest tests/test_password_constant_time.py`**
  Verify all assertions pass.

- [ ] **Step 4: Commit changes locally**
  `git commit -m "sec(crypto): use constant-time comparison in verify_password to eliminate timing attacks"`

---

### Task 6: Mask Internal Database Errors & Add Export Cooldown Rate Limiting (Findings 4.1 & 4.2)

**Files:**
- Modify: `backend/core/helpers.py`, `backend/routers/kpi.py`
- Test: `tests/test_error_masking_and_rate_limits.py`

**Interfaces:**
- Consumes: Export requests, unhandled server exceptions.
- Produces: Sanitized 500 error messages, 10s cooldown per user/IP on heavy KPI downloads.

- [ ] **Step 1: Write tests in `tests/test_error_masking_and_rate_limits.py`**
  Test:
  - Calling a route that triggers an internal error does not reveal raw PostgreSQL query strings in response JSON.
  - Rapid double-tap calls on KPI export within 2 seconds receive 429 Too Many Requests or are cleanly serialized.

- [ ] **Step 2: Implement export cooldown & error sanitization helper**
  - Add `export_cooldown_limiter` in `backend/core/helpers.py` or `backend/core/security.py`.
  - Wire rate limiter check into heavy export endpoints (e.g. `download_all_kpi_workbooks`).
  - Sanitize raw exception details returned to client while preserving full logging in server terminal.

- [ ] **Step 3: Run tests to verify**
  Run `pytest tests/test_error_masking_and_rate_limits.py`.

- [ ] **Step 4: Commit changes locally**
  `git commit -m "sec(ops): sanitize 500 error messages and add export cooldown limiter"`

---

### Task 7: Comprehensive Local User Simulation Suite (Zero Live DB Pollution)

**Files:**
- Create: `tests/test_local_user_simulation.py`

**Simulated User Scenarios:**
1. **Scenario 1 (Field Officer Normal Duty):** FO logs in online with valid PIN, submits daily report with 2 TB notification IDs -> Expect `200 OK`, report ingested.
2. **Scenario 2 (Fraud / Attacker Spoofing):** Attacker tries to submit report for FO with wrong PIN -> Expect `401 Unauthorized`, report rejected.
3. **Scenario 3 (Offline Mode & Network Reconnect Simulation):**
   - FO enters report offline (simulated IndexedDB payload).
   - Sync executed with valid PIN -> Expect `200 OK`, queue cleared.
   - Sync executed with mismatched PIN -> Expect `401 Unauthorized`, queue retention verified (Zero Data Loss).
4. **Scenario 4 (Admin Override & Monitoring):** Sub-Admin or Super Admin edits/submits report with valid JWT token but no officer PIN -> Expect `200 OK` (Dual-auth valid).
5. **Scenario 5 (Attacker Origin CORS Rejection):** Request simulated with `Origin: https://dfy-frontend-phishing.vercel.app` -> Origin header omitted, blocked.
6. **Scenario 6 (Zero Live DB Pollution Audit):** Verify that the test harness used `MockFirestore` / mock query routing and zero rows were committed to live Supabase PostgreSQL.

- [ ] **Step 1: Create `tests/test_local_user_simulation.py`**
- [ ] **Step 2: Run all simulation scenarios**
  `pytest tests/test_local_user_simulation.py -v`
- [ ] **Step 3: Commit simulation suite locally**
  `git commit -m "test(sim): add end-to-end local user simulation suite with zero live db pollution"`

---

### Task 8: Full App Verification Battery & Regression Gate

**Files:** All modified files across backend and frontend.

- [ ] **Step 1: Python syntax and compilation check**
  Run: `python -m py_compile main.py backend/core/security.py backend/routers/auth.py backend/routers/reports.py`
  Must exit code 0.

- [ ] **Step 2: Execute all security and simulation tests**
  Run:
  `python -m pytest tests/test_jwt_security_hardening.py tests/test_verify_pin_security.py tests/test_cors.py tests/test_report_pin_ingestion.py tests/test_password_constant_time.py tests/test_error_masking_and_rate_limits.py tests/test_local_user_simulation.py -v`

- [ ] **Step 3: Frontend production build & lint**
  Run in `dfy-frontend/`:
  `npm run build`
  `npm run lint`

- [ ] **Step 4: Git diff audit**
  Run `git diff` line-by-line to ensure:
  - Finding 2.3 (Plaintext PIN Storage & Export) remains 100% untouched as instructed.
  - Zero unintended changes or regressions.

- [ ] **Step 5: Present evidence to user for Push Approval**
  Provide full test results and wait for explicit approval before pushing to `origin/main`.
