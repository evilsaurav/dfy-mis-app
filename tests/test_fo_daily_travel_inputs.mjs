import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';

console.log('🧪 Testing Field Officer Daily Report Travel Allowance & Odometer Inputs...');

assert.ok(existsSync('dfy-frontend/src/App.jsx'), 'App.jsx must exist');
const appSrc = readFileSync('dfy-frontend/src/App.jsx', 'utf8');

// 1. Initial State has morning_km and evening_km
assert.ok(
  appSrc.includes('morning_km: ""') && appSrc.includes('evening_km: ""'),
  'formData initial state must have morning_km and evening_km'
);

// 2. FO Form UI has dedicated Bike Travel / Odometer inputs
assert.ok(
  appSrc.includes('name="morning_km"') || appSrc.includes('id="morning_km"'),
  'App.jsx must render an input for morning_km'
);
assert.ok(
  appSrc.includes('name="evening_km"') || appSrc.includes('id="evening_km"'),
  'App.jsx must render an input for evening_km'
);

// 3. Payload serialization in submitReport converts to Number
assert.ok(
  appSrc.includes('morning_km:') && (appSrc.includes('Number(formData.morning_km)') || appSrc.includes('mKmVal')),
  'submitReport must convert morning_km to number'
);
assert.ok(
  appSrc.includes('evening_km:') && (appSrc.includes('Number(formData.evening_km)') || appSrc.includes('eKmVal')),
  'submitReport must convert evening_km to number'
);

// 4. Strict Work Activity Rule: Travel readings alone cannot submit report; must have ID, doctor visit, or remark
assert.ok(
  appSrc.includes('if (totalCount === 0 && !hasVisited && !hasRemark)'),
  'Form validation must require patient ID, doctor visit, or remark (travel alone cannot submit)'
);

// 5. WhatsApp report generator includes bike travel details
assert.ok(
  appSrc.includes('Bike Travel') || appSrc.includes('Morning Reading'),
  'generateWhatsAppText must include bike travel details'
);

// 6. ReviewModal displays bike odometer details
assert.ok(
  appSrc.includes('Bike Odometer Reading') || appSrc.includes('formData.morning_km'),
  'ReviewModal should render bike travel info'
);

// 7. Generous spacer ensures Doctor / Chemist box does not get covered by sticky submit bar
assert.ok(
  appSrc.includes('h-60') || appSrc.includes('h-64') || appSrc.includes('h-72') || appSrc.includes('pb-64'),
  'Must have generous spacer so Doctor Visits box is not hidden behind sticky action bar'
);

console.log('✅ Field Officer Daily Report Travel Inputs Tests Passed!');
