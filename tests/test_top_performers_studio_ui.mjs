import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

const adminCode = readFileSync(resolve('dfy-frontend/src/AdminDashboard.jsx'), 'utf8');

console.log("Running Top Performers Studio & Work Balance Radar Replacement UI Tests...");

// Test 1: Verify Work Balance Radar is REMOVED from AdminDashboard.jsx
assert(
  !adminCode.includes('Work Balance Radar'),
  "Work Balance Radar heading must be completely removed from AdminDashboard.jsx"
);
assert(
  !adminCode.includes('Multi-domain clinical balance'),
  "Multi-domain clinical balance text must be removed from AdminDashboard.jsx"
);

// Test 2: Verify Bihar Top Performers Studio is present
assert(
  adminCode.includes('Top Performers') || adminCode.includes('topPerformers'),
  "Bihar Top Performers Studio must be present in AdminDashboard.jsx"
);

// Test 3: Verify timeframe filter handles weekly, fortnightly, and monthly
assert(
  adminCode.includes("'weekly'") && (adminCode.includes("'fortnightly'") || adminCode.includes("'15_days'")) && adminCode.includes("'monthly'"),
  "Timeframe filter must support weekly, fortnightly (15 days), and monthly options"
);

// Test 4: Verify Top 5 Districts and Top 5 Staff sections exist
assert(
  adminCode.includes('top_districts') || adminCode.includes('Top 5 Districts'),
  "Top 5 Districts section must be present"
);
assert(
  adminCode.includes('top_staff') || adminCode.includes('Top 5 Staff'),
  "Top 5 Staff section must be present"
);

// Test 5: Verify Share Poster / Download Card button and Canvas modal exist
assert(
  adminCode.includes('Share Poster') || adminCode.includes('Download Card') || adminCode.includes('sharePoster'),
  "Share Poster / Download Card trigger must be present"
);
assert(
  adminCode.includes('/api/statewide-top-performers'),
  "AdminDashboard must fetch data from /api/statewide-top-performers"
);

console.log("All Top Performers Studio UI Tests Passed Successfully!");
