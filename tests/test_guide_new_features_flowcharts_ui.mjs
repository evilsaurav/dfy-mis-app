import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

console.log("=== Running FO Guide & Admin SOP New Feature Flowcharts UI Test (v2.8.4) ===");

// -------------------------------------------------------------
// Read Source Files
// -------------------------------------------------------------
const appPath = resolve('dfy-frontend/src/App.jsx');
const appCode = readFileSync(appPath, 'utf8');

const adminPath = resolve('dfy-frontend/src/AdminDashboard.jsx');
const adminCode = readFileSync(adminPath, 'utf8');

// -------------------------------------------------------------
// Test 1: Critical Zero-Leakage Privacy Verification in App.jsx
// -------------------------------------------------------------
console.log("\n[Test 1] Verifying ZERO-LEAKAGE Privacy in App.jsx and FoHelpGuide...");
assert(!appCode.includes('10:00 AM'), "CRITICAL: '10:00 AM' must NOT appear anywhere in App.jsx!");
assert(!appCode.toLowerCase().includes('10 am cutoff'), "CRITICAL: '10 am cutoff' must NOT appear in App.jsx!");
assert(!appCode.toLowerCase().includes('10am cutoff'), "CRITICAL: '10am cutoff' must NOT appear in App.jsx!");
assert(!appCode.toLowerCase().includes('next morning cutoff'), "CRITICAL: 'next morning cutoff' must NOT appear in App.jsx!");
assert(!appCode.toLowerCase().includes('cutoff'), "CRITICAL: 'cutoff' must NOT appear anywhere in App.jsx!");
console.log("✔ Zero-leakage privacy strictly confirmed in App.jsx.");

// Extract FoHelpGuide
const foHelpGuideStart = appCode.indexOf('const FoHelpGuide = () => {');
assert(foHelpGuideStart !== -1, "FoHelpGuide component must exist in App.jsx");
const foHelpGuideEnd = appCode.indexOf('// --- Id Bucket ---', foHelpGuideStart);
assert(foHelpGuideEnd !== -1, "FoHelpGuide component end boundary must be identifiable");
const foGuideCode = appCode.substring(foHelpGuideStart, foHelpGuideEnd);

// Check 7:00 PM evening deadline enforced
assert(foGuideCode.includes('7:00 PM'), "Official deadline in FoHelpGuide must strictly mention 7:00 PM");

// -------------------------------------------------------------
// Test 2: FoHelpGuide Topic 10 (honors_and_badges) Verification
// -------------------------------------------------------------
console.log("\n[Test 2] Verifying Topic 10 (honors_and_badges) in FoHelpGuide...");

assert(foGuideCode.includes('id: "honors_and_badges"'), "FoHelpGuide must contain topic id: 'honors_and_badges'");
assert(foGuideCode.includes('10. FO Profile Honors, Badges & Achievement Card Studio'), "Topic 10 title must be '10. FO Profile Honors, Badges & Achievement Card Studio'");
assert(foGuideCode.includes('Milestone badges, profile showcase, HD card export & WhatsApp celebration share'), "Topic 10 subtitle mismatch");
assert(foGuideCode.includes('New in v2.8.4'), "Topic 10 badge must be 'New in v2.8.4'");
assert(foGuideCode.includes('bg-indigo-100 text-indigo-800 border-indigo-200'), "Topic 10 badgeColor must be 'bg-indigo-100 text-indigo-800 border-indigo-200'");

// Keywords check
const expectedFoKeywords = ['badges', 'honors', 'achievement', 'streak', 'target', 'pacesetter', 'eliminator', 'cascade', 'trail blazer', 'card', 'canvas', 'whatsapp', 'png', 'studio'];
for (const kw of expectedFoKeywords) {
  assert(foGuideCode.toLowerCase().includes(kw), `Topic 10 must contain keyword: ${kw}`);
}

// -------------------------------------------------------------
// Test 3: FoHelpGuide Topic 10 4-Card Sequential Bento Flowchart
// -------------------------------------------------------------
console.log("\n[Test 3] Verifying Topic 10 4-Card Sequential Bento Flowchart...");

// Check responsive bento grid structure
assert(
  foGuideCode.includes('grid grid-cols-1 sm:grid-cols-2 gap-3'),
  "Topic 10 must use 4-card responsive bento flowchart grid: 'grid grid-cols-1 sm:grid-cols-2 gap-3'"
);

// Step 1: 4 Dynamic Milestone Tracks
assert(foGuideCode.includes('TB Eliminator (100%+)'), "Topic 10 Step 1 must include 'TB Eliminator (100%+)'");
assert(foGuideCode.includes('Pacesetter (75%+)'), "Topic 10 Step 1 must include 'Pacesetter (75%+)'");
assert(foGuideCode.includes('Rising Star (50%+)'), "Topic 10 Step 1 must include 'Rising Star (50%+)'");
assert(foGuideCode.includes('14-Day Legend'), "Topic 10 Step 1 must include '14-Day Legend'");
assert(foGuideCode.includes('7-Day Iron Streak'), "Topic 10 Step 1 must include '7-Day Iron Streak'");
assert(foGuideCode.includes('3-Day Steady Pulse'), "Topic 10 Step 1 must include '3-Day Steady Pulse'");
assert(foGuideCode.includes('Clinical Cascade Master'), "Topic 10 Step 1 must include 'Clinical Cascade Master'");
assert(foGuideCode.includes('Cascade Specialist'), "Topic 10 Step 1 must include 'Cascade Specialist'");
assert(foGuideCode.includes('Bihar Trail Blazer (150+ KM)'), "Topic 10 Step 1 must include 'Bihar Trail Blazer (150+ KM)'");
assert(foGuideCode.includes('Active Voyager (75+ KM)'), "Topic 10 Step 1 must include 'Active Voyager (75+ KM)'");

// Step 2: Profile Honors Showcase
assert(foGuideCode.includes('MyProfileDashboard') || foGuideCode.includes('Profile Tab') || foGuideCode.includes('Honors & Milestone Badges'), "Topic 10 Step 2 must describe Profile Honors Showcase");
assert(foGuideCode.includes('flame') || foGuideCode.includes('streak') || foGuideCode.includes('🔥'), "Topic 10 Step 2 must describe flame streak pill");
assert(foGuideCode.includes('mobility') || foGuideCode.includes('KM Travelled') || foGuideCode.includes('🛵'), "Topic 10 Step 2 must describe mobility counter");

// Step 3: HD Achievement Card Studio
assert(foGuideCode.includes('Share My Achievement Card'), "Topic 10 Step 3 must mention 'Share My Achievement Card'");
assert(foGuideCode.includes('DFY emblem') || foGuideCode.includes('Doctors For You') || foGuideCode.includes('DFY logo'), "Topic 10 Step 3 must describe DFY emblem / logo");
assert(foGuideCode.includes('live preview') || foGuideCode.includes('interactive achievement card studio') || foGuideCode.includes('Live Preview'), "Topic 10 Step 3 must describe live preview");

// Step 4: 1-Click HD PNG Export & WhatsApp Share
assert(foGuideCode.includes('1080x1350'), "Topic 10 Step 4 must specify 1080x1350 Canvas HD resolution");
assert(foGuideCode.includes('DFY_Achievement_') || foGuideCode.includes('.png'), "Topic 10 Step 4 must mention PNG download");
assert(foGuideCode.includes('WhatsApp') || foGuideCode.includes('whatsapp'), "Topic 10 Step 4 must mention WhatsApp celebration share");
assert(foGuideCode.includes('zero patient') || foGuideCode.includes('zero patient PII') || foGuideCode.includes('PII') || foGuideCode.includes('privacy'), "Topic 10 Step 4 must emphasize zero patient PII leaked");

console.log("✔ FO Guide Topic 10 successfully verified with all 4 bento steps.");

// -------------------------------------------------------------
// Test 4: Admin SOP Guide Topic 11 (top_performers_studio) Verification
// -------------------------------------------------------------
console.log("\n[Test 4] Verifying Topic 11 (top_performers_studio) in AdminDashboard.jsx...");

// Extract showAppGuideModal
const guideModalStart = adminCode.indexOf('{showAppGuideModal && (');
assert(guideModalStart !== -1, "showAppGuideModal modal block must exist in AdminDashboard.jsx");
const guideModalEnd = adminCode.indexOf('{/* ========================================================================= */}', guideModalStart + 100);
assert(guideModalEnd !== -1, "showAppGuideModal modal end boundary must be identifiable");
const guideModalCode = adminCode.substring(guideModalStart, guideModalEnd);

// Check sidebar topics entry
assert(guideModalCode.includes("key: 'top_performers_studio'"), "Sidebar topics must contain key: 'top_performers_studio'");
assert(guideModalCode.includes("Top Performers & Analytics Studio"), "Sidebar topic label must be 'Top Performers & Analytics Studio'");
assert(guideModalCode.includes("4-Role Leaderboard, Dynamic Designation Shift & Full-Width Trends"), "Sidebar topic desc mismatch");

// Check content panel condition
assert(guideModalCode.includes("appGuideActiveTopic === 'top_performers_studio'"), "showAppGuideModal must contain content render condition for 'top_performers_studio'");

// -------------------------------------------------------------
// Test 5: Admin SOP Guide Topic 11 4-Card Sequential Bento Flowchart
// -------------------------------------------------------------
console.log("\n[Test 5] Verifying Topic 11 4-Card Sequential Bento Flowchart...");

// Step 1: 4 Clinical Cadre Segregation
assert(guideModalCode.includes('Top Districts') || guideModalCode.includes('🏛️ Top Districts (DC)'), "Topic 11 Step 1 must describe Top Districts (DC)");
assert(guideModalCode.includes('Top FO & Hub Agents') || guideModalCode.includes('Top FO &amp; Hub Agents') || guideModalCode.includes('📋 Top FO & Hub Agents'), "Topic 11 Step 1 must describe Top FO & Hub Agents");
assert(guideModalCode.includes('HUB AGENT') || guideModalCode.includes('amber'), "Topic 11 Step 1 must mention amber HUB AGENT badge");
assert(guideModalCode.includes('Top Lab Technicians') || guideModalCode.includes('🔬 Top Lab Technicians (LT)'), "Topic 11 Step 1 must describe Top Lab Technicians (LT)");
assert(guideModalCode.includes('Top SCT Agents') || guideModalCode.includes('🧪 Top SCT Agents'), "Topic 11 Step 1 must describe Top SCT Agents");

// Step 2: Dynamic Designation Shift
assert(guideModalCode.includes('Dynamic Designation Shift') || guideModalCode.includes('Designation Shift'), "Topic 11 Step 2 must describe Dynamic Designation Shift");
assert(guideModalCode.includes('cache eviction') || guideModalCode.includes('invalidation') || guideModalCode.includes('cache'), "Topic 11 Step 2 must describe cache eviction on designation change");

// Step 3: HD WhatsApp Poster Studio (1200x1350)
assert(guideModalCode.includes('1200x1350'), "Topic 11 Step 3 must mention 1200x1350 canvas poster resolution");
assert(guideModalCode.includes('4-quadrant') || guideModalCode.includes('4 quadrant') || guideModalCode.includes('quadrant'), "Topic 11 Step 3 must describe 4-quadrant layout");
assert(guideModalCode.includes('WhatsApp') || guideModalCode.includes('broadcast'), "Topic 11 Step 3 must describe WhatsApp broadcast");

// Step 4: Full-Width 30-Day Daily Progression Trend
assert(guideModalCode.includes('Full-Width') || guideModalCode.includes('full-width'), "Topic 11 Step 4 must describe full-width layout");
assert(guideModalCode.includes('Progression Trend') || guideModalCode.includes('Daily Progression') || guideModalCode.includes('area chart'), "Topic 11 Step 4 must describe Daily Progression Trend area chart");

console.log("✔ Admin SOP Topic 11 successfully verified with all 4 bento steps.");

console.log("\n🎉 ALL NEW FEATURE FLOWCHARTS UI TESTS PASSED 100%!");
