with open("src/AdminDashboard.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

# Add states
state_old = "const [sortConfig, setSortConfig] = useState({ key: 'total_km', direction: 'desc' });"
state_new = """const [sortConfig, setSortConfig] = useState({ key: 'total_km', direction: 'desc' });
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [targetsData, setTargetsData] = useState([]);

  const loadTargets = async (dist) => {
      try {
          const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
          const res = await fetch(API_BASE_URL + "/get-targets" + (dist !== 'All' ? `?district=${dist}` : ''));
          const data = await res.json();
          if(data.success) {
              setTargetsData(data.targets);
          }
      } catch(err) {
          console.error(err);
      }
  };

  const handleTargetChange = (fo_name, value) => {
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

text = text.replace(state_old, state_new)

# Add button
btn_old = """                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                  KPI Master
                </button>"""
btn_new = btn_old + """
                <button onClick={() => {
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

text = text.replace(btn_old, btn_new)

# Add Modal
modal_code = """
      {showTargetModal && (
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
      )}
"""

main_end = text.find('    </div>\n  );\n}')
text = text[:main_end] + modal_code + text[main_end:]

with open("src/AdminDashboard.jsx", "w", encoding="utf-8") as f:
    f.write(text)

