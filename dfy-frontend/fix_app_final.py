import os

with open("src/App.jsx", "r", encoding="utf-8") as f:
    code = f.read()

# 1. State removals
code = code.replace(', \n    morning_km: "", evening_km: "",\n    is_override_used: false', '')
code = code.replace('morning_km: "", evening_km: "",', '')
code = code.replace('const [morningPhotoFile, setMorningPhotoFile] = useState(null);', '')
code = code.replace('const [eveningPhotoFile, setEveningPhotoFile] = useState(null);', '')
code = code.replace('const [isAdvancedMode, setIsAdvancedMode] = useState(false);', '')
code = code.replace("const [appState, setAppState] = useState('not_started');", '')
code = code.replace('const currentHour = new Date().getHours();', '')
code = code.replace("const canEditMorning = appState === 'not_started' || isAdvancedMode;", '')
code = code.replace("const canEditEvening = appState === 'in_progress' || appState === 'pending_previous' || isAdvancedMode;", '')

# 2. Upload photo function removal
idx_start = code.find('const uploadPhoto = async (file) => {')
idx_end = code.find('  };', idx_start) + 4
code = code[:idx_start] + code[idx_end:]

# 3. WhatsApp text
old_wa = """    text += '*Name:* ' + formData.fo_name + ' (' + formData.working_place + ')\\n\\n';
    
    text += '*?? Travel Details:*\\n';
    text += '- Morning: ' + (formData.morning_km || 0) + ' KM\\n';
    text += '- Evening: ' + (formData.evening_km || 0) + ' KM\\n';
    const tKm = Math.max(0, Number(formData.evening_km) - Number(formData.morning_km)) || 0;
    text += '- Total: ' + tKm + ' KM\\n\\n';"""
new_wa = """    text += '*Name:* ' + formData.fo_name + ' (' + formData.working_place + ')\\n\\n';"""
code = code.replace(old_wa, new_wa)

# 4. Login Function 
old_login = """  const login = async () => {
    if (pinStatus === "success") {
      try {
        const today = formData.date_of_reporting || new Date().toISOString().split('T')[0];
        const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
        const res = await fetch(`${API_BASE_URL}/check-today-status`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ working_place: formData.working_place, fo_name: formData.fo_name, date: today })
        });
        const data = await res.json();
        setAppState(data.status);
        if (data.status === 'in_progress' || data.status === 'completed' || data.status === 'pending_previous') {
           const d = data.data;
           setFormData(prev => ({ 
             ...prev, 
             ...d, 
             date_of_reporting: d.date_of_reporting || today 
           }));
        }
        setIsLoggedIn(true);
        showToast(`Welcome back, ${formData.fo_name}!`, 'success');
      } catch (err) {
        showToast("Error checking status", "error");
      }
    } else {
      showToast("Invalid Zila, Name or PIN", "error");
    }
  };"""
new_login = """  const login = async () => {
    if (pinStatus === "success") {
      try {
        const today = formData.date_of_reporting || new Date().toISOString().split('T')[0];
        const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
        const res = await fetch(`${API_BASE_URL}/check-today-status`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ working_place: formData.working_place, fo_name: formData.fo_name, date: today })
        });
        const data = await res.json();
        if (data.status === 'in_progress' || data.status === 'completed' || data.status === 'pending_previous') {
           const d = data.data;
           setFormData(prev => ({ 
             ...prev, 
             ...d, 
             date_of_reporting: d.date_of_reporting || today 
           }));
        }
        setIsLoggedIn(true);
        showToast(`Welcome back, ${formData.fo_name}!`, 'success');
      } catch (err) {
        showToast("Error checking status", "error");
      }
    } else {
      showToast("Invalid Zila, Name or PIN", "error");
    }
  };"""
code = code.replace(old_login, new_login)

# 5. Submit Report function
idx_start = code.find('  const submitReport = async () => {')
idx_end = code.find('  const group1 = [')
old_submit = code[idx_start:idx_end]

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
  };

"""
code = code.replace(old_submit, new_submit)


# 6. JSX render conditionals removal
# appState checks
code = code.replace(') : appState === \'completed\' ? (\n            <div className="max-w-md mx-auto mt-16 text-center bg-white p-8 rounded-2xl shadow-sm border border-slate-100 animate-fade-in-down">\n               <div className="mx-auto bg-emerald-50 w-16 h-16 rounded-full flex items-center justify-center mb-4">\n                  <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">\n                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />\n                  </svg>\n               </div>\n               <h2 className="text-2xl font-black text-slate-800 mb-2">Great Job!</h2>\n               <p className="text-slate-500 font-medium">Aapne aaj ki dono reports successfully submit kar di hain. Kal milte hain!</p>\n            </div>\n          ', '')

code = code.replace('{appState === \'pending_previous\' && (\n              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl shadow-sm mb-6">\n                <div className="flex">\n                  <div className="flex-shrink-0">\n                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">\n                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />\n                    </svg>\n                  </div>\n                  <div className="ml-3">\n                    <p className="text-sm text-red-700 font-bold">\n                      Warning: Aapne kal ki evening report submit nahi ki thi. Kripya usey abhi poora karein.\n                    </p>\n                  </div>\n                </div>\n              </div>\n            )}', '')

code = code.replace('{(appState === \'in_progress\' || appState === \'pending_previous\') && (\n              <>\n', '')
# need to remove the matching `</>\n            )}` which is right before `{/* Travel & Doctors Section */}`
idx = code.find('              </>\n            )}\n\n            {/* Travel & Doctors Section */}')
if idx != -1:
    code = code[:idx] + '            {/* Travel & Doctors Section */}' + code[idx + 82:]

code = code.replace('<div className={`grid grid-cols-1 ${(appState === \'in_progress\' || appState === \'pending_previous\') ? \'md:grid-cols-2\' : \'\'} gap-4 mt-8`}>', '<div className="grid grid-cols-1 gap-4 mt-8">')
code = code.replace('{(appState === \'in_progress\' || appState === \'pending_previous\') && (\n                <div className="bg-white rounded-2xl', '<div className="bg-white rounded-2xl')

# Travel Meter Removal
idx_start = code.find('            {/* Travel Meter */}')
idx_end = code.find('            {/* Spacer for Sticky Footer */}')
code = code[:idx_start] + code[idx_end:]


# Start/Submit Button logic removal
old_button_logic = """{appState === 'not_started' ? (
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
code = code.replace(old_button_logic, '')

# We also removed the conditional around the doctor visits but it had a closing `)}` above Travel Meter.
# Actually let's just use string slicing to remove the `)}` above the travel meter.
# When we removed `{(appState === 'in_progress' || appState === 'pending_previous') && (\n                <div className="bg-white rounded-2xl`
# There is a closing `)}` right before `            {/* Travel Meter */}`. Since we removed the Travel Meter, we need to remove the `)}` right before `            {/* Spacer for Sticky Footer */}`.
code = code.replace('              )}\n\n            {/* Spacer for Sticky Footer */}', '\n            {/* Spacer for Sticky Footer */}')

# 7. Mobile UI Fixes
code = code.replace(
    '<div className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl p-6 sm:p-10 border border-slate-100 relative overflow-hidden animate-scale-in">',
    '<div className="w-[95%] sm:w-full max-w-md bg-white rounded-[2rem] shadow-2xl p-6 sm:p-10 border border-slate-100 relative overflow-hidden animate-scale-in mx-auto">'
)
code = code.replace(
    '<div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-8 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-hidden">',
    '<div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center py-4 px-2 sm:p-8 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-x-hidden w-full">'
)
code = code.replace(
    '<div className="animate-fade-in">',
    '<div className="animate-fade-in w-[95%] sm:w-full max-w-md mx-auto overflow-x-hidden">'
)

with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.write(code)

