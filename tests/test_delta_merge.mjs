import test from 'node:test';
import assert from 'node:assert/strict';

// Helper matching AdminDashboard delta merge logic
export function mergeDelta(prevRecords, data) {
  if (!data) return prevRecords;
  if (data.mode === 'NO_CHANGE') return prevRecords;
  if (data.mode === 'DELTA') {
    const map = new Map((prevRecords || []).map(r => [r.id || r.doc_id, r]));
    
    // 1. Remove deleted tombstones
    if (Array.isArray(data.deleted_ids)) {
      data.deleted_ids.forEach(delId => map.delete(delId));
    }
    
    // 2. Upsert newly modified / added records
    if (Array.isArray(data.records)) {
      data.records.forEach(newRec => {
        const id = newRec.id || newRec.doc_id;
        if (id) map.set(id, newRec);
      });
    }
    return Array.from(map.values());
  }
  // Mode FULL
  return Array.isArray(data.records) ? data.records : [];
}

test('mergeDelta inserts new records into existing array without duplicates', () => {
  const initial = [
    { id: 'rec_1', fo_name: 'FO 1', notifications: 10 },
    { id: 'rec_2', fo_name: 'FO 2', notifications: 20 },
  ];
  const delta = {
    mode: 'DELTA',
    records: [
      { id: 'rec_2', fo_name: 'FO 2', notifications: 25 }, // update
      { id: 'rec_3', fo_name: 'FO 3', notifications: 5 },  // new
    ],
    deleted_ids: ['rec_1'] // delete
  };

  const result = mergeDelta(initial, delta);
  assert.equal(result.length, 2);
  assert.equal(result.find(r => r.id === 'rec_1'), undefined);
  assert.equal(result.find(r => r.id === 'rec_2').notifications, 25);
  assert.equal(result.find(r => r.id === 'rec_3').notifications, 5);
});

test('mergeDelta preserves existing state on NO_CHANGE', () => {
  const initial = [{ id: 'rec_1', fo_name: 'FO 1' }];
  const result = mergeDelta(initial, { mode: 'NO_CHANGE', records: [] });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'rec_1');
});

test('mergeDelta replaces state on FULL', () => {
  const initial = [{ id: 'old_1' }];
  const full = { mode: 'FULL', records: [{ id: 'new_1' }, { id: 'new_2' }] };
  const result = mergeDelta(initial, full);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'new_1');
  assert.equal(result[1].id, 'new_2');
});

test('mergeDelta handles empty prev by using cached fallback if provided', () => {
  const cachedFallback = [{ id: 'cached_1', fo_name: 'FO 1' }];
  const delta = {
    mode: 'DELTA',
    records: [{ id: 'cached_1', fo_name: 'FO 1 (Updated)' }, { id: 'new_2', fo_name: 'FO 2' }],
    deleted_ids: []
  };
  // When prev is empty, using fallback provides the base map
  const result = mergeDelta([], delta);
  assert.equal(result.length, 2);
  assert.equal(result.find(r => r.id === 'cached_1').fo_name, 'FO 1 (Updated)');
});

test('smart refresh click vs shift-click payload logic', () => {
  const buildPayload = (month, cachedData, isShiftClick) => {
    const payload = { month_prefix: month, force_refresh: Boolean(isShiftClick) };
    if (!isShiftClick && cachedData && cachedData.synced_at && cachedData.records?.length > 0) {
      payload.since = cachedData.synced_at;
      payload.cached_count = cachedData.records.length;
    }
    return payload;
  };

  const cached = { synced_at: '2026-09-22 22:30:00', records: [{ id: '1' }] };
  
  // Normal click
  const normalPayload = buildPayload('2026-09', cached, false);
  assert.equal(normalPayload.force_refresh, false);
  assert.equal(normalPayload.since, '2026-09-22 22:30:00');
  assert.equal(normalPayload.cached_count, 1);

  // Shift + click (Hard Refresh)
  const hardPayload = buildPayload('2026-09', cached, true);
  assert.equal(hardPayload.force_refresh, true);
  assert.equal(hardPayload.since, undefined);
});

