import assert from 'node:assert';
import test from 'node:test';

// In-memory mock IndexedDB engine
class MockObjectStore {
  constructor(name, options = {}) {
    this.name = name;
    this.keyPath = options.keyPath || 'id';
    this.data = new Map();
    this.indexes = new Map();
  }

  createIndex(indexName, keyPath, options) {
    this.indexes.set(indexName, { keyPath, options });
  }

  add(item) {
    const key = item[this.keyPath];
    const req = { onsuccess: null, onerror: null, result: null, error: null };
    queueMicrotask(() => {
      if (this.data.has(key)) {
        req.error = new Error(`Key already exists: ${key}`);
        if (req.onerror) req.onerror({ target: req });
      } else {
        this.data.set(key, JSON.parse(JSON.stringify(item)));
        req.result = key;
        if (req.onsuccess) req.onsuccess({ target: req });
      }
    });
    return req;
  }

  put(item) {
    const key = item[this.keyPath];
    const req = { onsuccess: null, onerror: null, result: null, error: null };
    queueMicrotask(() => {
      this.data.set(key, JSON.parse(JSON.stringify(item)));
      req.result = key;
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  get(key) {
    const req = { onsuccess: null, onerror: null, result: null, error: null };
    queueMicrotask(() => {
      const val = this.data.get(key);
      req.result = val ? JSON.parse(JSON.stringify(val)) : undefined;
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  getAll() {
    const req = { onsuccess: null, onerror: null, result: null, error: null };
    queueMicrotask(() => {
      req.result = Array.from(this.data.values()).map(v => JSON.parse(JSON.stringify(v)));
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }

  delete(key) {
    const req = { onsuccess: null, onerror: null, result: null, error: null };
    queueMicrotask(() => {
      this.data.delete(key);
      req.result = undefined;
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }
}

class MockDatabase {
  constructor(name, version) {
    this.name = name;
    this.version = version;
    this.stores = new Map();
  }

  get objectStoreNames() {
    const names = Array.from(this.stores.keys());
    names.contains = (n) => names.includes(n);
    return names;
  }

  createObjectStore(name, options) {
    const store = new MockObjectStore(name, options);
    this.stores.set(name, store);
    return store;
  }

  transaction(storeNames, mode) {
    const requested = Array.isArray(storeNames) ? storeNames : [storeNames];
    return {
      objectStore: (name) => {
        if (!this.stores.has(name)) {
          throw new Error(`NotFoundError: store ${name} not found`);
        }
        return this.stores.get(name);
      }
    };
  }
}

let currentMockDb = null;
let currentMockDbVersion = 0;

const mockIndexedDB = {
  open(dbName, version) {
    const req = { onsuccess: null, onerror: null, onupgradeneeded: null, result: null, error: null };
    queueMicrotask(() => {
      if (!currentMockDb) {
        currentMockDb = new MockDatabase(dbName, version);
      }
      if (version > currentMockDbVersion) {
        const oldVersion = currentMockDbVersion;
        currentMockDbVersion = version;
        currentMockDb.version = version;
        if (req.onupgradeneeded) {
          req.onupgradeneeded({
            target: { result: currentMockDb },
            oldVersion
          });
        }
      }
      req.result = currentMockDb;
      if (req.onsuccess) {
        req.onsuccess({ target: req });
      }
    });
    return req;
  }
};

const storageMap = new Map();
const mockLocalStorage = {
  getItem: (k) => storageMap.get(k) || null,
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k),
  clear: () => storageMap.clear()
};

globalThis.window = {
  indexedDB: mockIndexedDB,
  localStorage: mockLocalStorage
};
globalThis.localStorage = mockLocalStorage;
globalThis.indexedDB = mockIndexedDB;

// Import our module under test
const {
  DB_VERSION,
  openOfflineDB,
  saveOfflineReport,
  getAllOfflineReports,
  deleteOfflineReport,
  syncAllOfflineReports,
  saveDistrictRegistry,
  getDistrictRegistry,
  isPatientIdNotified
} = await import('../dfy-frontend/src/offlineQueue.js');

test('DB_VERSION is 2 and upgrades cleanly', async () => {
  assert.strictEqual(DB_VERSION, 2);
  const db = await openOfflineDB();
  assert.ok(db.objectStoreNames.contains('offline_reports_queue'));
  assert.ok(db.objectStoreNames.contains('district_notified_registry'));
});

test('Upgrading from v1 preserves offline reports queue and creates registry store', async () => {
  // Simulate v1 existing db with an offline report
  currentMockDb = new MockDatabase('DFY_MIS_OFFLINE_DB', 1);
  currentMockDbVersion = 1;
  const queueStore = currentMockDb.createObjectStore('offline_reports_queue', { keyPath: 'id' });
  queueStore.data.set('offline_1', { id: 'offline_1', fo_name: 'FO Test', payload: {} });

  // Open with v2
  const db = await openOfflineDB();
  assert.strictEqual(db.version, 2);
  assert.ok(db.objectStoreNames.contains('offline_reports_queue'));
  assert.ok(db.objectStoreNames.contains('district_notified_registry'));

  // Ensure offline report from v1 was preserved
  const tx = db.transaction('offline_reports_queue', 'readonly');
  const store = tx.objectStore('offline_reports_queue');
  const req = store.get('offline_1');
  await new Promise(r => { req.onsuccess = r; });
  assert.strictEqual(req.result.id, 'offline_1');
  assert.strictEqual(req.result.fo_name, 'FO Test');
});

test('saveDistrictRegistry persists to IndexedDB and localStorage mirror', async () => {
  const regMap = {
    '10001': { date: '2026-09-01', fo_name: 'Ramesh' },
    '10002': { date: '2026-09-05', fo_name: 'Suresh' }
  };

  const saved = await saveDistrictRegistry('Aurangabad', regMap, 2);
  assert.strictEqual(saved.district, 'Aurangabad');
  assert.strictEqual(saved.total_count, 2);
  assert.deepStrictEqual(saved.registry['10001'], { date: '2026-09-01', fo_name: 'Ramesh' });

  // Verify localStorage mirror
  const lsData = JSON.parse(mockLocalStorage.getItem('dfy_notif_reg_aurangabad'));
  assert.ok(lsData);
  assert.strictEqual(lsData.district, 'Aurangabad');
  assert.strictEqual(lsData.total_count, 2);
  assert.deepStrictEqual(lsData.registry['10002'], { date: '2026-09-05', fo_name: 'Suresh' });

  // Verify getDistrictRegistry retrieves from IndexedDB
  const loaded = await getDistrictRegistry('Aurangabad');
  assert.ok(loaded);
  assert.strictEqual(loaded.district, 'Aurangabad');
  assert.strictEqual(loaded.total_count, 2);
  assert.strictEqual(loaded.registry['10001'].fo_name, 'Ramesh');
});

test('getDistrictRegistry falls back to localStorage if IndexedDB has no entry', async () => {
  // Put an entry only into localStorage
  const fallbackRecord = {
    district: 'Gaya',
    registry: {
      '99999': { date: '2026-09-10', fo_name: 'Gaya FO' }
    },
    total_count: 1,
    updated_at: Date.now()
  };
  mockLocalStorage.setItem('dfy_notif_reg_gaya', JSON.stringify(fallbackRecord));

  const fetched = await getDistrictRegistry('Gaya');
  assert.ok(fetched);
  assert.strictEqual(fetched.district, 'Gaya');
  assert.strictEqual(fetched.total_count, 1);
  assert.strictEqual(fetched.registry['99999'].fo_name, 'Gaya FO');
});

test('isPatientIdNotified checks patient ID against district registry', async () => {
  const regMap = {
    '123456': { date: '2026-09-15', fo_name: 'Pooja Kumari' },
    'ABC999': { date: '2026-09-18', fo_name: 'Anil Kumar' }
  };
  await saveDistrictRegistry('Patna', regMap, 2);

  // Positive match
  const res1 = await isPatientIdNotified('Patna', '123456');
  assert.strictEqual(res1.notified, true);
  assert.strictEqual(res1.date, '2026-09-15');
  assert.strictEqual(res1.fo_name, 'Pooja Kumari');

  // Whitespace trimmed match
  const res2 = await isPatientIdNotified('Patna', '  123456  ');
  assert.strictEqual(res2.notified, true);
  assert.strictEqual(res2.date, '2026-09-15');

  // Case-insensitive ID match
  const res3 = await isPatientIdNotified('Patna', 'abc999');
  assert.strictEqual(res3.notified, true);
  assert.strictEqual(res3.fo_name, 'Anil Kumar');

  // Negative match
  const res4 = await isPatientIdNotified('Patna', '000000');
  assert.strictEqual(res4.notified, false);

  // Nonexistent district
  const res5 = await isPatientIdNotified('UnknownDist', '123456');
  assert.strictEqual(res5.notified, false);

  // Edge cases
  assert.strictEqual((await isPatientIdNotified('', '123')).notified, false);
  assert.strictEqual((await isPatientIdNotified('Patna', '')).notified, false);
  assert.strictEqual((await isPatientIdNotified(null, null)).notified, false);
});

test('syncAllOfflineReports passes parsed resData to onReportSynced callback', async () => {
  // Clear mock queue
  const db = await openOfflineDB();
  const tx = db.transaction('offline_reports_queue', 'readwrite');
  tx.objectStore('offline_reports_queue').data.clear();

  // Save an offline report
  await saveOfflineReport({
    fo_name: 'Sync FO',
    working_place: 'Gaya',
    date: '2026-09-20',
    notification_ids: ['101', '102']
  });

  const reports = await getAllOfflineReports();
  assert.strictEqual(reports.length, 1);

  // Mock global fetch
  const mockServerResponse = {
    message: 'Daily report submitted successfully',
    pruned_duplicate_notifications: ['101'],
    pruned_count: 1
  };

  globalThis.fetch = async (url, options) => {
    assert.ok(url.endsWith('/submit-daily-report'));
    assert.strictEqual(options.method, 'POST');
    return {
      ok: true,
      json: async () => mockServerResponse
    };
  };

  let syncedItemReceived = null;
  let resDataReceived = null;

  const syncResult = await syncAllOfflineReports('http://test-server', (item, resData) => {
    syncedItemReceived = item;
    resDataReceived = resData;
  });

  assert.strictEqual(syncResult.syncedCount, 1);
  assert.strictEqual(syncResult.failedCount, 0);
  assert.ok(syncedItemReceived);
  assert.strictEqual(syncedItemReceived.fo_name, 'Sync FO');
  assert.deepStrictEqual(resDataReceived, mockServerResponse);
  assert.strictEqual(resDataReceived.pruned_count, 1);
  assert.deepStrictEqual(resDataReceived.pruned_duplicate_notifications, ['101']);

  // Verify item was deleted from offline queue
  const remaining = await getAllOfflineReports();
  assert.strictEqual(remaining.length, 0);
});
