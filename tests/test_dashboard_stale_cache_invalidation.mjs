import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardPath = path.join(__dirname, '../dfy-frontend/src/AdminDashboard.jsx');
const src = readFileSync(dashboardPath, 'utf8');

console.log('🧪 Starting Dashboard Stale Cache Invalidation & Delta Sync Guard Tests...');

let failures = 0;

// ============================================================================
// 1. Static Code Analysis Checks
// ============================================================================

// 1.1 Cache purge on missing/invalid IDs
const hasStalePurgeLogic = (
  src.includes('!hasValidIds') &&
  src.includes('clearCachedDashboardData(cacheKey)') &&
  src.includes('localStorage.removeItem(cacheKey)') &&
  src.includes('cachedData = null')
);

if (!hasStalePurgeLogic) {
  console.error('FAIL: AdminDashboard.jsx does not implement immediate stale cache purge when !hasValidIds');
  failures++;
} else {
  console.log('  ✔ Static Check 1.1: Stale cache purge logic present');
}

// 1.2 payload.since conditioned on hasValidIds
const payloadSinceMatch = src.match(/if\s*\([^)]*cachedData\.synced_at[^)]*\)\s*\{[\s\S]*?payload\.since\s*=\s*cachedData\.synced_at/);
const hasValidIdsInPayloadSince = payloadSinceMatch && payloadSinceMatch[0].includes('hasValidIds');

if (!hasValidIdsInPayloadSince) {
  console.error('FAIL: payload.since assignment is not guarded by hasValidIds');
  failures++;
} else {
  console.log('  ✔ Static Check 1.2: payload.since strictly conditioned on hasValidIds');
}

// 1.3 data.mode === 'NO_CHANGE' populates rawRecords if needed
const noChangeBlockMatch = src.match(/if\s*\(\s*data\.mode\s*===\s*['"]NO_CHANGE['"]\s*\)\s*\{([\s\S]*?)\}\s*else\s+if/);
const noChangeBlock = noChangeBlockMatch ? noChangeBlockMatch[1] : '';
const hasNoChangeRecordFallback = (
  noChangeBlock.includes('setRawRecords') &&
  noChangeBlock.includes('hasValidIds')
);

if (!hasNoChangeRecordFallback) {
  console.error('FAIL: data.mode === "NO_CHANGE" does not populate setRawRecords with valid cached records');
  failures++;
} else {
  console.log('  ✔ Static Check 1.3: NO_CHANGE block has rawRecords fallback guard');
}

// ============================================================================
// 2. Behavioral Execution Simulation
// ============================================================================

const fetchDataMatch = src.match(/const fetchData = async \((.*?)\) => \{([\s\S]*?)\n  \};\s*const handleHardAppReset/);

if (!fetchDataMatch) {
  console.error('FAIL: Could not extract fetchData function from AdminDashboard.jsx');
  failures++;
} else {
  // Prepare executable function by rewriting import.meta.env
  let fnBody = fetchDataMatch[2];
  fnBody = fnBody.replace(/import\.meta\.env\.VITE_API_URL/g, '"https://test-api.dfy.org"');

  const createMockEnv = ({ initialLocalStorage = {}, initialIdbCache = null, fetchResponseData = {} }) => {
    const lsStorage = { ...initialLocalStorage };
    let idbStorage = initialIdbCache;

    const mockLocalStorage = {
      getItem: (k) => lsStorage[k] || null,
      setItem: (k, v) => { lsStorage[k] = String(v); },
      removeItem: (k) => { delete lsStorage[k]; }
    };

    let rawRecordsState = [];
    let syncStatusState = '';
    let lastSyncedTimeState = '';
    let isLoadingState = false;
    let isColdStartingState = false;
    let errorState = '';
    let sentPayload = null;

    const getCachedDashboardData = async (k) => idbStorage;
    const clearCachedDashboardData = async (k) => { idbStorage = null; };
    const setCachedDashboardData = async (k, data) => { idbStorage = data; };

    const setRawRecords = (updater) => {
      rawRecordsState = typeof updater === 'function' ? updater(rawRecordsState) : updater;
    };
    const setSyncStatus = (st) => { syncStatusState = st; };
    const setLastSyncedTime = (t) => { lastSyncedTimeState = t; };
    const setIsLoading = (l) => { isLoadingState = l; };
    const setIsColdStarting = (c) => { isColdStartingState = c; };
    const setError = (e) => { errorState = e; };
    const showToast = () => {};

    const authFetch = async (url, options) => {
      sentPayload = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => fetchResponseData
      };
    };

    const lastFocusSyncRef = { current: 0 };
    const month = '2026-10';
    const currentUser = { user_id: 'admin_test', role: 'SUPER_ADMIN' };

    const runner = new Function(
      'month',
      'currentUser',
      'localStorage',
      'getCachedDashboardData',
      'clearCachedDashboardData',
      'setCachedDashboardData',
      'setRawRecords',
      'setSyncStatus',
      'setLastSyncedTime',
      'setIsLoading',
      'setIsColdStarting',
      'setError',
      'showToast',
      'authFetch',
      'lastFocusSyncRef',
      `return (async (forceRefresh = false, silent = false) => { ${fnBody} });`
    );

    const execFetchData = runner(
      month,
      currentUser,
      mockLocalStorage,
      getCachedDashboardData,
      clearCachedDashboardData,
      setCachedDashboardData,
      setRawRecords,
      setSyncStatus,
      setLastSyncedTime,
      setIsLoading,
      setIsColdStarting,
      setError,
      showToast,
      authFetch,
      lastFocusSyncRef
    );

    return {
      execFetchData,
      getLsStorage: () => lsStorage,
      getIdbStorage: () => idbStorage,
      getSentPayload: () => sentPayload,
      getRawRecordsState: () => rawRecordsState,
      getSyncStatusState: () => syncStatusState
    };
  };

  // Test 2.1: Stale cache without notification_ids must be purged and request must NOT have since
  (async () => {
    const staleCache = {
      synced_at: '2026-10-01 10:00:00',
      records: [
        { id: 'rec_1', fo_name: 'Amit', working_place: 'Patna' } // Missing notification_ids
      ]
    };
    const cacheKey = 'dfy_dash_cache_2026-10_admin_test';

    const env = createMockEnv({
      initialLocalStorage: { [cacheKey]: JSON.stringify(staleCache) },
      initialIdbCache: staleCache,
      fetchResponseData: {
        mode: 'FULL',
        synced_at: '2026-10-02 12:00:00',
        records: [
          { id: 'rec_fresh', fo_name: 'Amit', working_place: 'Patna', notification_ids: ['N1'] }
        ]
      }
    });

    await env.execFetchData();

    // Verify localStorage was purged of stale cache during fetch
    const ls = env.getLsStorage();
    const payload = env.getSentPayload();
    const finalRecords = env.getRawRecordsState();

    if (payload.since !== undefined) {
      console.error(`FAIL: Stale cache payload sent payload.since=${payload.since}, expected undefined`);
      failures++;
    } else {
      console.log('  ✔ Behavioral Test 2.1a: Stale cache did not send payload.since');
    }

    if (payload.cached_count !== undefined) {
      console.error(`FAIL: Stale cache payload sent payload.cached_count=${payload.cached_count}, expected undefined`);
      failures++;
    } else {
      console.log('  ✔ Behavioral Test 2.1b: Stale cache did not send payload.cached_count');
    }

    if (finalRecords.length !== 1 || finalRecords[0].id !== 'rec_fresh') {
      console.error('FAIL: Records not updated to fresh response after stale cache purge');
      failures++;
    } else {
      console.log('  ✔ Behavioral Test 2.1c: Fresh full records correctly stored');
    }
  })().catch(err => {
    console.error('Error running test 2.1:', err);
    failures++;
  }).then(async () => {
    // Test 2.2: Valid cache with NO_CHANGE response retains and populates records
    const validCache = {
      synced_at: '2026-10-01 15:00:00',
      records: [
        { id: 'rec_valid', fo_name: 'Rahul', working_place: 'Gaya', notification_ids: ['N100'] }
      ]
    };
    const cacheKey = 'dfy_dash_cache_2026-10_admin_test';

    const env = createMockEnv({
      initialLocalStorage: { [cacheKey]: JSON.stringify(validCache) },
      initialIdbCache: validCache,
      fetchResponseData: {
        mode: 'NO_CHANGE',
        synced_at: '2026-10-02 12:00:00'
      }
    });

    await env.execFetchData();

    const payload = env.getSentPayload();
    const finalRecords = env.getRawRecordsState();

    if (payload.since !== '2026-10-01 15:00:00') {
      console.error(`FAIL: Valid cache payload.since expected '2026-10-01 15:00:00', received ${payload.since}`);
      failures++;
    } else {
      console.log('  ✔ Behavioral Test 2.2a: Valid cache sent correct payload.since');
    }

    if (finalRecords.length !== 1 || finalRecords[0].id !== 'rec_valid') {
      console.error('FAIL: NO_CHANGE response failed to preserve or populate valid records from cache');
      failures++;
    } else {
      console.log('  ✔ Behavioral Test 2.2b: NO_CHANGE successfully populated rawRecords from valid cache');
    }

    // Final outcome
    if (failures > 0) {
      console.error(`\n❌ Total Failures: ${failures}`);
      process.exit(1);
    } else {
      console.log('\n✅ All Dashboard Stale Cache Invalidation Tests Passed 100%!');
      process.exit(0);
    }
  });
}
