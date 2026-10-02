import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardPath = path.join(__dirname, '../dfy-frontend/src/AdminDashboard.jsx');
const modalsHookPath = path.join(__dirname, '../dfy-frontend/src/hooks/useAdminModals.js');
const dashSrc = readFileSync(dashboardPath, 'utf8');
const modalsSrc = readFileSync(modalsHookPath, 'utf8');

console.log('🧪 Testing Frontend Staff Live Sync Wiring...');

// 1. Check AdminDashboard.jsx passes fetchDirectory and loadTargets into useAdminModals
assert.ok(
  dashSrc.includes('fetchDirectory,') || dashSrc.includes('fetchDirectory: fetchDirectory,'),
  'AdminDashboard.jsx must pass fetchDirectory to useAdminModals'
);
assert.ok(
  dashSrc.includes('loadTargets,') || dashSrc.includes('loadTargets: loadTargets,'),
  'AdminDashboard.jsx must pass loadTargets to useAdminModals'
);

// 2. Check useAdminModals.js executes coordinated refresh in handleExecuteAddStaff
const addStaffMatch = modalsSrc.match(/const handleExecuteAddStaff = async[\s\S]*?if \(res\.ok\) \{([\s\S]*?)\}/);
assert.ok(addStaffMatch, 'handleExecuteAddStaff function must exist');
const addStaffBody = addStaffMatch[1];
assert.ok(addStaffBody.includes('fetchDirectory'), 'handleExecuteAddStaff must call fetchDirectory()');
assert.ok(addStaffBody.includes('loadTargets'), 'handleExecuteAddStaff must call loadTargets()');
assert.ok(addStaffBody.includes('fetchStaffList'), 'handleExecuteAddStaff must call fetchStaffList()');

// 3. Check handleExecuteDeleteStaff & handleExecuteToggleStaffStatus
const deleteStaffMatch = modalsSrc.match(/const handleExecuteDeleteStaff = async[\s\S]*?if \(res\.ok\) \{([\s\S]*?)\}/);
assert.ok(deleteStaffMatch, 'handleExecuteDeleteStaff must exist');
assert.ok(deleteStaffMatch[1].includes('fetchDirectory'), 'handleExecuteDeleteStaff must call fetchDirectory()');

const toggleStaffMatch = modalsSrc.match(/const handleExecuteToggleStaffStatus = async[\s\S]*?if \(res\.ok\) \{([\s\S]*?)\}/);
assert.ok(toggleStaffMatch, 'handleExecuteToggleStaffStatus must exist');
assert.ok(toggleStaffMatch[1].includes('fetchDirectory'), 'handleExecuteToggleStaffStatus must call fetchDirectory()');

// 4. Check handleExecuteUpdatePin
const updatePinMatch = modalsSrc.match(/const handleExecuteUpdatePin = async[\s\S]*?if \(res\.ok\) \{([\s\S]*?)\}/);
assert.ok(updatePinMatch, 'handleExecuteUpdatePin must exist');
assert.ok(updatePinMatch[1].includes('fetchDirectory'), 'handleExecuteUpdatePin must call fetchDirectory()');
assert.ok(updatePinMatch[1].includes('fetchStaffList'), 'handleExecuteUpdatePin must call fetchStaffList()');

// 5. Check selectedDistrict parameter wiring
assert.ok(
  dashSrc.includes('selectedDistrict,') || dashSrc.includes('selectedDistrict: selectedDistrict,'),
  'AdminDashboard.jsx must pass selectedDistrict to useAdminModals'
);
assert.ok(
  modalsSrc.includes("selectedDistrict = 'All'") || modalsSrc.includes('selectedDistrict'),
  'useAdminModals.js must accept selectedDistrict in signature'
);

console.log('✅ Frontend Staff Live Sync Wiring Tests Passed!');
