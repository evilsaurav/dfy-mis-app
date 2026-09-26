import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log("=== Running Staff Designation Dropdown & Sync Verification ===");

const adminPath = path.resolve('dfy-frontend/src/AdminDashboard.jsx');
const content = fs.readFileSync(adminPath, 'utf8');

// 1. Verify Edit Staff Modal (pinChangeModal) has all required designations
console.log("\n[Test 1] Checking Edit Staff Modal designation options...");
const pinChangeModalBlockMatch = content.match(/pinChangeModal\s*&&\s*\([\s\S]*?handleExecuteUpdatePin[\s\S]*?<\/form>/);
assert.ok(pinChangeModalBlockMatch, "pinChangeModal form block must exist in AdminDashboard.jsx");
const pinModalContent = pinChangeModalBlockMatch[0];

const expectedDesignations = [
  "Field Officer",
  "Hub Agent",
  "SCT Agent",
  "Lab Technician (LT)",
  "District Coordinator",
  "Senior Treatment Supervisor (STS)",
  "TB Health Visitor (TBHV)",
  "State Health Coordinator"
];

expectedDesignations.forEach(desig => {
  assert.ok(
    pinModalContent.includes(`value="${desig}"`),
    `Edit Staff Modal must contain designation option '${desig}'`
  );
});
console.log("✔ Edit Staff Modal contains all required designation options including Hub Agent and SCT Agent.");

// 2. Verify Add Staff Modal (addStaffModal) has all required designations
console.log("\n[Test 2] Checking Add Staff Modal designation options...");
const addStaffModalBlockMatch = content.match(/addStaffModal\s*&&\s*\([\s\S]*?handleExecuteAddStaff[\s\S]*?<\/form>/);
assert.ok(addStaffModalBlockMatch, "addStaffModal form block must exist in AdminDashboard.jsx");
const addModalContent = addStaffModalBlockMatch[0];

expectedDesignations.forEach(desig => {
  assert.ok(
    addModalContent.includes(`value="${desig}"`),
    `Add Staff Modal must contain designation option '${desig}'`
  );
});
console.log("✔ Add Staff Modal contains all required designation options including Hub Agent and SCT Agent.");

// 3. Verify fetchTopPerformers is called after updating staff details
console.log("\n[Test 3] Checking instant leaderboard sync in handleExecuteUpdatePin...");
const updatePinFuncMatch = content.match(/const handleExecuteUpdatePin = async[\s\S]*?setPinChangeModal\(null\);/);
assert.ok(updatePinFuncMatch, "handleExecuteUpdatePin function must exist");
assert.ok(
  updatePinFuncMatch[0].includes("fetchTopPerformers"),
  "handleExecuteUpdatePin must call fetchTopPerformers on success to invalidate leaderboard"
);
console.log("✔ handleExecuteUpdatePin calls fetchTopPerformers.");

// 4. Verify fetchTopPerformers is called after adding new staff
console.log("\n[Test 4] Checking instant leaderboard sync in handleExecuteAddStaff...");
const addStaffFuncMatch = content.match(/const handleExecuteAddStaff = async[\s\S]*?setAddStaffModal\(null\);/);
assert.ok(addStaffFuncMatch, "handleExecuteAddStaff function must exist");
assert.ok(
  addStaffFuncMatch[0].includes("fetchTopPerformers"),
  "handleExecuteAddStaff must call fetchTopPerformers on success to invalidate leaderboard"
);
console.log("✔ handleExecuteAddStaff calls fetchTopPerformers.");

console.log("\n🎉 ALL STAFF DESIGNATION DROPDOWN UI VERIFICATION CHECKS PASSED!");
