import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log("🔍 Running Mobility Analytics UI Static Verification Test...");

const adminDashboardPath = path.resolve('dfy-frontend/src/AdminDashboard.jsx');
assert(fs.existsSync(adminDashboardPath), "AdminDashboard.jsx must exist");

const code = fs.readFileSync(adminDashboardPath, 'utf8');

// 1. Endpoint & Fetch Hook
assert(code.includes("/api/ta-logs/analytics"), "AdminDashboard must fetch from /api/ta-logs/analytics");
assert(code.includes("fetchTaAnalytics"), "fetchTaAnalytics function must exist");
assert(code.includes("taAnalytics"), "taAnalytics state must exist");

// 2. Presentation KPI Cards
assert(
  code.includes("Project Mobility (YTD)") || code.includes("Total Project KM (YTD)"),
  "Must include Project Mobility (YTD) cumulative card"
);
assert(
  code.includes("FO Daily Travel Average") || code.includes("Average Daily KM"),
  "Must include FO Daily Travel Average card"
);
assert(
  code.includes("Total TA Approved") || code.includes("Approved TA Payout"),
  "Must include Total TA Approved card"
);

// 3. Metric Bindings
assert(code.includes("total_project_km_ytd"), "Must reference total_project_km_ytd metric");
assert(code.includes("avg_daily_km_per_fo"), "Must reference avg_daily_km_per_fo metric");
assert(code.includes("total_ta_final_payable") || code.includes("total_ta_gross"), "Must reference TA payout metric");

console.log("✅ Mobility Analytics UI Static Verification Passed 100%!");
