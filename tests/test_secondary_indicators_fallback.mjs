import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcPath = path.join(__dirname, '../dfy-frontend/src/hooks/useAdminAnalytics.js');
const src = readFileSync(srcPath, 'utf8');

console.log('🧪 Starting Secondary Indicators Fallback Tests (useAdminAnalytics.js)...');

let failures = 0;

// ============================================================================
// 1. Static Code Analysis Checks
// ============================================================================

// 1.1 Home Visits multi-key fallback in aggregate
const hasHomeVisitsFallbackInAggregate = (
  src.includes('curr.home_visits || curr.home_visit ||') ||
  src.includes('curr.home_visits || curr.home_visit || (Array.isArray(curr.home_visit_ids)') ||
  src.includes('r.home_visits || r.home_visit ||')
);
if (!hasHomeVisitsFallbackInAggregate) {
  console.error('FAIL: aggregate() does not implement home_visits fallback for singular home_visit or home_visit_ids');
  failures++;
}

// 1.2 Follow Ups multi-key fallback in aggregate
const hasFollowUpsFallbackInAggregate = (
  src.includes('curr.follow_ups || curr.follow_up ||') ||
  src.includes('curr.follow_ups || curr.follow_up || (Array.isArray(curr.follow_up_ids)') ||
  src.includes('r.follow_ups || r.follow_up ||')
);
if (!hasFollowUpsFallbackInAggregate) {
  console.error('FAIL: aggregate() does not implement follow_ups fallback for singular follow_up or follow_up_ids');
  failures++;
}

// 1.3 Tests multi-key fallback in aggregate
const hasTestsFallbackInAggregate = (
  src.includes('curr.tests') && (src.includes('sample_tested_ids') || src.includes('sample_tested'))
);
if (!hasTestsFallbackInAggregate) {
  console.error('FAIL: aggregate() does not implement tests fallback for sample_tested or sample_tested_ids');
  failures++;
}

// 1.4 Notifications multi-key fallback in aggregate
const hasNotificationsFallbackInAggregate = (
  src.includes('curr.notifications') && (src.includes('notification_ids') || src.includes('curr.notification'))
);
if (!hasNotificationsFallbackInAggregate) {
  console.error('FAIL: aggregate() does not implement notifications fallback for notification or notification_ids');
  failures++;
}

// 1.5 Overrides fallback in aggregate
const hasOverridesFallbackInAggregate = (
  src.includes('is_override_used')
);
if (!hasOverridesFallbackInAggregate) {
  console.error('FAIL: aggregate() does not implement overrides fallback for is_override_used');
  failures++;
}

// 1.6 tableData row aggregation multi-key fallbacks
const tableDataMatch = src.match(/const tableData = useMemo\(\(\) => \{([\s\S]*?)\n  \}, \[/);
const tableDataBody = tableDataMatch ? tableDataMatch[1] : '';

const hasTableDataFallbacks = (
  tableDataBody.includes('home_visits') &&
  (tableDataBody.includes('home_visit') || tableDataBody.includes('r.home_visits || r.home_visit')) &&
  (tableDataBody.includes('follow_up') || tableDataBody.includes('r.follow_ups || r.follow_up'))
);
if (!hasTableDataFallbacks) {
  console.error('FAIL: tableData row aggregation does not implement multi-key fallbacks for home_visits or follow_ups');
  failures++;
}

// ============================================================================
// 2. Behavioral Execution Tests: aggregate(records)
// ============================================================================

const aggregateFnMatch = src.match(/const aggregate = \(records\) => \{([\s\S]*?)\n  \};/);
if (!aggregateFnMatch) {
  console.error('FAIL: Could not locate aggregate function in useAdminAnalytics.js');
  failures++;
} else {
  const aggregateFn = new Function('records', aggregateFnMatch[1]);

  // Test 2.1: Singular home_visit fallback in aggregate()
  const recHomeVisitSingular = [
    { working_place: 'Patna', home_visit: 5 },
    { working_place: 'Gaya', home_visits: 3 }
  ];
  const aggResult1 = aggregateFn(recHomeVisitSingular);
  if (aggResult1.home_visits !== 8) {
    console.error(`FAIL: aggregate() home_visits expected 8, received ${aggResult1.home_visits}`);
    failures++;
  }

  // Test 2.2: Singular follow_up fallback in aggregate()
  const recFollowUpSingular = [
    { working_place: 'Patna', follow_up: 6 },
    { working_place: 'Gaya', follow_ups: 4 }
  ];
  const aggResult2 = aggregateFn(recFollowUpSingular);
  if (aggResult2.follow_ups !== 10) {
    console.error(`FAIL: aggregate() follow_ups expected 10, received ${aggResult2.follow_ups}`);
    failures++;
  }

  // Test 2.3: Array IDs fallback in aggregate()
  const recIdArrays = [
    { working_place: 'Patna', home_visit_ids: ['HV1', 'HV2'], follow_up_ids: ['FU1'] },
    { working_place: 'Gaya', sample_tested_ids: ['T1', 'T2', 'T3'], notification_ids: ['N1'] }
  ];
  const aggResult3 = aggregateFn(recIdArrays);
  if (aggResult3.home_visits !== 2) {
    console.error(`FAIL: aggregate() home_visits from home_visit_ids expected 2, received ${aggResult3.home_visits}`);
    failures++;
  }
  if (aggResult3.follow_ups !== 1) {
    console.error(`FAIL: aggregate() follow_ups from follow_up_ids expected 1, received ${aggResult3.follow_ups}`);
    failures++;
  }
  if (aggResult3.tests !== 3) {
    console.error(`FAIL: aggregate() tests from sample_tested_ids expected 3, received ${aggResult3.tests}`);
    failures++;
  }
  if (aggResult3.notifications !== 1) {
    console.error(`FAIL: aggregate() notifications from notification_ids expected 1, received ${aggResult3.notifications}`);
    failures++;
  }

  // Test 2.4: Overrides fallback in aggregate()
  const recOverrides = [
    { working_place: 'Patna', is_override_used: true },
    { working_place: 'Gaya', is_override: true }
  ];
  const aggResult4 = aggregateFn(recOverrides);
  if (aggResult4.overrides !== 2) {
    console.error(`FAIL: aggregate() overrides expected 2, received ${aggResult4.overrides}`);
    failures++;
  }
}

// ============================================================================
// 3. Behavioral Execution Tests: tableData Row Aggregation
// ============================================================================

if (!tableDataMatch || !aggregateFnMatch) {
  console.error('FAIL: Could not locate tableData useMemo in useAdminAnalytics.js');
  failures++;
} else {
  const rowLoopMatch = tableDataBody.match(/filteredRecords\.forEach\(r => \{([\s\S]*?)\n    \}\);/);
  if (!rowLoopMatch) {
    console.error('FAIL: Could not locate tableData filteredRecords.forEach loop in useAdminAnalytics.js');
    failures++;
  } else {
    const aggregateFn = new Function('records', aggregateFnMatch[1]);
    const runTableLoop = new Function(
      'filteredRecords',
      'selectedDistrict',
      'canonicalizeDistrict',
      'canonicalizeFo',
      'staffDirectory',
      'aggregate',
      'currentMonthNotifIdSet',
      'map',
      `filteredRecords.forEach(r => { ${rowLoopMatch[1]} });`
    );

    const canonicalize = (d) => d || '';

    // Test 3.1: Singular home_visit in tableData row
    const map1 = {};
    runTableLoop(
      [{ working_place: 'Patna', fo_name: 'FO1', home_visit: 5 }],
      'All',
      canonicalize,
      canonicalize,
      {},
      aggregateFn,
      new Set(),
      map1
    );
    if (!map1['Patna'] || map1['Patna'].home_visits !== 5) {
      console.error(`FAIL: tableData row home_visits expected 5 for singular home_visit, received ${map1['Patna']?.home_visits}`);
      failures++;
    }

    // Test 3.2: Singular follow_up in tableData row
    const map2 = {};
    runTableLoop(
      [{ working_place: 'Patna', fo_name: 'FO1', follow_up: 7 }],
      'All',
      canonicalize,
      canonicalize,
      {},
      aggregateFn,
      new Set(),
      map2
    );
    if (!map2['Patna'] || map2['Patna'].follow_ups !== 7) {
      console.error(`FAIL: tableData row follow_ups expected 7 for singular follow_up, received ${map2['Patna']?.follow_ups}`);
      failures++;
    }

    // Test 3.3: Array IDs in tableData row (home_visit_ids, follow_up_ids, sample_tested_ids, notification_ids)
    const map3 = {};
    runTableLoop(
      [{
        working_place: 'Gaya',
        fo_name: 'FO2',
        home_visit_ids: ['HV1', 'HV2', 'HV3'],
        follow_up_ids: ['FU1', 'FU2'],
        sample_tested_ids: ['ST1'],
        notification_ids: ['N1']
      }],
      'All',
      canonicalize,
      canonicalize,
      {},
      aggregateFn,
      new Set(),
      map3
    );
    if (!map3['Gaya'] || map3['Gaya'].home_visits !== 3) {
      console.error(`FAIL: tableData row home_visits expected 3 from home_visit_ids, received ${map3['Gaya']?.home_visits}`);
      failures++;
    }
    if (!map3['Gaya'] || map3['Gaya'].follow_ups !== 2) {
      console.error(`FAIL: tableData row follow_ups expected 2 from follow_up_ids, received ${map3['Gaya']?.follow_ups}`);
      failures++;
    }
    if (!map3['Gaya'] || map3['Gaya'].tests !== 1) {
      console.error(`FAIL: tableData row tests expected 1 from sample_tested_ids, received ${map3['Gaya']?.tests}`);
      failures++;
    }
    if (!map3['Gaya'] || map3['Gaya'].notifications !== 1) {
      console.error(`FAIL: tableData row notifications expected 1 from notification_ids, received ${map3['Gaya']?.notifications}`);
      failures++;
    }

    // Test 3.4: Overrides in tableData row (is_override_used)
    const map4 = {};
    runTableLoop(
      [{ working_place: 'Patna', fo_name: 'FO1', is_override_used: true }],
      'All',
      canonicalize,
      canonicalize,
      {},
      aggregateFn,
      new Set(),
      map4
    );
    if (!map4['Patna'] || map4['Patna'].overrides !== 1) {
      console.error(`FAIL: tableData row overrides expected 1 for is_override_used, received ${map4['Patna']?.overrides}`);
      failures++;
    }
  }
}

if (failures > 0) {
  console.error(`\n❌ Total Failures: ${failures}`);
  process.exit(1);
} else {
  console.log('\n✅ All Secondary Indicators Fallback Tests Passed 100%!');
  process.exit(0);
}
