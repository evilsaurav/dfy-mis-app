import assert from 'node:assert';
import { readFileSync } from 'node:fs';

console.log('🧪 Testing Staff Optimistic Instant Sync Wiring...');

const dashSrc = readFileSync('dfy-frontend/src/AdminDashboard.jsx', 'utf8');
const modalsSrc = readFileSync('dfy-frontend/src/hooks/useAdminModals.js', 'utf8');

// 1. AdminDashboard passes setStaffList and setStaffDirectory
assert.ok(
  dashSrc.includes('setStaffList,') || dashSrc.includes('setStaffList: setStaffList,'),
  'AdminDashboard must pass setStaffList to useAdminModals'
);
assert.ok(
  dashSrc.includes('setStaffDirectory,') || dashSrc.includes('setStaffDirectory: setStaffDirectory,'),
  'AdminDashboard must pass setStaffDirectory to useAdminModals'
);

// 2. useAdminModals accepts setStaffList and setStaffDirectory
assert.ok(
  modalsSrc.includes('setStaffList') && modalsSrc.includes('setStaffDirectory'),
  'useAdminModals parameter list must include setStaffList and setStaffDirectory'
);

// 3. handleExecuteAddStaff performs optimistic state insertion
assert.ok(
  modalsSrc.includes('setStaffList(prev => [...prev') || modalsSrc.includes('setStaffList(prev => [') || modalsSrc.includes('setStaffList(prev => [...(prev'),
  'handleExecuteAddStaff must optimistically append new officer to staffList'
);

// 4. handleExecuteDeleteStaff performs optimistic deletion
assert.ok(
  modalsSrc.includes('prev.filter(s => !(s.name === name') || modalsSrc.includes('(prev || []).filter(s => !(s.name === name'),
  'handleExecuteDeleteStaff must optimistically filter out deleted officer'
);

console.log('✅ Staff Optimistic Instant Sync Wiring Tests Passed!');
