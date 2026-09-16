# DFY MIS App - Production Engineering Rules & Protocol

> [!CAUTION]
> **THIS APPLICATION IS LIVE IN PRODUCTION.**
> It is actively used by field officers and state health coordinators for TB monitoring in Bihar.
> **Zero tolerance for runtime crashes, blank/white screens, data corruption, or untested deployments.**

---

## 1. Golden Rules for Every Modification

### Rule 1: Full App Verification Before Every Push
Never claim completion or ask to push without executing the complete verification battery:
1. **Backend Python Compilation**: `python -m py_compile main.py` (Must exit code 0).
2. **Backend Automated Tests**: Run targeted test scripts verifying auth, RBAC permissions, and edge cases.
3. **Frontend Production Build**: `npm run build` in `dfy-frontend/` (Must exit code 0).
4. **Frontend Linter**: `npm run lint` in `dfy-frontend/` (Must have 0 syntax errors).
5. **Runtime TDZ & Scope Safety Check**: Ensure no hook (`useMemo`, `useEffect`, `useCallback`) or event handler references a state or derived variable before its lexical declaration.
6. **Git Diff Audit**: Inspect `git diff` line-by-line to ensure only intended changes are present.

### Rule 2: Temporal Dead Zone (TDZ) & Hook Order Prevention
- Vite (`vite build`) does NOT catch runtime TDZ reference errors because it does not execute component render functions at build time.
- Always declare base states first (`useState`), then derived collections (`districts = useMemo(...)`), then dependent collections (`availableKpiDistricts = useMemo(...)`), then handlers.
- Never place dependent hooks above their source dependencies in large single-file components like `AdminDashboard.jsx`.

### Rule 3: Anti-Double-Tap & Concurrency Guards
- Staff may click or tap buttons multiple times rapidly.
- Every export or mutation button must have an immediate loading/disabled state (`isDownloading`, `isLoading`, etc.).
- Heavy operations (e.g. 33-sheet KPI Excel generation) must be guarded on the backend by concurrency semaphores (`asyncio.Semaphore(1)`) and garbage collection (`gc.collect()`) so Render RAM never crashes.

### Rule 4: Data Integrity & Cross-District Isolation
- Every write endpoint (`/submit-daily-report`, `/admin/reports/edit-day`, `/admin/reports/delete-day`, etc.) must strictly validate canonical district matching.
- Sub-Admin users must never access or modify data outside their permitted districts.
- Every write must invalidate relevant cache keys to prevent serving stale data.

### Rule 5: User Approval Gate
- Never push to `origin/main` automatically.
- Always commit locally first, provide a transparent summary of changes and verification evidence to the user, and wait for explicit approval before running `git push`.
