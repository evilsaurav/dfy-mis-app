import React from 'react';

export default function DuplicateRadarModal({
  show,
  onClose,
  duplicateAudit,
  duplicateScanData,
  month,
  fetchDuplicateAudit,
  fetchDuplicateScan,
  duplicateScanLoading,
  duplicateRadarTab,
  setDuplicateRadarTab,
  duplicateRepairing,
  handleRepairDuplicates,
  repairingDocId = null,
  handleRepairDuplicate = () => {}
}) {
  if (!show) return null;

  return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-3xl shadow-2xl border border-slate-100 max-h-[88vh] flex flex-col animate-fade-in">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-3">
              <div>
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <span>🛡️</span> Duplicate Patient ID Radar &amp; Journey Tracker
                </h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Month: {duplicateAudit?.month || duplicateScanData?.month || month}</p>
                  <button
                    type="button"
                    onClick={() => {
                      fetchDuplicateAudit();
                      fetchDuplicateScan(true);
                    }}
                    disabled={duplicateScanLoading}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs transition-transform active:scale-90"
                    title="Refresh Duplicate Radar and Inflation Scan"
                  >
                    <span className={duplicateScanLoading ? "animate-spin inline-block" : "inline-block"}>🔄</span>
                  </button>
                </div>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none">&times;</button>
            </div>

            {/* Radar Tabs */}
            <div className="flex gap-2 pb-3 border-b border-slate-100 flex-wrap">
              <button
                type="button"
                onClick={() => setDuplicateRadarTab('collisions')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${duplicateRadarTab === 'collisions' ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                <span>🚨</span> Same-Category Double Entries ({duplicateAudit?.total_same_category_duplicates || 0})
              </button>
              <button
                type="button"
                onClick={() => setDuplicateRadarTab('journeys')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${duplicateRadarTab === 'journeys' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                <span>🛤️</span> Patient Cascade Journeys ({duplicateAudit?.total_cross_category || 0})
              </button>
              <button
                type="button"
                onClick={() => {
                  setDuplicateRadarTab('repair');
                  if (!duplicateScanData) fetchDuplicateScan();
                }}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${duplicateRadarTab === 'repair' ? 'bg-rose-700 text-white shadow-md shadow-rose-700/20' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                <span>🚨</span> Notification Inflation &amp; 1-Click Fix ({duplicateScanData?.total_inflated_count || 0})
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1 my-3">
              {duplicateRadarTab === 'collisions' ? (
                (!duplicateAudit) ? (
                  <div className="text-center py-16 flex flex-col items-center justify-center space-y-3">
                    <div className="w-8 h-8 border-3 border-rose-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-500 font-bold text-xs">Loading duplicate collision audit...</p>
                  </div>
                ) : (duplicateAudit.same_category_duplicates && duplicateAudit.same_category_duplicates.length > 0) ? (
                  duplicateAudit.same_category_duplicates.map((dup, idx) => (
                    <div key={idx} className="p-4 bg-rose-50/70 rounded-2xl border border-rose-200 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-sm font-black text-rose-700 bg-white px-2.5 py-1 rounded-lg border border-rose-200">
                          ID #{dup.patient_id}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 px-2.5 py-0.5 rounded-full">
                          Double Entry in: {dup.repeated_categories.join(', ')}
                        </span>
                      </div>
                      <div className="space-y-1.5 pt-1">
                        {dup.occurrences.map((occ, oIdx) => (
                          <div key={oIdx} className="flex justify-between items-center text-xs bg-white px-3 py-1.5 rounded-xl border border-rose-100 font-semibold text-slate-700">
                            <span>👤 <strong>{occ.fo_name}</strong> ({occ.district})</span>
                            <span className="text-[10px] text-slate-500 font-bold">📅 {occ.date} &bull; <strong className="text-rose-600">{occ.category}</strong></span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-16">
                    <div className="text-4xl mb-2">🎉</div>
                    <p className="text-emerald-700 font-black text-sm">Shabash! 0 Double-Entry Duplicates Found.</p>
                    <p className="text-slate-400 text-xs mt-1">Kisi bhi officer ne same category me duplicate ID report nahi ki hai. Full data clean hai!</p>
                  </div>
                )
              ) : duplicateRadarTab === 'journeys' ? (
                (!duplicateAudit) ? (
                  <div className="text-center py-16 flex flex-col items-center justify-center space-y-3">
                    <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-500 font-bold text-xs">Loading patient journey tracker...</p>
                  </div>
                ) : (duplicateAudit.cross_category_history && duplicateAudit.cross_category_history.length > 0) ? (
                  duplicateAudit.cross_category_history.map((dup, idx) => (
                    <div key={idx} className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-sm font-black text-indigo-700 bg-white px-2.5 py-1 rounded-lg border border-indigo-200">
                          ID #{dup.patient_id}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full">
                          {dup.occurrence_count} Cascade Services
                        </span>
                      </div>
                      <div className="space-y-1.5 pt-1">
                        {dup.occurrences.map((occ, oIdx) => (
                          <div key={oIdx} className="flex justify-between items-center text-xs bg-white px-3 py-1.5 rounded-xl border border-indigo-100 font-semibold text-slate-700">
                            <span>👤 <strong>{occ.fo_name}</strong> ({occ.district})</span>
                            <span className="text-[10px] text-slate-500 font-bold">📅 {occ.date} &bull; <strong className="text-indigo-600">{occ.category}</strong></span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-16 text-slate-400 font-bold text-xs">
                    Koi multi-service history data nahi hai.
                  </div>
                )
              ) : (
                /* Tab 3: duplicateRadarTab === 'repair' */
                duplicateScanLoading ? (
                  <div className="text-center py-16 flex flex-col items-center justify-center space-y-3">
                    <div className="w-8 h-8 border-3 border-rose-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-500 font-bold text-xs">Scanning monthly reports for duplicate notification IDs...</p>
                  </div>
                ) : (duplicateScanData && duplicateScanData.instances && duplicateScanData.instances.length > 0) ? (
                  <div className="space-y-3">
                    <div className="p-3.5 bg-rose-50 rounded-2xl border border-rose-200/80 flex items-start gap-3">
                      <span className="text-xl">⚠️</span>
                      <div>
                        <h4 className="text-xs font-black text-rose-900 uppercase tracking-wide">
                          Notification Inflation Detected ({duplicateScanData.total_inflated_count || 0} Overcount)
                        </h4>
                        <p className="text-[11px] text-rose-700 mt-0.5 leading-relaxed">
                          These instances represent patient IDs reported on multiple dates, causing rollup inflation. Nikshay guidelines mandate that each TB diagnosis notification is counted strictly once per treatment episode. Click below to clean duplicate entries and automatically decrement the district rollup.
                        </p>
                      </div>
                    </div>

                    {duplicateScanData.instances.map((instance, idx) => {
                      const inflatedCount = instance.duplicate_ids?.length || 0;
                      const isThisRepairing = repairingDocId === instance.repeat_doc_id;

                      return (
                        <div key={instance.repeat_doc_id || idx} className="p-4 bg-white rounded-2xl border border-rose-200/80 shadow-xs hover:border-rose-300 transition-all space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                            <div className="flex items-center gap-2">
                              <span className="text-base">👤</span>
                              <div>
                                <span className="font-black text-xs text-slate-800">{instance.fo_name}</span>
                                <span className="text-[10px] text-slate-500 font-semibold ml-1.5 bg-slate-100 px-2 py-0.5 rounded-full">
                                  📍 {instance.district}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-slate-500 font-bold">
                                📅 Repeated Date: <span className="font-mono text-slate-700">{instance.repeat_date}</span>
                              </span>
                              <span className="bg-rose-100 text-rose-800 border border-rose-200 px-2 py-0.5 rounded-full text-[10px] font-black tracking-wide">
                                +{inflatedCount} inflated
                              </span>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                              Duplicate Patient IDs ({inflatedCount})
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {instance.duplicate_ids.map((id, idIdx) => {
                                const orig = instance.original_occurrences?.find(o => String(o.id) === String(id));
                                return (
                                  <div
                                    key={idIdx}
                                    className="group relative inline-flex items-center gap-1 font-mono text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg"
                                    title={orig ? `First reported on ${orig.date} by ${orig.fo_name}` : `Patient ID #${id}`}
                                  >
                                    <span>#{id}</span>
                                    {orig && (
                                      <span className="text-[9px] text-rose-500 font-normal">
                                        (1st: {orig.date})
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[10px] text-slate-400 font-medium">
                              Doc ID: <span className="font-mono">{instance.repeat_doc_id}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRepairDuplicate(instance)}
                              disabled={repairingDocId !== null}
                              className="bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 disabled:opacity-50 text-white px-3.5 py-1.5 rounded-xl text-xs font-black transition-all shadow-xs shadow-rose-600/20 flex items-center gap-1.5 active:scale-95 cursor-pointer disabled:cursor-not-allowed"
                              title={`Clean duplicate IDs and correct rollup (-${inflatedCount})`}
                            >
                              {isThisRepairing ? (
                                <>
                                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                  <span>Repairing...</span>
                                </>
                              ) : (
                                <>
                                  <span>🧹</span>
                                  <span>Clean &amp; Correct Rollup (-{inflatedCount})</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (duplicateScanData && duplicateScanData.instances && duplicateScanData.instances.length === 0) ? (
                  <div className="text-center py-16 bg-emerald-50/50 rounded-2xl border border-emerald-100 p-6">
                    <div className="text-4xl mb-2">🎉</div>
                    <p className="text-emerald-800 font-black text-sm">
                      🎉 0 Duplicate Notifications! Sabhi district rollups bilkul accurate hain.
                    </p>
                    <p className="text-emerald-600 text-xs mt-1">
                      Kisi bhi officer ne duplicate notification report nahi ki hai.
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-16 text-slate-400 font-bold text-xs space-y-2">
                    <p>Notification scan data available nahi hai.</p>
                    <button
                      type="button"
                      onClick={() => fetchDuplicateScan(true)}
                      className="inline-flex items-center gap-1 bg-rose-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-rose-700"
                    >
                      <span>🔄</span> Scan Now
                    </button>
                  </div>
                )
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button onClick={onClose} className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2.5 px-6 rounded-xl transition-all">Close</button>
            </div>
          </div>
        </div>
  );
}
