import assert from 'node:assert/strict';
import { getOperationalMonth } from '../dfy-frontend/src/utils/operationalMonth.js';

console.log('======================================================================');
console.log('[FRONTEND SIMULATION] getOperationalMonth() Sunday Roll-Forward Tests');
console.log('Scenario: October 31 (Sat) -> November 1 (Sun) -> November 2 (Mon)');
console.log('======================================================================');

const timeline = [
  {
    label: '1. Today (Oct 30, Friday 23:00)',
    date: new Date(2026, 9, 30, 23, 0),
    expMonth: '2026-10',
    expGrace: false,
    expClosing: null,
  },
  {
    label: '2. Month-End Last Minute (Oct 31, Saturday 23:59)',
    date: new Date(2026, 9, 31, 23, 59),
    expMonth: '2026-10',
    expGrace: false,
    expClosing: null,
  },
  {
    label: '3. Sunday Morning (Nov 1, Sunday 08:30 AM)',
    date: new Date(2026, 10, 1, 8, 30),
    expMonth: '2026-10',
    expGrace: true,
    expClosing: '2026-10',
  },
  {
    label: '4. Sunday Afternoon (Nov 1, Sunday 15:00)',
    date: new Date(2026, 10, 1, 15, 0),
    expMonth: '2026-10',
    expGrace: true,
    expClosing: '2026-10',
  },
  {
    label: '5. Sunday Midnight (Nov 1, Sunday 23:45)',
    date: new Date(2026, 10, 1, 23, 45),
    expMonth: '2026-10',
    expGrace: true,
    expClosing: '2026-10',
  },
  {
    label: '6. Monday Morning Field Duty (Nov 2, Monday 09:15 AM)',
    date: new Date(2026, 10, 2, 9, 15),
    expMonth: '2026-10',
    expGrace: true,
    expClosing: '2026-10',
  },
  {
    label: '7. Monday 11:30 AM (Between normal 11 AM and 12 PM)',
    date: new Date(2026, 10, 2, 11, 30),
    expMonth: '2026-10',
    expGrace: true,
    expClosing: '2026-10',
  },
  {
    label: '8. Monday 11:59 AM (Last minute of grace period)',
    date: new Date(2026, 10, 2, 11, 59),
    expMonth: '2026-10',
    expGrace: true,
    expClosing: '2026-10',
  },
  {
    label: '9. Monday 12:00 PM Noon (Official handover to November)',
    date: new Date(2026, 10, 2, 12, 0),
    expMonth: '2026-11',
    expGrace: false,
    expClosing: null,
  },
  {
    label: '10. Monday Afternoon (Nov 2, Monday 14:00)',
    date: new Date(2026, 10, 2, 14, 0),
    expMonth: '2026-11',
    expGrace: false,
    expClosing: null,
  },
  {
    label: '11. Tuesday Standard Duty (Nov 3, Tuesday 10:00 AM)',
    date: new Date(2026, 10, 3, 10, 0),
    expMonth: '2026-11',
    expGrace: false,
    expClosing: null,
  },
];

let allPassed = true;

for (const t of timeline) {
  const res = getOperationalMonth(t.date);
  const monthOk = res.operationalMonth === t.expMonth;
  const graceOk = res.isMonthEndGracePeriod === t.expGrace;
  const closingOk = res.graceClosingMonth === t.expClosing;

  const passed = monthOk && graceOk && closingOk;
  if (!passed) allPassed = false;

  console.log(`\n${t.label}`);
  console.log(`   Operational Month : ${res.operationalMonth} (Expected: ${t.expMonth}) -> ${monthOk ? '[OK]' : '[FAIL]'}`);
  console.log(`   Grace Period      : ${res.isMonthEndGracePeriod ? 'ACTIVE (Banner Shown)' : 'INACTIVE (No Banner)'} -> ${graceOk ? '[OK]' : '[FAIL]'}`);
  console.log(`   Grace Target Month: ${res.graceClosingMonth || 'None'} (Expected: ${t.expClosing || 'None'}) -> ${closingOk ? '[OK]' : '[FAIL]'}`);
  console.log(`   Status            : ${passed ? '[PASS]' : '[FAIL]'}`);
}

console.log('\n======================================================================');
if (allPassed) {
  console.log('[SUCCESS] FRONTEND SIMULATION: 100% PERFECT! ALL 11 TIMELINE PHASES PASSED.');
  console.log('   - FO mobile banner will stay visible all day Sunday and Monday until 12:00 PM.');
  console.log('   - At Monday 12:00 PM, banner auto-dismisses and app switches to November.');
} else {
  console.log('[ERROR] FRONTEND SIMULATION FAILED.');
}
console.log('======================================================================');
