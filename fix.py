import re

with open('dfy-frontend/src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix copyToWhatsApp
good_copy = r'''  const copyToWhatsApp = () => {
    const text = *Daily Field Report - * ??\n*Name:*  ()\n\n*?? Travel Details:*\n- Morning:  KM\n- Evening:  KM\n- Total:  KM\n\n*?? Doctors/Stores Visited:*\n\n\n*?? Work Metrics:*\n- Notifications: \n- HIV & DM: \n- DBT: \n- Sample Collection: \n- Sample Tested: \n- Outcome Assigned: \n- Home Visit: \n- Contact Tracing: \n- Follow Up: \n- Face to Face: \n- Presumptive: \n- Documents: \n- FDC Provided: \n- Kit Consumption: ;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => showToast("Copied! Paste in WhatsApp.", "success")).catch(() => showToast("Failed to copy", "error"));
    }
  };'''

# Replace broken copyToWhatsApp
content = re.sub(r'  const copyToWhatsApp = \(\) => \{.*?\n  \};\n', good_copy + '\n\n', content, flags=re.DOTALL)


# Fix the broken pre tag
good_pre = r'''                  <pre className="whitespace-pre-wrap font-sans text-xs">
{*Daily Field Report - * ??
*Name:*  ()

*?? Travel Details:*
- Morning:  KM
- Evening:  KM
- Total:  KM

*?? Doctors/Stores Visited:*


*?? Work Metrics:*
- Notifications: 
- HIV & DM: 
- DBT: 
- Sample Collection: 
- Sample Tested: 
- Outcome Assigned: 
- Home Visit: 
- Contact Tracing: 
- Follow Up: 
- Face to Face: 
- Presumptive: 
- Documents: 
- FDC Provided: 
- Kit Consumption: }
                  </pre>'''

content = re.sub(r'                  <pre className="whitespace-pre-wrap font-sans text-xs">.*?</pre>', good_pre, content, flags=re.DOTALL)

with open('dfy-frontend/src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
