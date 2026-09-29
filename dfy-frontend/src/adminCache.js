// --- DFY MIS Admin Dashboard IndexedDB High-Capacity Storage Engine ---
// Solves browser 5MB localStorage QuotaExceededError by storing monthly state in IndexedDB (50MB+ capacity).

const DB_NAME = 'DFY_ADMIN_CACHE_DB';
const DB_VERSION = 1;
const STORE_NAME = 'dashboard_cache';

const openCacheDB = () => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
};

/**
 * Retrieve cached dashboard data from IndexedDB with transparent localStorage fallback.
 */
export const getCachedDashboardData = async (key) => {
  try {
    const db = await openCacheDB();
    if (!db) {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => {
          if (req.result) {
            resolve(req.result);
          } else {
            // Check legacy localStorage entry for migration
            try {
              const raw = localStorage.getItem(key);
              resolve(raw ? JSON.parse(raw) : null);
            } catch (e) {
              resolve(null);
            }
          }
        };
        req.onerror = () => {
          try {
            const raw = localStorage.getItem(key);
            resolve(raw ? JSON.parse(raw) : null);
          } catch (e) {
            resolve(null);
          }
        };
      } catch (txErr) {
        try {
          const raw = localStorage.getItem(key);
          resolve(raw ? JSON.parse(raw) : null);
        } catch (e) {
          resolve(null);
        }
      }
    });
  } catch (err) {
    return null;
  }
};

/**
 * Save dashboard records into IndexedDB without blocking the main UI thread.
 */
export const setCachedDashboardData = async (key, data) => {
  try {
    const db = await openCacheDB();
    if (!db) {
      try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {}
      return false;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(data, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (txErr) {
        resolve(false);
      }
    });
  } catch (err) {
    console.warn('[AdminCache] IndexedDB save notice:', err);
    return false;
  }
};

/**
 * Delete a specific month key from both IndexedDB and localStorage.
 */
export const clearCachedDashboardData = async (key) => {
  try {
    try { localStorage.removeItem(key); } catch (e) {}
    const db = await openCacheDB();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (txErr) {
        resolve(false);
      }
    });
  } catch (err) {}
};

/**
 * Completely purge all admin cached data on hard app reset.
 */
export const clearAllAdminCache = async () => {
  try {
    const db = await openCacheDB();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (txErr) {
        resolve(false);
      }
    });
  } catch (err) {}
};
