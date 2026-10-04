import React from 'react';
import { canonicalizeDistrict, canonicalizeFo, parseTargetVal, isOfficerNameMatch } from '../../../utils/districtHelpers';
import { getPreviousMonth } from '../../../utils/operationalMonth';

export default function TargetSettingModal({
  show,
  onClose,
  targetModalMonth,
  setTargetModalMonth,
  loadTargets,
  targetModalDistrict,
  setTargetModalDistrict,
  targetModalDistricts = [],
  officialTargetsByDistrict = {},
  officialDistrictTarget,
  setOfficialDistrictTarget,
  targetModalTab,
  setTargetModalTab,
  handleCopyFromLastMonth,
  targetSearchQuery,
  setTargetSearchQuery,
  targets = {},
  targetsData = {},
  handleTargetChange,
  handleSaveBulkDistrictTargets,
  isSavingBulkDistrictTargets,
  handleSaveSingleDistrictTarget,
  isSavingDistrictTarget,
  saveAllTargets,
  handleSaveAllTargetsCombined,
  handleExecuteTargetSave,
  isSavingTargets,
  frontlineAllocated = 0,
  staffDirectory = {},
  tempOfficialTargets = {},
  setTempOfficialTargets = () => {}
}) {
  if (!show) return null;

  return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-slate-100 animate-fade-in">
            {/* Modal Header with Month & District Pickers */}
            <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-slate-50/80">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">🎯</span>
                  <h2 className="text-lg sm:text-xl font-black text-slate-800">Dynamic Monthly Targets Suite</h2>
                </div>
                <p className="text-xs text-slate-500 font-medium">Set official district quotas &amp; quick frontline staff targets (Bihar Total: 6,357)</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Month Picker */}
                <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-xs">
                  <span className="text-[10px] font-black uppercase text-purple-600">Month:</span>
                  <input 
                    type="month" 
                    value={targetModalMonth} 
                    onChange={(e) => {
                      const newM = e.target.value;
                      setTargetModalMonth(newM);
                      loadTargets('All', newM);
                    }}
                    className="text-xs font-black text-slate-800 outline-none bg-transparent cursor-pointer"
                  />
                </div>

                {/* District Filter */}
                <select 
                  value={targetModalDistrict} 
                  onChange={(e) => {
                    const newD = e.target.value;
                    setTargetModalDistrict(newD);
                    if (newD !== 'All') {
                      const cD = canonicalizeDistrict(newD);
                      if (officialTargetsByDistrict && officialTargetsByDistrict[cD] !== undefined) {
                        setOfficialDistrictTarget(officialTargetsByDistrict[cD]);
                      }
                    }
                  }}
                  className="bg-white border border-slate-200 text-slate-700 font-bold text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-purple-500 shadow-xs"
                >
                  <option value="All">All Districts ({targetModalDistricts.length})</option>
                  {targetModalDistricts.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-2xl p-1 leading-none ml-1 cursor-pointer">&times;</button>
              </div>
            </div>

            {/* Navigation Tabs & Search Bar */}
            <div className="px-4 sm:px-6 py-2.5 bg-slate-50/90 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex p-1 bg-slate-200/80 rounded-xl">
                <button
                  type="button"
                  onClick={() => setTargetModalTab('official')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                    targetModalTab === 'official'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>🎯</span>
                  <span>1. District Master Targets</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTargetModalTab('frontline')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                    targetModalTab === 'frontline'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>🛵</span>
                  <span>2. Individual Staff Fine-Tuning</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyFromLastMonth}
                  title={`Pull/Copy all targets from previous month (${getPreviousMonth(targetModalMonth)})`}
                  className="px-3 py-1.5 rounded-xl text-xs font-black bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
                >
                  <span>📋</span>
                  <span>Copy Last Month ({getPreviousMonth(targetModalMonth)})</span>
                </button>

                <div className="relative">
                  <input
                    type="text"
                    placeholder="Filter district..."
                    value={targetSearchQuery}
                    onChange={(e) => setTargetSearchQuery(e.target.value)}
                    className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 outline-none w-32 sm:w-44 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                  {targetSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setTargetSearchQuery('')}
                      className="absolute right-2.5 top-1.5 text-xs font-black text-slate-400 hover:text-slate-600"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Statewide Summary Balance Banner */}
            {(() => {
              let totalOff = 0;
              let totalFrontline = 0;
              targetModalDistricts.forEach(dist => {
                const cDist = canonicalizeDistrict(dist);
                const officers = staffDirectory[dist] || [];
                const fTotal = officers.reduce((sum, fo) => {
                  const tData = targetsData.find(t => 
                    canonicalizeDistrict(t.district) === cDist && 
                    (isOfficerNameMatch(t.fo_name, fo, cDist) || isOfficerNameMatch(canonicalizeFo(t.fo_name, cDist, staffDirectory), fo, cDist))
                  );
                  return sum + parseTargetVal(tData, 50);
                }, 0);
                totalFrontline += fTotal;
                const offVal = tempOfficialTargets[cDist] !== undefined
                  ? Number(tempOfficialTargets[cDist])
                  : (officialTargetsByDistrict[cDist] !== undefined ? Number(officialTargetsByDistrict[cDist]) : 0);
                totalOff += (isNaN(offVal) ? 0 : offVal);
              });
              const bufferCount = Math.max(0, totalFrontline - totalOff);
              const bufferPct = totalOff > 0 ? Math.round((bufferCount / totalOff) * 100) : 0;

              return (
                <div className="mx-4 sm:mx-6 mt-3 p-3 bg-gradient-to-r from-indigo-50/90 via-purple-50/70 to-pink-50/50 border border-indigo-100 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-indigo-600 text-white rounded-lg text-xs font-black">📊</span>
                    <div>
                      <span className="font-black text-slate-800 uppercase tracking-wider text-[11px] block">
                        Target Balance ({targetModalDistricts.length} Districts)
                      </span>
                      <span className="text-[11px] text-slate-500 font-semibold block">
                        Auto-inherited from last month ({getPreviousMonth(targetModalMonth) || 'previous'}). Edit any district or staff value and save to apply specifically to {targetModalMonth}.
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-4 ml-auto">
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Official Quota</span>
                      <span className="text-xs sm:text-sm font-black text-indigo-700">{totalOff}</span>
                    </div>
                    <div className="h-6 w-px bg-slate-200"></div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Frontline Total</span>
                      <span className="text-xs sm:text-sm font-black text-purple-700">{totalFrontline}</span>
                    </div>
                    <div className="h-6 w-px bg-slate-200"></div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Net Buffer</span>
                      <span className={`text-xs sm:text-sm font-black ${bufferCount > 0 ? 'text-emerald-700' : 'text-slate-600'}`}>
                        +{bufferCount} ({bufferPct}%)
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 custom-scrollbar">
              {(() => {
                const effectiveList = targetModalDistrict === 'All' ? targetModalDistricts : [targetModalDistrict];
                const displayedDistricts = effectiveList.filter(d => 
                  !targetSearchQuery || d.toLowerCase().includes(targetSearchQuery.toLowerCase().trim())
                );

                if (displayedDistricts.length === 0) {
                  return (
                    <div className="py-12 text-center text-slate-400">
                      <span className="text-3xl block mb-2">🔍</span>
                      <p className="font-bold text-sm">No districts matching "{targetSearchQuery}"</p>
                    </div>
                  );
                }

                // TAB 1: ONE-SCREEN DISTRICT MASTER TARGETS GRID
                if (targetModalTab === 'official') {
                  return displayedDistricts.map(dist => {
                    const cDist = canonicalizeDistrict(dist);
                    const officers = staffDirectory[dist] || [];
                    const staffCount = officers.length;
                    const frontlineAllocated = officers.reduce((sum, fo) => {
                      const tData = targetsData.find(t => 
                        canonicalizeDistrict(t.district) === cDist && 
                        (isOfficerNameMatch(t.fo_name, fo, cDist) || isOfficerNameMatch(canonicalizeFo(t.fo_name, cDist, staffDirectory), fo, cDist))
                      );
                      return sum + parseTargetVal(tData, 50);
                    }, 0);

                    const offVal = tempOfficialTargets[cDist] !== undefined 
                      ? tempOfficialTargets[cDist] 
                      : (officialTargetsByDistrict[cDist] !== undefined ? officialTargetsByDistrict[cDist] : '');
                    const numOff = Number(offVal) || 0;
                    const bufferCount = frontlineAllocated - numOff;
                    const bufferPct = numOff > 0 ? Math.round((bufferCount / numOff) * 100) : 0;

                    return (
                      <div 
                        key={dist} 
                        className="p-4 bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 transition-all shadow-2xs space-y-3"
                      >
                        {/* District Header Row: Title, Official Target, Frontline Total, Buffer Pill & Save */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                          {/* District Title & Staff Count */}
                          <div className="min-w-[160px]">
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full bg-indigo-600"></span>
                              <h4 className="text-sm font-black text-slate-800">{dist}</h4>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                                👥 {staffCount} Staff
                              </span>
                            </div>
                          </div>

                          {/* Official District Target Input (District has ONLY ONE official target) */}
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-slate-600 whitespace-nowrap">Official Target:</span>
                            <input
                              type="number"
                              min="0"
                              value={offVal}
                              onChange={(e) => {
                                const val = e.target.value;
                                setTempOfficialTargets(prev => ({ ...prev, [cDist]: val }));
                              }}
                              placeholder="e.g. 53"
                              className="w-20 sm:w-24 bg-indigo-50/60 border border-indigo-200 rounded-xl px-2.5 py-1.5 text-center font-black text-xs text-indigo-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            />
                          </div>

                          {/* Frontline Total & Live Buffer Pill */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 px-2.5 py-1 rounded-xl border border-purple-200 whitespace-nowrap">
                              Frontline Total: {frontlineAllocated}
                            </span>

                            {numOff > 0 ? (
                              bufferCount >= 0 ? (
                                <span className="text-[10px] font-black px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                                  +{bufferCount} (+{bufferPct}% Buffer)
                                </span>
                              ) : (
                                <span className="text-[10px] font-black px-2.5 py-1 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                                  {bufferCount} Deficit ({bufferPct}%)
                                </span>
                              )
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-400 whitespace-nowrap">
                                Official unset
                              </span>
                            )}
                          </div>

                          {/* District Save Button */}
                          <div className="shrink-0 ml-auto md:ml-0">
                            <button
                              type="button"
                              onClick={() => handleSaveSingleDistrictTarget(dist, numOff)}
                              disabled={isSavingDistrictTarget}
                              className="px-3.5 py-1.5 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-xs active:scale-95 cursor-pointer disabled:opacity-50"
                            >
                              {isSavingDistrictTarget ? 'Saving...' : 'Save District'}
                            </button>
                          </div>
                        </div>

                        {/* Individual Frontline Staff Inputs Grid (Har ladke ka alag frontline target) */}
                        {officers.length > 0 ? (
                          <div className="space-y-1.5 pt-1">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                              Individual Frontline Staff Quotas ({officers.length} staff):
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {officers.map(fo => {
                                const tData = targetsData.find(t => 
                                  canonicalizeDistrict(t.district) === cDist && 
                                  (isOfficerNameMatch(t.fo_name, fo, cDist) || isOfficerNameMatch(canonicalizeFo(t.fo_name, cDist, staffDirectory), fo, cDist))
                                );
                                const currentTarget = parseTargetVal(tData, 50);
                                return (
                                  <div 
                                    key={fo} 
                                    className="flex justify-between items-center bg-slate-50/80 hover:bg-purple-50/40 border border-slate-200/80 rounded-xl px-3 py-2 transition-colors"
                                  >
                                    <div className="truncate mr-2">
                                      <span className="font-bold text-xs text-slate-800 block truncate">{fo}</span>
                                      <span className="text-[9px] font-semibold text-slate-400">{dist}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className="text-[10px] font-bold text-slate-400">Target:</span>
                                      <input 
                                        type="number" 
                                        min="0"
                                        value={currentTarget} 
                                        onChange={(e) => handleTargetChange(dist, fo, e.target.value)} 
                                        className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1 text-center font-black text-xs text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-inner" 
                                        placeholder="50" 
                                      />
                                      {handleExecuteTargetSave && (
                                        <button
                                          type="button"
                                          title={`Save target for ${fo}`}
                                          disabled={isSavingTargets}
                                          onClick={() => handleExecuteTargetSave({ district: dist, fo_name: fo, target: currentTarget, month: targetModalMonth })}
                                          className="p-1 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-40"
                                        >
                                          💾
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic pt-1">No staff registered for {dist}</p>
                        )}
                      </div>
                    );
                  });
                }

                // TAB 2: INDIVIDUAL STAFF FINE-TUNING GRID
                return displayedDistricts.map(dist => {
                  const officers = staffDirectory[dist] || [];
                  const cDist = canonicalizeDistrict(dist);
                  const distTotal = officers.reduce((sum, fo) => {
                    const tData = targetsData.find(t => 
                      canonicalizeDistrict(t.district) === cDist && 
                      (isOfficerNameMatch(t.fo_name, fo, cDist) || isOfficerNameMatch(canonicalizeFo(t.fo_name, cDist, staffDirectory), fo, cDist))
                    );
                    return sum + parseTargetVal(tData, 50);
                  }, 0);

                  const offTgt = (officialTargetsByDistrict && officialTargetsByDistrict[cDist]) || 
                    (dist === targetModalDistrict ? officialDistrictTarget : 0);
                  const bufferCount = distTotal - offTgt;
                  const bufferPct = offTgt > 0 ? Math.round((bufferCount / offTgt) * 100) : 0;

                  return (
                    <div key={dist} className="space-y-2.5 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-purple-600"></span>
                          <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">{dist} District ({officers.length} Staff)</h4>
                        </div>
                        <div className="flex items-center gap-2">
                          {offTgt > 0 && (
                            <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full border border-indigo-200">
                              Official: {offTgt}
                            </span>
                          )}
                          <span className="text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 px-2.5 py-0.5 rounded-full border border-purple-200">
                            Frontline: {distTotal}
                          </span>
                          {offTgt > 0 && (
                            <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                              bufferCount >= 0 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                              {bufferCount >= 0 ? `Buffer: +${bufferCount} (+${bufferPct}%)` : `Deficit: ${bufferCount} (${bufferPct}%)`}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {officers.map(fo => {
                          const tData = targetsData.find(t => 
                            canonicalizeDistrict(t.district) === cDist && 
                            (isOfficerNameMatch(t.fo_name, fo, cDist) || isOfficerNameMatch(canonicalizeFo(t.fo_name, cDist, staffDirectory), fo, cDist))
                          );
                          const currentTarget = parseTargetVal(tData, 50);
                          return (
                            <div key={fo} className="flex justify-between items-center bg-white border border-slate-100 hover:border-purple-200 p-3 rounded-xl transition-colors shadow-2xs">
                              <div className="truncate mr-2">
                                <span className="font-bold text-xs text-slate-800 block truncate">{fo}</span>
                                <span className="text-[10px] font-semibold text-slate-400">{dist}</span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] font-bold text-slate-400">Target:</span>
                                <input 
                                  type="number" 
                                  value={currentTarget} 
                                  onChange={(e) => handleTargetChange(dist, fo, e.target.value)} 
                                  className="w-20 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-center font-black text-xs text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-inner" 
                                  placeholder="50" 
                                />
                                {handleExecuteTargetSave && (
                                  <button
                                    type="button"
                                    title={`Save target for ${fo}`}
                                    disabled={isSavingTargets}
                                    onClick={() => handleExecuteTargetSave({ district: dist, fo_name: fo, target: currentTarget, month: targetModalMonth })}
                                    className="p-1 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-40"
                                  >
                                    💾
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/90 flex flex-wrap justify-between items-center gap-3">
              <span className="text-xs text-slate-500 font-medium">
                Target Month: <strong className="text-purple-700">{targetModalMonth}</strong>
                {targetModalTab === 'official' ? ' (Official quotas sync to KPI reports & bulletins)' : ' (Frontline quotas measure field activity)'}
              </span>
              <div className="flex flex-wrap items-center gap-2 ml-auto">
                <button 
                  type="button"
                  onClick={onClose} 
                  className="px-4 py-2 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Close
                </button>

                {targetModalTab === 'official' ? (
                  <>
                    <button 
                      type="button"
                      onClick={handleSaveBulkDistrictTargets} 
                      disabled={isSavingBulkDistrictTargets}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 sm:px-5 py-2 rounded-xl font-bold text-xs shadow-md shadow-indigo-600/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      {isSavingBulkDistrictTargets ? (
                        <>
                          <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          <span>Saving Official...</span>
                        </>
                      ) : (
                        <>
                          <span>🏛️</span>
                          <span>Save All Official Targets</span>
                        </>
                      )}
                    </button>
                    <button 
                      type="button"
                      onClick={handleSaveAllTargetsCombined} 
                      disabled={isSavingBulkDistrictTargets || isSavingTargets}
                      className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 text-white px-5 sm:px-6 py-2 rounded-xl font-bold text-xs shadow-md shadow-purple-600/25 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      {isSavingBulkDistrictTargets || isSavingTargets ? (
                        <>
                          <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          <span>Saving All...</span>
                        </>
                      ) : (
                        <>
                          <span>✓</span>
                          <span>Save All (Official + Frontline)</span>
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <button 
                    type="button"
                    onClick={saveAllTargets} 
                    disabled={isSavingTargets}
                    className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-6 py-2 rounded-xl font-bold text-xs shadow-md shadow-purple-600/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    {isSavingTargets ? (
                      <>
                        <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        <span>Saving Staff Quotas...</span>
                      </>
                    ) : (
                      <>
                        <span>🛵</span>
                        <span>Save Frontline Staff Quotas</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
  );
}
