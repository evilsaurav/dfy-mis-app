import React from 'react';

export default function NotifTrayModal({
  show,
  onClose,
  month,
  setAppGuideActiveTopic,
  setShowAppGuideModal,
  notifTrayCopiedNotice,
  notifTrayData,
  notifTrayDistricts = [],
  availableKpiDistricts = [],
  copyToClipboardWithFallback,
  build24ColTsv,
  handleClearNotifDistricts,
  handleSelectAllNotifDistricts,
  handleToggleNotifDistrict,
  notifTraySearch,
  setNotifTraySearch
}) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-5xl w-full p-6 shadow-2xl space-y-5 animate-scale-up max-h-[92vh] overflow-y-auto">
        
        {/* Modal Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl p-2.5 bg-amber-50 rounded-2xl border border-amber-200 text-amber-600">📋</span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-800">Daily Notification Verification Tray</h3>
                <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Rapid Nikshay Tool
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Daily reported TB notifications for <strong className="text-slate-700 font-mono">{month}</strong> • Reverse chronological rolling order (newest on top)
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => {
                if (setAppGuideActiveTopic) setAppGuideActiveTopic('notif_tray');
                if (setShowAppGuideModal) setShowAppGuideModal(true);
              }}
              className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Open Step-by-Step SOP Guide for Nikshay Verification & 24-Col Excel"
            >
              <span>📖</span>
              <span>Verification SOP</span>
            </button>
            <button 
              onClick={onClose} 
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center transition-all cursor-pointer"
              title="Close Tray"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Transient Success Feedback Banner */}
        {notifTrayCopiedNotice && (
          <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold p-3 rounded-2xl flex items-center gap-2 animate-bounce">
            <span className="text-base">✓</span>
            <span>{notifTrayCopiedNotice}</span>
          </div>
        )}

        {/* Quick KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-3.5">
            <div className="text-[10px] font-black uppercase tracking-wider text-amber-700">Total in Tray</div>
            <div className="text-xl font-black text-amber-900 mt-0.5 font-mono">{notifTrayData?.allIds?.length || 0}</div>
            <div className="text-[10px] text-amber-700/80 font-medium mt-0.5">
              Unique Patient IDs ({notifTrayData?.allItems?.length || 0} entries)
            </div>
          </div>

          <div className="bg-emerald-50/80 border border-emerald-200/90 rounded-2xl p-3.5">
            <div className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Latest Reported Day</div>
            <div className="text-xl font-black text-emerald-900 mt-0.5 font-mono">
              {notifTrayData?.latestDateFormatted || 'No records'}
            </div>
            <div className="text-[10px] text-emerald-700/80 font-medium mt-0.5">
              {notifTrayData?.lastDayIds?.length || 0} ID(s) on latest date
            </div>
          </div>

          <div className="bg-sky-50/80 border border-sky-200/90 rounded-2xl p-3.5">
            <div className="text-[10px] font-black uppercase tracking-wider text-sky-700">Active Field Officers</div>
            <div className="text-xl font-black text-sky-900 mt-0.5 font-mono">{notifTrayData?.uniqueFOCount || 0}</div>
            <div className="text-[10px] text-sky-700/80 font-medium mt-0.5">Reporting notifications</div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-600">Selected District(s)</div>
            <div className="text-xl font-black text-slate-800 mt-0.5 truncate" title={notifTrayDistricts.length === 0 || notifTrayDistricts.includes('All') ? 'All Districts' : notifTrayDistricts.join(', ')}>
              {notifTrayDistricts.length === 0 || notifTrayDistricts.includes('All') 
                ? 'All Districts' 
                : notifTrayDistricts.length === 1 
                  ? notifTrayDistricts[0] 
                  : `${notifTrayDistricts.length} Districts`}
            </div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5">
              Filter scope active
            </div>
          </div>
        </div>

        {/* 4 Instant 1-Click Copy Action Buttons */}
        <div className="space-y-2">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <span>⚡</span>
            <span>Instant 1-Click Clipboard Actions (No Download Waiting):</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {/* Action 1: Copy Last Day IDs 1-per-line */}
            <button
              type="button"
              onClick={() => {
                if (!notifTrayData?.lastDayIds?.length) {
                  alert('No IDs found on latest day to copy.');
                  return;
                }
                copyToClipboardWithFallback(
                  notifTrayData.lastDayIds.join('\n'),
                  `Copied ${notifTrayData.lastDayIds.length} Last Day ID(s) (1-per-line) to clipboard!`
                );
              }}
              disabled={!notifTrayData?.lastDayIds?.length}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white p-3 rounded-2xl shadow-xs transition-all active:scale-98 text-left cursor-pointer flex flex-col justify-between space-y-1.5 group disabled:opacity-50"
              title="Copy latest day's IDs separated by newlines for Nikshay search bar or single Excel column"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold flex items-center gap-1.5">
                  <span>📋</span>
                  <span>Copy Last Day IDs</span>
                </span>
                <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold">
                  {notifTrayData?.lastDayIds?.length || 0} IDs
                </span>
              </div>
              <p className="text-[10px] text-emerald-100 font-medium">
                1-per-line (`\n`) • Single Excel column ya Nikshay Portal search bar ke liye
              </p>
            </button>

            {/* Action 2: Copy Last Day 24-Cols Excel Table */}
            <button
              type="button"
              onClick={() => {
                if (!notifTrayData?.lastDayItems?.length) {
                  alert('No records found on latest day to copy.');
                  return;
                }
                const tsv = build24ColTsv(notifTrayData.lastDayItems);
                copyToClipboardWithFallback(
                  tsv,
                  `Copied ${notifTrayData.lastDayItems.length} Last Day row(s) in 24-Column Excel format!`
                );
              }}
              disabled={!notifTrayData?.lastDayItems?.length}
              className="bg-gradient-to-r from-teal-600 to-cyan-700 hover:from-teal-700 hover:to-cyan-800 text-white p-3 rounded-2xl shadow-xs transition-all active:scale-98 text-left cursor-pointer flex flex-col justify-between space-y-1.5 group disabled:opacity-50"
              title="Copy latest day's rows in standard 24-column TSV format. Paste directly in Excel with Ctrl+V"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold flex items-center gap-1.5">
                  <span>📑</span>
                  <span>Copy Last Day Table</span>
                </span>
                <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold">
                  24 Columns
                </span>
              </div>
              <p className="text-[10px] text-teal-100 font-medium">
                Full 24-Cols Excel Format • Direct cell-by-cell `Ctrl + V` paste
              </p>
            </button>

            {/* Action 3: Copy All Month IDs 1-per-line */}
            <button
              type="button"
              onClick={() => {
                if (!notifTrayData?.allIds?.length) {
                  alert('No IDs in tray to copy.');
                  return;
                }
                copyToClipboardWithFallback(
                  notifTrayData.allIds.join('\n'),
                  `Copied ${notifTrayData.allIds.length} Month ID(s) (1-per-line) to clipboard!`
                );
              }}
              disabled={!notifTrayData?.allIds?.length}
              className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white p-3 rounded-2xl shadow-xs transition-all active:scale-98 text-left cursor-pointer flex flex-col justify-between space-y-1.5 group disabled:opacity-50"
              title="Copy all unique IDs in the filtered tray separated by newlines"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold flex items-center gap-1.5">
                  <span>📋</span>
                  <span>Copy All Month IDs</span>
                </span>
                <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold">
                  {notifTrayData?.allIds?.length || 0} IDs
                </span>
              </div>
              <p className="text-[10px] text-amber-100 font-medium">
                1-per-line (`\n`) • Mahine ke sabhi unique notification IDs
              </p>
            </button>

            {/* Action 4: Copy All Month 24-Cols Excel Table */}
            <button
              type="button"
              onClick={() => {
                if (!notifTrayData?.allItems?.length) {
                  alert('No records in tray to copy.');
                  return;
                }
                const tsv = build24ColTsv(notifTrayData.allItems);
                copyToClipboardWithFallback(
                  tsv,
                  `Copied ${notifTrayData.allItems.length} Month row(s) in 24-Column Excel format!`
                );
              }}
              disabled={!notifTrayData?.allItems?.length}
              className="bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 text-white p-3 rounded-2xl shadow-xs transition-all active:scale-98 text-left cursor-pointer flex flex-col justify-between space-y-1.5 group disabled:opacity-50"
              title="Copy all rows in the filtered tray in 24-column TSV format for Excel"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold flex items-center gap-1.5">
                  <span>📑</span>
                  <span>Copy All Month Table</span>
                </span>
                <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold">
                  {notifTrayData?.allItems?.length || 0} Rows
                </span>
              </div>
              <p className="text-[10px] text-slate-200 font-medium">
                Complete Monthly Master Table • All 24 columns formatted for Excel
              </p>
            </button>
          </div>
        </div>

        {/* Multi-District Selection Deck for Notification Tray */}
        <div className="bg-slate-50 border border-slate-200/80 p-3.5 sm:p-4 rounded-2xl space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-800">
                🎯 Filter by District(s)
              </span>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                notifTrayDistricts.length > 0 && !notifTrayDistricts.includes('All') 
                  ? 'bg-amber-600 text-white' 
                  : 'bg-slate-200 text-slate-700'
              }`}>
                {notifTrayDistricts.length === 0 || notifTrayDistricts.includes('All')
                  ? 'All Districts'
                  : `${notifTrayDistricts.length} of ${availableKpiDistricts.length} Selected`}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleClearNotifDistricts}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-colors cursor-pointer ${
                  notifTrayDistricts.length === 0 || notifTrayDistricts.includes('All')
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                }`}
              >
                All Districts
              </button>
              <button
                type="button"
                onClick={handleSelectAllNotifDistricts}
                className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-amber-100 hover:bg-amber-200 text-amber-900 transition-colors cursor-pointer"
              >
                Select All
              </button>
              {notifTrayDistricts.length > 0 && !notifTrayDistricts.includes('All') && (
                <button
                  type="button"
                  onClick={handleClearNotifDistricts}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-rose-100 hover:bg-rose-200 text-rose-800 transition-colors cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* District Chips */}
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto custom-scrollbar p-0.5">
            {availableKpiDistricts.map(dist => {
              const isSelected = notifTrayDistricts.includes(dist);
              return (
                <button
                  key={dist}
                  type="button"
                  onClick={() => handleToggleNotifDistrict(dist)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1 border active:scale-95 cursor-pointer ${
                    isSelected
                      ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-600 shadow-xs'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs'
                  }`}
                >
                  <span>{isSelected ? '✓' : '+'}</span>
                  <span>{dist}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Live Search Bar */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 p-2.5 rounded-2xl">
          <span className="text-slate-400 text-xs ml-1">🔍</span>
          <input
            type="text"
            value={notifTraySearch}
            onChange={(e) => setNotifTraySearch(e.target.value)}
            placeholder="Search by Episode ID or Officer Name in selected districts..."
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500"
          />
          {notifTraySearch && (
            <button
              type="button"
              onClick={() => setNotifTraySearch('')}
              className="text-xs text-slate-400 hover:text-slate-600 px-2 font-bold cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {/* Live Data Preview Table */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
          <div className="bg-slate-100/90 px-4 py-2 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-600">
            <span>Notification Records Preview ({(notifTrayData?.allItems || []).filter(i => {
              if (!notifTraySearch.trim()) return true;
              const q = notifTraySearch.trim().toLowerCase();
              return i.id.toLowerCase().includes(q) || i.fo_name.toLowerCase().includes(q);
            }).length} shown)</span>
            <span className="text-[10px] text-slate-400 font-normal">Sorted Newest Date &rarr; Oldest Date</span>
          </div>
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 sticky top-0 z-10 text-[11px]">
                <tr>
                  <th className="p-2.5 w-12 text-center">#</th>
                  <th className="p-2.5">Date (DD-MM-YYYY)</th>
                  <th className="p-2.5">Field Officer</th>
                  <th className="p-2.5">District</th>
                  <th className="p-2.5">Episode ID</th>
                  <th className="p-2.5">Audit Recency</th>
                  <th className="p-2.5 text-right">Quick Copy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(notifTrayData?.allItems || [])
                  .filter(item => {
                    if (!notifTraySearch.trim()) return true;
                    const q = notifTraySearch.trim().toLowerCase();
                    return item.id.toLowerCase().includes(q) || item.fo_name.toLowerCase().includes(q);
                  })
                  .slice(0, 300)
                  .map((item, idx) => (
                    <tr key={`${item.id}-${idx}`} className="hover:bg-amber-50/40 transition-colors">
                      <td className="p-2.5 text-center font-mono text-slate-400">{idx + 1}</td>
                      <td className="p-2.5 font-mono font-bold text-slate-700">{item.date_formatted}</td>
                      <td className="p-2.5 font-medium text-slate-800">{item.fo_name}</td>
                      <td className="p-2.5 text-slate-600">{item.district}</td>
                      <td className="p-2.5 font-mono font-black text-amber-700">#{item.id}</td>
                      <td className="p-2.5">
                        {item.days_elapsed === 0 ? (
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                            Today (Sync Pending)
                          </span>
                        ) : item.days_elapsed <= 3 ? (
                          <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200">
                            {item.days_elapsed}d ago (&le;72h Grace)
                          </span>
                        ) : (
                          <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-200">
                            {item.days_elapsed}d ago (&gt;72h Check)
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => copyToClipboardWithFallback(item.id, `Copied ID #${item.id}!`)}
                          className="text-[10px] font-bold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-1 rounded-lg transition-all cursor-pointer"
                          title="Copy this single ID"
                        >
                          Copy ID
                        </button>
                      </td>
                    </tr>
                  ))}

                {(!notifTrayData?.allItems || notifTrayData.allItems.length === 0) && (
                  <tr>
                    <td colSpan="7" className="p-8 text-center text-slate-400 italic">
                      No notification IDs reported for {notifTrayDistricts.length === 0 || notifTrayDistricts.includes('All') ? 'selected month' : notifTrayDistricts.join(', ')}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom Footer with SOP Note */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
          <span>
            💡 <strong>Reminder:</strong> Nikshay portal par ID na milne par pehle 72-hour grace lag check karein.
          </span>
          <button
            type="button"
            onClick={() => {
              if (setAppGuideActiveTopic) setAppGuideActiveTopic('notif_tray');
              if (setShowAppGuideModal) setShowAppGuideModal(true);
            }}
            className="text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
          >
            Read 24-Column Excel &amp; Verification Manual &rarr;
          </button>
        </div>

      </div>
    </div>
  );
}
