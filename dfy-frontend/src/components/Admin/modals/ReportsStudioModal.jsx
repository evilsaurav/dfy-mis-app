import React from 'react';
import { canonicalizeDistrict } from '../../../utils/districtHelpers';

export default function ReportsStudioModal({
  showReportsStudio,
  setShowReportsStudio,
  month,
  staffDirectory = {},
  isSubAdmin = false,
  reportsStudioTab,
  setReportsStudioTab,
  reportsDistrict,
  setReportsDistrict,
  availableKpiDistricts = [],
  selectedKpiDistricts = [],
  isDownloadingKpi = false,
  handleSelectAllKpiDistricts,
  handleClearKpiDistricts,
  handleToggleKpiDistrict,
  kpiQueueProgress,
  canDownloadBulkZip = false,
  handleDownloadScopedZip,
  handleDownloadSequentialQueue,
  handleDownloadKpi,
  rawRecords = [],
  currentUser,
  selectedMedDistricts = [],
  selectedDistrict = 'All',
  selectedFO = 'All',
  handleSelectAllMedDistricts,
  handleClearMedDistricts,
  handleToggleMedDistrict,
  isDownloadingMedicineReport = false,
  medQueueProgress,
  handleDownloadMedicineReport,
  handleDownloadSequentialMedQueue,
  getAdminToken,
  availableAttendanceDistricts = [],
  selectedAttendanceDistricts = [],
  isDownloadingAttendance = false,
  handleSelectAllAttendanceDistricts,
  handleClearAttendanceDistricts,
  handleToggleAttendanceDistrict,
  attendanceQueueProgress,
  handleDownloadAttendanceSingleOrScoped,
  handleDownloadStaffAttendanceQueue,
  totals = {},
  copyWhatsAppBulletin,
  copiedBulletin,
  liveWhatsAppBulletin
}) {
  if (!showReportsStudio) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-4xl shadow-2xl border border-slate-100 max-h-[88vh] flex flex-col animate-fade-in">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                  <span>📊</span> DFY Executive Reports &amp; Export Studio
                </h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Month: {month} &bull; Bihar TB Mission ({Object.keys(staffDirectory).length || 22} Districts)</p>
              </div>
              <button onClick={() => setShowReportsStudio(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none">&times;</button>
            </div>

            {/* Studio Navigation Tabs */}
            <div className="flex flex-wrap gap-2 pb-4 border-b border-slate-100">
              {[
                { id: "kpi_workbooks", label: "📁 District KPI Excel", icon: "📁" },
                { id: "medicine_consumption", label: "💊 Medicine Consumption", icon: "💊" },
                { id: "state_matrix", label: "🏢 State Summary (.xlsx)", icon: "🏢" },
                { id: "staff_attendance", label: "📋 Staff Attendance (.xlsx)", icon: "📋" },
                { id: "cascade_funnel", label: "📈 Cascade Funnel", icon: "📈" },
                { id: "whatsapp_bulletin", label: "📱 WhatsApp Bulletin", icon: "📱" }
              ].filter(tab => !isSubAdmin || tab.id !== "state_matrix").map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setReportsStudioTab(tab.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${reportsStudioTab === tab.id ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Studio Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar my-4 pr-1">
              
              {/* Tab 1: District KPI Workbooks */}
              {reportsStudioTab === "kpi_workbooks" && (
                <div className="space-y-4">
                  <div className="bg-indigo-50/70 p-4 sm:p-5 rounded-2xl border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-black text-indigo-900 mb-0.5">Official 33-Sheet Pre-Formulated KPI Workbooks</h4>
                      <p className="text-xs text-indigo-700 font-medium">Monthly populated daily tabs (1ST..31st) with auto-calculating consolidated sheets and target injection.</p>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-200/80 text-indigo-900 px-3 py-1 rounded-full shrink-0 self-start sm:self-auto">
                      Month: {month}
                    </span>
                  </div>

                  {/* Multi-District Selection Deck */}
                  <div className="bg-slate-50/90 p-4 sm:p-5 rounded-2xl border border-slate-200/80 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-800">
                          🎯 Choose Districts to Export
                        </span>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${selectedKpiDistricts.length > 0 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                          {selectedKpiDistricts.length} of {availableKpiDistricts.length} Selected
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleSelectAllKpiDistricts}
                          disabled={isDownloadingKpi}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-indigo-100 hover:bg-indigo-200 text-indigo-800 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={handleClearKpiDistricts}
                          disabled={isDownloadingKpi}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {/* District Chips */}
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto custom-scrollbar p-1">
                      {availableKpiDistricts.map(dist => {
                        const isSelected = selectedKpiDistricts.includes(dist);
                        return (
                          <button
                            key={dist}
                            type="button"
                            disabled={isDownloadingKpi}
                            onClick={() => handleToggleKpiDistrict(dist)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border active:scale-95 cursor-pointer disabled:opacity-50 ${
                              isSelected
                                ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-xs shadow-indigo-600/20'
                                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs'
                            }`}
                          >
                            <span>{isSelected ? '✓' : '+'}</span>
                            <span>{dist}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Live Queue Progress Banner */}
                    {kpiQueueProgress && (
                      <div className="bg-indigo-950 text-white p-4 rounded-2xl border border-indigo-800 shadow-lg space-y-2 animate-fade-in">
                        <div className="flex justify-between items-center text-xs font-bold">
                          <span className="flex items-center gap-2">
                            <span className="animate-spin text-sm">⏳</span>
                            <span>{kpiQueueProgress.status}</span>
                          </span>
                          <span className="font-mono text-indigo-300">{kpiQueueProgress.percent}%</span>
                        </div>
                        <div className="w-full h-2.5 bg-indigo-900 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all duration-300 rounded-full"
                            style={{ width: `${kpiQueueProgress.percent}%` }}
                          ></div>
                        </div>
                        <p className="text-[10px] text-indigo-300 font-medium">
                          Render memory protection active: generating one file at a time with 1-second server cooldown between requests.
                        </p>
                      </div>
                    )}

                    {/* Multi-District Download Action Cards */}
                    <div className={`grid grid-cols-1 ${canDownloadBulkZip ? 'sm:grid-cols-2' : ''} gap-3 pt-2`}>
                      {/* Option A: Scoped ZIP (Multi-District Only) */}
                      {canDownloadBulkZip && (
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col justify-between shadow-2xs">
                          <div>
                            <span className="text-xs font-black text-slate-800 flex items-center gap-1.5 mb-1">
                              <span>📦</span>
                              <span>Download Scoped ZIP Archive</span>
                            </span>
                            <p className="text-[11px] text-slate-500 font-medium">
                              Bundles only the <strong>{selectedKpiDistricts.length > 0 ? selectedKpiDistricts.length : availableKpiDistricts.length} selected district(s)</strong> into a single compressed ZIP file.
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={isDownloadingKpi || (selectedKpiDistricts.length === 0 && availableKpiDistricts.length === 0)}
                            onClick={handleDownloadScopedZip}
                            className={`mt-3 w-full font-bold py-2.5 rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                              isDownloadingKpi
                                ? 'bg-indigo-400 text-white cursor-wait animate-pulse'
                                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20 cursor-pointer'
                            }`}
                          >
                            {isDownloadingKpi ? (
                              <>
                                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                <span>Generating Scoped ZIP Archive...</span>
                              </>
                            ) : (
                              <>
                                <span>📦</span>
                                <span>Download Selected ZIP ({selectedKpiDistricts.length > 0 ? selectedKpiDistricts.length : 'All'})</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {/* Option B: One-by-One Queue */}
                      <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-200/80 flex flex-col justify-between shadow-2xs">
                        <div>
                          <span className="text-xs font-black text-emerald-950 flex items-center gap-1.5 mb-1">
                            <span>📑</span>
                            <span>Download One-by-One (Queue)</span>
                          </span>
                          <p className="text-[11px] text-emerald-800 font-medium">
                            Downloads `.xlsx` files individually with a 1-second pause between each file (guarantees zero memory spikes on Render).
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={isDownloadingKpi || selectedKpiDistricts.length === 0}
                          onClick={handleDownloadSequentialQueue}
                          className={`mt-3 w-full font-bold py-2.5 rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                            isDownloadingKpi
                              ? 'bg-emerald-400 text-white cursor-wait animate-pulse'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20 cursor-pointer'
                          }`}
                        >
                          {isDownloadingKpi ? (
                            <>
                              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                              <span>Queue Running Safely...</span>
                            </>
                          ) : (
                            <>
                              <span>📑</span>
                              <span>Start Download Queue ({selectedKpiDistricts.length} Files)</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Single District Quick Export */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1">
                      <span className="text-xs font-black text-slate-800 block mb-0.5">Quick Single District Export</span>
                      <p className="text-[11px] text-slate-400 font-medium">Select a single district to immediately download its 33-sheet `.xlsx` file:</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={reportsDistrict}
                        onChange={(e) => setReportsDistrict(e.target.value)}
                        className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {availableKpiDistricts.map(d => (
                          <option key={d} value={d}>{d} District</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={isDownloadingKpi}
                        onClick={handleDownloadKpi}
                        className={`font-bold px-4 py-2 rounded-xl text-xs shadow-sm transition-all flex items-center gap-1.5 active:scale-95 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                          isDownloadingKpi
                            ? 'bg-indigo-400 text-white cursor-wait animate-pulse'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
                        }`}
                      >
                        {isDownloadingKpi ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                            <span>Generating 33 Sheets...</span>
                          </>
                        ) : (
                          <>
                            <span>📥</span>
                            <span>Download</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Medicine Consumption Studio */}
              {reportsStudioTab === "medicine_consumption" && (() => {
                const summaryMap = {};
                let totalPatientsCount = 0;
                let totalStripsCount = 0;

                const filtered = rawRecords.filter(r => {
                  const dist = canonicalizeDistrict(r.working_place || r.district || '');
                  if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
                    const allowed = currentUser.allowed_districts.map(canonicalizeDistrict);
                    if (!allowed.includes(dist)) return false;
                  }
                  if (selectedMedDistricts.length > 0) {
                    if (!selectedMedDistricts.map(canonicalizeDistrict).includes(dist)) return false;
                  } else if (selectedDistrict !== 'All' && dist !== selectedDistrict) {
                    return false;
                  }
                  if (selectedFO !== 'All' && (r.fo_name || r.officer_name) !== selectedFO) return false;
                  return true;
                });

                filtered.forEach(r => {
                  const dist = canonicalizeDistrict(r.working_place || r.district || '');
                  const fo = r.fo_name || r.officer_name || 'Field Officer';
                  const key = `${dist}___${fo}`;
                  
                  if (!summaryMap[key]) {
                    summaryMap[key] = {
                      district: dist,
                      fo_name: fo,
                      total_patients: 0,
                      adult_ip: 0,
                      adult_cp: 0,
                      pediatric_ip: 0,
                      pediatric_cp: 0,
                      total_strips: 0
                    };
                  }

                  const details = Array.isArray(r.fdc_details) ? r.fdc_details : [];
                  const fdcIds = Array.isArray(r.fdc_provided_ids) ? r.fdc_provided_ids : [];

                  if (details.length > 0) {
                    details.forEach(d => {
                      const ptype = String(d.patient_type || 'adult').toLowerCase();
                      const phase = String(d.phase || 'IP').toUpperCase();
                      const strips = Number(d.strips) || 1;

                      summaryMap[key].total_patients += 1;
                      summaryMap[key].total_strips += strips;
                      totalPatientsCount += 1;
                      totalStripsCount += strips;

                      if (ptype === 'pediatric') {
                        if (phase === 'IP') summaryMap[key].pediatric_ip += 1;
                        else summaryMap[key].pediatric_cp += 1;
                      } else {
                        if (phase === 'IP') summaryMap[key].adult_ip += 1;
                        else summaryMap[key].adult_cp += 1;
                      }
                    });
                  } else if (fdcIds.length > 0) {
                    fdcIds.forEach(() => {
                      summaryMap[key].total_patients += 1;
                      summaryMap[key].total_strips += 1;
                      summaryMap[key].adult_ip += 1;
                      totalPatientsCount += 1;
                      totalStripsCount += 1;
                    });
                  }
                });

                const summaryList = Object.values(summaryMap).filter(s => s.total_patients > 0);

                return (
                  <div className="space-y-4">
                    {/* Top Banner & Overview */}
                    <div className="bg-gradient-to-r from-teal-900 to-slate-900 p-5 rounded-2xl border border-teal-800/60 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg shadow-teal-950/30">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-xl shrink-0">
                            💊
                          </div>
                          <div>
                            <h4 className="text-base font-black text-white tracking-tight">TB FDC Medicine Distribution &amp; Consumption Studio</h4>
                            <p className="text-xs text-teal-200/80 font-medium">
                              Export 2-sheet executive consumption workbooks (.xlsx) with Detailed Patient Records &amp; Aggregations.
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          <span className="text-[10px] font-black uppercase tracking-wider bg-teal-800/60 border border-teal-600/40 text-teal-200 px-2.5 py-1 rounded-lg">
                            Month: {month}
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-wider bg-teal-800/60 border border-teal-600/40 text-teal-200 px-2.5 py-1 rounded-lg">
                            Scope: {selectedMedDistricts.length > 0 ? `${selectedMedDistricts.length} Selected Districts` : (selectedDistrict === 'All' ? 'All Districts' : selectedDistrict)}
                          </span>
                          <span className="text-[10px] font-bold text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
                            Total Patients: {totalPatientsCount} &bull; Total Strips: {totalStripsCount}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Multi-District Selection Deck */}
                    <div className="bg-slate-50/90 p-4 sm:p-5 rounded-2xl border border-slate-200/80 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-800">
                            🎯 Choose Districts to Export
                          </span>
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${selectedMedDistricts.length > 0 ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                            {selectedMedDistricts.length} of {availableKpiDistricts.length} Selected
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={handleSelectAllMedDistricts}
                            disabled={isDownloadingMedicineReport}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-teal-100 hover:bg-teal-200 text-teal-800 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={handleClearMedDistricts}
                            disabled={isDownloadingMedicineReport}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      {/* District Chips */}
                      <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto custom-scrollbar p-1">
                        {availableKpiDistricts.map(dist => {
                          const isSelected = selectedMedDistricts.includes(dist);
                          return (
                            <button
                              key={dist}
                              type="button"
                              disabled={isDownloadingMedicineReport}
                              onClick={() => handleToggleMedDistrict(dist)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border active:scale-95 cursor-pointer disabled:opacity-50 ${
                                isSelected
                                  ? 'bg-teal-600 hover:bg-teal-700 text-white border-teal-600 shadow-xs shadow-teal-600/20'
                                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs'
                              }`}
                            >
                              <span>{isSelected ? '✓' : '+'}</span>
                              <span>{dist}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Live Queue Progress Banner */}
                      {medQueueProgress && (
                        <div className="bg-slate-900 text-white p-4 rounded-2xl border border-teal-800 shadow-lg space-y-2 animate-fade-in">
                          <div className="flex justify-between items-center text-xs font-bold">
                            <span className="flex items-center gap-2">
                              <span className="animate-spin text-sm">⏳</span>
                              <span>{medQueueProgress.status}</span>
                            </span>
                            <span className="font-mono text-teal-300">{medQueueProgress.percent}%</span>
                          </div>
                          <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-teal-400 to-emerald-400 transition-all duration-300 rounded-full"
                              style={{ width: `${medQueueProgress.percent}%` }}
                            ></div>
                          </div>
                          <p className="text-[10px] text-teal-300 font-medium">
                            Render memory protection active: generating one file at a time with 1-second server cooldown between requests.
                          </p>
                        </div>
                      )}

                      {/* Multi-District Download Action Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                        {/* Option A: Combined Excel */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col justify-between shadow-2xs">
                          <div>
                            <span className="text-xs font-black text-slate-800 flex items-center gap-1.5 mb-1">
                              <span>📊</span>
                              <span>Download Combined Workbook (.xlsx)</span>
                            </span>
                            <p className="text-[11px] text-slate-500 font-medium">
                              Downloads a single 2-sheet workbook containing the <strong>{selectedMedDistricts.length > 0 ? `${selectedMedDistricts.length} selected` : 'all'} district(s)</strong> with patient detail logs and FO summaries.
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={isDownloadingMedicineReport || (selectedMedDistricts.length === 0 && availableKpiDistricts.length === 0)}
                            onClick={handleDownloadMedicineReport}
                            className={`mt-3 w-full font-bold py-2.5 rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 ${
                              isDownloadingMedicineReport
                                ? 'bg-teal-400 text-white cursor-wait animate-pulse'
                                : 'bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white shadow-teal-600/20 cursor-pointer'
                            }`}
                          >
                            {isDownloadingMedicineReport ? (
                              <>
                                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                <span>Generating Medicine Workbook...</span>
                              </>
                            ) : (
                              <>
                                <span>📥</span>
                                <span>Download Selected ({selectedMedDistricts.length > 0 ? selectedMedDistricts.length : 'All'})</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Option B: One-by-One Queue */}
                        <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-200/80 flex flex-col justify-between shadow-2xs">
                          <div>
                            <span className="text-xs font-black text-emerald-950 flex items-center gap-1.5 mb-1">
                              <span>📑</span>
                              <span>Download One-by-One (Queue)</span>
                            </span>
                            <p className="text-[11px] text-emerald-800 font-medium">
                              Downloads individual district `.xlsx` files with a 1-second pause between each file (guarantees zero memory spikes on Render).
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={isDownloadingMedicineReport || (selectedMedDistricts.length === 0 && availableKpiDistricts.length === 0)}
                            onClick={handleDownloadSequentialMedQueue}
                            className={`mt-3 w-full font-bold py-2.5 rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 ${
                              isDownloadingMedicineReport
                                ? 'bg-emerald-400 text-white cursor-wait animate-pulse'
                                : 'bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white shadow-emerald-600/20 cursor-pointer'
                            }`}
                          >
                            {isDownloadingMedicineReport ? (
                              <>
                                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                <span>Queue Running Safely...</span>
                              </>
                            ) : (
                              <>
                                <span>📑</span>
                                <span>Start Download Queue ({selectedMedDistricts.length > 0 ? selectedMedDistricts.length : availableKpiDistricts.length} Files)</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* On-screen Breakdown Table */}
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                      <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <h5 className="text-xs font-black uppercase tracking-wider text-slate-700">
                          📊 Field Officer Consumption Breakdown
                        </h5>
                        <span className="text-[11px] font-bold text-slate-500">
                          {summaryList.length} Active Officer{summaryList.length === 1 ? '' : 's'}
                        </span>
                      </div>

                      {summaryList.length === 0 ? (
                        <div className="p-8 text-center text-slate-400">
                          <span className="text-3xl block mb-2">💊</span>
                          <p className="text-xs font-bold">No FDC medicine distributions logged for {selectedDistrict} in {month}.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-100/80 text-slate-600 text-[10px] font-black uppercase tracking-wider border-b border-slate-200">
                                <th className="py-2.5 px-4">District</th>
                                <th className="py-2.5 px-4">FO Name</th>
                                <th className="py-2.5 px-4 text-center">Total Patients</th>
                                <th className="py-2.5 px-4 text-center bg-indigo-50/50 text-indigo-900">Adult IP</th>
                                <th className="py-2.5 px-4 text-center bg-indigo-50/50 text-indigo-900">Adult CP</th>
                                <th className="py-2.5 px-4 text-center bg-teal-50/50 text-teal-900">Pediatric IP</th>
                                <th className="py-2.5 px-4 text-center bg-teal-50/50 text-teal-900">Pediatric CP</th>
                                <th className="py-2.5 px-4 text-center bg-emerald-50 text-emerald-900 font-black">Total Strips</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                              {summaryList.map((row, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                                  <td className="py-2.5 px-4 font-bold text-slate-800">{row.district}</td>
                                  <td className="py-2.5 px-4 font-semibold text-slate-700">{row.fo_name}</td>
                                  <td className="py-2.5 px-4 text-center font-bold text-slate-800">{row.total_patients}</td>
                                  <td className="py-2.5 px-4 text-center text-indigo-700 font-semibold">{row.adult_ip}</td>
                                  <td className="py-2.5 px-4 text-center text-indigo-700 font-semibold">{row.adult_cp}</td>
                                  <td className="py-2.5 px-4 text-center text-teal-700 font-semibold">{row.pediatric_ip}</td>
                                  <td className="py-2.5 px-4 text-center text-teal-700 font-semibold">{row.pediatric_cp}</td>
                                  <td className="py-2.5 px-4 text-center font-black text-emerald-700 bg-emerald-50/50">{row.total_strips}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Tab 2: State Summary Excel */}
              {reportsStudioTab === "state_matrix" && (
                <div className="space-y-4">
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                    <h4 className="text-sm font-black text-slate-800 mb-1">Consolidated State Performance Summary (.xlsx)</h4>
                    <p className="text-xs text-slate-500 font-medium mb-4">Executive 1-page table comparing Target, Notifications Achieved, Samples Tested, DBT velocity, and Travel KM.</p>
                    
                    <a
                      href={`${import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com"}/admin/export-state-summary?month=${month}&token=${getAdminToken()}${currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All') ? `&districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}` : ''}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-3 rounded-xl text-xs shadow-md transition-all"
                    >
                      <span>📥</span> Download State Summary Sheet (.xlsx)
                    </a>
                  </div>
                </div>
              )}

              {/* Tab 3: Monthly Staff Attendance Dual-Sheet Workbook */}
              {reportsStudioTab === "staff_attendance" && (
                <div className="space-y-4">
                  <div className="bg-emerald-50/70 p-4 sm:p-5 rounded-2xl border border-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-black text-emerald-950 mb-0.5">Staff Attendance (.xlsx) — Dual-Sheet Matrix &amp; Activity Log</h4>
                      <p className="text-xs text-emerald-700 font-medium">Sheet 1: Monthly Attendance Matrix (P, ML, CL, OD, A, WO, H). Sheet 2: Day-by-Day Activity Log with facility visits and travel KM.</p>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-200/80 text-emerald-900 px-3 py-1 rounded-full shrink-0 self-start sm:self-auto">
                      Month: {month}
                    </span>
                  </div>

                  {/* Multi-District Selection Deck */}
                  <div className="bg-slate-50/90 p-4 sm:p-5 rounded-2xl border border-slate-200/80 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-800">
                          🎯 Choose Districts to Export
                        </span>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${selectedAttendanceDistricts.length > 0 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                          {selectedAttendanceDistricts.length} of {availableAttendanceDistricts.length} Selected
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleSelectAllAttendanceDistricts}
                          disabled={isDownloadingAttendance}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-emerald-100 hover:bg-emerald-200 text-emerald-800 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={handleClearAttendanceDistricts}
                          disabled={isDownloadingAttendance}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {/* District Chips */}
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto custom-scrollbar p-1">
                      {availableAttendanceDistricts.map(dist => {
                        const isSelected = selectedAttendanceDistricts.includes(dist);
                        return (
                          <button
                            key={dist}
                            type="button"
                            disabled={isDownloadingAttendance}
                            onClick={() => handleToggleAttendanceDistrict(dist)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border active:scale-95 cursor-pointer disabled:opacity-50 ${
                              isSelected
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-xs shadow-emerald-600/20'
                                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs'
                            }`}
                          >
                            <span>{isSelected ? '✓' : '+'}</span>
                            <span>{dist}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Live Queue Progress Banner */}
                    {attendanceQueueProgress && (
                      <div className="bg-slate-900 text-white p-4 rounded-2xl border border-emerald-800 shadow-lg space-y-2 animate-fade-in">
                        <div className="flex justify-between items-center text-xs font-bold">
                          <span className="flex items-center gap-2">
                            <span className="animate-spin text-sm">⏳</span>
                            <span>{attendanceQueueProgress.status}</span>
                          </span>
                          <span className="font-mono text-emerald-300">{attendanceQueueProgress.percent}%</span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all duration-300 rounded-full"
                            style={{ width: `${attendanceQueueProgress.percent}%` }}
                          ></div>
                        </div>
                        <p className="text-[10px] text-emerald-300 font-medium">
                          Render memory protection active: generating one file at a time with 1-second server cooldown between requests.
                        </p>
                      </div>
                    )}

                    {/* Multi-District Download Action Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      {/* Option A: Scoped .xlsx Download */}
                      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col justify-between shadow-2xs">
                        <div>
                          <span className="text-xs font-black text-slate-800 flex items-center gap-1.5 mb-1">
                            <span>📊</span>
                            <span>Download Scoped (.xlsx)</span>
                          </span>
                          <p className="text-[11px] text-slate-500 font-medium">
                            Downloads a dual-sheet workbook for <strong>{selectedAttendanceDistricts.length > 0 ? `${selectedAttendanceDistricts.length} selected` : 'all'} district(s)</strong> with attendance matrix and activity logs.
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={isDownloadingAttendance || (selectedAttendanceDistricts.length === 0 && availableAttendanceDistricts.length === 0)}
                          onClick={handleDownloadAttendanceSingleOrScoped}
                          className={`mt-3 w-full font-bold py-2.5 rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 ${
                            isDownloadingAttendance
                              ? 'bg-emerald-400 text-white cursor-wait animate-pulse'
                              : 'bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white shadow-emerald-600/20 cursor-pointer'
                          }`}
                        >
                          {isDownloadingAttendance ? (
                            <>
                              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                              <span>Generating Staff Attendance...</span>
                            </>
                          ) : (
                            <>
                              <span>📥</span>
                              <span>Download Selected ({selectedAttendanceDistricts.length > 0 ? selectedAttendanceDistricts.length : 'All'})</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Option B: Sequential Queue */}
                      <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-200/80 flex flex-col justify-between shadow-2xs">
                        <div>
                          <span className="text-xs font-black text-emerald-950 flex items-center gap-1.5 mb-1">
                            <span>📑</span>
                            <span>Sequential Download Queue</span>
                          </span>
                          <p className="text-[11px] text-emerald-800 font-medium">
                            Downloads individual district `.xlsx` files with a 1-second pause between each file (guarantees zero memory spikes on Render).
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={isDownloadingAttendance || (selectedAttendanceDistricts.length === 0 && availableAttendanceDistricts.length === 0)}
                          onClick={handleDownloadStaffAttendanceQueue}
                          className={`mt-3 w-full font-bold py-2.5 rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 ${
                            isDownloadingAttendance
                              ? 'bg-emerald-400 text-white cursor-wait animate-pulse'
                              : 'bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white shadow-emerald-700/20 cursor-pointer'
                          }`}
                        >
                          {isDownloadingAttendance ? (
                            <>
                              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                              <span>Queue Running Safely...</span>
                            </>
                          ) : (
                            <>
                              <span>📑</span>
                              <span>Start Download Queue ({selectedAttendanceDistricts.length > 0 ? selectedAttendanceDistricts.length : availableAttendanceDistricts.length} Files)</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 4: TB Cascade Conversion Funnel */}
              {reportsStudioTab === "cascade_funnel" && (() => {
                const presumptive = totals.presumptive || 1;
                const tests = totals.tests || 0;
                const notif = totals.notifications || 0;
                const dbt = totals.dbt || 0;
                const tpt = totals.tpt_treatment_start || 0;

                const testConversion = Math.min(100, Math.round((tests / presumptive) * 100));
                const dbtConversion = notif > 0 ? Math.min(100, Math.round((dbt / notif) * 100)) : 0;
                const tptConversion = notif > 0 ? Math.min(100, Math.round((tpt / notif) * 100)) : 0;

                return (
                  <div className="space-y-4">
                    <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800">
                      <h4 className="text-sm font-black text-emerald-400 mb-1">State TB Cascade Conversion Funnel</h4>
                      <p className="text-xs text-slate-400 font-medium">Tracking clinical progression from presumptive screening to treatment completion.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                        <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Presumptive ➔ Tested</span>
                        <p className="text-2xl font-black text-indigo-600">{testConversion}%</p>
                        <p className="text-[10px] font-bold text-slate-500 mt-1">{tests} Tested / {presumptive} Presumptive</p>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                        <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Notification ➔ DBT Seeded</span>
                        <p className="text-2xl font-black text-blue-600">{dbtConversion}%</p>
                        <p className="text-[10px] font-bold text-slate-500 mt-1">{dbt} DBT / {notif} Notifications</p>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                        <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Notification ➔ TPT Start</span>
                        <p className="text-2xl font-black text-teal-600">{tptConversion}%</p>
                        <p className="text-[10px] font-bold text-slate-500 mt-1">{tpt} TPT / {notif} Notifications</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Tab 5: 1-Click WhatsApp State Bulletin */}
              {reportsStudioTab === "whatsapp_bulletin" && (
                <div className="space-y-4">
                  <div className="bg-emerald-50/70 p-5 rounded-2xl border border-emerald-100 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                    <div>
                      <h4 className="text-sm font-black text-emerald-950 mb-1">WhatsApp Executive State Bulletin</h4>
                      <p className="text-xs text-emerald-800 font-medium">Ready-to-broadcast summary formatted with emojis, state totals &amp; district rankings.</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={copyWhatsAppBulletin}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-md shadow-emerald-600/20 active:scale-95 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        <span>📋</span>
                        <span>{copiedBulletin ? '✓ Copied Bulletin!' : 'Copy WhatsApp Bulletin'}</span>
                      </button>
                      <a
                        href={`https://api.whatsapp.com/send?text=${encodeURIComponent(liveWhatsAppBulletin)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-md shadow-emerald-700/20 active:scale-95 transition-all flex items-center gap-1.5 shrink-0"
                      >
                        <span>📱</span>
                        <span>Open in WhatsApp Web</span>
                      </a>
                    </div>
                  </div>

                  <pre className="bg-slate-900 text-emerald-400 font-mono text-xs p-4 rounded-2xl border border-slate-800 overflow-x-auto whitespace-pre-wrap select-all">
                    {liveWhatsAppBulletin}
                  </pre>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button onClick={() => setShowReportsStudio(false)} className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2.5 px-6 rounded-xl transition-all">Close Studio</button>
            </div>

          </div>
        </div>
  );
}
