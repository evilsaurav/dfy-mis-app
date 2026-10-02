import React from 'react';

export default function NikshayModal({
  show,
  onClose,
  nikshayResult,
  setNikshayResult,
  nikshayFile,
  setNikshayFile,
  nikshayError,
  setNikshayError,
  ledgerViewMode,
  setLedgerViewMode,
  ledgerData,
  fetchCumulativeLedger,
  ledgerSearch,
  setLedgerSearch,
  ledgerDistrict,
  setLedgerDistrict,
  nikshaySyncStatus,
  nikshayActiveTab,
  setNikshayActiveTab,
  nikshayDistrict,
  setNikshayDistrict,
  nikshayMonth,
  setNikshayMonth,
  nikshayLoading,
  handleReconcileNikshay,
  handleDownloadReviewSheet,
  handleExportCumulativeLedger,
  ledgerLoading,
  ledgerExporting,
  currentUser,
  isSubAdmin,
  districts = [],
  month,
  setShowJourneyModal,
  setJourneySearchId,
  handleFetchJourney,
  selectedDistrict = 'All',
  reviewExporting = false,
  getAdminToken = () => ''
}) {
  if (!show) return null;

  const handleClose = () => {
    onClose();
    if (setNikshayResult) setNikshayResult(null);
    if (setNikshayFile) setNikshayFile(null);
    if (setNikshayError) setNikshayError('');
  };

  return (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-4xl w-full p-6 shadow-2xl space-y-5 animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl p-2 bg-emerald-50 rounded-2xl border border-emerald-200">⚖️</span>
                <div>
                  <h3 className="text-lg font-black text-slate-800">Nikshay Reconciler & Cumulative Ledger</h3>
                  <p className="text-xs text-slate-500 font-medium">Cross-match Nikshay dumps and permanently protect verified clinical indicators</p>
                </div>
              </div>
              <button 
                onClick={handleClose} 
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center transition-all cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* View Mode Switcher + Live Nikshay Sync Status */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setLedgerViewMode('reconcile')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    ledgerViewMode === 'reconcile'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span>⚡</span>
                  <span>Monthly Reconciler</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLedgerViewMode('ledger');
                    if (!ledgerData) fetchCumulativeLedger(1, ledgerSearch, ledgerDistrict);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    ledgerViewMode === 'ledger'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span>🔒</span>
                  <span>Permanent Cumulative Ledger</span>
                  {ledgerData?.total_in_collection !== undefined && (
                    <span className="ml-1 bg-emerald-800 text-white text-[10px] px-2 py-0.5 rounded-full font-mono font-bold">
                      {ledgerData.total_in_collection}
                    </span>
                  )}
                </button>
              </div>

              {/* 🕒 Last Data Sync Status - Prominently Displayed Right Here */}
              {nikshaySyncStatus && nikshaySyncStatus.has_sync ? (
                <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/90 px-3.5 py-1.5 rounded-2xl shadow-2xs self-start sm:self-auto">
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="text-slate-500 font-semibold">Last Data Synced:</span>
                    <span className="font-mono font-black text-emerald-800 bg-white border border-emerald-300 px-2 py-0.5 rounded-md shadow-2xs">
                      {nikshaySyncStatus.synced_at_ist}
                    </span>
                    {nikshaySyncStatus.synced_by && (
                      <span className="text-slate-400 text-[10px] font-medium hidden md:inline">
                        • by {nikshaySyncStatus.synced_by}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-[11px] text-slate-500 font-medium self-start sm:self-auto">
                  <span className="text-xs">🕒</span>
                  <span>Last Data Synced: <strong className="text-slate-600">Pending / No Dump Yet</strong></span>
                </div>
              )}
            </div>

            {nikshayError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold p-3 rounded-xl">
                ⚠️ {nikshayError}
              </div>
            )}

            {/* MODE A: MONTHLY FILE RECONCILER */}
            {ledgerViewMode === 'reconcile' && (
              <div className="space-y-5">
                {/* 🕒 Persistent Nikshay Sync Status Banner - Visible to All Roles */}
                {nikshaySyncStatus && nikshaySyncStatus.has_sync && (
                  <div className="bg-slate-900 text-white border border-slate-800 rounded-3xl p-5 shadow-md space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
                      <div className="flex items-start sm:items-center gap-3">
                        <span className="text-2xl p-2 bg-slate-800 rounded-2xl border border-slate-700">🕒</span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-slate-400">Nikshay Registry Last Synchronized:</span>
                            <span className="text-xs font-black text-emerald-400 font-mono bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded-lg">
                              {nikshaySyncStatus.synced_at_ist || 'Active'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 font-medium mt-1">
                            Updated by <strong className="text-slate-200">{nikshaySyncStatus.synced_by}</strong> • Target Month: <strong className="text-slate-200 font-mono">{nikshaySyncStatus.month || 'Current'}</strong> {nikshaySyncStatus.filename && (<span className="text-slate-500">• File: <span className="font-mono text-slate-400">{nikshaySyncStatus.filename}</span></span>)}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] uppercase tracking-wider font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full self-start sm:self-auto flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span>Statewide Verification Active</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-3">
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Verified on Nikshay</div>
                        <div className="text-lg font-black text-emerald-400 mt-0.5 font-mono">{nikshaySyncStatus.total_matched || 0}</div>
                        <div className="text-[10px] text-emerald-400/80 font-medium mt-0.5">Permanent Ledger Locked</div>
                      </div>
                      <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-3">
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Sync Grace (&le;72h)</div>
                        <div className="text-lg font-black text-amber-400 mt-0.5 font-mono">{nikshaySyncStatus.total_grace_under_72h || 0}</div>
                        <div className="text-[10px] text-amber-400/80 font-medium mt-0.5">Portal Sync In Progress</div>
                      </div>
                      <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-3">
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Missing &gt;72h Alert</div>
                        <div className="text-lg font-black text-rose-400 mt-0.5 font-mono">{nikshaySyncStatus.total_flagged_over_72h || 0}</div>
                        <div className="text-[10px] text-rose-400/80 font-medium mt-0.5">Manual Check Required</div>
                      </div>
                      <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-3">
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Match Accuracy</div>
                        <div className="text-lg font-black text-cyan-400 mt-0.5 font-mono">{nikshaySyncStatus.match_rate_pct || 0}%</div>
                        <div className="text-[10px] text-cyan-400/80 font-medium mt-0.5">Field Alignment Ratio</div>
                      </div>
                    </div>
                  </div>
                )}

                {isSubAdmin ? (
                  <div className="bg-emerald-50/70 border border-emerald-200 rounded-3xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">📋</span>
                        <h4 className="text-base font-black text-emerald-950">District Discrepancy & Verification Review Sheet</h4>
                      </div>
                      <p className="text-xs font-semibold text-emerald-800 mt-1 max-w-xl leading-relaxed">
                        Download your district's actionable Nikshay Discrepancy review workbook (.xlsx). It separates confirmed ID matches needing indicator action from unverified/aging IDs (&gt;3 days) to resolve with Field Officers.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const targetDist = selectedDistrict !== 'All' ? selectedDistrict : (currentUser?.allowed_districts?.[0] || 'Jamui');
                        window.open(`${import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com"}/admin/nikshay/download-review-sheet?district=${encodeURIComponent(targetDist)}&token=${getAdminToken()}`, "_blank");
                      }}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black px-5 py-3 rounded-2xl shadow-md shadow-emerald-700/20 active:scale-95 transition-all flex items-center gap-2 cursor-pointer shrink-0"
                    >
                      <span>📥</span>
                      <span>Download {selectedDistrict !== 'All' ? selectedDistrict : (currentUser?.allowed_districts?.[0] || '')} Review Sheet (.xlsx)</span>
                    </button>
                  </div>
                ) : (
                /* Upload & Filter Form (Super Admin) */
                <form onSubmit={handleReconcileNikshay} className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Target Month</label>
                      <input 
                        type="month" 
                        value={nikshayMonth} 
                        onChange={(e) => setNikshayMonth(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">District Filter</label>
                      <select 
                        value={nikshayDistrict} 
                        onChange={(e) => setNikshayDistrict(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        {districts.map(d => <option key={d} value={d}>{d === 'All' ? 'All Districts' : d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Nikshay File (.xlsx / .csv)</label>
                      <input 
                        type="file" 
                        accept=".xlsx,.xls,.csv" 
                        onChange={(e) => setNikshayFile(e.target.files[0] || null)}
                        className="w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={nikshayLoading || !nikshayFile}
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                    >
                      {nikshayLoading ? 'Processing Nikshay Data...' : '⚡ Run Reconciliation Match'}
                    </button>
                  </div>
                </form>
                )}

                {/* Reconciliation Results Display */}
                {nikshayResult && (
                  <div className="space-y-5">
                    {/* Detected Source Metadata Banner */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-emerald-50/80 border border-emerald-200 px-4 py-2.5 rounded-2xl text-xs font-bold text-emerald-800">
                      <div className="flex items-center gap-2">
                        <span className="text-base">📑</span>
                        <span>Source: Sheet <strong>"{nikshayResult.summary?.detected_sheet || 'mastersheet'}"</strong> | ID Column: <strong className="font-mono text-emerald-950">"{nikshayResult.summary?.detected_id_column}"</strong></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="bg-emerald-600 text-white text-[10px] px-2.5 py-1 rounded-lg font-black uppercase tracking-wider">
                          {nikshayResult.summary?.is_mastersheet_format ? 'Consolidated Master Dataset' : 'Standard Sheet'}
                        </span>
                        <button
                          type="button"
                          onClick={handleDownloadReviewSheet}
                          disabled={reviewExporting}
                          className="bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold px-3 py-1 rounded-lg transition-all shadow-2xs active:scale-95 cursor-pointer flex items-center gap-1 whitespace-nowrap"
                          title="Download Excel review sheet of flagged discrepancies for staff 1-on-1 meeting"
                        >
                          <span>📥</span>
                          <span>{reviewExporting ? 'Exporting...' : 'Review Sheet (.xlsx)'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setNikshayResult(null);
                            setNikshayFile(null);
                            setNikshayError('');
                          }}
                          className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-[11px] font-bold px-3 py-1 rounded-lg transition-all shadow-2xs active:scale-95 cursor-pointer flex items-center gap-1"
                          title="Clear results and upload another file"
                        >
                          <span>🔄</span>
                          <span>Upload New File</span>
                        </button>
                      </div>
                    </div>

                    {/* Permanent Cumulative Ledger Notice Banner */}
                    {nikshayResult.summary?.cumulative_ledger && (
                      <div className="bg-emerald-100/80 border border-emerald-300 px-4 py-2.5 rounded-2xl text-xs font-bold text-emerald-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-2xs">
                        <div className="flex items-center gap-2">
                          <span className="text-base">🔒</span>
                          <span>
                            <strong>Cumulative Ledger Synced:</strong> {nikshayResult.summary.cumulative_ledger.newly_locked_or_upgraded || 0} indicators permanently locked into database. (Matched indicators are NEVER erased!)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setLedgerViewMode('ledger');
                            fetchCumulativeLedger(1, '', nikshayDistrict);
                          }}
                          className="bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold px-3 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap"
                        >
                          View Permanent Ledger &rarr;
                        </button>
                      </div>
                    )}

                    {/* Top KPI Metrics */}
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
                      <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl text-center">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Nikshay Total</span>
                        <span className="text-xl font-black text-slate-800">{nikshayResult.summary?.total_nikshay_uploaded || 0}</span>
                      </div>
                      <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-2xl text-center">
                        <span className="text-[10px] font-black uppercase tracking-wider text-indigo-500 block">DFY Reported</span>
                        <span className="text-xl font-black text-indigo-700">{nikshayResult.summary?.total_dfy_reported || 0}</span>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl text-center">
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 block">Match Rate</span>
                        <span className="text-xl font-black text-emerald-700">{nikshayResult.summary?.match_rate_pct || 0}%</span>
                        <span className="text-[10px] text-emerald-600 font-bold block">({nikshayResult.summary?.matched_count || 0} matched)</span>
                      </div>
                      <div className="bg-rose-50 border border-rose-200 p-3 rounded-2xl text-center">
                        <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 block">⚠️ Flagged Review</span>
                        <span className="text-xl font-black text-rose-700">{nikshayResult.summary?.flagged_review_count || 0}</span>
                        <span className="text-[10px] text-rose-600 font-bold block">&gt; 3 days lag</span>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 p-3 rounded-2xl text-center">
                        <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 block">⏳ 72h Grace</span>
                        <span className="text-xl font-black text-blue-700">{nikshayResult.summary?.grace_window_count || 0}</span>
                        <span className="text-[10px] text-blue-600 font-bold block">≤ 3 days sync lag</span>
                      </div>
                      <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl text-center">
                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 block">Ready for Portal</span>
                        <span className="text-xl font-black text-amber-700">{nikshayResult.summary?.ready_for_portal_count || 0}</span>
                        <span className="text-[10px] text-amber-600 font-bold block">DFY completed</span>
                      </div>
                    </div>

                    {/* 4-Indicator Cascade Comparison Grid */}
                    {nikshayResult.summary?.cascade && (
                      <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black uppercase tracking-wider text-slate-600">⚡ 4-Indicator Cascade Cross-Concordance</span>
                          <span className="text-[10px] text-slate-400 font-semibold">Government Nikshay vs DFY Field Reality</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                          {/* HIV & DM */}
                          <div className="bg-white border border-purple-200 p-3 rounded-xl space-y-1 shadow-2xs">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-purple-900 flex items-center gap-1"><span>🩺</span> HIV & DM</span>
                              <span className="text-[10px] font-black bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">
                                {nikshayResult.summary.cascade.hiv_dm?.ready_for_portal || 0} Ready
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium flex justify-between pt-1 border-t border-slate-100">
                              <span>Nikshay: <strong className="text-slate-800">{nikshayResult.summary.cascade.hiv_dm?.nikshay_done || 0}</strong></span>
                              <span>DFY: <strong className="text-purple-700">{nikshayResult.summary.cascade.hiv_dm?.dfy_done || 0}</strong></span>
                            </div>
                          </div>

                          {/* DBT Bank */}
                          <div className="bg-white border border-amber-200 p-3 rounded-xl space-y-1 shadow-2xs">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-amber-900 flex items-center gap-1"><span>💳</span> DBT Bank</span>
                              <span className="text-[10px] font-black bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                                {nikshayResult.summary.cascade.dbt?.ready_for_portal || 0} Ready
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium flex justify-between pt-1 border-t border-slate-100">
                              <span>Nikshay: <strong className="text-slate-800">{nikshayResult.summary.cascade.dbt?.nikshay_done || 0}</strong></span>
                              <span>DFY: <strong className="text-amber-700">{nikshayResult.summary.cascade.dbt?.dfy_done || 0}</strong></span>
                            </div>
                          </div>

                          {/* UDST Testing */}
                          <div className="bg-white border border-emerald-200 p-3 rounded-xl space-y-1 shadow-2xs">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-emerald-900 flex items-center gap-1"><span>🔬</span> UDST Lab</span>
                              <span className="text-[10px] font-black bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">
                                {nikshayResult.summary.cascade.udst?.ready_for_portal || 0} Ready
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium flex justify-between pt-1 border-t border-slate-100">
                              <span>Nikshay: <strong className="text-slate-800">{nikshayResult.summary.cascade.udst?.nikshay_done || 0}</strong></span>
                              <span>DFY: <strong className="text-emerald-700">{nikshayResult.summary.cascade.udst?.dfy_done || 0}</strong></span>
                            </div>
                          </div>

                          {/* Contact Tracing */}
                          <div className="bg-white border border-blue-200 p-3 rounded-xl space-y-1 shadow-2xs">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-blue-900 flex items-center gap-1"><span>👥</span> Contact Tracing</span>
                              <span className="text-[10px] font-black bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                                {nikshayResult.summary.cascade.contact_tracing?.ready_for_portal || 0} Ready
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium flex justify-between pt-1 border-t border-slate-100">
                              <span>Nikshay: <strong className="text-slate-800">{nikshayResult.summary.cascade.contact_tracing?.nikshay_done || 0}</strong></span>
                              <span>DFY: <strong className="text-blue-700">{nikshayResult.summary.cascade.contact_tracing?.dfy_done || 0}</strong></span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Sub-tabs Navigation */}
                    <div className="border-b border-slate-200 flex flex-wrap gap-1">
                      <button
                        onClick={() => setNikshayActiveTab('flagged_review')}
                        className={`pb-2 text-xs font-bold border-b-2 transition-all px-2.5 cursor-pointer ${nikshayActiveTab === 'flagged_review' ? 'border-rose-600 text-rose-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                      >
                        ⚠️ Flagged Discrepancies ({nikshayResult.summary?.flagged_review_count || 0})
                      </button>
                      <button
                        onClick={() => setNikshayActiveTab('grace_window')}
                        className={`pb-2 text-xs font-bold border-b-2 transition-all px-2.5 cursor-pointer ${nikshayActiveTab === 'grace_window' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                      >
                        ⏳ 72h Grace Window ({nikshayResult.summary?.grace_window_count || 0})
                      </button>
                      <button
                        onClick={() => setNikshayActiveTab('ready_for_portal')}
                        className={`pb-2 text-xs font-bold border-b-2 transition-all px-2.5 cursor-pointer ${nikshayActiveTab === 'ready_for_portal' ? 'border-amber-600 text-amber-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                      >
                        ⭐ Ready for Nikshay Portal ({nikshayResult.summary?.ready_for_portal_count || 0})
                      </button>
                      <button
                        onClick={() => setNikshayActiveTab('missing_in_dfy')}
                        className={`pb-2 text-xs font-bold border-b-2 transition-all px-2.5 cursor-pointer ${nikshayActiveTab === 'missing_in_dfy' ? 'border-purple-600 text-purple-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                      >
                        Missing in DFY MIS ({nikshayResult.summary?.missing_in_dfy_count || 0})
                      </button>
                      <button
                        onClick={() => setNikshayActiveTab('only_in_dfy')}
                        className={`pb-2 text-xs font-bold border-b-2 transition-all px-2.5 cursor-pointer ${nikshayActiveTab === 'only_in_dfy' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                      >
                        Only in DFY / Typos ({nikshayResult.summary?.only_in_dfy_count || 0})
                      </button>
                      <button
                        onClick={() => setNikshayActiveTab('urgent_field_action')}
                        className={`pb-2 text-xs font-bold border-b-2 transition-all px-2.5 cursor-pointer ${nikshayActiveTab === 'urgent_field_action' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                      >
                        🚨 High Risk Dropout ({nikshayResult.summary?.urgent_field_action_count || 0})
                      </button>
                    </div>

                    {/* Tab: Flagged Discrepancies (>3 Days) */}
                    {nikshayActiveTab === 'flagged_review' && (
                      <div className="space-y-2.5">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-medium text-amber-900">
                          <div>
                            <p className="font-bold text-amber-950 flex items-center gap-1.5">
                              <span>⚠️</span>
                              <span>Staff Review List (Reported &gt; 3 Days Ago)</span>
                            </p>
                            <p className="text-[11px] text-amber-800 mt-0.5">
                              In cases me reporting kiye hue 3 din se zyada ho chuke hain par Nikshay portal par indicator blank hai ya ID match nahi hui. District Coordinator in cases par staff se 1-on-1 review karein. (Staff target par koi penalty nahi hai).
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleDownloadReviewSheet}
                            disabled={reviewExporting}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow-sm transition-all whitespace-nowrap active:scale-95 cursor-pointer flex items-center gap-1 self-end sm:self-center"
                          >
                            <span>📥</span>
                            <span>{reviewExporting ? 'Exporting...' : 'Export Excel'}</span>
                          </button>
                        </div>

                        <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0">
                              <tr>
                                <th className="p-2">Episode ID</th>
                                <th className="p-2">Category</th>
                                <th className="p-2">District</th>
                                <th className="p-2">Field Officer</th>
                                <th className="p-2">Date &amp; Aging</th>
                                <th className="p-2">Services Claimed</th>
                                <th className="p-2">Nikshay Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                              {(nikshayResult.preview_flagged_discrepancies || []).map((item, i) => (
                                <tr key={i} className="hover:bg-amber-50/50">
                                  <td className="p-2 font-mono font-bold text-amber-900">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setJourneySearchId(item.id);
                                        setShowJourneyModal(true);
                                        handleFetchJourney(item.id);
                                      }}
                                      className="hover:underline flex items-center gap-1 cursor-pointer"
                                    >
                                      <span>🔍</span>
                                      <span>#{item.id}</span>
                                    </button>
                                  </td>
                                  <td className="p-2">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                      item.category_type === 'matched_indicator_pending'
                                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                        : 'bg-rose-100 text-rose-800 border border-rose-200'
                                    }`}>
                                      {item.category || 'Discrepancy'}
                                    </span>
                                  </td>
                                  <td className="p-2 text-slate-700 font-semibold">{item.district || '-'}</td>
                                  <td className="p-2 text-slate-800 font-bold">{item.fo_name || '-'}</td>
                                  <td className="p-2 font-mono text-[11px]">
                                    <div className="text-slate-600">{item.date || '-'}</div>
                                    <div className="text-rose-600 font-bold text-[10px]">({item.days_elapsed} days pending)</div>
                                  </td>
                                  <td className="p-2">
                                    <span className="bg-slate-100 text-slate-700 text-[11px] font-semibold px-2 py-0.5 rounded">
                                      {item.services_claimed || '-'}
                                    </span>
                                  </td>
                                  <td className="p-2 text-[11px] text-amber-700 font-bold">
                                    {item.nikshay_status || 'Pending'}
                                  </td>
                                </tr>
                              ))}
                              {(nikshayResult.preview_flagged_discrepancies || []).length === 0 && (
                                <tr>
                                  <td colSpan="7" className="p-6 text-center text-emerald-600 font-bold">
                                    ✓ Shabaash! No discrepancies &gt; 3 days old detected.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Tab: 72h Grace Window (<= 3 Days) */}
                    {nikshayActiveTab === 'grace_window' && (
                      <div className="space-y-2.5">
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs font-medium text-blue-900">
                          <p className="font-bold text-blue-950 flex items-center gap-1.5">
                            <span>⏳</span>
                            <span>72-Hour Server Sync Grace Window (Reported ≤ 3 Days Ago)</span>
                          </p>
                          <p className="text-[11px] text-blue-800 mt-0.5">
                            Yeh sabhi reports pichle 72 ghanto ke andar submit hui hain. Sarkari Nikshay server entry aur sync me 2-3 din ka samay lagta hai, isliye inhe koi discrepancy nahi mana gaya hai.
                          </p>
                        </div>

                        <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0">
                              <tr>
                                <th className="p-2">Episode ID</th>
                                <th className="p-2">Category</th>
                                <th className="p-2">District</th>
                                <th className="p-2">Field Officer</th>
                                <th className="p-2">Date Reported</th>
                                <th className="p-2">Services Claimed</th>
                                <th className="p-2">Sync Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                              {(nikshayResult.preview_grace_window || []).map((item, i) => (
                                <tr key={i} className="hover:bg-blue-50/40">
                                  <td className="p-2 font-mono font-bold text-blue-900">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setJourneySearchId(item.id);
                                        setShowJourneyModal(true);
                                        handleFetchJourney(item.id);
                                      }}
                                      className="hover:underline flex items-center gap-1 cursor-pointer"
                                    >
                                      <span>🔍</span>
                                      <span>#{item.id}</span>
                                    </button>
                                  </td>
                                  <td className="p-2">
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-200">
                                      {item.category || 'Grace Period'}
                                    </span>
                                  </td>
                                  <td className="p-2 text-slate-700 font-semibold">{item.district || '-'}</td>
                                  <td className="p-2 text-slate-800 font-bold">{item.fo_name || '-'}</td>
                                  <td className="p-2 font-mono text-[11px]">
                                    <div className="text-slate-600">{item.date || '-'}</div>
                                    <div className="text-blue-600 font-semibold text-[10px]">({item.days_elapsed}d ago)</div>
                                  </td>
                                  <td className="p-2">
                                    <span className="bg-slate-100 text-slate-700 text-[11px] font-semibold px-2 py-0.5 rounded">
                                      {item.services_claimed || '-'}
                                    </span>
                                  </td>
                                  <td className="p-2">
                                    <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                      ⏳ Awaiting Portal Sync
                                    </span>
                                  </td>
                                </tr>
                              ))}
                              {(nikshayResult.preview_grace_window || []).length === 0 && (
                                <tr>
                                  <td colSpan="7" className="p-6 text-center text-slate-400 italic">
                                    No recent submissions awaiting sync.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Tab 1: Ready for Nikshay Portal Update */}
                    {nikshayActiveTab === 'ready_for_portal' && (
                      <div className="space-y-2">
                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 p-2.5 rounded-xl font-medium">
                          🎯 <strong>Action for DTO / District Coordinator:</strong> In sabhi patients ke service documents DFY Field Officers ne already collect kar liye hain. Inhe Nikshay portal par turant Update/Validated mark karein!
                        </p>
                        <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 text-slate-600 font-bold">
                              <tr>
                                <th className="p-2">Episode ID</th>
                                <th className="p-2">Patient Name</th>
                                <th className="p-2">District</th>
                                <th className="p-2">Services Completed by DFY</th>
                                <th className="p-2">Officer</th>
                                <th className="p-2">Date</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                              {(nikshayResult.preview_ready_for_portal || []).map((item, i) => (
                                <tr key={i} className="hover:bg-slate-50">
                                  <td className="p-2 font-mono font-bold text-amber-900">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setJourneySearchId(item.id);
                                        setShowJourneyModal(true);
                                        handleFetchJourney(item.id);
                                      }}
                                      className="hover:underline flex items-center gap-1 cursor-pointer"
                                    >
                                      <span>🔍</span>
                                      <span>#{item.id}</span>
                                    </button>
                                  </td>
                                  <td className="p-2 text-slate-800 font-bold">{item.name}</td>
                                  <td className="p-2 text-slate-600">{item.district}</td>
                                  <td className="p-2">
                                    <div className="flex flex-wrap gap-1">
                                      {(item.services_ready || []).map((s, idx) => (
                                        <span key={idx} className="bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                          {s}
                                        </span>
                                      ))}
                                    </div>
                                  </td>
                                  <td className="p-2 text-slate-600">{item.fo_name || '-'}</td>
                                  <td className="p-2 text-slate-400 font-mono text-[11px]">{item.date || '-'}</td>
                                </tr>
                              ))}
                              {(nikshayResult.preview_ready_for_portal || []).length === 0 && (
                                <tr>
                                  <td colSpan="6" className="p-6 text-center text-slate-400 italic">
                                    No pending portal updates detected for this dataset.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Tab 2: Missing in DFY MIS */}
                    {nikshayActiveTab === 'missing_in_dfy' && (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-500 font-medium">These patient IDs exist in Nikshay portal but were never reported in DFY MIS by field staff this month:</p>
                        <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 text-slate-600 font-bold">
                              <tr>
                                <th className="p-2">Episode ID</th>
                                <th className="p-2">Patient Name</th>
                                <th className="p-2">Phone</th>
                                <th className="p-2">District</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {(nikshayResult.preview_missing_in_dfy_details || nikshayResult.preview_missing_in_dfy || []).map((item, i) => (
                                <tr key={i} className="hover:bg-slate-50 font-mono">
                                  <td className="p-2 font-bold text-rose-700">#{typeof item === 'object' && item !== null ? item.id : String(item)}</td>
                                  <td className="p-2 font-sans text-slate-800 font-semibold">{typeof item === 'object' && item !== null ? (item.name || 'Patient') : 'Patient'}</td>
                                  <td className="p-2 text-slate-600">{typeof item === 'object' && item !== null ? (item.phone || '-') : '-'}</td>
                                  <td className="p-2 font-sans text-slate-600">{typeof item === 'object' && item !== null ? (item.district || '-') : '-'}</td>
                                </tr>
                              ))}
                              {(!nikshayResult.preview_missing_in_dfy_details && !nikshayResult.preview_missing_in_dfy || (nikshayResult.preview_missing_in_dfy_details || nikshayResult.preview_missing_in_dfy || []).length === 0) && (
                                <tr>
                                  <td colSpan="4" className="p-6 text-center text-emerald-600 font-bold">
                                    ✓ 100% matched! All Nikshay patients are reported in DFY MIS.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Tab 3: Only in DFY MIS */}
                    {nikshayActiveTab === 'only_in_dfy' && (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-500 font-medium">These patient IDs were entered by field officers in DFY MIS but are not in this Nikshay export (check for typos):</p>
                        <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 text-slate-600 font-bold">
                              <tr>
                                <th className="p-2">Patient ID</th>
                                <th className="p-2">District</th>
                                <th className="p-2">Field Officer</th>
                                <th className="p-2">Date</th>
                                <th className="p-2">Services Logged</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {(nikshayResult.preview_only_in_dfy || []).map((item, i) => (
                                <tr key={i} className="hover:bg-slate-50 font-mono">
                                  <td className="p-2 font-bold text-indigo-700">#{item.id}</td>
                                  <td className="p-2 font-sans text-slate-700">{item.district}</td>
                                  <td className="p-2 font-sans text-slate-700">{item.fo_name}</td>
                                  <td className="p-2 text-slate-500">{item.date}</td>
                                  <td className="p-2 font-sans text-[11px] text-slate-600">{(item.services || []).join(', ')}</td>
                                </tr>
                              ))}
                              {(nikshayResult.preview_only_in_dfy || []).length === 0 && (
                                <tr>
                                  <td colSpan="5" className="p-6 text-center text-slate-400 italic">
                                    No unrecognized DFY IDs detected.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Tab 4: Urgent Action (Pending in both) */}
                    {nikshayActiveTab === 'urgent_field_action' && (
                      <div className="space-y-2">
                        <p className="text-xs text-red-700 bg-red-50 border border-red-200 p-2.5 rounded-xl font-medium">
                          ⚠️ <strong>High Risk Dropout:</strong> In patients ke 2 ya zyada clinical cascade services Nikshay aur DFY dono me pending hain. Field Officers ko immediate home visit ke liye assign karein.
                        </p>
                        <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 text-slate-600 font-bold">
                              <tr>
                                <th className="p-2">Episode ID</th>
                                <th className="p-2">Patient Name</th>
                                <th className="p-2">District</th>
                                <th className="p-2">Pending Cascade Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                              {(nikshayResult.preview_urgent_field_action || []).map((item, i) => (
                                <tr key={i} className="hover:bg-slate-50">
                                  <td className="p-2 font-mono font-bold text-red-900">#{item.id}</td>
                                  <td className="p-2 text-slate-800 font-bold">{item.name}</td>
                                  <td className="p-2 text-slate-600">{item.district || '-'}</td>
                                  <td className="p-2">
                                    <div className="flex flex-wrap gap-1">
                                      {(item.pending_actions || []).map((a, idx) => (
                                        <span key={idx} className="bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                          {a} Missing
                                        </span>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                              {(nikshayResult.preview_urgent_field_action || []).length === 0 && (
                                <tr>
                                  <td colSpan="4" className="p-6 text-center text-emerald-600 font-bold">
                                    ✓ Zero high-risk dropout patients!
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* MODE B: PERMANENT CUMULATIVE LEDGER EXPLORER */}
            {ledgerViewMode === 'ledger' && (
              <div className="space-y-4">
                {/* Ledger Header & Search Controls */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div className="flex-1 flex gap-2">
                      <input
                        type="text"
                        value={ledgerSearch}
                        onChange={(e) => setLedgerSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            fetchCumulativeLedger(1, ledgerSearch, ledgerDistrict);
                          }
                        }}
                        placeholder="Search Episode ID, Name, Phone..."
                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => fetchCumulativeLedger(1, ledgerSearch, ledgerDistrict)}
                        disabled={ledgerLoading}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-2xs active:scale-95 cursor-pointer whitespace-nowrap"
                      >
                        {ledgerLoading ? 'Searching...' : '🔍 Search'}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={ledgerDistrict}
                        onChange={(e) => {
                          const val = e.target.value;
                          setLedgerDistrict(val);
                          fetchCumulativeLedger(1, ledgerSearch, val);
                        }}
                        className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        {districts.map(d => <option key={d} value={d}>{d === 'All' ? 'All Districts' : d}</option>)}
                      </select>
                      <button
                        type="button"
                        onClick={handleExportCumulativeLedger}
                        disabled={ledgerExporting}
                        className="bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-2xs active:scale-95 cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                        title="Download entire verified ledger as Excel"
                      >
                        <span>📥</span>
                        <span>{ledgerExporting ? 'Exporting...' : 'Export Excel'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Ledger KPI Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  <div className="bg-emerald-50/80 border border-emerald-200 p-3 rounded-2xl text-center">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 block">Total Locked</span>
                    <span className="text-xl font-black text-emerald-800">{ledgerData?.total_in_collection || 0}</span>
                    <span className="text-[10px] text-emerald-600 font-bold block">Permanent Records</span>
                  </div>
                  <div className="bg-purple-50 border border-purple-100 p-3 rounded-2xl text-center">
                    <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 block">HIV & DM</span>
                    <span className="text-xl font-black text-purple-700">{ledgerData?.metrics?.hiv_dm_verified || 0}</span>
                    <span className="text-[10px] text-purple-500 font-bold block">Screened & Locked</span>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 p-3 rounded-2xl text-center">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 block">DBT Bank</span>
                    <span className="text-xl font-black text-amber-700">{ledgerData?.metrics?.bank_validated || 0}</span>
                    <span className="text-[10px] text-amber-500 font-bold block">Validated & Locked</span>
                  </div>
                  <div className="bg-teal-50 border border-teal-100 p-3 rounded-2xl text-center">
                    <span className="text-[10px] font-black uppercase tracking-wider text-teal-600 block">UDST Tested</span>
                    <span className="text-xl font-black text-teal-700">{ledgerData?.metrics?.udst_done || 0}</span>
                    <span className="text-[10px] text-teal-500 font-bold block">Lab Confirmed</span>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 p-3 rounded-2xl text-center col-span-2 sm:col-span-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 block">Contact Tracing</span>
                    <span className="text-xl font-black text-blue-700">{ledgerData?.metrics?.contact_tracing_done || 0}</span>
                    <span className="text-[10px] text-blue-500 font-bold block">Household Covered</span>
                  </div>
                </div>

                {/* Ledger Patients Table */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0 z-10">
                        <tr>
                          <th className="p-2.5">Episode ID</th>
                          <th className="p-2.5">Patient Name / Phone</th>
                          <th className="p-2.5">District</th>
                          <th className="p-2.5">Permanently Verified Indicators</th>
                          <th className="p-2.5">Outcome</th>
                          <th className="p-2.5">Last Synced</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {(ledgerData?.patients || []).map((pt, i) => (
                          <tr key={i} className="hover:bg-emerald-50/40 transition-colors">
                            <td className="p-2.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setJourneySearchId(pt.patient_id);
                                  setShowJourneyModal(true);
                                  handleFetchJourney(pt.patient_id);
                                }}
                                className="font-mono font-black text-emerald-800 hover:text-emerald-950 underline decoration-dotted flex items-center gap-1 cursor-pointer"
                                title="View complete longitudinal journey"
                              >
                                <span>🔍</span>
                                <span>#{pt.patient_id}</span>
                              </button>
                            </td>
                            <td className="p-2.5">
                              <span className="font-bold text-slate-800 block">{pt.patient_name || 'Patient'}</span>
                              <span className="text-[11px] text-slate-400 font-mono">{pt.phone || '-'}</span>
                            </td>
                            <td className="p-2.5 text-slate-600 font-medium">{pt.district || '-'}</td>
                            <td className="p-2.5">
                              <div className="flex flex-wrap gap-1">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  pt.hiv_dm_tested || pt.hiv_tested || pt.dm_tested
                                    ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                    : 'bg-slate-100 text-slate-400'
                                }`}>
                                  🩺 HIV/DM: {pt.hiv_dm_tested || pt.hiv_tested || pt.dm_tested ? '✓' : '—'}
                                </span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  pt.bank_validated
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                    : 'bg-slate-100 text-slate-400'
                                }`}>
                                  💳 DBT: {pt.bank_validated ? '✓' : '—'}
                                </span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  pt.udst_done
                                    ? 'bg-teal-100 text-teal-800 border border-teal-200'
                                    : 'bg-slate-100 text-slate-400'
                                }`}>
                                  🔬 UDST: {pt.udst_done ? '✓' : '—'}
                                </span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  pt.contact_tracing_done
                                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                    : 'bg-slate-100 text-slate-400'
                                }`}>
                                  👥 CT: {pt.contact_tracing_done ? '✓' : '—'}
                                </span>
                              </div>
                            </td>
                            <td className="p-2.5 text-slate-600 text-[11px]">{pt.treatment_outcome || '-'}</td>
                            <td className="p-2.5 text-slate-400 font-mono text-[11px]">
                              {pt.last_reconciled_at?.slice(0, 10) || pt.first_verified_at?.slice(0, 10) || '-'}
                            </td>
                          </tr>
                        ))}
                        {(!ledgerData?.patients || ledgerData.patients.length === 0) && (
                          <tr>
                            <td colSpan="6" className="p-8 text-center text-slate-400 italic">
                              {ledgerLoading ? 'Loading cumulative ledger records...' : 'No permanently verified patients recorded yet for this filter.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Toolbar */}
                  {ledgerData && ledgerData.total_pages > 1 && (
                    <div className="bg-slate-50 border-t border-slate-200 px-4 py-2.5 flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">
                        Showing page <strong>{ledgerData.page}</strong> of <strong>{ledgerData.total_pages}</strong> ({ledgerData.total_records} matching patients)
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={ledgerData.page <= 1 || ledgerLoading}
                          onClick={() => fetchCumulativeLedger(ledgerData.page - 1, ledgerSearch, ledgerDistrict)}
                          className="bg-white hover:bg-slate-100 disabled:opacity-40 border border-slate-300 text-slate-700 px-3 py-1 rounded-lg font-bold cursor-pointer transition-all"
                        >
                          &larr; Prev
                        </button>
                        <button
                          type="button"
                          disabled={ledgerData.page >= ledgerData.total_pages || ledgerLoading}
                          onClick={() => fetchCumulativeLedger(ledgerData.page + 1, ledgerSearch, ledgerDistrict)}
                          className="bg-white hover:bg-slate-100 disabled:opacity-40 border border-slate-300 text-slate-700 px-3 py-1 rounded-lg font-bold cursor-pointer transition-all"
                        >
                          Next &rarr;
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
  );
}
