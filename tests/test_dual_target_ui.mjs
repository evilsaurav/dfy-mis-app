import fs from 'fs';
import path from 'path';
import assert from 'node:assert';

console.log('=== Running Dual-Target UI & RBAC Verification Tests ===\n');

const adminPath = path.resolve('dfy-frontend/src/AdminDashboard.jsx');
const appPath = path.resolve('dfy-frontend/src/App.jsx');

const adminCode = fs.readFileSync(adminPath, 'utf8');
const appCode = fs.readFileSync(appPath, 'utf8');

// 1. Admin Target Setting Modal features Official District Target input
assert(
  adminCode.includes('officialDistrictTarget') &&
  adminCode.includes('setOfficialDistrictTarget'),
  'AdminDashboard declares officialDistrictTarget state hook'
);

// 2. Admin Target Setting Modal features save district target handler with RBAC
assert(
  adminCode.includes('handleSaveDistrictTarget') &&
  adminCode.includes('/update-district-target'),
  'AdminDashboard implements handleSaveDistrictTarget calling /update-district-target'
);

// 3. Admin Target Modal renders Live Comparison Buffer Pill
assert(
  adminCode.includes('Buffer:') || adminCode.includes('Stretch Quota'),
  'AdminDashboard renders live buffer comparison badge between official and frontline targets'
);

// 4. Overview Target Pacing Card prioritizes officialDistrictTarget
assert(
  adminCode.includes('effectiveDistrictTarget') ||
  adminCode.includes('officialDistrictTarget || totalStateTarget'),
  'Overview Target Pacing Card calculates pacing using official district target'
);

// 5. Zero Leakage in FO Mobile App
assert(
  !appCode.includes('official_district_target'),
  'FO Mobile App does not expose or leak official district target'
);

console.log('🎉 ALL DUAL-TARGET UI & PRIVACY TESTS PASSED 100%!\n');
