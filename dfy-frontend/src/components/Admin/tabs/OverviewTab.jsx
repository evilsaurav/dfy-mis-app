import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, AreaChart, Area, LabelList, Cell } from 'recharts';
import { canonicalizeDistrict } from '../../../utils/districtHelpers';

export default function OverviewTab({
  activeMainTab,
  filteredRecords = [],
  isTickerPaused,
  setIsTickerPaused,
  isLoading,
  todayAttendance,
  setActiveAttendanceTab,
  setAttendanceDistrictFilter,
  setAttendanceSearchQuery,
  setShowAttendanceModal,
  chronicDefaulters = [],
  topPerformersTab,
  setTopPerformersTab,
  topPerformersPeriod,
  setTopPerformersPeriod,
  fetchTopPerformers,
  loadingTopPerformers,
  handleShareTopPerformersWhatsApp,
  setShowTopPerformersModal,
  topPerformersData,
  selectedDistrict,
  setSelectedDistrict,
  month,
  setMonth,
  selectedFO,
  setSelectedFO,
  workingDaysInfo = {},
  officialTargetsByDistrict = {},
  effectiveDistrictTarget = 0,
  frontlineStretchTarget = 0,
  scopedTarget = 0,
  totals = {},
  isSubAdmin = false,
  currentUser,
  setInspectingFO,
  performanceViewMode,
  setPerformanceViewMode,
  performanceMetricFilter,
  setPerformanceMetricFilter,
  performanceChartHeight = 340,
  performanceData = [],
  activeMetric,
  setActiveMetric,
  dailyTrendStats = {},
  trendGradient,
  compareDistA,
  setCompareDistA,
  compareDistB,
  setCompareDistB,
  districts = [],
  rawRecords = [],
  masterTableCohortFilter,
  setMasterTableCohortFilter,
  tableData = [],
  sortConfig = {},
  requestSort,
  tableTotals = {},
  adminTargetViewMode,
  setIsAuthenticated,
  targetsData = [],
  error = null,
  fetchData = () => {},
  isSuperAdmin = false
}) {
  const [showExtendedColumns, setShowExtendedColumns] = useState(false);
  const [masterTableSearch, setMasterTableSearch] = useState('');

  const displayedTableData = useMemo(() => {
    if (!masterTableSearch.trim()) return tableData;
    const q = masterTableSearch.trim().toLowerCase();
    return tableData.filter(row => 
      String(row.name || '').toLowerCase().includes(q) ||
      String(row.district || '').toLowerCase().includes(q)
    );
  }, [tableData, masterTableSearch]);

  if (activeMainTab !== 'overview') return null;

  const attendance = todayAttendance;

  const TH = ({ label, sortKey }) => {
    const isSorted = sortConfig.key === sortKey;
    return (
      <th 
        className={`p-2.5 sm:px-3 sm:py-2.5 font-black text-[10px] uppercase tracking-wider border-b border-slate-200 transition-all select-none cursor-pointer ${
          isSorted ? 'bg-teal-50 text-teal-950 font-extrabold' : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
        }`} 
        onClick={() => requestSort && requestSort(sortKey)}
      >
        <div className="flex items-center gap-1.5">
          <span>{label}</span>
          {isSorted && (
            <span className="bg-teal-700 text-white text-[9px] px-1 py-0.2 rounded font-black shadow-2xs">
              {sortConfig.direction === 'desc' ? '▼' : '▲'}
            </span>
          )}
        </div>
      </th>
    );
  };

  return (
          <>
            {/* Real-Time Live Activity Continuous Scrolling Marquee Ticker */}
            {filteredRecords.length > 0 && (() => {
              const recentActivity = filteredRecords.slice(-16).reverse();
              const tickerItems = [...recentActivity, ...recentActivity];

              return (
                <div className="bg-slate-900 text-white rounded-2xl px-3 py-2.5 sm:px-5 sm:py-3 shadow-md flex items-center gap-3 overflow-hidden border border-slate-800 animate-fade-in group relative select-none">
                  {/* Left Label & Live Indicator */}
                  <div className="flex items-center gap-2 shrink-0 z-20 bg-slate-900 pr-2 sm:pr-3 border-r border-slate-800">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Live Activity Feed</span>
                    <button
                      type="button"
                      onClick={() => setIsTickerPaused(prev => !prev)}
                      className="text-slate-400 hover:text-white text-[11px] p-1 rounded-md transition-colors ml-1"
                      title={isTickerPaused ? "Resume Live Auto-Scroll" : "Pause Live Auto-Scroll (or hover mouse to pause)"}
                    >
                      {isTickerPaused ? "▶️" : "⏸️"}
                    </button>
                  </div>

                  {/* Left edge gradient mask for seamless entry */}
                  <div className="pointer-events-none absolute left-36 sm:left-44 top-0 bottom-0 w-8 bg-gradient-to-r from-slate-900 to-transparent z-10"></div>

                  {/* Infinite Marquee Track */}
                  <div className="flex-1 overflow-hidden relative">
                    <div className={`animate-ticker flex items-center gap-8 ${isTickerPaused ? 'ticker-paused' : ''}`}>
                      {tickerItems.map((r, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-xs font-semibold shrink-0 bg-slate-800/80 hover:bg-indigo-900/60 transition-colors px-3 py-1.5 rounded-xl border border-slate-700/60 cursor-pointer"
                          onClick={() => {
                            setSelectedDistrict(r.working_place);
                            setSelectedFO(r.fo_name);
                          }}
                          title={`Click to filter by ${r.fo_name} (${r.working_place})`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                          <strong className="text-white tracking-tight">{r.fo_name}</strong>
                          <span className="text-slate-400 text-[10px] bg-slate-700/60 px-1.5 py-0.5 rounded-md font-mono">{r.working_place}</span>
                          <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                            <span>📈</span> {r.notifications} Notif
                          </span>
                          <span className="text-slate-400 text-[11px] font-medium">&bull; {r.total_km} KM</span>
                          {r.tests > 0 && (
                            <span className="text-amber-300 text-[11px] font-medium">&bull; 🧪 {r.tests}</span>
                          )}
                          <span className="text-slate-500 text-[10px] ml-1">{r.date_of_reporting || r.date}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right edge gradient mask for seamless exit */}
                  <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-slate-900 to-transparent z-10"></div>
                </div>
              );
            })()}

        {/* Live Attendance Banner */}
        {attendance && (() => {
          const submitted = attendance.submitted_count || ((attendance.submitted_full_count || 0) + (attendance.submitted_partial_count || 0)) || 0;
          const missing = attendance.missing_count || 0;
          const onLeave = attendance.on_leave_count || 0;
          const total = Math.max(attendance.total_staff || (submitted + missing + onLeave), 1);
          const submittedPct = Math.round((submitted / total) * 100);
          const onLeavePct = Math.round((onLeave / total) * 100);
          const missingPct = Math.max(0, 100 - submittedPct - onLeavePct);

          return (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col gap-3.5 animate-fade-in">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 w-full">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-xl shrink-0">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2">
                      Today's Field Officer Attendance 
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{attendance.date}</span>
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span>Total Active FOs: <strong className="text-slate-700">{attendance.total_staff}</strong></span>
                      <span>| Submitted: <strong className="text-emerald-600">{submitted}</strong></span>
                      <span>| Pending: <strong className="text-red-500">{missing}</strong></span>
                      <span>| On Leave: <strong className="text-amber-600">{onLeave}</strong></span>
                      {chronicDefaulters.length > 0 && (
                        <span className="font-bold text-rose-700 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-full text-[10px] inline-flex items-center gap-1 animate-pulse">
                          <span>⚠️</span> {chronicDefaulters.length} Inactive (2+ Days)
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto justify-end flex-wrap">
                  <div className="flex items-center gap-2 text-xs font-bold flex-wrap">
                    <button
                      onClick={() => { setActiveAttendanceTab('submitted'); setAttendanceDistrictFilter('All'); setAttendanceSearchQuery(''); setShowAttendanceModal(true); }}
                      className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3.5 py-1.5 rounded-xl border border-emerald-200 flex items-center gap-2 shadow-sm transition-all cursor-pointer active:scale-95"
                      title="Click to view submitted officers with time"
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                      <span>{submitted} Submitted</span>
                    </button>
                    <button
                      onClick={() => { setActiveAttendanceTab('missing'); setAttendanceDistrictFilter('All'); setAttendanceSearchQuery(''); setShowAttendanceModal(true); }}
                      className="bg-red-50 hover:bg-red-100 text-red-700 px-3.5 py-1.5 rounded-xl border border-red-200 flex items-center gap-2 shadow-sm transition-all cursor-pointer active:scale-95"
                      title="Click to view pending officers"
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                      <span>{missing} Missing</span>
                    </button>
                    <button
                      onClick={() => { setActiveAttendanceTab('on_leave'); setAttendanceDistrictFilter('All'); setAttendanceSearchQuery(''); setShowAttendanceModal(true); }}
                      className="bg-amber-50 hover:bg-amber-100 text-amber-800 px-3.5 py-1.5 rounded-xl border border-amber-200 flex items-center gap-2 shadow-sm transition-all cursor-pointer active:scale-95"
                      title="Click to view officers on leave or absent"
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                      <span>{onLeave} On Leave / Absent</span>
                    </button>
                    {chronicDefaulters.length > 0 && (
                      <button
                        onClick={() => { setActiveAttendanceTab('defaulters'); setAttendanceDistrictFilter('All'); setAttendanceSearchQuery(''); setShowAttendanceModal(true); }}
                        className="bg-purple-50 hover:bg-purple-100 text-purple-800 px-3 py-1.5 rounded-xl border border-purple-200 flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
                        title="View chronic defaulters (2+ consecutive days missed)"
                      >
                        <span>⚠️</span>
                        <span>{chronicDefaulters.length} Defaulters</span>
                      </button>
                    )}
                  </div>
                  <button 
                    onClick={() => { setAttendanceSearchQuery(''); setAttendanceDistrictFilter('All'); setShowAttendanceModal(true); }}
                    className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shrink-0 active:scale-95 shadow-sm cursor-pointer"
                  >
                    View Radar
                  </button>
                </div>
              </div>

              {/* Coverage Progress Bar */}
              <div className="w-full pt-2.5 border-t border-slate-100 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-slate-600 flex items-center gap-1.5">
                    <span>Field Duty Submission Coverage:</span>
                    <span className="text-emerald-700 font-extrabold">{submittedPct}% Completed</span>
                  </span>
                  <span className="text-slate-400 font-medium">
                    {submitted} of {total} Field Staff Active Today
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden flex shadow-inner">
                  <div 
                    className="bg-emerald-500 h-full transition-all duration-700" 
                    style={{ width: `${submittedPct}%` }}
                    title={`Submitted: ${submitted} (${submittedPct}%)`}
                  />
                  <div 
                    className="bg-amber-400 h-full transition-all duration-700" 
                    style={{ width: `${onLeavePct}%` }}
                    title={`On Leave / Absent: ${onLeave} (${onLeavePct}%)`}
                  />
                  <div 
                    className="bg-red-400/80 h-full transition-all duration-700" 
                    style={{ width: `${missingPct}%` }}
                    title={`Missing / Pending: ${missing} (${missingPct}%)`}
                  />
                </div>
              </div>
            </div>
          );
        })()}

        {isLoading ? (
          <div className="w-full space-y-6 py-4 animate-fade-in">
            {/* Top Loading Header / Sync Pulse Indicator */}
            <div className="bg-white/85 backdrop-blur-md rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-teal-500 via-teal-600 to-emerald-600 flex items-center justify-center text-white shadow-md shadow-teal-600/20 shrink-0">
                  <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
                    <span>Synchronizing Bihar Field Records...</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0"></span>
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-500 font-medium">Aggregating district targets, daily FDC dosages &amp; clinical rollups</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] sm:text-[11px] font-black px-3 py-1.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse"></span>
                <span>Zero-Lag Cloud Stream Active</span>
              </div>
            </div>

            {/* 4 Skeleton KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-3 animate-pulse">
                  <div className="flex justify-between items-center">
                    <div className="h-3 w-20 bg-slate-200 rounded-md"></div>
                    <div className="h-6 w-6 bg-slate-100 rounded-lg"></div>
                  </div>
                  <div className="h-7 w-28 bg-slate-300 rounded-lg"></div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-slate-200 rounded-full w-2/3"></div>
                  </div>
                  <div className="flex justify-between">
                    <div className="h-2.5 w-12 bg-slate-200 rounded"></div>
                    <div className="h-2.5 w-16 bg-slate-200 rounded"></div>
                  </div>
                </div>
              ))}
            </div>

            {/* Main Table Skeleton */}
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-4 animate-pulse">
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <div className="h-4 w-40 bg-slate-200 rounded-md"></div>
                <div className="flex gap-2">
                  <div className="h-7 w-24 bg-slate-100 rounded-xl"></div>
                  <div className="h-7 w-24 bg-slate-100 rounded-xl"></div>
                </div>
              </div>
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((row) => (
                  <div key={row} className="flex items-center gap-4 py-2 border-b border-slate-50 last:border-0">
                    <div className="h-8 w-8 bg-slate-100 rounded-full shrink-0"></div>
                    <div className="h-4 w-32 bg-slate-200 rounded shrink-0"></div>
                    <div className="h-4 w-24 bg-slate-100 rounded shrink-0"></div>
                    <div className="h-4 flex-1 bg-slate-100 rounded hidden md:block"></div>
                    <div className="h-6 w-20 bg-slate-200 rounded-full shrink-0"></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : error ? (
          <div className="text-center py-12 bg-rose-50 border border-rose-200 rounded-3xl p-6 space-y-3 shadow-sm max-w-xl mx-auto my-8">
            <span className="text-3xl">⚠️</span>
            <h3 className="text-base font-black text-rose-800">Unable to Load Dashboard Records</h3>
            <p className="text-xs font-semibold text-rose-600">{error}</p>
            <div className="pt-2 flex justify-center gap-3">
              <button 
                onClick={() => fetchData(true)} 
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow active:scale-95 flex items-center gap-1.5"
              >
                <span>🔄</span> Retry Loading
              </button>
              <button 
                onClick={() => {
                  localStorage.removeItem('dfy_admin_auth');
                  localStorage.removeItem('dfy_admin_token');
                  localStorage.removeItem('dfy_admin_user');
                  setIsAuthenticated(false);
                }} 
                className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-sm active:scale-95"
              >
                Re-login as Admin
              </button>
            </div>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="text-center py-14 bg-white rounded-3xl shadow-sm border border-slate-200/80 p-6 sm:p-8 space-y-4 max-w-2xl mx-auto my-8">
            <div className="w-14 h-14 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center justify-center text-2xl mx-auto">
              📂
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800 mb-1">No Data Found For Selected Filters</h3>
              <p className="text-xs text-slate-500 font-medium">
                {rawRecords.length === 0
                  ? `There are no field reports recorded in the database for ${month}.`
                  : `There are ${rawRecords.length} total reports for ${month}, but none match District: "${selectedDistrict}" and Officer: "${selectedFO}".`}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {selectedDistrict !== 'All' && (
                <button 
                  onClick={() => { setSelectedDistrict('All'); setSelectedFO('All'); }}
                  className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-1.5"
                >
                  <span>🌐</span> View All Districts ({rawRecords.length} reports)
                </button>
              )}
              {month !== '2026-09' && (
                <button 
                  onClick={() => setMonth('2026-09')}
                  className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-1.5"
                >
                  <span>📅</span> Switch to September 2026 (59 Reports)
                </button>
              )}
              <button 
                onClick={() => fetchData(true)}
                className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl border border-slate-200 transition-all active:scale-95 flex items-center gap-1.5"
              >
                <span>🔄</span> Refresh
              </button>
            </div>
          </div>
        ) : (
          <>
            {selectedFO !== 'All' && (
                <div className="bg-gradient-to-br from-indigo-600 to-blue-600 rounded-3xl shadow-xl p-8 sm:p-10 text-white flex flex-col items-center justify-center relative overflow-hidden mb-8 animate-fade-in-down w-full border border-indigo-400/30">
                   <div className="absolute top-0 right-0 w-80 h-80 bg-white opacity-10 rounded-full -mt-20 -mr-20 pointer-events-none blur-3xl"></div>
                   <div className="absolute bottom-0 left-0 w-64 h-64 bg-black opacity-10 rounded-full -mb-20 -ml-20 pointer-events-none blur-3xl"></div>
                   
                   <div className="h-24 w-24 sm:h-28 sm:w-28 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-4xl sm:text-5xl font-black shadow-2xl border-4 border-white/40 shrink-0 uppercase mb-4 z-10 text-white drop-shadow-md">
                     {selectedFO.charAt(0)}
                   </div>
                   
                   <div className="text-center z-10 w-full">
                     <h2 className="text-3xl sm:text-4xl font-black mb-2 tracking-tight drop-shadow-md">{selectedFO}</h2>
                     <p className="text-indigo-100 font-bold uppercase tracking-widest text-[10px] sm:text-xs mb-8 bg-black/20 inline-block px-4 py-1.5 rounded-full border border-white/10 shadow-sm">{selectedDistrict} District</p>
                     
                     <div className="flex flex-wrap justify-center gap-3 sm:gap-6 text-sm font-semibold max-w-3xl mx-auto w-full mt-4">
                       <span className="bg-white/10 backdrop-blur-md px-2 py-3 sm:px-6 sm:py-4 rounded-2xl flex flex-col items-center gap-1.5 border border-white/20 shadow-lg flex-1 min-w-[100px] hover:bg-white/20 transition-all cursor-default">
                         <span className="text-indigo-100 text-[9px] sm:text-[11px] uppercase tracking-widest font-black opacity-80">Days Active</span> 
                         <span className="text-2xl sm:text-3xl font-black drop-shadow-sm">{filteredRecords.length}</span>
                       </span>
                       
                       <span className="bg-white/10 backdrop-blur-md px-2 py-3 sm:px-6 sm:py-4 rounded-2xl flex flex-col items-center gap-1.5 border border-white/20 shadow-lg flex-1 min-w-[100px] hover:bg-white/20 transition-all cursor-default">
                         <span className="text-indigo-100 text-[9px] sm:text-[11px] uppercase tracking-widest font-black opacity-80">Total Travel</span> 
                         <span className="text-2xl sm:text-3xl font-black drop-shadow-sm">{totals.total_km} <span className="text-sm sm:text-base font-bold opacity-70">KM</span></span>
                       </span>
                       
                       <span className="bg-white/10 backdrop-blur-md px-2 py-3 sm:px-6 sm:py-4 rounded-2xl flex flex-col items-center gap-1.5 border border-white/20 shadow-lg flex-1 min-w-[100px] hover:bg-white/20 transition-all cursor-default">
                         <span className="text-indigo-100 text-[9px] sm:text-[11px] uppercase tracking-widest font-black opacity-80">Total Work</span> 
                         <span className="text-2xl sm:text-3xl font-black drop-shadow-sm">{Object.values(totals).reduce((a,b)=>a+b, 0) - totals.total_km}</span>
                       </span>
                     </div>
                   </div>
                </div>
              )}

            {/* Executive 4-Card KPI Summary Strip */}
            {(() => {
              // 1. Target & Achievement for TB Notifications
              let scopedTarget = 0;
              if (selectedDistrict !== 'All') {
                scopedTarget = targetsData.filter(t => t.district === selectedDistrict).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
              } else if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
                scopedTarget = targetsData.filter(t => currentUser.allowed_districts.includes(t.district)).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
              } else {
                scopedTarget = targetsData.reduce((sum, t) => sum + (Number(t.target) || 0), 0);
              }
              const notifCount = totals.notifications || 0;
              const notifAchievedPct = scopedTarget > 0 ? ((notifCount / scopedTarget) * 100).toFixed(1) : null;
              
              // 2. Lab Testing & Yield
              const testsCount = totals.tests || 0;
              const presumptiveCount = totals.presumptive || 0;
              const testYieldPct = presumptiveCount > 0 ? ((testsCount / presumptiveCount) * 100).toFixed(1) : null;
              
              // 3. Core Clinical Interventions
              const hivDmCount = totals.hiv_dm || 0;
              const dbtCount = totals.dbt || 0;
              const contactsCount = totals.contact_tracing || 0;
              const clinicalTotal = hivDmCount + dbtCount + contactsCount;
              const clinicalCoveragePct = notifCount > 0 ? Math.min(100, Math.round((clinicalTotal / (notifCount * 3)) * 100)) : 0;

              // 4. Field Travel & Active Staff
              const totalKm = totals.total_km || 0;
              const activeStaffCount = new Set(filteredRecords.map(r => r.fo_name).filter(Boolean)).size;
              const avgKmPerStaff = activeStaffCount > 0 ? (totalKm / activeStaffCount).toFixed(1) : 0;

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
                  
                  {/* CARD 1: TB Notifications */}
                  <div 
                    onClick={() => setActiveMetric('notifications')}
                    className={`glass-card p-4 sm:p-5 rounded-2xl border shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all group relative overflow-hidden cursor-pointer ${
                      activeMetric === 'notifications' 
                        ? 'bg-indigo-50/50 border-indigo-400 ring-2 ring-indigo-500/20' 
                        : 'bg-white/95 border-slate-200/90'
                    }`}
                    title="Click to view TB Notifications trend below"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider">TB Notifications</span>
                        {activeMetric === 'notifications' && (
                          <span className="text-[9px] font-black uppercase text-indigo-700 bg-indigo-100/90 px-1.5 py-0.2 rounded-md">
                            Active Trend
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {notifAchievedPct !== null ? (
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full tabular-num ${
                            Number(notifAchievedPct) >= 90 ? 'badge-emerald' : Number(notifAchievedPct) >= 60 ? 'badge-teal' : 'badge-amber'
                          }`}>
                            {notifAchievedPct}%
                          </span>
                        ) : null}
                        <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center text-sm font-black shrink-0 group-hover:scale-110 transition-transform">
                          📋
                        </div>
                      </div>
                    </div>
                    <p className="text-2xl sm:text-3xl font-black text-slate-900 tabular-num tracking-tight">{notifCount.toLocaleString('en-IN')}</p>
                    {scopedTarget > 0 ? (
                      <div className="mt-2 space-y-1">
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-700 ${
                              Number(notifAchievedPct) >= 90 ? 'bg-emerald-500' : Number(notifAchievedPct) >= 60 ? 'bg-teal-600' : 'bg-amber-500'
                            }`} 
                            style={{ width: `${Math.min(100, Number(notifAchievedPct))}%` }}
                          ></div>
                        </div>
                        <p className="text-[11px] font-semibold text-slate-500 tabular-num truncate">
                          Target: <strong className="text-slate-700 font-bold">{scopedTarget.toLocaleString('en-IN')}</strong> • {Number(notifAchievedPct) >= 100 ? 'Target Achieved' : `${Math.max(0, scopedTarget - notifCount).toLocaleString('en-IN')} remaining`}
                        </p>
                      </div>
                    ) : (
                      <p className="text-[11px] font-semibold text-teal-800/90 mt-2 truncate">
                        Primary Clinical Notifications
                      </p>
                    )}
                  </div>

                  {/* CARD 2: UDST Lab Testing */}
                  <div 
                    onClick={() => setActiveMetric('tests')}
                    className={`glass-card p-4 sm:p-5 rounded-2xl border shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all group relative overflow-hidden cursor-pointer ${
                      activeMetric === 'tests' 
                        ? 'bg-indigo-50/50 border-indigo-400 ring-2 ring-indigo-500/20' 
                        : 'bg-white/95 border-slate-200/90'
                    }`}
                    title="Click to view UDST Lab Testing trend below"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider">UDST Lab Testing</span>
                        {activeMetric === 'tests' && (
                          <span className="text-[9px] font-black uppercase text-indigo-700 bg-indigo-100/90 px-1.5 py-0.2 rounded-md">
                            Active Trend
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="badge-indigo text-[10px] font-black px-2 py-0.5 rounded-full">
                          UDST
                        </span>
                        <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center text-sm font-black shrink-0 group-hover:scale-110 transition-transform">
                          🔬
                        </div>
                      </div>
                    </div>
                    <p className="text-2xl sm:text-3xl font-black text-slate-900 tabular-num tracking-tight">{testsCount.toLocaleString('en-IN')}</p>
                    <div className="mt-2 space-y-1">
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className="h-full bg-blue-600 rounded-full transition-all duration-700" 
                          style={{ width: `${Math.min(100, Number(testYieldPct || 0))}%` }}
                        ></div>
                      </div>
                      <p className="text-[11px] font-semibold text-slate-500 tabular-num truncate">
                        {testYieldPct !== null ? (
                          <>Yield: <strong className="text-blue-800 font-bold">{testYieldPct}%</strong> of {presumptiveCount.toLocaleString('en-IN')} Presumptive</>
                        ) : (
                          <>Presumptive cases: {presumptiveCount.toLocaleString('en-IN')}</>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* CARD 3: Core Clinical Cascade */}
                  <div 
                    onClick={() => setActiveMetric('presumptive')}
                    className={`glass-card p-4 sm:p-5 rounded-2xl border shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all group relative overflow-hidden cursor-pointer ${
                      activeMetric === 'presumptive' 
                        ? 'bg-indigo-50/50 border-indigo-400 ring-2 ring-indigo-500/20' 
                        : 'bg-white/95 border-slate-200/90'
                    }`}
                    title="Click to view Presumptive cases trend below"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider">Clinical Cascade</span>
                        {activeMetric === 'presumptive' && (
                          <span className="text-[9px] font-black uppercase text-indigo-700 bg-indigo-100/90 px-1.5 py-0.2 rounded-md">
                            Active Trend
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="badge-teal text-[10px] font-black px-2 py-0.5 rounded-full">
                          Cascade
                        </span>
                        <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center text-sm font-black shrink-0 group-hover:scale-110 transition-transform">
                          🩺
                        </div>
                      </div>
                    </div>
                    <p className="text-2xl sm:text-3xl font-black text-slate-900 tabular-num tracking-tight">{clinicalTotal.toLocaleString('en-IN')}</p>
                    <div className="mt-2 space-y-1">
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className="h-full bg-teal-600 rounded-full transition-all duration-700" 
                          style={{ width: `${Math.max(8, clinicalCoveragePct)}%` }}
                        ></div>
                      </div>
                      <p className="text-[11px] font-semibold text-slate-500 tabular-num truncate" title={`HIV/DM: ${hivDmCount} • DBT: ${dbtCount} • Contacts: ${contactsCount}`}>
                        HIV/DM: <strong className="text-slate-700 font-bold">{hivDmCount}</strong> • DBT: <strong className="text-slate-700 font-bold">{dbtCount}</strong> • Tracing: <strong className="text-slate-700 font-bold">{contactsCount}</strong>
                      </p>
                    </div>
                  </div>

                  {/* CARD 4: Field Footprint & Travel */}
                  <div 
                    onClick={() => setActiveMetric('total_km')}
                    className={`glass-card p-4 sm:p-5 rounded-2xl border shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all group relative overflow-hidden cursor-pointer ${
                      activeMetric === 'total_km' 
                        ? 'bg-indigo-50/50 border-indigo-400 ring-2 ring-indigo-500/20' 
                        : 'bg-white/95 border-slate-200/90'
                    }`}
                    title="Click to view Field Travel KM trend below"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider">Field Travel</span>
                        {activeMetric === 'total_km' && (
                          <span className="text-[9px] font-black uppercase text-indigo-700 bg-indigo-100/90 px-1.5 py-0.2 rounded-md">
                            Active Trend
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="badge-amber text-[10px] font-black px-2 py-0.5 rounded-full">
                          {activeStaffCount} Staff
                        </span>
                        <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center text-sm font-black shrink-0 group-hover:scale-110 transition-transform">
                          🚗
                        </div>
                      </div>
                    </div>
                    <p className="text-2xl sm:text-3xl font-black text-slate-900 tabular-num tracking-tight">
                      {totalKm.toLocaleString('en-IN')} <span className="text-xs font-bold text-slate-400 tracking-normal">KM</span>
                    </p>
                    <div className="mt-2 space-y-1">
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className="h-full bg-amber-500 rounded-full transition-all duration-700" 
                          style={{ width: `${Math.min(100, Math.round((Number(avgKmPerStaff) / 500) * 100))}%` }}
                        ></div>
                      </div>
                      <p className="text-[11px] font-semibold text-slate-500 tabular-num truncate">
                        Average <strong className="text-slate-700 font-bold">{avgKmPerStaff} KM</strong> per active Field Officer
                      </p>
                    </div>
                  </div>

                </div>
              );
            })()}

            {/* Secondary Metrics Grid */}
            <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xs border border-slate-200/80 p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3.5">
                <h3 className="text-slate-900 text-xs sm:text-sm font-bold flex items-center gap-2">
                  <span>⚡</span>
                  <span>Secondary Clinical &amp; Operational Indicators</span>
                </h3>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded-full">
                  12 Metrics
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-6 xl:grid-cols-12 gap-2.5">
                {[
                  { k: 'hiv_dm', l: 'HIV & DM', icon: '🩸' }, { k: 'dbt', l: 'DBT', icon: '💰' }, { k: 'sample_collection', l: 'Sample Col', icon: '🧪' },
                  { k: 'outcome_assigned', l: 'Outcomes', icon: '🎯' }, { k: 'home_visits', l: 'Home Visits', icon: '🏠' }, { k: 'contact_tracing', l: 'Contact Tr', icon: '👥' },
                  { k: 'follow_ups', l: 'Follow Ups', icon: '🔄' }, { k: 'face_to_face', l: 'F2F', icon: '🗣️' }, { k: 'documents', l: 'Docs', icon: '📁' },
                  { k: 'fdc_provided', l: 'FDC Prov', icon: '💊' }, { k: 'kit_consumption', l: 'Kits', icon: '📦' }, { k: 'overrides', l: 'Overrides', icon: '⚠️' }
                ].map(metric => (
                  <div key={metric.k} className="p-2.5 bg-slate-50/80 hover:bg-white hover:border-slate-300 border border-slate-200/70 rounded-xl transition-all shadow-2xs hover:shadow-xs group text-center">
                    <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1 leading-tight flex items-center justify-center gap-1">
                      <span className="text-[10px]">{metric.icon}</span>
                      <span className="truncate">{metric.l}</span>
                    </p>
                    <p className="text-base sm:text-lg font-black text-slate-800 tabular-num group-hover:text-indigo-600 transition-colors">{totals[metric.k]}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Visual Zone Divider: Operational Progression */}
            <div className="flex items-center gap-3 my-3 text-[11px] font-black uppercase tracking-wider text-slate-400">
              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
              <span>Operational Progression &amp; Broadcasts</span>
              <div className="h-px bg-slate-200/80 flex-1"></div>
            </div>

            {/* Daily Progression Trend — operational data first */}
            <div className="w-full bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-100 mb-6">
              <div>
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-3 pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">📈</span>
                      <h3 className="text-slate-800 font-black text-base sm:text-lg">
                        Daily Progression Trend (Day 1 - {dailyTrendStats.totalDays})
                      </h3>
                    </div>
                    <p className="text-slate-400 text-xs font-semibold mt-0.5">
                      {selectedDistrict !== 'All' 
                        ? `Day-by-day progression for ${selectedDistrict}` 
                        : (isSubAdmin 
                            ? `Day-by-day progression for ${(currentUser?.allowed_districts || []).join(', ')}` 
                            : 'Day-by-day statewide performance progression across Bihar')}
                    </p>
                  </div>

                  {/* Metric Switcher */}
                  <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 text-xs font-bold">
                    {[
                      { key: 'notifications', label: '🔔 Notif' },
                      { key: 'tests', label: '🔬 Tests' },
                      { key: 'total_km', label: '🚗 KM' },
                      { key: 'presumptive', label: '🩺 Presump' }
                    ].map(m => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setActiveMetric(m.key)}
                        className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          activeMetric === m.key
                            ? 'bg-indigo-600 text-white shadow-sm font-black'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Trend Badges */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className="text-xs font-bold px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Peak: {dailyTrendStats.peakDay.day !== '-' && dailyTrendStats.peakDay.value > 0 ? `Day ${Number(dailyTrendStats.peakDay.day)} (${dailyTrendStats.peakDay.value} ${activeMetric === 'total_km' ? 'KM' : 'IDs'})` : 'No Activity Yet'}
                  </span>
                  <span className="text-xs font-bold px-3 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    Daily Avg: {dailyTrendStats.avgDaily} / day
                  </span>
                  <span className="text-xs font-bold px-3 py-1 rounded-lg bg-slate-50 text-slate-700 border border-slate-200 ml-auto">
                    Total: {dailyTrendStats.totalVal} {activeMetric === 'total_km' ? 'KM' : ''}
                  </span>
                </div>
              </div>

              {/* AreaChart - Spacious h-72 sm:h-80 Container */}
              <div className="h-72 sm:h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyTrendStats.chartData} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="day" 
                      tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }} 
                      axisLine={{ stroke: '#e2e8f0' }} 
                      tickLine={false}
                      interval={0}
                    />
                    <YAxis 
                      tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }} 
                      axisLine={false} 
                      tickLine={false} 
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontWeight: 'bold' }}
                      labelFormatter={(day) => `Day ${day} (${month}-${String(day).padStart(2, '0')})`}
                      formatter={(val) => [val, activeMetric === 'total_km' ? 'KM Travelled' : activeMetric.toUpperCase()]}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#6366f1" 
                      strokeWidth={2.5} 
                      fillOpacity={1} 
                      fill="url(#trendGradient)" 
                      dot={{ r: 2.5, fill: '#6366f1' }}
                      activeDot={{ r: 5, fill: '#4338ca' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Bihar Statewide Top Performers Studio */}
            <div className="w-full mb-6">
              <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-5 sm:p-6 rounded-2xl shadow-md border border-indigo-900/60 relative overflow-hidden">
                {/* Decorative background glow */}
                <div className="absolute -top-12 -right-12 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-teal-500/15 rounded-full blur-3xl pointer-events-none" />

                <div>
                  {/* Studio Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-white/10">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl sm:text-3xl">🏆</span>
                      <div>
                        <h3 className="text-base sm:text-lg font-black tracking-tight text-white flex flex-wrap items-center gap-2">
                          Bihar Statewide Top Performers Studio
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 uppercase tracking-wider">
                            Statewide Broadcast
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                            adminTargetViewMode === 'frontline'
                              ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                              : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                          }`}>
                            {adminTargetViewMode === 'frontline' ? '🛵 Frontline Operational' : '🏛️ Official Quota'}
                          </span>
                        </h3>
                        <p className="text-xs text-slate-400 font-medium">
                          Statewide leaderboards recognizing Field Officers, Hub Agents, Lab Technicians, SCT Agents &amp; Districts
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleShareTopPerformersWhatsApp}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-sm flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                        title="Quick Share Top Performers to WhatsApp"
                      >
                        <span>📲</span>
                        <span>WhatsApp Share</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowTopPerformersModal(true)}
                        className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black text-xs shadow-sm flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                        title="Generate and Share High-Res Poster"
                      >
                        <span>🎨</span>
                        <span>Poster Studio</span>
                      </button>
                    </div>
                  </div>

                  {/* Controls bar: Timeframe Switchers & Date Range */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-white/5 p-2.5 rounded-xl border border-white/10 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-300">Period:</span>
                      <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10 text-xs font-bold">
                        <button
                          type="button"
                          onClick={() => {
                            setTopPerformersPeriod('weekly');
                            fetchTopPerformers('weekly');
                          }}
                          className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                            topPerformersPeriod === 'weekly'
                              ? 'bg-indigo-600 text-white shadow-xs font-black'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Weekly (7 Days)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setTopPerformersPeriod('fortnightly');
                            fetchTopPerformers('fortnightly');
                          }}
                          className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                            topPerformersPeriod === 'fortnightly'
                              ? 'bg-indigo-600 text-white shadow-xs font-black'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          15 Days
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setTopPerformersPeriod('monthly');
                            fetchTopPerformers('monthly');
                          }}
                          className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                            topPerformersPeriod === 'monthly'
                              ? 'bg-indigo-600 text-white shadow-xs font-black'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Monthly ({month})
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                      <span>📅 Active Range: <strong className="text-white font-mono">{topPerformersData?.start_date || `${month}-01`}</strong> to <strong className="text-white font-mono">{topPerformersData?.end_date || 'Today'}</strong></span>
                    </div>
                  </div>

                  {/* 5 Clinical Role Tabs */}
                  <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3 mb-4">
                    <button
                      type="button"
                      onClick={() => setTopPerformersTab('districts')}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
                        topPerformersTab === 'districts'
                          ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <span>🏛️</span>
                      <span>Top Districts (DC)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopPerformersTab('fo')}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
                        topPerformersTab === 'fo'
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <span>📋</span>
                      <span>Top FO &amp; Hub Agents</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopPerformersTab('tc')}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
                        topPerformersTab === 'tc'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <span>🏠</span>
                      <span>Top Treatment Coordinators (TC)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopPerformersTab('lt')}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
                        topPerformersTab === 'lt'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <span>🔬</span>
                      <span>Top Lab Technicians (LT)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopPerformersTab('sct')}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
                        topPerformersTab === 'sct'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <span>🧪</span>
                      <span>Top SCT Agents</span>
                    </button>
                  </div>

                  {/* Top Performers Showcase Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 min-h-[140px]">
                    {loadingTopPerformers ? (
                      <div className="col-span-full py-12 flex items-center justify-center text-xs text-slate-400 gap-2 bg-white/5 rounded-2xl border border-white/5">
                        <span className="animate-spin text-lg">🌀</span> Loading Champions...
                      </div>
                    ) : topPerformersTab === 'districts' ? (
                      (topPerformersData?.top_districts || []).length === 0 ? (
                        <div className="col-span-full py-10 text-center text-xs text-slate-400 bg-white/5 rounded-2xl border border-white/5">
                          No district records found for this period
                        </div>
                      ) : (
                        (topPerformersData?.top_districts || []).slice(0, 5).map((dist, idx) => (
                          <div 
                            key={idx}
                            className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between ${
                              idx === 0 
                                ? 'bg-amber-500/15 border-amber-500/35 text-amber-200 shadow-sm' 
                                : idx === 1 
                                ? 'bg-slate-300/10 border-slate-300/25 text-slate-100' 
                                : idx === 2 
                                ? 'bg-amber-700/15 border-amber-700/25 text-amber-200' 
                                : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <span className="text-xl font-black">
                                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                                </span>
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                  dist.percentage >= 100 
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' 
                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                }`}>
                                  {dist.percentage}% Target
                                </span>
                              </div>
                              <div className="font-bold text-sm text-white truncate mb-1" title={dist.district}>
                                {dist.district}
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-xs pt-2 mt-auto border-t border-white/10 font-mono">
                              <span className="text-teal-300 font-black">{dist.notifications} notifs</span>
                              <span className="text-slate-400 text-[10px]">
                                {adminTargetViewMode === 'frontline' ? 'Frontline:' : 'Official:'} {dist.target || 0}
                              </span>
                            </div>
                          </div>
                        ))
                      )
                    ) : topPerformersTab === 'fo' ? (
                      (topPerformersData?.top_fo || topPerformersData?.top_staff || []).length === 0 ? (
                        <div className="col-span-full py-10 text-center text-xs text-slate-400 bg-white/5 rounded-2xl border border-white/5">
                          No Field Officer or Hub Agent records found for this period
                        </div>
                      ) : (
                        (topPerformersData?.top_fo || topPerformersData?.top_staff || []).slice(0, 5).map((staff, idx) => {
                          const isHub = staff.designation === 'Hub Agent' || String(staff.designation || '').toUpperCase().includes('HUB');
                          return (
                            <div 
                              key={idx}
                              className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between ${
                                idx === 0 
                                  ? 'bg-purple-500/15 border-purple-500/35 text-purple-200 shadow-sm' 
                                  : idx === 1 
                                  ? 'bg-slate-300/10 border-slate-300/25 text-slate-100' 
                                  : idx === 2 
                                  ? 'bg-amber-700/15 border-amber-700/25 text-amber-200' 
                                  : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                              }`}
                            >
                              <div>
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <span className="text-xl font-black">
                                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                                  </span>
                                  {isHub ? (
                                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30 uppercase tracking-wider">
                                      HUB AGENT
                                    </span>
                                  ) : (
                                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
                                      FO
                                    </span>
                                  )}
                                </div>
                                <div className="font-bold text-sm text-white truncate mb-0.5" title={staff.fo_name}>
                                  {staff.fo_name}
                                </div>
                                <div className="text-[10px] text-slate-400 truncate mb-1">
                                  📍 {staff.district}
                                </div>
                              </div>
                              <div className="flex items-center justify-between text-xs pt-2 mt-auto border-t border-white/10 font-mono">
                                <span className="text-purple-300 font-black">{staff.notifications ?? staff.metric_value ?? 0} notifs</span>
                                <span className="text-slate-400 text-[10px]">Rank #{idx + 1}</span>
                              </div>
                            </div>
                          );
                        })
                      )
                    ) : topPerformersTab === 'tc' ? (
                      (topPerformersData?.top_tc || []).length === 0 ? (
                        <div className="col-span-full py-10 text-center text-xs text-slate-400 bg-white/5 rounded-2xl border border-white/5">
                          No Treatment Coordinator records found for this period
                        </div>
                      ) : (
                        (topPerformersData?.top_tc || []).slice(0, 5).map((staff, idx) => (
                          <div 
                            key={idx}
                            className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between ${
                              idx === 0 
                                ? 'bg-amber-500/15 border-amber-500/35 text-amber-200 shadow-sm' 
                                : idx === 1 
                                ? 'bg-slate-300/10 border-slate-300/25 text-slate-100' 
                                : idx === 2 
                                ? 'bg-amber-700/15 border-amber-700/25 text-amber-200' 
                                : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <span className="text-xl font-black">
                                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                                </span>
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
                                  Treatment Coordinator
                                </span>
                              </div>
                              <div className="font-bold text-sm text-white truncate mb-0.5" title={staff.fo_name}>
                                {staff.fo_name}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate mb-1">
                                📍 {staff.district}
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-xs pt-2 mt-auto border-t border-white/10 font-mono">
                              <span className="text-amber-300 font-black">{staff.home_visits ?? staff.metric_value ?? 0} visits</span>
                              <span className="text-slate-400 text-[10px]">Rank #{idx + 1}</span>
                            </div>
                          </div>
                        ))
                      )
                    ) : topPerformersTab === 'lt' ? (
                      (topPerformersData?.top_lt || []).length === 0 ? (
                        <div className="col-span-full py-10 text-center text-xs text-slate-400 bg-white/5 rounded-2xl border border-white/5">
                          No Lab Technician records found for this period
                        </div>
                      ) : (
                        (topPerformersData?.top_lt || []).slice(0, 5).map((staff, idx) => (
                          <div 
                            key={idx}
                            className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between ${
                              idx === 0 
                                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-200 shadow-sm' 
                                : idx === 1 
                                ? 'bg-slate-300/10 border-slate-300/25 text-slate-100' 
                                : idx === 2 
                                ? 'bg-amber-700/15 border-amber-700/25 text-amber-200' 
                                : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <span className="text-xl font-black">
                                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                                </span>
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
                                  Lab Technician
                                </span>
                              </div>
                              <div className="font-bold text-sm text-white truncate mb-0.5" title={staff.fo_name}>
                                {staff.fo_name}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate mb-1">
                                📍 {staff.district}
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-xs pt-2 mt-auto border-t border-white/10 font-mono">
                              <span className="text-emerald-300 font-black">{staff.tests ?? staff.metric_value ?? 0} tests</span>
                              <span className="text-slate-400 text-[10px]">Rank #{idx + 1}</span>
                            </div>
                          </div>
                        ))
                      )
                    ) : (
                      (topPerformersData?.top_sct || []).length === 0 ? (
                        <div className="col-span-full py-10 text-center text-xs text-slate-400 bg-white/5 rounded-2xl border border-white/5">
                          No SCT Agent records found for this period
                        </div>
                      ) : (
                        (topPerformersData?.top_sct || []).slice(0, 5).map((staff, idx) => (
                          <div 
                            key={idx}
                            className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between ${
                              idx === 0 
                                ? 'bg-rose-500/15 border-rose-500/35 text-rose-200 shadow-sm' 
                                : idx === 1 
                                ? 'bg-slate-300/10 border-slate-300/25 text-slate-100' 
                                : idx === 2 
                                ? 'bg-amber-700/15 border-amber-700/25 text-amber-200' 
                                : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <span className="text-xl font-black">
                                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                                </span>
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase tracking-wider">
                                  SCT Agent
                                </span>
                              </div>
                              <div className="font-bold text-sm text-white truncate mb-0.5" title={staff.fo_name}>
                                {staff.fo_name}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate mb-1">
                                📍 {staff.district}
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-xs pt-2 mt-auto border-t border-white/10 font-mono">
                              <span className="text-rose-300 font-black">{staff.samples_collected ?? staff.metric_value ?? 0} collections</span>
                              <span className="text-slate-400 text-[10px]">Rank #{idx + 1}</span>
                            </div>
                          </div>
                        ))
                      )
                    )}
                  </div>
                </div>

                {/* Bottom Quick Share Trigger */}
                <div className="pt-3 mt-4 border-t border-white/10 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
                  <span>Statewide Bihar TB Elimination Mission • Doctors For You MIS</span>
                  <button 
                    type="button"
                    onClick={() => setShowTopPerformersModal(true)}
                    className="text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer text-xs"
                  >
                    Share Poster / Download Card →
                  </button>
                </div>
              </div>
            </div>
              <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-5 sm:p-6 rounded-2xl shadow-md border border-indigo-900/60 relative overflow-hidden">
                {/* Decorative background glow */}
                <div className="absolute -top-12 -right-12 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-teal-500/15 rounded-full blur-3xl pointer-events-none" />

                <div>
                  {/* Studio Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-white/10">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl sm:text-3xl">🏆</span>
                      <div>
                        <h3 className="text-base sm:text-lg font-black tracking-tight text-white flex flex-wrap items-center gap-2">
                          Bihar Statewide Top Performers Studio
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 uppercase tracking-wider">
                            Statewide Broadcast
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                            adminTargetViewMode === 'frontline'
                              ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                              : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                          }`}>
                            {adminTargetViewMode === 'frontline' ? '🛵 Frontline Operational' : '🏛️ Official Quota'}
                          </span>
                        </h3>
                        <p className="text-xs text-slate-400 font-medium">
                          Statewide leaderboards recognizing Field Officers, Hub Agents, Lab Technicians, SCT Agents &amp; Districts
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleShareTopPerformersWhatsApp}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-sm flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                        title="Quick Share Top Performers to WhatsApp"
                      >
                        <span>📲</span>
                        <span>WhatsApp Share</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowTopPerformersModal(true)}
                        className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black text-xs shadow-sm flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                        title="Generate and Share High-Res Poster"
                      >
                        <span>🎨</span>
                        <span>Poster Studio</span>
                      </button>
                    </div>
                  </div>

                  {/* Controls bar: Timeframe Switchers & Date Range */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-white/5 p-2.5 rounded-xl border border-white/10 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-300">Period:</span>
                      <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10 text-xs font-bold">
                        <button
                          type="button"
                          onClick={() => {
                            setTopPerformersPeriod('weekly');
                            fetchTopPerformers('weekly');
                          }}
                          className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                            topPerformersPeriod === 'weekly'
                              ? 'bg-indigo-600 text-white shadow-xs font-black'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Weekly (7 Days)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setTopPerformersPeriod('fortnightly');
                            fetchTopPerformers('fortnightly');
                          }}
                          className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                            topPerformersPeriod === 'fortnightly'
                              ? 'bg-indigo-600 text-white shadow-xs font-black'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          15 Days
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setTopPerformersPeriod('monthly');
                            fetchTopPerformers('monthly');
                          }}
                          className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                            topPerformersPeriod === 'monthly'
                              ? 'bg-indigo-600 text-white shadow-xs font-black'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Monthly ({month})
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                      <span>📅 Active Range: <strong className="text-white font-mono">{topPerformersData?.start_date || `${month}-01`}</strong> to <strong className="text-white font-mono">{topPerformersData?.end_date || 'Today'}</strong></span>
                    </div>
                  </div>

                  {/* 5 Clinical Role Tabs */}
                  <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3 mb-4">
                    <button
                      type="button"
                      onClick={() => setTopPerformersTab('districts')}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
                        topPerformersTab === 'districts'
                          ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <span>🏛️</span>
                      <span>Top Districts (DC)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopPerformersTab('fo')}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
                        topPerformersTab === 'fo'
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <span>📋</span>
                      <span>Top FO &amp; Hub Agents</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopPerformersTab('tc')}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
                        topPerformersTab === 'tc'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <span>🏠</span>
                      <span>Top Treatment Coordinators (TC)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopPerformersTab('lt')}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
                        topPerformersTab === 'lt'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <span>🔬</span>
                      <span>Top Lab Technicians (LT)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopPerformersTab('sct')}
                      className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
                        topPerformersTab === 'sct'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <span>🧪</span>
                      <span>Top SCT Agents</span>
                    </button>
                  </div>

                  {/* Top Performers Showcase Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 min-h-[140px]">
                    {loadingTopPerformers ? (
                      <div className="col-span-full py-12 flex items-center justify-center text-xs text-slate-400 gap-2 bg-white/5 rounded-2xl border border-white/5">
                        <span className="animate-spin text-lg">🌀</span> Loading Champions...
                      </div>
                    ) : topPerformersTab === 'districts' ? (
                      (topPerformersData?.top_districts || []).length === 0 ? (
                        <div className="col-span-full py-10 text-center text-xs text-slate-400 bg-white/5 rounded-2xl border border-white/5">
                          No district records found for this period
                        </div>
                      ) : (
                        (topPerformersData?.top_districts || []).slice(0, 5).map((dist, idx) => (
                          <div 
                            key={idx}
                            className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between ${
                              idx === 0 
                                ? 'bg-amber-500/15 border-amber-500/35 text-amber-200 shadow-sm' 
                                : idx === 1 
                                ? 'bg-slate-300/10 border-slate-300/25 text-slate-100' 
                                : idx === 2 
                                ? 'bg-amber-700/15 border-amber-700/25 text-amber-200' 
                                : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <span className="text-xl font-black">
                                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                                </span>
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                  dist.percentage >= 100 
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' 
                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                }`}>
                                  {dist.percentage}% Target
                                </span>
                              </div>
                              <div className="font-bold text-sm text-white truncate mb-1" title={dist.district}>
                                {dist.district}
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-xs pt-2 mt-auto border-t border-white/10 font-mono">
                              <span className="text-teal-300 font-black">{dist.notifications} notifs</span>
                              <span className="text-slate-400 text-[10px]">
                                {adminTargetViewMode === 'frontline' ? 'Frontline:' : 'Official:'} {dist.target || 0}
                              </span>
                            </div>
                          </div>
                        ))
                      )
                    ) : topPerformersTab === 'fo' ? (
                      (topPerformersData?.top_fo || topPerformersData?.top_staff || []).length === 0 ? (
                        <div className="col-span-full py-10 text-center text-xs text-slate-400 bg-white/5 rounded-2xl border border-white/5">
                          No Field Officer or Hub Agent records found for this period
                        </div>
                      ) : (
                        (topPerformersData?.top_fo || topPerformersData?.top_staff || []).slice(0, 5).map((staff, idx) => {
                          const isHub = staff.designation === 'Hub Agent' || String(staff.designation || '').toUpperCase().includes('HUB');
                          return (
                            <div 
                              key={idx}
                              className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between ${
                                idx === 0 
                                  ? 'bg-purple-500/15 border-purple-500/35 text-purple-200 shadow-sm' 
                                  : idx === 1 
                                  ? 'bg-slate-300/10 border-slate-300/25 text-slate-100' 
                                  : idx === 2 
                                  ? 'bg-amber-700/15 border-amber-700/25 text-amber-200' 
                                  : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                              }`}
                            >
                              <div>
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <span className="text-xl font-black">
                                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                                  </span>
                                  {isHub ? (
                                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30 uppercase tracking-wider">
                                      HUB AGENT
                                    </span>
                                  ) : (
                                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
                                      FO
                                    </span>
                                  )}
                                </div>
                                <div className="font-bold text-sm text-white truncate mb-0.5" title={staff.fo_name}>
                                  {staff.fo_name}
                                </div>
                                <div className="text-[10px] text-slate-400 truncate mb-1">
                                  📍 {staff.district}
                                </div>
                              </div>
                              <div className="flex items-center justify-between text-xs pt-2 mt-auto border-t border-white/10 font-mono">
                                <span className="text-purple-300 font-black">{staff.notifications ?? staff.metric_value ?? 0} notifs</span>
                                <span className="text-slate-400 text-[10px]">Rank #{idx + 1}</span>
                              </div>
                            </div>
                          );
                        })
                      )
                    ) : topPerformersTab === 'tc' ? (
                      (topPerformersData?.top_tc || []).length === 0 ? (
                        <div className="col-span-full py-10 text-center text-xs text-slate-400 bg-white/5 rounded-2xl border border-white/5">
                          No Treatment Coordinator records found for this period
                        </div>
                      ) : (
                        (topPerformersData?.top_tc || []).slice(0, 5).map((staff, idx) => (
                          <div 
                            key={idx}
                            className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between ${
                              idx === 0 
                                ? 'bg-amber-500/15 border-amber-500/35 text-amber-200 shadow-sm' 
                                : idx === 1 
                                ? 'bg-slate-300/10 border-slate-300/25 text-slate-100' 
                                : idx === 2 
                                ? 'bg-amber-700/15 border-amber-700/25 text-amber-200' 
                                : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <span className="text-xl font-black">
                                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                                </span>
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
                                  Treatment Coordinator
                                </span>
                              </div>
                              <div className="font-bold text-sm text-white truncate mb-0.5" title={staff.fo_name}>
                                {staff.fo_name}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate mb-1">
                                📍 {staff.district}
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-xs pt-2 mt-auto border-t border-white/10 font-mono">
                              <span className="text-amber-300 font-black">{staff.home_visits ?? staff.metric_value ?? 0} visits</span>
                              <span className="text-slate-400 text-[10px]">Rank #{idx + 1}</span>
                            </div>
                          </div>
                        ))
                      )
                    ) : topPerformersTab === 'lt' ? (
                      (topPerformersData?.top_lt || []).length === 0 ? (
                        <div className="col-span-full py-10 text-center text-xs text-slate-400 bg-white/5 rounded-2xl border border-white/5">
                          No Lab Technician records found for this period
                        </div>
                      ) : (
                        (topPerformersData?.top_lt || []).slice(0, 5).map((staff, idx) => (
                          <div 
                            key={idx}
                            className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between ${
                              idx === 0 
                                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-200 shadow-sm' 
                                : idx === 1 
                                ? 'bg-slate-300/10 border-slate-300/25 text-slate-100' 
                                : idx === 2 
                                ? 'bg-amber-700/15 border-amber-700/25 text-amber-200' 
                                : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <span className="text-xl font-black">
                                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                                </span>
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
                                  Lab Technician
                                </span>
                              </div>
                              <div className="font-bold text-sm text-white truncate mb-0.5" title={staff.fo_name}>
                                {staff.fo_name}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate mb-1">
                                📍 {staff.district}
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-xs pt-2 mt-auto border-t border-white/10 font-mono">
                              <span className="text-emerald-300 font-black">{staff.tests ?? staff.metric_value ?? 0} tests</span>
                              <span className="text-slate-400 text-[10px]">Rank #{idx + 1}</span>
                            </div>
                          </div>
                        ))
                      )
                    ) : (
                      (topPerformersData?.top_sct || []).length === 0 ? (
                        <div className="col-span-full py-10 text-center text-xs text-slate-400 bg-white/5 rounded-2xl border border-white/5">
                          No SCT Agent records found for this period
                        </div>
                      ) : (
                        (topPerformersData?.top_sct || []).slice(0, 5).map((staff, idx) => (
                          <div 
                            key={idx}
                            className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between ${
                              idx === 0 
                                ? 'bg-rose-500/15 border-rose-500/35 text-rose-200 shadow-sm' 
                                : idx === 1 
                                ? 'bg-slate-300/10 border-slate-300/25 text-slate-100' 
                                : idx === 2 
                                ? 'bg-amber-700/15 border-amber-700/25 text-amber-200' 
                                : 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <span className="text-xl font-black">
                                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                                </span>
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase tracking-wider">
                                  SCT Agent
                                </span>
                              </div>
                              <div className="font-bold text-sm text-white truncate mb-0.5" title={staff.fo_name}>
                                {staff.fo_name}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate mb-1">
                                📍 {staff.district}
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-xs pt-2 mt-auto border-t border-white/10 font-mono">
                              <span className="text-rose-300 font-black">{staff.samples_collected ?? staff.metric_value ?? 0} collections</span>
                              <span className="text-slate-400 text-[10px]">Rank #{idx + 1}</span>
                            </div>
                          </div>
                        ))
                      )
                    )}
                  </div>
                </div>

                {/* Bottom Quick Share Trigger */}
                <div className="pt-3 mt-4 border-t border-white/10 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
                  <span>Statewide Bihar TB Elimination Mission • Doctors For You MIS</span>
                  <button 
                    type="button"
                    onClick={() => setShowTopPerformersModal(true)}
                    className="text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer text-xs"
                  >
                    Share Poster / Download Card →
                  </button>
                </div>
            </div>

            {/* Visual Zone Divider: Target Achievement & Clinical Benchmarks */}
            <div className="flex items-center gap-3 my-4 text-[11px] font-black uppercase tracking-wider text-slate-400">
              <span className="w-2 h-2 rounded-full bg-teal-500"></span>
              <span>Target Achievement &amp; Clinical Benchmarks</span>
              <div className="h-px bg-slate-200/80 flex-1"></div>
            </div>

            {/* Unified Section: Target vs Achievement & Performance */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-5 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🏆</span>
                    <h3 className="text-slate-800 font-black text-lg">
                      Target vs Achievement &amp; Performance
                    </h3>
                    {selectedDistrict !== 'All' && (
                      <button
                        type="button"
                        onClick={() => setSelectedDistrict('All')}
                        className="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
                        title="Return to Statewide View"
                      >
                        ← View All Districts
                      </button>
                    )}
                  </div>
                  <p className="text-slate-400 text-xs font-semibold mt-0.5">
                    {selectedDistrict === 'All'
                      ? (isSubAdmin 
                          ? `Performance monitoring for ${(currentUser?.allowed_districts || []).join(', ')} • Ranked by achievement` 
                          : `Statewide monitoring across 22 Bihar Districts • Ranked by achievement • Click any district to inspect field officers`)
                      : `Field Officer performance breakdown for ${selectedDistrict} • Click any officer to inspect details`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Metric Filter (when in chart view) */}
                  {performanceViewMode === 'chart' && (
                    <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => setPerformanceMetricFilter('notif_only')}
                        className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                          performanceMetricFilter === 'notif_only'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <span>🔔</span> Notifications Only
                      </button>
                      <button
                        type="button"
                        onClick={() => setPerformanceMetricFilter('target_vs_notif')}
                        className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                          performanceMetricFilter === 'target_vs_notif'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <span>🎯</span> Target vs Achieved
                      </button>
                      <button
                        type="button"
                        onClick={() => setPerformanceMetricFilter('pct_achieve')}
                        className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                          performanceMetricFilter === 'pct_achieve'
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <span>📈</span> % Achievement
                      </button>
                    </div>
                  )}

                  {/* View Switcher Toggle */}
                  <div className="flex items-center gap-1 bg-indigo-50/70 p-1 rounded-xl border border-indigo-200/60 text-xs font-black">
                    <button
                      type="button"
                      onClick={() => setPerformanceViewMode('chart')}
                      className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                        performanceViewMode === 'chart'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-indigo-700 hover:bg-white/80'
                      }`}
                    >
                      <span>📊</span> Bar Chart
                    </button>
                    <button
                      type="button"
                      onClick={() => setPerformanceViewMode('cards')}
                      className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                        performanceViewMode === 'cards'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-indigo-700 hover:bg-white/80'
                      }`}
                    >
                      <span>🗂️</span> Grid Cards
                    </button>
                  </div>
                </div>
              </div>

              {/* Render View 1: Bar Chart */}
              {performanceViewMode === 'chart' && (
                <div>
                  {(!performanceData || performanceData.length === 0) ? (
                    <div className="py-16 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                      <div className="text-3xl mb-2">📊</div>
                      <h4 className="text-sm font-bold text-slate-700">No Target or Performance Data Available</h4>
                      <p className="text-xs text-slate-400 font-medium mt-1">There are no records matching the selected district or officer filter for this operational period.</p>
                    </div>
                  ) : (
                    <div style={{ height: `${performanceChartHeight}px` }} className="w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          layout="vertical"
                          data={performanceData}
                          margin={{ top: 5, right: 60, left: 15, bottom: 5 }}
                        >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                        <XAxis 
                          type="number" 
                          tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }} 
                          axisLine={{ stroke: '#cbd5e1' }}
                          tickLine={false} 
                        />
                        <YAxis 
                          type="category" 
                          dataKey="name" 
                          width={130} 
                          tick={{ fill: '#1e293b', fontSize: 12, fontWeight: 700 }} 
                          axisLine={false} 
                          tickLine={false} 
                        />
                        <Tooltip 
                          cursor={{ fill: '#f8fafc' }} 
                          contentStyle={{ 
                            borderRadius: '12px', 
                            border: 'none', 
                            boxShadow: '0 4px 20px -2px rgba(0,0,0,0.1)', 
                            fontWeight: 'bold' 
                          }} 
                        />
                        <Legend wrapperStyle={{ fontWeight: 700, fontSize: '12px', color: '#64748b', paddingTop: '8px' }} />

                        {performanceMetricFilter === 'notif_only' && (
                          <Bar 
                            dataKey="notifications" 
                            name="TB Notifications" 
                            fill="#10b981" 
                            radius={[0, 6, 6, 0]}
                            onClick={(entry) => {
                              if (entry?.type === 'district' && entry?.name) {
                                setSelectedDistrict(entry.name);
                              } else if (entry?.type === 'officer' && entry?.name) {
                                setInspectingFO({ fo_name: entry.name, district: selectedDistrict });
                              }
                            }}
                            className="cursor-pointer hover:opacity-90"
                          >
                            <LabelList 
                              dataKey="notifications" 
                              position="right" 
                              style={{ fill: '#059669', fontWeight: 800, fontSize: 11 }} 
                              formatter={(v) => (v > 0 ? `${v}` : '')}
                            />
                          </Bar>
                        )}

                        {performanceMetricFilter === 'target_vs_notif' && (
                          <>
                            <Bar 
                              dataKey="notifications" 
                              name="Achieved Notifications" 
                              fill="#10b981" 
                              radius={[0, 6, 6, 0]}
                              onClick={(entry) => {
                                if (entry?.type === 'district' && entry?.name) {
                                setSelectedDistrict(entry.name);
                              } else if (entry?.type === 'officer' && entry?.name) {
                                setInspectingFO({ fo_name: entry.name, district: selectedDistrict });
                              }
                            }}
                            className="cursor-pointer"
                          >
                            <LabelList 
                              dataKey="notifications" 
                              position="right" 
                              style={{ fill: '#059669', fontWeight: 800, fontSize: 11 }} 
                              formatter={(v) => (v > 0 ? `${v}` : '')}
                            />
                          </Bar>
                          <Bar 
                            dataKey="target" 
                            name="Monthly Target" 
                            fill="#cbd5e1" 
                            radius={[0, 6, 6, 0]} 
                          >
                            <LabelList 
                              dataKey="target" 
                              position="right" 
                              style={{ fill: '#334155', fontWeight: 800, fontSize: 11 }} 
                              formatter={(v) => (v > 0 ? `${v}` : '')}
                            />
                          </Bar>
                        </>
                      )}

                      {performanceMetricFilter === 'pct_achieve' && (
                        <Bar 
                          dataKey="percentage" 
                          name="Target Completion (%)" 
                          fill="#6366f1" 
                          radius={[0, 6, 6, 0]}
                          onClick={(entry) => {
                            if (entry?.type === 'district' && entry?.name) {
                              setSelectedDistrict(entry.name);
                            } else if (entry?.type === 'officer' && entry?.name) {
                              setInspectingFO({ fo_name: entry.name, district: selectedDistrict });
                            }
                          }}
                          className="cursor-pointer"
                        >
                          <LabelList 
                            dataKey="percentage" 
                            position="right" 
                            style={{ fill: '#4f46e5', fontWeight: 800, fontSize: 11 }} 
                            formatter={(v) => `${v}%`}
                          />
                        </Bar>
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

              {/* Render View 2: Grid Cards */}
              {performanceViewMode === 'cards' && (
                (!performanceData || performanceData.length === 0) ? (
                  <div className="py-16 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                    <div className="text-3xl mb-2">🗂️</div>
                    <h4 className="text-sm font-bold text-slate-700">No Performance Cards to Display</h4>
                    <p className="text-xs text-slate-400 font-medium mt-1">There are no records matching the selected scope for this operational period.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider justify-end">
                  <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg border border-emerald-100">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span> &gt;=100% Target Complete
                  </span>
                  <span className="flex items-center gap-1 bg-amber-50 text-amber-700 px-2.5 py-1 rounded-lg border border-amber-100">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span> 50-99% In Progress
                  </span>
                  <span className="flex items-center gap-1 bg-red-50 text-red-700 px-2.5 py-1 rounded-lg border border-red-100">
                    <span className="w-2 h-2 rounded-full bg-red-500"></span> &lt;50% Lagging
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {performanceData.map((row, idx) => {
                    const notifCount = row.notifications || 0;
                    const targetNum = row.target || 0;
                    const pct = row.percentage || 0;

                    let statusColor = "text-red-600 bg-red-50 border-red-200";
                    let barColor = "bg-red-500";
                    let statusText = "Lagging";

                    if (pct >= 100) {
                      statusColor = "text-emerald-700 bg-emerald-50 border-emerald-200";
                      barColor = "bg-emerald-500";
                      statusText = "Completed";
                    } else if (pct >= 50) {
                      statusColor = "text-amber-700 bg-amber-50 border-amber-200";
                      barColor = "bg-amber-400";
                      statusText = "In Progress";
                    }

                    return (
                      <div key={idx} className="bg-slate-50/70 p-4 rounded-xl border border-slate-100 hover:border-slate-200 transition-all">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 
                              onClick={() => {
                                if (row.type === 'district') {
                                  setSelectedDistrict(row.name);
                                } else {
                                  setInspectingFO({ fo_name: row.name, district: selectedDistrict });
                                }
                              }}
                              className="text-sm font-black text-slate-800 truncate max-w-[180px] hover:text-indigo-600 hover:underline cursor-pointer"
                              title={row.type === 'district' ? "Click to filter to this district" : "Click to inspect officer"}
                            >
                              {row.name}
                            </h4>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              {notifCount} Notif / {targetNum} Target
                            </p>
                          </div>
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusColor}`}>
                            {statusText} ({pct}%)
                          </span>
                        </div>

                        <div className="w-full bg-slate-200/80 rounded-full h-2.5 overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}
          </div>

                        {/* Target Pacing Forecaster & District Benchmarking */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Target Pacing Calculator */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-slate-800 font-black text-base flex items-center gap-2">
                      <span>⚡</span> Target Pacing &amp; Forecaster
                    </h3>
                    <p className="text-slate-400 text-xs font-semibold">Run-rate needed for 100% monthly achievement</p>
                  </div>
                  <span className={`text-[11px] font-black px-2.5 py-1 rounded-xl border shrink-0 ${
                    adminTargetViewMode === 'frontline'
                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                      : 'bg-indigo-50 text-indigo-700 border-indigo-100'
                  }`}>
                    {adminTargetViewMode === 'frontline' ? '🛵 Frontline: ' : '🏛️ Official: '}
                    {selectedDistrict !== 'All' ? selectedDistrict : (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All') ? currentUser.allowed_districts.join(', ') : 'Statewide')}
                  </span>
                </div>

                <div className="space-y-3">
                  {(() => {
                    const { totalWorkingDays, elapsedWorkingDays, remainingWorkingDays, isCurrentMonth, isPastMonth } = workingDaysInfo;

                    let frontlineStretchTarget = 0;
                    if (selectedDistrict !== 'All') {
                      frontlineStretchTarget = targetsData.filter(t => canonicalizeDistrict(t.district) === canonicalizeDistrict(selectedDistrict)).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
                    } else if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
                      const allowedCanon = currentUser.allowed_districts.map(canonicalizeDistrict);
                      frontlineStretchTarget = targetsData.filter(t => allowedCanon.includes(canonicalizeDistrict(t.district))).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
                    } else {
                      frontlineStretchTarget = targetsData.reduce((sum, t) => sum + (Number(t.target) || 0), 0);
                    }

                    let effectiveDistrictTarget = 0;
                    if (selectedDistrict !== 'All') {
                      const cDist = canonicalizeDistrict(selectedDistrict);
                      const offTgt = (officialTargetsByDistrict && officialTargetsByDistrict[cDist]) || 0;
                      effectiveDistrictTarget = offTgt > 0 ? offTgt : frontlineStretchTarget;
                    } else if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
                      const permitted = (currentUser.allowed_districts || []).map(canonicalizeDistrict);
                      permitted.forEach(d => {
                        const offTgt = (officialTargetsByDistrict && officialTargetsByDistrict[d]) || 0;
                        if (offTgt > 0) {
                          effectiveDistrictTarget += offTgt;
                        } else {
                          const staffSum = targetsData.filter(t => canonicalizeDistrict(t.district) === d).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
                          effectiveDistrictTarget += staffSum;
                        }
                      });
                    } else {
                      const allDists = (districts || []).filter(d => d !== 'All').map(canonicalizeDistrict);
                      allDists.forEach(d => {
                        const offTgt = (officialTargetsByDistrict && officialTargetsByDistrict[d]) || 0;
                        if (offTgt > 0) {
                          effectiveDistrictTarget += offTgt;
                        } else {
                          const staffSum = targetsData.filter(t => canonicalizeDistrict(t.district) === d).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
                          effectiveDistrictTarget += staffSum;
                        }
                      });
                      if (effectiveDistrictTarget <= 0) {
                        effectiveDistrictTarget = frontlineStretchTarget;
                      }
                    }

                    const scopedTarget = (adminTargetViewMode === 'frontline') ? frontlineStretchTarget : effectiveDistrictTarget;
                    const totalScopeNotif = totals.notifications || 0;
                    const pendingScopeNotif = Math.max(0, scopedTarget - totalScopeNotif);

                    let currentDailyRate = '0.0';
                    let requiredDailyRate = '0.0';
                    let projectedTotal = totalScopeNotif;
                    let projectedPct = scopedTarget > 0 ? Math.round((totalScopeNotif / scopedTarget) * 100) : 100;
                    let daysRemainingDisplay = 0;

                    if (isPastMonth) {
                      // Mode 1: Past Month (Completed Month Final View)
                      currentDailyRate = totalWorkingDays > 0 ? (totalScopeNotif / totalWorkingDays).toFixed(1) : '0.0';
                      requiredDailyRate = '0.0';
                      projectedTotal = totalScopeNotif;
                      projectedPct = scopedTarget > 0 ? Math.round((totalScopeNotif / scopedTarget) * 100) : 100;
                      daysRemainingDisplay = 0;
                    } else if (isCurrentMonth) {
                      // Mode 2: Live In-Flight Pacing
                      currentDailyRate = elapsedWorkingDays > 0 ? (totalScopeNotif / elapsedWorkingDays).toFixed(1) : totalScopeNotif.toFixed(1);
                      requiredDailyRate = remainingWorkingDays > 0 ? (pendingScopeNotif / remainingWorkingDays).toFixed(1) : '0.0';
                      projectedTotal = Math.round(totalScopeNotif + (Number(currentDailyRate) * remainingWorkingDays));
                      projectedPct = scopedTarget > 0 ? Math.round((projectedTotal / scopedTarget) * 100) : 100;
                      daysRemainingDisplay = remainingWorkingDays;
                    } else {
                      // Mode 3: Future Month
                      currentDailyRate = '0.0';
                      requiredDailyRate = totalWorkingDays > 0 ? (scopedTarget / totalWorkingDays).toFixed(1) : '0.0';
                      projectedTotal = 0;
                      projectedPct = 0;
                      daysRemainingDisplay = totalWorkingDays;
                    }

                    const groundPct = frontlineStretchTarget > 0 ? Math.round((totalScopeNotif / frontlineStretchTarget) * 100) : 0;

                    return (
                      <>
                        <div className="bg-indigo-50/70 p-4 rounded-2xl border border-indigo-100 flex justify-between items-center">
                          <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400">
                              {isPastMonth ? 'Final Daily Velocity' : 'Current Daily Pace'}
                            </span>
                            <p className="text-xl font-black text-indigo-700">{currentDailyRate} <span className="text-xs font-bold text-indigo-500">Notif/Day</span></p>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                              {isPastMonth ? 'Pacing Status' : 'Required Pace'}
                            </span>
                            <p className="text-xl font-black text-slate-800">
                              {isPastMonth ? (projectedPct >= 100 ? '✅ Achieved' : '🏁 Completed') : `${requiredDailyRate} Notif/Day`}
                            </p>
                          </div>
                        </div>

                        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-xs">
                          <div className="flex justify-between font-bold">
                            <span className="text-slate-500">
                              {adminTargetViewMode === 'frontline' ? '🛵 Frontline Quota & Actual:' : '🏛️ Official Target & Actual:'}
                            </span>
                            <span className="font-black text-slate-800">{totalScopeNotif} / {scopedTarget} Notif</span>
                          </div>
                          {frontlineStretchTarget > 0 && frontlineStretchTarget !== effectiveDistrictTarget && (
                            <div className="flex justify-between font-bold text-[11px] bg-purple-50/80 px-2 py-1 rounded-lg border border-purple-100">
                              <span className="text-purple-700">
                                {adminTargetViewMode === 'frontline' ? '🏛️ Official State Quota:' : '🛵 Frontline Stretch Quota:'}
                              </span>
                              <span className="font-black text-purple-900">
                                {adminTargetViewMode === 'frontline' ? `${effectiveDistrictTarget} Notif` : `${frontlineStretchTarget} (Ground Pacing: ${groundPct}%)`}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between font-bold">
                            <span className="text-slate-500">{isPastMonth ? 'Final Achievement:' : 'Month-End Projection:'}</span>
                            <span className="font-black text-indigo-600">{projectedTotal} Notifications ({projectedPct}%)</span>
                          </div>
                          <div className="flex justify-between font-bold">
                            <span className="text-slate-500">Working Days Remaining:</span>
                            <span className="text-slate-700 font-mono font-bold">
                              {isPastMonth ? '0 Days (Month Closed)' : `${daysRemainingDisplay} Days (${totalWorkingDays} Total Working Days)`}
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden mt-1">
                            <div className="h-full bg-indigo-600 rounded-full transition-all duration-700" style={{ width: `${Math.min(100, projectedPct)}%` }}></div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* District Benchmarking Comparator (Super Admin Only) */}
              {isSuperAdmin && (
              <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-4">
                  <div>
                    <h3 className="text-slate-800 font-black text-base flex items-center gap-2">
                      <span>⚖️</span> District Benchmarking Comparator
                    </h3>
                    <p className="text-slate-400 text-xs font-semibold">Side-by-side performance &amp; percentage share</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={compareDistA} onChange={(e) => setCompareDistA(e.target.value)} className="bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold text-xs rounded-xl px-2.5 py-1.5 outline-none">
                      {districts.filter(d => d !== 'All').map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <span className="text-xs font-black text-slate-400">vs</span>
                    <select value={compareDistB} onChange={(e) => setCompareDistB(e.target.value)} className="bg-purple-50 border border-purple-200 text-purple-700 font-bold text-xs rounded-xl px-2.5 py-1.5 outline-none">
                      {districts.filter(d => d !== 'All').map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>

                {(() => {
                  const recA = rawRecords.filter(r => r.working_place === compareDistA);
                  const recB = rawRecords.filter(r => r.working_place === compareDistB);
                  
                  const targetA = targetsData.filter(t => t.district === compareDistA).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
                  const targetB = targetsData.filter(t => t.district === compareDistB).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
                  
                  const notifA = recA.reduce((sum, r) => sum + (r.notifications || 0), 0);
                  const notifB = recB.reduce((sum, r) => sum + (r.notifications || 0), 0);
                  const achievePctA = targetA > 0 ? Math.round((notifA / targetA) * 100) : 0;
                  const achievePctB = targetB > 0 ? Math.round((notifB / targetB) * 100) : 0;

                  const testsA = recA.reduce((sum, r) => sum + (r.tests || 0), 0);
                  const testsB = recB.reduce((sum, r) => sum + (r.tests || 0), 0);

                  const presumpA = recA.reduce((sum, r) => sum + (r.presumptive || 0), 0);
                  const presumpB = recB.reduce((sum, r) => sum + (r.presumptive || 0), 0);
                  const convA = presumpA > 0 ? Math.round((testsA / presumpA) * 100) : 0;
                  const convB = presumpB > 0 ? Math.round((testsB / presumpB) * 100) : 0;

                  const dbtA = recA.reduce((sum, r) => sum + (r.dbt || 0), 0);
                  const dbtB = recB.reduce((sum, r) => sum + (r.dbt || 0), 0);
                  const kmA = recA.reduce((sum, r) => sum + (r.total_km || 0), 0);
                  const kmB = recB.reduce((sum, r) => sum + (r.total_km || 0), 0);

                  const metrics = [
                    { label: "Target Achievement", aVal: `${achievePctA}%`, bVal: `${achievePctB}%`, aSub: `${notifA}/${targetA}`, bSub: `${notifB}/${targetB}`, rawA: achievePctA, rawB: achievePctB },
                    { label: "Testing Yield / Conv.", aVal: `${convA}%`, bVal: `${convB}%`, aSub: `${testsA} tests`, bSub: `${testsB} tests`, rawA: convA, rawB: convB },
                    { label: "Notifications Volume", aVal: notifA, bVal: notifB, aSub: "Total Notif", bSub: "Total Notif", rawA: notifA, rawB: notifB },
                    { label: "DBT Processed", aVal: dbtA, bVal: dbtB, aSub: "Bank Seeded", bSub: "Bank Seeded", rawA: dbtA, rawB: dbtB }
                  ];

                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-auto">
                      {metrics.map((m, idx) => {
                        const totalVal = (Number(m.rawA) || 0) + (Number(m.rawB) || 0);
                        const shareA = totalVal > 0 ? Math.round(((Number(m.rawA) || 0) / totalVal) * 100) : 50;
                        const shareB = 100 - shareA;
                        return (
                          <div key={idx} className="bg-slate-50/80 p-3 rounded-2xl border border-slate-100 text-center flex flex-col justify-between">
                            <span className="text-[10px] font-black uppercase text-slate-400 block mb-1.5">{m.label}</span>
                            
                            <div className="flex justify-between items-center text-xs font-black my-1">
                              <div className="text-left">
                                <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg block">{m.aVal}</span>
                                <span className="text-[9px] text-slate-400 font-bold block mt-0.5">{m.aSub}</span>
                              </div>
                              <span className="text-[10px] text-slate-300 font-bold px-1">vs</span>
                              <div className="text-right">
                                <span className="text-purple-600 bg-purple-50 px-2 py-0.5 rounded-lg block">{m.bVal}</span>
                                <span className="text-[9px] text-slate-400 font-bold block mt-0.5">{m.bSub}</span>
                              </div>
                            </div>

                            {/* Relative split bar */}
                            <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden flex mt-2">
                              <div className="bg-indigo-500 h-full" style={{ width: `${shareA}%` }} title={`${compareDistA}: ${shareA}%`}></div>
                              <div className="bg-purple-500 h-full" style={{ width: `${shareB}%` }} title={`${compareDistB}: ${shareB}%`}></div>
                            </div>
                            <div className="flex justify-between text-[8px] font-black text-slate-400 mt-1">
                              <span>{shareA}%</span>
                              <span>{shareB}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
              )}

            </div>

            {/* Visual Zone Divider: Granular Field Ledger */}
            <div className="flex items-center gap-3 my-4 text-[11px] font-black uppercase tracking-wider text-slate-400">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              <span>Granular Master Field Ledger</span>
              <div className="h-px bg-slate-200/80 flex-1"></div>
            </div>

            {/* Master Data Table */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200/90 overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-slate-200/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-gradient-to-r from-slate-50 via-indigo-50/20 to-slate-50/60">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <h3 className="text-slate-800 font-black text-sm sm:text-base flex items-center gap-2">
                      <span>📋</span>
                      <span>Detailed Master Table</span>
                      {selectedDistrict !== 'All' && (
                        <span className="text-xs font-bold text-indigo-700 bg-indigo-100/80 px-2 py-0.5 rounded-md border border-indigo-200">
                          {selectedDistrict}
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-slate-400 font-medium">Sorted by: <span className="font-bold text-indigo-600">{sortConfig.key} ({sortConfig.direction.toUpperCase()})</span> &bull; {displayedTableData.length}{displayedTableData.length !== tableData.length ? ` of ${tableData.length}` : ''} records</p>
                  </div>

                  {selectedDistrict !== 'All' && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDistrict('All');
                        setSelectedFO('All');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-xs transition-all active:scale-95 cursor-pointer"
                      title="Return to All Districts list"
                    >
                      <span>←</span> Back to All Districts
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Master Table In-Table Search Input */}
                  <div className="relative inline-flex items-center">
                    <input
                      type="text"
                      value={masterTableSearch}
                      onChange={(e) => setMasterTableSearch(e.target.value)}
                      placeholder={selectedDistrict === 'All' ? "Search district..." : "Search officer..."}
                      className="pl-7 pr-7 py-1 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium placeholder:text-slate-400 w-32 sm:w-44 transition-all shadow-2xs"
                    />
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">🔍</span>
                    {masterTableSearch && (
                      <button 
                        type="button" 
                        onClick={() => setMasterTableSearch('')} 
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-bold text-xs cursor-pointer"
                        title="Clear search"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {/* Cohort Switcher */}
                  <div className="inline-flex items-center bg-white p-1 rounded-xl border border-slate-200 shadow-2xs text-[11px] font-bold">
                    <span className="text-slate-400 text-[10px] font-black uppercase tracking-wider px-2 hidden md:inline">Cohort:</span>
                    <button
                      type="button"
                      onClick={() => setMasterTableCohortFilter('all')}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        masterTableCohortFilter === 'all'
                          ? 'bg-indigo-600 text-white shadow-2xs font-black'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Show all interventions conducted this month"
                    >
                      All (Total)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMasterTableCohortFilter('current_cohort')}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        masterTableCohortFilter === 'current_cohort'
                          ? 'bg-emerald-600 text-white shadow-2xs font-black'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Interventions conducted on patients notified in current month"
                    >
                      Current Month Cohort
                    </button>
                    <button
                      type="button"
                      onClick={() => setMasterTableCohortFilter('backlog')}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        masterTableCohortFilter === 'backlog'
                          ? 'bg-amber-600 text-white shadow-2xs font-black'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Interventions conducted on patients notified in previous months (backlog)"
                    >
                      Previous Month Backlog
                    </button>
                  </div>

                  {/* Extended Indicators Toggle */}
                  <button
                    type="button"
                    onClick={() => setShowExtendedColumns(prev => !prev)}
                    className={`px-3 py-1 rounded-xl text-[11px] font-bold border transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                      showExtendedColumns
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                    title={showExtendedColumns ? "Switch to Standard View (hides 7 specialized indicators)" : "Show 7 Extended Indicators (Diff TB, TPT, Adhar, Consent, etc.)"}
                  >
                    <span>{showExtendedColumns ? '👁️ Standard View' : '✨ Extended Indicators (7)'}</span>
                  </button>

                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-white px-3 py-1.5 rounded-full shadow-2xs border border-slate-200/80 hidden sm:inline-block">
                    Click column header to sort
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    {/* Tier 1: Category Group Bands */}
                    <tr>
                      <th 
                        rowSpan={2}
                        className="p-3 sticky left-0 z-20 bg-slate-100/95 backdrop-blur-md border-r border-b border-slate-300 shadow-[4px_0_12px_-2px_rgba(0,0,0,0.08)] text-slate-800 text-[11px] font-black uppercase tracking-wider align-bottom"
                      >
                        {selectedDistrict === 'All' ? 'District' : 'Officer Name'}
                      </th>
                      <th colSpan={2} className="th-band-primary py-2 px-3 text-center text-[10px] font-black uppercase tracking-wider border-r border-teal-200/80">
                        Target &amp; Volume
                      </th>
                      <th colSpan={5} className="th-band-clinical py-2 px-3 text-center text-[10px] font-black uppercase tracking-wider border-r border-indigo-200/80">
                        Core Clinical Cascade
                      </th>
                      <th colSpan={8} className="th-band-outreach py-2 px-3 text-center text-[10px] font-black uppercase tracking-wider border-r border-amber-200/80">
                        Visits &amp; Field Logistics
                      </th>
                      {showExtendedColumns && (
                        <th colSpan={7} className="th-band-special py-2 px-3 text-center text-[10px] font-black uppercase tracking-wider">
                          Special Indicators
                        </th>
                      )}
                    </tr>

                    {/* Tier 2: Column Headers */}
                    <tr className="bg-slate-50/90 text-slate-700 text-[10px] uppercase tracking-wider border-b border-slate-200">
                      <TH label="Target" sortKey="target" />
                      <TH label="Notif" sortKey="notifications" />
                      <TH label="Tests" sortKey="tests" />
                      <TH label="Presumptive" sortKey="presumptive" />
                      <TH label="Doc Visit" sortKey="doctor_visits" />
                      <TH label="HIV/DM" sortKey="hiv_dm" />
                      <TH label="DBT" sortKey="dbt" />
                      <TH label="Sample Col" sortKey="sample_collection" />
                      <TH label="Outcomes" sortKey="outcome_assigned" />
                      <TH label="Home Vis" sortKey="home_visits" />
                      <TH label="Contact Tr" sortKey="contact_tracing" />
                      <TH label="Follow Up" sortKey="follow_ups" />
                      <TH label="F2F" sortKey="face_to_face" />
                      <TH label="Docs" sortKey="documents" />
                      <TH label="FDC" sortKey="fdc_provided" />
                      {showExtendedColumns && (
                        <>
                          <TH label="Kits" sortKey="kit_consumption" />
                          <TH label="Diff TB" sortKey="differentiated_tb" />
                          <TH label="TPT Start" sortKey="tpt_treatment_start" />
                          <TH label="TPT Presumptive" sortKey="tpt_presumptive" />
                          <TH label="Adhar Auth" sortKey="adhar_face_auth" />
                          <TH label="Consent" sortKey="consent_with_id" />
                          <TH label="Override" sortKey="overrides" />
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {displayedTableData.length === 0 ? (
                      <tr>
                        <td colSpan={showExtendedColumns ? 23 : 16} className="text-center py-12 text-slate-400 text-xs font-bold bg-slate-50/50">
                          🔍 No matching records found for "{masterTableSearch}"
                        </td>
                      </tr>
                    ) : (
                      displayedTableData.map((row, idx) => (
                      <tr 
                        key={idx} 
                        className={`transition-colors border-b border-slate-100/90 last:border-none text-xs font-semibold text-slate-700 group ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                        } hover:bg-teal-50/60`}
                      >
                        <td 
                          onClick={() => {
                            if (selectedDistrict !== 'All') {
                              setInspectingFO({ fo_name: row.name, district: selectedDistrict });
                            } else {
                              setSelectedDistrict(row.name);
                            }
                          }}
                          className={`p-3 sticky left-0 z-10 backdrop-blur-xs shadow-[4px_0_12px_-2px_rgba(0,0,0,0.07)] border-r border-slate-300/80 text-teal-800 hover:text-teal-950 font-black cursor-pointer group-hover:bg-teal-50/80 transition-colors ${
                            idx % 2 === 0 ? 'bg-white/95' : 'bg-slate-50/95'
                          }`}
                          title={selectedDistrict !== 'All' ? "Click to inspect all IDs" : "Click to view this district"}
                        >
                          <span className="flex items-center gap-1.5">
                            <span>{row.name}</span>
                            <span className="text-teal-500 text-[10px]">{selectedDistrict !== 'All' ? '🔍' : '➔'}</span>
                          </span>
                        </td>
                        <td className="p-3 tabular-num font-bold text-slate-800">{row.target}</td>
                        <td className="p-3 tabular-num font-bold text-emerald-600">{row.notifications}</td>
                        <td className="p-3 tabular-num font-bold text-blue-600">
                          {masterTableCohortFilter === 'current_cohort'
                            ? (row.tests_cur > 0 ? row.tests_cur : <span className="text-slate-300 font-normal">—</span>)
                            : masterTableCohortFilter === 'backlog'
                            ? (row.tests_prev > 0 ? row.tests_prev : <span className="text-slate-300 font-normal">—</span>)
                            : (
                              <span>
                                {row.tests > 0 ? row.tests : <span className="text-slate-300 font-normal">—</span>}
                                {row.tests > 0 && (row.tests_cur > 0 || row.tests_prev > 0) && (
                                  <span className="text-[9px] font-medium text-slate-400 block -mt-0.5">
                                    C:{row.tests_cur} | P:{row.tests_prev}
                                  </span>
                                )}
                              </span>
                            )}
                        </td>
                        <td className="p-3 tabular-num font-bold text-amber-600">
                          {row.presumptive > 0 ? row.presumptive : <span className="text-slate-300 font-normal">—</span>}
                        </td>
                        <td className="p-3 tabular-num font-bold text-purple-600">
                          {row.doctor_visits > 0 ? row.doctor_visits : <span className="text-slate-300 font-normal">—</span>}
                        </td>
                        <td className="p-3 tabular-num font-semibold text-slate-700">
                          {masterTableCohortFilter === 'current_cohort'
                            ? (row.hiv_dm_cur > 0 ? row.hiv_dm_cur : <span className="text-slate-300 font-normal">—</span>)
                            : masterTableCohortFilter === 'backlog'
                            ? (row.hiv_dm_prev > 0 ? row.hiv_dm_prev : <span className="text-slate-300 font-normal">—</span>)
                            : (
                              <span>
                                {row.hiv_dm > 0 ? row.hiv_dm : <span className="text-slate-300 font-normal">—</span>}
                                {row.hiv_dm > 0 && (row.hiv_dm_cur > 0 || row.hiv_dm_prev > 0) && (
                                  <span className="text-[9px] font-medium text-slate-400 block -mt-0.5">
                                    C:{row.hiv_dm_cur} | P:{row.hiv_dm_prev}
                                  </span>
                                )}
                              </span>
                            )}
                        </td>
                        <td className="p-3 tabular-num font-semibold text-slate-700">
                          {masterTableCohortFilter === 'current_cohort'
                            ? (row.dbt_cur > 0 ? row.dbt_cur : <span className="text-slate-300 font-normal">—</span>)
                            : masterTableCohortFilter === 'backlog'
                            ? (row.dbt_prev > 0 ? row.dbt_prev : <span className="text-slate-300 font-normal">—</span>)
                            : (
                              <span>
                                {row.dbt > 0 ? row.dbt : <span className="text-slate-300 font-normal">—</span>}
                                {row.dbt > 0 && (row.dbt_cur > 0 || row.dbt_prev > 0) && (
                                  <span className="text-[9px] font-medium text-slate-400 block -mt-0.5">
                                    C:{row.dbt_cur} | P:{row.dbt_prev}
                                  </span>
                                )}
                              </span>
                            )}
                        </td>
                        <td className="p-3 tabular-num font-medium">
                          {row.sample_collection > 0 ? row.sample_collection : <span className="text-slate-300 font-normal">—</span>}
                        </td>
                        <td className="p-3 tabular-num font-medium">
                          {row.outcome_assigned > 0 ? row.outcome_assigned : <span className="text-slate-300 font-normal">—</span>}
                        </td>
                        <td className="p-3 tabular-num font-semibold text-slate-700">
                          {masterTableCohortFilter === 'current_cohort'
                            ? (row.home_visits_cur > 0 ? row.home_visits_cur : <span className="text-slate-300 font-normal">—</span>)
                            : masterTableCohortFilter === 'backlog'
                            ? (row.home_visits_prev > 0 ? row.home_visits_prev : <span className="text-slate-300 font-normal">—</span>)
                            : (
                              <span>
                                {row.home_visits > 0 ? row.home_visits : <span className="text-slate-300 font-normal">—</span>}
                                {row.home_visits > 0 && (row.home_visits_cur > 0 || row.home_visits_prev > 0) && (
                                  <span className="text-[9px] font-medium text-slate-400 block -mt-0.5">
                                    C:{row.home_visits_cur} | P:{row.home_visits_prev}
                                  </span>
                                )}
                              </span>
                            )}
                        </td>
                        <td className="p-3 tabular-num font-semibold text-slate-700">
                          {masterTableCohortFilter === 'current_cohort'
                            ? (row.contact_tracing_cur > 0 ? row.contact_tracing_cur : <span className="text-slate-300 font-normal">—</span>)
                            : masterTableCohortFilter === 'backlog'
                            ? (row.contact_tracing_prev > 0 ? row.contact_tracing_prev : <span className="text-slate-300 font-normal">—</span>)
                            : (
                              <span>
                                {row.contact_tracing > 0 ? row.contact_tracing : <span className="text-slate-300 font-normal">—</span>}
                                {row.contact_tracing > 0 && (row.contact_tracing_cur > 0 || row.contact_tracing_prev > 0) && (
                                  <span className="text-[9px] font-medium text-slate-400 block -mt-0.5">
                                    C:{row.contact_tracing_cur} | P:{row.contact_tracing_prev}
                                  </span>
                                )}
                              </span>
                            )}
                        </td>
                        <td className="p-3 tabular-num font-semibold text-slate-700">
                          {masterTableCohortFilter === 'current_cohort'
                            ? (row.follow_ups_cur > 0 ? row.follow_ups_cur : <span className="text-slate-300 font-normal">—</span>)
                            : masterTableCohortFilter === 'backlog'
                            ? (row.follow_ups_prev > 0 ? row.follow_ups_prev : <span className="text-slate-300 font-normal">—</span>)
                            : (
                              <span>
                                {row.follow_ups > 0 ? row.follow_ups : <span className="text-slate-300 font-normal">—</span>}
                                {row.follow_ups > 0 && (row.follow_ups_cur > 0 || row.follow_ups_prev > 0) && (
                                  <span className="text-[9px] font-medium text-slate-400 block -mt-0.5">
                                    C:{row.follow_ups_cur} | P:{row.follow_ups_prev}
                                  </span>
                                )}
                              </span>
                            )}
                        </td>
                        <td className="p-3 tabular-num font-medium">
                          {row.face_to_face > 0 ? row.face_to_face : <span className="text-slate-300 font-normal">—</span>}
                        </td>
                        <td className="p-3 tabular-num font-semibold text-slate-700">
                          {masterTableCohortFilter === 'current_cohort'
                            ? (row.documents_cur > 0 ? row.documents_cur : <span className="text-slate-300 font-normal">—</span>)
                            : masterTableCohortFilter === 'backlog'
                            ? (row.documents_prev > 0 ? row.documents_prev : <span className="text-slate-300 font-normal">—</span>)
                            : (
                              <span>
                                {row.documents > 0 ? row.documents : <span className="text-slate-300 font-normal">—</span>}
                                {row.documents > 0 && (row.documents_cur > 0 || row.documents_prev > 0) && (
                                  <span className="text-[9px] font-medium text-slate-400 block -mt-0.5">
                                    C:{row.documents_cur} | P:{row.documents_prev}
                                  </span>
                                )}
                              </span>
                            )}
                        </td>
                        <td className="p-3 tabular-num font-medium">
                          {row.fdc_provided > 0 ? row.fdc_provided : <span className="text-slate-300 font-normal">—</span>}
                        </td>
                        {showExtendedColumns && (
                          <>
                            <td className="p-3 tabular-num font-medium">
                              {row.kit_consumption > 0 ? row.kit_consumption : <span className="text-slate-300 font-normal">—</span>}
                            </td>
                            <td className="p-3 tabular-num font-bold text-pink-600">
                              {masterTableCohortFilter === 'current_cohort'
                                ? (row.differentiated_tb_cur > 0 ? row.differentiated_tb_cur : <span className="text-slate-300 font-normal">—</span>)
                                : masterTableCohortFilter === 'backlog'
                                ? (row.differentiated_tb_prev > 0 ? row.differentiated_tb_prev : <span className="text-slate-300 font-normal">—</span>)
                                : (
                                  <span>
                                    {row.differentiated_tb > 0 ? row.differentiated_tb : <span className="text-slate-300 font-normal">—</span>}
                                    {row.differentiated_tb > 0 && (row.differentiated_tb_cur > 0 || row.differentiated_tb_prev > 0) && (
                                      <span className="text-[9px] font-medium text-slate-400 block -mt-0.5">
                                        C:{row.differentiated_tb_cur} | P:{row.differentiated_tb_prev}
                                      </span>
                                    )}
                                  </span>
                                )}
                            </td>
                            <td className="p-3 tabular-num font-bold text-teal-600">
                              {row.tpt_treatment_start > 0 ? row.tpt_treatment_start : <span className="text-slate-300 font-normal">—</span>}
                            </td>
                            <td className="p-3 tabular-num font-bold text-cyan-600">
                              {row.tpt_presumptive > 0 ? row.tpt_presumptive : <span className="text-slate-300 font-normal">—</span>}
                            </td>
                            <td className="p-3 tabular-num font-bold text-orange-600">
                              {row.adhar_face_auth > 0 ? row.adhar_face_auth : <span className="text-slate-300 font-normal">—</span>}
                            </td>
                            <td className="p-3 tabular-num font-bold text-indigo-500">
                              {row.consent_with_id > 0 ? row.consent_with_id : <span className="text-slate-300 font-normal">—</span>}
                            </td>
                            <td className="p-3 tabular-num text-red-500 font-bold">
                              {row.overrides > 0 ? row.overrides : <span className="text-slate-300 font-normal">—</span>}
                            </td>
                          </>
                        )}
                      </tr>
                    )))}
                  </tbody>
                  <tfoot className="bg-slate-100/95 border-t-2 border-slate-300 text-xs font-black text-slate-900 sticky bottom-0 z-10 shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.06)]">
                    <tr>
                      <td className="p-3 sticky left-0 z-20 bg-slate-200/95 backdrop-blur-md border-r border-slate-300 shadow-[4px_0_12px_-2px_rgba(0,0,0,0.1)] text-slate-900">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="tracking-wide">TOTAL</span>
                          <span className="text-[10px] font-bold text-slate-600 bg-white/80 px-1.5 py-0.5 rounded border border-slate-300">
                            {selectedDistrict === 'All' ? `${tableData.length} Dists` : `${tableData.length} Staff`}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 tabular-num font-black text-slate-900">{tableTotals.target}</td>
                      <td className="p-3 tabular-num font-black text-emerald-700">{tableTotals.notifications}</td>
                      <td className="p-3 tabular-num font-black text-blue-700">
                        {masterTableCohortFilter === 'current_cohort'
                          ? tableTotals.tests_cur
                          : masterTableCohortFilter === 'backlog'
                          ? tableTotals.tests_prev
                          : (
                            <span>
                              {tableTotals.tests}
                              {(tableTotals.tests_cur > 0 || tableTotals.tests_prev > 0) && (
                                <span className="text-[9px] font-bold text-blue-900/60 block -mt-0.5">
                                  C:{tableTotals.tests_cur} | P:{tableTotals.tests_prev}
                                </span>
                              )}
                            </span>
                          )}
                      </td>
                      <td className="p-3 tabular-num font-black text-amber-700">{tableTotals.presumptive}</td>
                      <td className="p-3 tabular-num font-black text-purple-700">{tableTotals.doctor_visits}</td>
                      <td className="p-3 tabular-num font-black text-slate-800">
                        {masterTableCohortFilter === 'current_cohort'
                          ? tableTotals.hiv_dm_cur
                          : masterTableCohortFilter === 'backlog'
                          ? tableTotals.hiv_dm_prev
                          : (
                            <span>
                              {tableTotals.hiv_dm}
                              {(tableTotals.hiv_dm_cur > 0 || tableTotals.hiv_dm_prev > 0) && (
                                <span className="text-[9px] font-bold text-slate-500 block -mt-0.5">
                                  C:{tableTotals.hiv_dm_cur} | P:{tableTotals.hiv_dm_prev}
                                </span>
                              )}
                            </span>
                          )}
                      </td>
                      <td className="p-3 tabular-num font-black text-slate-800">
                        {masterTableCohortFilter === 'current_cohort'
                          ? tableTotals.dbt_cur
                          : masterTableCohortFilter === 'backlog'
                          ? tableTotals.dbt_prev
                          : (
                            <span>
                              {tableTotals.dbt}
                              {(tableTotals.dbt_cur > 0 || tableTotals.dbt_prev > 0) && (
                                <span className="text-[9px] font-bold text-slate-500 block -mt-0.5">
                                  C:{tableTotals.dbt_cur} | P:{tableTotals.dbt_prev}
                                </span>
                              )}
                            </span>
                          )}
                      </td>
                      <td className="p-3 tabular-num font-bold text-slate-800">{tableTotals.sample_collection}</td>
                      <td className="p-3 tabular-num font-bold text-slate-800">{tableTotals.outcome_assigned}</td>
                      <td className="p-3 tabular-num font-black text-slate-800">
                        {masterTableCohortFilter === 'current_cohort'
                          ? tableTotals.home_visits_cur
                          : masterTableCohortFilter === 'backlog'
                          ? tableTotals.home_visits_prev
                          : (
                            <span>
                              {tableTotals.home_visits}
                              {(tableTotals.home_visits_cur > 0 || tableTotals.home_visits_prev > 0) && (
                                <span className="text-[9px] font-bold text-slate-500 block -mt-0.5">
                                  C:{tableTotals.home_visits_cur} | P:{tableTotals.home_visits_prev}
                                </span>
                              )}
                            </span>
                          )}
                      </td>
                      <td className="p-3 tabular-num font-black text-slate-800">
                        {masterTableCohortFilter === 'current_cohort'
                          ? tableTotals.contact_tracing_cur
                          : masterTableCohortFilter === 'backlog'
                          ? tableTotals.contact_tracing_prev
                          : (
                            <span>
                              {tableTotals.contact_tracing}
                              {(tableTotals.contact_tracing_cur > 0 || tableTotals.contact_tracing_prev > 0) && (
                                <span className="text-[9px] font-bold text-slate-500 block -mt-0.5">
                                  C:{tableTotals.contact_tracing_cur} | P:{tableTotals.contact_tracing_prev}
                                </span>
                              )}
                            </span>
                          )}
                      </td>
                      <td className="p-3 tabular-num font-black text-slate-800">
                        {masterTableCohortFilter === 'current_cohort'
                          ? tableTotals.follow_ups_cur
                          : masterTableCohortFilter === 'backlog'
                          ? tableTotals.follow_ups_prev
                          : (
                            <span>
                              {tableTotals.follow_ups}
                              {(tableTotals.follow_ups_cur > 0 || tableTotals.follow_ups_prev > 0) && (
                                <span className="text-[9px] font-bold text-slate-500 block -mt-0.5">
                                  C:{tableTotals.follow_ups_cur} | P:{tableTotals.follow_ups_prev}
                                </span>
                              )}
                            </span>
                          )}
                      </td>
                      <td className="p-3 tabular-num font-bold text-slate-800">{tableTotals.face_to_face}</td>
                      <td className="p-3 tabular-num font-black text-slate-800">
                        {masterTableCohortFilter === 'current_cohort'
                          ? tableTotals.documents_cur
                          : masterTableCohortFilter === 'backlog'
                          ? tableTotals.documents_prev
                          : (
                            <span>
                              {tableTotals.documents}
                              {(tableTotals.documents_cur > 0 || tableTotals.documents_prev > 0) && (
                                <span className="text-[9px] font-bold text-slate-500 block -mt-0.5">
                                  C:{tableTotals.documents_cur} | P:{tableTotals.documents_prev}
                                </span>
                              )}
                            </span>
                          )}
                      </td>
                      <td className="p-3 tabular-num font-bold text-slate-800">{tableTotals.fdc_provided}</td>
                      {showExtendedColumns && (
                        <>
                          <td className="p-3 tabular-num font-bold text-slate-800">{tableTotals.kit_consumption}</td>
                          <td className="p-3 tabular-num font-black text-pink-700">
                            {masterTableCohortFilter === 'current_cohort'
                              ? tableTotals.differentiated_tb_cur
                              : masterTableCohortFilter === 'backlog'
                              ? tableTotals.differentiated_tb_prev
                              : (
                                <span>
                                  {tableTotals.differentiated_tb}
                                  {(tableTotals.differentiated_tb_cur > 0 || tableTotals.differentiated_tb_prev > 0) && (
                                    <span className="text-[9px] font-bold text-pink-900/60 block -mt-0.5">
                                      C:{tableTotals.differentiated_tb_cur} | P:{tableTotals.differentiated_tb_prev}
                                    </span>
                                  )}
                                </span>
                              )}
                          </td>
                          <td className="p-3 tabular-num font-black text-teal-700">{tableTotals.tpt_treatment_start}</td>
                          <td className="p-3 tabular-num font-black text-cyan-700">{tableTotals.tpt_presumptive}</td>
                          <td className="p-3 tabular-num font-black text-orange-700">{tableTotals.adhar_face_auth}</td>
                          <td className="p-3 tabular-num font-black text-indigo-700">{tableTotals.consent_with_id}</td>
                          <td className="p-3 tabular-num font-black text-red-600">{tableTotals.overrides}</td>
                        </>
                      )}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </>
  );
}
