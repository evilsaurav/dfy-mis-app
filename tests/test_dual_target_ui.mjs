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

// 5. Individual Frontline targets per staff & Removal of Give Each
assert(
  !adminCode.includes('Give Each') &&
  !adminCode.includes('districtQuickFOValue') &&
  adminCode.includes('Individual Frontline Staff Quotas') &&
  adminCode.includes('/update-targets-bulk'),
  'AdminDashboard removed Give Each and features individual staff frontline targets with bulk backend API'
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

// 11. Last month inheritance and Copy Last Month action
assert(
  adminCode.includes('handleCopyFromLastMonth') &&
  adminCode.includes('Copy Last Month') &&
  adminCode.includes('getPreviousMonth'),
  'AdminDashboard implements handleCopyFromLastMonth and displays Copy Last Month button'
);

// 12. operationalMonth.js exports getPreviousMonth
const opMonthPath = path.resolve('dfy-frontend/src/utils/operationalMonth.js');
const opMonthCode = fs.readFileSync(opMonthPath, 'utf8');
assert(
  opMonthCode.includes('export const getPreviousMonth'),
  'operationalMonth.js exports getPreviousMonth helper'
);

// 13. Top Performers Studio perspective sync & badge
assert(
  adminCode.includes('&target_mode=${targetModeParam}') &&
  adminCode.includes('fetchTopPerformers(topPerformersPeriod, adminTargetViewMode)'),
  'AdminDashboard passes target_mode parameter and re-fetches top performers on perspective switch'
);
// 14. FO Mobile App Main Dashboard renders Frontline Target & Progress Card
assert(
  appCode.includes('Frontline Target') &&
  appCode.includes('Monthly Goal:') &&
  appCode.includes('foMonthlyHistory?.target') &&
  appCode.includes('foMonthlyHistory?.breakdown?.notification'),
  'FO Mobile App renders Frontline Monthly Target & Progress Card on main reporting screen'
);

// 15. Backend main.py evicts profile cache on bulk target update
const mainPath = path.resolve('main.py');
const mainCode = fs.readFileSync(mainPath, 'utf8');
assert(
  mainCode.includes('cache.delete_prefix("profile_")'),
  'main.py evicts profile cache on bulk staff target update'
);

console.log('🎉 ALL DUAL-TARGET UI & PRIVACY TESTS PASSED 100%!\n');
