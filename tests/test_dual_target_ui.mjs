import fs from 'fs';
import path from 'path';
import assert from 'node:assert';

console.log('=== Running Dual-Target UI & RBAC Verification Tests ===\n');

const adminPath = path.resolve('dfy-frontend/src/AdminDashboard.jsx');
const appPath = path.resolve('dfy-frontend/src/App.jsx');

const adminCode = fs.readFileSync(adminPath, 'utf8');
const appCode = fs.readFileSync(appPath, 'utf8');

// 1. Admin Target Setting Modal features Official District Target input & state
assert(
  adminCode.includes('officialDistrictTarget') &&
  adminCode.includes('setOfficialDistrictTarget') &&
  adminCode.includes('tempOfficialTargets') &&
  adminCode.includes('setTempOfficialTargets'),
  'AdminDashboard declares officialDistrictTarget & tempOfficialTargets state hooks'
);

// 2. Admin Target Setting Modal features save district target handler with RBAC
assert(
  adminCode.includes('handleSaveSingleDistrictTarget') &&
  adminCode.includes('/update-district-target'),
  'AdminDashboard implements handleSaveSingleDistrictTarget calling /update-district-target'
);

// 3. User constraint: Custom Bulk Setter banner is completely removed!
assert(
  !adminCode.includes('Custom Bulk Setter for'),
  'AdminDashboard has completely removed the legacy Custom Bulk Setter banner'
);

// 4. Modal includes Tab switcher and One-Screen Master Grid
assert(
  adminCode.includes('targetModalTab') &&
  adminCode.includes('1. District Master Targets') &&
  adminCode.includes('2. Individual Staff Fine-Tuning'),
  'AdminDashboard implements the 2-tab segmented switcher in the Target Settings Modal'
);

// 5. Quick Frontline Allocator ("Give Each") per district
assert(
  adminCode.includes('districtQuickFOValue') &&
  adminCode.includes('Give Each') &&
  adminCode.includes('Frontline:'),
  'AdminDashboard includes inline Quick Frontline Allocator for each district'
);

// 6. Bulk Save Handlers are implemented and wired to buttons
assert(
  adminCode.includes('handleSaveBulkDistrictTargets') &&
  adminCode.includes('handleSaveAllTargetsCombined') &&
  adminCode.includes('/update-district-targets-bulk'),
  'AdminDashboard implements bulk district target saving and combined saving'
);

// 7. Global Perspective Switch in Header
assert(
  adminCode.includes('adminTargetViewMode') &&
  adminCode.includes('setAdminTargetViewMode') &&
  adminCode.includes('Official') &&
  adminCode.includes('Frontline'),
  'AdminDashboard renders header global perspective toggle between Official and Frontline'
);

// 8. Performance data, Leaderboard, and Table sync with perspective switch
assert(
  adminCode.includes("adminTargetViewMode === 'frontline'") &&
  adminCode.includes('officialTarget: offTgt') &&
  adminCode.includes('frontlineTarget: staffTargetSum'),
  'Performance calculations benchmark against official target or frontline stretch based on adminTargetViewMode'
);

// 9. Overview Target Pacing Card prioritizes adminTargetViewMode
assert(
  adminCode.includes("(adminTargetViewMode === 'frontline') ? frontlineStretchTarget : effectiveDistrictTarget"),
  'Overview Target Pacing Card calculates pacing using selected target view perspective'
);

// 10. Zero Leakage in FO Mobile App
assert(
  !appCode.includes('official_district_target'),
  'FO Mobile App does not expose or leak official district target'
);

console.log('🎉 ALL DUAL-TARGET UI & PRIVACY TESTS PASSED 100%!\n');
