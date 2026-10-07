import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

console.log("Running Visual Bento Flowcharts & Privacy UI Verification Tests...\n");

const appPath = resolve('dfy-frontend/src/App.jsx');
const appCode = readFileSync(appPath, 'utf8');

import { getFullAdminDashboardCode } from './test_helpers.mjs';

const adminCode = getFullAdminDashboardCode();

const changelogPath = resolve('dfy-frontend/src/changelogData.js');
const changelogCode = readFileSync(changelogPath, 'utf8');

// 1. Verify FO Guide in App.jsx has visual bento workflow step cards & attendance legend
console.log("1. Verifying FO Guide Bento Flowcharts in App.jsx...");
assert(
  appCode.includes('Daily Reporting Lifecycle') || appCode.includes('Reporting Workflow'),
  "FO Guide must feature Daily Reporting Lifecycle / Reporting Workflow bento flowchart"
);
assert(
  appCode.includes('Patient Journey & Direct 1-Tap Calling') || appCode.includes('Patient Journey & 1-Tap Calling') || appCode.includes('Direct Patient Call'),
  "FO Guide must feature Patient Journey & Direct 1-Tap Calling flowchart"
);
assert(
  appCode.includes('Attendance Status & Leave Color Legend') || appCode.includes('Attendance Status & Leave Colors'),
  "FO Guide must feature Attendance Status & Leave Color Legend"
);
assert(
  appCode.includes('7:00 PM'),
  "FO Guide must preserve the standard field guideline for 7:00 PM submission"
);
console.log("✔ FO Guide bento flowcharts present in App.jsx.");

// 2. CRITICAL ZERO-LEAKAGE PRIVACY CHECK: Stealth 10 AM Cutoff MUST NOT be in FO Guide or App.jsx!
console.log("2. Verifying ZERO-LEAKAGE PRIVACY in App.jsx...");
assert(!appCode.includes('Stealth 10:00 AM'), "CRITICAL: 'Stealth 10:00 AM' must NOT be in App.jsx!");
assert(!appCode.includes('10:00 AM Cutoff'), "CRITICAL: '10:00 AM Cutoff' must NOT be in App.jsx!");
assert(!appCode.includes('10 AM cutoff'), "CRITICAL: '10 AM cutoff' must NOT be in App.jsx!");
assert(!appCode.includes('10 AM grace'), "CRITICAL: '10 AM grace' must NOT be in App.jsx!");
assert(!appCode.toLowerCase().includes('cutoff'), "CRITICAL: 'cutoff' must NOT be present anywhere in App.jsx!");
console.log("✔ Zero leakage of stealth 10 AM cutoff verified in App.jsx.");

// 3. Verify Admin SOP in AdminDashboard.jsx has visual bento workflow step cards
console.log("3. Verifying Admin SOP Bento Flowcharts in AdminDashboard.jsx...");
assert(
  adminCode.includes('Attendance Monitoring Workflow') || adminCode.includes('Morning & Evening Attendance Monitoring'),
  "Admin SOP must feature Attendance Monitoring Workflow"
);
assert(
  adminCode.includes('Nikshay Reconciler Workflow') || adminCode.includes('Nikshay Reconciler & Direct Patient Contact'),
  "Admin SOP must feature Nikshay Reconciler Workflow"
);
assert(
  adminCode.includes('Dual-Sheet Staff Attendance Export') || adminCode.includes('Dual-Sheet Attendance Export Workflow') || adminCode.includes('Historical Attendance Corrections & Monthly Export'),
  "Admin SOP must feature Dual-Sheet Staff Attendance Export Workflow"
);
console.log("✔ Admin SOP bento flowcharts present in AdminDashboard.jsx.");

// 4. Verify Version Bump to 2.8.2+ in changelogData.js
console.log("4. Verifying Version Bump to v2.8.2+ in changelogData.js...");
assert(['2.8.2', '2.8.3', '2.8.4', '2.8.5', '2.8.6', '2.9.0'].some(v => changelogCode.includes(`export const APP_VERSION = "${v}";`)), "App version must be >= 2.8.2");
assert(changelogCode.includes('export const LAST_UPDATED_DATE ='), "Last updated date must be exported");
assert(changelogCode.includes('v2.8.2'), "Changelog must include v2.8.2 release entry");
assert(changelogCode.includes('Staff Attendance'), "Changelog must describe Staff Attendance export");
assert(changelogCode.includes('Retroactive Admin Inspection Remarks') || changelogCode.includes('Retroactive Remarks'), "Changelog must describe Retroactive Remarks");
assert(changelogCode.includes('1-Tap Calling') || changelogCode.includes('1-Tap Dial'), "Changelog must describe 1-Tap Calling");
console.log("✔ Version bump and v2.8.2 changelog entry verified in changelogData.js.");

console.log("\n All visual flowcharts, privacy, and version bump checks PASSED!");
