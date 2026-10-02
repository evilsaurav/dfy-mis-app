import React from 'react';

export default function RecentIdEditsModal({
  isOpen,
  onClose,
  recentIdEditsFilterAction,
  setRecentIdEditsFilterAction,
  recentIdEditsSearch,
  setRecentIdEditsSearch,
  recentIdEditsLoading,
  fetchRecentIdEdits,
  recentIdEdits = []
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-3 sm:p-4 overflow-y-auto font-sans">
      <div className="bg-white rounded-3xl p-5 sm:p-7 w-full max-w-5xl shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col animate-fade-in my-auto">
        {/* Header */}
        <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-lg font-black shrink-0">
              🕒
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
                7-Day Patient ID Modification Radar
                <span className="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">
                  Past 7 Days
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                Full audit history of all ID corrections, additions &amp; deletions
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 mb-3 shrink-0">
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl">
            {['All', 'delete', 'replace', 'add'].map(act => (
              <button
                key={act}
                type="button"
                onClick={() => setRecentIdEditsFilterAction(act)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  recentIdEditsFilterAction === act
                    ? 'bg-white text-slate-800 shadow-xs'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {act === 'All' ? 'All Logs' : act === 'delete' ? '🗑️ Deleted' : act === 'replace' ? '✏️ Replaced' : '➕ Added'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-1 sm:max-w-xs">
            <input
              type="text"
              value={recentIdEditsSearch}
              onChange={(e) => setRecentIdEditsSearch(e.target.value)}
              placeholder="Filter by ID, FO, or district..."
              className="w-full bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={fetchRecentIdEdits}
              disabled={recentIdEditsLoading}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-all shrink-0 cursor-pointer disabled:opacity-50"
              title="Refresh Logs"
            >
              <span className={recentIdEditsLoading ? "animate-spin inline-block" : ""}>🔄</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto custom-scrollbar border border-slate-100 rounded-2xl">
          {recentIdEditsLoading ? (
            <div className="p-12 text-center text-slate-400 font-bold text-xs flex items-center justify-center gap-2">
              <span className="animate-spin text-lg">⏳</span> Loading recent modification logs...
            </div>
          ) : (() => {
            const filtered = recentIdEdits.filter(item => {
              const matchAct = recentIdEditsFilterAction === 'All' || item.action === recentIdEditsFilterAction;
              if (!matchAct) return false;
              if (!recentIdEditsSearch.trim()) return true;
              const q = recentIdEditsSearch.trim().toLowerCase();
              return (
                (item.fo_name || '').toLowerCase().includes(q) ||
                (item.district || '').toLowerCase().includes(q) ||
                (item.old_id || '').includes(q) ||
                (item.new_id || '').includes(q) ||
                (item.category || '').toLowerCase().includes(q) ||
                (item.date || '').includes(q)
              );
            });

            if (filtered.length === 0) {
              return (
                <div className="p-12 text-center text-slate-400 font-bold text-xs">
                  No ID modifications found in the past 7 days matching this filter.
                </div>
              );
            }

            return (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-400 uppercase text-[10px] tracking-wider font-black sticky top-0">
                    <th className="p-3">Time (IST)</th>
                    <th className="p-3">Officer &amp; District</th>
                    <th className="p-3">Report Date</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">ID Detail</th>
                    <th className="p-3">Modified By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {filtered.map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3 whitespace-nowrap font-mono text-[11px] text-slate-500">
                        {item.timestamp}
                      </td>
                      <td className="p-3">
                        <span className="font-bold text-slate-800 block">{item.fo_name}</span>
                        <span className="text-[10px] text-slate-400 uppercase">{item.district}</span>
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-700">
                        {item.date}
                      </td>
                      <td className="p-3">
                        <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                          {(item.category || '').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                          item.action === 'delete'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : item.action === 'replace'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          {item.action === 'delete' ? '🗑️ Deleted' : item.action === 'replace' ? '✏️ Replaced' : '➕ Added'}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {item.action === 'replace' ? (
                          <div className="flex items-center gap-1.5">
                            <span className="line-through text-red-500">{item.old_id}</span>
                            <span>➔</span>
                            <span className="font-black text-emerald-700">{item.new_id}</span>
                          </div>
                        ) : item.action === 'delete' ? (
                          <span className="line-through text-red-600 font-bold">{item.old_id}</span>
                        ) : (
                          <span className="text-emerald-700 font-black">+{item.new_id}</span>
                        )}
                      </td>
                      <td className="p-3 text-[11px] text-slate-500">
                        {item.edited_by || 'Admin'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
