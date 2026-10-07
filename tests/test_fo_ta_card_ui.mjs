import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';

console.log('🧪 Testing FO Travel Allowance Card Component & App Wiring...');

assert.ok(existsSync('dfy-frontend/src/components/Fo/TravelAllowanceCard.jsx'), 'TravelAllowanceCard.jsx must exist');

const cardSrc = readFileSync('dfy-frontend/src/components/Fo/TravelAllowanceCard.jsx', 'utf8');
const appSrc = readFileSync('dfy-frontend/src/App.jsx', 'utf8');

// 1. Privacy guard during review
assert.ok(
  cardSrc.includes('Verification in Progress') || cardSrc.includes('Under Review') || cardSrc.includes('UNDER_REVIEW'),
  'Card must have under review privacy state'
);

// 2. Net Payable and rate display
assert.ok(
  cardSrc.includes('Net Payable') || cardSrc.includes('final_payable_amount'),
  'Card must display net payable amount'
);
assert.ok(cardSrc.includes('rate_per_km'), 'Card must display dynamic rate');

// 3. 24h dispute trigger and modal
assert.ok(
  cardSrc.includes('Raise Dispute') || cardSrc.includes('dispute'),
  'Card must have dispute trigger'
);

// 4. App.jsx renders TravelAllowanceCard
assert.ok(appSrc.includes('TravelAllowanceCard'), 'App.jsx must import and render TravelAllowanceCard');

console.log('✅ FO Travel Allowance Card Component & App Wiring Tests Passed!');
