import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getCohortFoKey,
  mergeServerCohortSync,
  applyOptimisticCohortPlusOne,
  computeMonthCohortStats,
} from '../dfy-frontend/src/offlineQueue.js';

test('getCohortFoKey normalizes district and FO name deterministically', () => {
  assert.equal(getCohortFoKey('Buxar', 'Santosh Kumar'), 'dfy_cohort_3m_buxar_santosh_kumar');
  assert.equal(getCohortFoKey('East Champaran', 'Ashwani Kr.'), 'dfy_cohort_3m_east_champaran_ashwani_kr_');
});

test('mergeServerCohortSync handles FULL -> NO_CHANGE -> DELTA (+1) and prunes >3m months', () => {
  const fullPayload = {
    success: true,
    mode: 'FULL',
    months: ['2026-10', '2026-09', '2026-08'],
    months_data: {
      '2026-10': {
        patients: {
          '100001': { date: '2026-10-05', name: 'Ramesh', phone: '9999900001', hiv: true, udst: false, dbt: false, ct: false },
          '100002': { date: '2026-10-06', name: 'Sita', phone: '9999900002', hiv: false, udst: false, dbt: false, ct: false },
        },
      },
      '2026-09': { patients: {} },
      '2026-08': {
        patients: {
          '999999': { date: '2026-08-10', name: 'Old', phone: '', hiv: true, udst: true, dbt: true, ct: true },
        },
      },
    },
    server_kpi_count: 3,
    server_synced_at: '2026-10-31T10:00:00Z',
  };

  const cache1 = mergeServerCohortSync(null, fullPayload, 'Buxar', 'Santosh Kumar');
  assert.equal(cache1.fo_key, 'dfy_cohort_3m_buxar_santosh_kumar');
  assert.equal(Object.keys(cache1.months_data['2026-10'].patients).length, 2);

  // NO_CHANGE keeps local snapshot intact
  const cache2 = mergeServerCohortSync(
    cache1,
    { success: true, mode: 'NO_CHANGE', months: ['2026-10', '2026-09', '2026-08'], server_kpi_count: 3, server_synced_at: '2026-10-31T12:00:00Z' },
    'Buxar',
    'Santosh Kumar'
  );
  assert.equal(cache2.months_data['2026-10'].patients['100001'].name, 'Ramesh');
  assert.equal(cache2.months_data['2026-10'].patients['100001'].udst, false);

  // DELTA after month rollover to Nov prunes 2026-08 and flips 100001.udst = true
  const deltaPayload = {
    success: true,
    mode: 'DELTA',
    months: ['2026-11', '2026-10', '2026-09'],
    updated_patients: [
      { id: '100001', month: '2026-10', date: '2026-10-05', name: '', phone: '', hiv: true, udst: true, dbt: false, ct: false },
      { id: '100003', month: '2026-11', date: '2026-11-02', name: 'Mohan', phone: '9999900003', hiv: false, udst: false, dbt: false, ct: false },
    ],
    server_kpi_count: 5,
    server_synced_at: '2026-11-02T12:00:00Z',
  };

  const cache3 = mergeServerCohortSync(cache2, deltaPayload, 'Buxar', 'Santosh Kumar');
  assert.equal(cache3.months_data['2026-08'], undefined, 'Month older than 3m should be pruned');
  // Existing patient name/phone preserved if delta omitted them
  assert.equal(cache3.months_data['2026-10'].patients['100001'].name, 'Ramesh');
  assert.equal(cache3.months_data['2026-10'].patients['100001'].udst, true);
  assert.equal(cache3.months_data['2026-11'].patients['100003'].name, 'Mohan');
});

test('applyOptimisticCohortPlusOne adds +1 notification and flips cross-month indicator offline', () => {
  const initialCache = {
    fo_key: 'buxar__santoshkumar',
    months: ['2026-11', '2026-10', '2026-09'],
    months_data: {
      '2026-11': { patients: {} },
      '2026-10': {
        patients: {
          '100001': { date: '2026-10-05', name: 'Ramesh', phone: '9999900001', hiv: true, udst: false, dbt: false, ct: false },
        },
      },
      '2026-09': { patients: {} },
    },
    server_kpi_count: 2,
  };

  // FO submits Nov 12 report notifying 100009 AND completing Contact Tracing for Oct cohort patient 100001
  const nextCache = applyOptimisticCohortPlusOne(
    initialCache,
    {
      date_of_reporting: '2026-11-12',
      notification_ids: ['100009'],
      hiv_dm_ids: ['100009'],
      sample_tested_ids: [],
      dbt_ids: [],
      contact_tracing_ids: ['100001'],
    },
    '2026-11',
    'Buxar',
    'Santosh Kumar'
  );

  assert.equal(nextCache.months_data['2026-11'].patients['100009'].hiv, true);
  assert.equal(nextCache.months_data['2026-11'].patients['100009'].udst, false);
  assert.equal(nextCache.months_data['2026-10'].patients['100001'].ct, true);
});

test('computeMonthCohortStats calculates exact 75% target, achieved flags, and pendingPatients', () => {
  const monthMap = {
    '100001': { date: '2026-10-01', name: 'P1', phone: '9000000001', hiv: true, udst: true, dbt: true, ct: false },
    '100002': { date: '2026-10-02', name: 'P2', phone: '9000000002', hiv: true, udst: true, dbt: false, ct: false },
    '100003': { date: '2026-10-03', name: 'P3', phone: '9000000003', hiv: true, udst: false, dbt: false, ct: false },
    '100004': { date: '2026-10-04', name: 'P4', phone: '9000000004', hiv: false, udst: false, dbt: false, ct: false },
  };

  const stats = computeMonthCohortStats(monthMap);
  assert.equal(stats.totalNotified, 4);
  assert.equal(stats.target75, 3); // ceil(4 * 0.75) = 3

  // HIV: 3/4 = 75% -> achieved
  assert.equal(stats.indicators.hiv.done, 3);
  assert.equal(stats.indicators.hiv.pct, 75);
  assert.equal(stats.indicators.hiv.achieved, true);
  assert.equal(stats.indicators.hiv.neededFor75, 0);
  assert.equal(stats.indicators.hiv.pendingPatients.length, 1);
  assert.equal(stats.indicators.hiv.pendingPatients[0].id, '100004');
  assert.equal(stats.indicators.hiv.pendingPatients[0].phone, '9000000004');

  // UDST: 2/4 = 50% -> needs 1 more
  assert.equal(stats.indicators.udst.done, 2);
  assert.equal(stats.indicators.udst.pct, 50);
  assert.equal(stats.indicators.udst.achieved, false);
  assert.equal(stats.indicators.udst.neededFor75, 1);
  assert.equal(stats.indicators.udst.pendingPatients.length, 2);

  // Only HIV achieved -> achievedCount = 1
  assert.equal(stats.achievedCount, 1);
});
