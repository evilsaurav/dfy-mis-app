import re

with open("dfy-frontend/src/App.jsx", "r", encoding="utf-8") as f:
    content = f.read()

# Remove KM states
content = re.sub(r'morning_km:\s*"",?\s*evening_km:\s*"",?', '', content)
content = re.sub(r'const \[morningPhotoFile.*?;\s*', '', content)
content = re.sub(r'const \[eveningPhotoFile.*?;\s*', '', content)
content = re.sub(r'const \[isAdvancedMode.*?;\s*', '', content)
content = re.sub(r'const \[appState.*?;\s*', '', content)
content = re.sub(r'const currentHour.*?;', '', content)
content = re.sub(r'const canEditMorning.*?;', '', content)
content = re.sub(r'const canEditEvening.*?;', '', content)

# Remove photo upload logic
content = re.sub(r'const uploadPhoto.*?\n\s*};\n', '', content, flags=re.DOTALL)

# Simplify checking today status: just check if there is an existing report for today, set formData if so, no appState
check_status_pattern = r'''const res = await fetch\(\`\$\{API_BASE_URL\}/check-today-status\`, \{.*?\}\);.*?setAppState\(data\.status\);\s*if \(data\.status === 'in_progress' \|\| data\.status === 'completed' \|\| data\.status === 'pending_previous'\) \{\s*const d = data\.data;\s*setFormData\(prev => \(\{ \n\s*\.\.\.prev, \n\s*\.\.\.d, \n\s*date_of_reporting: d\.date_of_reporting \|\| today \n\s*\}\)\);\s*\}'''

new_check_status = r'''const res = await fetch(`${API_BASE_URL}/check-today-status`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ working_place: formData.working_place, fo_name: formData.fo_name, date: today })
          });
          const data = await res.json();
          if (data.status === 'completed' || data.status === 'in_progress') {
             const d = data.data;
             setFormData(prev => ({ 
               ...prev, 
               ...d, 
               date_of_reporting: d.date_of_reporting || today 
             }));
          }'''
content = re.sub(check_status_pattern, new_check_status, content, flags=re.DOTALL)

# Remove travel details from whatsapp text
wa_travel_pattern = r'''\s*text \+= '\*\?\? Travel Details:\*\\n';.*?text \+= '- Total: ' \+ tKm \+ ' KM\\n\\n';'''
content = re.sub(wa_travel_pattern, '', content, flags=re.DOTALL)

# Refactor submitReport
submit_pattern = r'''const submitReport = async \(\) => \{.*?(const payload = \{.*?working_place: formData\.working_place,\s*fo_name: formData\.fo_name,\s*date: formData\.date_of_reporting.*?\}\);).*?\}'''
# Let's replace the entire submitReport function since it's cleaner
new_submit = r'''const submitReport = async () => {
    if(!formData.working_place || !formData.fo_name || !formData.pin) {
      showToast("Pehle Zila, Naam aur PIN bharo!", "error");
      return;
    }
    
    setIsSubmitting(true);
    try {
      showToast("Saving your report...", "success");
      const payload = { ...formData, date: formData.date_of_reporting };
      
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const response = await fetch(`${API_BASE_URL}/submit-daily-report`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      
      if(response.ok) {
        showToast("? Final Report Submitted Successfully!", "success");
        setTimeout(() => window.location.reload(), 2500);
      } else {
        showToast(result.detail || "Error in saving data.", "error");
      }
    } catch(err) {
      showToast("Network error while submitting report.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };'''
content = re.sub(r'const submitReport = async \(\) => \{.*?\};(?!.*const submitReport = async)', new_submit, content, flags=re.DOTALL)

# Now remove appState conditions from rendering
content = re.sub(r'\{\(appState === \'in_progress\' \|\| appState === \'pending_previous\'\) && \(\s*<>\s*(<Accordion title="1.*?)\s*</>\s*\)\}', r'\1', content, flags=re.DOTALL)

# It's better to do targeted replacements for the UI parts since regex might break JSX.
with open("dfy-frontend/src/App.jsx", "w", encoding="utf-8") as f:
    f.write(content)

print("Pass 1 complete.")
