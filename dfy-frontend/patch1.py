import os

with open("src/App.jsx", "r", encoding="utf-8") as f:
    code = f.read()

# 1. Remove KM variables
code = code.replace(', \n    morning_km: "", evening_km: "",\n    is_override_used: false', '')
code = code.replace('morning_km: "", evening_km: "",', '')
code = code.replace('const [morningPhotoFile, setMorningPhotoFile] = useState(null);', '')
code = code.replace('const [eveningPhotoFile, setEveningPhotoFile] = useState(null);', '')
code = code.replace('const [isAdvancedMode, setIsAdvancedMode] = useState(false);', '')
code = code.replace("const [appState, setAppState] = useState('not_started');", '')
code = code.replace('const currentHour = new Date().getHours();', '')
code = code.replace("const canEditMorning = appState === 'not_started' || isAdvancedMode;", '')
code = code.replace("const canEditEvening = appState === 'in_progress' || appState === 'pending_previous' || isAdvancedMode;", '')

# 2. uploadPhoto function
upload_photo_block = """  const uploadPhoto = async (file) => {
    const formData = new FormData();
    formData.append("image", file);
    const res = await fetch(`https://api.imgbb.com/1/upload?key=9c75787468e638438bf8ec75dd73b29d`, { method: "POST", body: formData });
    const data = await res.json();
    return data.data.url;
  };"""
code = code.replace(upload_photo_block, '')

# 3. login functionality refactor
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


# 4. WhatsApp Travel Details
old_wa = """    text += '*Name:* ' + formData.fo_name + ' (' + formData.working_place + ')\\n\\n';
    
    text += '*?? Travel Details:*\\n';
    text += '- Morning: ' + (formData.morning_km || 0) + ' KM\\n';
    text += '- Evening: ' + (formData.evening_km || 0) + ' KM\\n';
    const tKm = Math.max(0, Number(formData.evening_km) - Number(formData.morning_km)) || 0;
    text += '- Total: ' + tKm + ' KM\\n\\n';"""

new_wa = """    text += '*Name:* ' + formData.fo_name + ' (' + formData.working_place + ')\\n\\n';"""
code = code.replace(old_wa, new_wa)

with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.write(code)

