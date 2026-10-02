import React from 'react';

export default function EditDayReportModal({
  editDayModal,
  setEditDayModal,
  handleExecuteEditDay,
  feedCategoriesConfig = []
}) {
  if (!editDayModal || !editDayModal.isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-3 sm:p-4 overflow-y-auto font-sans">
          <div className="bg-white rounded-3xl p-5 sm:p-7 w-full max-w-5xl shadow-2xl border border-slate-100 max-h-[92vh] flex flex-col animate-fade-in my-auto">
            {/* Header */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-lg font-black shrink-0">
                  ✏️
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
                    Edit Day Report
                  </h3>
                  <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                    {editDayModal.fo_name} &bull; {editDayModal.district} &bull; 📅 {editDayModal.date}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setEditDayModal(null)} 
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Context Callout */}
            <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3 mb-4 text-xs text-amber-900 flex items-start gap-2 shrink-0">
              <span className="text-sm shrink-0">⚠️</span>
              <div className="text-[11px] leading-relaxed">
                Yahan aap is din ke <strong>Travel KM</strong>, <strong>Visited Doctors/Stores</strong>, <strong>Remarks</strong>, aur sabhi <strong>19+ Categories ke Patient IDs</strong> ko edit/correct kar sakte hain. Submitting will update report, recalculate district rollups atomically, and log modifications in the 7-day audit trail.
              </div>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleExecuteEditDay} className="flex-1 overflow-y-auto pr-1 space-y-4 custom-scrollbar">
              {/* Row 1: KM, Visits, Remarks */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/70">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Morning KM
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editDayModal.morning_km}
                    onChange={(e) => {
                      const m = Math.max(0, parseInt(e.target.value) || 0);
                      setEditDayModal(prev => {
                        const e_val = prev.evening_km || 0;
                        const diff = e_val > m ? e_val - m : prev.travel_expenses;
                        return { ...prev, morning_km: m, travel_expenses: diff };
                      });
                    }}
                    className="w-full bg-white border border-slate-200 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Evening KM
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editDayModal.evening_km}
                    onChange={(e) => {
                      const ev = Math.max(0, parseInt(e.target.value) || 0);
                      setEditDayModal(prev => {
                        const m_val = prev.morning_km || 0;
                        const diff = ev > m_val ? ev - m_val : prev.travel_expenses;
                        return { ...prev, evening_km: ev, travel_expenses: diff };
                      });
                    }}
                    className="w-full bg-white border border-slate-200 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Total Travel (KM)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editDayModal.travel_expenses}
                    onChange={(e) => setEditDayModal(prev => ({ ...prev, travel_expenses: Math.max(0, parseInt(e.target.value) || 0) }))}
                    className="w-full bg-white border border-slate-200 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-indigo-700"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Remarks
                  </label>
                  <input
                    type="text"
                    value={editDayModal.remark}
                    onChange={(e) => setEditDayModal(prev => ({ ...prev, remark: e.target.value }))}
                    placeholder="e.g. Field visit completed"
                    className="w-full bg-white border border-slate-200 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="sm:col-span-2 lg:col-span-4">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Visited Doctors / Chemist Stores (Comma Separated)
                  </label>
                  <input
                    type="text"
                    value={editDayModal.visited_names}
                    onChange={(e) => setEditDayModal(prev => ({ ...prev, visited_names: e.target.value }))}
                    placeholder="e.g. Dr. A.K. Sharma, Sanjivani Medico, Life Care Pharmacy"
                    className="w-full bg-white border border-slate-200 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Row 2: Category ID Buckets Grid */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">
                    Patient IDs by Category (19 Categories)
                  </h4>
                  <span className="text-[10px] text-slate-400 font-bold">
                    One 9-digit patient ID per line or separated by commas
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {feedCategoriesConfig.map(cat => {
                    const rawVal = editDayModal.category_inputs[cat.key] || '';
                    const is8or9 = (cat.key === 'fdc_provided_ids' || cat.key === 'outcome_assigned_ids');
                    const parsedCount = rawVal
                      .split(/[\n,]+/)
                      .map(s => s.trim())
                      .filter(s => (is8or9 ? (s.length === 8 || s.length === 9) : s.length === 9) && /^\d+$/.test(s)).length;

                    return (
                      <div 
                        key={cat.key} 
                        className={`rounded-2xl border p-3 transition-all ${cat.isPrimary ? 'bg-indigo-50/30 border-indigo-200/70' : 'bg-white border-slate-200/80'}`}
                      >
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-[11px] font-black text-slate-700 flex items-center gap-1.5 truncate">
                            <span>{cat.icon}</span>
                            <span className="truncate">{cat.label}</span>
                          </span>
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${parsedCount > 0 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                            {parsedCount}
                          </span>
                        </div>
                        <textarea
                          rows={3}
                          value={rawVal}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditDayModal(prev => ({
                              ...prev,
                              category_inputs: {
                                ...prev.category_inputs,
                                [cat.key]: val
                              }
                            }));
                          }}
                          placeholder={is8or9 ? "Paste 8 or 9-digit IDs..." : "Paste 9-digit IDs..."}
                          className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 custom-scrollbar resize-none placeholder:text-slate-300"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {editDayModal.error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-bold p-3 rounded-2xl">
                  {editDayModal.error}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 sticky bottom-0 bg-white">
                <button
                  type="button"
                  onClick={() => setEditDayModal(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editDayModal.loading}
                  className="px-6 py-2.5 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {editDayModal.loading ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <>
                      <span>💾</span>
                      <span>Save Day Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
  );
}
