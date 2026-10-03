import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modalsSrc = readFileSync(path.join(__dirname, '../dfy-frontend/src/hooks/useAdminModals.js'), 'utf8');
const adminModalsSrc = readFileSync(path.join(__dirname, '../dfy-frontend/src/components/Admin/AdminModals.jsx'), 'utf8');
const journeyModalSrc = readFileSync(path.join(__dirname, '../dfy-frontend/src/components/Admin/modals/JourneyModal.jsx'), 'utf8');

let failures = 0;

// 1. Check useAdminModals return block exports
const returnBlockIdx = modalsSrc.lastIndexOf('return {');
if (returnBlockIdx === -1) {
  console.error('FAIL: useAdminModals.js missing return object');
  failures++;
} else {
  const returnBlock = modalsSrc.slice(returnBlockIdx);

  if (!returnBlock.includes('handleFetchJourney')) {
    console.error('FAIL: useAdminModals return missing handleFetchJourney');
    failures++;
  }
  if (!returnBlock.includes('journeyPatientId') || !returnBlock.includes('setJourneyPatientId')) {
    console.error('FAIL: useAdminModals return missing journeyPatientId/setJourneyPatientId');
    failures++;
  }
  if (!returnBlock.includes('showJourneyModal') || !returnBlock.includes('setShowJourneyModal')) {
    console.error('FAIL: useAdminModals return missing showJourneyModal/setShowJourneyModal');
    failures++;
  }
  if (!returnBlock.includes('journeyResult') || !returnBlock.includes('journeyLoading') || !returnBlock.includes('journeyError')) {
    console.error('FAIL: useAdminModals return missing journeyResult/journeyLoading/journeyError');
    failures++;
  }
  // Check for convenience aliases journeySearchId / setJourneySearchId
  if (!returnBlock.includes('journeySearchId') || !returnBlock.includes('setJourneySearchId')) {
    console.error('FAIL: useAdminModals return missing journeySearchId / setJourneySearchId aliases');
    failures++;
  }
}

// 2. Check AdminModals.jsx passes props to JourneyModal
if (!adminModalsSrc.includes('handleFetchJourney={props.handleFetchJourney}') &&
    !adminModalsSrc.includes('handleFetchJourney=')) {
  console.error('FAIL: AdminModals.jsx does not pass handleFetchJourney to JourneyModal');
  failures++;
}
if (!adminModalsSrc.includes('show={props.showJourneyModal}')) {
  console.error('FAIL: AdminModals.jsx does not pass show={props.showJourneyModal} to JourneyModal');
  failures++;
}

// 3. Check JourneyModal.jsx binds handleFetchJourney to submit form
if (!journeyModalSrc.includes('handleFetchJourney')) {
  console.error('FAIL: JourneyModal.jsx does not accept handleFetchJourney');
  failures++;
}
if (!journeyModalSrc.includes('handleFetchJourney()') && !journeyModalSrc.includes('handleFetchJourney(')) {
  console.error('FAIL: JourneyModal.jsx does not invoke handleFetchJourney');
  failures++;
}

// 4. Check JourneyModal.jsx has z-[100] to popup in front of parent modals (e.g. NikshayModal z-50)
if (!journeyModalSrc.includes('z-[100]')) {
  console.error('FAIL: JourneyModal.jsx must have z-[100] so it stacks on top of parent modals like NikshayModal');
  failures++;
}

if (failures === 0) {
  console.log('PASS: Patient journey modal handler wiring verified successfully');
  process.exit(0);
} else {
  console.error(`FAIL: ${failures} journey modal wiring issues found`);
  process.exit(1);
}
