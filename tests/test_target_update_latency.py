import time
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from main import app, create_access_token

client = TestClient(app)

def test_target_endpoints_latency_sub_500ms():
    """
    Benchmarks single and bulk target update operations to mathematically
    prove that execution time is well under 500ms (preventing the 5-minute lag regression).
    """
    token = create_access_token({"sub": "admin", "role": "SUPER_ADMIN", "name": "Super Admin"})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Benchmark Single Staff Target Update
    start = time.perf_counter()
    res1 = client.post("/update-target", json={
        "district": "Patna",
        "fo_name": "Test Officer",
        "target": 45,
        "month": "2026-10"
    }, headers=headers)
    elapsed1 = (time.perf_counter() - start) * 1000
    assert res1.status_code == 200, res1.text
    assert res1.json()["success"] is True
    print(f"\n[BENCHMARK] /update-target took {elapsed1:.2f}ms (target < 500ms)")
    assert elapsed1 < 500, f"/update-target too slow: {elapsed1:.2f}ms"

    # 2. Benchmark Single District Target Update
    start = time.perf_counter()
    res2 = client.post("/update-district-target", json={
        "district": "Patna",
        "official_target": 250,
        "month": "2026-10"
    }, headers=headers)
    elapsed2 = (time.perf_counter() - start) * 1000
    assert res2.status_code == 200, res2.text
    assert res2.json()["success"] is True
    print(f"[BENCHMARK] /update-district-target took {elapsed2:.2f}ms (target < 500ms)")
    assert elapsed2 < 500, f"/update-district-target too slow: {elapsed2:.2f}ms"

    # 3. Benchmark Bulk District Target Update (All 38 Bihar Districts)
    bihar_districts = [
        "Araria", "Arwal", "Aurangabad", "Banka", "Begusarai", "Bhagalpur", "Bhojpur", "Buxar",
        "Darbhanga", "East Champaran", "Gaya", "Gopalganj", "Jamui", "Jehanabad", "Kaimur",
        "Katihar", "Khagaria", "Kishanganj", "Lakhisarai", "Madhepura", "Madhubani", "Munger",
        "Muzaffarpur", "Nalanda", "Nawada", "Patna", "Purnia", "Rohtas", "Saharsa", "Samastipur",
        "Saran", "Sheikhpura", "Sheohar", "Sitamarhi", "Siwan", "Supaul", "Vaishali", "West Champaran"
    ]
    bulk_dist_payload = {
        "month": "2026-10",
        "targets": [{"district": d, "official_target": 200} for d in bihar_districts]
    }
    start = time.perf_counter()
    res3 = client.post("/update-district-targets-bulk", json=bulk_dist_payload, headers=headers)
    elapsed3 = (time.perf_counter() - start) * 1000
    assert res3.status_code == 200, res3.text
    assert res3.json()["success"] is True
    print(f"[BENCHMARK] /update-district-targets-bulk (38 districts) took {elapsed3:.2f}ms (target < 500ms)")
    assert elapsed3 < 500, f"/update-district-targets-bulk too slow: {elapsed3:.2f}ms"

    # 4. Benchmark Bulk Staff Target Update (100 Field Officers across Bihar)
    bulk_staff_payload = {
        "month": "2026-10",
        "targets": [
            {"district": bihar_districts[i % len(bihar_districts)], "fo_name": f"Officer_{i}", "target": 35}
            for i in range(100)
        ]
    }
    start = time.perf_counter()
    res4 = client.post("/update-targets-bulk", json=bulk_staff_payload, headers=headers)
    elapsed4 = (time.perf_counter() - start) * 1000
    assert res4.status_code == 200, res4.text
    assert res4.json()["success"] is True
    print(f"[BENCHMARK] /update-targets-bulk (100 staff) took {elapsed4:.2f}ms (target < 500ms)")
    assert elapsed4 < 500, f"/update-targets-bulk too slow: {elapsed4:.2f}ms"
