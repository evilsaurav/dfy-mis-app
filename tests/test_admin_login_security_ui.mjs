import fs from 'fs';
import path from 'path';
import assert from 'assert';

const adminDashboardPath = path.resolve('dfy-frontend/src/AdminDashboard.jsx');
const content = fs.readFileSync(adminDashboardPath, 'utf8');

console.log("=== Running Admin Login & Security Hardening UI Verification ===");

// Test 1: No "Forgot Password / Emergency Recovery Key" on Login Page
console.log("\n[Test 1] Checking absence of 'Forgot Password / Emergency Recovery Key' link...");
assert.strictEqual(
  content.includes("Forgot Password / Emergency Recovery Key"),
  false,
  "Found 'Forgot Password / Emergency Recovery Key' on Admin login page! It must be removed."
);
console.log("✔ 'Forgot Password / Emergency Recovery Key' link is absent.");

// Test 2: No Emergency Recovery Modal
console.log("\n[Test 2] Checking absence of showRecoveryModal...");
assert.strictEqual(
  content.includes("showRecoveryModal"),
  false,
  "Found showRecoveryModal in AdminDashboard.jsx! Emergency recovery modal must be removed."
);
console.log("✔ showRecoveryModal is completely removed.");

// Test 3: No hardcoded master key DFY-RESCUE-9921
console.log("\n[Test 3] Checking absence of DFY-RESCUE-9921 in AdminDashboard.jsx...");
assert.strictEqual(
  content.includes("DFY-RESCUE-9921"),
  false,
  "Found DFY-RESCUE-9921 in AdminDashboard.jsx! Hardcoded master recovery key must be removed."
);
console.log("✔ DFY-RESCUE-9921 is completely removed.");

// Test 4: No hardcoded PIN 7788
console.log("\n[Test 4] Checking absence of 7788 security PIN...");
assert.strictEqual(
  content.includes("7788"),
  false,
  "Found 7788 in AdminDashboard.jsx! Hardcoded PIN must be removed."
);
console.log("✔ 7788 security PIN is completely removed.");

// Test 5: No client-side cleanUser === 'admin' bypass in handleLogin
console.log("\n[Test 5] Checking absence of client-side bypass in handleLogin...");
assert.strictEqual(
  content.includes("cleanUser === 'admin'") && content.includes("password === 'dfyadmin2026'"),
  false,
  "Found client-side network error bypass for admin in handleLogin! It must be removed."
);
console.log("✔ Client-side network error bypass is removed.");

// Test 6: No downloadEmergencyCard function
console.log("\n[Test 6] Checking absence of downloadEmergencyCard...");
assert.strictEqual(
  content.includes("downloadEmergencyCard"),
  false,
  "Found downloadEmergencyCard in AdminDashboard.jsx! It must be removed."
);
console.log("✔ downloadEmergencyCard is removed.");

console.log("\n🎉 ALL ADMIN LOGIN SECURITY UI CHECKS PASSED!");
