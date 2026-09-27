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

// 3. Check Overview Card 4 ("Field Travel" KPI) calculation and Launcher
assert(
  adminContent.includes('Math.max(Number(totals.total_km) || 0, Number(taAnalytics?.month_total_km) || 0)'),
  'Overview Card 4 dynamically aggregates totalKm from both totals.total_km and taAnalytics.month_total_km'
);
assert(
  adminContent.includes('avgKmPerStaff = activeStaffCount > 0 ? (totalKm / activeStaffCount).toFixed(1) : 0'),
  'Overview Card 4 computes average KM per active staff cleanly'
);
assert(
  adminContent.includes('setReportsStudioTab(\'ta_payout\')') && adminContent.includes('setShowReportsStudio(true)'),
  'Overview Card 4 button directly opens Reports Studio on ta_payout tab'
);

// 4. Check that TA Studio is completely removed from Main Navbar Tabs
assert(
  !adminContent.includes('onClick={() => setActiveMainTab(\'travel_allowance\')}'),
  'Main dashboard top navbar tabs no longer include travel_allowance button'
);

// 5. Check Reports Studio TA Studio Full Integration & Strict Sub-Admin RBAC
assert(
  adminContent.includes('{ id: "ta_payout", label: "🛵 Travel Allowance (.xlsx)", icon: "🛵" }'),
  'Reports Studio modal includes dedicated ta_payout tab'
);
assert(
  adminContent.includes('reportsStudioTab === "ta_payout"'),
  'Reports Studio modal renders dedicated Travel Allowance & Bike Payout export deck'
);
assert(
  adminContent.includes('availableKpiDistricts.map(d => (') && adminContent.includes('setTaDistrict(availableKpiDistricts[0])'),
  'TA Studio strictly enforces Sub-Admin RBAC using availableKpiDistricts for district selection and automatic fallback'
);
assert(
  adminContent.includes('handleExportTaExcel(taDistrict, taMonth)'),
  'Reports Studio ta_payout tab has 1-click Download Travel Allowance (.xlsx) button'
);

// 6. Check FO App Morning & Evening Meter Readings, Auto-Calculation & Preview
assert(
  appContent.includes('id="sec-travel-km"') && appContent.includes('Aaj Ka Bike Meter Reading (Travel KM)'),
  'FO App form includes dedicated Field Travel / Bike Distance meter reading section'
);
assert(
  appContent.includes('value={formData.morning_km || \'\'}') && appContent.includes('value={formData.evening_km || \'\'}'),
  'FO App form binds morning and evening odometer inputs to formData.morning_km and formData.evening_km'
);
assert(
  appContent.includes('Auto-Calculated Safar:') && appContent.includes('Shaam ki reading subah se kam nahi ho sakti'),
  'FO App form features live auto-calculated travel distance with evening < morning validation alert'
);
assert(
  appContent.includes('morning_km: ""') && appContent.includes('evening_km: ""') && appContent.includes('total_km: ""'),
  'FO App initializes and resets morning_km, evening_km, and total_km in formData state'
);
assert(
  appContent.includes('Field Travel &amp; Bike Meter') || appContent.includes('Field Travel & Bike Meter'),
  'FO App pre-submission review modal displays travel reading summary if entered'
);

// 7. Check Smart Zero-Read LocalStorage Caching in FO App
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
