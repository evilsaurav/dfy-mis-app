import React from 'react';

export default function DistrictBenchmarksTab({
  activeMainTab,
  month,
  adminTargetViewMode,
  setAdminTargetViewMode,
  districtPacingData = [],
  setSelectedDistrict,
  setActiveMainTab,
  showToast
}) {
  if (activeMainTab !== 'district_benchmarks') return null;

  return (
      <div className="space-y-6 animate-fade-in">
        {/* District Summary Bar */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-2xl shadow-inner shrink-0">
              🏢
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                  District Benchmarks &amp; Target Pacing Matrix
                </h3>
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">{month}</span>
                <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border shadow-2xs flex items-center gap-1 ${
                  adminTargetViewMode === 'frontline'
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                }`}>
                  {adminTargetViewMode === 'frontline' ? '🛵 Frontline Operational Mode' : '🏛️ Official Benchmark Mode'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Comparative district pacing run-rates, target deficit/surplus forecasts &amp; state percentile rankings.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Target Perspective Quick Switcher */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/90 shadow-2xs shrink-0" title="Switch between Official State Targets and Frontline Operational Stretch">
              <button
                type="button"
                onClick={() => {
                  setAdminTargetViewMode('official');
                  showToast('District Pacing switched to 🏛️ Official District Quotas', 'info');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                  adminTargetViewMode === 'official'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>🏛️</span>
                <span>Official Quotas</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdminTargetViewMode('frontline');
                  showToast('District Pacing switched to 🛵 Frontline Operational Stretch', 'info');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                  adminTargetViewMode === 'frontline'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>🛵</span>
                <span>Frontline Targets</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs font-black text-indigo-950 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100">
              <span>{districtPacingData.length} Districts Analyzed</span>
              <span>&bull;</span>
              <span className="text-emerald-700">{districtPacingData.filter(d => d.status === 'ON_TRACK').length} On Track</span>
              <span>&bull;</span>
              <span className="text-rose-700">{districtPacingData.filter(d => d.status === 'CRITICAL').length} Critical</span>
            </div>
          </div>
        </div>

        {/* District Pacing Table */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-black uppercase text-[10px] tracking-wider">
                  <th className="p-3.5 sticky left-0 bg-slate-50 z-10">District Name</th>
                  <th className="p-3.5 text-center">Staff Count</th>
                  <th className="p-3.5 text-center">
                    <div>{adminTargetViewMode === 'frontline' ? 'Frontline Target' : 'Official Target'}</div>
                    <span className="text-[9px] font-normal lowercase text-slate-400">
                      {adminTargetViewMode === 'frontline' ? '(Ground Stretch)' : '(State Quota)'}
                    </span>
                  </th>
                  <th className="p-3.5 text-center">Official vs Frontline</th>
                  <th className="p-3.5 text-center">Expected Pace</th>
                  <th className="p-3.5 text-center">Achieved</th>
                  <th className="p-3.5 min-w-[160px]">Pacing Velocity Tracker</th>
                  <th className="p-3.5 text-center">Pacing Health</th>
                  <th className="p-3.5 text-center">Daily Speed</th>
                  <th className="p-3.5 text-center">Needed / Day</th>
                  <th className="p-3.5 text-center">Month-End Forecast</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                {districtPacingData.map((d, idx) => (
                  <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="p-3.5 sticky left-0 bg-white shadow-2xs font-black text-indigo-950">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center text-[10px] font-black font-mono">
                          {idx + 1}
                        </span>
                        <span>{d.district}</span>
                      </div>
                    </td>
                    <td className="p-3.5 text-center text-slate-600 font-bold">{d.staffCount} FOs</td>
                    <td className="p-3.5 text-center">
                      <span className="font-black text-sm text-slate-900 block">{d.target}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded inline-block font-mono ${
                        adminTargetViewMode === 'frontline'
                          ? 'text-purple-700 bg-purple-50 border border-purple-200'
                          : 'text-indigo-700 bg-indigo-50 border border-indigo-200'
                      }`}>
                        {adminTargetViewMode === 'frontline' ? 'Frontline' : 'Official'}
                      </span>
                    </td>
                    <td className="p-3.5 text-center text-xs">
                      <div className="flex items-center justify-center gap-1.5 font-bold text-[11px]">
                        <span className="text-slate-600" title="Official State Quota">🏛️ {d.officialTarget || '—'}</span>
                        <span className="text-slate-300">/</span>
                        <span className="text-purple-700" title="Frontline Staff Sum">🛵 {d.frontlineTarget}</span>
                      </div>
                      {d.officialTarget > 0 && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full inline-block mt-0.5 ${
                          d.bufferCount > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-50 text-slate-500 border border-slate-200'
                        }`}>
                          {d.bufferCount > 0 ? `+${d.bufferCount} Buffer (${d.bufferPct}%)` : 'Exact Quota'}
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-center font-bold text-slate-500">{d.expectedPace}</td>
                    <td className="p-3.5 text-center font-black text-slate-800">
                      {d.achieved}
                      <span className="text-[10px] text-slate-400 font-normal block font-mono">({d.targetAchievedPct}%)</span>
                    </td>
                    <td className="p-3.5">
                      <div className="space-y-1">
                        <div className="relative w-full h-2.5 bg-slate-100 rounded-full overflow-visible border border-slate-200">
                          <div
                            className={`h-full rounded-full transition-all ${
                              d.status === 'ON_TRACK' ? 'bg-emerald-500' :
                              d.status === 'WATCHLIST' ? 'bg-amber-500' :
                              'bg-rose-500'
                            }`}
                            style={{ width: `${Math.min(100, (d.achieved / Math.max(1, d.target)) * 100)}%` }}
                          ></div>
                          <div
                            className="absolute top-0 bottom-0 w-1 bg-slate-800 rounded-full z-10 -mt-0.5"
                            style={{ left: `${Math.min(100, (d.expectedPace / Math.max(1, d.target)) * 100)}%` }}
                            title={`Expected pace today: ${d.expectedPace}`}
                          ></div>
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-400 font-semibold font-mono">
                          <span>Pace: {d.pacingPct}%</span>
                          <span>Target: {d.target} ({adminTargetViewMode === 'frontline' ? 'FO' : 'Official'})</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-3.5 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                        d.status === 'ON_TRACK' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                        d.status === 'WATCHLIST' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                        'bg-rose-100 text-rose-800 border border-rose-200'
                      }`}>
                        {d.status === 'ON_TRACK' ? '🟢 Ahead' : d.status === 'WATCHLIST' ? '🟡 Watchlist' : '🔴 Critical'}
                      </span>
                    </td>
                    <td className="p-3.5 text-center font-bold font-mono text-slate-700">{d.dailyVelocity}</td>
                    <td className="p-3.5 text-center font-bold font-mono text-amber-700">{d.requiredRecoveryRate}</td>
                    <td className="p-3.5 text-center">
                      <span className={`font-black text-xs ${d.surplus >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {d.projectedFinish}
                      </span>
                      <span className={`text-[9px] font-bold block ${d.surplus >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {d.surplus >= 0 ? `+${d.surplus}` : `${d.surplus}`}
                      </span>
                    </td>
                    <td className="p-3.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDistrict(d.district);
                          setActiveMainTab('staff_pacing');
                        }}
                        className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                      >
                        Drilldown Staff ➔
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
  );
}
