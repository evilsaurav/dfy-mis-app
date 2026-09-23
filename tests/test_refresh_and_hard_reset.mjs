import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

console.log("Running Frontend Guaranteed Live Refresh & Hard Reset UI Verification Tests...\n");

// 1. Read source files
const adminDashboardPath = resolve('dfy-frontend/src/AdminDashboard.jsx');
const appPath = resolve('dfy-frontend/src/App.jsx');

const adminDashboardCode = readFileSync(adminDashboardPath, 'utf8');
const appCode = readFileSync(appPath, 'utf8');

console.log("1. Verifying AdminDashboard.jsx Live Refresh...");

// Must unconditionally call fetchData(true) on Refresh button click without requiring shiftKey
assert(
  adminDashboardCode.includes('await fetchData(true);') || adminDashboardCode.includes('fetchData(true)'),
  "AdminDashboard.jsx must call fetchData(true) on refresh"
);

// Verify that the main refresh button does not require e.shiftKey
const refreshButtonSnippetMatch = adminDashboardCode.match(
  /<button[\s\S]*?onClick=\{async \(\) => \{[\s\S]*?fetchData\(true\)[\s\S]*?showToast\("✓ Live database refresh complete\.", "success"\)[\s\S]*?Refresh/
);
assert(
  refreshButtonSnippetMatch,
  "AdminDashboard.jsx main Refresh button must trigger unconditional live refresh with toast '✓ Live database refresh complete.'"
);

// Verify other fetch triggers are invoked during refresh
assert(
  adminDashboardCode.includes('fetchAttendance(true)'),
  "AdminDashboard.jsx refresh must trigger fetchAttendance(true)"
);
assert(
  adminDashboardCode.includes("loadTargets('All')"),
  "AdminDashboard.jsx refresh must trigger loadTargets('All')"
);
assert(
  adminDashboardCode.includes('fetchStaffList()'),
  "AdminDashboard.jsx refresh must trigger fetchStaffList()"
);
assert(
  adminDashboardCode.includes('fetchActiveBroadcasts()'),
  "AdminDashboard.jsx refresh must trigger fetchActiveBroadcasts()"
);
assert(
  adminDashboardCode.includes('fetchCascadeAlerts()'),
  "AdminDashboard.jsx refresh must trigger fetchCascadeAlerts()"
);

// Verify fetchData bypasses local cache on forceRefresh
assert(
  adminDashboardCode.includes('if (!forceRefresh) {') &&
  adminDashboardCode.includes('const rawCache = localStorage.getItem(cacheKey);'),
  "fetchData must bypass reading localStorage cache when forceRefresh is true"
);

console.log("✔ AdminDashboard.jsx Live Refresh verified.");

console.log("\n2. Verifying AdminDashboard.jsx Cold-Start Latency Detection & Banner...");

// Check isColdStarting state declaration
assert(
  adminDashboardCode.includes('const [isColdStarting, setIsColdStarting] = useState(false);'),
  "AdminDashboard.jsx must declare isColdStarting state via useState(false)"
);

// Check cold-start detection timer in fetchData (> 5000ms)
assert(
  adminDashboardCode.includes('setIsColdStarting(true)') && adminDashboardCode.includes('5000'),
  "AdminDashboard.jsx must set isColdStarting to true if fetchData takes > 5000ms"
);

// Check cleanup in finally
assert(
  adminDashboardCode.includes('setIsColdStarting(false)'),
  "AdminDashboard.jsx must reset isColdStarting to false in finally"
);

// Check cold-start banner rendering
const bannerText = "⚡ Server wake-up ho raha hai (Render spin-up), kripya thoda intezar karein...";
assert(
  adminDashboardCode.includes(bannerText),
  `AdminDashboard.jsx must render banner text: "${bannerText}"`
);
assert(
  adminDashboardCode.includes('{isColdStarting &&'),
  "AdminDashboard.jsx must guard cold-start banner with isColdStarting condition"
);

console.log("✔ AdminDashboard.jsx Cold-Start Latency Detection verified.");

console.log("\n3. Verifying AdminDashboard.jsx handleHardAppReset & Reset UI...");

// Check handleHardAppReset implementation in AdminDashboard.jsx
assert(
  adminDashboardCode.includes('const handleHardAppReset = async () => {'),
  "AdminDashboard.jsx must implement handleHardAppReset"
);
assert(
  adminDashboardCode.includes('navigator.serviceWorker.getRegistrations()'),
  "AdminDashboard.jsx handleHardAppReset must query navigator.serviceWorker.getRegistrations()"
);
assert(
  adminDashboardCode.includes('caches.keys()') && adminDashboardCode.includes('caches.delete'),
  "AdminDashboard.jsx handleHardAppReset must delete window CacheStorage caches"
);
assert(
  adminDashboardCode.includes('localStorage.clear()') && adminDashboardCode.includes('sessionStorage.clear()'),
  "AdminDashboard.jsx handleHardAppReset must clear localStorage and sessionStorage"
);
assert(
  adminDashboardCode.includes('window.location.reload()'),
  "AdminDashboard.jsx handleHardAppReset must trigger window.location.reload()"
);

// Check Reset Cache button in navigation
assert(
  adminDashboardCode.includes('onClick={handleHardAppReset}') && adminDashboardCode.includes('Reset Cache'),
  "AdminDashboard.jsx must render a 'Reset Cache' button wired to handleHardAppReset"
);

console.log("✔ AdminDashboard.jsx handleHardAppReset and UI verified.");

console.log("\n4. Verifying App.jsx handleHardAppReset & Update Button...");

// Check handleHardAppReset implementation in App.jsx
assert(
  appCode.includes('const handleHardAppReset = async () => {'),
  "App.jsx must implement handleHardAppReset"
);
assert(
  appCode.includes('navigator.serviceWorker.getRegistrations()'),
  "App.jsx handleHardAppReset must query navigator.serviceWorker.getRegistrations()"
);
assert(
  appCode.includes('caches.keys()') && appCode.includes('caches.delete'),
  "App.jsx handleHardAppReset must delete window CacheStorage caches"
);
assert(
  appCode.includes('localStorage.clear()') && appCode.includes('sessionStorage.clear()'),
  "App.jsx handleHardAppReset must clear localStorage and sessionStorage"
);
assert(
  appCode.includes('window.location.reload()'),
  "App.jsx handleHardAppReset must trigger window.location.reload()"
);

// Check Update button near v{APP_VERSION}
assert(
  appCode.includes('onClick={handleHardAppReset}') && appCode.includes('Update'),
  "App.jsx must render an Update button wired to handleHardAppReset"
);
const headerVersionSnippet = appCode.match(/v\{APP_VERSION\}[\s\S]*?onClick=\{handleHardAppReset\}[\s\S]*?Update/);
assert(
  headerVersionSnippet,
  "App.jsx Update button must be placed in the header bar near v{APP_VERSION}"
);

console.log("✔ App.jsx handleHardAppReset and Update button verified.");

console.log("\n🎉 ALL REFRESH AND HARD RESET TESTS PASSED SUCCESSFULLY! (100% compliant)");
