import fs from 'fs';
import path from 'path';
import assert from 'assert';

const adminDashboardPath = path.resolve('dfy-frontend/src/AdminDashboard.jsx');
const code = fs.readFileSync(adminDashboardPath, 'utf8');

// 1. Ensure incorrect prop values are NOT present
assert(
  !code.includes('modals.setDate'),
  'AdminDashboard.jsx must not contain modals.setDate (should be modals.setFeedDate)'
);

assert(
  !code.includes('modals.setCategoryInputs'),
  'AdminDashboard.jsx must not contain modals.setCategoryInputs (should be modals.setFeedCategoryInputs)'
);

assert(
  !code.includes('modals.setRemarks'),
  'AdminDashboard.jsx must not contain modals.setRemarks (should be modals.setFeedRemarks)'
);

// 2. Ensure correct prop values ARE present
assert(
  code.includes('setFeedDate={modals.setFeedDate}'),
  'AdminDashboard.jsx must contain setFeedDate={modals.setFeedDate}'
);

assert(
  code.includes('setFeedCategoryInputs={modals.setFeedCategoryInputs}'),
  'AdminDashboard.jsx must contain setFeedCategoryInputs={modals.setFeedCategoryInputs}'
);

assert(
  code.includes('setFeedRemarks={modals.setFeedRemarks}'),
  'AdminDashboard.jsx must contain setFeedRemarks={modals.setFeedRemarks}'
);

console.log('✔ All admin feed prop wiring tests passed successfully!');
