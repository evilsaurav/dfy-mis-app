import React from 'react';

export default function JourneyModal({
  show,
  onClose,
  journeySearchId,
  setJourneySearchId,
  journeyLoading,
  journeyError,
  journeyResult,
  handleFetchJourney,
  showToast
}) {
  React.useEffect(() => {
    if (!show) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-scale-up max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl p-2 bg-sky-50 rounded-2xl border border-sky-200">🔍</span>
            <div>
              <h3 className="text-lg font-black text-slate-800">Patient Journey Timeline</h3>
              <p className="text-xs text-slate-500 font-medium">Trace complete end-to-end clinical history of any patient ID</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center transition-all cursor-pointer"
          >
            &times;
          </button>
        </div>

        {/* Search Bar */}
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            handleFetchJourney();
          }} 
          className="flex gap-2"
        >
          <input 
            type="text" 
            required 
            value={journeySearchId} 
            onChange={(e) => setJourneySearchId(e.target.value.trim())} 
            placeholder="Enter 9-digit Nikshay ID (e.g. 102938475)..." 
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-sky-500" 
          />
          <button 
            type="submit" 
            disabled={journeyLoading || !journeySearchId} 
            className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
          >
            {journeyLoading ? 'Searching...' : 'Search'}
          </button>
        </form>

        {journeyError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold p-3 rounded-xl">
            ⚠️ {journeyError}
          </div>
        )}

        {/* Journey Timeline Content */}
        {journeyResult && (
          <div className="space-y-4">
            <div className="bg-sky-50/70 border border-sky-100 p-3 rounded-2xl">
              <div className="flex justify-between items-center">
                <div>
                  <span className="font-mono font-black text-sm text-sky-900">Patient #{journeyResult.patient_id}</span>
                  <p className="text-[11px] text-slate-500">
                    {journeyResult.metadata?.district} | Officer: {journeyResult.metadata?.primary_fo || 'Field Officer'}
                  </p>
                </div>
                <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${journeyResult.is_complete ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200'}`}>
                  {journeyResult.is_complete ? '✓ Treatment Completed' : '⚡ Active In Care'}
                </span>
              </div>

              {(journeyResult.metadata?.patient_name || journeyResult.metadata?.phone) && (
                <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-sky-200/50">
                  {journeyResult.metadata?.patient_name && (
                    <span className="text-xs font-black text-slate-800 flex items-center gap-1 bg-white/80 px-2.5 py-1 rounded-lg border border-sky-200/60">
                      <span>👤</span> {journeyResult.metadata.patient_name}
                    </span>
                  )}
                  {journeyResult.metadata?.phone && (
                    <div className="flex items-center gap-1.5">
                      <a 
                        href={`tel:${journeyResult.metadata.phone}`}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-2xs active:scale-95 transition-all cursor-pointer"
                      >
                        <span>📞 Call</span>
                        <span className="font-mono">{journeyResult.metadata.phone}</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          if (navigator.clipboard) {
                            navigator.clipboard.writeText(journeyResult.metadata.phone);
                            showToast("Phone number copied!", "info");
                          }
                        }}
                        className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer transition-colors"
                        title="Copy Phone"
                      >
                        📋
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="relative pl-6 border-l-2 border-indigo-200 space-y-4 my-2">
              {(journeyResult.journey || []).map((step, idx) => {
                const isVerified = step.category === 'nikshay_verified';
                const foNameRaw = step.fo_name || '';
                const foAttribution = (foNameRaw && !['Unknown', 'N/A', 'Official Record', 'null', 'undefined'].includes(foNameRaw.trim()))
                  ? foNameRaw.trim()
                  : 'Attributed Officer';
                const districtRaw = step.district || '';
                const districtDisplay = (districtRaw && !['Unknown', 'N/A', 'null', 'undefined'].includes(districtRaw.trim()))
                  ? districtRaw.trim()
                  : (journeyResult.metadata?.district || 'Official Record');

                return (
                  <div key={idx} className="relative">
                    {/* Step Dot */}
                    <span className={`absolute -left-[31px] top-1.5 w-6 h-6 rounded-full bg-white border-2 ${
                      isVerified ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-indigo-500 text-indigo-700'
                    } flex items-center justify-center text-xs shadow-sm`}>
                      {step.icon || '📌'}
                    </span>

                    <div className={`p-3.5 rounded-2xl border transition-all ${
                      isVerified
                        ? 'bg-emerald-50/70 border-emerald-200 shadow-2xs'
                        : 'bg-white border-slate-200 shadow-2xs hover:border-slate-300'
                    }`}>
                      {/* Milestone Icon, Action Title & Date Badge */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className={`text-xs font-black flex items-center gap-1.5 ${
                          isVerified ? 'text-emerald-950' : 'text-slate-800'
                        }`}>
                          <span className="text-sm">{step.icon || '📌'}</span>
                          <span>{step.action}</span>
                        </h4>
                        {step.date && (
                          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200/80 shadow-2xs">
                            📅 {step.date}
                          </span>
                        )}
                      </div>

                      {/* Operational Field Officer Attribution & District Pills */}
                      <div className="flex flex-wrap items-center gap-2 mt-2.5 pt-2 border-t border-slate-100">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg border shadow-2xs ${
                          isVerified 
                            ? 'bg-emerald-100/70 text-emerald-900 border-emerald-300/60' 
                            : 'bg-indigo-50 text-indigo-900 border-indigo-200/80'
                        }`}>
                          <span>👤 Field Officer:</span>
                          <span className="font-black">{foAttribution}</span>
                        </span>

                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs">
                          <span>📍</span>
                          <span>{districtDisplay}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {(journeyResult.journey || []).length === 0 && (
                <p className="text-xs text-slate-500 py-4 italic">No clinical milestones found for this patient ID yet.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
