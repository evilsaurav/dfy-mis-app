with open("src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

start = text.find('  const handleLogin = async () => {')
end = text.find('  };\n', start) + 5

new_handle_login = """  const handleLogin = async () => {
    if (pinStatus === 'success') {
      setIsSubmitting(true);
      try {
        const today = new Date().toISOString().split('T')[0];
        setFormData(prev => ({...prev, date_of_reporting: today}));
        const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
        const res = await fetch(`${API_BASE_URL}/check-today-status`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ working_place: formData.working_place, fo_name: formData.fo_name, date: today })
        });
        const data = await res.json();
        
        if (data.status === 'max_limit_reached') {
           showToast("Aapne aaj ki 2 reports submit kar di hain! Kal (12 AM ke baad) fresh report daalein.", "error");
           return;
        }
        
        if (data.status === 'in_progress' || data.status === 'completed' || data.status === 'pending_previous') {
           if (data.data && Object.keys(data.data).length > 0) {
             const d = data.data;
             setFormData(prev => ({ 
               ...prev, 
               ...d, 
               date_of_reporting: d.date_of_reporting || today 
             }));
           } else {
             // Second submission of the day (fresh start)
             setFormData({
                working_place: formData.working_place, fo_name: formData.fo_name, pin: formData.pin, date_of_reporting: today,
                notification_ids: [], hiv_dm_ids: [], dbt_ids: [], sample_collection_ids: [], sample_tested_ids: [], 
                outcome_assigned_ids: [], home_visit_ids: [], contact_tracing_ids: [], follow_up_ids: [], 
                face_to_face_ids: [], presumptive_ids: [], documents_ids: [], fdc_provided_ids: [], kit_consumption_ids: [],
                differentiated_tb_ids: [], tpt_treatment_start_ids: [], tpt_presumptive_ids: [], adhar_face_authentication_ids: [],
                consent_with_id_ids: [], remark: "", visited_names: []
             });
           }
        }
        setIsLoggedIn(true);
        showToast(`Welcome back, ${formData.fo_name}!`, 'success');
      } catch (err) {
        showToast("Error checking status", "error");
      } finally {
        setIsSubmitting(false);
      }
    }
  };
"""

text = text[:start] + new_handle_login + text[end:]

with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.write(text)

