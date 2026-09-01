with open("src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

# 1. Add currentView state
state_old = "const [isLoggedIn, setIsLoggedIn] = useState(false);"
state_new = """const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentView, setCurrentView] = useState('form');"""
text = text.replace(state_old, state_new)

# 2. Add MyProfileDashboard Component
profile_comp = """
// --- My Profile Dashboard ---
const MyProfileDashboard = ({ formData, showToast }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const today = new Date();
        const monthStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, '0');
        const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
        const res = await fetch(`${API_BASE_URL}/my-profile-stats`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
             working_place: formData.working_place, 
             fo_name: formData.fo_name, 
             pin: formData.pin, 
             month: monthStr 
          })
        });
        const data = await res.json();
        if(data.success) {
          setStats(data);
        } else {
          showToast("Error loading profile", "error");
        }
      } catch(err) {
        showToast("Network error", "error");
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [formData]);

  if(loading) return (
    <div className="flex flex-col items-center justify-center p-10 mt-10">
      <svg className="animate-spin h-10 w-10 text-indigo-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
      <p className="text-slate-500 font-bold tracking-widest text-sm uppercase">Loading Profile...</p>
    </div>
  );

  const percent = stats.target > 0 ? Math.min(100, Math.round((stats.total_achieved / stats.target) * 100)) : 100;
  
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
  );
};

// --- Id Bucket ---"""

bucket_idx = text.find('// --- Id Bucket ---')
text = text[:bucket_idx] + profile_comp + text[bucket_idx:]


# 3. Header Buttons
old_header_btns = """              {isLoggedIn && (
                <button onClick={handleLogout} className="text-slate-400 hover:text-slate-800 text-sm font-bold transition-colors">
                  <svg width="18" height="18" className="sm:w-[20px] sm:h-[20px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                </button>
              )}"""

new_header_btns = """              {isLoggedIn && (
                <>
                  <button onClick={() => setCurrentView(currentView === 'form' ? 'profile' : 'form')} className="bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-indigo-200 transition-colors">
                    {currentView === 'form' ? 'Profile' : 'Form'}
                  </button>
                  <button onClick={handleLogout} className="text-slate-400 hover:text-slate-800 text-sm font-bold transition-colors ml-1">
                    <svg width="18" height="18" className="sm:w-[20px] sm:h-[20px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                  </button>
                </>
              )}"""
text = text.replace(old_header_btns, new_header_btns)


# 4. Main Body conditional rendering
old_main = """          ) : (
            /* Main Dashboard */
            <div className="animate-fade-in w-full max-w-md mx-auto overflow-x-hidden">"""

new_main = """          ) : currentView === 'profile' ? (
            <MyProfileDashboard formData={formData} showToast={showToast} />
          ) : (
            /* Main Dashboard */
            <div className="animate-fade-in w-full max-w-md mx-auto overflow-x-hidden">"""

text = text.replace(old_main, new_main)

with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.write(text)

