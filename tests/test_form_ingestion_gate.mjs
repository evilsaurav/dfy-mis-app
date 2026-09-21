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

class MockTransaction {
  constructor(stores, mode = 'readonly') {
    this.stores = stores;
    this.mode = mode;
  }
  objectStore(name) {
    if (!this.stores.has(name)) {
      throw new Error(`NotFoundError: The specified object store was not found: ${name}`);
    }
    return this.stores.get(name);
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
    names.contains = (n) => this.stores.has(n);
    return names;
  }
  createObjectStore(name, options) {
    const store = new MockObjectStore(name, options);
    this.stores.set(name, store);
    return store;
  }
  transaction(storeNames, mode) {
    return new MockTransaction(this.stores, mode);
  }
}

let activeDbInstance = null;

globalThis.indexedDB = {
  open: (name, version) => {
    const req = { onsuccess: null, onerror: null, onupgradeneeded: null, result: null, error: null };
    queueMicrotask(() => {
      if (!activeDbInstance) {
        activeDbInstance = new MockDatabase(name, version);
        if (req.onupgradeneeded) {
          req.onupgradeneeded({ target: { result: activeDbInstance }, oldVersion: 0, newVersion: version });
        }
      }
      req.result = activeDbInstance;
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }
};

const mockLocalStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => mockLocalStorage.get(key) || null,
  setItem: (key, val) => mockLocalStorage.set(key, String(val)),
  removeItem: (key) => mockLocalStorage.delete(key),
  clear: () => mockLocalStorage.clear()
};

// Import functions from offlineQueue.js
const {
  saveDistrictRegistry,
  isPatientIdNotified
} = await import('../dfy-frontend/src/offlineQueue.js');

test('Form Ingestion Gate: Single Notification ID addition blocked if in district registry', async () => {
  mockLocalStorage.clear();

  // Populate registry for Patna
  await saveDistrictRegistry('Patna', {
    '100000001': { date: '2026-08-15', fo_name: 'Rahul Kumar' }
  }, 1);

  let blockModalState = null;
  let formData = { working_place: 'Patna', notification_ids: [] };

  const handleDirectAddId = async (field, id) => {
    if (field === 'notification_ids') {
      let isDuplicate = false;
      let dupDate = '';
      let dupFoName = '';

      const regCheck = await isPatientIdNotified(formData.working_place, id);
      if (regCheck && regCheck.notified) {
        isDuplicate = true;
        dupDate = regCheck.date || '';
        dupFoName = regCheck.fo_name || '';
      }

      if (isDuplicate) {
        blockModalState = {
          isOpen: true,
          id: String(id),
          date: dupDate,
          fo_name: dupFoName
        };
        return false;
      }

      formData[field] = [...formData[field], id];
      return true;
    }
  };

  // Attempt to add duplicate notification ID
  const added = await handleDirectAddId('notification_ids', '100000001');

  assert.strictEqual(added, false, 'Duplicate ID must NOT be added');
  assert.strictEqual(formData.notification_ids.length, 0, 'Form notification_ids must remain empty');
  assert.ok(blockModalState !== null, 'Block modal must be triggered');
  assert.strictEqual(blockModalState.isOpen, true);
  assert.strictEqual(blockModalState.id, '100000001');
  assert.strictEqual(blockModalState.date, '2026-08-15');
  assert.strictEqual(blockModalState.fo_name, 'Rahul Kumar');

  // Attempt to add unique notification ID
  const addedUnique = await handleDirectAddId('notification_ids', '999999999');
  assert.strictEqual(addedUnique, true, 'Unique ID must be added');
  assert.deepStrictEqual(formData.notification_ids, ['999999999']);
});

test('Form Ingestion Gate: Non-notification repeat intervention triggers confirmation modal', async () => {
  let confirmModalState = null;
  let formData = { dbt_ids: [] };

  const monthlyReportedMap = {
    '200000002': [
      { date: '2026-09-05', categoryClean: 'dbt', categoryLabel: 'DBT Bank Details' }
    ]
  };

  const checkMonthlyDuplicate = (field, id) => {
    if (!monthlyReportedMap[id]) return null;
    const cleanCat = (field || '').replace(/_ids$/, '');
    const same = monthlyReportedMap[id].filter(e => e.categoryClean === cleanCat);
    if (same.length > 0) {
      return { isSameCategory: true, date: same[0].date, label: same[0].categoryLabel };
    }
    return null;
  };

  const handleDirectAddId = async (field, id) => {
    const prevReport = checkMonthlyDuplicate(field, id);
    if (prevReport && prevReport.isSameCategory) {
      confirmModalState = {
        isOpen: true,
        id: String(id),
        field: field,
        label: prevReport.label || field,
        date: prevReport.date || '',
        onConfirm: () => {
          formData[field] = [...formData[field], id];
        }
      };
      return false;
    }
    formData[field] = [...formData[field], id];
    return true;
  };

  const added = await handleDirectAddId('dbt_ids', '200000002');
  assert.strictEqual(added, false, 'Direct addition must pause for user confirmation');
  assert.strictEqual(formData.dbt_ids.length, 0, 'ID must not be added before confirmation');
  assert.ok(confirmModalState !== null, 'Repeat confirmation modal must open');
  assert.strictEqual(confirmModalState.id, '200000002');
  assert.strictEqual(confirmModalState.label, 'DBT Bank Details');
  assert.strictEqual(confirmModalState.date, '2026-09-05');

  // User confirms repeat intervention
  confirmModalState.onConfirm();
  assert.deepStrictEqual(formData.dbt_ids, ['200000002'], 'Confirmed repeat intervention must be added');
});

test('Form Ingestion Gate: Multi-add batch paste filters duplicate notification IDs', async () => {
  mockLocalStorage.clear();

  await saveDistrictRegistry('Gaya', {
    '111111111': { date: '2026-07-20', fo_name: 'Pooja Singh' },
    '222222222': { date: '2026-08-10', fo_name: 'Amit Verma' }
  }, 2);

  let toastMessage = '';
  let toastType = '';
  const showToast = (msg, type) => { toastMessage = msg; toastType = type; };

  let formData = { working_place: 'Gaya', notification_ids: [] };

  const handleMultiAddIds = async (field, newIds) => {
    const current = formData[field] || [];
    const rawUnique = Array.from(new Set(newIds)).filter(id => !current.includes(id));

    if (field === 'notification_ids') {
      const uniqueNew = [];
      const blockedDuplicates = [];

      for (const id of rawUnique) {
        const regCheck = await isPatientIdNotified(formData.working_place, id);
        if (regCheck && regCheck.notified) {
          blockedDuplicates.push({ id, ...regCheck });
        } else {
          uniqueNew.push(id);
        }
      }

      if (uniqueNew.length > 0) {
        formData[field] = [...(formData[field] || []), ...uniqueNew];
      }

      if (blockedDuplicates.length > 0) {
        const sample = blockedDuplicates.slice(0, 2).map(d => `#${d.id}`).join(', ');
        if (uniqueNew.length > 0) {
          showToast(`⚠️ ${uniqueNew.length} IDs add hui. ${blockedDuplicates.length} duplicate TB Notifications block kiye gaye: ${sample}`, 'warning');
        } else {
          showToast(`🚫 Sabhi ${blockedDuplicates.length} IDs pehle se Notified hain aur block kar di gayi: ${sample}`, 'error');
        }
      }
    }
  };

  // Paste a mix of duplicates and fresh IDs
  const pastedIds = ['111111111', '222222222', '333333333', '444444444'];
  await handleMultiAddIds('notification_ids', pastedIds);

  assert.strictEqual(formData.notification_ids.length, 2, 'Only the 2 unique IDs must be added');
  assert.deepStrictEqual(formData.notification_ids, ['333333333', '444444444']);
  assert.ok(toastMessage.includes('2 duplicate TB Notifications block kiye gaye'), 'Toast must state 2 duplicates blocked');
  assert.strictEqual(toastType, 'warning');

  // Paste only duplicate IDs
  await handleMultiAddIds('notification_ids', ['111111111', '222222222']);
  assert.strictEqual(formData.notification_ids.length, 2, 'No new IDs should be added');
  assert.ok(toastMessage.includes('Sabhi 2 IDs pehle se Notified hain'), 'Toast must indicate all were blocked');
  assert.strictEqual(toastType, 'error');
});

test('Form Ingestion Gate: Offline sync triggers pruned notification toast when server pruned_count > 0', async () => {
  let toasts = [];
  const showToast = (msg, type) => { toasts.push({ msg, type }); };

  // Mock server response with pruned_count = 3
  const fakeServerResponse = {
    status: 'success',
    pruned_count: 3,
    pruned_notification_ids: ['101', '102', '103']
  };

  // Simulate onReportSynced callback from syncAllOfflineReports
  const onReportSynced = (syncedItem, resData) => {
    if (resData && resData.pruned_count > 0) {
      showToast(`ℹ️ Offline report (${syncedItem.date}) me se ${resData.pruned_count} duplicate notifications auto-prune kiye gaye.`, 'info');
    }
    showToast(`✓ Offline report for ${syncedItem.date} synced to server! 🎉`, 'success');
  };

  onReportSynced({ date: '2026-09-20' }, fakeServerResponse);

  assert.strictEqual(toasts.length, 2);
  assert.strictEqual(toasts[0].type, 'info');
  assert.ok(toasts[0].msg.includes('3 duplicate notifications auto-prune kiye gaye'));
  assert.strictEqual(toasts[1].type, 'success');
});
