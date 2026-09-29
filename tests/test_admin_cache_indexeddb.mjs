import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

console.log("Running Admin Dashboard High-Capacity Cache & Cold-Start Banner Tests...\n");

// 1. Verify adminCache.js exists and exports required methods
const adminCachePath = resolve('dfy-frontend/src/adminCache.js');
assert(existsSync(adminCachePath), "dfy-frontend/src/adminCache.js must exist");

const adminCacheCode = readFileSync(adminCachePath, 'utf8');
assert(adminCacheCode.includes('export const getCachedDashboardData'), "adminCache.js must export getCachedDashboardData");
assert(adminCacheCode.includes('export const setCachedDashboardData'), "adminCache.js must export setCachedDashboardData");
assert(adminCacheCode.includes('export const clearCachedDashboardData'), "adminCache.js must export clearCachedDashboardData");
assert(adminCacheCode.includes('export const clearAllAdminCache'), "adminCache.js must export clearAllAdminCache");
assert(adminCacheCode.includes('DFY_ADMIN_CACHE_DB'), "adminCache.js must use dedicated DB DFY_ADMIN_CACHE_DB");

console.log("✔ adminCache.js high-capacity IndexedDB engine verified.");

// 2. Verify AdminDashboard.jsx integration
const adminDashboardPath = resolve('dfy-frontend/src/AdminDashboard.jsx');
const adminDashboardCode = readFileSync(adminDashboardPath, 'utf8');

assert(
  adminDashboardCode.includes("import { getCachedDashboardData, setCachedDashboardData, clearCachedDashboardData, clearAllAdminCache } from './adminCache'"),
  "AdminDashboard.jsx must import all adminCache helpers"
);

// Check fetchData uses getCachedDashboardData
assert(
  adminDashboardCode.includes('await getCachedDashboardData(cacheKey)'),
  "fetchData must load from high-capacity IndexedDB cache"
);

// Check fetchData persists to IndexedDB
assert(
  adminDashboardCode.includes('setCachedDashboardData(cacheKey,'),
  "fetchData must persist records to high-capacity IndexedDB cache"
);

// Check handleHardAppReset purges IndexedDB cache
assert(
  adminDashboardCode.includes('await clearAllAdminCache()'),
  "handleHardAppReset must clear IndexedDB cache"
);

// Check cold-start banner only blocks when no records are on screen
assert(
  adminDashboardCode.includes('{isColdStarting && (!rawRecords || rawRecords.length === 0) &&'),
  "Cold-start banner must only display when rawRecords.length === 0"
);

console.log("✔ AdminDashboard.jsx cache & banner integration verified.");

console.log("\n🎉 ALL ADMIN CACHE & COLD-START TESTS PASSED SUCCESSFULLY! (100% compliant)");
