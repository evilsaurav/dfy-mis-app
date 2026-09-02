// --- DFY MIS IndexedDB Offline Queue Engine ---
const DB_NAME = 'DFY_MIS_OFFLINE_DB';
const DB_VERSION = 1;
const STORE_NAME = 'offline_reports_queue';

export const openOfflineDB = () => {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB is not supported on this device.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('fo_name', 'fo_name', { unique: false });
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
    } catch (e) {
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
    } catch (e) {
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
  } catch (e) {
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
  } catch (error) {
    try {
      const fallbackKey = 'dfy_offline_queue_fallback';
      const existing = JSON.parse(localStorage.getItem(fallbackKey) || '[]');
      const filtered = existing.filter(item => item.id !== id);
      localStorage.setItem(fallbackKey, JSON.stringify(filtered));
      return true;
    } catch (e) {
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
        await deleteOfflineReport(item.id);
        syncedCount++;
        if (onReportSynced) {
          onReportSynced(item);
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