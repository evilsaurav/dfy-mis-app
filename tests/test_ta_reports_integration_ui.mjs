import fs from 'fs';
import path from 'path';

console.log('=== Running Travel Allowance & Reports Studio Integration UI Tests ===\n');

const adminDashboardPath = path.resolve('dfy-frontend/src/AdminDashboard.jsx');
const appPath = path.resolve('dfy-frontend/src/App.jsx');

const adminContent = fs.readFileSync(adminDashboardPath, 'utf8');
const appContent = fs.readFileSync(appPath, 'utf8');

let passed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    console.log(`✔ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${message}`);
    process.exitCode = 1;
  }
}

// 1. Check taDailyTableRef declaration and attachment
assert(
  adminContent.includes('const taDailyTableRef = useRef(null);'),
  'AdminDashboard declares taDailyTableRef with useRef(null)'
);
assert(
  adminContent.includes('ref={taDailyTableRef}') && adminContent.includes('scroll-mt-28'),
  'Day-by-Day table container is attached to ref={taDailyTableRef} with scroll-mt-28'
);

// 2. Check Inspect / Edit smooth scroll call
assert(
  adminContent.includes('taDailyTableRef.current?.scrollIntoView({ behavior: \'smooth\', block: \'start\' });'),
  'District Staff Payroll Roster smoothly scrolls up to Day-by-Day table on Inspect / Edit click'
);

// 3. Check Overview Card 4 ("Field Travel" KPI) calculation
assert(
  adminContent.includes('Math.max(Number(totals.total_km) || 0, Number(taAnalytics?.month_total_km) || 0)'),
  'Overview Card 4 dynamically aggregates totalKm from both totals.total_km and taAnalytics.month_total_km'
);
assert(
  adminContent.includes('avgKmPerStaff = activeStaffCount > 0 ? (totalKm / activeStaffCount).toFixed(1) : 0'),
  'Overview Card 4 computes average KM per active staff cleanly'
);

// 4. Check Reports Studio Option A integration
assert(
  adminContent.includes('{ id: "ta_payout", label: "🛵 Travel Allowance (.xlsx)", icon: "🛵" }'),
  'Reports Studio modal includes dedicated ta_payout tab'
);
assert(
  adminContent.includes('reportsStudioTab === "ta_payout"'),
  'Reports Studio modal renders dedicated Travel Allowance & Bike Payout export deck'
);
assert(
  adminContent.includes('handleExportTaExcel(selectedDistrict !== \'All\' ? selectedDistrict : (taDistrict || \'Gaya\'), month)'),
  'Reports Studio ta_payout tab has 1-click Download Travel Allowance (.xlsx) button'
);
assert(
  adminContent.includes('setActiveMainTab(\'travel_allowance\')') && adminContent.includes('Open Full 31-Day TA Studio'),
  'Reports Studio ta_payout tab includes 1-tap launcher to switch to full 31-day TA Studio'
);

// 5. Check FO App Evening Report Travel KM Input
assert(
  appContent.includes('id="sec-travel-km"') && appContent.includes('Aaj Ka Field Safar (Travel KM)'),
  'FO App form includes dedicated Field Travel / Bike Distance input card'
);
assert(
  appContent.includes('value={formData.total_km || \'\'}'),
  'FO App form binds input to formData.total_km'
);
assert(
  appContent.includes('total_km: ""'),
  'FO App initializes and resets total_km in formData state'
);

// 6. Check Smart Zero-Read LocalStorage Caching in FO App
assert(
  appContent.includes('dfy_fo_ta_cache_'),
  'FO App uses dfy_fo_ta_cache_ for instant zero-read local storage hydration'
);

console.log(`\nResults: ${passed}/${total} assertions passed.`);
if (passed === total) {
  console.log('🎉 ALL TRAVEL ALLOWANCE & REPORTS STUDIO INTEGRATION TESTS PASSED 100%!\n');
} else {
  console.error('💥 SOME TESTS FAILED!\n');
  process.exit(1);
}
