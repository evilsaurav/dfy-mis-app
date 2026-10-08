import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

const ROOT = resolve(process.cwd());

console.log('🧪 Starting Statewide TA Dashboard Frontend & Wiring Verification Suite...\n');

// 1. Verify AdminHeader.jsx tab wiring
const adminHeaderPath = resolve(ROOT, 'dfy-frontend/src/components/Admin/AdminHeader.jsx');
const adminHeaderSrc = readFileSync(adminHeaderPath, 'utf8');

assert(
  adminHeaderSrc.includes("(isSuperAdmin || currentUser?.role === 'MAIN_INCHARGE')"),
  'AdminHeader.jsx must gate the Travel Allowance Statewide tab to SUPER_ADMIN and MAIN_INCHARGE'
);
assert(
  adminHeaderSrc.includes("setActiveMainTab('travel_allowance')"),
  'AdminHeader.jsx must set activeMainTab to travel_allowance on click'
);
assert(
  adminHeaderSrc.includes('Travel Allowance Statewide'),
  'AdminHeader.jsx must display Travel Allowance Statewide label'
);
console.log('✅ AdminHeader.jsx tab navigation and RBAC gate verified.');

// 2. Verify AdminDashboard.jsx mounting
const adminDashPath = resolve(ROOT, 'dfy-frontend/src/AdminDashboard.jsx');
const adminDashSrc = readFileSync(adminDashPath, 'utf8');

assert(
  adminDashSrc.includes("import TravelAllowanceTab from './components/Admin/tabs/TravelAllowanceTab';"),
  'AdminDashboard.jsx must import TravelAllowanceTab'
);
assert(
  adminDashSrc.includes("<TravelAllowanceTab"),
  'AdminDashboard.jsx must mount <TravelAllowanceTab />'
);
assert(
  adminDashSrc.includes("activeMainTab={activeMainTab}"),
  'AdminDashboard.jsx must pass activeMainTab to TravelAllowanceTab'
);
assert(
  adminDashSrc.includes("statewideSummary={modals.statewideSummary}"),
  'AdminDashboard.jsx must pass statewideSummary from useAdminModals to TravelAllowanceTab'
);
assert(
  adminDashSrc.includes("fetchStatewideSummary={modals.fetchStatewideSummary}"),
  'AdminDashboard.jsx must pass fetchStatewideSummary to TravelAllowanceTab'
);
console.log('✅ AdminDashboard.jsx TravelAllowanceTab mounting & prop wiring verified.');

// 3. Verify useAdminTA.js state & handlers
const useAdminTAPath = resolve(ROOT, 'dfy-frontend/src/hooks/useAdminTA.js');
const useAdminTASrc = readFileSync(useAdminTAPath, 'utf8');

assert(
  useAdminTASrc.includes("const [statewideSummary, setStatewideSummary] = useState(null);"),
  'useAdminTA.js must declare statewideSummary state'
);
assert(
  useAdminTASrc.includes("const fetchStatewideSummary = useCallback("),
  'useAdminTA.js must declare fetchStatewideSummary callback'
);
assert(
  useAdminTASrc.includes("/admin/ta/statewide-summary?month="),
  'useAdminTA.js must call /admin/ta/statewide-summary endpoint'
);
assert(
  useAdminTASrc.includes("statewideSummary, setStatewideSummary,"),
  'useAdminTA.js must export statewideSummary in return block'
);
assert(
  useAdminTASrc.includes("fetchStatewideSummary,"),
  'useAdminTA.js must export fetchStatewideSummary in return block'
);
console.log('✅ useAdminTA.js statewide state and API fetcher verified.');

// 4. Verify TravelAllowanceTab.jsx features
const tabPath = resolve(ROOT, 'dfy-frontend/src/components/Admin/tabs/TravelAllowanceTab.jsx');
const tabSrc = readFileSync(tabPath, 'utf8');

assert(
  tabSrc.includes("Statewide Travel Allowance Command Deck"),
  'TravelAllowanceTab.jsx must render Executive Command Deck header'
);
assert(
  tabSrc.includes("Total State Payable"),
  'TravelAllowanceTab.jsx must render Total State Payable KPI'
);
assert(
  tabSrc.includes("Total Distance Logged"),
  'TravelAllowanceTab.jsx must render Total Distance Logged KPI'
);
assert(
  tabSrc.includes("Verification Completion"),
  'TravelAllowanceTab.jsx must render Verification Completion KPI'
);
assert(
  tabSrc.includes("Action Radar"),
  'TravelAllowanceTab.jsx must render Action Radar KPI'
);
assert(
  tabSrc.includes("Bento Cards"),
  'TravelAllowanceTab.jsx must feature Bento Cards view mode'
);
assert(
  tabSrc.includes("Detailed Table"),
  'TravelAllowanceTab.jsx must feature Detailed Table view mode'
);
assert(
  tabSrc.includes("onInspectDistrict?.(d.district)"),
  'TravelAllowanceTab.jsx must allow drilldown via onInspectDistrict'
);
assert(
  tabSrc.includes("Export State Excel"),
  'TravelAllowanceTab.jsx must provide 1-click Export State Excel button'
);
assert(
  tabSrc.includes("fetchStatewideSummary?.(month"),
  'TravelAllowanceTab.jsx must fetch statewide summary on active month change'
);
assert(
  tabSrc.includes("⚪ Not Started"),
  'TravelAllowanceTab.jsx must handle ⚪ Not Started status for districts without a roster'
);
console.log('✅ TravelAllowanceTab.jsx components, KPIs, Bento Cards, Table & Drilldown verified.');

console.log('\n🎉 ALL FRONTEND AND INTEGRATION WIRING TESTS PASSED 100%!');
