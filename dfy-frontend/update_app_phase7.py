# -*- coding: utf-8 -*-
with open("dfy-frontend/src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

# 1. Add Streak & Badges UI in MyProfileDashboard right below the Name & District
profile_header_marker = '<p className="text-slate-500 font-bold text-sm tracking-wider uppercase">{formData.working_place}</p>'
streak_badges_ui = """<p className="text-slate-500 font-bold text-sm tracking-wider uppercase">{formData.working_place}</p>
        
        {/* Streak Counter & Milestone Badges */}
        <div className="mt-3 flex items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1 rounded-full text-xs font-black shadow-sm">
            <span>🔥</span>
            <span>{stats.streak_days || 0} Day Streak</span>
          </span>
          {stats.total_km > 0 && (
            <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-1 rounded-full text-xs font-black shadow-sm">
              <span>🛵</span>
              <span>{stats.total_km} KM Travelled</span>
            </span>
          )}
        </div>

        {stats.badges && stats.badges.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {stats.badges.map(b => (
              <div key={b.id} className="bg-slate-50 hover:bg-indigo-50/50 border border-slate-200/80 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm transition-all" title={b.desc}>
                <span className="text-sm">{b.icon}</span>
                <span className="text-[11px] font-black text-slate-700">{b.title}</span>
              </div>
            ))}
          </div>
        )}"""

if profile_header_marker in text:
    text = text.replace(profile_header_marker, streak_badges_ui)
    print("streak & badges UI added in MyProfileDashboard")

# 2. Add Quick Doctor / Store suggestions in the Form
doctor_input_marker = '<div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5 shadow-sm">'
old_doc_section = """        <div className="flex gap-2">
          <input 
            type="text" 
            value={docName} 
            onChange={(e) => setDocName(e.target.value)} 
            placeholder="Doctor clinic or medical store name" 
            className="flex-1 w-full bg-slate-50/70 border border-slate-200 text-slate-800 text-sm font-semibold rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block px-3.5 py-2.5 outline-none transition-all placeholder:text-slate-400 placeholder:font-normal"
          />
          <button 
            onClick={addDoctor} 
            className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-bold shadow-md shadow-indigo-600/20 hover:bg-indigo-700 hover:shadow-indigo-600/40 active:scale-95 transition-all text-sm tracking-wide shrink-0"
          >
            ADD
          </button>
        </div>"""

new_doc_section = """        {/* Frequent Clinic Quick-Chips */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {["Dr. A. K. Singh Clinic", "City Medical Store", "Sadar Hospital OPD", "Gupta Chemist", "Prathamik Swasthya Kendra", "Jan Aushadhi Kendra"].map((quickName, qIdx) => (
            <button
              key={qIdx}
              type="button"
              onClick={() => {
                if (!formData.visited_names.includes(quickName)) {
                  setFormData(prev => ({ ...prev, visited_names: [...prev.visited_names, quickName] }));
                  showToast(`${quickName} added!`, 'success');
                }
              }}
              className="text-[10px] font-bold bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 border border-slate-200/60 hover:border-indigo-200 px-2.5 py-1 rounded-lg transition-all active:scale-95"
            >
              + {quickName}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input 
            type="text" 
            value={docName} 
            onChange={(e) => setDocName(e.target.value)} 
            placeholder="Doctor clinic or medical store name" 
            className="flex-1 w-full bg-slate-50/70 border border-slate-200 text-slate-800 text-sm font-semibold rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block px-3.5 py-2.5 outline-none transition-all placeholder:text-slate-400 placeholder:font-normal"
          />
          <button 
            onClick={addDoctor} 
            className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-bold shadow-md shadow-indigo-600/20 hover:bg-indigo-700 hover:shadow-indigo-600/40 active:scale-95 transition-all text-sm tracking-wide shrink-0"
          >
            ADD
          </button>
        </div>"""

if old_doc_section in text:
    text = text.replace(old_doc_section, new_doc_section)
    print("frequent clinic chips added to doctor section")

with open("dfy-frontend/src/App.jsx", "w", encoding="utf-8") as f:
    f.write(text)
