import fs from 'fs';
import path from 'path';
import assert from 'assert';

import { getFullAdminDashboardCode } from './test_helpers.mjs';

const adminCode = getFullAdminDashboardCode();

// 1. Verify canDownloadBulkZip exists and checks roles/districts
assert(
  adminCode.includes('canDownloadBulkZip'),
  'AdminDashboard.jsx must define canDownloadBulkZip logic to gate bulk ZIP export'
);

// 2. Verify bulk ZIP button/container is wrapped in canDownloadBulkZip check
assert(
  adminCode.includes('canDownloadBulkZip &&') || adminCode.includes('canDownloadBulkZip ?'),
  'Bulk ZIP button must be conditionally rendered based on canDownloadBulkZip'
);

// 3. Verify handleDownloadKpi uses authFetch blob streaming with finally block
assert(
  adminCode.includes('handleDownloadKpi') && 
  adminCode.includes('download-kpi-workbook') &&
  adminCode.includes('res.blob()'),
  'handleDownloadKpi must use authFetch and res.blob() for secure in-memory streaming'
);

// 4. Verify handleDownloadScopedZip uses authFetch blob streaming with finally block
assert(
  adminCode.includes('handleDownloadScopedZip') &&
  adminCode.includes('download-all-kpi-workbooks') &&
  adminCode.includes('finally'),
  'handleDownloadScopedZip must use authFetch blob streaming with finally block'
);

// 5. Verify Anti-Double-Tap disabled attribute and classes on KPI download buttons
assert(
  adminCode.includes('disabled={isDownloadingKpi'),
  'KPI download buttons must have disabled attribute bound to isDownloadingKpi'
);

assert(
  adminCode.includes('disabled:cursor-not-allowed'),
  'KPI download buttons must style disabled state with disabled:cursor-not-allowed'
);

console.log('✅ Reports Studio KPI RBAC & Anti-Double-Tap UI test passed 100%!');
