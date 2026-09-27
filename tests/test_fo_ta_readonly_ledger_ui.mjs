import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log("🔍 Running FO TA Read-Only Ledger UI Verification Test...");

const appPath = path.resolve('dfy-frontend/src/App.jsx');
assert(fs.existsSync(appPath), "App.jsx must exist");

const code = fs.readFileSync(appPath, 'utf8');

// 1. Component presence & section title
assert(code.includes("My Travel & TA Log") || code.includes("My Travel &amp; TA Log"), "App.jsx must render 'My Travel & TA Log' section");

// 2. State & API call
assert(code.includes("foTaMonth"), "App.jsx must have foTaMonth state for historical inspection");
assert(code.includes("/api/ta-logs"), "App.jsx must fetch from /api/ta-logs");

// 3. Metrics display
assert(code.includes("Gross TA") || code.includes("gross_amount"), "Must display Gross TA Claim");
assert(code.includes("Deductions") || code.includes("deduction_amount"), "Must display Deductions");
assert(code.includes("Net Approved Payout") || code.includes("final_payable_amount"), "Must display Net Approved Payout");
assert(code.includes("4.00") || code.includes("₹4"), "Must indicate standard ₹4.00/KM rate");

// 4. Strict Immutability Guarantee
assert(!code.includes("handleSaveFoTaLog"), "FO must NOT have a save TA log mutation handler");
assert(!code.includes("setFoTaDailyLogs"), "FO must NOT mutate daily TA logs");

// 5. Zero-Leakage Privacy Rule
assert(!code.includes("10:00 AM cutoff") && !code.includes("stealth 10am"), "App.jsx must NEVER mention stealth 10:00 AM cutoff");

console.log("✅ FO TA Read-Only Ledger UI Verification Passed 100%!");
