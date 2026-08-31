import { useState, useEffect } from 'react'

// --- Simple Toast System ---
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  const bgColor = type === 'error' ? 'bg-red-500' : 'bg-emerald-500';

  return (
    <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-[100] ${bgColor} text-white px-5 py-3 rounded-full shadow-lg flex items-center gap-3 transition-all duration-300 ease-in-out`}>
      <span className="font-semibold text-sm tracking-wide">{message}</span>
      <button onClick={onClose} className="opacity-80 hover:opacity-100 font-bold text-lg leading-none">&times;</button>
    </div>
  );
};

// --- Accordion Container ---
const Accordion = ({ title, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="mb-4 bg-white rounded-2xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-slate-100 overflow-hidden transition-all hover:shadow-[0_8px_30px_-4px_rgba(6,81,237,0.15)]">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white hover:bg-slate-50/50 px-5 py-4 border-b border-slate-50 flex justify-between items-center outline-none transition-colors"
      >
        <span className="text-sm font-bold text-slate-800 tracking-wide uppercase">{title}</span>
        <svg 
          width="20" 
          height="20"
          className={`w-5 h-5 flex-shrink-0 text-slate-400 transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="p-4 sm:p-5 bg-slate-50/30">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {children}
          </div>
        </div>
      )}
    </div>
  );
};

// --- Id Bucket ---
const IdBucket = ({ title, ids, onAdd, onRemove, showToast }) => {
  const [currentId, setCurrentId] = useState("");

  const handleAdd = () => {
    if (currentId.length === 9 && !isNaN(currentId)) {
      onAdd(currentId);
      setCurrentId("");
    } else {
      showToast("ID exactly 9 digit ki honi chahiye bhai!", "error");
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm hover:border-slate-200 transition-colors group">
      <label className="block text-xs font-bold text-slate-400 tracking-wider uppercase mb-3 flex items-center justify-between group-hover:text-indigo-500 transition-colors">
        {title} 
        <span className="bg-indigo-50 text-indigo-600 px-2.5 py-0.5 rounded-full text-[10px] ml-1 font-bold">{ids.length}</span>
      </label>
      <div className="flex gap-2">
        <input 
          type="number" 
          value={currentId}
          onChange={(e) => setCurrentId(e.target.value)}
          placeholder="9-digit ID"
          className="flex-1 w-full bg-slate-50/50 border border-slate-200 text-slate-800 text-sm rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block px-3.5 py-2.5 outline-none transition-all placeholder:text-slate-300"
        />
        <button onClick={handleAdd} className="bg-indigo-600 text-white px-4 py-2.5 rounded-lg font-bold shadow-md shadow-indigo-600/20 hover:bg-indigo-700 hover:shadow-indigo-600/40 active:scale-95 transition-all text-sm tracking-wide">ADD</button>
      </div>
      {ids.length > 0 && (
        <ul className="mt-4 space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
          {ids.map((id, index) => (
            <li key={index} className="flex justify-between items-center bg-white border border-slate-100 px-3 py-2 rounded-lg shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]">
              <span className="font-mono font-bold text-slate-600 tracking-widest text-sm">{id}</span>
              <button onClick={() => onRemove(index)} className="text-red-400 hover:text-white hover:bg-red-500 bg-red-50 h-7 w-7 rounded-full flex items-center justify-center font-bold transition-all shadow-sm">&times;</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

function App() {
  const initialDirectory = {
    "Sheikhpura": ["Dhiraj Kumar", "Nilkamal Kumar"],
    "Nawada": ["Devraj Kumar", "Rajesh Kumar", "Rajiv kumar"],
    "Munger": ["Jayant Kumar", "Amit Kumar", "Saif Khan", "Sudhanshu Prasad", "Sumit Kr Singh", "Md. Raza Uddin", "Devrath Kumar", "Shyam Kumar Gupta"],
    "Lakhisarai": ["Ankit Kumar", "Ram Prakash"],
    "Jehanabad": ["Shashi Ranjan", "Suraj Kumar", "Sammer Arya"],
    "Jamui": ["Bablu Kumar", "Rajiv Kumar", "Rinki Kumari", "Monu Kumar"]
  };

  const [directory, setDirectory] = useState(initialDirectory);
  const [districts, setDistricts] = useState(Object.keys(initialDirectory));
  
  const [formData, setFormData] = useState({
    working_place: "", fo_name: "", pin: "",
    notification_ids: [], hiv_dm_ids: [], dbt_ids: [], 
    sample_collection_ids: [], sample_tested_ids: [], 
    outcome_assigned_ids: [], home_visit_ids: [], 
    contact_tracing_ids: [], follow_up_ids: [], 
    face_to_face_ids: [], presumptive_ids: [], 
    documents_ids: [], fdc_provided_ids: [], 
    kit_consumption_ids: [], visited_names: [], 
    morning_km: "", evening_km: "",
    is_override_used: false
  });

  const [morningPhotoFile, setMorningPhotoFile] = useState(null);
  const [eveningPhotoFile, setEveningPhotoFile] = useState(null);
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);

  const [appState, setAppState] = useState('not_started');

  const currentHour = new Date().getHours();
  const canEditMorning = appState === 'not_started' || isAdvancedMode;
  const canEditEvening = appState === 'in_progress' || isAdvancedMode;

  const [docName, setDocName] = useState("");
  const [pinStatus, setPinStatus] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [toast, setToast] = useState({ message: "", type: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showToast = (message, type = 'success') => setToast({ message, type });
  const closeToast = () => setToast({ message: "", type: "" });

  useEffect(() => {
    const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
    fetch(`${API_BASE_URL}/get-directory`)
      .then(res => res.json())
      .then(data => {
        if(Object.keys(data).length > 0){
          setDirectory(data);
          setDistricts(Object.keys(data));
        }
      }).catch(() => {});
  }, []);

  useEffect(() => {
    if (formData.pin.length === 4 && formData.fo_name && formData.working_place) {
      setPinStatus("checking");
      const checkPin = async () => {
        try {
          const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
          const res = await fetch(`${API_BASE_URL}/verify-pin`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ working_place: formData.working_place, fo_name: formData.fo_name, pin: formData.pin })
          });
          const data = await res.json();
          setPinStatus(data.valid ? "success" : "error");
        } catch {
          setPinStatus("error");
        }
      };
      checkPin();
    } else {
      setPinStatus(null);
    }
  }, [formData.pin, formData.fo_name, formData.working_place]);

  const handleDistrictChange = (e) => {
    setFormData({ ...formData, working_place: e.target.value, fo_name: "", pin: "" });
    setPinStatus(null);
  }

  const handleNameChange = (e) => {
    setFormData({ ...formData, fo_name: e.target.value, pin: "" });
    setPinStatus(null);
  }

  const handleLogin = async () => {
    if (pinStatus === 'success') {
      setIsSubmitting(true);
      try {
        const today = new Date().toISOString().split('T')[0];
        setFormData(prev => ({...prev, date_of_reporting: today}));
        const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
        const res = await fetch(`${API_BASE_URL}/check-today-status`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ working_place: formData.working_place, fo_name: formData.fo_name, date: today })
        });
        const data = await res.json();
        setAppState(data.status);
        if (data.status === 'in_progress' || data.status === 'completed') {
           setFormData(prev => ({ ...prev, morning_km: data.data.morning_km || '' }));
        }
        setIsLoggedIn(true);
        showToast(`Welcome back, ${formData.fo_name}!`, 'success');
      } catch (err) {
        showToast("Error checking status", "error");
      } finally {
        setIsSubmitting(false);
      }
    } else {
      showToast("Please enter the correct PIN to continue.", "error");
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setFormData({ ...formData, pin: "" });
    setPinStatus(null);
  };

  const addId = (field, id) => {
    if(!formData[field].includes(id)){
      setFormData({ ...formData, [field]: [...formData[field], id] });
    }
  };
  
  const removeId = (field, idx) => {
    setFormData({ ...formData, [field]: formData[field].filter((_, i) => i !== idx) });
  };
  
  const addDoctor = () => {
    if(docName) {
      setFormData({ ...formData, visited_names: [...formData.visited_names, docName] });
      setDocName("");
    }
  };

  const uploadPhoto = async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
    const res = await fetch(`${API_BASE_URL}/upload-image`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) throw new Error("Photo upload failed");
    const data = await res.json();
    return data.url;
  };

  const submitReport = async () => {
    if(!formData.working_place || !formData.fo_name || !formData.pin) {
      showToast("Pehle Zila, Naam aur PIN bharo!", "error");
      return;
    }
    
    if (appState === 'not_started') {
      if (!formData.morning_km) {
        showToast("Morning KM dalna zaroori hai bhai!", "error");
        return;
      }
      setIsSubmitting(true);
      try {
        let morningUrl = "";
        if (morningPhotoFile) {
          showToast("Uploading Morning KM Photo...", "success");
          morningUrl = await uploadPhoto(morningPhotoFile);
        }
        showToast("Starting your day...", "success");
        const payload = {
          working_place: formData.working_place,
          fo_name: formData.fo_name,
          date: formData.date_of_reporting,
          morning_km: formData.morning_km,
          morning_km_photo_url: morningUrl
        };
        const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
        const response = await fetch(`${API_BASE_URL}/start-day`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (response.ok) {
          showToast("Day Started! Have a great field visit.", "success");
          setTimeout(() => window.location.reload(), 2000);
        } else {
          showToast("Error starting day.", "error");
        }
      } catch (err) {
        showToast("Network error.", "error");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Submit Final Report
    setIsSubmitting(true);
    try {
      let eveningUrl = "";
      if (eveningPhotoFile) {
        showToast("Uploading Evening KM Photo...", "success");
        eveningUrl = await uploadPhoto(eveningPhotoFile);
      }

      showToast("Submitting Final Report...", "success");
      const totalKm = Number(formData.evening_km) - Number(formData.morning_km);
      const finalPayload = { 
        ...formData, 
        total_km: totalKm > 0 ? totalKm : 0,
        evening_km_photo_url: eveningUrl
      };

      const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
      const response = await fetch(`${API_BASE_URL}/submit-daily-report`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalPayload)
      });
      const result = await response.json();
      
      if(response.ok) {
        showToast("Final Report Submitted Successfully!", "success");
        setTimeout(() => window.location.reload(), 2000);
      } else {
        showToast(result.detail || "Error in saving data.", "error");
      }
    } catch (error) {
      showToast("API is down or upload failed.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const group1 = [
    { key: "notification_ids", label: "Notification" },
    { key: "hiv_dm_ids", label: "HIV & DM" },
    { key: "dbt_ids", label: "DBT" },
  ];
  const group2 = [
    { key: "sample_collection_ids", label: "Sample Collection" },
    { key: "sample_tested_ids", label: "Sample Tested" },
    { key: "outcome_assigned_ids", label: "Outcome Assigned" },
  ];
  const group3 = [
    { key: "home_visit_ids", label: "Home Visit" },
    { key: "contact_tracing_ids", label: "Contact Tracing" },
    { key: "follow_up_ids", label: "Follow Up" },
    { key: "face_to_face_ids", label: "Face to Face" },
    { key: "presumptive_ids", label: "Presumptive" },
  ];
  const group4 = [
    { key: "documents_ids", label: "Documents" },
    { key: "fdc_provided_ids", label: "FDC Provided" },
    { key: "kit_consumption_ids", label: "Kit Consumption" }
  ];

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans pb-40 text-slate-800">
      <Toast message={toast.message} type={toast.type} onClose={closeToast} />

      <header className="bg-white border-b border-slate-100 p-4 sticky top-0 z-40 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)]">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-indigo-600 to-blue-500 h-10 w-10 sm:h-11 sm:w-11 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30 text-white font-black text-xl shrink-0">
              <svg width="20" height="20" className="sm:w-[22px] sm:h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black tracking-wide leading-tight text-slate-800">DFY <span className="text-indigo-600">REPORTING</span></h1>
              <p className="text-slate-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest mt-0.5 whitespace-nowrap">Mobile MIS Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 ml-auto">
            <button onClick={() => window.location.href = '/admin'} className="flex items-center gap-1 sm:gap-1.5 text-slate-400 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 px-2 py-1 sm:px-2.5 sm:py-1 rounded-full transition-colors border border-transparent hover:border-indigo-100" title="Admin Portal">
              <svg width="12" height="12" className="sm:w-[14px] sm:h-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M16 21v-2a4 4 0 0 0-4-3.87"/></svg>
              <span className="text-[9px] sm:text-[10px] font-bold tracking-wider hidden sm:inline">ADMIN</span>
            </button>
            <div className="bg-indigo-50 text-indigo-600 px-2 sm:px-3 py-1 rounded-full text-[9px] sm:text-[10px] font-bold border border-indigo-100 shadow-sm tracking-wider">v3.1</div>
            {isLoggedIn && (
              <button onClick={handleLogout} className="text-slate-400 hover:text-slate-800 text-sm font-bold transition-colors">
                <svg width="18" height="18" className="sm:w-[20px] sm:h-[20px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 sm:p-6 mt-2">
        {!isLoggedIn ? (
          /* Login Screen */
          <div className="max-w-md mx-auto mt-8 sm:mt-16 animate-fade-in-down">
            <div className="text-center mb-8">
              <div className="mx-auto bg-indigo-50 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                </svg>
              </div>
              <h2 className="text-2xl font-black text-slate-800 mb-2">Secure Login</h2>
              <p className="text-slate-500 text-sm font-medium">Select your profile and enter PIN to access the dashboard.</p>
            </div>
            
            <div className="bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 sm:p-8 border border-slate-100">
              <div className="space-y-5">
                <div>
                  <label className="block text-xs text-slate-500 font-bold uppercase tracking-wider mb-1.5 ml-1">District (Zila)</label>
                  <select value={formData.working_place} onChange={handleDistrictChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 font-semibold outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm">
                    <option value="">Select District</option>
                    {districts.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                
                {formData.working_place && (
                  <div className="animate-fade-in">
                    <label className="block text-xs text-slate-500 font-bold uppercase tracking-wider mb-1.5 ml-1">Select Name</label>
                    <select value={formData.fo_name} onChange={handleNameChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 font-semibold outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm">
                      <option value="">Select Name</option>
                      {directory[formData.working_place].map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </div>
                )}

                {formData.fo_name && (
                  <div className="animate-fade-in">
                    <label className="block text-xs text-slate-500 font-bold uppercase tracking-wider mb-1.5 ml-1">Enter Secret PIN</label>
                    <input 
                      type="password" 
                      placeholder="****" 
                      maxLength="4" 
                      value={formData.pin} 
                      onChange={(e) => setFormData({...formData, pin: e.target.value})} 
                      className={`w-full bg-slate-50 border ${pinStatus === 'success' ? 'border-emerald-500 ring-2 ring-emerald-200' : pinStatus === 'error' ? 'border-red-500 ring-2 ring-red-200' : 'border-slate-200'} rounded-xl px-4 py-3.5 text-xl tracking-[0.5em] text-slate-800 font-black outline-none text-center transition-all shadow-inner`} 
                    />
                  </div>
                )}

                <button 
                  onClick={handleLogin}
                  disabled={pinStatus !== 'success'}
                  className={`w-full mt-6 py-3.5 rounded-xl font-bold text-sm tracking-widest uppercase shadow-lg transition-all ${pinStatus === 'success' ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-500/30 active:scale-95' : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'}`}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        ) : appState === 'completed' ? (
          <div className="max-w-md mx-auto mt-16 text-center bg-white p-8 rounded-2xl shadow-sm border border-slate-100 animate-fade-in-down">
             <div className="mx-auto bg-emerald-50 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
             </div>
             <h2 className="text-2xl font-black text-emerald-600 mb-2">Day Completed!</h2>
             <p className="text-slate-500 text-sm font-medium">You have successfully submitted your final daily report for today. Great job!</p>
          </div>
        ) : (
          /* Main Dashboard */
          <div className="animate-fade-in">
            <div className="mb-6 px-2 flex justify-between items-end">
              <div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Daily Activity Form</h2>
                <p className="text-sm text-slate-500 font-medium mt-1">Logged in as <span className="text-indigo-600 font-bold">{formData.fo_name}</span> ({formData.working_place})</p>
              </div>
            </div>

            {appState === 'in_progress' && (
              <>
                <Accordion title="1. Patient Registration" defaultOpen={true}>
                  {group1.map((cat) => (
                    <IdBucket key={cat.key} title={cat.label} ids={formData[cat.key]} onAdd={(id) => addId(cat.key, id)} onRemove={(idx) => removeId(cat.key, idx)} showToast={showToast} />
                  ))}
                </Accordion>

                <Accordion title="2. Diagnostics & Testing">
                  {group2.map((cat) => (
                    <IdBucket key={cat.key} title={cat.label} ids={formData[cat.key]} onAdd={(id) => addId(cat.key, id)} onRemove={(idx) => removeId(cat.key, idx)} showToast={showToast} />
                  ))}
                </Accordion>

                <Accordion title="3. Field Work & Visits">
                  {group3.map((cat) => (
                    <IdBucket key={cat.key} title={cat.label} ids={formData[cat.key]} onAdd={(id) => addId(cat.key, id)} onRemove={(idx) => removeId(cat.key, idx)} showToast={showToast} />
                  ))}
                </Accordion>

                <Accordion title="4. Logistics & Outcomes">
                  {group4.map((cat) => (
                    <IdBucket key={cat.key} title={cat.label} ids={formData[cat.key]} onAdd={(id) => addId(cat.key, id)} onRemove={(idx) => removeId(cat.key, idx)} showToast={showToast} />
                  ))}
                </Accordion>
              </>
            )}

            {/* Travel & Doctors Section */}
            <div className={`grid grid-cols-1 ${appState === 'in_progress' ? 'md:grid-cols-2' : ''} gap-4 mt-8`}>
              {/* Doctor Visits */}
              {appState === 'in_progress' && (
                <div className="bg-white rounded-2xl shadow-[0_2px_10px_-3px_rgba(16,185,129,0.1)] border border-emerald-100 overflow-hidden">
                  <div className="bg-emerald-50/50 px-5 py-4 border-b border-emerald-50 flex items-center gap-2">
                    <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    <label className="block text-sm font-bold text-emerald-800 tracking-wide uppercase">Doctor / Store Visits</label>
                  </div>
                  <div className="p-4 sm:p-5">
                    <div className="flex gap-2">
                      <input type="text" value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="Doctor/Store Name" className="flex-1 w-full bg-slate-50/50 border border-slate-200 text-slate-800 text-sm rounded-lg px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-slate-300" />
                      <button onClick={addDoctor} className="bg-emerald-500 text-white px-4 py-2.5 rounded-lg font-bold shadow-md shadow-emerald-500/20 hover:bg-emerald-600 active:scale-95 transition-all text-sm tracking-wide">ADD</button>
                    </div>
                    {formData.visited_names.length > 0 && (
                      <ul className="mt-4 space-y-2">
                        {formData.visited_names.map((name, i) => (
                          <li key={i} className="flex justify-between items-center bg-white border border-slate-100 px-3.5 py-2.5 rounded-lg text-sm text-slate-600 font-semibold shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]">
                            <span className="flex items-center gap-3">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                              {name}
                            </span>
                            <button onClick={() => {
                              setFormData({ ...formData, visited_names: formData.visited_names.filter((_, idx) => idx !== i) });
                            }} className="text-slate-300 hover:text-red-500 font-bold text-lg transition-colors">&times;</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {/* Travel Meter */}
              <div className="bg-[#0f172a] rounded-2xl shadow-xl shadow-slate-900/10 border border-slate-800 overflow-hidden relative flex flex-col justify-between">
                <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500 rounded-full blur-[80px] opacity-20 -mr-10 -mt-10 pointer-events-none"></div>
                <div className="bg-slate-800/40 px-4 py-3 border-b border-slate-700/50 relative z-10 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    <label className="block text-sm font-bold text-white tracking-wide uppercase">Travel Meter (KM)</label>
                  </div>
                  {!isAdvancedMode && (
                    <span className="bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border border-indigo-500/30">
                      {currentHour < 14 ? 'Morning Mode' : 'Evening Mode'}
                    </span>
                  )}
                </div>
                <div className="p-4 flex flex-col sm:flex-row gap-4 sm:gap-3 relative z-10">
                  <div className="flex-1 space-y-2">
                    <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider ml-1">Morning KM</label>
                    <input disabled={!canEditMorning} type="number" placeholder="Start" value={formData.morning_km} onChange={(e) => setFormData({...formData, morning_km: e.target.value})} className={`w-full ${!canEditMorning ? 'bg-slate-800/40 text-slate-500 cursor-not-allowed' : 'bg-slate-800/80 text-white'} border border-slate-700 rounded-xl px-3 py-2.5 outline-none text-sm placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 transition-all shadow-inner`} />
                    <label className={`w-full border border-slate-600 rounded-lg py-2 flex items-center justify-center gap-2 text-xs font-bold transition-all ${!canEditMorning ? 'bg-slate-800/40 text-slate-600 cursor-not-allowed' : 'cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-300'}`}>
                      <input disabled={!canEditMorning} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if(e.target.files[0]) setMorningPhotoFile(e.target.files[0]); }} />
                      <svg className={`w-4 h-4 ${morningPhotoFile ? 'text-emerald-400' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      {morningPhotoFile ? 'Photo Added' : 'Take Photo'}
                    </label>
                  </div>
                  {appState === 'in_progress' && (
                    <div className="flex-1 space-y-2">
                      <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider ml-1">Evening KM</label>
                      <input disabled={!canEditEvening} type="number" placeholder="End" value={formData.evening_km} onChange={(e) => setFormData({...formData, evening_km: e.target.value})} className={`w-full ${!canEditEvening ? 'bg-slate-800/40 text-slate-500 cursor-not-allowed' : 'bg-slate-800/80 text-white'} border border-slate-700 rounded-xl px-3 py-2.5 outline-none text-sm placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 transition-all shadow-inner`} />
                      <label className={`w-full border border-slate-600 rounded-lg py-2 flex items-center justify-center gap-2 text-xs font-bold transition-all ${!canEditEvening ? 'bg-slate-800/40 text-slate-600 cursor-not-allowed' : 'cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-300'}`}>
                        <input disabled={!canEditEvening} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if(e.target.files[0]) setEveningPhotoFile(e.target.files[0]); }} />
                        <svg className={`w-4 h-4 ${eveningPhotoFile ? 'text-emerald-400' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        {eveningPhotoFile ? 'Photo Added' : 'Take Photo'}
                      </label>
                    </div>
                  )}
                </div>
                {formData.morning_km && formData.evening_km && (
                  <div className="px-4 pb-4 relative z-10 mt-auto">
                    <div className="bg-slate-900 rounded-lg p-2.5 text-center border border-slate-700">
                      <span className="text-slate-400 text-xs font-bold uppercase tracking-wider mr-2">Total Distance:</span>
                      <span className="text-emerald-400 font-black">{Math.max(0, Number(formData.evening_km) - Number(formData.morning_km))} KM</span>
                    </div>
                  </div>
                )}
                {!isAdvancedMode && (
                  <div className="px-4 pb-4 relative z-10 mt-auto">
                    <button 
                      onClick={() => {
                        if(window.confirm("Do you want to unlock missed entries? This will be marked as 'Adjusted' in the admin report.")) {
                          setIsAdvancedMode(true);
                          setFormData({...formData, is_override_used: true});
                        }
                      }}
                      className="w-full text-slate-500 text-[10px] font-bold uppercase tracking-wider underline hover:text-indigo-400 text-center transition-colors">
                      Unlock Missed Entry (Advanced Override)
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Spacer for Sticky Footer */}
            <div className="h-40 w-full pointer-events-none"></div>

            {/* Sticky Bottom Action Bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-slate-100 p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.03)] z-50">
              <div className="max-w-4xl mx-auto">
                <button 
                  onClick={submitReport} 
                  disabled={isSubmitting}
                  className={`w-full bg-indigo-600 text-white font-bold text-sm py-4 px-4 sm:px-6 rounded-xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 hover:shadow-indigo-600/40 active:scale-95 transition-all tracking-widest uppercase flex justify-center items-center gap-3 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {isSubmitting ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      Submitting...
                    </>
                  ) : 'Submit Final Report'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      
    </div>
  )
}

export default App