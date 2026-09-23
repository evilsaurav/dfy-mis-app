import { readFileSync } from 'fs';
import { resolve } from 'path';
import assert from 'assert';

console.log("Running PWA Cache Invalidation & Force Update Configuration tests...");

// 1. Check dfy-frontend/vercel.json
const vercelConfig = JSON.parse(readFileSync(resolve('dfy-frontend/vercel.json'), 'utf8'));

assert(Array.isArray(vercelConfig.headers), "vercel.json must have headers array");

const swHeader = vercelConfig.headers.find(h => h.source === '/sw.js');
assert(swHeader, "Must have header rule for /sw.js in vercel.json");
const swCacheControl = swHeader.headers.find(h => h.key.toLowerCase() === 'cache-control');
assert(swCacheControl, "/sw.js must have Cache-Control header");
assert(
  swCacheControl.value.includes('no-cache') && swCacheControl.value.includes('no-store'),
  "/sw.js Cache-Control must include no-cache and no-store"
);

const htmlHeader = vercelConfig.headers.find(h => h.source === '/index.html');
assert(htmlHeader, "Must have header rule for /index.html in vercel.json");
const htmlCacheControl = htmlHeader.headers.find(h => h.key.toLowerCase() === 'cache-control');
assert(htmlCacheControl, "/index.html must have Cache-Control header");
assert(
  htmlCacheControl.value.includes('no-cache') && htmlCacheControl.value.includes('no-store'),
  "/index.html Cache-Control must include no-cache and no-store"
);

// 2. Check dfy-frontend/src/changelogData.js
const changelog = readFileSync(resolve('dfy-frontend/src/changelogData.js'), 'utf8');
assert(
  changelog.includes('export const APP_VERSION = "2.8.1"'),
  'APP_VERSION must be exported as "2.8.1"'
);
assert(
  changelog.includes('version: "v2.8.1"') || changelog.includes('version: \'v2.8.1\''),
  'CHANGELOG_ENTRIES must contain entry for v2.8.1'
);

// 3. Check dfy-frontend/index.html
const indexHtml = readFileSync(resolve('dfy-frontend/index.html'), 'utf8');
assert(indexHtml.includes('reg.update()'), "index.html must call reg.update() on register");
assert(
  indexHtml.includes('visibilitychange') && indexHtml.includes('reg.update()'),
  "index.html must trigger reg.update() on visibilitychange"
);

console.log("✔ All PWA cache headers, version bump, and sw update trigger checks passed!");
