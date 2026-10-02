import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendPath = path.join(__dirname, '../backend/routers/rbac_audit.py');
const frontendPath = path.join(__dirname, '../dfy-frontend/src/hooks/useAdminModals.js');
const backendSrc = readFileSync(backendPath, 'utf8');
const frontendSrc = readFileSync(frontendPath, 'utf8');

console.log('🧪 Testing Audit Trail Filters Normalization...');

// 1. Backend Schema checks
assert.ok(
  backendSrc.includes('action_filter: Optional[str]') || backendSrc.includes('action_filter:'),
  'backend/routers/rbac_audit.py must accept action_filter in AuditLogQueryReq'
);
assert.ok(
  backendSrc.includes('district_filter: Optional[str]') || backendSrc.includes('district_filter:'),
  'backend/routers/rbac_audit.py must accept district_filter in AuditLogQueryReq'
);
assert.ok(
  backendSrc.includes('user_filter: Optional[str]') || backendSrc.includes('user_filter:'),
  'backend/routers/rbac_audit.py must accept user_filter in AuditLogQueryReq'
);

// 2. Effective Filter Fallbacks in get_audit_logs
assert.ok(
  backendSrc.includes('query.action_type or query.action_filter') || backendSrc.includes('query.action_filter or query.action_type'),
  'get_audit_logs must resolve effective_action from action_type or action_filter'
);
assert.ok(
  backendSrc.includes('query.district or query.district_filter') || backendSrc.includes('query.district_filter or query.district'),
  'get_audit_logs must resolve effective_district from district or district_filter'
);
assert.ok(
  backendSrc.includes('query.user_id or query.user_filter') || backendSrc.includes('query.user_filter or query.user_id'),
  'get_audit_logs must resolve effective_user from user_id or user_filter'
);

// 3. Frontend fetchAuditLogs sends both canonical and alias keys
assert.ok(
  frontendSrc.includes('action_type:') && frontendSrc.includes('action_filter:'),
  'useAdminModals.js must send action_type and action_filter'
);
assert.ok(
  frontendSrc.includes('district:') && frontendSrc.includes('district_filter:'),
  'useAdminModals.js must send district and district_filter'
);
assert.ok(
  frontendSrc.includes('user_id:') && frontendSrc.includes('user_filter:'),
  'useAdminModals.js must send user_id and user_filter'
);

console.log('✅ Audit Trail Filters Normalization Tests Passed!');
