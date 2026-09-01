import re

with open('main.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Add to DailyActivityReport
report_class = r"""class DailyActivityReport(BaseModel):
    date_of_reporting: Optional[str] = None
    working_place: str
    fo_name: str
    pin: str
    
    notification_ids: List[str] = []
    hiv_dm_ids: List[str] = []
    dbt_ids: List[str] = []
    sample_collection_ids: List[str] = []
    sample_tested_ids: List[str] = []
    outcome_assigned_ids: List[str] = []
    home_visit_ids: List[str] = []
    contact_tracing_ids: List[str] = []
    follow_up_ids: List[str] = []
    face_to_face_ids: List[str] = []
    presumptive_ids: List[str] = []
    documents_ids: List[str] = []
    fdc_provided_ids: List[str] = []
    kit_consumption_ids: List[str] = []
    differentiated_tb_ids: List[str] = []
    tpt_treatment_start_ids: List[str] = []
    tpt_presumptive_ids: List[str] = []
    adhar_face_authentication_ids: List[str] = []
    consent_with_id_ids: List[str] = []
    
    remark: Optional[str] = ""
    
    doctor_store_visits_count: Optional[int] = 0
    visited_names: List[str] = []
    morning_km: Optional[int] = 0
    evening_km: Optional[int] = 0
    total_km: Optional[int] = 0
    morning_km_photo_url: Optional[str] = ""
    evening_km_photo_url: Optional[str] = ""
    is_override_used: Optional[bool] = False"""

content = re.sub(r'class DailyActivityReport\(BaseModel\):.*?is_override_used: Optional\[bool\] = False', report_class, content, flags=re.DOTALL)

# Update list_fields_mapping in download-excel
mapping_old = r'''        list_fields_mapping = \{
            "notification_ids": "Notification",
            "hiv_dm_ids": "HIV & DM",
            "dbt_ids": "DBT",
            "sample_collection_ids": "Sample Collection",
            "sample_tested_ids": "Sample Tested",
            "outcome_assigned_ids": "Outcome Assigned",
            "home_visit_ids": "Home Visit",
            "contact_tracing_ids": "Contact Tracing",
            "follow_up_ids": "Follow Up",
            "face_to_face_ids": "Face to Face",
            "presumptive_ids": "Presumptive",
            "documents_ids": "Documents",
            "fdc_provided_ids": "FDC Provided",
            "kit_consumption_ids": "Kit Consumption"
        \}'''

mapping_new = r'''        list_fields_mapping = {
            "notification_ids": "Notification",
            "hiv_dm_ids": "HIV & DM",
            "dbt_ids": "DBT",
            "sample_collection_ids": "Sample Collection",
            "sample_tested_ids": "Sample Tested",
            "outcome_assigned_ids": "Outcome Assigned",
            "home_visit_ids": "Home Visit",
            "contact_tracing_ids": "Contact Tracing",
            "follow_up_ids": "Follow Up",
            "face_to_face_ids": "Face to Face",
            "presumptive_ids": "Presumptive",
            "documents_ids": "Documents",
            "fdc_provided_ids": "FDC Provided",
            "kit_consumption_ids": "Kit Consumption",
            "differentiated_tb_ids": "Differentiated TB",
            "tpt_treatment_start_ids": "TPT Treatment Start",
            "tpt_presumptive_ids": "TPT Presumptive",
            "adhar_face_authentication_ids": "Adhar Face Authentication",
            "consent_with_id_ids": "Consent with ID"
        }'''

content = re.sub(mapping_old, mapping_new, content)

# Update remarks in download-excel
remark_old = r'''row\["Remarks"\] = "Entry Adjusted \(Time Override Used\)" if data\.get\("is_override_used"\) else ""'''
remark_new = r'''user_remark = data.get("remark", "")
                    override_str = "[Adjusted]" if data.get("is_override_used") else ""
                    row["Remarks"] = f"{override_str} {user_remark}".strip()'''

content = re.sub(remark_old, remark_new, content)


with open('main.py', 'w', encoding='utf-8') as f:
    f.write(content)
