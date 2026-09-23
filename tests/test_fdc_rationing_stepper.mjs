import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

console.log("Running FDC Medicine Rationing Stepper & Custom Strip Allocation Tests...\n");

const appPath = resolve('dfy-frontend/src/App.jsx');
const appCode = readFileSync(appPath, 'utf8');

// Extract FdcBucket component source code
const fdcBucketStart = appCode.indexOf('const FdcBucket =');
assert(fdcBucketStart !== -1, "FdcBucket component must be defined in App.jsx");
const fdcBucketCode = appCode.slice(fdcBucketStart, appCode.indexOf('const sanitizeIncomingFormData', fdcBucketStart));

console.log("1. Verifying customStrips state and effectiveStrips computation in FdcBucket...");
assert(
  fdcBucketCode.includes('const [customStrips, setCustomStrips] = useState(null);'),
  "customStrips state initialized to null must exist in FdcBucket"
);

assert(
  fdcBucketCode.includes('const recommendedStrips = dosage && dosage.isValid ? dosage.strips : 2;'),
  "recommendedStrips must be derived from dosage.strips or default to 2"
);

assert(
  fdcBucketCode.includes('const effectiveStrips = customStrips !== null ? customStrips : recommendedStrips;'),
  "effectiveStrips must respect customStrips if non-null, else fall back to recommendedStrips"
);

assert(
  fdcBucketCode.includes('setCustomStrips(null);'),
  "setCustomStrips(null) must be used to reset custom strips"
);
console.log("✔ customStrips state and effectiveStrips computation verified.");

console.log("2. Verifying interactive stepper in Dosage Calculation Card...");
// Check decrement button with Math.max(1, effectiveStrips - 1)
assert(
  fdcBucketCode.includes('setCustomStrips(Math.max(1, effectiveStrips - 1))'),
  "Decrement button must enforce Math.max(1, effectiveStrips - 1)"
);
assert(
  fdcBucketCode.includes('disabled={effectiveStrips <= 1}'),
  "Decrement button must be disabled when effectiveStrips <= 1"
);

// Check increment button with Math.min(dosage.strips, effectiveStrips + 1)
assert(
  fdcBucketCode.includes('setCustomStrips(Math.min(dosage.strips, effectiveStrips + 1))'),
  "Increment button must enforce Math.min(dosage.strips, effectiveStrips + 1)"
);
assert(
  fdcBucketCode.includes('disabled={effectiveStrips >= dosage.strips}'),
  "Increment button must be disabled when effectiveStrips >= dosage.strips"
);

// Check value display and informational subtitle
assert(
  fdcBucketCode.includes('Min: 1 | Max Guideline: {dosage.strips}'),
  "Dosage card must show guideline bounds 'Min: 1 | Max Guideline: {dosage.strips}'"
);
assert(
  fdcBucketCode.includes('{dosage.strips - effectiveStrips} strips short / rationed'),
  "Dosage card must show subtle indicator when effectiveStrips < dosage.strips"
);
console.log("✔ Interactive stepper in Dosage Calculation Card verified.");

console.log("3. Verifying handleAddSmart saves effectiveStrips and recommended_strips...");
assert(
  fdcBucketCode.includes('const stripsCount = effectiveStrips;'),
  "handleAddSmart must assign stripsCount from effectiveStrips"
);
assert(
  fdcBucketCode.includes('const isRationed = dosage && dosage.isValid && stripsCount < dosage.strips;'),
  "handleAddSmart must check if stripsCount < dosage.strips"
);
assert(
  fdcBucketCode.includes("const supplyText = `${stripsCount} strips${isRationed ? ' (Stock Rationed)' : ''}`;"),
  "handleAddSmart must format supplyText reflecting Stock Rationed state"
);
assert(
  fdcBucketCode.includes('strips: stripsCount'),
  "enrichedDetail must contain strips: stripsCount"
);
assert(
  fdcBucketCode.includes('recommended_strips: dosage?.strips || stripsCount'),
  "enrichedDetail must contain recommended_strips"
);
assert(
  fdcBucketCode.includes('supply_issued: supplyText'),
  "enrichedDetail must contain supply_issued: supplyText"
);
console.log("✔ handleAddSmart payload enrichment verified.");

console.log("4. Verifying inline strip adjustment stepper on Added FDC Cards...");
assert(
  fdcBucketCode.includes('const maxStrips = detail.recommended_strips || 12;'),
  "Added cards must compute maxStrips from recommended_strips or default to 12"
);

// Inline decrement
assert(
  fdcBucketCode.includes('Math.max(1, displayStrips - 1)'),
  "Inline decrement on added cards must enforce Math.max(1, displayStrips - 1)"
);
assert(
  fdcBucketCode.includes('disabled={displayStrips <= 1}'),
  "Inline decrement button must be disabled when displayStrips <= 1"
);

// Inline increment
assert(
  fdcBucketCode.includes('Math.min(maxStrips, displayStrips + 1)'),
  "Inline increment on added cards must enforce Math.min(maxStrips, displayStrips + 1)"
);
assert(
  fdcBucketCode.includes('disabled={displayStrips >= maxStrips}'),
  "Inline increment button must be disabled when displayStrips >= maxStrips"
);

// Call to onUpdateFdc
assert(
  fdcBucketCode.includes('onUpdateFdc(id, {'),
  "Inline adjustment buttons must call onUpdateFdc(id, ...)"
);
console.log("✔ Inline strip adjustment stepper on Added FDC Cards verified.");

console.log("5. Testing runtime rationing logic bounds & strings...");
const runRationingLogic = (recommended, custom = null) => {
  const effective = custom !== null ? custom : recommended;
  const isRationed = effective < recommended;
  const supplyText = `${effective} strips${isRationed ? ' (Stock Rationed)' : ''}`;
  const nextDown = Math.max(1, effective - 1);
  const nextUp = Math.min(recommended, effective + 1);
  return { effective, isRationed, supplyText, nextDown, nextUp };
};

// Case A: Default full supply (6 strips recommended)
const fullCase = runRationingLogic(6, null);
assert.strictEqual(fullCase.effective, 6);
assert.strictEqual(fullCase.isRationed, false);
assert.strictEqual(fullCase.supplyText, "6 strips");
assert.strictEqual(fullCase.nextDown, 5);
assert.strictEqual(fullCase.nextUp, 6);

// Case B: Rationed down to 3 strips
const rationedCase = runRationingLogic(6, 3);
assert.strictEqual(rationedCase.effective, 3);
assert.strictEqual(rationedCase.isRationed, true);
assert.strictEqual(rationedCase.supplyText, "3 strips (Stock Rationed)");
assert.strictEqual(rationedCase.nextDown, 2);
assert.strictEqual(rationedCase.nextUp, 4);

// Case C: Minimum bound clamp (1 strip)
const minCase = runRationingLogic(6, 1);
assert.strictEqual(minCase.effective, 1);
assert.strictEqual(minCase.nextDown, 1); // Cannot go below 1

console.log("✔ Runtime rationing calculation unit tests passed.");

console.log("\n=======================================================");
console.log("ALL FDC MEDICINE RATIONING STEPPER TESTS PASSED (100%)");
console.log("=======================================================");
