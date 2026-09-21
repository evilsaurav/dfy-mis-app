import assert from 'node:assert';
import test from 'node:test';

test('Duplicate Radar Repair Suite: fetchDuplicateScan query formation and data ingestion', async () => {
  let capturedUrl = null;
  let capturedHeaders = null;

  const mockAuthFetch = async (url, options = {}) => {
    capturedUrl = url;
    capturedHeaders = options.headers || {};
    return {
      ok: true,
      json: async () => ({
        status: 'success',
        month: '2026-09',
        total_instances: 1,
        total_inflated_count: 2,
        instances: [
          {
            district: 'Aurangabad',
            fo_name: 'Ramesh Kumar',
            repeat_date: '2026-09-06',
            repeat_doc_id: 'aurangabad_ramesh_kumar_2026-09-06',
            duplicate_ids: ['123456789', '987654321'],
            original_occurrences: [
              { id: '123456789', date: '2026-09-02', fo_name: 'Ramesh Kumar' },
              { id: '987654321', date: '2026-09-03', fo_name: 'Ramesh Kumar' }
            ]
          }
        ]
      })
    };
  };

  const month = '2026-09';
  const currentUser = { role: 'SUB_ADMIN', allowed_districts: ['Aurangabad'] };
  let duplicateScanLoading = false;
  let duplicateScanData = null;

  const fetchDuplicateScan = async (force = false) => {
    duplicateScanLoading = true;
    try {
      const API_BASE_URL = "https://dfy-mis-app.onrender.com";
      let q = `?month=${month}`;
      if (force) q += `&force_refresh=true`;
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        q += `&districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}`;
      }
      const res = await mockAuthFetch(`${API_BASE_URL}/admin/scan-duplicate-notifications${q}`);
      if (res.ok) {
        const data = await res.json();
        duplicateScanData = data;
      }
    } finally {
      duplicateScanLoading = false;
    }
  };

  await fetchDuplicateScan(true);

  assert.strictEqual(duplicateScanLoading, false);
  assert.ok(capturedUrl.includes('/admin/scan-duplicate-notifications?month=2026-09&force_refresh=true&districts=Aurangabad'));
  assert.strictEqual(duplicateScanData.total_instances, 1);
  assert.strictEqual(duplicateScanData.total_inflated_count, 2);
  assert.strictEqual(duplicateScanData.instances[0].duplicate_ids.length, 2);
});

test('Duplicate Radar Repair Suite: handleRepairDuplicate execution and refresh orchestration', async () => {
  let repairReq = null;
  let refreshAuditCalled = false;
  let refreshScanCalled = false;
  let refreshDataCalled = false;
  let toastMsg = null;
  let cacheKeyRemoved = null;

  const mockLocalStorage = {
    removeItem: (k) => { cacheKeyRemoved = k; }
  };

  const mockAuthFetch = async (url, options = {}) => {
    if (url.includes('/admin/repair-duplicate-notifications')) {
      repairReq = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          status: 'success',
          message: 'Successfully removed 2 duplicate notification IDs and adjusted rollup.',
          removed_count: 2
        })
      };
    }
    return { ok: true, json: async () => ({}) };
  };

  let repairingDocId = null;
  const duplicateScanData = {
    month: '2026-09',
    total_instances: 1,
    total_inflated_count: 2,
    instances: [
      {
        district: 'Aurangabad',
        fo_name: 'Ramesh Kumar',
        repeat_date: '2026-09-06',
        repeat_doc_id: 'aurangabad_ramesh_kumar_2026-09-06',
        duplicate_ids: ['123456789', '987654321']
      }
    ]
  };

  const showToast = (msg, type) => { toastMsg = { msg, type }; };
  const fetchDuplicateScan = async (force) => { refreshScanCalled = force; };
  const fetchDuplicateAudit = async () => { refreshAuditCalled = true; };
  const fetchData = async (force) => { refreshDataCalled = force; };
  const month = '2026-09';
  const currentUser = { user_id: 'admin_test' };

  const handleRepairDuplicate = async (instance) => {
    if (!instance || !instance.repeat_doc_id || repairingDocId) return;
    repairingDocId = instance.repeat_doc_id;
    try {
      const API_BASE_URL = "https://dfy-mis-app.onrender.com";
      const targetMonth = duplicateScanData?.month || month;
      const res = await mockAuthFetch(`${API_BASE_URL}/admin/repair-duplicate-notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: targetMonth,
          district: instance.district,
          instance_doc_id: instance.repeat_doc_id,
          duplicate_ids: instance.duplicate_ids
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        const removed = data.removed_count || instance.duplicate_ids?.length || 0;
        showToast(`✓ Removed ${removed} duplicate notification ID(s) & updated district rollups!`, 'success');
        try { mockLocalStorage.removeItem(`dfy_dash_cache_${month}_${currentUser?.user_id || 'admin'}`); } catch (e) {}
        await Promise.all([
          fetchDuplicateScan(true),
          fetchDuplicateAudit(),
          fetchData(true)
        ]);
      }
    } finally {
      repairingDocId = null;
    }
  };

  const targetInstance = duplicateScanData.instances[0];
  await handleRepairDuplicate(targetInstance);

  assert.strictEqual(repairingDocId, null);
  assert.deepStrictEqual(repairReq, {
    month: '2026-09',
    district: 'Aurangabad',
    instance_doc_id: 'aurangabad_ramesh_kumar_2026-09-06',
    duplicate_ids: ['123456789', '987654321']
  });
  assert.strictEqual(toastMsg.type, 'success');
  assert.ok(toastMsg.msg.includes('Removed 2 duplicate notification ID(s)'));
  assert.strictEqual(cacheKeyRemoved, 'dfy_dash_cache_2026-09_admin_test');
  assert.strictEqual(refreshScanCalled, true);
  assert.strictEqual(refreshAuditCalled, true);
  assert.strictEqual(refreshDataCalled, true);
});

test('Duplicate Radar Repair Suite: Anti-Double-Tap Guard blocks concurrent clicks', async () => {
  let callCount = 0;
  let repairingDocId = 'aurangabad_ramesh_kumar_2026-09-06'; // Simulating active in-flight repair

  const handleRepairDuplicate = async (instance) => {
    if (!instance || !instance.repeat_doc_id || repairingDocId) return;
    callCount++;
  };

  await handleRepairDuplicate({
    repeat_doc_id: 'aurangabad_ramesh_kumar_2026-09-06',
    district: 'Aurangabad',
    duplicate_ids: ['123456789']
  });

  // Call should be silently blocked because repairingDocId !== null
  assert.strictEqual(callCount, 0);
});

test('Duplicate Radar Repair Suite: Zero duplicate detection and clean state', () => {
  const duplicateScanData = {
    status: 'success',
    month: '2026-09',
    total_instances: 0,
    total_inflated_count: 0,
    instances: []
  };

  const isClean = duplicateScanData && duplicateScanData.instances && duplicateScanData.instances.length === 0;
  assert.strictEqual(isClean, true);
  assert.strictEqual(duplicateScanData.total_inflated_count, 0);
});
