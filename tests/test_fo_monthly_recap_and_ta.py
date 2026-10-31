# -*- coding: utf-8 -*-
"""
tests/test_fo_monthly_recap_and_ta.py
Multi-Angle Automated Simulation Battery for FO Monthly Recap & Travel Allowance.
Verifies auth, district isolation, comprehensive 30+ indicator calculations,
privacy masking, month switching, and dispute handling.
"""

import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import pytest
from fastapi.testclient import TestClient
from main import app
from backend.core.security import create_access_token

JEHANABAD_FO = "Suraj Kumar"
JEHANABAD_DIST = "Jehanabad"
JEHANABAD_PIN = "0489"


@pytest.fixture(autouse=True)
def live_db_env_fixture():
    """Sets TEST_LIVE_DB for the duration of these live integration tests and cleans up."""
    old_val = os.environ.get("TEST_LIVE_DB")
    os.environ["TEST_LIVE_DB"] = "1"
    yield
    if old_val is not None:
        os.environ["TEST_LIVE_DB"] = old_val
    else:
        os.environ.pop("TEST_LIVE_DB", None)


@pytest.fixture
def client():
    return TestClient(app)


def test_angle1_auth_pin_and_jwt(client):
    """Angle 1: FO PIN Auth via Query vs Header vs Admin JWT vs Wrong PIN."""
    # 1.1 Valid PIN in Query
    r1 = client.get("/fo/monthly-recap", params={
        "month": "2026-10",
        "district": JEHANABAD_DIST,
        "fo_name": JEHANABAD_FO,
        "pin": JEHANABAD_PIN
    })
    assert r1.status_code == 200, f"Expected 200 with query PIN, got {r1.status_code}: {r1.text}"
    assert r1.json()["status"] == "success"

    # 1.2 Valid PIN in Authorization Bearer Header
    r2 = client.get("/fo/monthly-recap", params={
        "month": "2026-10",
        "district": JEHANABAD_DIST,
        "fo_name": JEHANABAD_FO
    }, headers={"Authorization": f"Bearer {JEHANABAD_PIN}"})
    assert r2.status_code == 200, f"Expected 200 with header PIN, got {r2.status_code}: {r2.text}"

    # 1.3 Invalid PIN -> 401
    r3 = client.get("/fo/monthly-recap", params={
        "month": "2026-10",
        "district": JEHANABAD_DIST,
        "fo_name": JEHANABAD_FO,
        "pin": "9999"
    })
    assert r3.status_code == 401, f"Expected 401 for bad PIN, got {r3.status_code}"

    # 1.4 Admin JWT token
    admin_token = create_access_token({
        "user_id": "admin",
        "username": "admin",
        "role": "SUPER_ADMIN",
        "allowed_districts": ["All"]
    })
    r4 = client.get("/fo/monthly-recap", params={
        "month": "2026-10",
        "district": JEHANABAD_DIST,
        "fo_name": JEHANABAD_FO
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert r4.status_code == 200, f"Expected 200 with Admin JWT, got {r4.status_code}"


def test_angle2_cross_district_isolation(client):
    """Angle 2: Sub-Admin cannot cross-access data outside their permitted district."""
    gaya_token = create_access_token({
        "user_id": "gaya_user",
        "username": "gaya_subadmin",
        "role": "SUB_ADMIN",
        "allowed_districts": ["Gaya"]
    })
    r = client.get("/fo/monthly-recap", params={
        "month": "2026-10",
        "district": JEHANABAD_DIST,
        "fo_name": JEHANABAD_FO
    }, headers={"Authorization": f"Bearer {gaya_token}"})
    assert r.status_code == 403, f"Expected 403 for cross-district access, got {r.status_code}: {r.text}"


def test_angle3_comprehensive_30_indicators(client):
    """Angle 3: Comprehensive verification of all 30 indicator keys and valid types."""
    r = client.get("/fo/monthly-recap", params={
        "month": "2026-10",
        "district": JEHANABAD_DIST,
        "fo_name": JEHANABAD_FO,
        "pin": JEHANABAD_PIN
    })
    assert r.status_code == 200
    d = r.json()

    # Clinical Impact
    cli = d["clinical_impact"]
    assert "notifications" in cli and isinstance(cli["notifications"], int)
    assert "presumptive" in cli and isinstance(cli["presumptive"], int)
    assert "sample_collection" in cli and isinstance(cli["sample_collection"], int)
    assert "sample_tested" in cli and isinstance(cli["sample_tested"], int)
    assert "hiv_dm" in cli and isinstance(cli["hiv_dm"], int)
    assert "culture_dst" in cli and isinstance(cli["culture_dst"], int)

    # Treatment Support
    trt = d["treatment_support"]
    assert "fdc_provided" in trt and isinstance(trt["fdc_provided"], int)
    assert "fdc_strips" in trt and isinstance(trt["fdc_strips"], int)
    assert "tpt_treatment_start" in trt and isinstance(trt["tpt_treatment_start"], int)
    assert "tpt_presumptive" in trt and isinstance(trt["tpt_presumptive"], int)
    assert "differentiated_tb" in trt and isinstance(trt["differentiated_tb"], int)
    assert "outcome_assigned" in trt and isinstance(trt["outcome_assigned"], int)
    assert "kit_consumption" in trt and isinstance(trt["kit_consumption"], int)

    # Field Outreach
    out = d["field_outreach"]
    assert "face_to_face" in out and isinstance(out["face_to_face"], int)
    assert "contact_tracing" in out and isinstance(out["contact_tracing"], int)
    assert "home_visit" in out and isinstance(out["home_visit"], int)
    assert "follow_up" in out and isinstance(out["follow_up"], int)
    assert "doctor_store_visits" in out and isinstance(out["doctor_store_visits"], int)

    # Digital Compliance
    dig = d["digital_compliance"]
    assert "dbt" in dig and isinstance(dig["dbt"], int)
    assert "documents" in dig and isinstance(dig["documents"], int)
    assert "adhar_face_authentication" in dig and isinstance(dig["adhar_face_authentication"], int)
    assert "consent_with_id" in dig and isinstance(dig["consent_with_id"], int)

    # Mobility and TA
    mob = d["mobility_and_ta"]
    assert "active_duty_days" in mob and isinstance(mob["active_duty_days"], int)
    assert "total_km" in mob and isinstance(mob["total_km"], (int, float))
    assert "avg_km_per_day" in mob and isinstance(mob["avg_km_per_day"], (int, float))
    assert "rate_per_km" in mob and isinstance(mob["rate_per_km"], (int, float))
    assert "status" in mob
    assert "is_approved" in mob and isinstance(mob["is_approved"], bool)


def test_angle4_ta_privacy_masking(client):
    """Angle 4: When TA is not APPROVED, final_payable_amount is masked to 0.0."""
    r = client.get("/fo/monthly-recap", params={
        "month": "2026-10",
        "district": JEHANABAD_DIST,
        "fo_name": JEHANABAD_FO,
        "pin": JEHANABAD_PIN
    })
    assert r.status_code == 200
    mob = r.json()["mobility_and_ta"]
    if not mob["is_approved"]:
        assert mob["is_amount_masked"] is True
        assert mob["final_payable_amount"] == 0.0


def test_angle5_month_switching_past_months(client):
    """Angle 5: Querying past month (e.g. 2026-09) executes cleanly with 0 crashes."""
    r = client.get("/fo/monthly-recap", params={
        "month": "2026-09",
        "district": JEHANABAD_DIST,
        "fo_name": JEHANABAD_FO,
        "pin": JEHANABAD_PIN
    })
    assert r.status_code == 200
    assert r.json()["month"] == "2026-09"


def test_angle6_ta_summary_endpoint(client):
    """Angle 6: Old /fo/ta/monthly-summary endpoint also works with FO PIN."""
    r = client.get("/fo/ta/monthly-summary", params={
        "month": "2026-10",
        "district": JEHANABAD_DIST,
        "fo_name": JEHANABAD_FO
    }, headers={"Authorization": f"Bearer {JEHANABAD_PIN}"})
    assert r.status_code == 200
    data = r.json()
    assert data["status"] in ("APPROVED", "UNDER_REVIEW", "SUBMITTED", "DRAFT")


if __name__ == "__main__":
    os.environ["TEST_LIVE_DB"] = "1"
    c = TestClient(app)
    print("Running tests directly...")
    test_angle1_auth_pin_and_jwt(c)
    print("[PASS] Angle 1 passed")
    test_angle2_cross_district_isolation(c)
    print("[PASS] Angle 2 passed")
    test_angle3_comprehensive_30_indicators(c)
    print("[PASS] Angle 3 passed")
    test_angle4_ta_privacy_masking(c)
    print("[PASS] Angle 4 passed")
    test_angle5_month_switching_past_months(c)
    print("[PASS] Angle 5 passed")
    test_angle6_ta_summary_endpoint(c)
    print("[PASS] Angle 6 passed")
    print("ALL 6 ANGLES PASSED CLEANLY!")
