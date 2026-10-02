import React from 'react';

export default function AdminFeedModal({
  show,
  onClose,
  currentUser,
  feedError,
  setFeedError,
  feedSuccess,
  setFeedSuccess,
  feedDistrict,
  setFeedDistrict,
  feedFoName,
  setFeedFoName,
  feedDate,
  setFeedDate,
  availableDistrictsForFeed = [],
  availableFosForFeed = [],
  feedShowAllCategories,
  setFeedShowAllCategories,
  feedCategoriesConfig = [],
  feedCategoryInputs = {},
  setFeedCategoryInputs,
  feedRemarks,
  setFeedRemarks,
  feedLoading,
  handleAdminFeedSubmit
}) {
  if (!show) return null;

  const handleClose = () => {
    onClose();
    if (setFeedError) setFeedError('');
    if (setFeedSuccess) setFeedSuccess('');
  };

  return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-3 sm:p-4 overflow-y-auto font-sans">
          <div className="bg-white rounded-3xl p-5 sm:p-7 w-full max-w-5xl shadow-2xl border border-slate-100 max-h-[92vh] flex flex-col animate-fade-in my-auto">
            {/* Header */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-lg font-black shrink-0">
                  📝
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
                    Feed Field Officer Data
                  </h3>
                  <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                    {currentUser?.role === 'SUPER_ADMIN' ? 'Super Admin Portal' : `Sub-Admin Portal (${(currentUser?.allowed_districts || []).join(', ')})`}
                  </p>
                </div>
              </div>
              <button 
                onClick={handleClose} 
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Context Callout */}
            <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-3 mb-4 text-xs text-indigo-900 flex items-start gap-2 shrink-0">
              <span className="text-sm shrink-0">💡</span>
              <div className="text-[11px] leading-relaxed">
                Feed or backfill patient IDs for any Field Officer on <strong>any date</strong>. If a report already exists for that date, newly fed IDs will be safely merged. All targets, KPIs, and monthly metrics recalculate automatically.
              </div>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleAdminFeedSubmit} className="flex-1 overflow-y-auto pr-1 space-y-4 custom-scrollbar">
              {/* Row 1: District, FO, Date */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* District Dropdown */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    District <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={feedDistrict}
                    onChange={(e) => {
                      setFeedDistrict(e.target.value);
                      setFeedFoName('');
                    }}
                    className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  >
                    <option value="">-- Select District --</option>
                    {availableDistrictsForFeed.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                {/* Field Officer Dropdown / Input */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Field Officer <span className="text-red-500">*</span>
                  </label>
                  {availableFosForFeed.length > 0 ? (
                    <select
                      value={feedFoName}
                      onChange={(e) => setFeedFoName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                    >
                      <option value="">-- Select Officer --</option>
                      {availableFosForFeed.map(fo => (
                        <option key={fo} value={fo}>{fo}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={feedFoName}
                      onChange={(e) => setFeedFoName(e.target.value)}
                      placeholder="e.g. Rajesh Kumar"
                      className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                  )}
                </div>

                {/* Reporting Date */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Date of Reporting <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={feedDate}
                    onChange={(e) => setFeedDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                    required
                  />
                </div>
              </div>

              {/* All-In-One Indicator Category Input Section */}
              <div className="space-y-4 pt-1">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                      <span>📋</span> Patient Indicator IDs (Multi-Category Concurrent Input)
                    </label>
                    <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                      Paste or type 9-digit Patient IDs directly into any category. You can fill multiple categories at once before saving.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFeedShowAllCategories(prev => !prev)}
                    className="text-[11px] font-black text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl transition-all cursor-pointer shrink-0"
                  >
                    {feedShowAllCategories ? '− Show Primary Indicators (8)' : '+ Show All Indicators (20)'}
                  </button>
                </div>

                {/* Concurrent Category Input Grid (Responsive 3-Column Smooth Flow) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(feedShowAllCategories ? feedCategoriesConfig : feedCategoriesConfig.filter(c => c.isPrimary)).map(cat => {
                    const currentVal = feedCategoryInputs[cat.key] || '';
                    const is8or9 = (cat.key === 'fdc_provided_ids' || cat.key === 'outcome_assigned_ids');
                    const tokenRegex = is8or9 ? /^\d{8,9}$/ : /^\d{9}$/;
                    const tokens = currentVal.split(/[\s,;\n\r\t]+/).map(t => t.trim()).filter(Boolean);
                    const validTokens = Array.from(new Set(tokens.filter(t => tokenRegex.test(t))));
                    const invalidTokens = tokens.filter(t => !tokenRegex.test(t));

                    return (
                      <div 
                        key={cat.key} 
                        className={`p-3 rounded-2xl border transition-all ${
                          validTokens.length > 0 
                            ? 'bg-emerald-50/40 border-emerald-200' 
                            : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {/* Header for Category */}
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                            <span>{cat.icon}</span>
                            <span>{cat.label}</span>
                          </span>
                          <div className="flex items-center gap-1">
                            {validTokens.length > 0 && (
                              <span className="text-[10px] font-black bg-emerald-600 text-white px-2 py-0.5 rounded-full shadow-2xs">
                                ✓ {validTokens.length} IDs
                              </span>
                            )}
                            {invalidTokens.length > 0 && (
                              <span className="text-[10px] font-black bg-rose-600 text-white px-2 py-0.5 rounded-full">
                                ⚠️ {invalidTokens.length} Invalid
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Textarea for pasting */}
                        <textarea
                          rows={3}
                          value={currentVal}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFeedCategoryInputs(prev => ({
                              ...prev,
                              [cat.key]: val
                            }));
                          }}
                          placeholder={`Paste 9-digit IDs for ${cat.label}... (comma/newline separated)`}
                          className="w-full bg-white border border-slate-200 rounded-xl p-2.5 font-mono text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-300 placeholder:font-sans custom-scrollbar"
                        />

                        {/* Category Footer: Clear button & status */}
                        <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400">
                          <span>{validTokens.length > 0 ? `${validTokens.length} valid 9-digit ID(s)` : 'No IDs added'}</span>
                          {currentVal && (
                            <button
                              type="button"
                              onClick={() => setFeedCategoryInputs(prev => ({ ...prev, [cat.key]: '' }))}
                              className="text-slate-400 hover:text-red-500 font-bold underline cursor-pointer"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Remarks / Note */}
              <div className="pt-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                  Feeding Remarks / Note (Optional)
                </label>
                <input
                  type="text"
                  value={feedRemarks}
                  onChange={(e) => setFeedRemarks(e.target.value)}
                  placeholder="e.g. Backfilled from WhatsApp register / Verified by DTO"
                  className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Premium Live Submission Feedback */}
              {feedLoading && (
                <div className="p-4 bg-gradient-to-r from-indigo-50/95 via-sky-50/95 to-teal-50/95 border border-indigo-200/90 rounded-2xl flex items-center gap-3.5 shadow-xs animate-pulse">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-slate-900">Validating IDs &amp; Syncing to Cloud Database...</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black bg-indigo-100 text-indigo-800 border border-indigo-200 uppercase tracking-wider">Cloud Stream</span>
                    </div>
                    <p className="text-[11px] text-slate-600 font-medium mt-0.5">
                      Checking district registry, merging indicators and recording audit trail. Please wait.
                    </p>
                  </div>
                </div>
              )}

              {/* Error Alert */}
              {feedError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-800 flex items-start gap-2 animate-fade-in shadow-2xs">
                  <span className="text-base shrink-0">⚠️</span>
                  <div className="flex-1">
                    <p className="font-bold">{feedError}</p>
                    <p className="text-[10px] text-rose-600 font-normal mt-0.5">If problem persists, check network or retry with fewer IDs.</p>
                  </div>
                </div>
              )}

              {/* Success Banner & Post-Save Actions */}
              {feedSuccess && (
                <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs font-bold text-emerald-900 space-y-3 animate-fade-in">
                  <div className="flex items-start gap-2">
                    <span className="text-lg shrink-0">✅</span>
                    <div className="flex-1">
                      <p className="font-black text-emerald-950 text-sm">{feedSuccess}</p>
                      <p className="text-emerald-700 text-[11px] font-medium mt-0.5">
                        The dashboard and field reports have been refreshed. You can feed another date for the same officer below, or close when done.
                      </p>
                    </div>
                  </div>

                  {/* Fast Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-emerald-200/60">
                    <button
                      type="button"
                      onClick={() => {
                        setFeedCategoryInputs({});
                        setFeedRemarks('');
                        setFeedSuccess('');
                        setFeedError('');
                        // Date stays as current or user can change; district & fo stay selected!
                      }}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs px-4 py-2 rounded-xl shadow-xs active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <span>➕</span>
                      <span>Feed Another Date for {feedFoName}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleClose();
                        setFeedCategoryInputs({});
                        setFeedRemarks('');
                      }}
                      className="bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs px-4 py-2 rounded-xl active:scale-95 transition-all cursor-pointer"
                    >
                      ✓ Done / Close
                    </button>
                  </div>
                </div>
              )}

              {/* Modal Actions Footer */}
              {(() => {
                let totalReady = 0;
                feedCategoriesConfig.forEach(cat => {
                  const raw = feedCategoryInputs[cat.key] || '';
                  const is8or9 = (cat.key === 'fdc_provided_ids' || cat.key === 'outcome_assigned_ids');
                  const tokenRegex = is8or9 ? /^\d{8,9}$/ : /^\d{9}$/;
                  const validCount = raw.split(/[\s,;\n\r\t]+/).filter(t => tokenRegex.test(t.trim())).length;
                  totalReady += validCount;
                });

                return (
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
                    <div className="text-xs font-bold text-slate-600">
                      Total Ready: <span className="font-mono font-black text-indigo-600 text-sm">{totalReady}</span> Patient IDs
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleClose}
                        className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={feedLoading}
                        className={`px-5 py-2.5 rounded-xl text-xs font-black text-white shadow-md transition-all flex items-center gap-1.5 cursor-pointer ${
                          feedLoading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20 active:scale-95'
                        }`}
                      >
                        {feedLoading ? (
                          <>
                            <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                            <span>Saving &amp; Updating...</span>
                          </>
                        ) : (
                          <>
                            <span>✓</span>
                            <span>Save All Indicators for {feedDate || 'Date'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </form>
          </div>
        </div>
  );
}
