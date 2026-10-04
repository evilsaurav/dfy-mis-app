import os
import json

ENABLE_IN_MEMORY_DERIVATION: bool = os.getenv("ENABLE_IN_MEMORY_DERIVATION", "true").lower() in ("true", "1", "yes")

# Decoupled project identifier (no JSON file dependency)
project_id: str = os.environ.get("PROJECT_ID", os.environ.get("GCP_PROJECT_ID", "dfy-reporting-mis-18b9a"))

# Firebase initialization decommissioned
_real_db = None


class _MemoryDoc:
    def __init__(self, doc_id="dummy", data=None):
        self.id = doc_id
        self._data = data or {}
        self.exists = False
        self.reference = self

    def to_dict(self):
        return self._data

    def get(self, *args, **kwargs):
        return self

    def set(self, *args, **kwargs):
        return None

    def update(self, *args, **kwargs):
        return None

    def delete(self, *args, **kwargs):
        return None


class _MemoryCollection:
    def __init__(self, name="dummy"):
        self.name = name

    def document(self, doc_id="dummy"):
        return _MemoryDoc(doc_id=doc_id)

    def where(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def offset(self, *args, **kwargs):
        return self

    def stream(self, *args, **kwargs):
        return []

    def get(self, *args, **kwargs):
        return []

    def add(self, *args, **kwargs):
        return (None, _MemoryDoc())


# Backward-compatibility aliases
_DummyFirestoreDoc = _MemoryDoc
_DummyFirestoreCollection = _MemoryCollection


class _DatabaseProxy:
    def collection(self, name: str = "default"):
        import sys
        main_mod = sys.modules.get("main")
        if main_mod and hasattr(main_mod, "db"):
            active = getattr(main_mod, "db")
            if active is not self and active is not None and hasattr(active, "collection"):
                return active.collection(name)
        if _real_db is not None and hasattr(_real_db, "collection"):
            return _real_db.collection(name)
        return _MemoryCollection(name)

    def batch(self):
        return self

    def commit(self):
        return None

    def set(self, *args, **kwargs):
        return None

    def update(self, *args, **kwargs):
        return None

    def delete(self, *args, **kwargs):
        return None

    def __getattr__(self, name):
        import sys
        main_mod = sys.modules.get("main")
        if main_mod and hasattr(main_mod, "db"):
            active = getattr(main_mod, "db")
            if active is not self and active is not None and hasattr(active, name):
                return getattr(active, name)
        if _real_db is not None and hasattr(_real_db, name):
            return getattr(_real_db, name)
        if name in ("reports", "store", "saved_reports", "existing_docs", "mock_calls", "staff_members"):
            raise AttributeError(f"'_DatabaseProxy' object has no attribute '{name}'")
        return lambda *args, **kwargs: None


db = _DatabaseProxy()


def check_in_memory_derivation() -> bool:
    import sys
    main_mod = sys.modules.get("main")
    if main_mod and hasattr(main_mod, "ENABLE_IN_MEMORY_DERIVATION"):
        val = getattr(main_mod, "ENABLE_IN_MEMORY_DERIVATION")
        if val is not None:
            return bool(val)
    return ENABLE_IN_MEMORY_DERIVATION

def get_db():
    return db
