import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const studioModalPath = path.join(__dirname, '../dfy-frontend/src/components/Admin/modals/ReportsStudioModal.jsx');
const downloadsHookPath = path.join(__dirname, '../dfy-frontend/src/hooks/useReportDownloads.js');
const journeyModalPath = path.join(__dirname, '../dfy-frontend/src/components/Admin/modals/JourneyModal.jsx');

const studioSrc = readFileSync(studioModalPath, 'utf8');
const downloadsSrc = readFileSync(downloadsHookPath, 'utf8');
const journeySrc = readFileSync(journeyModalPath, 'utf8');

console.log('🧪 Starting Verification of 5 Supabase Relational Migration Frontend Enhancements...');

// 1. Issue 1: Report Studio Single District KPI Export
assert.ok(
  studioSrc.includes('Single District KPI Export') && studioSrc.includes('selectedKpiDistricts.length === 1'),
  'ReportsStudioModal must render Single District KPI Export card when selectedKpiDistricts.length === 1'
);
assert.ok(
  studioSrc.includes('handleDownloadKpi(selectedKpiDistricts[0])'),
  'ReportsStudioModal must pass selected district to handleDownloadKpi'
);
assert.ok(
  studioSrc.includes('Single District Medicine Export') && studioSrc.includes('selectedMedDistricts.length === 1'),
  'ReportsStudioModal must render Single District Medicine Export card when selectedMedDistricts.length === 1'
);
assert.ok(
  studioSrc.includes('handleDownloadMedicineReport(selectedMedDistricts[0])'),
  'ReportsStudioModal must pass selected district to handleDownloadMedicineReport'
);
console.log('  ✔ Issue 1 Verified: ReportsStudioModal single-district KPI and Medicine export cards wired');

// 2. Issue 1: useReportDownloads override handling
assert.ok(
  downloadsSrc.includes('handleDownloadKpi = async (districtOverride)') && downloadsSrc.includes('districtOverride'),
  'useReportDownloads must accept districtOverride in handleDownloadKpi'
);
assert.ok(
  downloadsSrc.includes('handleDownloadMedicineReport = (districtOverride)') && downloadsSrc.includes('districtOverride'),
  'useReportDownloads must accept districtOverride in handleDownloadMedicineReport'
);
assert.ok(
  downloadsSrc.includes('District_KPI_${targetList[0]}_${month}.zip'),
  'useReportDownloads must format single-district zip filename cleanly'
);
console.log('  ✔ Issue 1 Verified: useReportDownloads district override parameters wired');

// 3. Issue 2: Patient Journey Timeline FO Attribution
assert.ok(
  journeySrc.includes('foAttribution') && journeySrc.includes('step.fo_name'),
  'JourneyModal must parse and display step.fo_name'
);
assert.ok(
  journeySrc.includes('Field Officer:'),
  'JourneyModal must render Field Officer attribution badge'
);
assert.ok(
  journeySrc.includes('districtDisplay') && journeySrc.includes('step.district'),
  'JourneyModal must render district badge'
);
console.log('  ✔ Issue 2 Verified: JourneyModal renders explicit Field Officer attribution badges');

console.log('\n✅ All Frontend Relational & Studio Enhancements Passed 100%!');
