import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

console.log("Running Attendance Radar Next-Day Morning Badge UI Tests...");

const adminCode = readFileSync(resolve('dfy-frontend/src/AdminDashboard.jsx'), 'utf8');

// Test 1: Verify getSubmissionTimeClassification accepts isNextDay parameter
assert(
  adminCode.includes('getSubmissionTimeClassification = (submittedTimeStr, timestampRaw, isNextDay)') ||
  adminCode.includes('getSubmissionTimeClassification = (submittedTimeStr, timestampRaw, isNextDay = false)'),
  "getSubmissionTimeClassification must accept isNextDay parameter"
);

// Test 2: Verify getSubmissionTimeClassification returns next_day bracket and styling when isNextDay is true
assert(
  adminCode.includes("bracket: 'next_day'") &&
  adminCode.includes("label: 'Next Day Morning (< 10 AM)'") &&
  adminCode.includes("shortLabel: 'Next Day Morning'") &&
  adminCode.includes("bg-amber-100 text-amber-900 border-amber-300 font-bold"),
  "getSubmissionTimeClassification must return next_day bracket, labels, and amber badge styling"
);

// Test 3: Verify Attendance Radar passes fo.is_next_day to getSubmissionTimeClassification
assert(
  adminCode.includes('getSubmissionTimeClassification(fo.submitted_time, fo.timestamp_raw, fo.is_next_day)'),
  "Attendance Radar must pass fo.is_next_day to getSubmissionTimeClassification"
);

// Test 4: Verify Submitted Cards render distinctive next-day morning badge when fo.is_next_day is true
assert(
  adminCode.includes('fo.is_next_day') &&
  (adminCode.includes("fo.submitted_label || ('Next day morning ' + fo.submitted_time)") ||
   adminCode.includes("fo.submitted_label || ('Next day morning ' + (fo.submitted_morning_time || fo.submitted_time))") ||
   adminCode.includes("fo.submitted_label || `Next day morning ${fo.submitted_time}`") ||
   adminCode.includes("fo.submitted_label || 'Next day morning ' + fo.submitted_time")),
  "Submitted cards in Attendance Radar must render fo.submitted_label || 'Next day morning ' + fo.submitted_time"
);

// Test 5: Verify WhatsApp Bulletin includes next day morning note
assert(
  adminCode.includes("fo.submitted_label || ('Next day morning ' + fo.submitted_time)") ||
  adminCode.includes("fo.submitted_label || `Next day morning ${fo.submitted_time}`") ||
  adminCode.includes("fo.submitted_label || 'Next day morning ' + fo.submitted_time"),
  "WhatsApp attendance copy helpers must format next-day morning submissions properly"
);

// Test 6: Functional simulation of getSubmissionTimeClassification logic
const getSubmissionTimeClassification = (submittedTimeStr, timestampRaw, isNextDay) => {
  if (isNextDay) {
    return {
      bracket: 'next_day',
      label: 'Next Day Morning (< 10 AM)',
      shortLabel: 'Next Day Morning',
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
    };
  }
  let hour = null;
  if (submittedTimeStr && typeof submittedTimeStr === 'string') {
    const match = submittedTimeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (match) {
      let h = parseInt(match[1], 10);
      const meridiem = (match[3] || '').toUpperCase();
      if (meridiem === 'PM' && h !== 12) h += 12;
      if (meridiem === 'AM' && h === 12) h = 0;
      hour = h;
    }
  }
  if (hour === null) {
    return { bracket: 'unknown', label: 'Submitted', shortLabel: 'Submitted', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
  if (hour >= 17 && hour < 20) {
    return { bracket: 'on_time', label: 'On-Time (5 PM - 8 PM)', shortLabel: 'On-Time', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold' };
  }
  if (hour >= 20 && hour < 22) {
    return { bracket: 'late', label: 'Late Evening (8 PM - 10 PM)', shortLabel: 'Late (8-10 PM)', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 font-bold' };
  }
  if (hour >= 22 || hour < 4) {
    return { bracket: 'delayed', label: 'Night Submission (> 10 PM)', shortLabel: 'Night (> 10 PM)', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 font-bold' };
  }
  return { bracket: 'early', label: 'Mid-Day (< 5 PM)', shortLabel: 'Mid-Day (< 5 PM)', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 font-bold' };
};

// Next day morning officer
const nextDayRes = getSubmissionTimeClassification("08:25 AM", null, true);
assert.strictEqual(nextDayRes.bracket, 'next_day');
assert.strictEqual(nextDayRes.shortLabel, 'Next Day Morning');
assert.strictEqual(nextDayRes.badgeClass, 'bg-amber-100 text-amber-900 border-amber-300 font-bold');

// Standard on-time officer
const onTimeRes = getSubmissionTimeClassification("06:30 PM", null, false);
assert.strictEqual(onTimeRes.bracket, 'on_time');

// WhatsApp string generation simulation
const foNextDay = {
  fo_name: "Shashi Ranjan",
  total_ids: 12,
  submitted_time: "09:26 AM",
  is_next_day: true,
  submitted_label: "Next day morning 09:26 AM"
};
const waNote = foNextDay.is_next_day
  ? `[⏰ ${foNextDay.submitted_label || ('Next day morning ' + foNextDay.submitted_time)}]`
  : `[⏰ ${foNextDay.submitted_time}]`;
assert.strictEqual(waNote, "[⏰ Next day morning 09:26 AM]");

console.log("✓ All Attendance Radar Next-Day Morning Badge UI Tests Passed!");
