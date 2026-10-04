import os
import json
import time
import threading
from typing import Dict, Any, Tuple, Optional, List

class SimpleTTLCache:
    def __init__(self, default_ttl: int = 300, disk_persist_dir: Optional[str] = None):
        self._cache: Dict[str, Tuple[float, Any]] = {}
        self.default_ttl = default_ttl
        self._disk_dir = disk_persist_dir or os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "cache")
        self._disk_path = os.path.join(self._disk_dir, "l2_persistent_cache.json")
        self._lock = threading.Lock()
        self._disk_lock = threading.Lock()
        # self._hydrate_from_disk()  # Disabled: ephemeral Render instances make disk hydration redundant

    def _hydrate_from_disk(self):
        try:
            if os.path.exists(self._disk_path):
                with open(self._disk_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                now = time.time()
                loaded = 0
                for k, v in data.items():
                    exp = v.get("exp", 0)
                    if exp > now:
                        self._cache[k] = (exp, v.get("val"))
                        loaded += 1
                if loaded:
                    print(f"[L2 Cache Engine] Hydrated {loaded} unexpired cache entries from disk (0 cold-start Firestore reads).")
        except Exception as e:
            print(f"[L2 Cache Engine Notice] Disk hydration notice: {e}")

    def _flush_to_disk_sync(self):
        if not hasattr(self, "_disk_lock") or not self._disk_lock.acquire(blocking=False):
            return
        try:
            os.makedirs(self._disk_dir, exist_ok=True)
            now = time.time()
            items_to_save = []
            with self._lock:
                for k, (exp, val) in self._cache.items():
                    if exp > now:
                        # Only persist lightweight directory and registry entries (exclude massive monthly raw reports to protect Render RAM)
                        if any(k.startswith(p) for p in ["staff_directory", "staff_targets", "dist_notif_registry_"]):
                            items_to_save.append((k, exp, val))
            
            # Serialize OUTSIDE lock so other requests never stall waiting for lock
            data_to_save = {}
            for k, exp, val in items_to_save:
                try:
                    data_to_save[k] = {"exp": exp, "val": val}
                except Exception:
                    pass

            if data_to_save:
                import uuid
                tmp_file = os.path.join(self._disk_dir, f"l2_cache_{uuid.uuid4().hex[:8]}.tmp")
                with open(tmp_file, "w", encoding="utf-8") as f:
                    json.dump(data_to_save, f, default=str)
                try:
                    os.replace(tmp_file, self._disk_path)
                except Exception:
                    if os.path.exists(tmp_file):
                        try:
                            os.remove(tmp_file)
                        except Exception:
                            pass
        except Exception as e:
            print(f"[L2 Cache Engine Notice] Disk flush notice: {e}")
        finally:
            try:
                self._disk_lock.release()
            except Exception:
                pass

    def get(self, key: str):
        with self._lock:
            if key in self._cache:
                exp, val = self._cache[key]
                if time.time() < exp:
                    return val
                else:
                    del self._cache[key]
        return None

    def set(self, key: str, val: Any, ttl: Optional[int] = None, persist: bool = False):
        t = ttl if ttl is not None else self.default_ttl
        with self._lock:
            self._cache[key] = (time.time() + t, val)
        # Disk flush disabled to eliminate disk I/O on ephemeral instances
        # if persist or any(key.startswith(p) for p in ["staff_directory", "staff_targets", "dist_notif_registry_"]):
        #     try:
        #         threading.Thread(target=self._flush_to_disk_sync, daemon=True).start()
        #     except Exception:
        #         pass

    def delete(self, key: str):
        with self._lock:
            if key in self._cache:
                del self._cache[key]

    def delete_prefix(self, prefix: str):
        with self._lock:
            keys_to_del = [k for k in self._cache if k.startswith(prefix)]
            for k in keys_to_del:
                del self._cache[k]

    def get_keys_with_prefix(self, prefix: str) -> List[str]:
        with self._lock:
            now = time.time()
            return [k for k, (exp, _) in self._cache.items() if k.startswith(prefix) and exp > now]

    def clear(self):
        with self._lock:
            self._cache.clear()
        try:
            if os.path.exists(self._disk_path):
                os.remove(self._disk_path)
        except Exception:
            pass

cache = SimpleTTLCache(default_ttl=300)
ACTIVE_MONTHLY_CACHE_KEYS: List[str] = []
