import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modalsSrc = readFileSync(path.join(__dirname, '../dfy-frontend/src/hooks/useAdminModals.js'), 'utf8');
const adminModalsSrc = readFileSync(path.join(__dirname, '../dfy-frontend/src/components/Admin/AdminModals.jsx'), 'utf8');

let failures = 0;

// 1. Checks that useAdminModals.js includes NOTIF_TRAY_24_HEADERS with canonical 24 columns
const expectedHeaders = [
  "Sl No", "FO Name", "Date of Reporting (DD-MM-YYYY)", "District",
  "TBU Name", "Mapped PHI Name", "Patient's Name", "ID",
  "Vill", "Panchayat", "Block", "District",
  "Land Mark", "Mob No", "X-ray Done (Y/N)", "Sample Collection (Y/N)",
  "Report Delivered (Y/N)", "DM (Y/N)", "HIV (Y/N)", "Drug Source (NTEP/Private)",
  "Others", "Address", "Diagnosis Date", "Enrollment Date"
];

if (!modalsSrc.includes('NOTIF_TRAY_24_HEADERS')) {
  console.error('FAIL: useAdminModals.js missing NOTIF_TRAY_24_HEADERS');
  failures++;
} else {
  for (const h of expectedHeaders) {
    if (!modalsSrc.includes(`"${h}"`) && !modalsSrc.includes(`'${h}'`)) {
      console.error(`FAIL: NOTIF_TRAY_24_HEADERS missing canonical column "${h}"`);
      failures++;
    }
  }
}

// 2. Checks build24ColTsv exists and maps 24 columns
if (!modalsSrc.includes('build24ColTsv')) {
  console.error('FAIL: useAdminModals.js missing build24ColTsv');
  failures++;
}

// 3. Checks notifTrayData returns all required properties:
//    allItems, lastDayItems, lastDayIds, allIds, latestDateRaw, latestDateFormatted, uniqueFOCount
const notifTrayDataMatch = modalsSrc.match(/notifTrayData\s*=\s*useMemo\s*\(\s*\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[([\s\S]*?)\]\);/);
if (!notifTrayDataMatch) {
  console.error('FAIL: Could not locate notifTrayData useMemo in useAdminModals.js');
  failures++;
} else {
  const notifMemoBody = notifTrayDataMatch[1];
  const requiredKeys = [
    'allItems',
    'lastDayItems',
    'lastDayIds',
    'allIds',
    'latestDateRaw',
    'latestDateFormatted',
    'uniqueFOCount'
  ];
  for (const key of requiredKeys) {
    if (!notifMemoBody.includes(key)) {
      console.error(`FAIL: notifTrayData useMemo missing required property: ${key}`);
      failures++;
    }
  }

  // 4. Verify allIds and lastDayIds map to string IDs (not objects)
  const stringIdMapping = notifMemoBody.includes('.map(i => i.id)') || notifMemoBody.includes('.map(item => item.id)');
  if (!stringIdMapping) {
    console.error('FAIL: notifTrayData does not extract string IDs using .map(i => i.id)');
    failures++;
  }

  // Verify dependencies include rawRecords, notifTrayDistricts, currentUser
  const deps = notifTrayDataMatch[2];
  if (!deps.includes('rawRecords') || !deps.includes('notifTrayDistricts') || !deps.includes('currentUser')) {
    console.error(`FAIL: notifTrayData dependencies should include rawRecords, notifTrayDistricts, and currentUser; got [${deps}]`);
    failures++;
  }
}

// 5. Functional check of build24ColTsv if present
try {
  const headersMatch = modalsSrc.match(/const NOTIF_TRAY_24_HEADERS\s*=\s*(\[[\s\S]*?\]);/);
  const fnMatch = modalsSrc.match(/const build24ColTsv\s*=\s*(\([\s\S]*?=>\s*\{[\s\S]*?\n\s*\});/);
  if (headersMatch && fnMatch) {
    const NOTIF_TRAY_24_HEADERS = eval(headersMatch[1]);
    const build24ColTsv = eval(fnMatch[1]);

    if (NOTIF_TRAY_24_HEADERS.length !== 24) {
      console.error(`FAIL: NOTIF_TRAY_24_HEADERS length is ${NOTIF_TRAY_24_HEADERS.length}, expected 24`);
      failures++;
    }

    const testItems = [
      { id: 'PAT-001', fo_name: 'Ramesh Kumar', date_formatted: '01-10-2026', district: 'Patna' },
      { id: 'PAT-002', fo_name: 'Suresh Singh', date_formatted: '02-10-2026', district: 'Gaya' }
    ];
    const tsv = build24ColTsv(testItems);
    const lines = tsv.split('\n');
    if (lines.length !== 3) {
      console.error(`FAIL: build24ColTsv expected 3 lines for 2 items, got ${lines.length}`);
      failures++;
    }
    const headerCols = lines[0].split('\t');
    if (headerCols.length !== 24) {
      console.error(`FAIL: TSV header has ${headerCols.length} columns, expected 24`);
      failures++;
    }
    const row1Cols = lines[1].split('\t');
    if (row1Cols.length !== 24) {
      console.error(`FAIL: TSV row 1 has ${row1Cols.length} columns, expected 24`);
      failures++;
    }
    if (row1Cols[0] !== '1' || row1Cols[1] !== 'Ramesh Kumar' || row1Cols[2] !== '01-10-2026' || row1Cols[3] !== 'Patna' || row1Cols[7] !== 'PAT-001') {
      console.error(`FAIL: TSV row 1 column mapping mismatch:`, row1Cols.slice(0, 8));
      failures++;
    }
  }
} catch (e) {
  console.error('FAIL: Functional test of build24ColTsv failed with error:', e.message);
  failures++;
}

// 6. Check useAdminModals return statement exports notifTrayData and build24ColTsv
const returnBlockIdx = modalsSrc.lastIndexOf('return {');
if (returnBlockIdx === -1) {
  console.error('FAIL: useAdminModals.js missing return block');
  failures++;
} else {
  const returnBlock = modalsSrc.slice(returnBlockIdx);
  if (!returnBlock.includes('notifTrayData')) {
    console.error('FAIL: useAdminModals return block missing notifTrayData');
    failures++;
  }
  if (!returnBlock.includes('build24ColTsv')) {
    console.error('FAIL: useAdminModals return block missing build24ColTsv');
    failures++;
  }
  if (!returnBlock.includes('copyToClipboardWithFallback')) {
    console.error('FAIL: useAdminModals return block missing copyToClipboardWithFallback');
    failures++;
  }
  if (!returnBlock.includes('notifTrayDistricts')) {
    console.error('FAIL: useAdminModals return block missing notifTrayDistricts');
    failures++;
  }
  if (!returnBlock.includes('NOTIF_TRAY_24_HEADERS')) {
    console.error('FAIL: useAdminModals return block missing NOTIF_TRAY_24_HEADERS');
    failures++;
  }
}

// 7. Check AdminModals.jsx passes props to NotifTrayModal
if (!adminModalsSrc.includes('notifTrayData={props.notifTrayData}') && !adminModalsSrc.includes('notifTrayData=')) {
  console.error('FAIL: AdminModals.jsx missing notifTrayData prop on NotifTrayModal');
  failures++;
}
if (!adminModalsSrc.includes('build24ColTsv={props.build24ColTsv}') && !adminModalsSrc.includes('build24ColTsv=')) {
  console.error('FAIL: AdminModals.jsx missing build24ColTsv prop on NotifTrayModal');
  failures++;
}
if (!adminModalsSrc.includes('copyToClipboardWithFallback={props.copyToClipboardWithFallback}') && !adminModalsSrc.includes('copyToClipboardWithFallback=')) {
  console.error('FAIL: AdminModals.jsx missing copyToClipboardWithFallback prop on NotifTrayModal');
  failures++;
}
if (!adminModalsSrc.includes('notifTrayDistricts={props.notifTrayDistricts') && !adminModalsSrc.includes('notifTrayDistricts=')) {
  console.error('FAIL: AdminModals.jsx missing notifTrayDistricts prop on NotifTrayModal');
  failures++;
}

if (failures === 0) {
  console.log('PASS: NotifTray data flow and 24-column TSV verified successfully');
  process.exit(0);
} else {
  console.error(`FAIL: ${failures} NotifTray data flow issues found`);
  process.exit(1);
}
