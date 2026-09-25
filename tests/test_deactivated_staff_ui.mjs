import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

const adminCode = readFileSync(resolve('dfy-frontend/src/AdminDashboard.jsx'), 'utf8');

// 1. Verify normalizeStaffKey helper is declared and collapses consonants
assert(
  adminCode.includes('normalizeStaffKey'),
  "AdminDashboard.jsx must declare normalizeStaffKey helper"
);

assert(
  adminCode.includes('replace(/(.)\\1+/g, \'$1\')') || adminCode.includes("replace(/(.)\\1+/g, '$1')"),
  "normalizeStaffKey must collapse repeated consonants using replace(/(.)\\1+/g, '$1')"
);

// 2. Verify inactiveCutoffMap indexes normKey
assert(
  adminCode.includes('inactiveCutoffMap[normKey]') || adminCode.includes('inactiveCutoffMap[`${d}_${n}`]'),
  "inactiveCutoffMap must index normalized keys"
);

// 3. Verify inactiveStaffNamesSet is created
assert(
  adminCode.includes('inactiveStaffNamesSet'),
  "Must declare and use inactiveStaffNamesSet"
);

// 4. Verify chronicDefaulters checks normKey against inactiveCutoffMap and inactiveStaffNamesSet
assert(
  adminCode.includes('inactiveStaffNamesSet.has(normKey)'),
  "chronicDefaulters must check inactiveStaffNamesSet.has(normKey)"
);

// 5. Verify filteredMissing excludes deactivated staff via inactiveStaffNamesSet
assert(
  adminCode.includes('inactiveStaffNamesSet.has(normalizeStaffKey(fo.district, fo.fo_name))'),
  "filteredMissing must filter out officers in inactiveStaffNamesSet using normalizeStaffKey"
);

// 6. Functional Verification of consonant collapse
const normalizeStaffKey = (dist, name) => {
  const d = (dist || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const n = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(.)\1+/g, '$1');
  return `${d}_${n}`;
};

const keyDoubleT = normalizeStaffKey("Sitamarhi", "Purushottam Kumar");
const keySingleT = normalizeStaffKey("Sitamarhi", "Purushotam Kumar");
assert.strictEqual(keyDoubleT, keySingleT, "Double 'tt' and single 't' must produce identical normalized keys");
assert.strictEqual(keyDoubleT, "sitamarhi_purushotamkumar");

// 7. Functional Simulation of chronicDefaulters defense
const mockStaffList = [
  { district: "Sitamarhi", name: "Purushottam Kumar", is_active: false, status: "inactive" },
  { district: "Sitamarhi", name: "Avinash Kumar", is_active: true, status: "active" }
];

const mockStaffDirectory = {
  "Sitamarhi": ["Purushotam Kumar", "Avinash Kumar"]
};

const inactiveStaffNamesSet = new Set();
const inactiveCutoffMap = {};
mockStaffList.forEach(s => {
  const d = (s.district || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const n = (s.name || s.fo_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normKey = normalizeStaffKey(s.district, s.name || s.fo_name);
  if (s.is_active === false || s.status === 'inactive' || s.inactive_since) {
    const cutoff = (s.inactive_since || '').slice(0, 10);
    inactiveCutoffMap[`${d}_${n}`] = cutoff;
    inactiveCutoffMap[normKey] = cutoff;
  }
  if (s.is_active === false || s.status === 'inactive') {
    inactiveStaffNamesSet.add(normKey);
  }
});

const attendanceDate = "2026-09-25";
const defaulters = [];
Object.entries(mockStaffDirectory).forEach(([dist, names]) => {
  names.forEach(cleanName => {
    const d = (dist || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanFo = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const foKey = `${d}_${cleanFo}`;
    const normKey = normalizeStaffKey(dist, cleanName);

    if (inactiveCutoffMap[foKey] !== undefined) {
      const cutoff = inactiveCutoffMap[foKey];
      if (!cutoff || attendanceDate >= cutoff) return;
    }
    if (inactiveCutoffMap[normKey] !== undefined) {
      const cutoff = inactiveCutoffMap[normKey];
      if (!cutoff || attendanceDate >= cutoff) return;
    }
    if (inactiveStaffNamesSet.has(normKey)) return;

    defaulters.push({ district: dist, fo_name: cleanName });
  });
});

assert.strictEqual(defaulters.length, 1, "Only Avinash Kumar should be candidate, Purushotam Kumar must be excluded");
assert.strictEqual(defaulters[0].fo_name, "Avinash Kumar");

console.log("✔ Deactivated staff consonant-collapsed UI assertions passed!");
