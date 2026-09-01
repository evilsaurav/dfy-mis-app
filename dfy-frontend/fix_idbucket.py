with open("src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

old_idbucket = """const IdBucket = ({ title, ids = [], onAdd, onRemove, showToast }) => {
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
    <div className="p-4 sm:p-5 border-b border-slate-100 last:border-0 bg-white">
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-[11px] sm:text-xs font-black text-slate-800 uppercase tracking-wider">{title}</h4>
        <span className="bg-indigo-50 text-indigo-600 px-2.5 py-0.5 rounded-full text-[10px] ml-1 font-bold">{ids.length}</span>
      </div>
      
      <div className="flex gap-2 mb-3">
        <input 
          type="text" 
          value={currentId} 
          onChange={(e) => setCurrentId(e.target.value)} 
          placeholder="Enter 9-digit ID" 
          maxLength="9" 
          className="flex-1 bg-slate-50 border border-slate-200 text-slate-800 text-sm font-semibold rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400 placeholder:font-normal"
        />
        <button 
          onClick={handleAdd} 
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 rounded-lg font-bold text-sm transition-all shadow-sm flex items-center gap-1 active:scale-95"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          <span className="hidden sm:inline">Add</span>
        </button>
      </div>

      {ids.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {ids.map((id, index) => (
            <div key={index} className="bg-slate-50 border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 group hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors">
              {id}
              <button 
                onClick={() => onRemove(index)} 
                className="text-slate-400 hover:text-red-500 transition-colors p-0.5 rounded-md hover:bg-red-50 focus:outline-none"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};"""

new_idbucket = """const IdBucket = ({ title, ids, onAdd, onRemove, showToast }) => {
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
    <div className="p-4 sm:p-5 border-b border-slate-100 last:border-0 bg-white">
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-[11px] sm:text-xs font-black text-slate-800 uppercase tracking-wider">{title}</h4>
        <span className="bg-indigo-50 text-indigo-600 px-2.5 py-0.5 rounded-full text-[10px] ml-1 font-bold">{safeIds.length}</span>
      </div>
      
      <div className="flex gap-2 mb-3">
        <input 
          type="text" 
          value={currentId} 
          onChange={(e) => setCurrentId(e.target.value)} 
          placeholder="Enter 9-digit ID" 
          maxLength="9" 
          className="flex-1 bg-slate-50 border border-slate-200 text-slate-800 text-sm font-semibold rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400 placeholder:font-normal"
        />
        <button 
          onClick={handleAdd} 
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 rounded-lg font-bold text-sm transition-all shadow-sm flex items-center gap-1 active:scale-95"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          <span className="hidden sm:inline">Add</span>
        </button>
      </div>

      {safeIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {safeIds.map((id, index) => (
            <div key={index} className="bg-slate-50 border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 group hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors">
              {id}
              <button 
                onClick={() => onRemove(index)} 
                className="text-slate-400 hover:text-red-500 transition-colors p-0.5 rounded-md hover:bg-red-50 focus:outline-none"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};"""

if old_idbucket in text:
    text = text.replace(old_idbucket, new_idbucket)
else:
    print("FAILED TO FIND OLD IDBUCKET")

with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.write(text)

