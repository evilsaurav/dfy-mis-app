// --- DFY MIS IndexedDB Offline Queue Engine ---
export const DB_NAME = 'DFY_MIS_OFFLINE_DB';
export const DB_VERSION = 2;
export const STORE_NAME = 'offline_reports_queue';
export const REGISTRY_STORE_NAME = 'district_notified_registry';

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