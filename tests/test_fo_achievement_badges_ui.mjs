import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log("=== Running FO Profile Honors, Badges & Achievement Studio UI Verification ===");

const appPath = path.resolve('dfy-frontend/src/App.jsx');
const content = fs.readFileSync(appPath, 'utf8');

// Test 1: Verify 4 Dynamic Honors & Badges definitions in App.jsx
console.log("\n[Test 1] Checking 4 dynamic milestone badges definitions...");

const expectedBadges = [
  // 1. Target Achiever
  'TB Eliminator (100%+)',
  'Pacesetter (75%+)',
  'Rising Star (50%+)',
  'Target Challenger',

  // 2. Punctuality Streak
  '14-Day Legend',
  '7-Day Iron Streak',
  '3-Day Steady Pulse',
  'Daily Reporter',

  // 3. Cascade Champion
  'Clinical Cascade Master',
  'Cascade Specialist',
  'Case Referrer',

  // 4. Field Trail Blazer
  'Bihar Trail Blazer (150+ KM)',
  'Active Voyager (75+ KM)',
  'Field Cruiser',
  'Local Case Finder'
];

expectedBadges.forEach(badge => {
  assert.ok(
    content.includes(badge),
    `App.jsx must contain badge title: '${badge}'`
  );
});
console.log("✔ All 15 dynamic badge tier titles are defined.");

// Test 2: Verify Honors & Milestone Badges Showcase UI in MyProfileDashboard
console.log("\n[Test 2] Checking Honors & Milestone Badges Showcase UI...");
assert.ok(
  content.includes('Honors & Milestone Badges') || content.includes('🏆 Honors & Milestone Badges'),
  "MyProfileDashboard must include 'Honors & Milestone Badges' showcase heading"
);

assert.ok(
  content.includes('Share My Achievement Card'),
  "MyProfileDashboard must contain 'Share My Achievement Card' action button"
);
console.log("✔ Honors & Milestone Badges showcase section and share button are present.");

// Test 3: Verify Achievement Card Studio Modal, Canvas Ref, and 1080x1350 resolution
console.log("\n[Test 3] Checking Achievement Card Studio Modal and Canvas generation...");
assert.ok(
  content.includes('showFoAchievementModal'),
  "MyProfileDashboard must declare showFoAchievementModal state"
);
assert.ok(
  content.includes('foCanvasRef'),
  "MyProfileDashboard must declare foCanvasRef"
);
assert.ok(
  content.includes('1080') && content.includes('1350'),
  "Canvas must support 1080x1350 HD resolution"
);
assert.ok(
  content.includes('DFY_Achievement_'),
  "Download handler must export PNG with 'DFY_Achievement_' filename prefix"
);
assert.ok(
  content.includes('handleDownloadFoAchievementCard') || content.includes('handleDownloadFoCard'),
  "MyProfileDashboard must implement download handler for achievement card"
);
assert.ok(
  content.includes('handleShareFoAchievementWhatsApp') || content.includes('handleShareFoWhatsApp'),
  "MyProfileDashboard must implement WhatsApp share handler for achievement card"
);
console.log("✔ Studio modal, 1080x1350 canvas generation, and share handlers are present.");

// Test 4: Verify Zero-Leakage Privacy Constraint
console.log("\n[Test 4] Checking Zero-Leakage Privacy Constraint...");
const lower = content.toLowerCase();
assert.ok(
  !lower.includes('10:00 am') &&
  !lower.includes('10:00am') &&
  !lower.includes('10 am cutoff') &&
  !lower.includes('stealth cutoff'),
  "CRITICAL SECURITY: App.jsx must NEVER mention the 10:00 AM stealth cutoff!"
);

// Verify achievement WhatsApp share does not contain patient IDs
const whatsappShareMatch = content.match(/const handleShareFoAchievementWhatsApp[\s\S]*?window\.open/);
if (whatsappShareMatch) {
  const shareCode = whatsappShareMatch[0];
  assert.ok(
    !shareCode.includes('nikshay') && !shareCode.includes('patient_id') && !shareCode.includes('oldId'),
    "Achievement WhatsApp sharing must NEVER leak patient IDs or private data"
  );
}
console.log("✔ Zero-leakage privacy constraint verified (0 stealth cutoff mentions, 0 PII leaks).");

// Test 5: Verify Temporal Dead Zone (TDZ) Order
console.log("\n[Test 5] Checking Temporal Dead Zone (TDZ) hook declaration order...");
const profileDashboardIndex = content.indexOf('const MyProfileDashboard =');
assert.ok(profileDashboardIndex !== -1, "MyProfileDashboard must exist in App.jsx");
const profileEndIndex = content.indexOf('const PatientJourneyTracker =', profileDashboardIndex);
assert.ok(profileEndIndex !== -1, "PatientJourneyTracker boundary must exist in App.jsx");

const modalStateIndex = content.indexOf('showFoAchievementModal', profileDashboardIndex);
const badgesDeclarationIndex = content.indexOf('const foBadges = useMemo', profileDashboardIndex);

assert.ok(
  modalStateIndex !== -1 && modalStateIndex < profileEndIndex,
  "showFoAchievementModal must be declared inside MyProfileDashboard"
);
assert.ok(
  badgesDeclarationIndex !== -1 && badgesDeclarationIndex < profileEndIndex,
  "foBadges must be declared inside MyProfileDashboard"
);
assert.ok(
  modalStateIndex < badgesDeclarationIndex,
  "State hooks must be declared before derived computations (TDZ safety)"
);
console.log("✔ State hooks are declared before derived computations (TDZ safe).");

console.log("\n🎉 ALL FO ACHIEVEMENT BADGES & STUDIO UI CHECKS PASSED!");
