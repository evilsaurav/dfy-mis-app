with open("src/App.jsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. State removals
content = content.replace(', \n    morning_km: "", evening_km: "",\n    is_override_used: false', '')
content = content.replace('morning_km: "", evening_km: "",', '')
content = content.replace('const [morningPhotoFile, setMorningPhotoFile] = useState(null);\n', '')
content = content.replace('const [eveningPhotoFile, setEveningPhotoFile] = useState(null);\n', '')
content = content.replace('const [isAdvancedMode, setIsAdvancedMode] = useState(false);\n', '')
content = content.replace("const [appState, setAppState] = useState('not_started');\n", '')
content = content.replace('const currentHour = new Date().getHours();\n', '')
content = content.replace("const canEditMorning = appState === 'not_started' || isAdvancedMode;\n", '')
content = content.replace("const canEditEvening = appState === 'in_progress' || appState === 'pending_previous' || isAdvancedMode;\n", '')

# 2. Upload photo function removal
import re
content = re.sub(r'  const uploadPhoto = async \(file\) => \{.*?  \};\n', '', content, flags=re.DOTALL)

# 3. WhatsApp text
content = re.sub(r'    text \+= \'\*\?\? Travel Details:\*\\n\';.*?text \+= \'- Total: \' \+ tKm \+ \' KM\\n\\n\';\n', '', content, flags=re.DOTALL)

# 4. Login Function 
# Replace `setAppState(data.status);`
content = content.replace('        setAppState(data.status);\n', '')

# 5. Submit Report function
# We will just remove the inner try/catch block and replace it with a clean one
old_submit_start = content.find('  const submitReport = async () => {')
old_submit_end = content.find('  const group1 = [')
old_submit_block = content[old_submit_start:old_submit_end]

new_submit = """  const submitReport = async () => {
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
      
      if(response.ok) {
        showToast("? Final Report Submitted Successfully!", "success");
        setTimeout(() => window.location.reload(), 2500);
      } else {
        const result = await response.json();
        showToast(result.detail || "Error in saving data.", "error");
      }
    } catch(err) {
      showToast("Network error while submitting report.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

"""
content = content.replace(old_submit_block, new_submit)


# 6. JSX render conditionals
# Find the start of `) : appState === 'completed' ? (` and remove it up to `) : (`
idx1 = content.find("                ) : appState === 'completed' ? (")
idx2 = content.find("          ) : (\n                      /* Main Dashboard */")
if idx1 != -1 and idx2 != -1:
    content = content[:idx1] + "                ) : (\n                      /* Main Dashboard */" + content[idx2 + len("          ) : (\n                      /* Main Dashboard */"):]

# Now remove the pending_previous alert
content = re.sub(r'              \{appState === \'pending_previous\' && \(\s*<div className="bg-red-50.*?</div>\s*\)\}\n', '', content, flags=re.DOTALL)

# Now remove all conditionals wrapping Accordions
content = re.sub(r'              \{\(appState === \'in_progress\' \|\| appState === \'pending_previous\'\) && \(\s*<>\n', '', content)
content = content.replace('              </>\n            )}\n\n            {/* Travel & Doctors Section */}', '\n            {/* Travel & Doctors Section */}')

# Now for Doctor visits, it has `{(appState === 'in_progress' || appState === 'pending_previous') && (`
content = content.replace('{(appState === \'in_progress\' || appState === \'pending_previous\') && (\n                <div className="bg-white rounded-2xl shadow-[0_2px_10px_-3px_rgba(16,185,129,0.1)] border border-emerald-100 overflow-hidden">', '<div className="bg-white rounded-2xl shadow-[0_2px_10px_-3px_rgba(16,185,129,0.1)] border border-emerald-100 overflow-hidden">')

# But we must remove the closing `)}` above Travel Meter!
# Let's find Travel Meter
idx3 = content.find('            {/* Travel Meter */}')
idx_before_travel = content.rfind('              )}\n', 0, idx3)
if idx_before_travel != -1 and (idx3 - idx_before_travel) < 50:
    content = content[:idx_before_travel] + content[idx_before_travel + 17:]

# Now remove Travel Meter completely up to Spacer
idx4 = content.find('            {/* Spacer for Sticky Footer */}')
content = content[:idx3] + content[idx4:]


# Button logic! Replace `appState === 'not_started' ? (` completely
button_logic = """            {appState === 'not_started' ? (
              <div className="mt-8 mb-6">
                <button 
                  onClick={submitReport} 
                  disabled={isSubmitting} 
                  className={`w-full bg-slate-900 text-white font-black py-4 rounded-xl text-lg shadow-[0_4px_14px_0_rgba(15,23,42,0.39)] hover:shadow-[0_6px_20px_rgba(15,23,42,0.23)] hover:bg-slate-800 transition-all ${isSubmitting ? 'opacity-70 cursor-not-allowed' : 'active:scale-[0.98]'}`}>
                  {isSubmitting ? 'Starting...' : 'Start Day (Meter & Photo)'}
                </button>
              </div>
            ) : appState === 'in_progress' || appState === 'pending_previous' ? (
              <div className="mt-8 mb-6">
                <button 
                  onClick={submitReport} 
                  disabled={isSubmitting} 
                  className={`w-full bg-slate-900 text-white font-black py-4 rounded-xl text-lg shadow-[0_4px_14px_0_rgba(15,23,42,0.39)] hover:shadow-[0_6px_20px_rgba(15,23,42,0.23)] hover:bg-slate-800 transition-all ${isSubmitting ? 'opacity-70 cursor-not-allowed' : 'active:scale-[0.98]'}`}>
                  {isSubmitting ? 'Saving...' : 'Save Draft (No Submit)'}
                </button>
              </div>
            ) : null}"""
content = content.replace(button_logic, '')

# Mobile UI Layout fixes
content = content.replace(
    '<div className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl p-6 sm:p-10 border border-slate-100 relative overflow-hidden animate-scale-in">',
    '<div className="w-[90%] sm:w-full max-w-md bg-white rounded-[2rem] shadow-2xl p-6 sm:p-10 border border-slate-100 relative overflow-hidden animate-scale-in mx-auto">'
)
content = content.replace(
    '<main className={`max-w-4xl mx-auto p-4 sm:p-6 w-full flex-1 flex flex-col ${!isLoggedIn ? "justify-center mt-[-2rem]" : "mt-2"}`}>',
    '<main className={`max-w-4xl mx-auto px-1 sm:p-6 w-[95%] sm:w-full flex-1 flex flex-col overflow-x-hidden ${!isLoggedIn ? "justify-center" : "mt-2"}`}>'
)
content = content.replace(
    '<div className="animate-fade-in">',
    '<div className="animate-fade-in w-full max-w-md mx-auto overflow-x-hidden">'
)
# Grid cols 1
content = content.replace('<div className={`grid grid-cols-1 ${(appState === \'in_progress\' || appState === \'pending_previous\') ? \'md:grid-cols-2\' : \'\'} gap-4 mt-8`}>', '<div className="grid grid-cols-1 gap-4 mt-8">')


with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.write(content)

