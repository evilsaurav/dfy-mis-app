// tests/test_whatsapp_bulletin_fix.mjs
import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

const adminCode = readFileSync(resolve('dfy-frontend/src/AdminDashboard.jsx'), 'utf8');

// 1. Verify canonical district matching in bulletin calculation
assert(
  adminCode.includes('canonicalizeDistrict(r.working_place') || adminCode.includes('canonicalizeDistrict(r.district'),
  "Bulletin aggregation must use canonicalizeDistrict"
);

// 2. Verify reactive bulletin memo hook exists and is bound to preview container
assert(
  adminCode.includes('liveWhatsAppBulletin') || adminCode.includes('whatsAppBulletinText'),
  "Must have reactive bulletin memo"
);
assert(
  adminCode.includes('{liveWhatsAppBulletin}'),
  "Report Studio preview container must bind {liveWhatsAppBulletin}"
);

// 3. Verify hardcoded static 4-line preview is completely removed
assert(
  !adminCode.includes('Top Districts ranked by Notification Target %'),
  "Hardcoded static 4-line preview must be replaced with reactive bulletin"
);

// 4. Verify WhatsApp Web direct link
assert(
  adminCode.includes('api.whatsapp.com/send') || adminCode.includes('wa.me'),
  "Must provide direct WhatsApp share button"
);

console.log("✔ WhatsApp Bulletin fix assertions passed!");
