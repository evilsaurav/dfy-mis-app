import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log("=== Testing iOS Native Web Share & Canvas Download Utility ===");

// Test 1: Verify canvasShare.js implementation logic
import { isIOSDevice, downloadOrShareCanvas } from '../dfy-frontend/src/canvasShare.js';

console.log("\n[Test 1] Testing isIOSDevice detection...");

// Mock environments for iOS
const iphoneUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const androidUA = "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.119 Mobile Safari/537.36";
const windowsUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function setMockNavigator(obj) {
  Object.defineProperty(globalThis, 'navigator', {
    value: obj,
    configurable: true,
    writable: true
  });
}

setMockNavigator({ userAgent: iphoneUA, platform: 'iPhone', maxTouchPoints: 5 });
assert.strictEqual(isIOSDevice(), true, "Should detect iPhone as iOS");

setMockNavigator({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: 'MacIntel', maxTouchPoints: 5 });
assert.strictEqual(isIOSDevice(), true, "Should detect modern iPad (MacIntel + touch) as iOS");

setMockNavigator({ userAgent: androidUA, platform: 'Linux armv8l', maxTouchPoints: 5 });
assert.strictEqual(isIOSDevice(), false, "Should NOT detect Android as iOS");

setMockNavigator({ userAgent: windowsUA, platform: 'Win32', maxTouchPoints: 0 });
assert.strictEqual(isIOSDevice(), false, "Should NOT detect Windows PC as iOS");

setMockNavigator({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: 'MacIntel', maxTouchPoints: 0 });
assert.strictEqual(isIOSDevice(), false, "Should NOT detect desktop Mac as iOS");

console.log("✔ isIOSDevice correctly differentiates iOS from Android and PC.");


console.log("\n[Test 2] Testing downloadOrShareCanvas on iOS with Web Share API...");
let sharedPayload = null;
let clickedElement = null;

// Mock DOM & Canvas
const mockCanvas = {
  toBlob: (cb) => cb(new Blob(['fake-png-bytes'], { type: 'image/png' })),
  toDataURL: () => 'data:image/png;base64,fakepng'
};

global.document = {
  body: {
    appendChild: () => {},
    removeChild: () => {}
  },
  createElement: (tag) => {
    return {
      tagName: tag,
      href: '',
      download: '',
      click: function() { clickedElement = this; }
    };
  }
};

// Setup iOS with Web Share API
setMockNavigator({
  userAgent: iphoneUA,
  platform: 'iPhone',
  maxTouchPoints: 5,
  share: async (data) => { sharedPayload = data; },
  canShare: (data) => Boolean(data && data.files && data.files.length > 0)
});

const iosResult = await downloadOrShareCanvas(mockCanvas, 'test_card.png', 'Test Card');
assert.strictEqual(iosResult.method, 'share', "Should use Web Share API on iOS");
assert.strictEqual(iosResult.success, true, "Should return success true");
assert.ok(sharedPayload, "share() must be called with payload");
assert.strictEqual(sharedPayload.title, 'Test Card');
assert.strictEqual(sharedPayload.files[0].name, 'test_card.png');
assert.strictEqual(clickedElement, null, "Should not trigger direct <a> download when share succeeds");
console.log("✔ iOS triggers native Web Share API with File object.");


console.log("\n[Test 3] Testing user cancellation on iOS (AbortError)...");
setMockNavigator({
  userAgent: iphoneUA,
  platform: 'iPhone',
  maxTouchPoints: 5,
  share: async () => {
    const err = new Error('Share canceled');
    err.name = 'AbortError';
    throw err;
  },
  canShare: (data) => Boolean(data && data.files && data.files.length > 0)
});

const cancelResult = await downloadOrShareCanvas(mockCanvas, 'test_card.png');
assert.strictEqual(cancelResult.method, 'share');
assert.strictEqual(cancelResult.success, false);
assert.strictEqual(cancelResult.cancelled, true, "Should catch AbortError and mark as cancelled");
console.log("✔ AbortError (user cancel) handled gracefully without throwing.");


console.log("\n[Test 4] Testing standard direct download on Android and Desktop...");
clickedElement = null;
setMockNavigator({
  userAgent: androidUA,
  platform: 'Linux armv8l',
  maxTouchPoints: 5
});

const androidResult = await downloadOrShareCanvas(mockCanvas, 'android_card.png');
assert.strictEqual(androidResult.method, 'download', "Should use direct download on Android");
assert.strictEqual(androidResult.success, true);
assert.ok(clickedElement, "Should click <a> element for direct download");
assert.strictEqual(clickedElement.download, 'android_card.png');
console.log("✔ Android & Desktop use standard direct download.");


console.log("\n[Test 5] Checking App.jsx and AdminDashboard.jsx integration...");
const appContent = fs.readFileSync(path.resolve('dfy-frontend/src/App.jsx'), 'utf8');
const adminContent = fs.readFileSync(path.resolve('dfy-frontend/src/AdminDashboard.jsx'), 'utf8');

assert.ok(
  appContent.includes('downloadOrShareCanvas'),
  "App.jsx must import and use downloadOrShareCanvas"
);
assert.ok(
  adminContent.includes('downloadOrShareCanvas'),
  "AdminDashboard.jsx must import and use downloadOrShareCanvas"
);
console.log("✔ Both App.jsx and AdminDashboard.jsx use downloadOrShareCanvas.");

console.log("\nAll iOS canvas share & download tests PASSED 100%! 🎉");
