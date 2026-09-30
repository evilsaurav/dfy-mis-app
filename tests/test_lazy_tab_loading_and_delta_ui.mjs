import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log("=== Running Lazy Tab Loading & Delta UI Verification ===");

const adminCode = fs.readFileSync(path.resolve('dfy-frontend/src/AdminDashboard.jsx'), 'utf8');
const appCode = fs.readFileSync(path.resolve('dfy-frontend/src/App.jsx'), 'utf8');

// Test 1: Main Mount must not contain eager fetchAttendance, fetchTopPerformers, loadTargets, or fetchStaffList
const mainMountMatch = adminCode.match(/\/\/ Global & Session Data Fetching[\s\S]*?useEffect\(\(\) => \{([\s\S]*?)\}, \[month, isAuthenticated\]\);/);
assert.ok(mainMountMatch, "Clean primary mount useEffect must exist in AdminDashboard.jsx with [month, isAuthenticated]");
const mountBody = mainMountMatch[1];
assert.ok(!mountBody.includes('fetchAttendance()'), "Primary mount must NOT eagerly call fetchAttendance");
assert.ok(!mountBody.includes('fetchTopPerformers('), "Primary mount must NOT eagerly call fetchTopPerformers");
assert.ok(!mountBody.includes("loadTargets("), "Primary mount must NOT eagerly call loadTargets");
assert.ok(!mountBody.includes("fetchStaffList("), "Primary mount must NOT eagerly call fetchStaffList");
console.log("✔ Test 1 Passed: Primary mount is lean and on-demand.");

// Test 2: TDZ Order Check (Helper functions declared BEFORE tab trigger useEffects)
const fetchAttendanceIdx = adminCode.indexOf('const fetchAttendance =');
const fetchTopPerformersIdx = adminCode.indexOf('const fetchTopPerformers =');
const loadTargetsIdx = adminCode.indexOf('const loadTargets =');
const fetchStaffListIdx = adminCode.indexOf('const fetchStaffList =');

assert.ok(fetchAttendanceIdx !== -1, "fetchAttendance must be declared");
assert.ok(fetchTopPerformersIdx !== -1, "fetchTopPerformers must be declared");
assert.ok(loadTargetsIdx !== -1, "loadTargets must be declared");
assert.ok(fetchStaffListIdx !== -1, "fetchStaffList must be declared");

// Trigger effects must be declared strictly AFTER the fetchers
const attendanceTriggerIdx = adminCode.search(/useEffect\(\(\)\s*=>\s*\{[^}]*?showAttendanceModal[^}]*?fetchAttendance\(/);
const topPerformersTriggerIdx = adminCode.search(/useEffect\(\(\)\s*=>\s*\{[^}]*?showTopPerformersModal[^}]*?fetchTopPerformers\(/);
const staffTriggerIdx = adminCode.search(/useEffect\(\(\)\s*=>\s*\{[^}]*?(?:showStaffModal|showStaffSuite)[^}]*?fetchStaffList\(/);
const targetsTriggerIdx = adminCode.search(/useEffect\(\(\)\s*=>\s*\{[^}]*?(?:showPacingModal|showTargetModal|showTargetsModal)[^}]*?loadTargets\(/);

assert.ok(attendanceTriggerIdx !== -1, "showAttendanceModal trigger hook must exist");
assert.ok(topPerformersTriggerIdx !== -1, "showTopPerformersModal trigger hook must exist");
assert.ok(staffTriggerIdx !== -1, "showStaffModal / showStaffSuite trigger hook must exist");
assert.ok(targetsTriggerIdx !== -1, "showPacingModal / showTargetModal trigger hook must exist");

assert.ok(fetchAttendanceIdx < attendanceTriggerIdx, "fetchAttendance must be declared BEFORE its trigger hook");
assert.ok(fetchTopPerformersIdx < topPerformersTriggerIdx, "fetchTopPerformers must be declared BEFORE its trigger hook");
assert.ok(fetchStaffListIdx < staffTriggerIdx, "fetchStaffList must be declared BEFORE its trigger hook");
assert.ok(loadTargetsIdx < targetsTriggerIdx, "loadTargets must be declared BEFORE its trigger hook");
console.log("✔ Test 2 Passed: Strict lexical declaration order prevents TDZ crashes.");

// Test 3: Delta sync includes deleted_ids tombstone handling
assert.ok(adminCode.includes('data.deleted_ids'), "Delta sync must process deleted_ids");
const deltaSection = adminCode.match(/else if \(data\.mode === 'DELTA'\) \{([\s\S]*?)try \{[\s\S]*?setCachedDashboardData/);
assert.ok(deltaSection, "Delta sync block must exist");
assert.ok(deltaSection[1].includes('deleted_ids'), "Delta block must remove deleted_ids from record map");
assert.ok(deltaSection[1].includes('data.records'), "Delta block must upsert new/updated records");
console.log("✔ Test 3 Passed: Delta sync supports deletion tombstones.");

// Test 4: App.jsx does not eagerly invoke fetchFoMonthlyHistory on mount
const appMountMatch = appCode.match(/useEffect\(\(\) => \{[\s\S]*?fetchAndStoreDistrictRegistry\(formData\.working_place\);([\s\S]*?)\}, \[isLoggedIn, formData\.working_place, formData\.fo_name, fetchAndStoreDistrictRegistry\]\);/);
assert.ok(appMountMatch, "App.jsx mount useEffect must exist");
const appMountBody = appMountMatch[1];
assert.ok(!appMountBody.includes('fetchFoMonthlyHistory('), "App.jsx mount must NOT eagerly call fetchFoMonthlyHistory");

// Test 5: App.jsx triggers fetchFoMonthlyHistory on profile view navigation
const profileViewTrigger = appCode.match(/useEffect\(\(\) => \{[\s\S]*?currentView === 'profile'[\s\S]*?fetchFoMonthlyHistory\(/);
assert.ok(profileViewTrigger, "App.jsx must trigger fetchFoMonthlyHistory when currentView is profile");
console.log("✔ Test 4 & 5 Passed: Frontline App profile history is loaded on-demand.");

console.log("🎉 ALL LAZY TAB LOADING & DELTA UI TESTS PASSED!");
