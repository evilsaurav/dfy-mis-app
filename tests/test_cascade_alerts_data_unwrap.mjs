import assert from 'node:assert';
import { readFileSync } from 'node:fs';

console.log('🧪 Testing Cascade Alerts Data Unwrap & Sub-Admin Query Wiring...');

const modalsHookSrc = readFileSync('dfy-frontend/src/hooks/useAdminModals.js', 'utf8');

// 1. Check fetchCascadeAlerts unwraps data.data
assert.ok(
  modalsHookSrc.includes('data.data') || modalsHookSrc.includes('json.data'),
  'fetchCascadeAlerts must unwrap data.data so cascadeData.summary and cascadeData.alerts bind directly'
);

// 2. Check Sub-Admin query param wiring
assert.ok(
  modalsHookSrc.includes("currentUser?.role === 'SUB_ADMIN'") ||
  modalsHookSrc.includes("currentUser?.allowed_districts"),
  'fetchCascadeAlerts must handle Sub-Admin allowed_districts query param'
);

console.log('✅ Cascade Alerts Data Unwrap Tests Passed!');
