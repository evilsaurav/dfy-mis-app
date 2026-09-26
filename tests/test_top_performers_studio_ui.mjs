import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

const adminCode = readFileSync(resolve('dfy-frontend/src/AdminDashboard.jsx'), 'utf8');

console.log("=== Running Top Performers Studio & Layout UI Verification ===");

// Test 1: Verify Work Balance Radar is REMOVED from AdminDashboard.jsx
console.log("\n[Test 1] Checking removal of Work Balance Radar...");
assert(
  !adminCode.includes('Work Balance Radar'),
  "Work Balance Radar heading must be completely removed from AdminDashboard.jsx"
);
assert(
  !adminCode.includes('Multi-domain clinical balance'),
  "Multi-domain clinical balance text must be removed from AdminDashboard.jsx"
);
console.log("✔ Work Balance Radar is completely removed.");

// Test 2: Verify Bihar Top Performers Studio is full-width and placed BEFORE Daily Progression Trend
console.log("\n[Test 2] Checking full-width layout hierarchy...");
const topPerformersIndex = adminCode.indexOf('Bihar Statewide Top Performers Studio');
const dailyTrendIndex = adminCode.indexOf('Daily Progression Trend');
assert(
  topPerformersIndex !== -1,
  "Bihar Statewide Top Performers Studio must exist in AdminDashboard.jsx"
);
assert(
  dailyTrendIndex !== -1,
  "Daily Progression Trend must exist in AdminDashboard.jsx"
);
assert(
  topPerformersIndex < dailyTrendIndex,
  "Bihar Statewide Top Performers Studio must be rendered ABOVE Daily Progression Trend"
);
console.log("✔ Top Performers Studio is placed above Daily Progression Trend.");

// Test 3: Verify 4 Role Tabs exist in Top Performers Studio
console.log("\n[Test 3] Checking presence of 4 clinical role tabs...");
assert(
  adminCode.includes("setTopPerformersTab('districts')") || adminCode.includes('Top Districts'),
  "Studio must have 'Top Districts (DC)' tab"
);
assert(
  adminCode.includes("setTopPerformersTab('fo')") || adminCode.includes('Top FO & Hub Agents'),
  "Studio must have 'Top FO & Hub Agents' tab"
);
assert(
  adminCode.includes("setTopPerformersTab('lt')") || adminCode.includes('Top Lab Technicians (LT)'),
  "Studio must have 'Top Lab Technicians (LT)' tab"
);
assert(
  adminCode.includes("setTopPerformersTab('sct')") || adminCode.includes('Top SCT Agents'),
  "Studio must have 'Top SCT Agents' tab"
);
console.log("✔ All 4 role tabs are present.");

// Test 4: Verify Hub Agent badge and 4-bucket data bindings
console.log("\n[Test 4] Checking Hub Agent badge and data bindings...");
assert(
  adminCode.includes('HUB AGENT') || adminCode.includes('Hub Agent'),
  "Hub Agent badge or label must be present in top performers list"
);
assert(
  adminCode.includes('top_fo') && adminCode.includes('top_lt') && adminCode.includes('top_sct'),
  "AdminDashboard must consume top_fo, top_lt, and top_sct from API"
);
console.log("✔ Hub Agent badge and all 4 data buckets consumed.");

// Test 5: Verify 4-tier WhatsApp text generator
console.log("\n[Test 5] Checking WhatsApp share formatting for 4 categories...");
assert(
  adminCode.includes('TOP 5 DISTRICTS') && 
  (adminCode.includes('TOP 5 FIELD OFFICERS') || adminCode.includes('TOP 5 FO')) &&
  adminCode.includes('TOP 5 LAB TECHNICIANS') &&
  adminCode.includes('TOP 5 SCT AGENTS'),
  "WhatsApp share text must format all 4 clinical role categories"
);
console.log("✔ WhatsApp share formatter includes all 4 categories.");

console.log("\n🎉 ALL TOP PERFORMERS STUDIO & LAYOUT UI CHECKS PASSED!");
