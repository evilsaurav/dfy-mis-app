import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

console.log("=== Running Top Performers Fetch & Auth Verification ===");

const adminCode = readFileSync(resolve('dfy-frontend/src/AdminDashboard.jsx'), 'utf8');

// Locate fetchTopPerformers definition
const fetchTopPerformersIndex = adminCode.indexOf('const fetchTopPerformers =');
assert(fetchTopPerformersIndex !== -1, "fetchTopPerformers must be defined in AdminDashboard.jsx");

// Extract the fetchTopPerformers function block (up to its closing dependency array)
const nextCallbackIndex = adminCode.indexOf('const generateTopPerformersPosterCanvas =', fetchTopPerformersIndex);
assert(nextCallbackIndex !== -1, "Could not find boundary after fetchTopPerformers");

const fetchTopPerformersBlock = adminCode.slice(fetchTopPerformersIndex, nextCallbackIndex);

console.log("\n[Test 1] Checking fetchTopPerformers uses authFetch...");
assert(
  fetchTopPerformersBlock.includes('authFetch('),
  "fetchTopPerformers must use authFetch to send authenticated requests"
);
assert(
  !fetchTopPerformersBlock.includes('await fetch('),
  "fetchTopPerformers must NOT use bare fetch()"
);
console.log("✔ fetchTopPerformers uses authFetch.");

console.log("\n[Test 2] Checking API_BASE_URL is defined before fetch call...");
assert(
  fetchTopPerformersBlock.includes('API_BASE_URL'),
  "fetchTopPerformers must reference API_BASE_URL"
);
assert(
  fetchTopPerformersBlock.includes('const API_BASE_URL =') || adminCode.indexOf('const API_BASE_URL') < fetchTopPerformersIndex,
  "API_BASE_URL must be declared in scope before being referenced"
);
console.log("✔ API_BASE_URL is properly declared in scope.");

console.log("\n[Test 3] Checking no incorrect 'dfy_token' usage in fetchTopPerformers...");
assert(
  !fetchTopPerformersBlock.includes("localStorage.getItem('dfy_token')"),
  "fetchTopPerformers must not use 'dfy_token' (must use authFetch which handles 'dfy_admin_token')"
);
console.log("✔ No incorrect dfy_token lookup in fetchTopPerformers.");

console.log("\n[Test 4] Checking useCallback dependency array includes authFetch...");
assert(
  fetchTopPerformersBlock.includes('authFetch') && 
  /\[[^\]]*authFetch[^\]]*\]/.test(fetchTopPerformersBlock),
  "fetchTopPerformers useCallback dependency array must include authFetch"
);
console.log("✔ useCallback dependency array includes authFetch.");

console.log("\n[Test 5] Checking state update on response ok...");
assert(
  fetchTopPerformersBlock.includes('setTopPerformersData(json)'),
  "fetchTopPerformers must call setTopPerformersData(json) on successful fetch"
);
console.log("✔ State update logic is intact.");

console.log("\n🎉 ALL TOP PERFORMERS FETCH & AUTH CHECKS PASSED!");
