import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';

console.log('🧪 Testing TA Submit to Incharge & Incharge Unlocking UI...');

assert.ok(existsSync('dfy-frontend/src/components/Admin/modals/TravelAllowanceModal.jsx'), 'TravelAllowanceModal.jsx must exist');
assert.ok(existsSync('dfy-frontend/src/hooks/useAdminTA.js'), 'useAdminTA.js must exist');

const modalSrc = readFileSync('dfy-frontend/src/components/Admin/modals/TravelAllowanceModal.jsx', 'utf8');
const hookSrc = readFileSync('dfy-frontend/src/hooks/useAdminTA.js', 'utf8');

// 1. Submit button renamed to "Submit to Incharge"
assert.ok(
  modalSrc.includes('Submit to Incharge'),
  'Modal must have "Submit to Incharge" button text'
);

// 2. Confirmation modal state and prompt
assert.ok(
  modalSrc.includes('showConfirmSubmitModal'),
  'Modal must declare and use showConfirmSubmitModal state'
);
assert.ok(
  modalSrc.includes('क्या आपकी रिपोर्ट पूरी तरह फाइनल हो गई है?'),
  'Confirmation modal must ask if the report is final'
);
assert.ok(
  modalSrc.includes('Final Review & Submit to Incharge'),
  'Confirmation modal must include English subtitle'
);
assert.ok(
  modalSrc.includes('अंतिम समीक्षा करें'),
  'Confirmation modal must include "अंतिम समीक्षा करें" review again button'
);

// 3. Incharge unlock power on SUBMITTED or APPROVED or is_locked
assert.ok(
  modalSrc.includes('handleUnlockStaff'),
  'Modal must provide handleUnlockStaff action'
);
assert.ok(
  modalSrc.includes('isIncharge && (staff.is_locked || staff.status === \'APPROVED\' || staff.status === \'SUBMITTED\')'),
  'Incharge must have unlock action on submitted, approved, or locked records'
);

// 4. useAdminTA canEdit guard
assert.ok(
  hookSrc.includes("selectedOfficer?.status !== 'SUBMITTED'"),
  'useAdminTA must prevent editing when record is SUBMITTED'
);
assert.ok(
  hookSrc.includes("selectedOfficer?.status !== 'APPROVED'"),
  'useAdminTA must prevent editing when record is APPROVED'
);

console.log('✅ TA Submit to Incharge & Incharge Unlocking UI Tests Passed 100%!');
