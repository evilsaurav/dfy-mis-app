import os

with open("src/AdminDashboard.jsx", "r", encoding="utf-8") as f:
    text = f.read()

# Add a button for "Manage Targets" in the Quick Actions section
# Find `<button onClick={downloadExcel} ... > \n ... \n </button>`
btn_search = '<button onClick={downloadExcel} className="flex flex-col items-center justify-center p-4 bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-2xl hover:shadow-lg hover:shadow-indigo-500/10 hover:border-indigo-300 transition-all group">'
new_buttons = btn_search.replace(
    '<button onClick={downloadExcel}',
    '<button onClick={() => setShowTargetModal(true)} className="flex flex-col items-center justify-center p-4 bg-gradient-to-br from-amber-50 to-white border border-amber-100 rounded-2xl hover:shadow-lg hover:shadow-amber-500/10 hover:border-amber-300 transition-all group">\n                      <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">\n                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>\n                      </div>\n                      <span className="text-sm font-bold text-slate-700">Set Targets</span>\n                    </button>\n\n                    <button onClick={downloadExcel}'
)
text = text.replace(btn_search, new_buttons)

# Define `showTargetModal`, `targets`, `targetDistrict`
state_def = "  const [targetDistrict, setTargetDistrict] = useState('');\n  const [showTargetModal, setShowTargetModal] = useState(false);\n  const [targets, setTargets] = useState([]);\n  const [targetInputs, setTargetInputs] = useState({});"
text = text.replace("const [showStaffModal, setShowStaffModal] = useState(false);", "const [showStaffModal, setShowStaffModal] = useState(false);\n" + state_def)

# Add fetch function for targets
fetch_targets = """
  const loadTargets = async (dist) => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await fetch(`${API_BASE_URL}/get-targets?district=${dist}`);
      const data = await res.json();
      if(data.success) {
        setTargets(data.targets);
        const tMap = {};
        data.targets.forEach(t => tMap[t.fo_name] = t.target);
        setTargetInputs(tMap);
      }
    } catch(err) {
      console.error(err);
    }
  };

  const saveTarget = async (fo_name, targetVal) => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await fetch(`${API_BASE_URL}/update-target`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ district: targetDistrict, fo_name, target: Number(targetVal) })
      });
      if(res.ok) {
        alert(`${fo_name} ka target save ho gaya: ${targetVal}`);
      }
    } catch(err) {
      alert("Error saving target");
    }
  };
"""
text = text.replace("const downloadExcel = async () => {", fetch_targets + "\n  const downloadExcel = async () => {")

# Add the target modal JSX at the very end before the last closing `</div>`
modal_jsx = """
      {/* Target Management Modal */}
      {showTargetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-black text-slate-800">Set Monthly Targets</h3>
              <button onClick={() => setShowTargetModal(false)} className="text-slate-400 hover:text-red-500">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Select District</label>
              <select 
                value={targetDistrict} 
                onChange={(e) => { setTargetDistrict(e.target.value); loadTargets(e.target.value); }} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-500 mb-6"
              >
                <option value="">-- Select District --</option>
                {Object.keys(staffDirectory).map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              {targetDistrict && staffDirectory[targetDistrict] && (
                <div className="space-y-3">
                  {staffDirectory[targetDistrict].map(staff => (
                    <div key={staff.name} className="flex items-center justify-between bg-white border border-slate-100 p-3 rounded-xl shadow-sm">
                      <div className="font-semibold text-slate-700 text-sm">{staff.name}</div>
                      <div className="flex items-center gap-2">
                        <input 
                          type="number" 
                          value={targetInputs[staff.name] || ''}
                          onChange={(e) => setTargetInputs({...targetInputs, [staff.name]: e.target.value})}
                          placeholder="Target"
                          className="w-24 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-center text-sm font-bold outline-none focus:border-amber-400"
                        />
                        <button 
                          onClick={() => saveTarget(staff.name, targetInputs[staff.name])}
                          className="bg-amber-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-amber-600 transition-colors"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
"""

# Insert modal right before the final `</div>\n    </div>\n  );\n}`
text = text.replace("      {showStaffModal && (", modal_jsx + "\n      {showStaffModal && (")


with open("src/AdminDashboard.jsx", "w", encoding="utf-8") as f:
    f.write(text)

