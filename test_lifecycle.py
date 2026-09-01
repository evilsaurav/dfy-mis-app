from fastapi.testclient import TestClient
from main import app
from datetime import datetime

client = TestClient(app)

today_str = datetime.now().strftime("%Y-%m-%d")
test_fo = "Test Auditor"
test_district = "Jamui"

print(f"=== Testing Full Submission Lifecycle for {test_fo} ({test_district}) on {today_str} ===")

# Payload 1: First submission
payload1 = {
    "date_of_reporting": today_str,
    "working_place": test_district,
    "fo_name": test_fo,
    "pin": "1234",
    "notification_ids": ["111111111", "222222222"],
    "hiv_dm_ids": ["333333333"],
    "dbt_ids": ["444444444"],
    "sample_collection_ids": ["555555555"],
    "sample_tested_ids": ["666666666"],
    "outcome_assigned_ids": [],
    "home_visit_ids": ["777777777"],
    "contact_tracing_ids": [],
    "follow_up_ids": [],
    "face_to_face_ids": [],
    "presumptive_ids": ["888888888"],
    "documents_ids": [],
    "fdc_provided_ids": [],
    "kit_consumption_ids": [],
    "differentiated_tb_ids": [],
    "tpt_treatment_start_ids": [],
    "tpt_presumptive_ids": [],
    "adhar_face_authentication_ids": [],
    "consent_with_id_ids": [],
    "remark": "Morning Field Session",
    "visited_names": ["Dr. Sharma Clinic", "Apex Chemist"]
}

print("\n--- 1. Submitting 1st Report ---")
res1 = client.post("/submit-daily-report", json=payload1)
print("Submit 1 Status:", res1.status_code, res1.json())

print("\n--- 2. Checking Status after 1st submission ---")
status1 = client.post("/check-today-status", json={"working_place": test_district, "fo_name": test_fo, "date": today_str})
print("Check Status (should indicate 1 submission, data empty for fresh 2nd start):", status1.status_code, status1.json())

print("\n--- 3. Submitting 2nd Report (Appending new IDs) ---")
payload2 = {
    "date_of_reporting": today_str,
    "working_place": test_district,
    "fo_name": test_fo,
    "pin": "1234",
    "notification_ids": ["999999999"],
    "hiv_dm_ids": [],
    "dbt_ids": [],
    "sample_collection_ids": [],
    "sample_tested_ids": [],
    "outcome_assigned_ids": [],
    "home_visit_ids": [],
    "contact_tracing_ids": [],
    "follow_up_ids": [],
    "face_to_face_ids": [],
    "presumptive_ids": [],
    "documents_ids": [],
    "fdc_provided_ids": [],
    "kit_consumption_ids": [],
    "differentiated_tb_ids": [],
    "tpt_treatment_start_ids": [],
    "tpt_presumptive_ids": [],
    "adhar_face_authentication_ids": [],
    "consent_with_id_ids": [],
    "remark": "Evening Clinic Wrap-up",
    "visited_names": ["City Care Pharmacy"]
}
res2 = client.post("/submit-daily-report", json=payload2)
print("Submit 2 Status:", res2.status_code, res2.json())

print("\n--- 4. Checking Status after 2nd submission (should be max_limit_reached) ---")
status2 = client.post("/check-today-status", json={"working_place": test_district, "fo_name": test_fo, "date": today_str})
print("Check Status 2:", status2.status_code, status2.json())

print("\n--- 5. Attempting 3rd Report (should be BLOCKED with 400) ---")
res3 = client.post("/submit-daily-report", json=payload2)
print("Submit 3 Status (expected 400):", res3.status_code, res3.json())

print("\n--- 6. Testing KPI Workbook generation after merged reports ---")
res_kpi = client.get(f"/download-kpi-workbook?district={test_district}")
print("KPI Workbook download status:", res_kpi.status_code, "Size:", len(res_kpi.content))

print("\n=== LIFECYCLE TESTS COMPLETE ===")
