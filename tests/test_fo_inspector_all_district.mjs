import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, '../dfy-frontend/src/components/Admin/modals/FoInspectorModal.jsx'), 'utf8');

let failures = 0;

// 1. Must handle inspectingFO.district === 'All' or empty
const handlesAllDistrict = (
  (src.includes("=== 'All'") || src.includes('=== "All"')) &&
  (src.includes('!inspectingFO.district') || src.includes('!inspectingFO?.district'))
);
if (!handlesAllDistrict) {
  console.error('FAIL: FoInspectorModal.jsx does not handle inspectingFO.district === "All" or empty');
  failures++;
}

// 2. Must derive effectiveDistrict fallback from foRecords[0]?.working_place or selectedDistrict
if (!src.includes('effectiveDistrict')) {
  console.error('FAIL: FoInspectorModal.jsx does not compute effectiveDistrict');
  failures++;
}
if (!src.includes('foRecords[0]?.working_place')) {
  console.error('FAIL: FoInspectorModal.jsx does not fall back to foRecords[0]?.working_place');
  failures++;
}

// 3. Must use effectiveDistrict to find targetObj in targetsData
const hasTargetObjWithEffectiveDistrict = (
  src.includes('canonicalizeDistrict(t.district) === canonicalizeDistrict(effectiveDistrict)') ||
  src.includes('canonicalizeDistrict(effectiveDistrict)')
);
if (!hasTargetObjWithEffectiveDistrict) {
  console.error('FAIL: FoInspectorModal.jsx does not use effectiveDistrict to match targetObj in targetsData');
  failures++;
}

// 4. Must use flexible name matching (isOfficerNameMatch)
if (!src.includes('isOfficerNameMatch')) {
  console.error('FAIL: FoInspectorModal.jsx missing flexible name matching');
  failures++;
}

if (failures === 0) {
  console.log('PASS: FoInspectorModal All-district and effectiveDistrict target matching verified successfully');
  process.exit(0);
} else {
  console.error(`FAIL: ${failures} FO inspector issues found`);
  process.exit(1);
}
