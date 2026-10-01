import assert from 'node:assert';

function getVisibleActions(role, canManageTa, districtStatus) {
  const actions = [];
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const isMainIncharge = role === 'MAIN_INCHARGE';

  // 1. Submit roster: ONLY Sub-Admin or Super Admin (NOT Main Incharge)
  if (!isMainIncharge && (isSuperAdmin || canManageTa) && (districtStatus === 'DRAFT' || districtStatus === 'REVERTED')) {
    actions.push('SUBMIT_ROSTER');
  }

  // 1.1 Direct Approve: ONLY Super Admin (testing override) on DRAFT / REVERTED
  if (isSuperAdmin && (districtStatus === 'DRAFT' || districtStatus === 'REVERTED')) {
    actions.push('DIRECT_APPROVE_ROSTER');
  }

  // 1.2 Inspection Badge for Main Incharge on DRAFT / REVERTED
  if (isMainIncharge && (districtStatus === 'DRAFT' || districtStatus === 'REVERTED')) {
    actions.push('INSPECTION_MODE');
  }

  // 2. Incharge / Super Admin actions on SUBMITTED or DISPUTED
  if (isSuperAdmin || isMainIncharge) {
    if (districtStatus === 'SUBMITTED' || districtStatus === 'DISPUTED') {
      actions.push('APPROVE_ROSTER');
      actions.push('REVERT_ROSTER');
    } else if (districtStatus === 'APPROVED') {
      actions.push('UNLOCK_REVERT_ROSTER');
    }
  }

  // 3. Status Badges for Sub-Admin
  if (!isSuperAdmin && !isMainIncharge) {
    if (districtStatus === 'SUBMITTED') {
      actions.push('AWAITING_INCHARGE_SIGNOFF');
    } else if (districtStatus === 'APPROVED') {
      actions.push('APPROVED_LOCKED');
    }
  }

  return actions;
}

function isEditingLocked(role, districtStatus) {
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const isMainIncharge = role === 'MAIN_INCHARGE';

  if (districtStatus === 'APPROVED') return true;
  if (isMainIncharge && (districtStatus === 'DRAFT' || districtStatus === 'REVERTED')) return true;
  if (!isSuperAdmin && !isMainIncharge && (districtStatus === 'SUBMITTED' || districtStatus === 'DISPUTED')) return true;
  return false;
}

// ========================
// 1. VISIBLE ACTIONS TESTS
// ========================

// 1.1 Sub-Admin on DRAFT
assert.deepStrictEqual(getVisibleActions('SUB_ADMIN', true, 'DRAFT'), ['SUBMIT_ROSTER']);

// 1.2 Sub-Admin without permission on DRAFT
assert.deepStrictEqual(getVisibleActions('SUB_ADMIN', false, 'DRAFT'), []);

// 1.3 Sub-Admin on SUBMITTED
assert.deepStrictEqual(getVisibleActions('SUB_ADMIN', true, 'SUBMITTED'), ['AWAITING_INCHARGE_SIGNOFF']);

// 1.4 Sub-Admin on APPROVED
assert.deepStrictEqual(getVisibleActions('SUB_ADMIN', true, 'APPROVED'), ['APPROVED_LOCKED']);

// 1.5 Main Incharge on DRAFT (Read-only inspection, NO submit button)
assert.deepStrictEqual(getVisibleActions('MAIN_INCHARGE', false, 'DRAFT'), ['INSPECTION_MODE']);

// 1.6 Main Incharge on REVERTED (Read-only inspection, awaiting Sub-Admin resubmit)
assert.deepStrictEqual(getVisibleActions('MAIN_INCHARGE', false, 'REVERTED'), ['INSPECTION_MODE']);

// 1.7 Main Incharge on SUBMITTED (Full approve & revert controls)
assert.deepStrictEqual(getVisibleActions('MAIN_INCHARGE', false, 'SUBMITTED'), ['APPROVE_ROSTER', 'REVERT_ROSTER']);

// 1.8 Main Incharge on DISPUTED (Full review controls)
assert.deepStrictEqual(getVisibleActions('MAIN_INCHARGE', false, 'DISPUTED'), ['APPROVE_ROSTER', 'REVERT_ROSTER']);

// 1.9 Main Incharge on APPROVED (Unlock/revert control)
assert.deepStrictEqual(getVisibleActions('MAIN_INCHARGE', false, 'APPROVED'), ['UNLOCK_REVERT_ROSTER']);

// 1.10 Super Admin on DRAFT (Can submit or direct approve)
assert.deepStrictEqual(getVisibleActions('SUPER_ADMIN', true, 'DRAFT'), ['SUBMIT_ROSTER', 'DIRECT_APPROVE_ROSTER']);

// 1.11 Super Admin on APPROVED (Can unlock/revert)
assert.deepStrictEqual(getVisibleActions('SUPER_ADMIN', true, 'APPROVED'), ['UNLOCK_REVERT_ROSTER']);

// ========================
// 2. EDITING LOCK TESTS
// ========================

// 2.1 Sub-Admin editing
assert.strictEqual(isEditingLocked('SUB_ADMIN', 'DRAFT'), false);
assert.strictEqual(isEditingLocked('SUB_ADMIN', 'REVERTED'), false);
assert.strictEqual(isEditingLocked('SUB_ADMIN', 'SUBMITTED'), true);
assert.strictEqual(isEditingLocked('SUB_ADMIN', 'APPROVED'), true);

// 2.2 Main Incharge editing
assert.strictEqual(isEditingLocked('MAIN_INCHARGE', 'DRAFT'), true); // Read-only inspection
assert.strictEqual(isEditingLocked('MAIN_INCHARGE', 'REVERTED'), true); // Read-only inspection
assert.strictEqual(isEditingLocked('MAIN_INCHARGE', 'SUBMITTED'), false); // Audit and edit mode!
assert.strictEqual(isEditingLocked('MAIN_INCHARGE', 'APPROVED'), true); // Locked once published

// 2.3 Super Admin editing
assert.strictEqual(isEditingLocked('SUPER_ADMIN', 'DRAFT'), false);
assert.strictEqual(isEditingLocked('SUPER_ADMIN', 'SUBMITTED'), false);
assert.strictEqual(isEditingLocked('SUPER_ADMIN', 'APPROVED'), true);

console.log("✅ All workflow state machine and editing lock tests passed 100%!");
