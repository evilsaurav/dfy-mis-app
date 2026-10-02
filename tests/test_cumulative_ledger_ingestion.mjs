import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, '../dfy-frontend/src/hooks/useAdminModals.js'), 'utf8');

let failures = 0;

// 1. Verify static code in useAdminModals.js
// Check that data.records is NOT used to set ledgerData
if (src.includes('setLedgerData(data.records')) {
  console.error('FAIL: useAdminModals.js is still using data.records which discards patients and metrics');
  failures++;
}

// Check that setLedgerData preserves data object with fallback
const hasCorrectSetLedger = src.includes('setLedgerData(data ||') || 
  src.includes('setLedgerData(data ??');

if (!hasCorrectSetLedger) {
  console.error('FAIL: useAdminModals.js does not set ledgerData preserving data object');
  failures++;
}

// Check that default fallback has patients, metrics, total_records, total_pages
const hasDefaultFallback = src.includes('patients: []') && 
  src.includes('metrics: {}') && 
  src.includes('total_records: 0') && 
  src.includes('total_pages: 1');

if (!hasDefaultFallback) {
  console.error('FAIL: useAdminModals.js missing required fallback defaults { patients: [], metrics: {}, total_records: 0, total_pages: 1 }');
  failures++;
}

// Check that initial ledgerData is null to allow lazy tab fetching via !ledgerData
if (!src.includes('const [ledgerData, setLedgerData] = useState(null)')) {
  console.error('FAIL: useAdminModals.js should initialize ledgerData to null so !ledgerData triggers fetch');
  failures++;
}

// 2. Behavioral simulation test:
// Extract the setLedgerData line from fetchCumulativeLedger
const fetchFnMatch = src.match(/const fetchCumulativeLedger = useCallback\(async[\s\S]*?\}, \[.*?\]\);/);
if (!fetchFnMatch) {
  console.error('FAIL: Could not locate fetchCumulativeLedger in useAdminModals.js');
  failures++;
} else {
  const fetchBody = fetchFnMatch[0];
  // Verify that inside fetchCumulativeLedger, data.records is not referenced
  if (fetchBody.includes('data.records')) {
    console.error('FAIL: fetchCumulativeLedger references data.records instead of preserving data');
    failures++;
  }
}

const mockBackendResponse = {
  success: true,
  total_records: 50,
  page: 1,
  limit: 50,
  total_pages: 1,
  metrics: {
    hiv_dm_verified: 45,
    bank_validated: 42,
    udst_done: 40,
    contact_tracing_done: 38
  },
  patients: [
    { patient_id: "P101", patient_name: "Rahul Kumar", district: "Patna" },
    { patient_id: "P102", patient_name: "Pooja Kumari", district: "Gaya" }
  ]
};

// Test with code extracted or evaluated
const extractSetLedgerRegex = /setLedgerData\(([^;]+)\);/;
const ledgerCallMatch = fetchFnMatch ? fetchFnMatch[0].match(extractSetLedgerRegex) : null;

if (ledgerCallMatch) {
  const argExpr = ledgerCallMatch[1].trim();
  try {
    const fn = new Function('data', `return (${argExpr});`);
    const result = fn(mockBackendResponse);
    if (!result || !Array.isArray(result.patients) || result.patients.length !== 2) {
      console.error('FAIL: Ingested ledger data does not preserve patients array. Result was:', result);
      failures++;
    }
    if (!result || !result.metrics || result.metrics.hiv_dm_verified !== 45) {
      console.error('FAIL: Ingested ledger data does not preserve metrics. Result was:', result);
      failures++;
    }
    if (!result || result.total_records !== 50) {
      console.error('FAIL: Ingested ledger data does not preserve total_records. Result was:', result);
      failures++;
    }

    // Also test null data fallback
    const nullResult = fn(null);
    if (!nullResult || !Array.isArray(nullResult.patients) || nullResult.patients.length !== 0) {
      console.error('FAIL: Fallback for null data does not provide empty patients array. Result was:', nullResult);
      failures++;
    }
  } catch (err) {
    console.error('FAIL: Could not evaluate setLedgerData expression:', err.message);
    failures++;
  }
}

if (failures === 0) {
  console.log('PASS: Cumulative ledger ingestion properly preserves patients, metrics, and pagination');
  process.exit(0);
} else {
  console.error(`FAIL: ${failures} issue(s) detected in cumulative ledger ingestion`);
  process.exit(1);
}
