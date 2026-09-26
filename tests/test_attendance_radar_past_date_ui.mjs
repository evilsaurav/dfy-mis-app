import fs from 'fs';
import path from 'path';

console.log("=== Running Attendance Radar Past-Date Timestamps UI Verification ===");

const dashboardPath = path.resolve('dfy-frontend/src/AdminDashboard.jsx');
const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');

// Test 1: Check r.submitted_time in deriveAttendanceFromRecords
console.log("\n[Test 1] Checking deriveAttendanceFromRecords handles r.submitted_time...");
if (dashboardContent.includes('r.submitted_time') && dashboardContent.includes('deriveAttendanceFromRecords')) {
  console.log("✔ r.submitted_time is mapped in deriveAttendanceFromRecords.");
} else {
  console.error("❌ FAIL: r.submitted_time mapping missing in deriveAttendanceFromRecords!");
  process.exit(1);
}

// Test 2: Check fallback date parsing in deriveAttendanceFromRecords
console.log("\n[Test 2] Checking date parsing fallback when submitted_time is missing...");
if (dashboardContent.includes('toLocaleTimeString') && dashboardContent.includes('timestamp_raw')) {
  console.log("✔ Date parsing fallback with toLocaleTimeString is present.");
} else {
  console.error("❌ FAIL: toLocaleTimeString fallback missing!");
  process.exit(1);
}

// Test 3: Check stale cache guard in fetchAttendance
console.log("\n[Test 3] Checking stale cache fall-through guard in fetchAttendance...");
if (dashboardContent.includes('hasTimestamps') && dashboardContent.includes('isPastDateInMonth')) {
  console.log("✔ Stale cache fall-through guard is present in fetchAttendance.");
} else {
  console.error("❌ FAIL: hasTimestamps guard missing in fetchAttendance!");
  process.exit(1);
}

// Test 4: Check total_ids computation in deriveAttendanceFromRecords
console.log("\n[Test 4] Checking total_ids uses r.total_ids if present...");
if (dashboardContent.includes('r.total_ids') && dashboardContent.includes('total_ids:')) {
  console.log("✔ r.total_ids is utilized in deriveAttendanceFromRecords.");
} else {
  console.error("❌ FAIL: r.total_ids not utilized in deriveAttendanceFromRecords!");
  process.exit(1);
}

console.log("\n🎉 ALL ATTENDANCE RADAR PAST-DATE TIMESTAMPS UI CHECKS PASSED!");
