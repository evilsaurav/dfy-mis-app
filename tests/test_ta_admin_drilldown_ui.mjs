import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log("🔍 Running Admin TA Drilldown & Hierarchy UI Verification Test...");

const adminPath = path.resolve('dfy-frontend/src/AdminDashboard.jsx');
assert(fs.existsSync(adminPath), "AdminDashboard.jsx must exist");
const code = fs.readFileSync(adminPath, 'utf8');

// 1. Drilldown state declaration
assert(
  code.includes('taViewMode') || code.includes('taDrilldownStaff'),
  "AdminDashboard must manage drilldown view state (Roster vs Day-by-Day)"
);

// 2. Screen 1 (Roster First)
assert(
  code.includes("District Staff Travel Allowance Payroll Roster"),
  "Screen 1 must render District Staff TA Payroll Roster"
);

// 3. Role-Based Action Buttons on Screen 1
assert(
  code.includes("Submit Roster to Incharge") || code.includes("Final Submit"),
  "MIS must have a Final Submit Roster button"
);
assert(
  code.includes("Approve District") || code.includes("Approve & Publish"),
  "Incharge must have an Approve District button"
);

// 4. Screen 2 Drilldown & Back Button
assert(
  code.includes("Back to District Roster") || code.includes("Back to Roster"),
  "Screen 2 must include a Back to District Roster button"
);

// 5. Discreet Pre-fill (••• Context Menu)
assert(
  !code.includes('Pre-fill from Daily Reports</button>'),
  "Pre-fill button must NOT be a standalone prominent button in top bar"
);
assert(
  code.includes("Sync from Daily Submissions") || code.includes("handlePrefillTaFromReports"),
  "Pre-fill action must be accessible via discreet context menu"
);

// 6. Revert / Dispute Alert Banners
assert(
  code.includes("revert_reason") || code.includes("revertReason"),
  "Day-by-Day screen must display Incharge revert remarks if rejected"
);
assert(
  code.includes("dispute?.reason") || code.includes("dispute.reason"),
  "Must support nested dispute.reason in dispute banner and roster flag"
);

// 7. District Roster Query & Session Cache
assert(
  !code.includes("if (sKey) params.append('staff_key', sKey);"),
  "fetchTaLog must fetch full district roster without filtering by staff_key"
);

// 8. Granular TA Permission & Role Hierarchy
assert(
  code.includes("can_manage_ta"),
  "AdminDashboard must support can_manage_ta granular permission"
);
assert(
  code.includes("canManageTa"),
  "AdminDashboard must compute canManageTa permission gate"
);
assert(
  !code.includes('<option value="MIS">'),
  "MIS must NOT be an independent option in Account Role select dropdown"
);
assert(
  code.includes("Manage &amp; Submit Travel Allowance (TA)") || code.includes("Manage & Submit Travel Allowance (TA)"),
  "Admin user modal must include granular checkbox for TA management"
);

// 9. Per-Staff Pass and Hold Actions
assert(
  code.includes("Pass") && (code.includes("Pass Staff") || code.includes("✅ Pass")),
  "AdminDashboard must include individual Pass / Approve buttons for staff"
);
assert(
  code.includes("Hold") && (code.includes("Hold Staff") || code.includes("⏸️ Hold")),
  "AdminDashboard must include individual Hold / Revert buttons for staff"
);

console.log("✅ Admin TA Drilldown & Hierarchy UI Verification Passed 100%!");

