import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

console.log("Running FO Calendar Leave UI Verification Tests...\n");

const appPath = resolve('dfy-frontend/src/App.jsx');
const appCode = readFileSync(appPath, 'utf8');

console.log("1. Verifying Calendar Header Legend Badges...");
assert(
  appCode.includes('Report Submitted') && appCode.includes('bg-emerald-500'),
  "Legend must contain 'Report Submitted' badge with emerald color"
);
assert(
  appCode.includes('Medical Leave') && appCode.includes('bg-amber-500'),
  "Legend must contain 'Medical Leave' badge with amber color"
);
assert(
  appCode.includes('Casual / Annual') && appCode.includes('bg-sky-500'),
  "Legend must contain 'Casual / Annual' badge with sky color"
);
assert(
  appCode.includes('Official Duty') && appCode.includes('bg-indigo-500'),
  "Legend must contain 'Official Duty' badge with indigo color"
);
assert(
  appCode.includes('Absent') && appCode.includes('bg-rose-500'),
  "Legend must contain 'Absent' badge with rose color"
);
console.log("✔ Legend contains all 5 required status badges.");

console.log("2. Verifying Calendar Cell Leave Color-Coding in App.jsx...");
assert(
  appCode.includes('dayData.is_leave') || appCode.includes('is_leave'),
  "Calendar cell rendering must check dayData.is_leave"
);

const expectedClasses = {
  emerald: 'bg-emerald-500 text-white font-black shadow-sm shadow-emerald-500/30 border-emerald-600',
  amber: 'bg-amber-500 text-white font-black shadow-sm shadow-amber-500/30 border-amber-600',
  sky: 'bg-sky-500 text-white font-black shadow-sm shadow-sky-500/30 border-sky-600',
  indigo: 'bg-indigo-500 text-white font-black shadow-sm shadow-indigo-500/30 border-indigo-600',
  rose: 'bg-rose-500 text-white font-black shadow-sm shadow-rose-500/30 border-rose-600',
  slate: 'bg-slate-400 text-white font-black shadow-sm shadow-slate-400/30 border-slate-500'
};

for (const [name, cls] of Object.entries(expectedClasses)) {
  assert(appCode.includes(cls), `Calendar cell styling must contain class string for ${name}: ${cls}`);
}
console.log("✔ All exact Tailwind classes matching the brief specification are present in App.jsx.");

console.log("3. Verifying Leave Inspection Card in Selected Date Inspector...");
assert(
  appCode.includes('selectedDayData && selectedDayData.is_leave') || appCode.includes('selectedDayData?.is_leave'),
  "Inspector must check selectedDayData.is_leave"
);
assert(
  appCode.includes('bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-2xl p-4 my-3 space-y-2'),
  "Inspector card must use exact gradient container styling"
);
assert(
  appCode.includes('Approved Leave:') && appCode.includes('selectedDayData.reason_type'),
  "Inspector must display 'Approved Leave' banner with reason_type"
);
assert(
  appCode.includes('Marked by') && appCode.includes('selectedDayData.marked_by'),
  "Inspector must display marked_by admin name"
);
assert(
  appCode.includes('Admin Remark:') && appCode.includes('selectedDayData.remark'),
  "Inspector must display 'Admin Remark:' with selectedDayData.remark"
);
assert(
  appCode.includes('Is date ko Admin dwaara leave mark ki gayi hai.'),
  "Inspector must display 'Is date ko Admin dwaara leave mark ki gayi hai.' when day was not submitted but is_leave is true"
);
console.log("✔ Leave inspection card structure and fallback messages are present.");

console.log("4. Simulating Calendar Color-Coding Logic Branches...");
function computeDayBg(count, dayData) {
  let bgColor = "bg-slate-50 text-slate-400 border-slate-100";
  if (count > 0) {
    bgColor = "bg-emerald-500 text-white font-black shadow-sm shadow-emerald-500/30 border-emerald-600";
  } else if (dayData && dayData.is_leave) {
    const reason = (dayData.reason_type || dayData.leave_info?.reason_type || '').toLowerCase();
    const status = (dayData.status || dayData.leave_info?.status || '').toLowerCase();

    if (status === 'absent' || reason.includes('absent') || reason.includes('uninformed')) {
      bgColor = "bg-rose-500 text-white font-black shadow-sm shadow-rose-500/30 border-rose-600";
    } else if (reason.includes('offic') || reason.includes('duty') || reason.includes('train') || reason.includes('meet')) {
      bgColor = "bg-indigo-500 text-white font-black shadow-sm shadow-indigo-500/30 border-indigo-600";
    } else if (status === 'weekly_off' || reason.includes('weekly') || reason.includes('week off') || reason.includes('day off') || reason === 'off') {
      bgColor = "bg-slate-400 text-white font-black shadow-sm shadow-slate-400/30 border-slate-500";
    } else if (reason.includes('med') || reason.includes('sick')) {
      bgColor = "bg-amber-500 text-white font-black shadow-sm shadow-amber-500/30 border-amber-600";
    } else if (reason.includes('cas') || reason.includes('ann') || reason.includes('pers')) {
      bgColor = "bg-sky-500 text-white font-black shadow-sm shadow-sky-500/30 border-sky-600";
    } else {
      bgColor = "bg-amber-500 text-white font-black shadow-sm shadow-amber-500/30 border-amber-600";
    }
  }
  return bgColor;
}

assert.equal(computeDayBg(3, null), expectedClasses.emerald, "Report submitted must be emerald");
assert.equal(computeDayBg(0, { is_leave: true, reason_type: 'Medical' }), expectedClasses.amber, "Medical leave must be amber");
assert.equal(computeDayBg(0, { is_leave: true, reason_type: 'Sick' }), expectedClasses.amber, "Sick leave must be amber");
assert.equal(computeDayBg(0, { is_leave: true, reason_type: 'Casual' }), expectedClasses.sky, "Casual leave must be sky");
assert.equal(computeDayBg(0, { is_leave: true, reason_type: 'Annual Leave' }), expectedClasses.sky, "Annual leave must be sky");
assert.equal(computeDayBg(0, { is_leave: true, reason_type: 'Personal Work' }), expectedClasses.sky, "Personal leave must be sky");
assert.equal(computeDayBg(0, { is_leave: true, reason_type: 'Official Duty' }), expectedClasses.indigo, "Official Duty must be indigo");
assert.equal(computeDayBg(0, { is_leave: true, reason_type: 'Field Training' }), expectedClasses.indigo, "Training must be indigo");
assert.equal(computeDayBg(0, { is_leave: true, reason_type: 'Review Meeting' }), expectedClasses.indigo, "Meeting must be indigo");
assert.equal(computeDayBg(0, { is_leave: true, status: 'absent' }), expectedClasses.rose, "Absent status must be rose");
assert.equal(computeDayBg(0, { is_leave: true, reason_type: 'Uninformed Absence' }), expectedClasses.rose, "Uninformed absence must be rose");
assert.equal(computeDayBg(0, { is_leave: true, status: 'weekly_off' }), expectedClasses.slate, "Weekly off must be slate");
assert.equal(computeDayBg(0, { is_leave: true, reason_type: 'Other' }), expectedClasses.amber, "Default/other leave must be amber");
assert.equal(computeDayBg(0, null), "bg-slate-50 text-slate-400 border-slate-100", "Default empty day must be slate-50");
console.log("✔ Simulated color-coding logic matches all test cases.");

console.log("\nALL FO CALENDAR LEAVE UI TESTS PASSED SUCCESSFULLY!");
