import re

with open('dfy-frontend/src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

new_logic = r"""  const generateWhatsAppText = () => {
    let text = `*Daily Field Report - ${formData.date_of_reporting || new Date().toISOString().split('T')[0]}* ??\n`;
    text += `*Name:* ${formData.fo_name} (${formData.working_place})\n\n`;
    
    text += `*?? Travel Details:*\n`;
    text += `- Morning: ${formData.morning_km || 0} KM\n`;
    text += `- Evening: ${formData.evening_km || 0} KM\n`;
    const tKm = Math.max(0, Number(formData.evening_km) - Number(formData.morning_km)) || 0;
    text += `- Total: ${tKm} KM\n\n`;

    if (formData.visited_names && formData.visited_names.length > 0) {
      text += `*?? Doctors/Stores Visited:*\n`;
      text += formData.visited_names.join('\n') + `\n\n`;
    }

    text += `*?? Work Metrics:*\n`;
    
    const categories = [
      { key: "notification_ids", label: "Notification" },
      { key: "hiv_dm_ids", label: "HIV & DM" },
      { key: "dbt_ids", label: "DBT" },
      { key: "sample_collection_ids", label: "Sample Collection" },
      { key: "sample_tested_ids", label: "Sample Tested" },
      { key: "outcome_assigned_ids", label: "Outcome Assigned" },
      { key: "home_visit_ids", label: "Home Visit" },
      { key: "contact_tracing_ids", label: "Contact Tracing" },
      { key: "follow_up_ids", label: "Follow Up" },
      { key: "face_to_face_ids", label: "Face to Face" },
      { key: "presumptive_ids", label: "Presumptive" },
      { key: "documents_ids", label: "Documents" },
      { key: "fdc_provided_ids", label: "FDC Provided" },
      { key: "kit_consumption_ids", label: "Kit Consumption" }
    ];

    let hasMetrics = false;
    categories.forEach(cat => {
      const ids = formData[cat.key] || [];
      if (ids.length > 0) {
        hasMetrics = true;
        text += `\n*${cat.label}:* ${ids.length}\n`;
        text += ids.join('\n') + `\n`;
      }
    });

    if (!hasMetrics) {
      text += `None\n`;
    }

    return text.trim();
  };

  const copyToWhatsApp = () => {
    const text = generateWhatsAppText();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => showToast("Copied! Paste in WhatsApp.", "success")).catch(() => showToast("Failed to copy", "error"));
    }
  };"""

# Replace copyToWhatsApp
content = re.sub(r'  const copyToWhatsApp = \(\) => \{.*?\n  \};', new_logic, content, flags=re.DOTALL)

# Replace <pre> content
pre_content = r'''                  <pre className="whitespace-pre-wrap font-sans text-xs">
{generateWhatsAppText()}
                  </pre>'''

content = re.sub(r'                  <pre className="whitespace-pre-wrap font-sans text-xs">.*?</pre>', pre_content, content, flags=re.DOTALL)

with open('dfy-frontend/src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
