import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

console.log("=== Running Travel Allowance Guide Bento UI Verification (v2.8.5) ===");

// -------------------------------------------------------------
// Read Source Files
// -------------------------------------------------------------
const appPath = resolve('dfy-frontend/src/App.jsx');
const appCode = readFileSync(appPath, 'utf8');

const adminPath = resolve('dfy-frontend/src/AdminDashboard.jsx');
const adminCode = readFileSync(adminPath, 'utf8');

const changelogPath = resolve('dfy-frontend/src/changelogData.js');
const changelogCode = readFileSync(changelogPath, 'utf8');

// -------------------------------------------------------------
// Test 1: changelogData.js Version Bump to 2.8.5
// -------------------------------------------------------------
console.log("\n[Test 1] Verifying changelogData.js Version and v2.8.5 Entry...");
assert(changelogCode.includes('export const APP_VERSION = "2.8.5";'), 'APP_VERSION must be "2.8.5"');
assert(changelogCode.includes('version: "v2.8.5"'), 'changelogData.js must contain a v2.8.5 entry');
assert(changelogCode.includes('Travel Allowance (TA) & Bike Log'), 'v2.8.5 must mention Travel Allowance & Bike Log');
assert(changelogCode.includes('₹4.00 / KM') || changelogCode.includes('₹4.00/KM'), 'v2.8.5 must mention ₹4.00/KM rate');
assert(changelogCode.includes('Pre-fill from Daily Reports') || changelogCode.includes('1-Click Pre-fill'), 'v2.8.5 must mention Pre-fill');
assert(changelogCode.includes('Multi-Sheet Excel') || changelogCode.includes('DASHBOARD'), 'v2.8.5 must mention Multi-Sheet Excel');
console.log("✔ changelogData.js verified for v2.8.5 release.");

// -------------------------------------------------------------
// Test 2: App.jsx Zero-Leakage Privacy & Topic 11 Verification
// -------------------------------------------------------------
console.log("\n[Test 2] Verifying Zero-Leakage Privacy & FO Guide Topic 11 in App.jsx...");
assert(!appCode.includes('10:00 AM'), "CRITICAL: '10:00 AM' must NOT appear anywhere in App.jsx!");
assert(!appCode.toLowerCase().includes('10 am cutoff'), "CRITICAL: '10 am cutoff' must NOT appear in App.jsx!");
assert(!appCode.toLowerCase().includes('cutoff'), "CRITICAL: 'cutoff' must NOT appear anywhere in App.jsx!");

// Extract FoHelpGuide
const foHelpGuideStart = appCode.indexOf('const FoHelpGuide = () => {');
assert(foHelpGuideStart !== -1, "FoHelpGuide component must exist in App.jsx");
const foHelpGuideEnd = appCode.indexOf('// --- Id Bucket ---', foHelpGuideStart);
assert(foHelpGuideEnd !== -1, "FoHelpGuide component end boundary must be identifiable");
const foGuideCode = appCode.substring(foHelpGuideStart, foHelpGuideEnd);

assert(foGuideCode.includes('id: "travel_allowance_ledger"'), "FoHelpGuide must contain topic id: 'travel_allowance_ledger'");
assert(foGuideCode.includes('11. Travel Allowance (TA) & Bike Log Ledger'), "Topic 11 title must be '11. Travel Allowance (TA) & Bike Log Ledger'");
assert(foGuideCode.includes('New in v2.8.5'), "Topic 11 badge must be 'New in v2.8.5'");
assert(foGuideCode.includes('7:00 PM'), "Topic 11 must mention 7:00 PM reporting deadline");
assert(foGuideCode.includes('₹4.00') || foGuideCode.includes('₹4'), "Topic 11 must mention ₹4.00 / KM rate");
assert(foGuideCode.includes('read-only') || foGuideCode.includes('Read-Only') || foGuideCode.includes('tamper-proof'), "Topic 11 must describe read-only tamper-proof ledger");

// Bento Flowchart checks
assert(foGuideCode.includes('grid grid-cols-1 sm:grid-cols-2 gap-3'), "Topic 11 must use responsive bento flowchart grid");
assert(foGuideCode.includes('Daily Odometer Sync') || foGuideCode.includes('Odometer Sync'), "Topic 11 Step 1 must describe Daily Odometer Sync");
assert(foGuideCode.includes('Mileage Rate Engine') || foGuideCode.includes('₹4.00 / KM'), "Topic 11 Step 2 must describe Fixed Mileage Rate Engine");
assert(foGuideCode.includes('Admin Deductions') || foGuideCode.includes('Deductions & Transparency'), "Topic 11 Step 3 must describe Admin Deductions");
assert(foGuideCode.includes('Read-Only Ledger') || foGuideCode.includes('Tamper-Proof'), "Topic 11 Step 4 must describe Tamper-Proof Read-Only Ledger");
console.log("✔ FO Guide Topic 11 verified with all 4 bento steps and zero cutoff leakage.");

// -------------------------------------------------------------
// Test 3: AdminDashboard.jsx Topic 12 (travel_allowance_studio) Verification
// -------------------------------------------------------------
console.log("\n[Test 3] Verifying Admin SOP Topic 12 in AdminDashboard.jsx...");
const guideModalStart = adminCode.indexOf('{showAppGuideModal && (');
assert(guideModalStart !== -1, "showAppGuideModal block must exist in AdminDashboard.jsx");
const guideModalEnd = adminCode.indexOf('{/* ========================================================================= */}', guideModalStart + 100);
assert(guideModalEnd !== -1, "showAppGuideModal boundary must exist");
const guideModalCode = adminCode.substring(guideModalStart, guideModalEnd);

assert(guideModalCode.includes("key: 'travel_allowance_studio'"), "Sidebar topics must contain key: 'travel_allowance_studio'");
assert(guideModalCode.includes("Travel Allowance & Bike Log Studio"), "Sidebar topic label must be 'Travel Allowance & Bike Log Studio'");
assert(guideModalCode.includes("appGuideActiveTopic === 'travel_allowance_studio'"), "Modal must contain render condition for 'travel_allowance_studio'");

// Bento Flowchart checks
assert(guideModalCode.includes('Pre-fill from Daily Reports') || guideModalCode.includes('1-Click Pre-fill'), "Topic 12 Step 1 must describe Pre-fill from Daily Reports");
assert(guideModalCode.includes('₹4.00 / KM') || guideModalCode.includes('₹4.00/KM'), "Topic 12 Step 2 must describe ₹4.00/KM rate engine");
assert(guideModalCode.includes('Broken Meter') || guideModalCode.includes('override'), "Topic 12 Step 2 must describe Broken Meter override");
assert(guideModalCode.includes('Month-End Deductions') || guideModalCode.includes('Reconciliation'), "Topic 12 Step 3 must describe Deductions & Reconciliation");
assert(guideModalCode.includes('Multi-Sheet Excel') || guideModalCode.includes('DASHBOARD'), "Topic 12 Step 4 must describe Multi-Sheet Excel export");

console.log("✔ Admin SOP Topic 12 verified with all 4 bento steps.");
console.log("\n🎉 ALL TRAVEL ALLOWANCE GUIDE BENTO UI CHECKS PASSED 100%!");
