import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const kpiPath = path.join(__dirname, '../backend/routers/kpi.py');
const attendancePath = path.join(__dirname, '../backend/routers/attendance.py');
const modalPath = path.join(__dirname, '../dfy-frontend/src/components/Admin/modals/AuditTrailModal.jsx');

const kpiSrc = readFileSync(kpiPath, 'utf8');
const attendanceSrc = readFileSync(attendancePath, 'utf8');
const modalSrc = readFileSync(modalPath, 'utf8');

console.log('🧪 Testing Report Download Audit Logging & UI Analytics...');

// 1. Backend KPI logging checks
assert.ok(kpiSrc.includes('REPORT_DOWNLOADED'), 'kpi.py must log REPORT_DOWNLOADED');
assert.ok(kpiSrc.includes('downloaded Consolidated Report') || kpiSrc.includes('Consolidated Excel'), 'kpi.py must log consolidated report downloads');
assert.ok(kpiSrc.includes('downloaded KPI Workbook'), 'kpi.py must log single KPI workbook downloads');
assert.ok(kpiSrc.includes('Bulk 33-District') || kpiSrc.includes('Bulk KPI'), 'kpi.py must log bulk KPI ZIP downloads');

// 2. Attendance export logging check
assert.ok(attendanceSrc.includes('REPORT_DOWNLOADED'), 'attendance.py must log REPORT_DOWNLOADED on export');

// 3. UI Download Stats computation in AuditTrailModal.jsx
assert.ok(modalSrc.includes('REPORT_DOWNLOADED'), 'AuditTrailModal.jsx must detect REPORT_DOWNLOADED logs');
assert.ok(modalSrc.includes('downloadStats') || modalSrc.includes('downloadsByUser'), 'AuditTrailModal.jsx must compute download stats by user');
assert.ok(modalSrc.includes('Downloads Breakdown') || modalSrc.includes('Report Downloads:'), 'AuditTrailModal.jsx must render download counts banner');

console.log('✅ Report Download Audit & UI Analytics Tests Passed!');
