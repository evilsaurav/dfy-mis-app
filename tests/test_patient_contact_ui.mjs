import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

console.log("Running Patient Contact UI Verification Tests...\n");

const appPath = resolve('dfy-frontend/src/App.jsx');
const appCode = readFileSync(appPath, 'utf8');

console.log("1. Verifying App.jsx (FO Patient Journey Tracker)...");
assert(
  appCode.includes('result.metadata?.patient_name') && appCode.includes('result.metadata?.phone'),
  "App.jsx must check for result.metadata?.patient_name or result.metadata?.phone"
);
assert(
  appCode.includes('href={`tel:${result.metadata.phone}`}') || appCode.includes('href={"tel:" + result.metadata.phone}'),
  "App.jsx must contain direct-call link with tel: scheme for result.metadata.phone"
);
assert(
  appCode.includes('navigator.clipboard.writeText(result.metadata.phone)'),
  "App.jsx must contain copy-to-clipboard button for patient phone"
);
assert(
  appCode.includes('Phone number copied!'),
  "App.jsx must show toast notification when phone is copied"
);
console.log("✔ App.jsx patient contact card verified.");

console.log("2. Verifying AdminDashboard.jsx (Admin Patient Journey Drawer)...");
const adminPath = resolve('dfy-frontend/src/AdminDashboard.jsx');
const adminCode = readFileSync(adminPath, 'utf8');

assert(
  adminCode.includes('journeyResult.metadata?.patient_name') && adminCode.includes('journeyResult.metadata?.phone'),
  "AdminDashboard.jsx must check for journeyResult.metadata?.patient_name or journeyResult.metadata?.phone"
);
assert(
  adminCode.includes('href={`tel:${journeyResult.metadata.phone}`}') || adminCode.includes('href={"tel:" + journeyResult.metadata.phone}'),
  "AdminDashboard.jsx must contain direct-call link with tel: scheme for journeyResult.metadata.phone"
);
assert(
  adminCode.includes('navigator.clipboard.writeText(journeyResult.metadata.phone)'),
  "AdminDashboard.jsx must contain copy-to-clipboard button for patient phone"
);
assert(
  adminCode.includes('Phone number copied!'),
  "AdminDashboard.jsx must show toast notification when phone is copied"
);
console.log("✔ AdminDashboard.jsx patient contact card verified.");

console.log("\nAll patient contact UI checks passed successfully!");
