// --- DFY MIS IndexedDB Offline Queue Engine ---
export const DB_NAME = 'DFY_MIS_OFFLINE_DB';
export const DB_VERSION = 3;
export const STORE_NAME = 'offline_reports_queue';
export const REGISTRY_STORE_NAME = 'district_notified_registry';
export const COHORT_STORE_NAME = 'fo_cohort_3m_cache';

export const openOfflineDB = () => {
  return new Promise((resolve, reject) => {
    const idb = typeof window !== 'undefined' ? window.indexedDB : (typeof indexedDB !== 'undefined' ? indexedDB : null);
    if (!idb) {
      reject(new Error('IndexedDB is not supported on this device.'));
      return;
    }

    const request = idb.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('fo_name', 'fo_name', { unique: false });
      }
      if (!db.objectStoreNames.contains(REGISTRY_STORE_NAME)) {
        db.createObjectStore(REGISTRY_STORE_NAME, { keyPath: 'district' });
      }
      if (!db.objectStoreNames.contains(COHORT_STORE_NAME)) {
        db.createObjectStore(COHORT_STORE_NAME, { keyPath: 'fo_key' });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
};

/**
 * Save a daily report payload into IndexedDB offline queue
 */
export const saveOfflineReport = async (payload) => {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const queueItem = {
        id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        payload: payload,
        fo_name: payload.fo_name || 'Field Officer',
        working_place: payload.working_place || 'Bihar',
        date: payload.date || payload.date_of_reporting || new Date().toISOString().split('T')[0],
        timestamp: Date.now(),
        status: 'pending_sync'
      };

      const request = store.add(queueItem);

      request.onsuccess = () => {
        resolve(queueItem);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Failed to save report to IndexedDB offline queue:', error);
    // Fallback to localStorage queue if IndexedDB fails
    try {
      const fallbackKey = 'dfy_offline_queue_fallback';
      const existing = JSON.parse(localStorage.getItem(fallbackKey) || '[]');
      const item = {
        id: `fallback_${Date.now()}`,
        payload: payload,
        timestamp: Date.now()
      };
      existing.push(item);
      localStorage.setItem(fallbackKey, JSON.stringify(existing));
      return item;
    } catch {
      throw error;
    }
  }
};

/**
 * Get all pending offline reports
 */
export const getAllOfflineReports = async () => {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.warn('Error reading from IndexedDB, checking fallback', error);
    try {
      const fallbackKey = 'dfy_offline_queue_fallback';
      return JSON.parse(localStorage.getItem(fallbackKey) || '[]');
    } catch {
      return [];
    }
  }
};

/**
 * Get count of pending offline reports
 */
export const getOfflineReportsCount = async () => {
  try {
    const reports = await getAllOfflineReports();
    return reports ? reports.length : 0;
  } catch {
    return 0;
  }
};

/**
 * Delete a specific report from IndexedDB after successful server sync
 */
export const deleteOfflineReport = async (id) => {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => {
        resolve(true);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  } catch {
    try {
      const fallbackKey = 'dfy_offline_queue_fallback';
      const existing = JSON.parse(localStorage.getItem(fallbackKey) || '[]');
      const filtered = existing.filter(item => item.id !== id);
      localStorage.setItem(fallbackKey, JSON.stringify(filtered));
      return true;
    } catch {
      return false;
    }
  }
};

/**
 * Auto-sync all queued offline reports to backend
 */
export const syncAllOfflineReports = async (apiBaseUrl, onReportSynced) => {
  const pendingReports = await getAllOfflineReports();
  if (!pendingReports || pendingReports.length === 0) {
    return { syncedCount: 0, failedCount: 0 };
  }

  let syncedCount = 0;
  let failedCount = 0;

  for (const item of pendingReports) {
    try {
      const response = await fetch(`${apiBaseUrl}/submit-daily-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload)
      });

      if (response.ok) {
        const resData = await response.json().catch(() => ({}));
        await deleteOfflineReport(item.id);
        syncedCount++;
        if (onReportSynced) {
          onReportSynced(item, resData);
        }
      } else {
        failedCount++;
      }
    } catch (err) {
      console.warn(`Failed to sync offline report ${item.id}:`, err);
      failedCount++;
      break; // Stop syncing remaining if network is still down
    }
  }

  return { syncedCount, failedCount };
};

/**
 * Save district notification registry into IndexedDB with localStorage fallback
 * @param {string} district - Canonical or raw district name
 * @param {Object} registryMap - Map of patientId -> { date, fo_name }
 * @param {number} [totalCount] - Total count of notifications
 * @returns {Promise<Object|null>} The saved registry record
 */
export const saveDistrictRegistry = async (district, registryMap, totalCount) => {
  const cleanDist = String(district || '').trim();
  if (!cleanDist) return null;

  const count = typeof totalCount === 'number'
    ? totalCount
    : Object.keys(registryMap || {}).length;

  const record = {
    district: cleanDist,
    registry: registryMap || {},
    total_count: count,
    updated_at: Date.now()
  };

  const lsKey = `dfy_notif_reg_${cleanDist.toLowerCase()}`;

  // Always mirror to localStorage as fallback
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(lsKey, JSON.stringify(record));
    }
  } catch (lsErr) {
    console.warn('Failed to save district registry to localStorage:', lsErr);
  }

  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(REGISTRY_STORE_NAME, 'readwrite');
      const store = tx.objectStore(REGISTRY_STORE_NAME);
      const request = store.put(record);

      request.onsuccess = () => {
        resolve(record);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.warn('Failed to save district registry to IndexedDB, using localStorage fallback:', error);
    return record;
  }
};

/**
 * Retrieve district notification registry from IndexedDB, falling back to localStorage
 * @param {string} district - District name to look up
 * @returns {Promise<Object|null>} The registry record or null if not found
 */
export const getDistrictRegistry = async (district) => {
  const cleanDist = String(district || '').trim();
  if (!cleanDist) return null;

  const lsKey = `dfy_notif_reg_${cleanDist.toLowerCase()}`;

  try {
    const db = await openOfflineDB();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(REGISTRY_STORE_NAME, 'readonly');
      const store = tx.objectStore(REGISTRY_STORE_NAME);
      const request = store.get(cleanDist);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });

    if (result && result.registry) {
      return result;
    }

    // Secondary IndexedDB check: case-insensitive match if exact key didn't match
    const allDocs = await new Promise((resolve) => {
      try {
        const tx = db.transaction(REGISTRY_STORE_NAME, 'readonly');
        const store = tx.objectStore(REGISTRY_STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
    const matched = allDocs.find(d => String(d.district).toLowerCase() === cleanDist.toLowerCase());
    if (matched && matched.registry) {
      return matched;
    }
  } catch (error) {
    console.warn('Error reading district registry from IndexedDB, trying localStorage:', error);
  }

  // Fallback to localStorage
  try {
    if (typeof localStorage !== 'undefined') {
      const fallbackData = localStorage.getItem(lsKey);
      if (fallbackData) {
        return JSON.parse(fallbackData);
      }
    }
  } catch (lsErr) {
    console.warn('Error reading district registry from localStorage fallback:', lsErr);
  }

  return null;
};

/**
 * Check if a patient ID is already notified in a given district
 * @param {string} district - District name
 * @param {string|number} patientId - Patient ID to check
 * @returns {Promise<{ notified: boolean, date?: string, fo_name?: string }>}
 */
export const isPatientIdNotified = async (district, patientId) => {
  if (!district || !patientId) {
    return { notified: false };
  }

  const cleanPid = String(patientId).trim();
  if (!cleanPid) {
    return { notified: false };
  }

  try {
    const regDoc = await getDistrictRegistry(district);
    if (!regDoc || !regDoc.registry) {
      return { notified: false };
    }

    const entry = regDoc.registry[cleanPid]
      || regDoc.registry[cleanPid.toUpperCase()]
      || regDoc.registry[cleanPid.toLowerCase()];

    if (entry) {
      if (typeof entry === 'object' && entry !== null) {
        return {
          notified: true,
          date: entry.date,
          fo_name: entry.fo_name
        };
      }
      return { notified: true };
    }
  } catch (error) {
    console.warn('Error checking patient ID notification status:', error);
  }

  return { notified: false };
};

// =========================================================================
// --- 3-Month FO 75% Indicator Cohort Cache & '+1' Incremental Delta Engine ---
// =========================================================================

/**
 * Generates canonical storage key per Field Officer & District
 */
export const getCohortFoKey = (district, foName) => {
  const cleanDist = String(district || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  const cleanFo = String(foName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  if (!cleanDist || !cleanFo) return '';
  return `dfy_cohort_3m_${cleanDist}_${cleanFo}`;
};

/**
 * Saves FO 3-month cohort compliance snapshot to IndexedDB with localStorage fallback
 */
export const saveFoCohortCache = async (district, foName, cacheDoc) => {
  const foKey = getCohortFoKey(district, foName);
  if (!foKey || !cacheDoc) return null;

  const record = {
    ...cacheDoc,
    fo_key: foKey,
    client_updated_at: Date.now()
  };

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(foKey, JSON.stringify(record));
    }
  } catch (lsErr) {
    console.warn('Failed to mirror FO cohort cache to localStorage:', lsErr);
  }

  try {
    const db = await openOfflineDB();
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(COHORT_STORE_NAME, 'readwrite');
        const store = tx.objectStore(COHORT_STORE_NAME);
        const req = store.put(record);
        req.onsuccess = () => resolve(record);
        req.onerror = () => resolve(record);
      } catch {
        resolve(record);
      }
    });
  } catch {
    return record;
  }
};

/**
 * Retrieves FO 3-month cohort compliance snapshot from IndexedDB or localStorage
 */
export const getFoCohortCache = async (district, foName) => {
  const foKey = getCohortFoKey(district, foName);
  if (!foKey) return null;

  try {
    const db = await openOfflineDB();
    const idbRes = await new Promise((resolve) => {
      try {
        const tx = db.transaction(COHORT_STORE_NAME, 'readonly');
        const store = tx.objectStore(COHORT_STORE_NAME);
        const req = store.get(foKey);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    if (idbRes && idbRes.months_data) {
      return idbRes;
    }
  } catch {
    // Fall back to localStorage
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(foKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.months_data) return parsed;
      }
    }
  } catch (e) {
    console.warn('Error reading FO cohort cache from localStorage:', e);
  }

  return null;
};

/**
 * Merges server response (`NO_CHANGE`, `DELTA`, or `FULL`) into existing phone cache.
 * Automatically prunes any months older than the active 3-month rolling window.
 */
export const mergeServerCohortSync = (existingCache, serverPayload, district, foName) => {
  const foKey = getCohortFoKey(district, foName);
  if (!serverPayload || !serverPayload.success) return existingCache;

  const targetMonths = Array.isArray(serverPayload.months) && serverPayload.months.length > 0
    ? serverPayload.months
    : (existingCache?.months || []);

  const baseMonthsData = {};
  const prevMonthsData = existingCache?.months_data || {};

  // Carry over only valid 3-month rolling window months (prunes >3m old data cleanly)
  targetMonths.forEach((m) => {
    baseMonthsData[m] = {
      patients: { ...(prevMonthsData[m]?.patients || {}) }
    };
  });

  if (serverPayload.mode === 'NO_CHANGE') {
    return {
      ...(existingCache || {}),
      fo_key: foKey,
      months: targetMonths,
      months_data: baseMonthsData,
      server_kpi_count: serverPayload.server_kpi_count ?? existingCache?.server_kpi_count ?? 0,
      server_synced_at: serverPayload.server_synced_at || existingCache?.server_synced_at,
      client_updated_at: Date.now()
    };
  }

  if (serverPayload.mode === 'DELTA') {
    const updatedList = Array.isArray(serverPayload.updated_patients) ? serverPayload.updated_patients : [];
    updatedList.forEach((pt) => {
      const pid = String(pt?.id || '').trim();
      const m = pt?.month;
      if (!pid || !m || !baseMonthsData[m]) return;
      baseMonthsData[m].patients[pid] = {
        date: pt.date || '',
        name: pt.name || baseMonthsData[m].patients[pid]?.name || '',
        phone: pt.phone || baseMonthsData[m].patients[pid]?.phone || '',
        hiv: Boolean(pt.hiv),
        udst: Boolean(pt.udst),
        dbt: Boolean(pt.dbt),
        ct: Boolean(pt.ct)
      };
    });

    return {
      ...(existingCache || {}),
      fo_key: foKey,
      months: targetMonths,
      months_data: baseMonthsData,
      server_kpi_count: serverPayload.server_kpi_count ?? existingCache?.server_kpi_count ?? 0,
      server_synced_at: serverPayload.server_synced_at || existingCache?.server_synced_at,
      client_updated_at: Date.now()
    };
  }

  // Mode FULL
  const fullData = serverPayload.months_data || {};
  const cleanMonthsData = {};
  targetMonths.forEach((m) => {
    cleanMonthsData[m] = {
      patients: { ...(fullData[m]?.patients || {}) }
    };
  });

  return {
    fo_key: foKey,
    months: targetMonths,
    months_data: cleanMonthsData,
    server_kpi_count: serverPayload.server_kpi_count ?? 0,
    server_synced_at: serverPayload.server_synced_at || new Date().toISOString(),
    client_updated_at: Date.now()
  };
};

/**
 * '+1 Formula': Immediately updates phone's local 3-month cohort cache when FO submits a report
 * or adds patient IDs — zero full reload needed, works 100% offline.
 */
export const applyOptimisticCohortPlusOne = (existingCache, reportFormData, activeOpMonth, district, foName) => {
  const foKey = getCohortFoKey(district, foName);
  if (!foKey || !reportFormData) return existingCache;

  const months = Array.isArray(existingCache?.months) && existingCache.months.length > 0
    ? [...existingCache.months]
    : [activeOpMonth].filter(Boolean);

  const nextMonthsData = {};
  months.forEach((m) => {
    nextMonthsData[m] = {
      patients: { ...(existingCache?.months_data?.[m]?.patients || {}) }
    };
  });

  const repDate = String(reportFormData.date_of_reporting || reportFormData.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const notifMonth = (repDate.length >= 7 ? repDate.slice(0, 7) : activeOpMonth) || months[0];

  // Ensure notification month exists in cache if within window
  if (notifMonth && nextMonthsData[notifMonth]) {
    const notifIds = Array.isArray(reportFormData.notification_ids) ? reportFormData.notification_ids : [];
    notifIds.forEach((rawId) => {
      const pid = String(rawId || '').trim().split('.')[0];
      if (pid.length < 5) return;
      if (!nextMonthsData[notifMonth].patients[pid]) {
        nextMonthsData[notifMonth].patients[pid] = {
          date: repDate,
          name: '',
          phone: '',
          hiv: false,
          udst: false,
          dbt: false,
          ct: false
        };
      }
    });
  }

  // Flip indicator flags (+1) across any of the 3 cached months where the patient was notified
  const indicatorMappings = [
    ['hiv_dm_ids', 'hiv'],
    ['sample_tested_ids', 'udst'],
    ['dbt_ids', 'dbt'],
    ['contact_tracing_ids', 'ct']
  ];

  indicatorMappings.forEach(([formKey, flagKey]) => {
    const ids = Array.isArray(reportFormData[formKey]) ? reportFormData[formKey] : [];
    ids.forEach((rawId) => {
      const pid = String(rawId || '').trim().split('.')[0];
      if (pid.length < 5) return;
      Object.keys(nextMonthsData).forEach((mKey) => {
        if (nextMonthsData[mKey]?.patients?.[pid]) {
          nextMonthsData[mKey].patients[pid] = {
            ...nextMonthsData[mKey].patients[pid],
            [flagKey]: true
          };
        }
      });
    });
  });

  return {
    ...(existingCache || {}),
    fo_key: foKey,
    months,
    months_data: nextMonthsData,
    client_updated_at: Date.now()
  };
};

/**
 * Computes exact 75% cohort compliance stats for a single month's patient map.
 */
export const computeMonthCohortStats = (monthPatientsMap) => {
  const entries = Object.entries(monthPatientsMap || {});
  const totalNotified = entries.length;
  const target75 = totalNotified > 0 ? Math.ceil(totalNotified * 0.75) : 0;

  const counts = { hiv: 0, udst: 0, dbt: 0, ct: 0 };
  const pendingByIndicator = { hiv: [], udst: [], dbt: [], ct: [] };

  entries.forEach(([pid, pt]) => {
    const row = { id: pid, ...pt };
    if (pt.hiv) counts.hiv += 1; else pendingByIndicator.hiv.push(row);
    if (pt.udst) counts.udst += 1; else pendingByIndicator.udst.push(row);
    if (pt.dbt) counts.dbt += 1; else pendingByIndicator.dbt.push(row);
    if (pt.ct) counts.ct += 1; else pendingByIndicator.ct.push(row);
  });

  const buildMetric = (key) => {
    const done = counts[key];
    const pct = totalNotified > 0 ? Math.round((done / totalNotified) * 100) : 0;
    const neededFor75 = totalNotified > 0 ? Math.max(0, target75 - done) : 0;
    const achieved = totalNotified > 0 && pct >= 75;
    return {
      key,
      done,
      total: totalNotified,
      pct,
      target75,
      neededFor75,
      achieved,
      pendingPatients: pendingByIndicator[key]
    };
  };

  const indicators = {
    hiv: buildMetric('hiv'),
    udst: buildMetric('udst'),
    dbt: buildMetric('dbt'),
    ct: buildMetric('ct')
  };

  const achievedCount = Object.values(indicators).filter((i) => i.achieved).length;

  return {
    totalNotified,
    target75,
    achievedCount,
    indicators
  };
};
