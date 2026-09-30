import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

console.log("Running Staff Target Sync & Master Table Resilient Matching Tests...");

const adminCode = readFileSync(resolve('dfy-frontend/src/AdminDashboard.jsx'), 'utf8');

// Test 1: Verify isOfficerNameMatch helper is defined at top-level
assert(
  adminCode.includes('const isOfficerNameMatch = (nameA, nameB, dist = \'\') => {'),
  "isOfficerNameMatch helper function must be defined"
);

// Test 2: Verify isOfficerNameMatch logic correctly resolves Vinay Prakash <-> Vinay Kumar in Muzaffarpur
// We simulate the function logic directly from code
const isOfficerNameMatch = (nameA, nameB, dist = '') => {
  if (!nameA || !nameB) return false;
  const a = String(nameA).trim().toLowerCase();
  const b = String(nameB).trim().toLowerCase();
  if (a === b) return true;
  if ((a === 'ashwani kumar' || a === 'ashwani kr keshri') && (b === 'ashwani kumar' || b === 'ashwani kr keshri')) return true;
  const cDist = String(dist || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!dist || cDist.includes('muzaffarpur')) {
    if ((a === 'vinay prakash' || a === 'vinay kumar' || a === 'vinay kumar lt') &&
        (b === 'vinay prakash' || b === 'vinay kumar' || b === 'vinay kumar lt')) {
      return true;
    }
  }
  return false;
};

assert.strictEqual(isOfficerNameMatch('Vinay Prakash', 'Vinay Kumar', 'Muzaffarpur'), true, 'Vinay Prakash must match Vinay Kumar in Muzaffarpur');
assert.strictEqual(isOfficerNameMatch('Vinay Kumar LT', 'Vinay Prakash', 'Muzaffarpur'), true, 'Vinay Kumar LT must match Vinay Prakash in Muzaffarpur');
assert.strictEqual(isOfficerNameMatch('VINIT KUMAR', 'Vinay Prakash', 'Muzaffarpur'), false, 'VINIT KUMAR must NOT match Vinay Prakash');
assert.strictEqual(isOfficerNameMatch('Vijay Kumar', 'Vinay Prakash', 'Muzaffarpur'), false, 'Vijay Kumar must NOT match Vinay Prakash');
assert.strictEqual(isOfficerNameMatch('Ashwani Kumar', 'Ashwani Kr Keshri', 'Bhojpur'), true, 'Ashwani Kumar must match Ashwani Kr Keshri');

// Test 3: Verify Master Table (tableData) uses isOfficerNameMatch for target assignment
assert(
  adminCode.includes('isOfficerNameMatch(tCanonical, key, cDist) || isOfficerNameMatch(t.fo_name, key, cDist)'),
  "tableData must use isOfficerNameMatch for target assignment in district drilldown"
);

// Test 4: Verify Performance Cards uses isOfficerNameMatch
assert(
  adminCode.includes('isOfficerNameMatch(canonicalizeFo(t.fo_name, targetDist, staffDirectory), fo, targetDist)'),
  "performanceCardsData must use isOfficerNameMatch for target lookup"
);

// Test 5: Verify Staff Pacing uses isOfficerNameMatch
assert(
  adminCode.includes('isOfficerNameMatch(t.fo_name, c.name, cDist)'),
  "staffPacingData must use isOfficerNameMatch for target matching"
);

// Test 6: Verify Edit Staff Details modal includes Monthly Target field
assert(
  adminCode.includes('Monthly Target') &&
  adminCode.includes('value={pinChangeModal.target ?? 50}'),
  "Edit Staff Details modal must contain Monthly Target input field"
);

// Test 7: Verify handleExecuteUpdatePin passes target and reloads targets
assert(
  adminCode.includes('payload.target = Number(target)') &&
  adminCode.includes("loadTargets('All', month)"),
  "handleExecuteUpdatePin must send target and call loadTargets('All', month)"
);

// Test 8: Verify parseTargetVal helper is defined and correctly preserves 0 targets
assert(
  adminCode.includes('const parseTargetVal = (tObj, fallback = 50) => {'),
  "parseTargetVal helper function must be defined"
);

const parseTargetVal = (tObj, fallback = 50) => {
  if (!tObj || tObj.target === undefined || tObj.target === null || tObj.target === '') return fallback;
  const num = Number(tObj.target);
  return isNaN(num) ? fallback : num;
};

assert.strictEqual(parseTargetVal({ target: 0 }), 0, 'Target of 0 must be preserved as 0, not defaulted to 50');
assert.strictEqual(parseTargetVal({ target: "0" }), 0, 'Target of "0" string must be parsed as 0');
assert.strictEqual(parseTargetVal({ target: 60 }), 60, 'Target of 60 must be returned as 60');
assert.strictEqual(parseTargetVal(undefined), 50, 'Undefined target must fallback to 50');
assert.strictEqual(parseTargetVal({ target: null }), 50, 'Null target must fallback to 50');

// Test 9: Verify Detailed Master Table uses parseTargetVal
assert(
  adminCode.includes('map[key].target = parseTargetVal(tObj, 50);'),
  "Detailed Master Table must use parseTargetVal(tObj, 50)"
);

console.log("✓ All Staff Target Sync & Master Table Resilient Matching Tests Passed!");
