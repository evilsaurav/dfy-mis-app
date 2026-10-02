import React from 'react';
import { canonicalizeDistrict, normalizeStaffKey } from '../../../utils/districtHelpers';

export default function AttendanceRadarModal({
  show,
  onClose,
  attendance,
  chronicDefaulters = [],
  attendanceDistrictFilter,
  setAttendanceDistrictFilter,
  attendanceTimeFilter,
  setAttendanceTimeFilter,
  attendanceSearchQuery,
  setAttendanceSearchQuery,
  inactiveStaffNamesSet = new Set(),
  attendanceDate,
  setAttendanceDate,
  fetchAttendance,
  isAttendanceLoading,
  activeAttendanceTab,
  setActiveAttendanceTab,
  leaveActionModal,
  setLeaveActionModal,
  handleExecuteMarkLeave,
  handleExecuteUnmarkLeave,
  attendanceRemarkModal,
  setAttendanceRemarkModal,
  handleExecuteAttendanceRemark,
  isSavingAttendanceRemark,
  getSubmissionTimeClassification,
  districts = []
}) {
  if (!show || !attendance) return null;

        const submittedList = attendance.submitted_fos || [...(attendance.submitted_full || []), ...(attendance.submitted_partial || [])];
        const missingList = attendance.missing_fos || [];
        const onLeaveList = attendance.on_leave_fos || [];

        // Fast lookup map for chronic defaulters
        const defaulterMap = {};
        chronicDefaulters.forEach(d => {
          const key = `${d.district.toLowerCase()}_${d.fo_name.toLowerCase()}`;
          defaulterMap[key] = d;
        });

        // 1. Filter by District Pill
        const districtMatchedMissing = attendanceDistrictFilter === 'All'
          ? missingList
          : missingList.filter(fo => canonicalizeDistrict(fo.district) === attendanceDistrictFilter);

        const districtMatchedSubmitted = attendanceDistrictFilter === 'All'
          ? submittedList
          : submittedList.filter(fo => canonicalizeDistrict(fo.district) === attendanceDistrictFilter);

        const districtMatchedOnLeave = attendanceDistrictFilter === 'All'
          ? onLeaveList
          : onLeaveList.filter(fo => canonicalizeDistrict(fo.district) === attendanceDistrictFilter);

        const districtMatchedDefaulters = attendanceDistrictFilter === 'All'
          ? chronicDefaulters
          : chronicDefaulters.filter(fo => canonicalizeDistrict(fo.district) === attendanceDistrictFilter);

        // 2. Precompute time bracket counts for chips
        const timeCounts = { all: districtMatchedSubmitted.length, on_time: 0, late: 0, delayed: 0, early: 0, next_day: 0 };
        districtMatchedSubmitted.forEach(fo => {
          const cls = getSubmissionTimeClassification(fo.submitted_time, fo.timestamp_raw, fo.is_next_day);
          if (timeCounts[cls.bracket] !== undefined) timeCounts[cls.bracket]++;
        });

        // 3. Filter Submitted by Time Bracket
        const timeFilteredSubmitted = attendanceTimeFilter === 'all'
          ? districtMatchedSubmitted
          : districtMatchedSubmitted.filter(fo => {
              const cls = getSubmissionTimeClassification(fo.submitted_time, fo.timestamp_raw, fo.is_next_day);
              return cls.bracket === attendanceTimeFilter;
            });

        // 4. Quick Search Filter across tabs
        const filteredMissing = districtMatchedMissing.filter(fo => {
          if (inactiveStaffNamesSet.has(normalizeStaffKey(fo.district, fo.fo_name))) return false;
          if (!attendanceSearchQuery) return true;
          const q = attendanceSearchQuery.toLowerCase();
          return (fo.fo_name || '').toLowerCase().includes(q) || (fo.district || '').toLowerCase().includes(q);
        });

        const filteredSubmitted = timeFilteredSubmitted.filter(fo => {
          if (!attendanceSearchQuery) return true;
          const q = attendanceSearchQuery.toLowerCase();
          return (fo.fo_name || '').toLowerCase().includes(q) || (fo.district || '').toLowerCase().includes(q);
        });

        const filteredOnLeave = districtMatchedOnLeave.filter(fo => {
          if (!attendanceSearchQuery) return true;
          const q = attendanceSearchQuery.toLowerCase();
          return (fo.fo_name || '').toLowerCase().includes(q) || 
                 (fo.district || '').toLowerCase().includes(q) || 
                 (fo.status || '').toLowerCase().includes(q) ||
                 (fo.reason_type || '').toLowerCase().includes(q) ||
                 (fo.remark || '').toLowerCase().includes(q);
        });

        const filteredDefaulters = districtMatchedDefaulters.filter(fo => {
          if (!attendanceSearchQuery) return true;
          const q = attendanceSearchQuery.toLowerCase();
          return (fo.fo_name || '').toLowerCase().includes(q) || (fo.district || '').toLowerCase().includes(q);
        });

        const totalSubmitted = attendance.submitted_count || submittedList.length;
        const totalOnLeave = attendance.on_leave_count || onLeaveList.length;

  return (
    <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl sm:rounded-3xl p-3 sm:p-6 w-full max-w-3xl sm:max-w-4xl shadow-2xl border border-slate-100 h-[94vh] sm:h-auto sm:max-h-[90vh] flex flex-col animate-fade-in my-auto font-sans">
              {/* Header */}
              <div className="flex justify-between items-start pb-2 mb-2 sm:pb-3 sm:mb-3 border-b border-slate-100 shrink-0">
                <div>
                  <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                    <span>Field Officer Attendance Radar</span>
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{attendance.date || attendanceDate}</span>
                  </h3>
                  <p className="text-xs text-slate-400 font-bold tracking-wide mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span>Total Active Staff: <strong className="text-slate-700">{attendance.total_staff}</strong></span>
                    <span>| Submitted: <strong className="text-emerald-600">{totalSubmitted}</strong></span>
                    <span>| Pending: <strong className="text-rose-500">{attendance.missing_count}</strong></span>
                    <span>| On Leave: <strong className="text-amber-600">{totalOnLeave}</strong></span>
                    {chronicDefaulters.length > 0 && (
                      <span className="font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full text-[10px] inline-flex items-center gap-1">
                        <span>⚠️</span> {chronicDefaulters.length} Defaulters (2+ Days)
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => fetchAttendance(true, attendanceDate)} 
                    disabled={isAttendanceLoading}
                    className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all cursor-pointer"
                    title="Live Refresh Attendance from Server"
                  >
                    <svg className={`w-4 h-4 ${isAttendanceLoading ? 'animate-spin text-emerald-600' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                  </button>
                  <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none cursor-pointer">&times;</button>
                </div>
              </div>

              {/* 📅 Date Navigation Bar (Instant In-Memory Derivation) */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-1.5 sm:p-2.5 mb-2 sm:mb-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1">
                    <span>📅</span> Date:
                  </span>
                  <input
                    type="date"
                    value={attendanceDate}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => {
                      const newDate = e.target.value;
                      if (newDate) {
                        setAttendanceDate(newDate);
                        fetchAttendance(false, newDate);
                      }
                    }}
                    className="bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 font-mono shadow-2xs cursor-pointer"
                  />
                  {isAttendanceLoading && (
                    <span className="text-[10px] font-bold text-indigo-600 animate-pulse flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-indigo-600 animate-ping"></span>
                      Syncing...
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date(attendanceDate);
                      d.setDate(d.getDate() - 1);
                      const prevDate = d.toISOString().slice(0, 10);
                      setAttendanceDate(prevDate);
                      fetchAttendance(false, prevDate);
                    }}
                    className="px-2.5 py-1 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1 active:scale-95"
                    title="Previous Day"
                  >
                    <span>◀</span> Prev
                  </button>
                  <button
                    type="button"
                    disabled={attendanceDate === new Date().toISOString().slice(0, 10)}
                    onClick={() => {
                      const todayStr = new Date().toISOString().slice(0, 10);
                      setAttendanceDate(todayStr);
                      fetchAttendance(false, todayStr);
                    }}
                    className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all shadow-2xs cursor-pointer active:scale-95 ${
                      attendanceDate === new Date().toISOString().slice(0, 10)
                        ? 'bg-indigo-600 text-white'
                        : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
                    }`}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    disabled={attendanceDate >= new Date().toISOString().slice(0, 10)}
                    onClick={() => {
                      const d = new Date(attendanceDate);
                      d.setDate(d.getDate() + 1);
                      const nextDate = d.toISOString().slice(0, 10);
                      setAttendanceDate(nextDate);
                      fetchAttendance(false, nextDate);
                    }}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1 active:scale-95 ${
                      attendanceDate >= new Date().toISOString().slice(0, 10)
                        ? 'bg-slate-100 text-slate-300 border border-slate-100 cursor-not-allowed'
                        : 'bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 cursor-pointer'
                    }`}
                    title="Next Day"
                  >
                    Next <span>▶</span>
                  </button>
                </div>
              </div>

              {/* 📊 District Attendance Rollup Scorecard Pills */}
              <div className="mb-2 sm:mb-2.5 space-y-1.5 shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    District Rollup Radar ({districtAttendanceRollup.length} Districts)
                  </span>
                  {attendanceDistrictFilter !== 'All' && (
                    <button
                      onClick={() => setAttendanceDistrictFilter('All')}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                    >
                      Clear District Filter (Show All)
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 custom-scrollbar text-xs font-bold">
                  <button
                    onClick={() => setAttendanceDistrictFilter('All')}
                    className={`px-3 py-1 rounded-xl border transition-all shrink-0 cursor-pointer ${
                      attendanceDistrictFilter === 'All'
                        ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    All Districts ({totalSubmitted}/{attendance.total_staff})
                  </button>
                  {districtAttendanceRollup.map(d => {
                    const isSelected = attendanceDistrictFilter === d.district;
                    const isFull = d.pct === 100;
                    const isGood = d.pct >= 70;
                    return (
                      <button
                        key={d.district}
                        onClick={() => setAttendanceDistrictFilter(d.district)}
                        className={`px-2.5 py-1 rounded-xl border transition-all shrink-0 flex items-center gap-1.5 cursor-pointer text-[11px] ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-black'
                            : isFull
                            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200 font-bold'
                            : isGood
                            ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200 font-bold'
                            : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200 font-bold'
                        }`}
                        title={`${d.district}: ${d.submitted} of ${d.total} submitted (${d.pct}%)`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : isFull ? 'bg-emerald-500' : isGood ? 'bg-amber-500' : 'bg-rose-500'}`}></span>
                        <span>{d.district}</span>
                        <span className={`text-[10px] px-1 py-0.2 rounded-md ${isSelected ? 'bg-indigo-700 text-white' : 'bg-white/80 text-slate-700'}`}>
                          {d.submitted}/{d.total}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* District Active Notice & 1-Click WhatsApp export */}
                {attendanceDistrictFilter !== 'All' && (
                  <div className="bg-indigo-50/80 border border-indigo-100 rounded-xl px-3 py-1.5 flex items-center justify-between gap-2 text-xs animate-fade-in">
                    <span className="font-bold text-indigo-900 flex items-center gap-1.5">
                      <span>📍</span> Filtered by District: <strong>{attendanceDistrictFilter}</strong>
                    </span>
                    <button
                      onClick={() => copyDistrictSpecificSummary(attendanceDistrictFilter)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-3 py-1 rounded-lg transition-all shadow-2xs cursor-pointer flex items-center gap-1 active:scale-95"
                      title={`Copy ${attendanceDistrictFilter} Attendance for WhatsApp`}
                    >
                      <span>📲</span> Copy {attendanceDistrictFilter} WhatsApp
                    </button>
                  </div>
                )}
              </div>

              {/* Navigation Tabs (4 Tabs: Missing, Submitted, On Leave, Defaulters) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-slate-100 p-1 rounded-2xl mb-2 sm:mb-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveAttendanceTab('missing')}
                  className={`py-2 px-2 sm:px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeAttendanceTab === 'missing'
                      ? 'bg-white text-rose-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>
                  <span className="truncate">Pending ({filteredMissing.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveAttendanceTab('submitted')}
                  className={`py-2 px-2 sm:px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeAttendanceTab === 'submitted'
                      ? 'bg-white text-emerald-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                  <span className="truncate">Submitted ({filteredSubmitted.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveAttendanceTab('on_leave')}
                  className={`py-2 px-2 sm:px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeAttendanceTab === 'on_leave'
                      ? 'bg-white text-amber-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                  <span className="truncate">🏖️ On Leave ({filteredOnLeave.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveAttendanceTab('defaulters')}
                  className={`py-2 px-2 sm:px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeAttendanceTab === 'defaulters'
                      ? 'bg-white text-purple-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0"></span>
                  <span className="truncate flex items-center gap-1">
                    Defaulters ({filteredDefaulters.length})
                    {filteredDefaulters.length > 0 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
                    )}
                  </span>
                </button>
              </div>

              {/* ⏰ Time Filter Chips (Rendered under Submitted Tab) */}
              {activeAttendanceTab === 'submitted' && (
                <div className="bg-slate-50/90 border border-slate-200/80 rounded-2xl px-2.5 sm:px-3 py-1.5 sm:py-2 mb-2 sm:mb-2.5 shrink-0">
                  <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar py-0.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 shrink-0 flex items-center gap-1">
                      <span>⏰</span> Time:
                    </span>
                    <button
                      type="button"
                      onClick={() => setAttendanceTimeFilter('all')}
                      className={`px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer shrink-0 whitespace-nowrap text-xs font-bold ${
                        attendanceTimeFilter === 'all'
                          ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      All Times ({timeCounts.all})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAttendanceTimeFilter('on_time')}
                      className={`px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer shrink-0 whitespace-nowrap text-xs flex items-center gap-1.5 ${
                        attendanceTimeFilter === 'on_time'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-black'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 font-bold'
                      }`}
                    >
                      <span>🟢</span>
                      <span>On-Time: 5 PM - 8 PM ({timeCounts.on_time})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAttendanceTimeFilter('late')}
                      className={`px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer shrink-0 whitespace-nowrap text-xs flex items-center gap-1.5 ${
                        attendanceTimeFilter === 'late'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-xs font-black'
                          : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 font-bold'
                      }`}
                    >
                      <span>🟡</span>
                      <span>Late: 8 PM - 10 PM ({timeCounts.late})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAttendanceTimeFilter('delayed')}
                      className={`px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer shrink-0 whitespace-nowrap text-xs flex items-center gap-1.5 ${
                        attendanceTimeFilter === 'delayed'
                          ? 'bg-rose-600 text-white border-rose-600 shadow-xs font-black'
                          : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 font-bold'
                      }`}
                    >
                      <span>🔴</span>
                      <span>Night: &gt; 10 PM ({timeCounts.delayed})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAttendanceTimeFilter('early')}
                      className={`px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer shrink-0 whitespace-nowrap text-xs flex items-center gap-1.5 ${
                        attendanceTimeFilter === 'early'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs font-black'
                          : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 font-bold'
                      }`}
                    >
                      <span>ℹ️</span>
                      <span>Mid-Day: &lt; 5 PM ({timeCounts.early})</span>
                    </button>
                    {timeCounts.next_day > 0 && (
                      <button
                        type="button"
                        onClick={() => setAttendanceTimeFilter('next_day')}
                        className={`px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer shrink-0 whitespace-nowrap text-xs flex items-center gap-1.5 ${
                          attendanceTimeFilter === 'next_day'
                            ? 'bg-amber-600 text-white border-amber-600 shadow-xs font-black'
                            : 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200 font-bold'
                        }`}
                      >
                        <span>⏰</span>
                        <span>Next Day Morning: &lt; 10 AM ({timeCounts.next_day})</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Quick Search */}
              <div className="mb-2 sm:mb-2.5 shrink-0">
                <div className="relative">
                  <input
                    type="text"
                    value={attendanceSearchQuery}
                    onChange={(e) => setAttendanceSearchQuery(e.target.value)}
                    placeholder={`Search ${activeAttendanceTab === 'missing' ? 'pending' : activeAttendanceTab === 'submitted' ? 'submitted' : activeAttendanceTab === 'on_leave' ? 'on leave / absent' : 'defaulters'} by name or district...`}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all pl-9"
                  />
                  <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
                  {attendanceSearchQuery && (
                    <button 
                      onClick={() => setAttendanceSearchQuery('')} 
                      className="absolute right-3 top-2 text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
                    >
                      &times;
                    </button>
                  )}
                </div>
              </div>

              {/* List Container */}
              <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar my-1 min-h-[300px] sm:min-h-[320px]">
                {activeAttendanceTab === 'missing' ? (
                  filteredMissing.length > 0 ? (
                    filteredMissing.map((fo, idx) => {
                      const defKey = `${(fo.district || '').toLowerCase()}_${(fo.fo_name || '').toLowerCase()}`;
                      const defInfo = defaulterMap[defKey];
                      return (
                        <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 sm:p-3 bg-slate-50 hover:bg-rose-50/30 rounded-xl border border-slate-100 hover:border-rose-200 transition-colors gap-2 sm:gap-0">
                          <div>
                            <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                              <span>{fo.fo_name}</span>
                              {defInfo && (
                                <span className="text-[10px] font-black text-rose-700 bg-rose-100 border border-rose-200 px-2 py-0.2 rounded-md inline-flex items-center gap-0.5">
                                  <span>⚠️</span> {defInfo.consecutiveDays} Days Inactive
                                </span>
                              )}
                            </p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{fo.district} &bull; {fo.designation || 'Field Officer'}</p>
                          </div>
                          <div className="flex items-center flex-wrap gap-1.5 self-end sm:self-center shrink-0">
                            <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-full">
                              Not Submitted
                            </span>
                            <button
                              type="button"
                              onClick={() => setLeaveActionModal({
                                district: fo.district,
                                fo_name: fo.fo_name,
                                date: attendance.date || attendanceDate,
                                status: 'leave',
                                reason_type: 'Casual',
                                remark: ''
                              })}
                              className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold px-2.5 py-1 rounded-xl transition-all shadow-2xs flex items-center gap-1 cursor-pointer active:scale-95"
                              title="Mark Officer as On Leave or Absent"
                            >
                              <span>🏖️</span>
                              <span>Mark Leave</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-12 text-slate-400 font-semibold text-xs">
                      {attendanceSearchQuery ? 'Koi missing officer match nahi hua.' : '🎉 Sabhi Field Officers ne report submit kar di hai!'}
                    </div>
                  )
                ) : activeAttendanceTab === 'submitted' ? (
                  filteredSubmitted.length > 0 ? (
                    filteredSubmitted.map((fo, idx) => {
                      const timeClassification = getSubmissionTimeClassification(fo.submitted_time, fo.timestamp_raw, fo.is_next_day);
                      return (
                        <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 sm:p-3 bg-slate-50 hover:bg-emerald-50/40 rounded-xl border border-slate-100 hover:border-emerald-200 transition-colors gap-2 sm:gap-0">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">
                              ✓
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                <span>{fo.fo_name}</span>
                                {fo.submission_count > 1 && (
                                  <span className="text-[9px] font-black bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.2 rounded-md">
                                    {fo.submission_count} edits
                                  </span>
                                )}
                              </p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {fo.district} &bull; {fo.designation || 'Field Officer'}
                              </p>
                              {fo.admin_remark && (
                                <p className="text-[11px] text-amber-900 bg-amber-50/80 border border-amber-200/80 px-2 py-0.5 rounded-lg mt-1 inline-flex items-center gap-1">
                                  <span>📋</span>
                                  <span>Remark: <strong>{fo.admin_remark}</strong></span>
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 self-end sm:self-center">
                            {fo.total_ids !== undefined && (
                              <span className="text-[10px] font-bold text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded-lg shadow-2xs">
                                {fo.total_ids} IDs
                              </span>
                            )}
                            {fo.is_next_day ? (
                              <span className="text-[11px] font-black tracking-wide text-amber-900 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-2xs">
                                <span>⏰</span> {fo.submitted_label || ('Next day morning ' + fo.submitted_time)}
                              </span>
                            ) : (
                              <span className="text-[11px] font-black tracking-wide text-emerald-800 bg-emerald-100/80 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-2xs">
                                <span>⏰</span> {fo.submitted_time || 'Submitted'}
                              </span>
                            )}
                            <span className={`text-[10px] px-2 py-0.5 rounded-lg border shadow-2xs ${timeClassification.badgeClass}`}>
                              {timeClassification.shortLabel}
                            </span>
                            <button
                              type="button"
                              onClick={() => setAttendanceRemarkModal({
                                district: fo.district,
                                fo_name: fo.fo_name,
                                date: attendance?.date || attendanceDate,
                                action: 'remark',
                                remark: fo.admin_remark || '',
                                status: 'leave',
                                reason_type: 'Casual'
                              })}
                              className="bg-white hover:bg-indigo-50 text-indigo-700 text-xs font-bold px-2.5 py-1 rounded-xl border border-indigo-200 transition-all shadow-2xs flex items-center gap-1 cursor-pointer active:scale-95"
                              title="Add Inspection Remark or Override Leave"
                            >
                              <span>📝</span>
                              <span>Remark / Leave</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-12 text-slate-400 font-semibold text-xs">
                      {attendanceSearchQuery ? 'Koi submitted officer match nahi hua.' : 'Is filter category mein koi officer nahi mila.'}
                    </div>
                  )
                ) : activeAttendanceTab === 'on_leave' ? (
                  filteredOnLeave.length > 0 ? (
                    filteredOnLeave.map((fo, idx) => {
                      const isAbsent = fo.status === 'absent';
                      const isWeeklyOff = fo.status === 'weekly_off';
                      const statusLabel = isAbsent ? '⚠️ Absent' : isWeeklyOff ? '📅 Weekly Off' : '🏖️ On Leave';
                      const badgeStyle = isAbsent
                        ? 'bg-rose-100 text-rose-800 border-rose-200'
                        : isWeeklyOff
                        ? 'bg-blue-100 text-blue-800 border-blue-200'
                        : 'bg-amber-100 text-amber-800 border-amber-200';

                      return (
                        <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 sm:p-3.5 bg-slate-50 hover:bg-amber-50/30 rounded-xl border border-slate-200 hover:border-amber-300 transition-colors gap-3">
                          <div className="flex items-start gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-base shrink-0 mt-0.5 ${
                              isAbsent ? 'bg-rose-100 text-rose-700' : isWeeklyOff ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {isAbsent ? '⚠️' : isWeeklyOff ? '📅' : '🏖️'}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-black text-slate-800">{fo.fo_name}</span>
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider border ${badgeStyle}`}>
                                  {statusLabel}
                                </span>
                                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                                  {fo.reason_type || 'Casual'}
                                </span>
                              </div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                                {fo.district} &bull; {fo.designation || 'Field Officer'}
                              </p>
                              {fo.remark && (
                                <p className="text-xs text-slate-600 mt-1 italic bg-white/80 px-2.5 py-1 rounded-lg border border-slate-200/60 inline-block">
                                  "{fo.remark}"
                                </p>
                              )}
                              {fo.marked_by_name && (
                                <p className="text-[10px] text-slate-400 font-medium mt-1">
                                  Marked by <strong className="text-slate-600">{fo.marked_by_name}</strong> {fo.marked_at ? `on ${String(fo.marked_at).slice(0, 16)}` : ''}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center flex-wrap gap-1.5 self-end sm:self-center shrink-0">
                            <button
                              type="button"
                              onClick={() => handleExecuteUnmarkLeave(fo.district, fo.fo_name, attendance.date || attendanceDate)}
                              disabled={isSavingLeave}
                              className="bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 text-xs font-bold px-3 py-1.5 rounded-xl border border-rose-200 hover:border-rose-300 transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Revert leave status and move back to Pending"
                            >
                              <span>🔄</span>
                              <span>Revert Leave</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-12 text-slate-400 font-semibold text-xs space-y-1">
                      <div className="text-2xl">🏖️</div>
                      <p className="font-bold text-slate-700">Koi officer leave par nahi hai.</p>
                      <p className="text-slate-400">Sabhi officers active duty ya pending status mein hain.</p>
                    </div>
                  )
                ) : (
                  /* Defaulters / Absence Streak Tab */
                  filteredDefaulters.length > 0 ? (
                    filteredDefaulters.map((fo, idx) => (
                      <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 sm:p-3.5 bg-amber-50/50 hover:bg-amber-50 rounded-xl border border-amber-200 transition-colors gap-2 sm:gap-0">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-black text-sm shrink-0 mt-0.5">
                            ⚠️
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-800 flex items-center gap-2">
                              <span>{fo.fo_name}</span>
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${fo.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-amber-100 text-amber-800 border border-amber-200'}`}>
                                {fo.consecutiveDays} Days Streak
                              </span>
                            </p>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              {fo.district} &bull; Field Officer
                            </p>
                            <p className="text-[11px] font-semibold text-slate-600 mt-1">
                              Missed Dates: <span className="font-mono text-rose-700 font-bold">{fo.missedDates.join(', ')}</span>
                            </p>
                          </div>
                        </div>

                        <div className="self-end sm:self-center flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setAttendanceRemarkModal({
                              district: fo.district,
                              fo_name: fo.fo_name,
                              date: attendance?.date || attendanceDate,
                              action: 'override_leave',
                              remark: '',
                              status: 'absent',
                              reason_type: 'Uninformed'
                            })}
                            className="bg-white hover:bg-amber-50 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-xl border border-amber-200 transition-all shadow-2xs flex items-center gap-1 cursor-pointer active:scale-95"
                            title="Add Remark or Mark Absent"
                          >
                            <span>📝</span>
                            <span>Remark / Leave</span>
                          </button>
                          <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full border shadow-2xs ${fo.severity === 'CRITICAL' ? 'bg-rose-600 text-white border-rose-700' : 'bg-amber-500 text-white border-amber-600'}`}>
                            {fo.severity === 'CRITICAL' ? 'Critical Action' : 'Pending Follow-up'}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 text-slate-400 font-semibold text-xs space-y-1">
                      <div className="text-2xl">🎉</div>
                      <p className="font-black text-slate-700 text-sm">Shandar! Koi Chronic Defaulter Nahi Hai.</p>
                      <p className="text-slate-400">Sabhi active officers regular reporting kar rahe hain (no 2+ consecutive missed days).</p>
                    </div>
                  )
                )}
              </div>

              {/* Action Footer */}
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 mt-auto shrink-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {activeAttendanceTab === 'missing' ? (
                    <button 
                      onClick={copyMissingReminder}
                      disabled={attendance.missing_count === 0}
                      className={`flex items-center gap-2 font-bold text-xs py-2.5 px-4 sm:px-5 rounded-xl transition-all ${attendance.missing_count > 0 ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 active:scale-95 cursor-pointer' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      <span>{copiedAttendance ? 'Reminder Copied!' : 'Copy WhatsApp Reminder'}</span>
                    </button>
                  ) : activeAttendanceTab === 'submitted' ? (
                    <button 
                      onClick={copySubmittedSummary}
                      disabled={totalSubmitted === 0}
                      className={`flex items-center gap-2 font-bold text-xs py-2.5 px-4 sm:px-5 rounded-xl transition-all ${totalSubmitted > 0 ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 active:scale-95 cursor-pointer' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
                      <span>{copiedAttendance ? 'Submitted List Copied!' : 'Copy Submitted List (WhatsApp)'}</span>
                    </button>
                  ) : activeAttendanceTab === 'on_leave' ? (
                    <button 
                      type="button"
                      onClick={copyOnLeaveSummary}
                      disabled={totalOnLeave === 0}
                      className={`flex items-center gap-2 font-bold text-xs py-2.5 px-4 sm:px-5 rounded-xl transition-all ${totalOnLeave > 0 ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 active:scale-95 cursor-pointer' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                    >
                      <span>🏖️</span>
                      <span>{copiedAttendance ? 'Leave List Copied!' : 'Copy Leave List (WhatsApp)'}</span>
                    </button>
                  ) : (
                    <button 
                      onClick={copyDefaultersWarning}
                      disabled={chronicDefaulters.length === 0}
                      className={`flex items-center gap-2 font-bold text-xs py-2.5 px-4 sm:px-5 rounded-xl transition-all ${chronicDefaulters.length > 0 ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20 active:scale-95 cursor-pointer' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                    >
                      <span>🚨</span>
                      <span>{copiedAttendance ? 'Alert Copied!' : 'Copy Defaulters Alert (WhatsApp)'}</span>
                    </button>
                  )}

                  {attendanceDistrictFilter !== 'All' && (
                    <button
                      onClick={() => copyDistrictSpecificSummary(attendanceDistrictFilter)}
                      className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs py-2.5 px-4 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                    >
                      <span>📲</span>
                      <span>Copy {attendanceDistrictFilter} Report</span>
                    </button>
                  )}
                </div>

                <button onClick={onClose} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2.5 px-5 rounded-xl transition-colors cursor-pointer">Close</button>
              </div>

            </div>
          </div>

      {/* 🏖️ Mark Leave / Absent Modal */}
      {leaveActionModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-3 sm:p-4 animate-fade-in font-sans">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100 flex flex-col gap-4">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-black text-lg shrink-0">
                  🏖️
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800">Mark Leave / Absent</h3>
                  <p className="text-xs text-slate-500 font-semibold">
                    {leaveActionModal.fo_name} &bull; <span className="font-bold text-indigo-600">{leaveActionModal.district}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isSavingLeave && setLeaveActionModal(null)}
                disabled={isSavingLeave}
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Form Fields */}
            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Date</label>
                <input
                  type="date"
                  value={leaveActionModal.date || attendanceDate}
                  onChange={(e) => setLeaveActionModal(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Status</label>
                <select
                  value={leaveActionModal.status || 'leave'}
                  onChange={(e) => setLeaveActionModal(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                >
                  <option value="leave">🏖️ On Leave</option>
                  <option value="absent">⚠️ Absent / Uninformed</option>
                  <option value="weekly_off">📅 Weekly Off</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Reason Type</label>
                <select
                  value={leaveActionModal.reason_type || 'Casual'}
                  onChange={(e) => setLeaveActionModal(prev => ({ ...prev, reason_type: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                >
                  <option value="Medical">Medical (Health / Illness)</option>
                  <option value="Casual">Casual (Emergency / Family)</option>
                  <option value="Official Work">Official Work / Field Training</option>
                  <option value="Personal">Personal Work</option>
                  <option value="Uninformed">Uninformed Absence</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Remark / Notes (Optional)</label>
                <textarea
                  rows="2"
                  value={leaveActionModal.remark || ''}
                  onChange={(e) => setLeaveActionModal(prev => ({ ...prev, remark: e.target.value }))}
                  placeholder="e.g. Fever, informed over call in morning"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-medium text-slate-800 outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setLeaveActionModal(null)}
                disabled={isSavingLeave}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteMarkLeave}
                disabled={isSavingLeave}
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs shadow-md shadow-amber-600/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingLeave ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" strokeDasharray="32" strokeLinecap="round"/></svg>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span>✓</span>
                    <span>Confirm Leave</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📝 Unified Attendance Remark / Leave Override Modal */}
      {attendanceRemarkModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[115] flex items-center justify-center p-3 sm:p-4 animate-fade-in font-sans">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100 flex flex-col gap-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-lg shrink-0">
                  📝
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800">
                    Attendance Remark &amp; Leave
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold">
                    {attendanceRemarkModal.fo_name} &bull; <span className="font-bold text-indigo-600">{attendanceRemarkModal.district}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isSavingAttendanceRemark && setAttendanceRemarkModal(null)}
                disabled={isSavingAttendanceRemark}
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Segmented Action Toggle */}
            <div className="bg-slate-100 p-1 rounded-2xl flex items-center gap-1">
              <button
                type="button"
                onClick={() => setAttendanceRemarkModal(prev => ({ ...prev, action: 'remark' }))}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  attendanceRemarkModal.action === 'remark'
                    ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/60'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>📋</span>
                <span>Inspection Remark</span>
              </button>
              <button
                type="button"
                onClick={() => setAttendanceRemarkModal(prev => ({ ...prev, action: 'override_leave' }))}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  attendanceRemarkModal.action === 'override_leave'
                    ? 'bg-white text-amber-700 shadow-sm border border-slate-200/60'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>⚠️</span>
                <span>Override to Leave</span>
              </button>
            </div>

            {/* Context Notice */}
            {attendanceRemarkModal.action === 'remark' ? (
              <div className="bg-indigo-50/80 border border-indigo-100 rounded-2xl p-3 text-xs text-indigo-900 flex items-start gap-2">
                <span className="text-sm shrink-0">ℹ️</span>
                <p className="text-[11px] leading-relaxed">
                  Keeps report submitted. Records official inspection note on this day's attendance without voiding submission.
                </p>
              </div>
            ) : (
              <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3 text-xs text-amber-900 flex items-start gap-2">
                <span className="text-sm shrink-0">⚠️</span>
                <p className="text-[11px] leading-relaxed">
                  Overrides this day's attendance status to Leave or Absent in official records and FO calendar.
                </p>
              </div>
            )}

            {/* Form Fields */}
            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Date</label>
                <input
                  type="date"
                  value={attendanceRemarkModal.date || attendanceDate}
                  onChange={(e) => setAttendanceRemarkModal(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {attendanceRemarkModal.action === 'override_leave' && (
                <>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Status</label>
                    <select
                      value={attendanceRemarkModal.status || 'leave'}
                      onChange={(e) => setAttendanceRemarkModal(prev => ({ ...prev, status: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                    >
                      <option value="leave">🏖️ On Leave</option>
                      <option value="absent">⚠️ Absent / Uninformed</option>
                      <option value="weekly_off">📅 Weekly Off</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Reason Type</label>
                    <select
                      value={attendanceRemarkModal.reason_type || 'Casual'}
                      onChange={(e) => setAttendanceRemarkModal(prev => ({ ...prev, reason_type: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                    >
                      <option value="Medical">Medical (Health / Illness)</option>
                      <option value="Casual">Casual (Emergency / Family)</option>
                      <option value="Official Work">Official Work / Field Training</option>
                      <option value="Personal">Personal Work</option>
                      <option value="Uninformed">Uninformed Absence</option>
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Remark / Note <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows="3"
                  value={attendanceRemarkModal.remark || ''}
                  onChange={(e) => setAttendanceRemarkModal(prev => ({ ...prev, remark: e.target.value }))}
                  placeholder={
                    attendanceRemarkModal.action === 'remark'
                      ? "e.g. Verified with Dr. Sharma / 3 IDs confirmed on spot"
                      : "e.g. Staff called in sick / Family emergency"
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setAttendanceRemarkModal(null)}
                disabled={isSavingAttendanceRemark}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteAttendanceRemark}
                disabled={isSavingAttendanceRemark}
                className={`px-5 py-2 rounded-xl text-white font-black text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                  attendanceRemarkModal.action === 'remark'
                    ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20'
                    : 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                }`}
              >
                {isSavingAttendanceRemark ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" strokeDasharray="32" strokeLinecap="round"/></svg>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span>✓</span>
                    <span>{attendanceRemarkModal.action === 'remark' ? 'Save Remark' : 'Override Attendance'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
