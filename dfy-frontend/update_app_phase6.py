with open("src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

# 1. Update MyProfileDashboard to include 30-Day Activity Calendar
old_profile_view = """      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 px-2">Work Breakdown</h3>
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

new_profile_view = """      {/* 30-Day Activity Calendar */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 mb-6">
        <div className="flex items-center justify-between mb-4 px-1">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
            Monthly Activity Calendar
          </h3>
          <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> 2 Done</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400"></span> 1 Done</span>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center">
          {['M','T','W','T','F','S','S'].map((d, i) => (
            <span key={i} className="text-[10px] font-black text-slate-400 py-1">{d}</span>
          ))}
          {Array.from({ length: 31 }, (_, i) => {
            const dayNum = i + 1;
            const dateKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            const dayData = stats.daily_history && stats.daily_history[dateKey];
            const count = dayData ? dayData.count : 0;
            const isToday = new Date().getDate() === dayNum;

            let bgColor = "bg-slate-50 text-slate-400 border-slate-100";
            if (count >= 2) {
              bgColor = "bg-emerald-500 text-white font-black shadow-sm shadow-emerald-500/30 border-emerald-600";
            } else if (count === 1) {
              bgColor = "bg-amber-400 text-white font-black shadow-sm shadow-amber-400/30 border-amber-500";
            }

            return (
              <div 
                key={dayNum} 
                className={`h-9 rounded-xl flex flex-col items-center justify-center text-xs font-bold border transition-all ${bgColor} ${isToday ? 'ring-2 ring-indigo-500 ring-offset-1' : ''}`}
                title={dayData && dayData.submitted ? `${dateKey}: ${count} report(s), ${dayData.total_ids} IDs` : `${dateKey}: No report`}
              >
                <span>{dayNum}</span>
              </div>
            );
          })}
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

if old_profile_view in text:
    text = text.replace(old_profile_view, new_profile_view)
    print("MyProfileDashboard calendar added")
else:
    print("old_profile_view not found")

# 2. Update IdBucket label to show green checkmark when 9 digits entered
old_bucket_label = """      <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-3 flex items-center justify-between group-hover:text-indigo-600 transition-colors">
        <span>{title}</span>
        <span className="bg-indigo-50 text-indigo-600 px-2.5 py-0.5 rounded-full text-[10px] ml-1 font-bold">{safeIds.length}</span>
      </label>"""

new_bucket_label = """      <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-3 flex items-center justify-between group-hover:text-indigo-600 transition-colors">
        <span className="flex items-center gap-1.5">
          {title}
          {currentId.length === 9 && !isNaN(currentId) && (
            <span className="text-emerald-500 text-[10px] font-bold">? Ready</span>
          )}
        </span>
        <span className="bg-indigo-50 text-indigo-600 px-2.5 py-0.5 rounded-full text-[10px] ml-1 font-bold">{safeIds.length}</span>
      </label>"""

if old_bucket_label in text:
    text = text.replace(old_bucket_label, new_bucket_label)
    print("IdBucket 9-digit ready indicator added")
else:
    print("old_bucket_label not found")

# 3. Update addId to have TPT check
old_add_id_body = """  const addId = (field, id) => {
    const current = formData[field] || [];
    if (current.includes(id)) {
      showToast(`ID ${id} pehle se added hai!`, "error");
      return;
    }
    setFormData(prev => ({ ...prev, [field]: [...(prev[field] || []), id] }));
  };"""

new_add_id_body = """  const addId = (field, id) => {
    const current = formData[field] || [];
    if (current.includes(id)) {
      showToast(`ID ${id} pehle se added hai!`, "error");
      return;
    }
    if (field === 'tpt_treatment_start_ids') {
      const presumptive = formData.tpt_presumptive_ids || [];
      if (!presumptive.includes(id)) {
        showToast("Tip: Patient ko TPT Presumptive bucket me bhi record karein.", "success");
      }
    }
    setFormData(prev => ({ ...prev, [field]: [...(prev[field] || []), id] }));
  };"""

if old_add_id_body in text:
    text = text.replace(old_add_id_body, new_add_id_body)
    print("addId updated with TPT tip")
else:
    print("old_add_id_body not found")

# 4. Update addDoctor to prevent duplicates
old_add_doc = """  const addDoctor = () => {
    if(docName) {
      setFormData({ ...formData, visited_names: [...formData.visited_names, docName] });
      setDocName("");
    }
  };"""

new_add_doc = """  const addDoctor = () => {
    const trimmed = docName.trim();
    if(trimmed) {
      if (formData.visited_names.includes(trimmed)) {
        showToast(`${trimmed} pehle se added hai!`, "error");
        return;
      }
      setFormData({ ...formData, visited_names: [...formData.visited_names, trimmed] });
      setDocName("");
    }
  };"""

if old_add_doc in text:
    text = text.replace(old_add_doc, new_add_doc)
    print("addDoctor deduplication added")
else:
    print("old_add_doc not found")

with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.write(text)

