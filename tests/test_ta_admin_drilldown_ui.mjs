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

console.log("✅ Admin TA Drilldown & Hierarchy UI Verification Passed 100%!");
