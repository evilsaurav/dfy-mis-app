with open("src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

# 1. Update IdBucket to support multi-ID paste and clean UI
old_idbucket = """const IdBucket = ({ title, ids, onAdd, onRemove, showToast }) => {
  const [currentId, setCurrentId] = useState("");
  const safeIds = Array.isArray(ids) ? ids : [];

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
        <span className="bg-indigo-50 text-indigo-600 px-2.5 py-0.5 rounded-full text-[10px] ml-1 font-bold">{safeIds.length}</span>
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
      {safeIds.length > 0 && (
        <ul className="mt-4 space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
          {safeIds.map((id, index) => (
            <li key={index} className="flex justify-between items-center bg-white border border-slate-100 px-3 py-2 rounded-lg shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]">
              <span className="font-mono font-bold text-slate-600 tracking-widest text-sm">{id}</span>
              <button onClick={() => onRemove(index)} className="text-red-400 hover:text-white hover:bg-red-500 bg-red-50 h-7 w-7 rounded-full flex items-center justify-center font-bold transition-all shadow-sm">&times;</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};"""

new_idbucket = """const IdBucket = ({ title, ids, onAdd, onAddMultiple, onRemove, showToast }) => {
  const [currentId, setCurrentId] = useState("");
  const safeIds = Array.isArray(ids) ? ids : [];

  const handleAdd = () => {
    const raw = currentId.trim();
    if (!raw) return;

    // Check if user pasted multiple IDs (separated by comma, space, newline)
    const matches = raw.match(/\\b\\d{9}\\b/g);
    if (matches && matches.length > 1) {
      if (onAddMultiple) {
        onAddMultiple(matches);
        setCurrentId("");
        return;
      }
    }

    if (raw.length === 9 && !isNaN(raw)) {
      onAdd(raw);
      setCurrentId("");
    } else {
      showToast("ID exactly 9 digit ki honi chahiye bhai!", "error");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5 shadow-sm hover:border-slate-200 transition-colors group">
      <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-3 flex items-center justify-between group-hover:text-indigo-600 transition-colors">
        <span>{title}</span>
        <span className="bg-indigo-50 text-indigo-600 px-2.5 py-0.5 rounded-full text-[10px] ml-1 font-bold">{safeIds.length}</span>
      </label>
      <div className="flex gap-2">
        <input 
          type="text"
          inputMode="numeric"
          value={currentId}
          onChange={(e) => setCurrentId(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter or paste 9-digit ID"
          className="flex-1 w-full bg-slate-50/70 border border-slate-200 text-slate-800 text-sm font-semibold rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block px-3.5 py-2.5 outline-none transition-all placeholder:text-slate-400 placeholder:font-normal"
        />
        <button 
          onClick={handleAdd} 
          className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-bold shadow-md shadow-indigo-600/20 hover:bg-indigo-700 hover:shadow-indigo-600/40 active:scale-95 transition-all text-sm tracking-wide shrink-0"
        >
          ADD
        </button>
      </div>
      {safeIds.length > 0 && (
        <ul className="mt-4 space-y-2 max-h-44 overflow-y-auto pr-1 custom-scrollbar">
          {safeIds.map((id, index) => (
            <li key={index} className="flex justify-between items-center bg-slate-50/80 border border-slate-100 px-3.5 py-2 rounded-xl shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] hover:bg-indigo-50/40 transition-colors">
              <span className="font-mono font-bold text-slate-700 tracking-wider text-sm">{id}</span>
              <button 
                onClick={() => onRemove(index)} 
                className="text-red-400 hover:text-white hover:bg-red-500 bg-red-50 h-7 w-7 rounded-full flex items-center justify-center font-bold transition-all shadow-sm"
                title="Remove"
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};"""

if old_idbucket in text:
    text = text.replace(old_idbucket, new_idbucket)
    print("IdBucket updated")
else:
    print("old_idbucket not found")

# 2. Update addId to have duplicate detection and addMultipleIds
old_add_id = """  const addId = (field, id) => {
    if(!formData[field].includes(id)){
      setFormData({ ...formData, [field]: [...formData[field], id] });
    }
  };"""

new_add_id = """  const addId = (field, id) => {
    const current = formData[field] || [];
    if (current.includes(id)) {
      showToast(`ID ${id} pehle se added hai!`, "error");
      return;
    }
    setFormData(prev => ({ ...prev, [field]: [...(prev[field] || []), id] }));
  };

  const addMultipleIds = (field, newIds) => {
    setFormData(prev => {
      const current = prev[field] || [];
      const uniqueNew = newIds.filter(id => !current.includes(id));
      const duplicatesCount = newIds.length - uniqueNew.length;
      if (duplicatesCount > 0) {
        showToast(`${uniqueNew.length} IDs add hui (${duplicatesCount} duplicates ignore ki gayi)`, 'success');
      } else {
        showToast(`${uniqueNew.length} IDs add hui!`, 'success');
      }
      return {
        ...prev,
        [field]: [...current, ...uniqueNew]
      };
    });
  };"""

if old_add_id in text:
    text = text.replace(old_add_id, new_add_id)
    print("addId updated with duplicate detection and addMultipleIds")
else:
    print("old_add_id not found")

# 3. Update Accordion groups mapping to pass onAddMultiple
for i in range(1, 6):
    old_map = f'onAdd={{(id) => addId(cat.key, id)}}'
    new_map = f'onAdd={{(id) => addId(cat.key, id)}} onAddMultiple={{(ids) => addMultipleIds(cat.key, ids)}}'
    text = text.replace(old_map, new_map)

# 4. Auto-save draft in localStorage while logged in
auto_save_code = """
  // Auto-save draft whenever form data changes while logged in
  useEffect(() => {
    if (isLoggedIn && formData.fo_name && formData.working_place) {
      try {
        const draftKey = `dfy_draft_${formData.working_place}_${formData.fo_name}`;
        localStorage.setItem(draftKey, JSON.stringify(formData));
      } catch (e) {}
    }
  }, [formData, isLoggedIn]);
"""

if "const draftKey = `dfy_draft_" not in text:
    marker = "  const showToast = (message, type = 'success') => setToast({ message, type });"
    if marker in text:
        text = text.replace(marker, marker + "\n" + auto_save_code)
        print("auto_save_code added")

# 5. Clear draft on submit
submit_success_marker = 'showToast("? Final Report Submitted Successfully!", "success");'
if submit_success_marker in text:
    text = text.replace(
        submit_success_marker,
        'try { localStorage.removeItem(`dfy_draft_${formData.working_place}_${formData.fo_name}`); } catch (e) {}\n        ' + submit_success_marker
    )
    print("clear draft on submit added")

with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.write(text)

