# Plan: Top Performers Studio Data Fetch Fix & Leave/Holiday Streak Preservation

**Goal:** 
1. Fix data loading in `Bihar Statewide Top Performers Studio` in `AdminDashboard.jsx` by resolving missing `API_BASE_URL` declaration and using `authFetch` with `dfy_admin_token`.
2. Implement Leave, Holiday & Sunday Streak Preservation in `main.py` (`my_profile_stats`) so frontline staff streaks do not break on Sundays, approved leaves, or declared holidays.

**Architecture:**
- **Admin Dashboard (`dfy-frontend/src/AdminDashboard.jsx`)**:
  - In `fetchTopPerformers`, declare `API_BASE_URL` and use `authFetch` to send authorized requests to `/api/statewide-top-performers`.
- **Backend Analytics (`main.py`)**:
  - In `my_profile_stats`:
    - Identify exempt days: Sundays (`check_date.weekday() == 6`), approved leaves (`daily_history[d_str].get("is_leave") == True`), and declared holidays.
    - Anchor streak: If today is unsubmitted, step back past any unsubmitted exempt days to find the most recent required working day. If that required working day was submitted, start the streak from there.
    - Traversal loop: When traversing backwards, if `submitted`: `streak_days += 1`. If not submitted but day is an exempt day (Sunday / Approved Leave / Declared Holiday): bridge past it (`check_date -= timedelta(days=1)`) without breaking the streak. If not submitted and not exempt: `break`.
- **Automated Tests**:
  - `tests/test_top_performers_fetch_auth_ui.mjs`: Test asserting `authFetch` and `API_BASE_URL` in `fetchTopPerformers`.
  - `tests/test_streak_leave_holiday_preservation.py`: Pytest suite verifying:
    - Normal streak increments on consecutive days.
    - Streak does NOT break over Sundays.
    - Streak does NOT break over approved leaves (Casual, Medical, Official Duty).
    - Streak does NOT break over declared holidays.
    - Unexcused absence breaks the streak.
    - Monday morning check with Sunday off properly anchors to Friday/Saturday.

## Global Constraints
- **ZERO LEAKAGE PRIVACY CONSTRAINT**: ZERO mention of 10:00 AM cutoff in `App.jsx`. Official deadline strictly 7:00 PM.
- **TDZ Safety**: No state/callback referenced before lexical declaration.
- **Compilation & Verification**:
  - `python -m py_compile main.py` must exit code 0.
  - `pytest tests/test_streak_leave_holiday_preservation.py -v` must pass 100%.
  - `npm --prefix dfy-frontend run lint` must pass with 0 syntax errors.
  - `npm --prefix dfy-frontend run build` must succeed (exit 0).
- **Subagent-Driven**: Execute via Implementer and Reviewer subagents.
- **Zero Push Without Approval**: Commit locally; wait for user approval.
