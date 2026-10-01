import assert from 'node:assert';

function getVisibleActions(role, canManageTa, districtStatus, hasSubmission = false, hasDispute = false) {
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

  // 1.2 Inspection Badge for Main Incharge on unsubmitted fresh DRAFT
  if (isMainIncharge && districtStatus === 'DRAFT' && !hasSubmission && !hasDispute) {
    actions.push('INSPECTION_MODE');
  }

  // 2. Incharge / Super Admin actions on SUBMITTED, DISPUTED, or REVERTED
  if (isSuperAdmin || isMainIncharge) {
    if (districtStatus === 'SUBMITTED' || districtStatus === 'DISPUTED' || districtStatus === 'REVERTED' || (districtStatus === 'DRAFT' && hasSubmission)) {
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

function isEditingLocked(role, districtStatus, wasSubmitted = false, hasDispute = false, isReverted = false) {
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const isMainIncharge = role === 'MAIN_INCHARGE';

  if (districtStatus === 'APPROVED' && !hasDispute) return true;
  if (isMainIncharge) {
    if (wasSubmitted || hasDispute || isReverted || districtStatus === 'SUBMITTED' || districtStatus === 'DISPUTED') {
      return false;
    }
    return districtStatus === 'DRAFT';
  }
  if (!isSuperAdmin && !isMainIncharge) {
    if (districtStatus === 'SUBMITTED' && !hasDispute && !isReverted) return true;
    return false;
  }
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

// 1.5 Main Incharge on fresh initial DRAFT (Read-only inspection, NO submit button)
assert.deepStrictEqual(getVisibleActions('MAIN_INCHARGE', false, 'DRAFT', false, false), ['INSPECTION_MODE']);

// 1.6 Main Incharge on REVERTED (Audit and review mode)
assert.deepStrictEqual(getVisibleActions('MAIN_INCHARGE', false, 'REVERTED', true, false), ['APPROVE_ROSTER', 'REVERT_ROSTER']);

// 1.7 Main Incharge on SUBMITTED (Full approve & revert controls)
assert.deepStrictEqual(getVisibleActions('MAIN_INCHARGE', false, 'SUBMITTED', true, false), ['APPROVE_ROSTER', 'REVERT_ROSTER']);

// 1.8 Main Incharge on DISPUTED (Full review controls)
assert.deepStrictEqual(getVisibleActions('MAIN_INCHARGE', false, 'DISPUTED', true, true), ['APPROVE_ROSTER', 'REVERT_ROSTER']);

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
assert.strictEqual(isEditingLocked('SUB_ADMIN', 'REVERTED', true, false, true), false);
assert.strictEqual(isEditingLocked('SUB_ADMIN', 'SUBMITTED', true, false, false), true);
assert.strictEqual(isEditingLocked('SUB_ADMIN', 'APPROVED'), true);

// 2.2 Main Incharge editing
assert.strictEqual(isEditingLocked('MAIN_INCHARGE', 'DRAFT', false, false, false), true); // Fresh initial Draft: Read-only inspection
assert.strictEqual(isEditingLocked('MAIN_INCHARGE', 'SUBMITTED', true, false, false), false); // Submitted: Audit and edit mode
assert.strictEqual(isEditingLocked('MAIN_INCHARGE', 'REVERTED', true, false, true), false); // Reverted: Audit and edit mode
assert.strictEqual(isEditingLocked('MAIN_INCHARGE', 'DISPUTED', true, true, false), false); // Disputed: Dispute audit and correction mode
assert.strictEqual(isEditingLocked('MAIN_INCHARGE', 'DRAFT', true, true, false), false); // Post-submission dispute-accepted draft: Editable!
assert.strictEqual(isEditingLocked('MAIN_INCHARGE', 'APPROVED', true, false, false), true); // Locked once published without dispute

// 2.3 Super Admin editing
assert.strictEqual(isEditingLocked('SUPER_ADMIN', 'DRAFT'), false);
assert.strictEqual(isEditingLocked('SUPER_ADMIN', 'SUBMITTED'), false);
assert.strictEqual(isEditingLocked('SUPER_ADMIN', 'APPROVED'), true);

console.log("✅ All workflow state machine and editing lock tests passed 100%!");
