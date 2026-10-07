import { buildAttendanceKey, canonicalizeDistrict, normalizeStaffKey } from '../dfy-frontend/src/utils/districtHelpers.js';

console.log('🧪 Running Attendance Key Normalization Test Suite...');

// 1. East Champaran tests
const k1 = buildAttendanceKey('East Champaran', 'AMIT KUMAR');
const k2 = buildAttendanceKey('east champaran', 'Amit Kumar');
const k3 = buildAttendanceKey('East Champaran', 'amit  kumar ');
const k4 = buildAttendanceKey('purba champaran', 'AMIT KUMAR');
const k5 = buildAttendanceKey('purbi champaran', 'AMIT KUMAR');
const k6 = buildAttendanceKey('motihari', 'AMIT KUMAR');

if (k1 !== 'eastchamparan_amitkumar' || k2 !== 'eastchamparan_amitkumar' || k3 !== 'eastchamparan_amitkumar' ||
    k4 !== 'eastchamparan_amitkumar' || k5 !== 'eastchamparan_amitkumar' || k6 !== 'eastchamparan_amitkumar') {
  console.error('❌ East Champaran normalization failed!');
  process.exit(1);
}
console.log('✅ East Champaran canonical and case/space variations all resolve to:', k1);

// 2. Single word districts tests
const kg1 = buildAttendanceKey('Gaya', 'Ravi Shankar');
const kg2 = buildAttendanceKey('gaya', 'RAVI SHANKAR');
if (kg1 !== 'gaya_ravishankar' || kg2 !== 'gaya_ravishankar') {
  console.error('❌ Gaya normalization failed!');
  process.exit(1);
}
console.log('✅ Gaya resolves to:', kg1);

const kp1 = buildAttendanceKey('Patna', 'Sunil Kumar');
if (kp1 !== 'patna_sunilkumar') {
  console.error('❌ Patna normalization failed!');
  process.exit(1);
}
console.log('✅ Patna resolves to:', kp1);

// 3. Simulation of chronicDefaulters logic
const attendanceDate = '2026-10-06';
const staffDirectory = {
  'East Champaran': ['AMIT KUMAR', 'ANIL KUMAR', 'SOURABH KUMAR'],
  'Gaya': ['RAVI SHANKAR', 'MANOJ KUMAR']
};

const rawRecords = [
  // Amit Kumar submitted in East Champaran on 2026-10-06 and 2026-10-05
  { date_of_reporting: '2026-10-06', working_place: 'East Champaran', fo_name: 'AMIT KUMAR' },
  { date_of_reporting: '2026-10-05', working_place: 'East Champaran', fo_name: 'AMIT KUMAR' },
  // Ravi Shankar submitted in Gaya
  { date_of_reporting: '2026-10-06', working_place: 'Gaya', fo_name: 'RAVI SHANKAR' },
  { date_of_reporting: '2026-10-05', working_place: 'Gaya', fo_name: 'RAVI SHANKAR' },
];

const attendance = {
  date: '2026-10-06',
  on_leave_fos: [
    { district: 'East Champaran', fo_name: 'ANIL KUMAR', status: 'leave' }
  ]
};

// Logic from useAdminAttendance.js:
const submissionSet = new Set();
(rawRecords || []).forEach(r => {
  const d = String(r.date_of_reporting || r.date || '').split('T')[0];
  if (d && r.working_place && r.fo_name) {
    submissionSet.add(`${buildAttendanceKey(r.working_place, r.fo_name)}_${d}`);
  }
});

const targetDateObj = new Date(attendanceDate);
const checkDates = [];
for (let i = 0; i <= 5; i++) {
  const d = new Date(targetDateObj);
  d.setDate(d.getDate() - i);
  checkDates.push(d.toISOString().slice(0, 10));
}

const onLeaveSet = new Set(
  (attendance?.on_leave_fos || []).map(l => buildAttendanceKey(l.district, l.fo_name))
);

const defaulters = [];
Object.entries(staffDirectory).forEach(([rawDist, names]) => {
  const cDist = canonicalizeDistrict(rawDist);
  (names || []).forEach(name => {
    const cleanName = String(name || '').trim();
    const foKey = buildAttendanceKey(cDist, cleanName);

    if (onLeaveSet.has(foKey)) return;

    let consecutiveMissed = 0;
    const missedDates = [];
    for (const cd of checkDates) {
      const dayOfWeek = new Date(cd).getDay();
      if (dayOfWeek === 0) continue; // Skip Sunday

      const hasReport = submissionSet.has(`${foKey}_${cd}`);
      if (!hasReport) {
        consecutiveMissed++;
        missedDates.push(cd);
      } else {
        break;
      }
    }

    if (consecutiveMissed >= 2) {
      defaulters.push({ district: cDist, fo_name: cleanName, consecutiveDays: consecutiveMissed });
    }
  });
});

console.log('Detected Defaulters:', defaulters);
if (defaulters.length !== 2) {
  console.error(`❌ Expected 2 defaulters (SOURABH KUMAR & MANOJ KUMAR), got ${defaulters.length}`);
  process.exit(1);
}
if (!defaulters.some(d => d.district === 'East Champaran' && d.fo_name === 'SOURABH KUMAR')) {
  console.error('❌ SOURABH KUMAR missing from defaulters!');
  process.exit(1);
}
if (!defaulters.some(d => d.district === 'Gaya' && d.fo_name === 'MANOJ KUMAR')) {
  console.error('❌ MANOJ KUMAR missing from defaulters!');
  process.exit(1);
}
if (defaulters.some(d => d.fo_name === 'AMIT KUMAR')) {
  console.error('❌ AMIT KUMAR incorrectly marked as defaulter (ghost defaulter)!');
  process.exit(1);
}
if (defaulters.some(d => d.fo_name === 'ANIL KUMAR')) {
  console.error('❌ ANIL KUMAR on leave incorrectly marked as defaulter!');
  process.exit(1);
}
if (defaulters.some(d => d.fo_name === 'RAVI SHANKAR')) {
  console.error('❌ RAVI SHANKAR incorrectly marked as defaulter!');
  process.exit(1);
}

// 4. Test deriveAttendanceFromRecords local fallback path
const staffRoster = [
  { district: 'East Champaran', fo_name: 'AMIT KUMAR' },
  { district: 'East Champaran', fo_name: 'ANIL KUMAR' },
  { district: 'East Champaran', fo_name: 'SOURABH KUMAR' },
  { district: 'Gaya', fo_name: 'RAVI SHANKAR' },
  { district: 'Gaya', fo_name: 'MANOJ KUMAR' }
];

const reportsMap = {};
rawRecords.filter(r => r.date_of_reporting === '2026-10-06').forEach(r => {
  const dist = canonicalizeDistrict(r.working_place || '');
  const key = buildAttendanceKey(dist, r.fo_name);
  reportsMap[key] = { ...r, submission_count: 2 };
});

const leavesMap = {};
(attendance.on_leave_fos || []).forEach(l => {
  leavesMap[buildAttendanceKey(l.district, l.fo_name)] = l;
});

const submittedFull = [];
const submittedPartial = [];
const onLeaveFos = [];
const missingFos = [];

staffRoster.forEach(s => {
  const key = buildAttendanceKey(s.district, s.fo_name);
  if (reportsMap[key]) {
    submittedFull.push(s);
  } else if (leavesMap[key]) {
    onLeaveFos.push(s);
  } else {
    missingFos.push(s);
  }
});

console.log('Local derivation summary:');
console.log('  submittedFull:', submittedFull.map(s => `${s.district}: ${s.fo_name}`));
console.log('  onLeaveFos:', onLeaveFos.map(s => `${s.district}: ${s.fo_name}`));
console.log('  missingFos:', missingFos.map(s => `${s.district}: ${s.fo_name}`));

if (submittedFull.length !== 2 || !submittedFull.some(s => s.fo_name === 'AMIT KUMAR') || !submittedFull.some(s => s.fo_name === 'RAVI SHANKAR')) {
  console.error('❌ submittedFull derivation mismatch!');
  process.exit(1);
}
if (onLeaveFos.length !== 1 || onLeaveFos[0].fo_name !== 'ANIL KUMAR') {
  console.error('❌ onLeaveFos derivation mismatch!');
  process.exit(1);
}
if (missingFos.length !== 2 || !missingFos.some(s => s.fo_name === 'SOURABH KUMAR') || !missingFos.some(s => s.fo_name === 'MANOJ KUMAR')) {
  console.error('❌ missingFos derivation mismatch!');
  process.exit(1);
}

console.log('🎉 ALL ATTENDANCE KEY NORMALIZATION TESTS PASSED 100%!');
