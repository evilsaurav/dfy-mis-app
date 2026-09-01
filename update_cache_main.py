with open("main.py", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

# Check if cache already in text
if "class SimpleTTLCache:" not in text:
    cache_def = """import time
import asyncio
from typing import Dict, Any, Tuple

class SimpleTTLCache:
    def __init__(self, default_ttl: int = 30):
        self._cache: Dict[str, Tuple[float, Any]] = {}
        self.default_ttl = default_ttl

    def get(self, key: str):
        if key in self._cache:
            exp, val = self._cache[key]
            if time.time() < exp:
                return val
            else:
                del self._cache[key]
        return None

    def set(self, key: str, val: Any, ttl: Optional[int] = None):
        t = ttl if ttl is not None else self.default_ttl
        self._cache[key] = (time.time() + t, val)

    def delete(self, key: str):
        if key in self._cache:
            del self._cache[key]

    def delete_prefix(self, prefix: str):
        keys_to_del = [k for k in self._cache if k.startswith(prefix)]
        for k in keys_to_del:
            del self._cache[k]

    def clear(self):
        self._cache.clear()

cache = SimpleTTLCache(default_ttl=30)
"""
    # Insert right after db = firestore.client()
    db_marker = "db = firestore.client()\n"
    if db_marker in text:
        text = text.replace(db_marker, db_marker + "\n" + cache_def + "\n")
    else:
        print("db marker not found")

# Update verify_pin
old_verify_pin = """@app.post("/verify-pin")
async def verify_pin(data: PinCheck):
    try:
        doc_id = f"{data.working_place}_{data.fo_name}".replace(" ", "").lower()
        staff_doc = db.collection("staff_directory").document(doc_id).get()
        
        if not staff_doc.exists:
            return {"valid": False}
            
        real_pin = staff_doc.to_dict().get("pin")
        if str(data.pin) == str(real_pin):
            return {"valid": True}
        return {"valid": False}
    except Exception:
        return {"valid": False}"""

new_verify_pin = """@app.post("/verify-pin")
async def verify_pin(data: PinCheck):
    try:
        doc_id = f"{data.working_place}_{data.fo_name}".replace(" ", "").lower()
        cache_key = f"pin_{doc_id}"
        cached_pin = cache.get(cache_key)
        
        if cached_pin is not None:
            return {"valid": str(data.pin) == str(cached_pin)}

        staff_doc = await asyncio.to_thread(db.collection("staff_directory").document(doc_id).get)
        
        if not staff_doc.exists:
            return {"valid": False}
            
        real_pin = staff_doc.to_dict().get("pin")
        cache.set(cache_key, str(real_pin), ttl=300) # 5 min cache
        if str(data.pin) == str(real_pin):
            return {"valid": True}
        return {"valid": False}
    except Exception:
        return {"valid": False}"""

if old_verify_pin in text:
    text = text.replace(old_verify_pin, new_verify_pin)
    print("verify_pin updated")
else:
    print("old_verify_pin not found")

# Update check_today_status
old_check_today = """@app.post("/check-today-status")
async def check_today_status(req: CheckStatusRequest):
    try:
        doc_id = f"{req.working_place}_{req.fo_name}_{req.date}".replace(" ", "_").lower()
        doc_ref = db.collection("daily_field_reports").document(doc_id)
        doc = doc_ref.get()
        if doc.exists:
            d = doc.to_dict()
            subs = d.get("submission_count", 0)
            if subs >= 2:
                return {"status": "max_limit_reached"}
            elif subs == 1:
                return {"status": "not_started", "data": {}}
            else:
                return {"status": d.get("status", "in_progress"), "data": d}
        return {"status": "not_started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))"""

new_check_today = """@app.post("/check-today-status")
async def check_today_status(req: CheckStatusRequest):
    try:
        doc_id = f"{req.working_place}_{req.fo_name}_{req.date}".replace(" ", "_").lower()
        cache_key = f"status_{doc_id}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        doc_ref = db.collection("daily_field_reports").document(doc_id)
        doc = await asyncio.to_thread(doc_ref.get)
        
        res = {"status": "not_started"}
        if doc.exists:
            d = doc.to_dict()
            subs = d.get("submission_count", 0)
            if subs >= 2:
                res = {"status": "max_limit_reached"}
            elif subs == 1:
                res = {"status": "not_started", "data": {}}
            else:
                res = {"status": d.get("status", "in_progress"), "data": d}
                
        cache.set(cache_key, res, ttl=20) # 20s TTL cache for rapid checking
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))"""

if old_check_today in text:
    text = text.replace(old_check_today, new_check_today)
    print("check_today_status updated")
else:
    print("old_check_today not found")

# Update staff_directory
old_staff_dir = """@app.get("/staff-directory")
async def get_staff_directory():
    try:
        docs = db.collection("staff_directory").stream()
        directory = {}
        for doc in docs:
            data = doc.to_dict()
            district = data.get("district")
            name = data.get("name")
            if district and name:
                if district not in directory:
                    directory[district] = []
                directory[district].append(name)
        
        # Sort names within districts
        for d in directory:
            directory[d] = sorted(directory[d])
            
        # Return sorted by district name too if preferred, but dict is fine
        return {"status": "success", "data": directory}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))"""

new_staff_dir = """@app.get("/staff-directory")
async def get_staff_directory():
    try:
        cached = cache.get("staff_directory_list")
        if cached is not None:
            return {"status": "success", "data": cached}

        docs = await asyncio.to_thread(lambda: list(db.collection("staff_directory").stream()))
        directory = {}
        for doc in docs:
            data = doc.to_dict()
            district = data.get("district")
            name = data.get("name")
            if district and name:
                if district not in directory:
                    directory[district] = []
                directory[district].append(name)
        
        for d in directory:
            directory[d] = sorted(directory[d])
            
        cache.set("staff_directory_list", directory, ttl=300) # 5 min cache
        return {"status": "success", "data": directory}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))"""

if old_staff_dir in text:
    text = text.replace(old_staff_dir, new_staff_dir)
    print("staff_directory updated")
else:
    print("old_staff_dir not found")

# Invalidate cache on submit_daily_report
submit_marker = 'doc_ref.set(payload, merge=True)'
if submit_marker in text:
    text = text.replace(
        submit_marker,
        submit_marker + '\n        cache.delete(f"status_{doc_id}")\n        cache.delete_prefix("profile_")\n        cache.delete_prefix("dash_")'
    )
    print("submit_daily_report cache invalidation added")

with open("main.py", "w", encoding="utf-8") as f:
    f.write(text)

