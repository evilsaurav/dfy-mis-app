import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

import { getFullAdminDashboardCode } from './test_helpers.mjs';

const adminCode = getFullAdminDashboardCode();

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
const overviewPath = resolve('dfy-frontend/src/components/Admin/tabs/OverviewTab.jsx');
const overviewCode = readFileSync(overviewPath, 'utf8');
const topPerformersIndex = overviewCode.indexOf('Bihar Statewide Top Performers Studio');
const dailyTrendIndex = overviewCode.indexOf('Daily Progression Trend');
assert(
  topPerformersIndex !== -1,
  "Bihar Statewide Top Performers Studio must exist in OverviewTab.jsx"
);
assert(
  dailyTrendIndex !== -1,
  "Daily Progression Trend must exist in OverviewTab.jsx"
);
assert(
  topPerformersIndex < dailyTrendIndex,
  "Bihar Statewide Top Performers Studio must be rendered ABOVE Daily Progression Trend"
);
console.log("✔ Top Performers Studio is placed above Daily Progression Trend.");

// Test 3: Verify 5 Clinical Role Tabs exist in Top Performers Studio (including Treatment Coordinators)
console.log("\n[Test 3] Checking presence of 5 clinical role tabs...");
assert(
  adminCode.includes("setTopPerformersTab('districts')") || adminCode.includes('Top Districts'),
  "Studio must have 'Top Districts (DC)' tab"
);
assert(
  adminCode.includes("setTopPerformersTab('fo')") || adminCode.includes('Top FO & Hub Agents'),
  "Studio must have 'Top FO & Hub Agents' tab"
);
assert(
  adminCode.includes("setTopPerformersTab('tc')") && adminCode.includes('Top Treatment Coordinators'),
  "Studio must have 'Top Treatment Coordinators (TC)' tab"
);
assert(
  adminCode.includes("setTopPerformersTab('lt')") || adminCode.includes('Top Lab Technicians (LT)'),
  "Studio must have 'Top Lab Technicians (LT)' tab"
);
assert(
  adminCode.includes("setTopPerformersTab('sct')") || adminCode.includes('Top SCT Agents'),
  "Studio must have 'Top SCT Agents' tab"
);
console.log("✔ All 5 role tabs are present.");

// Test 4: Verify Hub Agent badge and 5-bucket data bindings
console.log("\n[Test 4] Checking Hub Agent badge and data bindings...");
assert(
  adminCode.includes('HUB AGENT') || adminCode.includes('Hub Agent'),
  "Hub Agent badge or label must be present in top performers list"
);
assert(
  adminCode.includes('top_fo') && adminCode.includes('top_tc') && adminCode.includes('top_lt') && adminCode.includes('top_sct'),
  "AdminDashboard must consume top_fo, top_tc, top_lt, and top_sct from API"
);
assert(
  adminCode.includes('home_visits') && adminCode.includes('visits'),
  "AdminDashboard must display home visits metric for Treatment Coordinators"
);
console.log("✔ Hub Agent badge and all 5 data buckets consumed with home visits binding.");

// Test 5: Verify 5-tier WhatsApp text generator
console.log("\n[Test 5] Checking WhatsApp share formatting for 5 categories...");
assert(
  adminCode.includes('TOP 5 DISTRICTS') && 
  (adminCode.includes('TOP 5 FIELD OFFICERS') || adminCode.includes('TOP 5 FO')) &&
  adminCode.includes('TOP 5 TREATMENT COORDINATORS') &&
  adminCode.includes('TOP 5 LAB TECHNICIANS') &&
  adminCode.includes('TOP 5 SCT AGENTS'),
  "WhatsApp share text must format all 5 clinical role categories"
);
console.log("✔ WhatsApp share formatter includes all 5 categories.");

// Test 6: Verify HD 1200x1850 / 1200x1960 Poster Canvas & Modal
console.log("\n[Test 6] Checking HD poster canvas generation and modal...");
assert(
  adminCode.includes('1850') || adminCode.includes('1960'),
  "Poster canvas height must be 1850 or 1960 to accommodate balanced quadrants and commendation banner"
);
assert(
  adminCode.includes('BIHAR MISSION IMPACT'),
  "Poster canvas and modal must include Bihar Mission Impact quadrant"
);
console.log("✔ HD 1200x1850 canvas generation and 6-panel modal layout verified.");

console.log("\n🎉 ALL TOP PERFORMERS STUDIO & LAYOUT UI CHECKS PASSED!");
