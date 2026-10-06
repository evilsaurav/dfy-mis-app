import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';

console.log('🧪 Testing TA Admin Studio Component & Hook Wiring...');

// 1. Files exist
assert.ok(existsSync('dfy-frontend/src/hooks/useAdminTA.js'), 'useAdminTA.js must exist');
assert.ok(existsSync('dfy-frontend/src/components/Admin/modals/TravelAllowanceModal.jsx'), 'TravelAllowanceModal.jsx must exist');

const hookSrc = readFileSync('dfy-frontend/src/hooks/useAdminTA.js', 'utf8');
const modalSrc = readFileSync('dfy-frontend/src/components/Admin/modals/TravelAllowanceModal.jsx', 'utf8');
const adminModalsSrc = readFileSync('dfy-frontend/src/components/Admin/AdminModals.jsx', 'utf8');
const adminModalsHookSrc = readFileSync('dfy-frontend/src/hooks/useAdminModals.js', 'utf8');
const reportsStudioSrc = readFileSync('dfy-frontend/src/components/Admin/modals/ReportsStudioModal.jsx', 'utf8');

// 2. Hook exports required state and functions
assert.ok(hookSrc.includes('fetchRoster'), 'useAdminTA must export fetchRoster');
assert.ok(hookSrc.includes('handlePassStaff'), 'useAdminTA must export handlePassStaff');
assert.ok(hookSrc.includes('handleRevertStaff'), 'useAdminTA must export handleRevertStaff');
assert.ok(hookSrc.includes('handleUnlockStaff'), 'useAdminTA must export handleUnlockStaff');
assert.ok(hookSrc.includes('handleUpdateRate'), 'useAdminTA must export handleUpdateRate');
assert.ok(hookSrc.includes('handleExportExcel'), 'useAdminTA must export handleExportExcel');
assert.ok(hookSrc.includes('handlePrefill'), 'useAdminTA must export handlePrefill');
assert.ok(hookSrc.includes('handleSaveLog'), 'useAdminTA must export handleSaveLog');
assert.ok(hookSrc.includes('handleSubmitRoster'), 'useAdminTA must export handleSubmitRoster');

// 3. Modal contains hidden context menu for prefill
assert.ok(
  modalSrc.includes('Pre-fill District from Reports') || modalSrc.includes('prefill') || modalSrc.includes('handlePrefill'),
  'Modal must have pre-fill action inside context menu'
);
assert.ok(
  modalSrc.includes('Rate:') || modalSrc.includes('rate_per_km') || modalSrc.includes('ratePerKm'),
  'Modal must display dynamic rate pill'
);
// Prefill must NOT be a standalone visible button — it must live in a context/dropdown menu
assert.ok(
  modalSrc.includes('•••') || modalSrc.includes('contextMenu') || modalSrc.includes('showContextMenu') || modalSrc.includes('dropdown'),
  'Pre-fill must be hidden inside a context menu (•••), not a visible button'
);

// 4. AdminModals imports and renders TravelAllowanceModal
assert.ok(adminModalsSrc.includes('TravelAllowanceModal'), 'AdminModals must import TravelAllowanceModal');
assert.ok(adminModalsSrc.includes('showTaModal'), 'AdminModals must wire showTaModal prop');

// 5. useAdminModals exports showTaModal and setShowTaModal
assert.ok(adminModalsHookSrc.includes('showTaModal'), 'useAdminModals must manage showTaModal state');
assert.ok(adminModalsHookSrc.includes('setShowTaModal'), 'useAdminModals must export setShowTaModal');

// 6. ReportsStudioModal has TA launch tile
assert.ok(
  reportsStudioSrc.includes('Travel Allowance') || reportsStudioSrc.includes('TravelAllowance') || reportsStudioSrc.includes('onOpenTravelAllowance'),
  'ReportsStudioModal must have a Travel Allowance launch tile'
);

console.log('✅ TA Admin Studio Component & Hook Wiring Tests Passed!');
