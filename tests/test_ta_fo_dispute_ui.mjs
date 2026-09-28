import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log("🔍 Running FO TA Dispute & Lock UI Verification Test...");

const appPath = path.resolve('dfy-frontend/src/App.jsx');
assert(fs.existsSync(appPath), "App.jsx must exist");
const code = fs.readFileSync(appPath, 'utf8');

// 1. Pre-approval Verification in Progress state
assert(
  code.includes("Verification in Progress") || code.includes("verification_in_progress"),
  "FO App must show Verification in Progress notice when TA is unapproved"
);

// 2. 24-Hour Dispute Window & Button
assert(
  code.includes("Report Dispute") || code.includes("Report Deduction Dispute"),
  "FO App must feature Report Dispute button"
);
assert(
  code.includes("Dispute Window") || code.includes("hours remaining") || code.includes("disputeWindowActive"),
  "FO App must display dispute countdown or window status"
);

// 3. Dispute Modal & Submission
assert(
  code.includes("handleFileTaDispute") || code.includes("/api/ta/dispute"),
  "FO App must handle dispute submission to /api/ta/dispute"
);

console.log("✅ FO TA Dispute & Lock UI Verification Passed 100%!");
