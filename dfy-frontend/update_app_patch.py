with open("src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

# 1. Update MyProfileDashboard to be null-safe
old_profile_dash = """  const percent = stats.target > 0 ? Math.min(100, Math.round((stats.total_achieved / stats.target) * 100)) : 100;
  
  return (
    <div className="w-full max-w-lg mx-auto animate-fade-in pb-10">
      <div className="bg-white rounded-3xl p-6 shadow-xl shadow-indigo-100/50 border border-slate-100 mb-6 text-center">
        <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-3 font-black">
          {formData.fo_name.charAt(0)}
        </div>
        <h2 className="text-2xl font-black text-slate-800">{formData.fo_name}</h2>
        <p className="text-slate-500 font-bold text-sm tracking-wider uppercase">{formData.working_place}</p>
        
        <div className="mt-8 flex justify-center items-center">
          <div className="relative w-40 h-40">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path className="text-slate-100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
              <path className="text-indigo-500 transition-all duration-1000 ease-out" strokeDasharray={`${percent}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-black text-slate-800">{percent}%</span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Target</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-8 pt-6 border-t border-slate-100">
           <div>
             <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Monthly Target</p>
             <p className="text-xl font-black text-slate-700">{stats.target}</p>
           </div>
           <div>
             <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Total Achieved</p>
             <p className="text-xl font-black text-indigo-600">{stats.total_achieved}</p>
           </div>
        </div>
      </div>

      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 px-2">Work Breakdown</h3>
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(stats.breakdown).map(([k, v]) => {
           if (v === 0) return null;
           const label = k.replace(/_/g, " ");
           return (
             <div key={k} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
               <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate mr-2">{label}</span>
               <span className="text-lg font-black text-slate-800">{v}</span>
             </div>
           )
        })}
      </div>
    </div>
  );"""

new_profile_dash = """  if (!stats) return (
    <div className="w-full max-w-lg mx-auto text-center p-8 bg-white rounded-3xl border border-slate-100 shadow-sm mt-6">
      <p className="text-slate-500 font-bold text-sm">Profile data load nahi ho paya.</p>
      <button onClick={() => window.location.reload()} className="mt-3 bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-100">Retry</button>
    </div>
  );

  const targetVal = Number(stats.target) || 0;
  const achievedVal = Number(stats.total_achieved) || 0;
  const percent = targetVal > 0 ? Math.min(100, Math.round((achievedVal / targetVal) * 100)) : 100;
  const breakdown = stats.breakdown || {};
  
  return (
    <div className="w-full max-w-lg mx-auto animate-fade-in pb-10">
      <div className="bg-white rounded-3xl p-6 shadow-xl shadow-indigo-100/50 border border-slate-100 mb-6 text-center">
        <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-3 font-black">
          {(formData.fo_name || 'U').charAt(0)}
        </div>
        <h2 className="text-2xl font-black text-slate-800">{formData.fo_name}</h2>
        <p className="text-slate-500 font-bold text-sm tracking-wider uppercase">{formData.working_place}</p>
        
        <div className="mt-8 flex justify-center items-center">
          <div className="relative w-40 h-40">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path className="text-slate-100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
              <path className="text-indigo-500 transition-all duration-1000 ease-out" strokeDasharray={`${percent}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-black text-slate-800">{percent}%</span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Target</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-8 pt-6 border-t border-slate-100">
           <div>
             <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Monthly Target</p>
             <p className="text-xl font-black text-slate-700">{targetVal}</p>
           </div>
           <div>
             <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Total Achieved</p>
             <p className="text-xl font-black text-indigo-600">{achievedVal}</p>
           </div>
        </div>
      </div>

      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 px-2">Work Breakdown</h3>
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(breakdown).map(([k, v]) => {
           if (v === 0) return null;
           const label = k.replace(/_/g, " ");
           return (
             <div key={k} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
               <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate mr-2">{label}</span>
               <span className="text-lg font-black text-slate-800">{v}</span>
             </div>
           )
        })}
      </div>
    </div>
  );"""

if old_profile_dash in text:
    text = text.replace(old_profile_dash, new_profile_dash)
    print("MyProfileDashboard updated")
else:
    print("old_profile_dash not found")

# 2. Add sanitize helper function before function App()
sanitize_code = """
const sanitizeIncomingFormData = (d, base) => {
  const arrayKeys = [
    'notification_ids', 'hiv_dm_ids', 'dbt_ids', 'sample_collection_ids', 'sample_tested_ids',
    'outcome_assigned_ids', 'home_visit_ids', 'contact_tracing_ids', 'follow_up_ids',
    'face_to_face_ids', 'presumptive_ids', 'documents_ids', 'fdc_provided_ids',
    'kit_consumption_ids', 'differentiated_tb_ids', 'tpt_treatment_start_ids',
    'tpt_presumptive_ids', 'adhar_face_authentication_ids', 'consent_with_id_ids'
  ];
  const clean = { ...base };
  if (d && typeof d === 'object') {
    Object.keys(d).forEach(k => {
      if (arrayKeys.includes(k)) {
        clean[k] = Array.isArray(d[k]) ? d[k] : [];
      } else if (k === 'visited_names') {
        clean[k] = Array.isArray(d[k]) ? d[k] : [];
      } else if (d[k] !== null && d[k] !== undefined) {
        clean[k] = d[k];
      }
    });
  }
  arrayKeys.forEach(k => {
    if (!Array.isArray(clean[k])) clean[k] = [];
  });
  if (!Array.isArray(clean.visited_names)) clean.visited_names = [];
  return clean;
};
"""

if "const sanitizeIncomingFormData =" not in text:
    app_marker = "function App() {"
    if app_marker in text:
        text = text.replace(app_marker, sanitize_code + "\n" + app_marker)
        print("sanitizeIncomingFormData added")

# 3. Update handleLogin & handleLogout & auto session restore
old_handle_login = """  const handleLogin = async () => {
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
  };"""

new_handle_login = """  const handleLogout = () => {
    try {
      localStorage.removeItem('dfy_user_session');
    } catch (e) {}
    setIsLoggedIn(false);
    setFormData({
      working_place: "", fo_name: "", pin: "",
      notification_ids: [], hiv_dm_ids: [], dbt_ids: [], 
      sample_collection_ids: [], sample_tested_ids: [], 
      outcome_assigned_ids: [], home_visit_ids: [], 
      contact_tracing_ids: [], follow_up_ids: [], 
      face_to_face_ids: [], presumptive_ids: [], 
      documents_ids: [], fdc_provided_ids: [],
      kit_consumption_ids: [], differentiated_tb_ids: [],
      tpt_treatment_start_ids: [], tpt_presumptive_ids: [],
      adhar_face_authentication_ids: [], consent_with_id_ids: [],
      remark: "", visited_names: []
    });
    setPinStatus(null);
    setCurrentView('form');
    showToast("Logged out successfully", "success");
  };

  const handleLogin = async () => {
    if (pinStatus === 'success') {
      setIsSubmitting(true);
      try {
        const today = new Date().toISOString().split('T')[0];
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
             setFormData(prev => sanitizeIncomingFormData(d, {
               ...prev,
               date_of_reporting: d.date_of_reporting || today
             }));
           } else {
             // Second submission of the day (fresh start)
             setFormData(prev => sanitizeIncomingFormData({}, {
                ...prev,
                date_of_reporting: today,
                remark: "", visited_names: []
             }));
           }
        } else {
          setFormData(prev => ({ ...prev, date_of_reporting: today }));
        }

        try {
          localStorage.setItem('dfy_user_session', JSON.stringify({
            working_place: formData.working_place,
            fo_name: formData.fo_name,
            pin: formData.pin,
            date: today
          }));
        } catch (e) {}

        setIsLoggedIn(true);
        showToast(`Welcome back, ${formData.fo_name}!`, 'success');
      } catch (err) {
        showToast("Error checking status", "error");
      } finally {
        setIsSubmitting(false);
      }
    }
  };"""

if old_handle_login in text:
    text = text.replace(old_handle_login, new_handle_login)
    print("handleLogin and handleLogout updated")
else:
    print("old_handle_login not found")

# 4. Update Continue button in login JSX
old_btn = """                <button 
                  onClick={handleLogin}
                  disabled={pinStatus !== 'success'}
                  className={`w-full mt-6 py-3.5 rounded-xl font-bold text-sm tracking-widest uppercase shadow-lg transition-all ${pinStatus === 'success' ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-500/30 active:scale-95' : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'}`}
                >
                  Continue
                </button>"""

new_btn = """                <button 
                  onClick={handleLogin}
                  disabled={pinStatus !== 'success' || isSubmitting}
                  className={`w-full mt-6 py-3.5 rounded-xl font-bold text-sm tracking-widest uppercase shadow-lg transition-all ${pinStatus === 'success' && !isSubmitting ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-500/30 active:scale-95' : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'}`}
                >
                  {isSubmitting ? (
                    <div className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4 text-indigo-400" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Checking Status...</span>
                    </div>
                  ) : 'Continue'}
                </button>"""

if old_btn in text:
    text = text.replace(old_btn, new_btn)
    print("Continue button updated")
else:
    print("old_btn not found")

with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.write(text)

