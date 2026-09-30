import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Starting Frontline FO Mobile App Month Sync & Reassurance Notice Tests...');

const appPath = path.resolve(__dirname, '../dfy-frontend/src/App.jsx');
const appCode = fs.readFileSync(appPath, 'utf-8');

// 1. Verify import of getOperationalMonth
assert.match(
  appCode,
  /import\s+.*getOperationalMonth.*from\s+['"]\.\/utils\/operationalMonth['"]/,
  'App.jsx must import getOperationalMonth from ./utils/operationalMonth'
);

// 2. Verify getOperationalMonth().operationalMonth is invoked in profile fetch queries
const count = (appCode.match(/getOperationalMonth\(\)\.operationalMonth/g) || []).length;
assert.ok(
  count >= 2,
  `App.jsx must use getOperationalMonth().operationalMonth in fetchStats and fetchFoMonthlyHistory (found ${count})`
);

// 3. Verify reassurance notice when isMonthEndGracePeriod is true
assert.ok(
  appCode.includes('isMonthEndGracePeriod'),
  'App.jsx must check getOperationalMonth().isMonthEndGracePeriod'
);
assert.ok(
  appCode.includes('Subah 12:00 PM se pehle darj ki gayi report aapke pichhle mahine'),
  'App.jsx must render Day 1 morning reassurance notice for FO'
);
assert.ok(
  appCode.includes('graceClosingMonth'),
  'App.jsx must show graceClosingMonth in reassurance notice'
);

// 4. Confidentiality check: Zero mention of internal 10 AM / 11 AM technical cutoff hours
assert.ok(
  !appCode.includes('10:00 AM') && !appCode.includes('11:00 AM') && !appCode.includes('10 AM') && !appCode.includes('11 AM'),
  'App.jsx must NOT mention internal 10 AM / 11 AM technical cutoff hours'
);

console.log('🎉 All FO Mobile App Month Sync & Reassurance Notice tests passed 100%!');
