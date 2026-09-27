import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log("🔍 Running Admin TA Studio UI Static Verification Test...");

const adminDashboardPath = path.resolve('dfy-frontend/src/AdminDashboard.jsx');
assert(fs.existsSync(adminDashboardPath), "AdminDashboard.jsx must exist");

const code = fs.readFileSync(adminDashboardPath, 'utf8');

// 1. Location in Reports Studio (Strictly removed from Main Tabs)
assert(!code.includes("onClick={() => setActiveMainTab('travel_allowance')}"), "TA Studio must be removed from main navbar tabs");
assert(code.includes('reportsStudioTab === "ta_payout"'), "TA Studio must reside inside Reports Studio under ta_payout tab");
assert(code.includes("Travel Allowance (.xlsx)") || code.includes("Travel Allowance"), "Reports Studio must have Travel Allowance tab");

// 2. State & Hooks (Lexical Safety & Rate)
assert(code.includes("taDistrict"), "taDistrict state must exist");
assert(code.includes("taMonth"), "taMonth state must exist");
assert(code.includes("taDailyLogs"), "taDailyLogs state must exist");
assert(code.includes("taDeductionAmount"), "taDeductionAmount state must exist");
assert(code.includes("taDeductionReason"), "taDeductionReason state must exist");
assert(code.includes("taAdminRemarks"), "taAdminRemarks state must exist");

// 3. Actions & Anti-Double-Tap Guards
assert(code.includes("handlePrefillTaFromReports"), "Pre-fill handler must exist");
assert(code.includes("handleSaveTaLog"), "Save TA log handler must exist");
assert(code.includes("handleExportTaExcel"), "Export TA excel handler must exist");
assert(code.includes("taSaving"), "taSaving loading guard must exist");
assert(code.includes("taPrefilling"), "taPrefilling loading guard must exist");
assert(code.includes("taExporting"), "taExporting loading guard must exist");

// 4. Rate Enforcement
assert(code.includes("4.00") || code.includes("4.0") || code.includes("₹4"), "Fixed ₹4.00/KM rate must be declared/referenced");

// 5. 31-Day Table & Month-End Reconciliation Card
assert(code.includes("initial_reading") && code.includes("final_reading"), "Daily table must contain initial and final reading fields");
assert(code.includes("is_override"), "Broken meter override toggle must exist");
assert(code.includes("Gross") || code.includes("grossAmount"), "Gross amount computation must be visible in UI");
assert(code.includes("Net") || code.includes("netPayable"), "Net payable amount must be visible in UI");

console.log("✅ Admin TA Studio UI Static Verification Passed 100%!");
