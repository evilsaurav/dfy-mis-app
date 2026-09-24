import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

const adminCode = readFileSync(resolve('dfy-frontend/src/AdminDashboard.jsx'), 'utf8');

// 1. Verify modal state declarations exist
assert(adminCode.includes('attendanceRemarkModal') && adminCode.includes('setAttendanceRemarkModal'), "Must declare attendanceRemarkModal state");
assert(adminCode.includes('isSavingAttendanceRemark') && adminCode.includes('setIsSavingAttendanceRemark'), "Must declare isSavingAttendanceRemark loading state");

// 2. Verify handleExecuteAttendanceRemark handler exists and calls endpoint
assert(adminCode.includes('handleExecuteAttendanceRemark'), "Must define handleExecuteAttendanceRemark handler");
assert(adminCode.includes('/admin/attendance/add-remark'), "Must call /admin/attendance/add-remark API endpoint");

// 3. Verify remark/leave button exists on submitted cards
assert(adminCode.includes('Remark / Leave') || adminCode.includes('Remark / Leave'), "Submitted cards must have 'Remark / Leave' button");
assert(adminCode.includes('setAttendanceRemarkModal('), "Must invoke setAttendanceRemarkModal on click");

// 4. Verify active inspection remark badge is rendered when fo.admin_remark is present
assert(adminCode.includes('fo.admin_remark'), "Must render admin_remark badge on submitted cards when present");

// 5. Verify dual-action segmented choices in modal JSX
assert(adminCode.includes('Inspection Remark') || adminCode.includes('action: \'remark\''), "Modal must support inspection remark action");
assert(adminCode.includes('override_leave') || adminCode.includes('Override to Leave'), "Modal must support override_leave action");

// 6. Verify modal has anti-double-tap loading guard
assert(adminCode.includes('disabled={isSavingAttendanceRemark}'), "Submit button must be disabled when isSavingAttendanceRemark is true");

console.log("✔ Retroactive remarks UI assertions passed!");
