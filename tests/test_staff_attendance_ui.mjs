import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

const adminCode = readFileSync(resolve('dfy-frontend/src/AdminDashboard.jsx'), 'utf8');

// 1. Verify legacy Dossier is removed
assert(!adminCode.includes('Field Officer Monthly Appraisal & TA/DA Dossier') && !adminCode.includes('Field Officer Monthly Appraisal &amp; TA/DA Dossier'), "Legacy Dossier heading must be removed");
assert(!adminCode.includes('/admin/export-fo-dossier'), "Legacy Dossier export URL must be removed");
assert(!adminCode.includes('fo_dossier'), "Legacy tab id 'fo_dossier' must be removed");

// 2. Verify new Staff Attendance tab exists
assert(adminCode.includes('staff_attendance'), "Report Studio must have 'staff_attendance' tab");
assert(adminCode.includes('Staff Attendance (.xlsx)'), "Tab label must be 'Staff Attendance (.xlsx)'");
assert(adminCode.includes('/admin/export-staff-attendance'), "Must call /admin/export-staff-attendance");

// 3. Verify state declarations exist
assert(adminCode.includes('selectedAttendanceDistricts'), "Must have selectedAttendanceDistricts state");
assert(adminCode.includes('isDownloadingAttendance'), "Must have isDownloadingAttendance state");
assert(adminCode.includes('attendanceQueueProgress'), "Must have attendanceQueueProgress state");

// 4. Verify selection handlers exist
assert(adminCode.includes('handleToggleAttendanceDistrict'), "Must have handleToggleAttendanceDistrict handler");
assert(adminCode.includes('handleSelectAllAttendanceDistricts'), "Must have handleSelectAllAttendanceDistricts handler");
assert(adminCode.includes('handleClearAttendanceDistricts'), "Must have handleClearAttendanceDistricts handler");

// 5. Verify download handlers exist
assert(adminCode.includes('handleDownloadStaffAttendanceQueue'), "Must have handleDownloadStaffAttendanceQueue handler");
assert(adminCode.includes('handleDownloadAttendanceSingleOrScoped'), "Must have handleDownloadAttendanceSingleOrScoped handler");

console.log("✔ Staff Attendance UI assertions passed!");
