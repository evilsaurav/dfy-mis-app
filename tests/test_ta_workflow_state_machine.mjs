import assert from 'node:assert';

function getVisibleActions(role, canManageTa, districtStatus) {
  const actions = [];
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const isSubAdmin = role === 'SUB_ADMIN' || role === 'MIS';
  const isIncharge = role === 'MAIN_INCHARGE' || isSuperAdmin;

  // Sub-Admin / MIS actions
  if ((isSubAdmin && canManageTa) || isSuperAdmin) {
    if (districtStatus === 'DRAFT' || districtStatus === 'REVERTED') {
      actions.push('SUBMIT_ROSTER');
    }
  }

  // Incharge / Super Admin actions
  if (isIncharge) {
    if (districtStatus === 'SUBMITTED' || districtStatus === 'DISPUTED') {
      actions.push('APPROVE_ROSTER');
      actions.push('REVERT_ROSTER');
    } else if (districtStatus === 'APPROVED') {
      actions.push('REVERT_ROSTER'); // Emergency unlock
    }
  }

  return actions;
}

// 1. Sub-Admin on DRAFT
assert.deepStrictEqual(getVisibleActions('SUB_ADMIN', true, 'DRAFT'), ['SUBMIT_ROSTER']);

// 2. Sub-Admin without permission on DRAFT
assert.deepStrictEqual(getVisibleActions('SUB_ADMIN', false, 'DRAFT'), []);

// 3. Sub-Admin on SUBMITTED
assert.deepStrictEqual(getVisibleActions('SUB_ADMIN', true, 'SUBMITTED'), []);

// 4. Incharge on SUBMITTED
assert.deepStrictEqual(getVisibleActions('MAIN_INCHARGE', false, 'SUBMITTED'), ['APPROVE_ROSTER', 'REVERT_ROSTER']);

// 5. Incharge on DRAFT
assert.deepStrictEqual(getVisibleActions('MAIN_INCHARGE', false, 'DRAFT'), []);

// 6. Super Admin on APPROVED (can revert to fix mistake)
assert.deepStrictEqual(getVisibleActions('SUPER_ADMIN', true, 'APPROVED'), ['REVERT_ROSTER']);

// 7. Incharge on DISPUTED
assert.deepStrictEqual(getVisibleActions('MAIN_INCHARGE', false, 'DISPUTED'), ['APPROVE_ROSTER', 'REVERT_ROSTER']);

console.log("✅ All workflow state machine tests passed!");
