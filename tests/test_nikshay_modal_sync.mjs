import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, '../dfy-frontend/src/hooks/useAdminModals.js'), 'utf8');
const nikshayModalSrc = readFileSync(path.join(__dirname, '../dfy-frontend/src/components/Admin/modals/NikshayModal.jsx'), 'utf8');

let failures = 0;

// 1. useAdminModals must have fetchNikshaySyncStatus definition
if (!src.includes('const fetchNikshaySyncStatus = useCallback(') && !src.includes('function fetchNikshaySyncStatus(')) {
  console.error('FAIL: useAdminModals.js missing fetchNikshaySyncStatus definition');
  failures++;
}

// 2. useAdminModals must have a useEffect watching showNikshayModal that calls fetchNikshaySyncStatus
const hasNikshayEffect = src.includes('showNikshayModal') && src.includes('fetchNikshaySyncStatus') &&
  (src.includes('[showNikshayModal, fetchNikshaySyncStatus]') || src.includes('[showNikshayModal]'));
if (!hasNikshayEffect) {
  console.error('FAIL: useAdminModals.js missing useEffect([showNikshayModal]) that calls fetchNikshaySyncStatus');
  failures++;
}

// 3. handleReconcileNikshay must invoke fetchNikshaySyncStatus
const reconcileMatch = src.match(/const handleReconcileNikshay = async [\s\S]*?finally \{[\s\S]*?\};/);
if (!reconcileMatch || !reconcileMatch[0].includes('fetchNikshaySyncStatus()')) {
  console.error('FAIL: handleReconcileNikshay does not invoke fetchNikshaySyncStatus()');
  failures++;
}

// 4. NikshayModal must consume nikshaySyncStatus prop
if (!nikshayModalSrc.includes('nikshaySyncStatus') && !nikshayModalSrc.includes('syncStatus')) {
  console.error('FAIL: NikshayModal.jsx does not consume nikshaySyncStatus prop');
  failures++;
}

// 5. useAdminModals must return fetchNikshaySyncStatus
if (!src.includes('fetchNikshaySyncStatus,') && !src.includes('fetchNikshaySyncStatus\n')) {
  console.error('FAIL: useAdminModals.js does not return fetchNikshaySyncStatus');
  failures++;
}

if (failures === 0) {
  console.log('PASS: Nikshay sync-status wiring is correct');
  process.exit(0);
} else {
  console.error(`FAIL: ${failures} Nikshay sync issues`);
  process.exit(1);
}
