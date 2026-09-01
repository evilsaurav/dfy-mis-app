# -*- coding: utf-8 -*-
with open("dfy-frontend/src/AdminDashboard.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

# 1. Add staffDirectory and targetModalDistrict state
state_marker = "  const [targetsData, setTargetsData] = useState([]);"
new_state = """  const [targetsData, setTargetsData] = useState([]);
  const [staffDirectory, setStaffDirectory] = useState({});
  const [targetModalDistrict, setTargetModalDistrict] = useState('All');
  const [isSavingTargets, setIsSavingTargets] = useState(false);"""

if state_marker in text:
    text = text.replace(state_marker, new_state)
    print("staffDirectory state added")
else:
    print("state_marker not found")

# 2. Fetch staff directory in useEffect
fetch_dir_code = """
  const fetchDirectory = async () => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await fetch(`${API_BASE_URL}/staff-directory`);
      const data = await res.json();
      if (data.status === 'success') {
        setStaffDirectory(data.data);
      }
    } catch (e) {
      console.error("Failed to fetch staff directory", e);
    }
  };
"""

if "const fetchDirectory =" not in text:
    target_handler_marker = "  const loadTargets = async (dist) => {"
    if target_handler_marker in text:
        text = text.replace(target_handler_marker, fetch_dir_code + "\n" + target_handler_marker)
        print("fetchDirectory helper added")

# Trigger fetchDirectory on mount
auth_marker = "if (isAuthenticated) { fetchData(); fetchAttendance(); loadTargets('All'); }"
if auth_marker in text:
    text = text.replace(auth_marker, "if (isAuthenticated) { fetchData(); fetchAttendance(); fetchDirectory(); loadTargets('All'); }")
    print("fetchDirectory triggered in auth effect")

# 3. Update handleTargetChange and saveAllTargets
old_target_handlers = """  const handleTargetChange = (fo_name, value) => {
      setTargetsData(prev => {
          const exists = prev.find(t => t.fo_name === fo_name);
          if (exists) {
              return prev.map(t => t.fo_name === fo_name ? { ...t, target: value } : t);
          } else {
              return [...prev, { fo_name, district: selectedDistrict, target: value }];
          }
      });
  };

  const saveAllTargets = async () => {
      try {
          const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
          for (let t of targetsData) {
              await fetch(API_BASE_URL + "/update-target", {
                  method: "POST", headers:{"Content-Type":"application/json"},
                  body: JSON.stringify({ fo_name: t.fo_name, district: t.district || selectedDistrict, target: Number(t.target) })
              });
          }
          alert("Targets saved successfully!");
          setShowTargetModal(false);
      } catch(err) {
          console.error(err);
          alert("Error saving targets");
      }
  };"""

new_target_handlers = """  const handleTargetChange = (district, fo_name, value) => {
      setTargetsData(prev => {
          const exists = prev.find(t => t.fo_name === fo_name && t.district === district);
          if (exists) {
              return prev.map(t => (t.fo_name === fo_name && t.district === district) ? { ...t, target: Number(value) } : t);
          } else {
              return [...prev, { fo_name, district, target: Number(value) }];
          }
      });
  };

  const saveAllTargets = async () => {
      setIsSavingTargets(true);
      try {
          const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
          for (let t of targetsData) {
              if (t.fo_name && t.district) {
                  await fetch(API_BASE_URL + "/update-target", {
                      method: "POST", headers:{"Content-Type":"application/json"},
                      body: JSON.stringify({ fo_name: t.fo_name, district: t.district, target: Number(t.target) || 0 })
                  });
              }
          }
          alert("All targets saved successfully!");
          setShowTargetModal(false);
          loadTargets('All');
      } catch(err) {
          console.error(err);
          alert("Error saving targets");
      } finally {
          setIsSavingTargets(false);
      }
  };"""

if old_target_handlers in text:
    text = text.replace(old_target_handlers, new_target_handlers)
    print("target handlers updated")
else:
    print("old_target_handlers not found")

# 4. Update Set Targets button to allow opening modal from anywhere
old_set_target_btn = """                <button onClick={() => {
                  if (selectedDistrict === 'All') {
                    alert('Please select a specific District first.');
                    return;
                  }
                  loadTargets(selectedDistrict);
                  setShowTargetModal(true);
                }} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-purple-700 transition-colors shadow-sm flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
                  Set Targets
                </button>"""

new_set_target_btn = """                <button onClick={() => {
                  setTargetModalDistrict(selectedDistrict !== 'All' ? selectedDistrict : 'All');
                  loadTargets('All');
                  fetchDirectory();
                  setShowTargetModal(true);
                }} className="bg-purple-600 text-white px-3.5 py-2 rounded-lg text-xs font-bold hover:bg-purple-700 transition-colors shadow-sm flex items-center gap-1.5" title="Set Monthly Notification Targets for All Staff">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
                  Set Targets
                </button>"""

if old_set_target_btn in text:
    text = text.replace(old_set_target_btn, new_set_target_btn)
    print("Set Targets button updated")
else:
    print("old_set_target_btn not found")

# 5. Update Target Progress Bars calculation to use NOTIFICATIONS
old_progress_calc = """                {tableData.map((row, idx) => {
                  const totalWork = (row.notifications || 0) + (row.tests || 0) + (row.presumptive || 0) + (row.doctor_visits || 0) + (row.hiv_dm || 0) + (row.dbt || 0) + (row.sample_collection || 0) + (row.outcome_assigned || 0) + (row.home_visits || 0) + (row.contact_tracing || 0) + (row.follow_ups || 0) + (row.face_to_face || 0) + (row.documents || 0) + (row.fdc_provided || 0) + (row.kit_consumption || 0) + (row.differentiated_tb || 0) + (row.tpt_treatment_start || 0) + (row.tpt_presumptive || 0) + (row.adhar_face_auth || 0) + (row.consent_with_id || 0);
                  
                  const targetObj = targetsData.find(t => t.fo_name === row.name || t.district === row.name);
                  const targetNum = targetObj ? Number(targetObj.target) : 100;
                  const pct = targetNum > 0 ? Math.min(100, Math.round((totalWork / targetNum) * 100)) : 100;"""

new_progress_calc = """                {tableData.map((row, idx) => {
                  const notifCount = row.notifications || 0;
                  
                  // Calculate target: if district row, sum all targets for this district; if FO row, find FO target
                  let targetNum = 0;
                  if (selectedDistrict === 'All') {
                    // Sum targets of all FOs in this district
                    targetNum = targetsData.filter(t => t.district === row.name).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
                  } else {
                    const targetObj = targetsData.find(t => t.fo_name === row.name && (t.district === selectedDistrict || t.district === row.working_place));
                    targetNum = targetObj ? Number(targetObj.target) : 0;
                  }
                  
                  const pct = targetNum > 0 ? Math.min(100, Math.round((notifCount / targetNum) * 100)) : 0;"""

if old_progress_calc in text:
    text = text.replace(old_progress_calc, new_progress_calc)
    print("progress bar calculation updated to notification formula")
else:
    print("old_progress_calc not found")

# Also update the label under name in progress card
old_card_label = '<p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{totalWork} Achieved / {targetNum} Target</p>'
new_card_label = '<p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{notifCount} Notif / {targetNum} Target</p>'
if old_card_label in text:
    text = text.replace(old_card_label, new_card_label)
    print("card label updated to Notif")

# 6. Redesign Target Setting Modal to support all districts and all directory staff
old_target_modal = """      {showTargetModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-black text-slate-800">Set Monthly Targets - {selectedDistrict}</h2>
              <button onClick={() => setShowTargetModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl">&times;</button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {fos.filter(f => f !== 'All').map(fo => {
                 const tData = targetsData.find(t => t.fo_name === fo);
                 const currentTarget = tData ? tData.target : 0;
                 return (
                   <div key={fo} className="flex justify-between items-center bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
                     <span className="font-bold text-slate-700">{fo}</span>
                     <input type="number" value={currentTarget} onChange={(e) => handleTargetChange(fo, e.target.value)} className="w-24 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-center font-bold text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                   </div>
                 );
              })}
              {fos.filter(f => f !== 'All').length === 0 && (
                 <p className="text-center text-slate-500 font-medium py-4">No officers found for this district yet. They must submit at least one report.</p>
              )}
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setShowTargetModal(false)} className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors">Cancel</button>
              <button onClick={saveAllTargets} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-md hover:bg-indigo-700 active:scale-95 transition-all">Save Targets</button>
            </div>
          </div>
        </div>
      )}"""

new_target_modal = """      {showTargetModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-slate-100 animate-fade-in">
            <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-slate-50/80">
              <div>
                <h2 className="text-lg sm:text-xl font-black text-slate-800">Set Monthly Notification Targets</h2>
                <p className="text-xs text-slate-500 font-medium">Configure individual officer targets across all districts</p>
              </div>
              <div className="flex items-center gap-2">
                <select 
                  value={targetModalDistrict} 
                  onChange={(e) => setTargetModalDistrict(e.target.value)}
                  className="bg-white border border-slate-200 text-slate-700 font-bold text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="All">All Districts</option>
                  {Object.keys(staffDirectory).sort().map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <button onClick={() => setShowTargetModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-2xl p-1 leading-none">&times;</button>
              </div>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
              {(targetModalDistrict === 'All' ? Object.keys(staffDirectory).sort() : [targetModalDistrict]).map(dist => {
                const officers = staffDirectory[dist] || [];
                return (
                  <div key={dist} className="space-y-2.5">
                    <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                      <span className="h-2 w-2 rounded-full bg-purple-600"></span>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">{dist} District ({officers.length} Staff)</h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {officers.map(fo => {
                        const tData = targetsData.find(t => t.fo_name === fo && t.district === dist);
                        const currentTarget = tData ? tData.target : 0;
                        return (
                          <div key={fo} className="flex justify-between items-center bg-slate-50 border border-slate-100 hover:border-purple-200 p-3 rounded-xl transition-colors">
                            <span className="font-bold text-xs text-slate-800 truncate mr-2">{fo}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] font-bold text-slate-400">Target:</span>
                              <input 
                                type="number" 
                                value={currentTarget} 
                                onChange={(e) => handleTargetChange(dist, fo, e.target.value)} 
                                className="w-20 bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-center font-black text-xs text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-sm" 
                                placeholder="0" 
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-5 border-t border-slate-100 bg-slate-50/80 flex justify-between items-center gap-3">
              <span className="text-xs text-slate-400 font-medium hidden sm:inline">Targets are evaluated against monthly Notification metrics.</span>
              <div className="flex items-center gap-3 ml-auto">
                <button onClick={() => setShowTargetModal(false)} className="px-4 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-200 transition-colors">Cancel</button>
                <button 
                  onClick={saveAllTargets} 
                  disabled={isSavingTargets}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow-md shadow-purple-600/20 active:scale-95 transition-all flex items-center gap-2"
                >
                  {isSavingTargets ? 'Saving...' : 'Save All Targets'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}"""

if old_target_modal in text:
    text = text.replace(old_target_modal, new_target_modal)
    print("Target setting modal redesigned for all districts & staff")
else:
    print("old_target_modal not found")

with open("dfy-frontend/src/AdminDashboard.jsx", "w", encoding="utf-8") as f:
    f.write(text)
