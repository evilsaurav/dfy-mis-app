import os
import sys
import time
import json
import requests
from dotenv import load_dotenv

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
load_dotenv()

from backend.core.security import create_access_token

def verify_live_render():
    url_base = "https://dfy-mis-app.onrender.com"
    token = create_access_token({
        "user_id": "test_superadmin",
        "username": "superadmin",
        "name": "Super Admin Master",
        "role": "SUPER_ADMIN",
        "allowed_districts": ["All"]
    })
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    print("Waiting 70 seconds for Render to build and redeploy commit 9e80764...")
    for remaining in range(70, 0, -10):
        print(f"  {remaining}s remaining...")
        time.sleep(10)

    print("\nProbing GET / until healthy on live Render...")
    for attempt in range(1, 15):
        try:
            r = requests.get(f"{url_base}/", timeout=10)
            if r.status_code == 200:
                print(f"Render is LIVE! Status: {r.status_code}")
                print(f"GET / Raw Response: {r.text}")
                break
        except Exception as e:
            print(f"Attempt {attempt}: {e}, waiting 5s...")
            time.sleep(5)

    print("\nExecuting live production call: POST /admin/backup/trigger-now...")
    t0 = time.time()
    try:
        resp = requests.post(
            f"{url_base}/admin/backup/trigger-now",
            headers=headers,
            timeout=120
        )
        elapsed = time.time() - t0
        print(f"HTTP Status Code: {resp.status_code}")
        print(f"Elapsed Time:     {elapsed:.2f} seconds")
        print("Raw Response Headers:")
        for k, v in resp.headers.items():
            print(f"  {k}: {v}")
        print("\nRaw Response Body:")
        print(resp.text)
    except Exception as exc:
        print(f"Request failed: {exc}")

if __name__ == "__main__":
    verify_live_render()
