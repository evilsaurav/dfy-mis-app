# Guide Bento Flowcharts for New Features (v2.8.4) Implementation Plan

**Goal:** Explain the new v2.8.4 features in visual bento flowcharts across the FO Help Guide (`App.jsx`) and Admin SOP Guide (`AdminDashboard.jsx`).

**Architecture:**
- **FO Help Guide (`App.jsx`)**: Add Topic 10 (`honors_and_badges`): 4-card responsive visual bento flowchart explaining milestone badge calculation, profile showcase, live card preview modal, 1080x1350 Canvas PNG export, and WhatsApp celebration sharing with Zero-Leakage Privacy (strict 7:00 PM deadline, zero patient PII).
- **Admin SOP Guide (`AdminDashboard.jsx`)**: Add Topic 11 (`top_performers_studio`): 4-card responsive visual bento flowchart explaining 4 clinical role leaderboards (DC, FO/Hub, LT, SCT), dynamic designation sync, 1200x1350 WhatsApp poster generator, and full-width 30-day progression trend analytics.
- **Test File**: `tests/test_guide_new_features_flowcharts_ui.mjs` asserting presence of both flowchart topics, bento cards, step sequences, and zero-leakage privacy. Also update `tests/test_admin_sop_bento_ui.mjs` to accept `APP_VERSION >= 2.8.3` (specifically `"2.8.4"`).

## Global Constraints:
- **ZERO LEAKAGE PRIVACY CONSTRAINT**: ZERO mention of the Stealth 10:00 AM Cutoff in `App.jsx` or FO Guide. Official reporting deadline strictly 7:00 PM evening.
- **TEMPORAL DEAD ZONE (TDZ) RULE**: Never reference state or derived variables before their lexical declaration.
- **LINT & BUILD**: `npm --prefix dfy-frontend run lint` must pass with 0 syntax errors, and `npm --prefix dfy-frontend run build` must succeed.
- **ZERO PUSH WITHOUT USER APPROVAL**: Local commit first, report evidence, await approval.
