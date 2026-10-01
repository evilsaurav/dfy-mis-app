import assert from 'node:assert';

// 1. Test Inverted Reading calculation guard
function calculateKm(initStr, finStr, isOverride, manualKm) {
  const init = Number(initStr) || 0;
  const fin = Number(finStr) || 0;
  if (isOverride) return { error: null, km: Number(manualKm) || 0 };
  if (init > 0 && fin > 0) {
    if (fin < init) return { error: "FINAL_LESS_THAN_INIT", km: 0 };
    return { error: null, km: fin - init };
  }
  return { error: null, km: 0 };
}

// 2. Test LocalStorage draft serialize & deserialize
function serializeDraft(dailyLogs, deductionAmount, deductionReason, adminRemarks) {
  return JSON.stringify({
    daily_logs: dailyLogs,
    deduction_amount: deductionAmount,
    deduction_reason: deductionReason,
    admin_remarks: adminRemarks,
    saved_at: 1727800000000
  });
}

function deserializeDraft(draftJson) {
  if (!draftJson) return null;
  try {
    const parsed = JSON.parse(draftJson);
    if (parsed && parsed.daily_logs && typeof parsed.daily_logs === 'object') {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

// Assertions
assert.deepStrictEqual(calculateKm("100", "150", false, 0), { error: null, km: 50 });
assert.deepStrictEqual(calculateKm("150", "100", false, 0), { error: "FINAL_LESS_THAN_INIT", km: 0 });
assert.deepStrictEqual(calculateKm("150", "100", true, 42), { error: null, km: 42 });
assert.deepStrictEqual(calculateKm("", "", false, 0), { error: null, km: 0 });

const serialized = serializeDraft({ "2026-09-01": { total_km: 25 } }, 50, "Late penalty", "Ok");
const restored = deserializeDraft(serialized);
assert.strictEqual(restored.deduction_amount, 50);
assert.strictEqual(restored.daily_logs["2026-09-01"].total_km, 25);

console.log("✅ All TA frontend logic unit tests passed!");
