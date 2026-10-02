import React from 'react';

export default function StaffPacingTab({
  activeMainTab,
  month,
  selectedDistrict,
  setSelectedDistrict,
  workingDaysInfo = {},
  pacingHolidaysCount = 0,
  handleUpdatePacingHolidays,
  pacingStats = {},
  comparatorOfficerA,
  setComparatorOfficerA,
  comparatorOfficerB,
  setComparatorOfficerB,
  staffPacingData = [],
  filteredStaffPacing = [],
  pacingFilterStatus,
  setPacingFilterStatus,
  pacingSearchQuery,
  setPacingSearchQuery,
  pacingSortConfig = {},
  setPacingSortConfig,
  pacingViewMode,
  setPacingViewMode,
  setInspectingFO,
  copyCoachingMessage,
  copiedCoachingOfficer
}) {
  if (activeMainTab !== 'staff_pacing') return null;

  return (
      <div className="space-y-6 animate-fade-in">
        {/* Calendar Status & Working Days Config Bar */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-black text-2xl shadow-inner shrink-0">
              🎯
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                Staff Target Pacing &amp; Run-Rate Studio
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">{month}</span>
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Individual target velocity, expected vs actual run-rates, month-end forecast models &amp; head-to-head benchmarking.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 w-full md:w-auto justify-between md:justify-end">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <span className="text-slate-400 text-[10px] uppercase font-black tracking-wider">Sundays:</span>
              <span className="bg-white px-2 py-0.5 rounded-md border border-slate-200 text-slate-800 font-mono">{workingDaysInfo.sundays}</span>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <span className="text-slate-400 text-[10px] uppercase font-black tracking-wider">Declared Holidays:</span>
              <div className="inline-flex items-center bg-white rounded-lg border border-slate-200 shadow-2xs">
                <button
                  type="button"
                  onClick={() => handleUpdatePacingHolidays(-1)}
                  className="px-2 py-0.5 text-slate-500 hover:text-indigo-600 font-black text-xs transition-colors cursor-pointer"
                  title="Decrease holiday buffer"
                >
                  -
                </button>
                <span className="px-2 text-indigo-700 font-black text-xs font-mono">{pacingHolidaysCount}</span>
                <button
                  type="button"
                  onClick={() => handleUpdatePacingHolidays(1)}
                  className="px-2 py-0.5 text-slate-500 hover:text-indigo-600 font-black text-xs transition-colors cursor-pointer"
                  title="Increase holiday buffer"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-black text-indigo-950 bg-indigo-100/70 px-3 py-1.5 rounded-lg border border-indigo-200">
              <span>{workingDaysInfo.totalWorkingDays} Working Days</span>
              <span className="text-indigo-400">&bull;</span>
              <span className="text-emerald-700">{workingDaysInfo.elapsedWorkingDays} Done</span>
              <span className="text-indigo-400">&bull;</span>
              <span className="text-amber-700">{workingDaysInfo.remainingWorkingDays} Left</span>
            </div>
          </div>
        </div>

        {/* Executive Pacing KPI Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
          <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs font-black uppercase tracking-wider">
              <span>Active Officers</span>
              <span className="text-base">👥</span>
            </div>
            <div className="mt-3">
              <h4 className="text-2xl sm:text-3xl font-black text-slate-800">{pacingStats.totalStaff}</h4>
              <p className="text-[11px] font-bold text-slate-400 mt-1">Field Staff Monitored</p>
            </div>
          </div>

          <div className="bg-emerald-50/70 p-4 sm:p-5 rounded-2xl shadow-sm border border-emerald-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between text-emerald-700 text-xs font-black uppercase tracking-wider">
              <span>On Track / Ahead</span>
              <span className="text-base">🟢</span>
            </div>
            <div className="mt-3">
              <h4 className="text-2xl sm:text-3xl font-black text-emerald-800">
                {pacingStats.onTrack}
                <span className="text-xs font-bold ml-1.5 opacity-80 font-mono">
                  ({Math.round((pacingStats.onTrack / Math.max(1, pacingStats.totalStaff)) * 100)}%)
                </span>
              </h4>
              <p className="text-[11px] font-bold text-emerald-700 mt-1">Pacing &ge; 100% of Expected</p>
            </div>
          </div>

          <div className="bg-amber-50/70 p-4 sm:p-5 rounded-2xl shadow-sm border border-amber-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between text-amber-700 text-xs font-black uppercase tracking-wider">
              <span>Needs Push</span>
              <span className="text-base">🟡</span>
            </div>
            <div className="mt-3">
              <h4 className="text-2xl sm:text-3xl font-black text-amber-800">
                {pacingStats.watchlist}
                <span className="text-xs font-bold ml-1.5 opacity-80 font-mono">
                  ({Math.round((pacingStats.watchlist / Math.max(1, pacingStats.totalStaff)) * 100)}%)
                </span>
              </h4>
              <p className="text-[11px] font-bold text-amber-700 mt-1">75% - 99% of Expected Pace</p>
            </div>
          </div>

          <div className="bg-rose-50/70 p-4 sm:p-5 rounded-2xl shadow-sm border border-rose-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between text-rose-700 text-xs font-black uppercase tracking-wider">
              <span>Critical Lag</span>
              <span className="text-base">🔴</span>
            </div>
            <div className="mt-3">
              <h4 className="text-2xl sm:text-3xl font-black text-rose-800">
                {pacingStats.critical}
                <span className="text-xs font-bold ml-1.5 opacity-80 font-mono">
                  ({Math.round((pacingStats.critical / Math.max(1, pacingStats.totalStaff)) * 100)}%)
                </span>
              </h4>
              <p className="text-[11px] font-bold text-rose-700 mt-1">&lt; 75% Pace (Action Needed)</p>
            </div>
          </div>

          <div className="bg-indigo-50/80 p-4 sm:p-5 rounded-2xl shadow-sm border border-indigo-200/80 col-span-2 lg:col-span-1 flex flex-col justify-between">
            <div className="flex items-center justify-between text-indigo-800 text-xs font-black uppercase tracking-wider">
              <span>Month-End Forecast</span>
              <span className="text-base">📈</span>
            </div>
            <div className="mt-3">
              <h4 className="text-2xl sm:text-3xl font-black text-indigo-950">
                {pacingStats.totalProjected}
                <span className="text-xs font-bold ml-1 text-indigo-700 font-mono">
                  / {pacingStats.totalTarget}
                </span>
              </h4>
              <p className={`text-[11px] font-black mt-1 ${pacingStats.totalProjected >= pacingStats.totalTarget ? 'text-emerald-700' : 'text-rose-600'}`}>
                {pacingStats.totalProjected >= pacingStats.totalTarget 
                  ? `✓ Target will exceed (+${pacingStats.totalProjected - pacingStats.totalTarget})`
                  : `⚠️ Deficit of ${pacingStats.totalTarget - pacingStats.totalProjected} notif`}
              </p>
            </div>
          </div>
        </div>

        {/* Dual Officer Head-to-Head Benchmark Comparator */}
        {staffPacingData.length >= 2 && (() => {
          const defaultA = comparatorOfficerA || staffPacingData[0]?.id;
          const defaultB = comparatorOfficerB || (staffPacingData[1]?.id !== defaultA ? staffPacingData[1]?.id : staffPacingData[0]?.id);
          const officerA = staffPacingData.find(s => s.id === defaultA) || staffPacingData[0];
          const officerB = staffPacingData.find(s => s.id === defaultB) || staffPacingData[1];

          if (!officerA || !officerB) return null;

          const notifLeader = officerA.achieved > officerB.achieved ? officerA : officerB.achieved > officerA.achieved ? officerB : null;
          const paceLeader = officerA.pacingPct > officerB.pacingPct ? officerA : officerB.pacingPct > officerA.pacingPct ? officerB : null;
          const dbtLeader = officerA.dbt > officerB.dbt ? officerA : officerB.dbt > officerA.dbt ? officerB : null;
          const testLeader = officerA.tests > officerB.tests ? officerA : officerB.tests > officerA.tests ? officerB : null;

          return (
            <div className="bg-white p-5 sm:p-6 rounded-3xl shadow-sm border border-slate-100 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
                    <span>⚔️</span> Dual Officer Head-to-Head Benchmark
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Compare any two officers side-by-side: run-rate velocity, clinical indicators &amp; 1-click WhatsApp coaching.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={defaultA}
                    onChange={(e) => setComparatorOfficerA(e.target.value)}
                    className="bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {staffPacingData.map(s => (
                      <option key={s.id} value={s.id}>Officer A: {s.name} ({s.district})</option>
                    ))}
                  </select>
                  <span className="text-xs font-black text-slate-400">VS</span>
                  <select
                    value={defaultB}
                    onChange={(e) => setComparatorOfficerB(e.target.value)}
                    className="bg-purple-50 border border-purple-200 text-purple-900 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {staffPacingData.map(s => (
                      <option key={s.id} value={s.id}>Officer B: {s.name} ({s.district})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Side-by-Side Comparison Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Officer A Card */}
                <div className="bg-indigo-50/40 p-5 rounded-2xl border border-indigo-100 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-xl shadow-md shadow-indigo-600/20">
                        {officerA.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-base font-black text-slate-800">{officerA.name}</h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="bg-indigo-100 text-indigo-800 text-[10px] font-black px-2 py-0.5 rounded-md uppercase">
                            {officerA.district}
                          </span>
                          <span className="text-slate-400 text-xs font-semibold">{officerA.designation}</span>
                        </div>
                      </div>
                    </div>

                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      officerA.status === 'ON_TRACK' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                      officerA.status === 'WATCHLIST' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                      'bg-rose-100 text-rose-800 border border-rose-200'
                    }`}>
                      {officerA.status === 'ON_TRACK' ? '🟢 Ahead of Pace' : officerA.status === 'WATCHLIST' ? '🟡 Needs Push' : '🔴 Critical Lag'}
                    </span>
                  </div>

                  {/* Progress Bar with Expected Marker */}
                  <div className="space-y-1.5 bg-white p-3.5 rounded-xl border border-indigo-100/80">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-600">Notifications: <strong className="text-indigo-700">{officerA.achieved}</strong> / {officerA.target}</span>
                      <span className="text-slate-500 font-mono">{officerA.targetAchievedPct}% achieved</span>
                    </div>
                    <div className="relative w-full h-3.5 bg-slate-100 rounded-full overflow-visible border border-slate-200">
                      <div
                        className={`h-full rounded-full transition-all ${
                          officerA.status === 'ON_TRACK' ? 'bg-emerald-500' :
                          officerA.status === 'WATCHLIST' ? 'bg-amber-500' :
                          'bg-rose-500'
                        }`}
                        style={{ width: `${Math.min(100, (officerA.achieved / Math.max(1, officerA.target)) * 100)}%` }}
                      ></div>
                      {/* Milestone Marker for Expected Pace */}
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-slate-800 rounded-full z-10"
                        style={{ left: `${Math.min(100, (officerA.expectedPace / Math.max(1, officerA.target)) * 100)}%` }}
                        title={`Expected pace today: ${officerA.expectedPace}`}
                      ></div>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 font-semibold pt-0.5">
                      <span>Expected today: <strong className="text-slate-700">{officerA.expectedPace}</strong></span>
                      <span>Target: <strong className="text-slate-700">{officerA.target}</strong></span>
                    </div>
                  </div>

                  {/* Metric Chips */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white p-2.5 rounded-xl border border-indigo-100/70">
                      <span className="text-[10px] font-black uppercase text-slate-400 block">Pacing Health</span>
                      <p className={`text-base font-black ${officerA.pacingPct >= 100 ? 'text-emerald-700' : officerA.pacingPct >= 75 ? 'text-amber-700' : 'text-rose-700'}`}>
                        {officerA.pacingPct}%
                      </p>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-indigo-100/70">
                      <span className="text-[10px] font-black uppercase text-slate-400 block">Daily Speed</span>
                      <p className="text-base font-black text-slate-800">{officerA.dailyVelocity} <span className="text-[10px] text-slate-400 font-normal">/day</span></p>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-indigo-100/70">
                      <span className="text-[10px] font-black uppercase text-slate-400 block">Projected Total</span>
                      <p className={`text-base font-black ${officerA.surplus >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {officerA.projectedFinish}
                      </p>
                    </div>
                  </div>

                  {/* Action */}
                  <button
                    onClick={() => copyCoachingMessage(officerA)}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs py-2.5 rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2"
                  >
                    <span>💬</span>
                    <span>{copiedCoachingOfficer === officerA.id ? "✓ Copied Coaching Message!" : `Copy Coaching Text for ${officerA.name}`}</span>
                  </button>
                </div>

                {/* Officer B Card */}
                <div className="bg-purple-50/40 p-5 rounded-2xl border border-purple-100 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center font-black text-xl shadow-md shadow-purple-600/20">
                        {officerB.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-base font-black text-slate-800">{officerB.name}</h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="bg-purple-100 text-purple-800 text-[10px] font-black px-2 py-0.5 rounded-md uppercase">
                            {officerB.district}
                          </span>
                          <span className="text-slate-400 text-xs font-semibold">{officerB.designation}</span>
                        </div>
                      </div>
                    </div>

                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      officerB.status === 'ON_TRACK' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                      officerB.status === 'WATCHLIST' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                      'bg-rose-100 text-rose-800 border border-rose-200'
                    }`}>
                      {officerB.status === 'ON_TRACK' ? '🟢 Ahead of Pace' : officerB.status === 'WATCHLIST' ? '🟡 Needs Push' : '🔴 Critical Lag'}
                    </span>
                  </div>

                  {/* Progress Bar with Expected Marker */}
                  <div className="space-y-1.5 bg-white p-3.5 rounded-xl border border-purple-100/80">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-600">Notifications: <strong className="text-purple-700">{officerB.achieved}</strong> / {officerB.target}</span>
                      <span className="text-slate-500 font-mono">{officerB.targetAchievedPct}% achieved</span>
                    </div>
                    <div className="relative w-full h-3.5 bg-slate-100 rounded-full overflow-visible border border-slate-200">
                      <div
                        className={`h-full rounded-full transition-all ${
                          officerB.status === 'ON_TRACK' ? 'bg-emerald-500' :
                          officerB.status === 'WATCHLIST' ? 'bg-amber-500' :
                          'bg-rose-500'
                        }`}
                        style={{ width: `${Math.min(100, (officerB.achieved / Math.max(1, officerB.target)) * 100)}%` }}
                      ></div>
                      {/* Milestone Marker for Expected Pace */}
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-slate-800 rounded-full z-10"
                        style={{ left: `${Math.min(100, (officerB.expectedPace / Math.max(1, officerB.target)) * 100)}%` }}
                        title={`Expected pace today: ${officerB.expectedPace}`}
                      ></div>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 font-semibold pt-0.5">
                      <span>Expected today: <strong className="text-slate-700">{officerB.expectedPace}</strong></span>
                      <span>Target: <strong className="text-slate-700">{officerB.target}</strong></span>
                    </div>
                  </div>

                  {/* Metric Chips */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white p-2.5 rounded-xl border border-purple-100/70">
                      <span className="text-[10px] font-black uppercase text-slate-400 block">Pacing Health</span>
                      <p className={`text-base font-black ${officerB.pacingPct >= 100 ? 'text-emerald-700' : officerB.pacingPct >= 75 ? 'text-amber-700' : 'text-rose-700'}`}>
                        {officerB.pacingPct}%
                      </p>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-purple-100/70">
                      <span className="text-[10px] font-black uppercase text-slate-400 block">Daily Speed</span>
                      <p className="text-base font-black text-slate-800">{officerB.dailyVelocity} <span className="text-[10px] text-slate-400 font-normal">/day</span></p>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-purple-100/70">
                      <span className="text-[10px] font-black uppercase text-slate-400 block">Projected Total</span>
                      <p className={`text-base font-black ${officerB.surplus >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {officerB.projectedFinish}
                      </p>
                    </div>
                  </div>

                  {/* Action */}
                  <button
                    onClick={() => copyCoachingMessage(officerB)}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-black text-xs py-2.5 rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2"
                  >
                    <span>💬</span>
                    <span>{copiedCoachingOfficer === officerB.id ? "✓ Copied Coaching Message!" : `Copy Coaching Text for ${officerB.name}`}</span>
                  </button>
                </div>
              </div>

              {/* Comparative Clinical Summary Bar */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 flex flex-wrap items-center justify-around gap-4 text-xs font-bold text-slate-700">
                <div className="flex items-center gap-2">
                  <span>🏆 Notifications:</span>
                  <span className="text-indigo-700">{officerA.name} ({officerA.achieved})</span>
                  <span className="text-slate-400">vs</span>
                  <span className="text-purple-700">{officerB.name} ({officerB.achieved})</span>
                  {notifLeader && <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-md font-black">{notifLeader.name} +{Math.abs(officerA.achieved - officerB.achieved)}</span>}
                </div>

                <div className="flex items-center gap-2">
                  <span>⚡ Pacing:</span>
                  <span className="text-indigo-700">{officerA.pacingPct}%</span>
                  <span className="text-slate-400">vs</span>
                  <span className="text-purple-700">{officerB.pacingPct}%</span>
                  {paceLeader && <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-md font-black">{paceLeader.name} Leads</span>}
                </div>

                <div className="flex items-center gap-2">
                  <span>💳 DBT Seeded:</span>
                  <span className="text-indigo-700">{officerA.dbt}</span>
                  <span className="text-slate-400">vs</span>
                  <span className="text-purple-700">{officerB.dbt}</span>
                  {dbtLeader && <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-md font-black">{dbtLeader.name} +{Math.abs(officerA.dbt - officerB.dbt)}</span>}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Filter, Search & View Toolbar */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <select
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {districts.map(d => (
                <option key={d} value={d}>{d === 'All' ? 'All Districts' : d}</option>
              ))}
            </select>

            <div className="inline-flex bg-slate-100 p-1 rounded-xl gap-1 text-xs font-bold">
              <button
                onClick={() => setPacingFilterStatus('ALL')}
                className={`px-3 py-1.5 rounded-lg transition-all ${pacingFilterStatus === 'ALL' ? 'bg-white text-slate-800 shadow-2xs font-black' : 'text-slate-500 hover:text-slate-800'}`}
              >
                All ({staffPacingData.length})
              </button>
              <button
                onClick={() => setPacingFilterStatus('ON_TRACK')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${pacingFilterStatus === 'ON_TRACK' ? 'bg-emerald-600 text-white shadow-2xs font-black' : 'text-emerald-700 hover:bg-emerald-50'}`}
              >
                <span>🟢</span> On Track ({pacingStats.onTrack})
              </button>
              <button
                onClick={() => setPacingFilterStatus('WATCHLIST')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${pacingFilterStatus === 'WATCHLIST' ? 'bg-amber-500 text-white shadow-2xs font-black' : 'text-amber-700 hover:bg-amber-50'}`}
              >
                <span>🟡</span> Needs Push ({pacingStats.watchlist})
              </button>
              <button
                onClick={() => setPacingFilterStatus('CRITICAL')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${pacingFilterStatus === 'CRITICAL' ? 'bg-rose-600 text-white shadow-2xs font-black' : 'text-rose-700 hover:bg-rose-50'}`}
              >
                <span>🔴</span> Critical ({pacingStats.critical})
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={pacingSearchQuery}
              onChange={(e) => setPacingSearchQuery(e.target.value)}
              placeholder="Search officer name..."
              className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 w-40 sm:w-48"
            />

            <select
              value={pacingSortConfig.key}
              onChange={(e) => setPacingSortConfig({ key: e.target.value, direction: e.target.value === 'name' ? 'asc' : 'desc' })}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="pacingPct">Sort: Pacing % (Fastest First)</option>
              <option value="achieved">Sort: Notifications Achieved</option>
              <option value="target">Sort: Highest Target</option>
              <option value="dailyVelocity">Sort: Daily Speed</option>
              <option value="projectedFinish">Sort: Month-End Forecast</option>
              <option value="name">Sort: Name (A-Z)</option>
            </select>

            <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200/80">
              <button
                type="button"
                onClick={() => setPacingViewMode('matrix')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${pacingViewMode === 'matrix' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500'}`}
                title="Matrix Table View"
              >
                📊 Table
              </button>
              <button
                type="button"
                onClick={() => setPacingViewMode('cards')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${pacingViewMode === 'cards' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500'}`}
                title="Visual Cards View"
              >
                🎴 Cards
              </button>
            </div>
          </div>
        </div>

        {/* Pacing Matrix: Table View */}
        {pacingViewMode === 'matrix' && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-black uppercase text-[10px] tracking-wider">
                    <th className="p-3.5 sticky left-0 bg-slate-50 z-10">Officer &amp; District</th>
                    <th className="p-3.5 text-center">Target</th>
                    <th className="p-3.5 text-center">Expected Pace</th>
                    <th className="p-3.5 text-center">Achieved</th>
                    <th className="p-3.5 min-w-[170px]">Pacing Velocity Tracker</th>
                    <th className="p-3.5 text-center">Status</th>
                    <th className="p-3.5 text-center">Speed / Day</th>
                    <th className="p-3.5 text-center">Needed / Day</th>
                    <th className="p-3.5 text-center">Projected Finish</th>
                    <th className="p-3.5 text-center">Active Days</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {filteredStaffPacing.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="text-center py-12 text-slate-400 font-bold">
                        No officers found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredStaffPacing.map((s, idx) => (
                      <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                        <td className="p-3.5 sticky left-0 bg-white shadow-2xs font-bold">
                          <div className="flex items-center gap-2">
                            <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center text-xs font-black">
                              {s.name.charAt(0)}
                            </span>
                            <div>
                              <span className="text-slate-800 font-black block">{s.name}</span>
                              <span className="text-[10px] text-indigo-700 font-bold bg-indigo-50 px-1.5 py-0.2 rounded-md">
                                {s.district}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5 text-center font-bold text-slate-600">{s.target}</td>
                        <td className="p-3.5 text-center font-bold text-slate-500">{s.expectedPace}</td>
                        <td className="p-3.5 text-center font-black text-slate-800">
                          {s.achieved}
                          <span className="text-[10px] text-slate-400 font-normal block font-mono">({s.targetAchievedPct}%)</span>
                        </td>
                        <td className="p-3.5">
                          {/* Triple-Milestone Pacing Bar */}
                          <div className="space-y-1">
                            <div className="relative w-full h-2.5 bg-slate-100 rounded-full overflow-visible border border-slate-200">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  s.status === 'ON_TRACK' ? 'bg-emerald-500' :
                                  s.status === 'WATCHLIST' ? 'bg-amber-500' :
                                  'bg-rose-500'
                                }`}
                                style={{ width: `${Math.min(100, (s.achieved / Math.max(1, s.target)) * 100)}%` }}
                              ></div>
                              {/* Expected marker line */}
                              <div
                                className="absolute top-0 bottom-0 w-1 bg-slate-800 rounded-full z-10 -mt-0.5"
                                style={{ left: `${Math.min(100, (s.expectedPace / Math.max(1, s.target)) * 100)}%` }}
                                title={`Expected pace today: ${s.expectedPace}`}
                              ></div>
                            </div>
                            <div className="flex justify-between text-[9px] text-slate-400 font-semibold font-mono">
                              <span>Pace: {s.pacingPct}%</span>
                              <span>Target: {s.target}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                            s.status === 'ON_TRACK' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                            s.status === 'WATCHLIST' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                            'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}>
                            {s.status === 'ON_TRACK' ? '🟢 Ahead' : s.status === 'WATCHLIST' ? '🟡 Watchlist' : '🔴 Critical'}
                          </span>
                        </td>
                        <td className="p-3.5 text-center font-bold font-mono text-slate-700">
                          {s.dailyVelocity}
                        </td>
                        <td className="p-3.5 text-center font-bold font-mono">
                          <span className={Number(s.requiredRecoveryRate) > Number(s.targetDailyRate) * 1.5 ? 'text-rose-600 font-black' : 'text-slate-700'}>
                            {s.requiredRecoveryRate}
                          </span>
                        </td>
                        <td className="p-3.5 text-center">
                          <span className={`font-black text-xs ${s.surplus >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {s.projectedFinish}
                          </span>
                          <span className={`text-[9px] font-bold block ${s.surplus >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {s.surplus >= 0 ? `+${s.surplus}` : `${s.surplus}`}
                          </span>
                        </td>
                        <td className="p-3.5 text-center text-xs font-semibold text-slate-600">
                          {s.activeDaysCount} / {workingDaysInfo.elapsedWorkingDays}
                          <span className="text-[10px] text-slate-400 block font-mono">({s.consistencyPct}%)</span>
                        </td>
                        <td className="p-3.5 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setComparatorOfficerA(s.id);
                              window.scrollTo({ top: 400, behavior: 'smooth' });
                            }}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded-lg transition-colors"
                            title="Compare in Head-to-Head Benchmarking"
                          >
                            ⚔️ Compare
                          </button>
                          <button
                            type="button"
                            onClick={() => setInspectingFO({ fo_name: s.name, district: s.district })}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold px-2 py-1 rounded-lg transition-colors"
                            title="Inspect Patient IDs"
                          >
                            🔍 IDs
                          </button>
                          <button
                            type="button"
                            onClick={() => copyCoachingMessage(s)}
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded-lg transition-colors"
                            title="Copy WhatsApp Coaching Message"
                          >
                            {copiedCoachingOfficer === s.id ? "✓ Copied!" : "💬 Coach"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pacing Matrix: Cards View */}
        {pacingViewMode === 'cards' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredStaffPacing.length === 0 ? (
              <div className="col-span-full text-center py-16 bg-white rounded-3xl border border-slate-100 text-slate-400 font-bold">
                No officers found matching your filters.
              </div>
            ) : (
              filteredStaffPacing.map((s, idx) => (
                <div
                  key={idx}
                  className={`bg-white p-5 rounded-3xl shadow-sm border transition-all hover:shadow-md space-y-4 ${
                    s.status === 'ON_TRACK' ? 'border-emerald-200/80 hover:border-emerald-300' :
                    s.status === 'WATCHLIST' ? 'border-amber-200/80 hover:border-amber-300' :
                    'border-rose-200/80 hover:border-rose-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-base text-white shadow-sm ${
                        s.status === 'ON_TRACK' ? 'bg-emerald-600' :
                        s.status === 'WATCHLIST' ? 'bg-amber-500' :
                        'bg-rose-600'
                      }`}>
                        {s.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-800">{s.name}</h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="bg-indigo-50 text-indigo-700 text-[9px] font-black px-2 py-0.5 rounded-md uppercase">
                            {s.district}
                          </span>
                          <span className="text-slate-400 text-[11px] font-semibold">{s.designation}</span>
                        </div>
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                      s.status === 'ON_TRACK' ? 'bg-emerald-100 text-emerald-800' :
                      s.status === 'WATCHLIST' ? 'bg-amber-100 text-amber-800' :
                      'bg-rose-100 text-rose-800'
                    }`}>
                      {s.status === 'ON_TRACK' ? '🟢 Ahead' : s.status === 'WATCHLIST' ? '🟡 Watchlist' : '🔴 Critical'}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-600">Notifications: <strong className="text-slate-800">{s.achieved}</strong> / {s.target}</span>
                      <span className="text-slate-500 font-mono">{s.targetAchievedPct}%</span>
                    </div>
                    <div className="relative w-full h-2.5 bg-slate-200/80 rounded-full overflow-visible">
                      <div
                        className={`h-full rounded-full transition-all ${
                          s.status === 'ON_TRACK' ? 'bg-emerald-500' :
                          s.status === 'WATCHLIST' ? 'bg-amber-500' :
                          'bg-rose-500'
                        }`}
                        style={{ width: `${Math.min(100, (s.achieved / Math.max(1, s.target)) * 100)}%` }}
                      ></div>
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-slate-800 rounded-full z-10 -mt-0.5"
                        style={{ left: `${Math.min(100, (s.expectedPace / Math.max(1, s.target)) * 100)}%` }}
                        title={`Expected pace today: ${s.expectedPace}`}
                      ></div>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 font-semibold pt-0.5 font-mono">
                      <span>Expected: {s.expectedPace}</span>
                      <span>Health: {s.pacingPct}%</span>
                    </div>
                  </div>

                  {/* Key Stats Chips */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                      <span className="text-[9px] font-black uppercase text-slate-400 block">Speed</span>
                      <p className="font-bold text-slate-800 font-mono">{s.dailyVelocity}/d</p>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                      <span className="text-[9px] font-black uppercase text-slate-400 block">Needed</span>
                      <p className="font-bold text-amber-700 font-mono">{s.requiredRecoveryRate}/d</p>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                      <span className="text-[9px] font-black uppercase text-slate-400 block">Forecast</span>
                      <p className={`font-black font-mono ${s.surplus >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {s.projectedFinish}
                      </p>
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setComparatorOfficerA(s.id);
                        window.scrollTo({ top: 400, behavior: 'smooth' });
                      }}
                      className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold py-2 rounded-xl transition-colors text-center"
                    >
                      ⚔️ Compare
                    </button>
                    <button
                      type="button"
                      onClick={() => copyCoachingMessage(s)}
                      className="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold py-2 rounded-xl transition-colors text-center"
                    >
                      {copiedCoachingOfficer === s.id ? "✓ Copied" : "💬 Coach"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
  );
}
