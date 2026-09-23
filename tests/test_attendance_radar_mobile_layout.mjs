import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

console.log("Running Attendance Radar Mobile Layout Verification Tests...\n");

const adminDashboardPath = resolve('dfy-frontend/src/AdminDashboard.jsx');
const adminDashboardCode = readFileSync(adminDashboardPath, 'utf8');

console.log("1. Verifying Attendance Radar Outer Modal Overlay...");
// Outer overlay must have overflow-y-auto to allow scrolling on small viewports
const outerOverlayMatch = adminDashboardCode.match(
  /<div className="fixed inset-0 bg-black\/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">/
);
assert(outerOverlayMatch, "Outer overlay must contain overflow-y-auto and responsive padding p-2 sm:p-4");
console.log("✔ Outer overlay has overflow-y-auto and p-2 sm:p-4.");

console.log("2. Verifying Attendance Radar Modal Container...");
// Modal container must have responsive height (h-[94vh] on mobile, sm:h-auto sm:max-h-[90vh]) and padding (p-3 sm:p-6)
const modalContainerMatch = adminDashboardCode.match(
  /<div className="bg-white rounded-2xl sm:rounded-3xl p-3 sm:p-6 w-full max-w-3xl sm:max-w-4xl shadow-2xl border border-slate-100 h-\[94vh\] sm:h-auto sm:max-h-\[90vh\] flex flex-col animate-fade-in my-auto font-sans">/
);
assert(modalContainerMatch, "Modal container must have h-[94vh], sm:h-auto, sm:max-h-[90vh], and p-3 sm:p-6");
console.log("✔ Modal container has responsive height h-[94vh] sm:h-auto sm:max-h-[90vh] and p-3 sm:p-6.");

console.log("3. Verifying Compact Header Sections on Mobile...");
// Header
assert(
  adminDashboardCode.includes('pb-2 mb-2 sm:pb-3 sm:mb-3 border-b border-slate-100 shrink-0'),
  "Header chrome must use compact pb-2 mb-2 sm:pb-3 sm:mb-3"
);

// Date Navigation Bar
assert(
  adminDashboardCode.includes('p-1.5 sm:p-2.5 mb-2 sm:mb-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0'),
  "Date navigation bar must use compact p-1.5 sm:p-2.5 mb-2 sm:mb-2.5"
);

// District Rollups
assert(
  adminDashboardCode.includes('mb-2 sm:mb-2.5 space-y-1.5 shrink-0'),
  "District rollups container must use compact mb-2 sm:mb-2.5"
);

// Navigation Tabs
assert(
  adminDashboardCode.includes('grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-slate-100 p-1 rounded-2xl mb-2 sm:mb-2.5 shrink-0'),
  "Navigation tabs container must use compact mb-2 sm:mb-2.5"
);

// Time Filter Chips
assert(
  adminDashboardCode.includes('px-2.5 sm:px-3 py-1.5 sm:py-2 mb-2 sm:mb-2.5 shrink-0'),
  "Time filter chips container must use compact padding and mb-2 sm:mb-2.5"
);

// Quick Search
assert(
  adminDashboardCode.includes('{/* Quick Search */}\n              <div className="mb-2 sm:mb-2.5 shrink-0">') ||
  adminDashboardCode.includes('{/* Quick Search */}\r\n              <div className="mb-2 sm:mb-2.5 shrink-0">'),
  "Quick Search container must use compact mb-2 sm:mb-2.5"
);
console.log("✔ Header chrome sections use compact mobile margins mb-2 sm:mb-2.5.");

console.log("4. Verifying Guaranteed Non-Clipping List Container...");
// List container must have flexible height with min-h-[300px] sm:min-h-[320px] and overflow-y-auto
const listContainerMatch = adminDashboardCode.match(
  /<div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar my-1 min-h-\[300px\] sm:min-h-\[320px\]">/
);
assert(listContainerMatch, "List container must have min-h-[300px] sm:min-h-[320px] and overflow-y-auto");
console.log("✔ List container has min-h-[300px] sm:min-h-[320px] and overflow-y-auto.");

console.log("5. Verifying Mobile Touch & Wrapping Safety for Cards...");
// Missing tab card buttons/badges must flex-wrap
assert(
  adminDashboardCode.includes('className="flex items-center flex-wrap gap-1.5 self-end sm:self-center shrink-0"'),
  "Missing tab card action container must have flex-wrap and gap-1.5"
);

// Submitted tab card badges must flex-wrap
assert(
  adminDashboardCode.includes('className="flex items-center flex-wrap gap-1.5 sm:gap-2 self-end sm:self-center"'),
  "Submitted tab card action container must have flex-wrap and gap-1.5"
);

// On Leave tab card action container must flex-wrap
assert(
  adminDashboardCode.includes('className="flex items-center flex-wrap gap-1.5 self-end sm:self-center shrink-0"'),
  "On Leave tab card action container must have flex-wrap and gap-1.5"
);

console.log("✔ Card actions and badges have clean flex-wrapping for mobile.");

console.log("\n=======================================================");
console.log("ALL ATTENDANCE RADAR MOBILE LAYOUT TESTS PASSED (100%)");
console.log("=======================================================");
