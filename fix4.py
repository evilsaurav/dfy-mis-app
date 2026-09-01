import re

with open('dfy-frontend/src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

good_copy = r"""  const copyToWhatsApp = () => {
    const text = `*Daily Field Report - ${formData.date_of_reporting}* ??\n*Name:* ${formData.fo_name} (${formData.working_place})\n\n*?? Travel Details:*\n- Morning: ${formData.morning_km} KM\n- Evening: ${formData.evening_km || 0} KM\n- Total: ${formData.total_km || 0} KM\n\n*?? Doctors/Stores Visited:*\n${(formData.visited_names || []).join(', ') || 'None'}\n\n*?? Work Metrics:*\n- Notifications: ${(formData.notification_ids || []).length}\n- HIV & DM: ${(formData.hiv_dm_ids || []).length}\n- DBT: ${(formData.dbt_ids || []).length}\n- Sample Collection: ${(formData.sample_collection_ids || []).length}\n- Sample Tested: ${(formData.sample_tested_ids || []).length}\n- Outcome Assigned: ${(formData.outcome_assigned_ids || []).length}\n- Home Visit: ${(formData.home_visit_ids || []).length}\n- Contact Tracing: ${(formData.contact_tracing_ids || []).length}\n- Follow Up: ${(formData.follow_up_ids || []).length}\n- Face to Face: ${(formData.face_to_face_ids || []).length}\n- Presumptive: ${(formData.presumptive_ids || []).length}\n- Documents: ${(formData.documents_ids || []).length}\n- FDC Provided: ${(formData.fdc_provided_ids || []).length}\n- Kit Consumption: ${(formData.kit_consumption_ids || []).length}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => showToast("Copied! Paste in WhatsApp.", "success")).catch(() => showToast("Failed to copy", "error"));
    }
  };"""

content = re.sub(r'  const copyToWhatsApp = \(\) => \{.*?\}\s*;\s*const submitReport', good_copy + '\n\n  const submitReport', content, flags=re.DOTALL)

good_pre = r'''                  <pre className="whitespace-pre-wrap font-sans text-xs">
{`*Daily Field Report - ${formData.date_of_reporting || new Date().toISOString().split('T')[0]}* ??
*Name:* ${formData.fo_name} (${formData.working_place})

*?? Travel Details:*
- Morning: ${formData.morning_km || 0} KM
- Evening: ${formData.evening_km || 0} KM
- Total: ${formData.total_km || Math.max(0, Number(formData.evening_km) - Number(formData.morning_km)) || 0} KM

*?? Doctors/Stores Visited:*
${(formData.visited_names || []).join(', ') || 'None'}

*?? Work Metrics:*
- Notifications: ${(formData.notification_ids || []).length}
- HIV & DM: ${(formData.hiv_dm_ids || []).length}
- DBT: ${(formData.dbt_ids || []).length}
- Sample Collection: ${(formData.sample_collection_ids || []).length}
- Sample Tested: ${(formData.sample_tested_ids || []).length}
- Outcome Assigned: ${(formData.outcome_assigned_ids || []).length}
- Home Visit: ${(formData.home_visit_ids || []).length}
- Contact Tracing: ${(formData.contact_tracing_ids || []).length}
- Follow Up: ${(formData.follow_up_ids || []).length}
- Face to Face: ${(formData.face_to_face_ids || []).length}
- Presumptive: ${(formData.presumptive_ids || []).length}
- Documents: ${(formData.documents_ids || []).length}
- FDC Provided: ${(formData.fdc_provided_ids || []).length}
- Kit Consumption: ${(formData.kit_consumption_ids || []).length}`}
                  </pre>'''

content = re.sub(r'                  <pre className="whitespace-pre-wrap font-sans text-xs">.*?</pre>', good_pre, content, flags=re.DOTALL)


with open('dfy-frontend/src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
