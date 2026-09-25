import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

console.log("=== Running FO Help Guide Bento UI & Zero-Leakage Privacy Verification ===");

const appPath = resolve('dfy-frontend/src/App.jsx');
const appCode = readFileSync(appPath, 'utf8');

// Extract the FoHelpGuide component code
const foHelpGuideStart = appCode.indexOf('const FoHelpGuide = () => {');
assert(foHelpGuideStart !== -1, "FoHelpGuide component must exist in App.jsx");
const foHelpGuideEnd = appCode.indexOf('// --- Id Bucket ---', foHelpGuideStart);
assert(foHelpGuideEnd !== -1, "FoHelpGuide component end boundary must be identifiable");
const foGuideCode = appCode.substring(foHelpGuideStart, foHelpGuideEnd);

// -------------------------------------------------------------
// Test 1: STRICT ZERO-LEAKAGE PRIVACY CONSTRAINT
// -------------------------------------------------------------
console.log("\n[Test 1] Verifying ZERO-LEAKAGE PRIVACY in App.jsx and FoHelpGuide...");

assert(!appCode.includes('10:00 AM'), "CRITICAL: '10:00 AM' must NOT appear anywhere in App.jsx!");
assert(!appCode.toLowerCase().includes('10 am cutoff'), "CRITICAL: '10 am cutoff' must NOT appear in App.jsx!");
assert(!appCode.toLowerCase().includes('10am cutoff'), "CRITICAL: '10am cutoff' must NOT appear in App.jsx!");
assert(!appCode.toLowerCase().includes('next morning cutoff'), "CRITICAL: 'next morning cutoff' must NOT appear in App.jsx!");
assert(!appCode.toLowerCase().includes('cutoff'), "CRITICAL: 'cutoff' must NOT appear anywhere in App.jsx!");

// Official deadline communicated to field officers must be 7:00 PM
assert(foGuideCode.includes('7:00 PM'), "Official deadline in FoHelpGuide must strictly mention 7:00 PM");
console.log("✔ Zero-leakage privacy passed: 0 mentions of 10 AM / cutoff; 7:00 PM evening deadline enforced.");

// -------------------------------------------------------------
// Test 2: Verify All 9 Topics Exist in FoHelpGuide
// -------------------------------------------------------------
console.log("\n[Test 2] Verifying All 9 Topics Exist in FoHelpGuide...");

const expectedTopicIds = [
  "daily_reporting",
  "duplicate_rules",
  "offline_sync",
  "pending_interventions",
  "edit_correction",
  "patient_tracker",
  "fdc_and_faqs",
  "modern_ui_ergonomics",
  "attendance_and_remarks"
];

for (const topicId of expectedTopicIds) {
  assert(foGuideCode.includes(`id: "${topicId}"`), `FoHelpGuide must contain topic id: '${topicId}'`);
}
console.log(`✔ All 9 guide topic IDs found in FoHelpGuide.`);

// -------------------------------------------------------------
// Test 3: Topic 1 - Daily Field Reporting Workflow (4-card bento sequence)
// -------------------------------------------------------------
console.log("\n[Test 3] Verifying Topic 1: Daily Field Reporting Workflow Bento Sequence...");
assert(foGuideCode.includes("District aur Apna Naam Chunein") || foGuideCode.includes("District & PIN Selection"), "Topic 1 must have District selection card");
assert(foGuideCode.includes("TB Notification Box") || foGuideCode.includes("Naye Patients"), "Topic 1 must have TB Notification Box card");
assert(foGuideCode.includes("Clinical Interventions") || foGuideCode.includes("Other Interventions"), "Topic 1 must have Clinical Interventions card");
assert(foGuideCode.includes("Travel KM & Remarks") || foGuideCode.includes("Travel KM"), "Topic 1 must have Travel KM card");
assert(foGuideCode.includes("WhatsApp Paste Trick") || foGuideCode.includes("WhatsApp Paste"), "Topic 1 must have WhatsApp Paste Trick callout");
// Bento visual structure check: cards with grid and step indicators
assert(
  foGuideCode.includes('grid grid-cols-1 sm:grid-cols-2') ||
  foGuideCode.includes('grid grid-cols-1 sm:grid-cols-4') ||
  foGuideCode.includes('grid grid-cols-1 md:grid-cols-2') ||
  foGuideCode.includes('grid grid-cols-1 md:grid-cols-4'),
  "Topic 1 must use responsive bento grid for the 4-stage reporting sequence"
);
console.log("✔ Topic 1 has 4-card bento sequence and callout tips.");

// -------------------------------------------------------------
// Test 4: Topic 2 - Duplicate Notification vs Repeat Visit (Dual-card bento)
// -------------------------------------------------------------
console.log("\n[Test 4] Verifying Topic 2: Duplicate vs Repeat Visit Dual-Card Bento...");
assert(foGuideCode.includes("Hard Block") || foGuideCode.includes("Lal Modal"), "Topic 2 must feature Red Hard Block modal explanation");
assert(foGuideCode.includes("Repeat Visit") || foGuideCode.includes("Peela Modal") || foGuideCode.includes("Repeat Legitimate Visit"), "Topic 2 must feature Amber Repeat Visit explanation");
assert(foGuideCode.includes("90 din") || foGuideCode.includes("90-din") || foGuideCode.includes("90 Days"), "Topic 2 must mention 90 days notification rule");
assert(
  foGuideCode.includes('grid grid-cols-1 sm:grid-cols-2') ||
  foGuideCode.includes('grid grid-cols-1 md:grid-cols-2'),
  "Topic 2 must use side-by-side dual-card bento comparison"
);
console.log("✔ Topic 2 has dual-card comparison bento layout.");

// -------------------------------------------------------------
// Test 5: Topic 3 - Offline Mode & Zero-Loss Sync (3-card architecture bento)
// -------------------------------------------------------------
console.log("\n[Test 5] Verifying Topic 3: Offline Mode & Zero-Loss Sync 3-Card Architecture...");
assert(foGuideCode.includes("IndexedDB") || foGuideCode.includes("Phone Storage"), "Topic 3 must mention phone storage / IndexedDB vault");
assert(foGuideCode.includes("Network Detection") || foGuideCode.includes("Internet Aane Par") || foGuideCode.includes("Offline Queued"), "Topic 3 must describe network detection / queued status");
assert(foGuideCode.includes("Cloud Upload") || foGuideCode.includes("Cloud Sync") || foGuideCode.includes("Sync Now"), "Topic 3 must describe cloud sync");
assert(foGuideCode.includes("Zero Data Loss") || foGuideCode.includes("Zero-Loss"), "Topic 3 must feature Zero Data Loss guarantee badge");
assert(
  foGuideCode.includes('grid grid-cols-1 sm:grid-cols-3') ||
  foGuideCode.includes('grid grid-cols-1 md:grid-cols-3'),
  "Topic 3 must use 3-card responsive bento architecture grid"
);
console.log("✔ Topic 3 has 3-card architecture diagram with zero-loss shield.");

// -------------------------------------------------------------
// Test 6: Topic 4 - Pending Interventions Action Center (3-stage visual sequence)
// -------------------------------------------------------------
console.log("\n[Test 6] Verifying Topic 4: Pending Interventions 3-Stage Visual Sequence...");
assert(foGuideCode.includes("Pending Tab Kholein") || foGuideCode.includes("Open Pending Tab"), "Topic 4 must include Stage 1: Open Pending Tab");
assert(foGuideCode.includes("1-Tap Quick Autofill") || foGuideCode.includes("Autofill"), "Topic 4 must include Stage 2: 1-Tap Autofill");
assert(foGuideCode.includes("WhatsApp Follow-up Export") || foGuideCode.includes("Share WhatsApp List") || foGuideCode.includes("WhatsApp List"), "Topic 4 must include Stage 3: WhatsApp Follow-up Export");
assert(
  foGuideCode.includes('grid grid-cols-1 sm:grid-cols-3') ||
  foGuideCode.includes('grid grid-cols-1 md:grid-cols-3'),
  "Topic 4 must use 3-stage visual sequence bento cards"
);
console.log("✔ Topic 4 has 3-stage visual sequence bento layout.");

// -------------------------------------------------------------
// Test 7: Topic 5 - 24-Hour Self-Correction Window (3-step visual ladder)
// -------------------------------------------------------------
console.log("\n[Test 7] Verifying Topic 5: 24-Hour Self-Correction 3-Step Visual Ladder...");
assert(foGuideCode.includes("Profile") && (foGuideCode.includes("Calendar") || foGuideCode.includes("Select Date")), "Topic 5 must describe Profile Calendar date selection");
assert(foGuideCode.includes("Pencil") || foGuideCode.includes("✏️"), "Topic 5 must describe Pencil edit");
assert(foGuideCode.includes("Delete") || foGuideCode.includes("❌"), "Topic 5 must describe Delete / Cross removal");
assert(foGuideCode.includes("24 ghante") || foGuideCode.includes("24-Ghante") || foGuideCode.includes("24 Hours"), "Topic 5 must specify 24-hour grace window");
assert(
  foGuideCode.includes('grid grid-cols-1 sm:grid-cols-3') ||
  foGuideCode.includes('grid grid-cols-1 md:grid-cols-3'),
  "Topic 5 must use 3-step visual ladder bento cards"
);
console.log("✔ Topic 5 has 3-step visual ladder with 24h countdown badge.");

// -------------------------------------------------------------
// Test 8: Topic 6 - Patient Tracker & Nikshay Journey (Visual status progression ladder)
// -------------------------------------------------------------
console.log("\n[Test 8] Verifying Topic 6: Patient Tracker Status Progression Ladder...");
assert(foGuideCode.includes("Green Shield") || foGuideCode.includes("Verified"), "Topic 6 must explain Green Shield Verified status");
assert(foGuideCode.includes("Pending Sync") || foGuideCode.includes("Under Review") || foGuideCode.includes("Amber Badge"), "Topic 6 must explain Amber Pending Sync / Under Review status");
assert(foGuideCode.includes("DBT Validated") || foGuideCode.includes("Poshan sahayata"), "Topic 6 must explain DBT Validated status");
assert(foGuideCode.includes("Call") || foGuideCode.includes("📞"), "Topic 6 must explain 1-Tap Direct Call feature");
console.log("✔ Topic 6 has visual status progression ladder & 1-tap call card.");

// -------------------------------------------------------------
// Test 9: Topic 7 - FDC Dosages & Regimens Bento Tables
// -------------------------------------------------------------
console.log("\n[Test 9] Verifying Topic 7: FDC Dosages & Regimens Bento Tables...");
assert(foGuideCode.includes("Adult Regimen") && foGuideCode.includes("HRZE"), "Topic 7 must include Adult Regimen (HRZE / HRE)");
assert(foGuideCode.includes("Pediatric Regimen") && foGuideCode.includes("FDC-P"), "Topic 7 must include Pediatric Regimen (FDC-P)");
assert(foGuideCode.includes("Aam Field Sawal") || foGuideCode.includes("Field FAQs"), "Topic 7 must include FAQ bento cards");
console.log("✔ Topic 7 has bento dosage tables and FAQ cards.");

// -------------------------------------------------------------
// Test 10: Topic 8 - Quick Jump Pills, Numeric Keypad & Live Badges (4-tile bento)
// -------------------------------------------------------------
console.log("\n[Test 10] Verifying Topic 8: Modern UI Ergonomics 4-Tile Bento...");
assert(foGuideCode.includes("Sticky Category Quick-Jump Pills") || foGuideCode.includes("Quick-Jump Pills"), "Topic 8 must feature Quick-Jump Pills tile");
assert(foGuideCode.includes("Direct Number Dialpad") || foGuideCode.includes("Numeric Keypad"), "Topic 8 must feature Direct Number Dialpad tile");
assert(foGuideCode.includes("Live 9-Digit Formatter") || foGuideCode.includes("Progress Badge"), "Topic 8 must feature Live 9-Digit badge tile");
assert(foGuideCode.includes("Removable Patient Tag Chips") || foGuideCode.includes("Tag Chips"), "Topic 8 must feature Removable Tag Chips tile");
assert(
  foGuideCode.includes('grid grid-cols-1 sm:grid-cols-2') ||
  foGuideCode.includes('grid grid-cols-1 md:grid-cols-2'),
  "Topic 8 must use 4-tile responsive bento grid"
);
console.log("✔ Topic 8 has 4-tile ergonomics bento layout.");

// -------------------------------------------------------------
// Test 11: Topic 9 - Attendance Roster, Leave Badges & Supervisor Remarks (6-tile grid)
// -------------------------------------------------------------
console.log("\n[Test 11] Verifying Topic 9: Attendance Roster 6-Tile Grid & Supervisor Card...");
assert(foGuideCode.includes("Present") && foGuideCode.includes("Medical Leave") && foGuideCode.includes("Casual Leave"), "Topic 9 must include P, ML, CL");
assert(foGuideCode.includes("Official Duty") && foGuideCode.includes("Absent") && foGuideCode.includes("Weekly Off"), "Topic 9 must include OD, A, WO");
assert(foGuideCode.includes("Supervisor Inspection Remarks") || foGuideCode.includes("Supervisor Remarks"), "Topic 9 must feature Supervisor remarks card");
assert(
  foGuideCode.includes('grid grid-cols-2 sm:grid-cols-3') ||
  foGuideCode.includes('grid grid-cols-1 sm:grid-cols-3') ||
  foGuideCode.includes('grid grid-cols-2 md:grid-cols-3'),
  "Topic 9 must feature 6-tile bento status code grid"
);
console.log("✔ Topic 9 has 6-tile attendance status codes and supervisor remarks card.");

console.log("\n🎉 ALL FO HELP GUIDE BENTO UI & ZERO-LEAKAGE PRIVACY CHECKS PASSED!");
