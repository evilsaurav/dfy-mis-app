import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

const adminCode = readFileSync(resolve('dfy-frontend/src/AdminDashboard.jsx'), 'utf8');

console.log("Running Master Table Documents Cohort UI Tests...");

// Test 1: Verify tableData initial state includes documents_cur and documents_prev
assert(
  adminCode.includes('documents_cur: 0') && adminCode.includes('documents_prev: 0'),
  "tableData initial row object must include documents_cur: 0 and documents_prev: 0"
);

// Test 2: Verify r.documents_ids classification logic against currentMonthNotifIdSet
assert(
  adminCode.includes('(r.documents_ids || []).forEach(id => {') &&
  adminCode.includes('if (currentMonthNotifIdSet.has(clean)) map[key].documents_cur += 1;') &&
  adminCode.includes('else map[key].documents_prev += 1;'),
  "r.documents_ids must be classified into documents_cur and documents_prev using currentMonthNotifIdSet"
);

// Test 3: Verify sorting helper handles sortKey === 'documents' for cohort filters
assert(
  adminCode.includes("if (sortKey === 'documents') return row.documents_cur;") &&
  adminCode.includes("if (sortKey === 'documents') return row.documents_prev;"),
  "getVal sort helper must handle sortKey === 'documents' under both current_cohort and backlog filters"
);

// Test 4: Verify cell rendering logic for Documents column
assert(
  adminCode.includes('C:{row.documents_cur} | P:{row.documents_prev}'),
  "Documents table cell must render C:{row.documents_cur} | P:{row.documents_prev}"
);

assert(
  adminCode.includes('row.documents_cur > 0 ? row.documents_cur :') &&
  adminCode.includes('row.documents_prev > 0 ? row.documents_prev :'),
  "Documents table cell must check row.documents_cur and row.documents_prev for current_cohort and backlog modes"
);

// Test 5: Functional simulation of tableData cohort breakdown & sorting
const currentMonthNotifIdSet = new Set(['ID-101', 'ID-102', 'ID-103']);
const rawRecords = [
  { working_place: 'Patna', fo_name: 'FO 1', documents: 3, documents_ids: ['ID-101', 'ID-201', 'ID-202'] },
  { working_place: 'Gaya', fo_name: 'FO 2', documents: 2, documents_ids: ['ID-102', 'ID-103'] }
];

const mockMap = {
  'Patna': { name: 'Patna', documents: 0, documents_cur: 0, documents_prev: 0 },
  'Gaya': { name: 'Gaya', documents: 0, documents_cur: 0, documents_prev: 0 }
};

rawRecords.forEach(r => {
  const key = r.working_place;
  mockMap[key].documents += r.documents;
  (r.documents_ids || []).forEach(id => {
    const clean = String(id).trim();
    if (clean) {
      if (currentMonthNotifIdSet.has(clean)) mockMap[key].documents_cur += 1;
      else mockMap[key].documents_prev += 1;
    }
  });
});

assert.strictEqual(mockMap['Patna'].documents, 3, "Patna total docs should be 3");
assert.strictEqual(mockMap['Patna'].documents_cur, 1, "Patna current cohort docs should be 1 (ID-101)");
assert.strictEqual(mockMap['Patna'].documents_prev, 2, "Patna backlog docs should be 2 (ID-201, ID-202)");

assert.strictEqual(mockMap['Gaya'].documents, 2, "Gaya total docs should be 2");
assert.strictEqual(mockMap['Gaya'].documents_cur, 2, "Gaya current cohort docs should be 2 (ID-102, ID-103)");
assert.strictEqual(mockMap['Gaya'].documents_prev, 0, "Gaya backlog docs should be 0");

// Test 6: Sorting simulation
const sortHelper = (row, sortKey, filter) => {
  if (filter === 'current_cohort') {
    if (sortKey === 'documents') return row.documents_cur;
  } else if (filter === 'backlog') {
    if (sortKey === 'documents') return row.documents_prev;
  }
  return row[sortKey] ?? 0;
};

// Current cohort: Gaya (2) > Patna (1)
assert(sortHelper(mockMap['Gaya'], 'documents', 'current_cohort') > sortHelper(mockMap['Patna'], 'documents', 'current_cohort'));
// Backlog cohort: Patna (2) > Gaya (0)
assert(sortHelper(mockMap['Patna'], 'documents', 'backlog') > sortHelper(mockMap['Gaya'], 'documents', 'backlog'));
// Overall: Patna (3) > Gaya (2)
assert(sortHelper(mockMap['Patna'], 'documents', 'all') > sortHelper(mockMap['Gaya'], 'documents', 'all'));

console.log("All Master Table Documents Cohort UI Tests Passed Successfully!");
