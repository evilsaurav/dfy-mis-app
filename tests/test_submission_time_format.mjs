import test from 'node:test';
import assert from 'node:assert/strict';
import { formatIstTime } from '../dfy-frontend/src/utils/timeFormat.js';

test('formatIstTime handles falsy or empty inputs', () => {
  assert.equal(formatIstTime(null), '');
  assert.equal(formatIstTime(undefined), '');
  assert.equal(formatIstTime(''), '');
});

test('formatIstTime normalizes pre-formatted 12-hour strings', () => {
  assert.equal(formatIstTime('08:30 pm'), '08:30 PM');
  assert.equal(formatIstTime('8:30 am'), '08:30 AM');
  assert.equal(formatIstTime('12:05 PM'), '12:05 PM');
  assert.equal(formatIstTime('1:15pm'), '01:15 PM');
});

test('formatIstTime converts UTC ISO strings to IST (12-hour format)', () => {
  // 10:15:00 UTC + 5:30 = 15:45:00 IST -> 03:45 PM
  assert.equal(formatIstTime('2026-09-25T10:15:00.000000Z'), '03:45 PM');
  // 04:30:00 UTC + 5:30 = 10:00:00 IST -> 10:00 AM
  assert.equal(formatIstTime('2026-09-25T04:30:00Z'), '10:00 AM');
  // 18:45:00 UTC + 5:30 = 00:15:00 next day IST -> 12:15 AM
  assert.equal(formatIstTime('2026-09-25T18:45:00Z'), '12:15 AM');
});

test('formatIstTime gracefully falls back for invalid date strings', () => {
  assert.equal(formatIstTime('not-a-date'), 'not-a-date');
});
