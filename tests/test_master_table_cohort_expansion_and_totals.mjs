import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

const adminCode = readFileSync(resolve('dfy-frontend/src/AdminDashboard.jsx'), 'utf8');

console.log("Running Master Table Cohort Expansion & Totals Row UI Tests...");

// Test 1: Verify tableData initial state includes new cohort keys
const requiredInitialKeys = [
  'dbt_cur: 0', 'dbt_prev: 0',
  'home_visits_cur: 0', 'home_visits_prev: 0',
  'contact_tracing_cur: 0', 'contact_tracing_prev: 0',
  'follow_ups_cur: 0', 'follow_ups_prev: 0',
  'differentiated_tb_cur: 0', 'differentiated_tb_prev: 0'
];

for (const key of requiredInitialKeys) {
  assert(adminCode.includes(key), `tableData initial row object must include ${key}`);
}

// Test 2: Verify ID array classification logic for all requested categories
assert(
  adminCode.includes('(r.dbt_ids || []).forEach(id => {') &&
  adminCode.includes('map[key].dbt_cur += 1;') &&
  adminCode.includes('map[key].dbt_prev += 1;'),
  "r.dbt_ids must be classified into dbt_cur and dbt_prev"
);

assert(
  adminCode.includes('(r.home_visit_ids || []).forEach(id => {') &&
  adminCode.includes('map[key].home_visits_cur += 1;') &&
  adminCode.includes('map[key].home_visits_prev += 1;'),
  "r.home_visit_ids must be classified into home_visits_cur and home_visits_prev"
);

assert(
  adminCode.includes('(r.contact_tracing_ids || []).forEach(id => {') &&
  adminCode.includes('map[key].contact_tracing_cur += 1;') &&
  adminCode.includes('map[key].contact_tracing_prev += 1;'),
  "r.contact_tracing_ids must be classified into contact_tracing_cur and contact_tracing_prev"
);

assert(
  adminCode.includes('(r.follow_up_ids || []).forEach(id => {') &&
  adminCode.includes('map[key].follow_ups_cur += 1;') &&
  adminCode.includes('map[key].follow_ups_prev += 1;'),
  "r.follow_up_ids must be classified into follow_ups_cur and follow_ups_prev"
);

assert(
  adminCode.includes('(r.differentiated_tb_ids || []).forEach(id => {') &&
  adminCode.includes('map[key].differentiated_tb_cur += 1;') &&
  adminCode.includes('map[key].differentiated_tb_prev += 1;'),
  "r.differentiated_tb_ids must be classified into differentiated_tb_cur and differentiated_tb_prev"
);

// Test 3: Verify sorting helper handles all 5 categories for cohort filters
const sortKeys = ['dbt', 'home_visits', 'contact_tracing', 'follow_ups', 'differentiated_tb'];
for (const key of sortKeys) {
  assert(
    adminCode.includes(`if (sortKey === '${key}') return row.${key}_cur;`) &&
    adminCode.includes(`if (sortKey === '${key}') return row.${key}_prev;`),
    `getVal sort helper must handle sortKey === '${key}' under both current_cohort and backlog filters`
  );
}

// Test 4: Verify cell rendering logic for all 5 columns
assert(adminCode.includes('C:{row.dbt_cur} | P:{row.dbt_prev}'), "DBT cell must render C:{row.dbt_cur} | P:{row.dbt_prev}");
assert(adminCode.includes('C:{row.home_visits_cur} | P:{row.home_visits_prev}'), "Home Visits cell must render C:{row.home_visits_cur} | P:{row.home_visits_prev}");
assert(adminCode.includes('C:{row.contact_tracing_cur} | P:{row.contact_tracing_prev}'), "Contact Tracing cell must render C:{row.contact_tracing_cur} | P:{row.contact_tracing_prev}");
assert(adminCode.includes('C:{row.follow_ups_cur} | P:{row.follow_ups_prev}'), "Follow Ups cell must render C:{row.follow_ups_cur} | P:{row.follow_ups_prev}");
assert(adminCode.includes('C:{row.differentiated_tb_cur} | P:{row.differentiated_tb_prev}'), "Diff TB cell must render C:{row.differentiated_tb_cur} | P:{row.differentiated_tb_prev}");

// Test 5: Verify bottom TOTAL row (tfoot) exists in the table
assert(adminCode.includes('<tfoot'), "Table must include a <tfoot> element for the TOTAL summary row");
assert(adminCode.includes('TOTAL') || adminCode.includes('Total'), "<tfoot> must display TOTAL label");

console.log("All Master Table Cohort Expansion & Totals Row UI Tests Passed Successfully!");
