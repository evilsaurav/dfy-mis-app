import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminHeaderSrc = readFileSync(path.join(__dirname, '../dfy-frontend/src/components/Admin/AdminHeader.jsx'), 'utf8');
const adminModalsSrc = readFileSync(path.join(__dirname, '../dfy-frontend/src/components/Admin/AdminModals.jsx'), 'utf8');
const cascadeModalSrc = readFileSync(path.join(__dirname, '../dfy-frontend/src/components/Admin/modals/CascadeAlertsModal.jsx'), 'utf8');
const useAdminModalsSrc = readFileSync(path.join(__dirname, '../dfy-frontend/src/hooks/useAdminModals.js'), 'utf8');
const adminDashboardSrc = readFileSync(path.join(__dirname, '../dfy-frontend/src/AdminDashboard.jsx'), 'utf8');

let failures = 0;

function check(desc, condition) {
  if (condition) {
    console.log(`✔ PASS: ${desc}`);
  } else {
    console.error(`✖ FAIL: ${desc}`);
    failures++;
  }
}

console.log('--- Testing Cascade Alerts Wiring ---');

// 1. AdminHeader.jsx accepts fetchCascadeAlerts and setShowCascadeModal
check(
  'AdminHeader.jsx accepts fetchCascadeAlerts prop',
  adminHeaderSrc.includes('fetchCascadeAlerts')
);
check(
  'AdminHeader.jsx accepts setShowCascadeModal prop',
  adminHeaderSrc.includes('setShowCascadeModal')
);

// 2. AdminHeader.jsx button triggers fetchCascadeAlerts() and setShowCascadeModal(true)
const hasCascadeButton = adminHeaderSrc.includes('fetchCascadeAlerts()') &&
  (adminHeaderSrc.includes('setShowCascadeModal(true)') || adminHeaderSrc.includes('setShowCascadeModal (true)'));
check(
  'AdminHeader.jsx button onClick calls fetchCascadeAlerts() and setShowCascadeModal(true)',
  hasCascadeButton
);

// 3. AdminModals.jsx renders CascadeAlertsModal with all required props
const requiredCascadeProps = [
  'isOpen',
  'show',
  'onClose',
  'cascadeData',
  'month',
  'cascadeFilterDist',
  'setCascadeFilterDist',
  'districts',
  'cascadeRiskFilter',
  'setCascadeRiskFilter',
  'fetchCascadeAlerts',
  'getAdminToken',
  'currentUser',
  'loadingCascade'
];

check(
  'AdminModals.jsx imports CascadeAlertsModal',
  adminModalsSrc.includes("import CascadeAlertsModal from './modals/CascadeAlertsModal'") ||
  adminModalsSrc.includes('import CascadeAlertsModal from')
);

// Find CascadeAlertsModal JSX block in AdminModals.jsx
const modalMatch = adminModalsSrc.match(/<CascadeAlertsModal[\s\S]*?\/>/);
check(
  'AdminModals.jsx renders <CascadeAlertsModal ... />',
  Boolean(modalMatch)
);

if (modalMatch) {
  const modalBlock = modalMatch[0];
  for (const prop of requiredCascadeProps) {
    check(
      `AdminModals.jsx passes prop "${prop}" to CascadeAlertsModal`,
      modalBlock.includes(`${prop}=`)
    );
  }
}

// 4. CascadeAlertsModal.jsx accepts required props
for (const prop of requiredCascadeProps) {
  check(
    `CascadeAlertsModal.jsx accepts prop "${prop}"`,
    cascadeModalSrc.includes(prop)
  );
}

// 5. useAdminModals.js defines fetchCascadeAlerts and manages cascade state
check(
  'useAdminModals.js defines fetchCascadeAlerts function',
  useAdminModalsSrc.includes('const fetchCascadeAlerts =') ||
  useAdminModalsSrc.includes('function fetchCascadeAlerts')
);
check(
  'fetchCascadeAlerts queries /admin/cascade-alerts endpoint',
  useAdminModalsSrc.includes('/admin/cascade-alerts')
);

// 6. useAdminModals.js exports all cascade states and handlers
const returnBlockIdx = useAdminModalsSrc.lastIndexOf('return {');
check(
  'useAdminModals.js contains a return block',
  returnBlockIdx !== -1
);

if (returnBlockIdx !== -1) {
  const returnBlock = useAdminModalsSrc.slice(returnBlockIdx);
  const requiredExports = [
    'showCascadeModal',
    'setShowCascadeModal',
    'cascadeData',
    'loadingCascade',
    'cascadeFilterDist',
    'setCascadeFilterDist',
    'cascadeRiskFilter',
    'setCascadeRiskFilter',
    'fetchCascadeAlerts'
  ];

  for (const exp of requiredExports) {
    check(
      `useAdminModals.js exports "${exp}"`,
      returnBlock.includes(exp)
    );
  }
}

// 7. AdminDashboard.jsx connects modals hook to AdminHeader and AdminModals
check(
  'AdminDashboard.jsx passes fetchCascadeAlerts={modals.fetchCascadeAlerts} to AdminHeader',
  adminDashboardSrc.includes('fetchCascadeAlerts={modals.fetchCascadeAlerts}')
);
check(
  'AdminDashboard.jsx passes setShowCascadeModal={modals.setShowCascadeModal} to AdminHeader',
  adminDashboardSrc.includes('setShowCascadeModal={modals.setShowCascadeModal}')
);
check(
  'AdminDashboard.jsx spreads modals into AdminModals',
  adminDashboardSrc.includes('<AdminModals') && adminDashboardSrc.includes('{...modals}')
);

console.log('--------------------------------------');
if (failures === 0) {
  console.log('PASS: All cascade alerts wiring checks passed successfully (100%)');
  process.exit(0);
} else {
  console.error(`FAIL: ${failures} cascade alerts wiring issues detected`);
  process.exit(1);
}
