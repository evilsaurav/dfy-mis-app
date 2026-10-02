import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getOperationalMonth, calculateOverviewPacing } from '../dfy-frontend/src/utils/operationalMonth.js';
import { getFullAdminDashboardCode } from './test_helpers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Starting Admin Dashboard Pacing & Operational Month UI Tests...');

// -------------------------------------------------------------
// 1. Test getOperationalMonth()
// -------------------------------------------------------------

// Test 1.1: Day 1 Morning (Oct 1 at 09:30 AM) -> September grace period
const oct1Morning = new Date(2026, 9, 1, 9, 30);
const res1 = getOperationalMonth(oct1Morning);
assert.equal(res1.operationalMonth, '2026-09');
assert.equal(res1.isMonthEndGracePeriod, true);
assert.equal(res1.graceClosingMonth, '2026-09');
assert.equal(res1.activeCalendarMonth, '2026-10');

// Test 1.2: Day 1 Just Before Noon (Oct 1 at 11:59 AM) -> September grace period
const oct1BeforeNoon = new Date(2026, 9, 1, 11, 59);
const res2 = getOperationalMonth(oct1BeforeNoon);
assert.equal(res2.operationalMonth, '2026-09');
assert.equal(res2.isMonthEndGracePeriod, true);

// Test 1.3: Day 1 Exactly at 12:00 PM Noon -> October (closed grace window)
const oct1Noon = new Date(2026, 9, 1, 12, 0);
const res3 = getOperationalMonth(oct1Noon);
assert.equal(res3.operationalMonth, '2026-10');
assert.equal(res3.isMonthEndGracePeriod, false);
assert.equal(res3.graceClosingMonth, null);
assert.equal(res3.activeCalendarMonth, '2026-10');

// Test 1.4: Day 1 Afternoon (Oct 1 at 12:30 PM) -> October
const oct1Afternoon = new Date(2026, 9, 1, 12, 30);
const res4 = getOperationalMonth(oct1Afternoon);
assert.equal(res4.operationalMonth, '2026-10');
assert.equal(res4.isMonthEndGracePeriod, false);

// Test 1.5: Mid-month (Sep 15 at 14:00) -> September
const sep15 = new Date(2026, 8, 15, 14, 0);
const res5 = getOperationalMonth(sep15);
assert.equal(res5.operationalMonth, '2026-09');
assert.equal(res5.isMonthEndGracePeriod, false);

// Test 1.6: Year Boundary (Jan 1, 2026 at 08:30 AM) -> Dec 2025
const jan1Morning = new Date(2026, 0, 1, 8, 30);
const res6 = getOperationalMonth(jan1Morning);
assert.equal(res6.operationalMonth, '2025-12');
assert.equal(res6.isMonthEndGracePeriod, true);
assert.equal(res6.graceClosingMonth, '2025-12');
assert.equal(res6.activeCalendarMonth, '2026-01');

console.log('✓ getOperationalMonth passes all boundary and grace period tests');

// -------------------------------------------------------------
// 2. Test calculateOverviewPacing()
// -------------------------------------------------------------

// Test 2.1: Past Month (Completed Month Final View)
const pastWorkingDays = {
  totalDays: 30,
  sundays: 4,
  holidays: 0,
  totalWorkingDays: 26,
  elapsedWorkingDays: 26,
  remainingWorkingDays: 0,
  isCurrentMonth: false,
  isPastMonth: true,
  isFutureMonth: false
};
const pastPacing = calculateOverviewPacing(pastWorkingDays, 6285, 7708);
assert.equal(pastPacing.daysRemainingDisplay, 0, 'Past month days remaining must be 0');
assert.equal(pastPacing.projectedTotal, 6285, 'Past month projected total must equal actual achieved total without multiplication');
assert.equal(pastPacing.requiredDailyRate, '0.0', 'Past month required rate must be 0.0');
assert.equal(pastPacing.currentDailyRate, '241.7', 'Past month velocity = 6285 / 26 = 241.7');
assert.equal(pastPacing.projectedPct, 82, 'Past month projected % = Math.round(6285 / 7708 * 100) = 82%');

// Test 2.2: Current Month (In-flight live pacing)
const currentWorkingDays = {
  totalDays: 31,
  sundays: 4,
  holidays: 0,
  totalWorkingDays: 27,
  elapsedWorkingDays: 1,
  remainingWorkingDays: 26,
  isCurrentMonth: true,
  isPastMonth: false,
  isFutureMonth: false
};
const currentPacing = calculateOverviewPacing(currentWorkingDays, 100, 2700);
assert.equal(currentPacing.daysRemainingDisplay, 26);
assert.equal(currentPacing.currentDailyRate, '100.0');
assert.equal(currentPacing.requiredDailyRate, '100.0'); // (2700 - 100) / 26 = 100.0
assert.equal(currentPacing.projectedTotal, 2700); // 100 + (100.0 * 26) = 2700
assert.equal(currentPacing.projectedPct, 100);

// Test 2.3: Future Month (Pre-Month Planning)
const futureWorkingDays = {
  totalDays: 30,
  sundays: 4,
  holidays: 0,
  totalWorkingDays: 26,
  elapsedWorkingDays: 0,
  remainingWorkingDays: 26,
  isCurrentMonth: false,
  isPastMonth: false,
  isFutureMonth: true
};
const futurePacing = calculateOverviewPacing(futureWorkingDays, 0, 2600);
assert.equal(futurePacing.daysRemainingDisplay, 26);
assert.equal(futurePacing.currentDailyRate, '0.0');
assert.equal(futurePacing.requiredDailyRate, '100.0');
assert.equal(futurePacing.projectedTotal, 0);
assert.equal(futurePacing.projectedPct, 0);

console.log('✓ calculateOverviewPacing passes past, current, and future month state-machine tests');

// -------------------------------------------------------------
// 3. Static Audit of AdminDashboard.jsx
// -------------------------------------------------------------
const dashboardCode = getFullAdminDashboardCode();

// Assert buggy hardcoded 30 days is removed
assert.ok(!dashboardCode.includes('const daysInMonth = 30;'), 'AdminDashboard.jsx must not contain buggy hardcoded "daysInMonth = 30"');

// Assert operationalMonth helper is imported
assert.ok(dashboardCode.includes("from './utils/operationalMonth'"), 'AdminDashboard.jsx must import from ./utils/operationalMonth');

// Assert month state initialization uses getOperationalMonth
assert.ok(dashboardCode.includes('getOperationalMonth().operationalMonth'), 'AdminDashboard.jsx month state must initialize with getOperationalMonth()');

// Assert Month-End Close Window Active banner is present
assert.ok(dashboardCode.includes('Month-End Close Window Active:'), 'AdminDashboard.jsx must render Day 1 Month-End Grace Alert Banner');

console.log('✓ AdminDashboard.jsx passes static code requirements');
console.log('🎉 All Admin Dashboard Pacing UI & Operational Month tests passed 100%!');
