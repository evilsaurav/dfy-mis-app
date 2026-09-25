import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

console.log("=== Running Admin SOP Bento UI & Version Bump Verification ===");

// -------------------------------------------------------------
// Test 1: changelogData.js Version and v2.8.3 Entry Verification
// -------------------------------------------------------------
console.log("\n[Test 1] Verifying changelogData.js Version and v2.8.3 Entry...");
const changelogPath = resolve('dfy-frontend/src/changelogData.js');
const changelogCode = readFileSync(changelogPath, 'utf8');

assert(changelogCode.includes('export const APP_VERSION = "2.8.3";'), 'APP_VERSION must be bumped to "2.8.3"');

const v283Index = changelogCode.indexOf('version: "v2.8.3"');
assert(v283Index !== -1, 'changelogData.js must contain a v2.8.3 entry');

// Check that v2.8.3 entry is first in CHANGELOG_ENTRIES
const changelogEntriesStart = changelogCode.indexOf('export const CHANGELOG_ENTRIES = [');
assert(changelogEntriesStart !== -1, 'CHANGELOG_ENTRIES array must exist');
const firstEntryPos = changelogCode.indexOf('version:', changelogEntriesStart);
assert(changelogCode.substring(firstEntryPos, firstEntryPos + 30).includes('"v2.8.3"'), 'v2.8.3 must be the first entry in CHANGELOG_ENTRIES');

// Verify key highlights in v2.8.3
assert(changelogCode.includes('Stealth 10:00 AM') || changelogCode.includes('10:00 AM Reporting Cutoff'), 'v2.8.3 must mention Stealth 10:00 AM Reporting Cutoff');
assert(changelogCode.includes('Next day morning') || changelogCode.includes('Next-Day Morning Radar Badge'), 'v2.8.3 must mention Next-Day Morning Radar Badge');
assert(changelogCode.includes('Dual-Sheet Staff Attendance') || changelogCode.includes('Attendance Excel Export'), 'v2.8.3 must mention Dual-Sheet Staff Attendance Excel Export');
assert(changelogCode.includes('Deactivated Staff') && changelogCode.includes('Consonant-Collapsed'), 'v2.8.3 must mention Deactivated Staff Consonant-Collapsed Defense');
assert(changelogCode.includes('Documents Column') || changelogCode.includes('C:X | P:Y') || changelogCode.includes('documents_cur'), 'v2.8.3 must mention Master Table Documents Column Cohort Breakdown');
assert(changelogCode.includes('Bento Visual Flowcharts') || changelogCode.includes('Native Bento'), 'v2.8.3 must mention Native Bento Visual Flowcharts in FO App Guide and Centralized Admin SOP');

console.log("✔ changelogData.js successfully verified for v2.8.3 release.");

// -------------------------------------------------------------
// Test 2: AdminDashboard.jsx showAppGuideModal Extraction
// -------------------------------------------------------------
console.log("\n[Test 2] Extracting showAppGuideModal from AdminDashboard.jsx...");
const adminPath = resolve('dfy-frontend/src/AdminDashboard.jsx');
const adminCode = readFileSync(adminPath, 'utf8');

const guideModalStart = adminCode.indexOf('{showAppGuideModal && (');
assert(guideModalStart !== -1, 'showAppGuideModal modal block must exist in AdminDashboard.jsx');
const guideModalEnd = adminCode.indexOf('{/* ========================================================================= */}', guideModalStart + 100);
assert(guideModalEnd !== -1, 'showAppGuideModal modal end boundary must be identifiable');
const guideModalCode = adminCode.substring(guideModalStart, guideModalEnd);

// -------------------------------------------------------------
// Test 3: Verify All 10 Topic Keys Exist in Admin SOP Modal
// -------------------------------------------------------------
console.log("\n[Test 3] Verifying all 10 topic keys in showAppGuideModal...");
const expectedTopics = [
  'visual_sops',
  'notif_tray',
  'reconciler',
  'daily_reports',
  'targets',
  'staff',
  'duplicate_radar',
  'excel_reports',
  'audit_trail',
  'faqs'
];

for (const topic of expectedTopics) {
  assert(
    guideModalCode.includes(`appGuideActiveTopic === '${topic}'`),
    `showAppGuideModal must contain content render condition for topic: '${topic}'`
  );
}
console.log("✔ All 10 topics present in showAppGuideModal.");

// -------------------------------------------------------------
// Test 4: Topic 1 (notif_tray) Bento Visual Flowchart Verification
// -------------------------------------------------------------
console.log("\n[Test 4] Verifying Topic 'notif_tray' 4-Stage Bento Flowchart...");
assert(guideModalCode.includes("Open Notification Tray") || guideModalCode.includes("Open Tray"), "'notif_tray' must have Step 1: Open Notification Tray");
assert(guideModalCode.includes("Filter Canonical District") || guideModalCode.includes("District Filter"), "'notif_tray' must have Step 2: District Filter");
assert(guideModalCode.includes("24-Column Excel Copy") || guideModalCode.includes("1-Click 24-Col Excel Copy"), "'notif_tray' must have Step 3: 24-Column Excel Copy");
assert(guideModalCode.includes("Mark Done in Nikshay") || guideModalCode.includes("Nikshay Search"), "'notif_tray' must have Step 4: Nikshay Verification");
assert(guideModalCode.includes("72-Hour") || guideModalCode.includes("72-hour"), "'notif_tray' must feature 72-hour Government Portal Sync Lag Rule");

// -------------------------------------------------------------
// Test 5: Topic 2 (reconciler) 4-Step Bento Data Pipeline Verification
// -------------------------------------------------------------
console.log("\n[Test 5] Verifying Topic 'reconciler' 4-Step Bento Data Pipeline...");
assert(guideModalCode.includes("State Monthly Dump Upload") || guideModalCode.includes("Upload Nikshay Excel"), "'reconciler' must describe State Monthly Dump Upload");
assert(guideModalCode.includes("5-Indicator Reconciliation") || guideModalCode.includes("Header Match") || guideModalCode.includes("Multi-Indicator Cross-Check"), "'reconciler' must describe Multi-Indicator Reconciliation");
assert(guideModalCode.includes("Monotonic Ledger") || guideModalCode.includes("Permanent Cumulative Ledger"), "'reconciler' must describe Permanent Cumulative Ledger");
assert(guideModalCode.includes("Actionable Pending") || guideModalCode.includes("Direct Patient Contact") || guideModalCode.includes("1-Tap Call"), "'reconciler' must describe Pending Lists & Direct Patient Contact");

// -------------------------------------------------------------
// Test 6: Topic 3 (daily_reports) Stealth 10 AM Cutoff & Bento Visuals
// -------------------------------------------------------------
console.log("\n[Test 6] Verifying Topic 'daily_reports' Stealth 10 AM Cutoff & Bento Visuals...");
assert(
  guideModalCode.includes("10:00 AM") && (guideModalCode.includes("Cutoff") || guideModalCode.includes("cutoff")),
  "'daily_reports' must clearly document the internal Stealth 10:00 AM Cutoff mechanism for Admins"
);
assert(guideModalCode.includes("Yesterday") || guideModalCode.includes("D-1") || guideModalCode.includes("beete huye kal") || guideModalCode.includes("kal ki date"), "'daily_reports' must explain that < 10 AM submissions map to yesterday");
assert(guideModalCode.includes("24-Hour Edit Window") || guideModalCode.includes("24-hour edit"), "'daily_reports' must explain 24-hour edit window");
assert(guideModalCode.includes("Inspect All IDs") || guideModalCode.includes("Full Day Report"), "'daily_reports' must describe Inspect / Edit Day modal");

// -------------------------------------------------------------
// Test 7: Topic 4 (targets) 4-Card Bento Pacing & Forecasting
// -------------------------------------------------------------
console.log("\n[Test 7] Verifying Topic 'targets' 4-Card Bento Pacing & Forecasting...");
assert(guideModalCode.includes("Monthly Target") || guideModalCode.includes("Target Allocation"), "'targets' must describe Monthly Target Allocation");
assert(guideModalCode.includes("Daily Pace Calculation") || guideModalCode.includes("Run-Rate Velocity") || guideModalCode.includes("Progression Trend"), "'targets' must describe Daily Pace / Velocity calculation");
assert(guideModalCode.includes("Sunday") && (guideModalCode.includes("Holiday") || guideModalCode.includes("Buffer")), "'targets' must describe Sunday & Declared Holiday Buffer");
assert(guideModalCode.includes("Forecast Model") || guideModalCode.includes("Performance Studio") || guideModalCode.includes("Bar Chart"), "'targets' must describe Performance Studio / Forecast Model");

// -------------------------------------------------------------
// Test 8: Topic 5 (staff) Credential Security & Lifecycle Bento
// -------------------------------------------------------------
console.log("\n[Test 8] Verifying Topic 'staff' Credential Security & Lifecycle Bento...");
assert(guideModalCode.includes("Onboard Officer") || guideModalCode.includes("Staff Directory") || guideModalCode.includes("Designation"), "'staff' must describe Officer Onboarding & Roles");
assert(guideModalCode.includes("4-Digit Duty PIN") || guideModalCode.includes("Duty PIN"), "'staff' must describe 4-Digit Duty PIN");
assert(guideModalCode.includes("Reset PIN") || guideModalCode.includes("PIN Reset"), "'staff' must describe Reset PIN workflow");
assert(guideModalCode.includes("Deactivation") || guideModalCode.includes("Inactive") || guideModalCode.includes("Consonant-Collapsed"), "'staff' must describe Active/Inactive Staff Lifecycle Defense");

// -------------------------------------------------------------
// Test 9: Topic 6 (duplicate_radar) 3-Tier Detection & 1-Click Prune Flow
// -------------------------------------------------------------
console.log("\n[Test 9] Verifying Topic 'duplicate_radar' 3-Tier Detection & 1-Click Prune Flow...");
assert(guideModalCode.includes("Same-Day") || guideModalCode.includes("Within District"), "'duplicate_radar' must describe Same-Day Within-District Duplicate Check");
assert(guideModalCode.includes("Cross-District") || guideModalCode.includes("Between Districts"), "'duplicate_radar' must describe Cross-District Collision Check");
assert(guideModalCode.includes("1-Click Auto-Repair") || guideModalCode.includes("1-Click Fix"), "'duplicate_radar' must describe 1-Click Auto-Repair");
assert(guideModalCode.includes("Earliest Valid Date") || guideModalCode.includes("Atomic Rollup Recalculation") || guideModalCode.includes("Increment(-N)"), "'duplicate_radar' must describe atomic rollup decrements and safe earliest date");

// -------------------------------------------------------------
// Test 10: Topic 7 (excel_reports) Multi-Format & Dual-Sheet Attendance Bento
// -------------------------------------------------------------
console.log("\n[Test 10] Verifying Topic 'excel_reports' Multi-Format & Dual-Sheet Attendance Bento...");
assert(guideModalCode.includes("33-Sheet") || guideModalCode.includes("State KPI Workbook"), "'excel_reports' must describe 33-Sheet KPI Workbook");
assert(guideModalCode.includes("Dual-Sheet Staff Attendance") || guideModalCode.includes("Attendance Matrix"), "'excel_reports' must describe Dual-Sheet Staff Attendance Workbook");
assert(guideModalCode.includes("Semaphore") || guideModalCode.includes("RAM Guard") || guideModalCode.includes("Sequential Queue"), "'excel_reports' must describe Concurrency Semaphore / RAM Guard");

// -------------------------------------------------------------
// Test 11: Topic 8 (audit_trail) RBAC Boundary Comparison & Tamper-Evident Bento
// -------------------------------------------------------------
console.log("\n[Test 11] Verifying Topic 'audit_trail' RBAC Boundary Comparison & Tamper-Evident Bento...");
assert(guideModalCode.includes("Super Admin") && guideModalCode.includes("Sub-Admin"), "'audit_trail' must compare Super Admin vs District Sub-Admin boundaries");
assert(guideModalCode.includes("403") || guideModalCode.includes("Cross-District Isolation") || guideModalCode.includes("Boundary"), "'audit_trail' must detail Cross-District Isolation & 403 Forbidden protection");
assert(guideModalCode.includes("Audit Trail") || guideModalCode.includes("Audit Ledger") || guideModalCode.includes("Tamper-Evident"), "'audit_trail' must describe Tamper-Evident Audit Logging");

// -------------------------------------------------------------
// Test 12: Topic 9 (faqs) Responsive Bento FAQ Cards
// -------------------------------------------------------------
console.log("\n[Test 12] Verifying Topic 'faqs' Responsive Bento FAQ Cards...");
assert(guideModalCode.includes("1-Click Fix") || guideModalCode.includes("Duplicate"), "'faqs' must include FAQ on 1-Click Fix");
assert(guideModalCode.includes("Nikshay") && (guideModalCode.includes("72") || guideModalCode.includes("Sync")), "'faqs' must include FAQ on Nikshay Sync Lag");
assert(guideModalCode.includes("PIN") || guideModalCode.includes("Duty PIN"), "'faqs' must include FAQ on PIN reset");

console.log("\n🎉 ALL ADMIN SOP BENTO UI & VERSION BUMP CHECKS PASSED!");
