import React from 'react';
import { APP_VERSION } from '../../changelogData';
import { canonicalizeDistrict } from '../../utils/districtHelpers';
import { getOperationalMonth } from '../../utils/operationalMonth';

export default function AdminHeader({
  rawRecords = [],
  currentUser,
  isSuperAdmin = false,
  month,
  setMonth,
  selectedDistrict,
  setSelectedDistrict,
  districts = [],
  selectedFO,
  setSelectedFO,
  fos = [],
  adminTargetViewMode,
  setAdminTargetViewMode,
  showToast,
  copyDistrictWhatsAppReport,
  copyWhatsAppBulletin,
  lastSyncedTime,
  syncStatus,
  isLoading,
  fetchData,
  fetchAttendance,
  fetchDirectory,
  loadTargets,
  fetchStaffList,
  fetchActiveBroadcasts,
  fetchCascadeAlerts,
  handleHardAppReset,
  hasSeenLatestChangelog,
  setHasSeenLatestChangelog,
  setShowChangelogModal,
  setShowAppGuideModal,
  setSecurityStatusMsg,
  setShowSecurityModal,
  setIsAuthenticated,
  setCurrentUser,
  setShowAdminFeedModal,
  setFeedDistrict,
  setFeedFoName,
  setFeedDate,
  setFeedError,
  setFeedSuccess,
  setFeedCategoryInputs,
  setFeedRemarks,
  availableDistrictsForFeed = [],
  fetchAttendanceRadar,
  setShowAttendanceModal,
  setActiveMainTab,
  setShowNotifTrayModal,
  notifTrayData = { allIds: [] },
  setShowNikshayModal,
  setShowJourneyModal,
  fetchDuplicateAudit,
  fetchDuplicateScan,
  setShowDuplicateModal,
  duplicateAudit,
  duplicateScanData,
  setShowCascadeModal,
  cascadeAlerts = [],
  canEditTargets = false,
  setShowTargetModal,
  setTargetModalDistrict,
  officialTargetsByDistrict = {},
  setOfficialDistrictTarget,
  canManageStaff = false,
  setShowStaffSuite,
  fetchAdminUsers,
  setShowAdminUsersModal,
  fetchRecentIdEdits,
  setShowRecentIdEditsModal,
  setShowReportsStudio,
  setShowTopPerformersModal,
  fetchBackupStatus,
  setShowBackupModal,
  fetchAuditLogs,
  setShowAuditModal,
  fetchAllBroadcasts,
  setShowBroadcastStudio,
  activeAdminBroadcasts = [],
  handleDeleteBroadcast,
  activeMainTab,
  workingDaysInfo = {},
  pacingStats = {}
}) {
  return (
    <>
        <header className="sticky top-0 z-40 command-bar-surface p-3 sm:p-3.5 rounded-2xl shadow-sm border border-slate-200/90 transition-all">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
            
            {/* 1. Left: Brand & Admin Identity */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-teal-200/90 p-0.5 shadow-sm shadow-teal-700/20 flex items-center justify-center shrink-0 overflow-hidden">
                <img src="/dfy-logo.png" alt="Doctors For You Logo" className="w-full h-full object-contain" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">DFY TB Control Center</h1>
                  <div className="flex items-center gap-1.5 bg-teal-50 border border-teal-200/90 px-2.5 py-0.5 rounded-full shadow-2xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-xs font-black text-teal-950">{currentUser?.name || 'Super Admin'}</span>
                    <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      currentUser?.role === 'SUPER_ADMIN'
                        ? 'bg-teal-200/80 text-teal-900'
                        : currentUser?.role === 'MAIN_INCHARGE'
                          ? 'bg-amber-200 text-amber-900 border border-amber-300'
                          : 'bg-slate-200 text-slate-800'
                    }`}>
                      {currentUser?.role === 'SUPER_ADMIN' ? '👑 Super Admin' : currentUser?.role === 'MAIN_INCHARGE' ? '🎖️ Incharge' : '🛡️ Sub Admin'}
                    </span>
                  </div>
                </div>
                <p className="text-slate-500 text-xs font-medium mt-0.5">Monitoring {rawRecords.length} daily reports across Bihar</p>
              </div>
            </div>

            {/* 2. Middle & Right: Scope Filters + Global Utilities */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              {/* Scope Filters Group */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 bg-slate-100/80 border border-slate-200/90 p-1 rounded-xl shadow-inner">
                <input 
                  type="month" 
                  value={month} 
                  onChange={(e) => setMonth(e.target.value)} 
                  className="bg-white border border-slate-200/90 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 shadow-2xs transition-all cursor-pointer" 
                />
                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDistrict('All');
                      setSelectedFO('All');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer ${
                      selectedDistrict === 'All'
                        ? 'bg-teal-700 text-white shadow-xs shadow-teal-700/25'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 shadow-2xs'
                    }`}
                    title="View All Districts"
                  >
                    <span>🌐</span>
                    <span>All</span>
                  </button>
                )}
                <select 
                  value={selectedDistrict} 
                  onChange={(e) => {setSelectedDistrict(e.target.value); setSelectedFO('All');}} 
                  className={`border px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all cursor-pointer ${
                    selectedDistrict !== 'All'
                      ? 'bg-teal-50 border-teal-300 text-teal-900 ring-1 ring-teal-300 shadow-xs'
                      : 'bg-white border-slate-200/90 text-slate-700 shadow-2xs'
                  }`}
                >
                  {districts.map(d => <option key={d} value={d}>{d === 'All' ? 'All Districts' : d}</option>)}
                </select>
                <select 
                  value={selectedFO} 
                  onChange={(e) => setSelectedFO(e.target.value)} 
                  disabled={selectedDistrict === 'All'} 
                  className="bg-white border border-slate-200/90 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 disabled:opacity-40 shadow-2xs cursor-pointer transition-all"
                >
                  {fos.map(f => <option key={f} value={f}>{f === 'All' ? 'All Officers' : f}</option>)}
                </select>

                {/* Target Perspective Global Switch */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/90 shadow-2xs shrink-0" title="Switch between Official State Targets and Frontline Operational Stretch">
                  <button
                    type="button"
                    onClick={() => {
                      setAdminTargetViewMode('official');
                      showToast('Switched to 🏛️ Official District Benchmark view', 'info');
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-black transition-all flex items-center gap-1 cursor-pointer ${
                      adminTargetViewMode === 'official'
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span>🏛️</span>
                    <span>Official</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdminTargetViewMode('frontline');
                      showToast('Switched to 🛵 Frontline Ground Reality view', 'info');
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-black transition-all flex items-center gap-1 cursor-pointer ${
                      adminTargetViewMode === 'frontline'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span>🛵</span>
                    <span>Frontline</span>
                  </button>
                </div>

                {selectedDistrict !== 'All' ? (
                  <button
                    type="button"
                    onClick={() => copyDistrictWhatsAppReport(selectedDistrict)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-black transition-all shadow-xs flex items-center gap-1.5 active:scale-95 cursor-pointer shrink-0 animate-fade-in"
                    title={`1-Click WhatsApp Performance Report for ${selectedDistrict} with Staff Target Achievement %`}
                  >
                    <span>📱</span>
                    <span className="hidden sm:inline">WhatsApp Report</span>
                    <span className="sm:hidden">Report</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={copyWhatsAppBulletin}
                    className="bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 active:scale-95 cursor-pointer shrink-0"
                    title="1-Click WhatsApp State Bulletin"
                  >
                    <span>📱</span>
                    <span className="hidden sm:inline">WhatsApp Bulletin</span>
                    <span className="sm:hidden">Bulletin</span>
                  </button>
                )}
              </div>

              {/* Utility Action Buttons: Refresh, Security, Logout */}
              <div className="flex items-center gap-1.5">
                {lastSyncedTime && (
                  <div 
                    className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[11px] font-bold shadow-2xs transition-all ${
                      syncStatus === 'SYNCING'
                        ? 'bg-amber-50/90 border-amber-300 text-amber-900 animate-pulse'
                        : 'bg-teal-50/80 border-teal-200/90 text-teal-900'
                    }`}
                    title={`Last Synced: ${lastSyncedTime} (${syncStatus === 'UP_TO_DATE' ? 'Data verified up-to-date via delta cache' : 'Live synchronized'})`}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      syncStatus === 'SYNCING' 
                        ? 'bg-amber-500 animate-ping' 
                        : 'bg-emerald-500 shadow-xs shadow-emerald-500/50'
                    }`}></span>
                    <span>{syncStatus === 'SYNCING' ? 'Syncing Live...' : syncStatus === 'UP_TO_DATE' ? 'Cached (Up-to-date)' : 'Live Synced'}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={async () => {
                    const ok = await fetchData(true);
                    await fetchAttendance(true);
                    fetchDirectory();
                    loadTargets('All');
                    fetchStaffList();
                    fetchActiveBroadcasts();
                    if (typeof fetchCascadeAlerts === 'function') fetchCascadeAlerts();
                    if (ok) showToast("✓ Live database refresh complete.", "success");
                  }}
                  disabled={isLoading}
                  className={`bg-gradient-to-r from-teal-700 to-emerald-700 hover:from-teal-800 hover:to-emerald-800 disabled:opacity-50 text-white px-3 py-2 rounded-xl text-xs font-black transition-all shadow-xs shadow-teal-700/20 flex items-center gap-1.5 active:scale-95 cursor-pointer ${
                    isLoading ? 'cursor-wait animate-pulse' : ''
                  }`}
                  title="Click for guaranteed live database refresh."
                >
                  <svg className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <polyline points="1 20 1 14 7 14"></polyline>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                  </svg>
                  <span className="hidden sm:inline">{isLoading ? "Syncing..." : "Refresh"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleHardAppReset}
                  className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/90 px-3 py-2 rounded-xl text-xs font-black transition-all shadow-2xs flex items-center gap-1.5 active:scale-95 cursor-pointer shrink-0"
                  title="App cache clear karke fresh version reload karein"
                >
                  <span>🔄</span>
                  <span className="hidden sm:inline">Reset Cache</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAppGuideModal(true)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 active:scale-95 cursor-pointer"
                  title="Admin SOP Manual & Feature Guide (Sub-Admin Help Center)"
                >
                  <span>📘</span>
                  <span className="hidden sm:inline">SOP</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowRecentIdEditsModal(true);
                    fetchRecentIdEdits();
                  }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 active:scale-95 cursor-pointer"
                  title="View all Patient ID additions, edits, and deletions across the past 7 days"
                >
                  <span>🕒</span>
                  <span className="hidden sm:inline">History</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowChangelogModal(true);
                    setHasSeenLatestChangelog(true);
                    try { localStorage.setItem('dfy_last_seen_changelog', APP_VERSION); } catch (e) {}
                  }}
                  className="relative bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 active:scale-95 cursor-pointer"
                  title="View Application Updates & Release Changelog"
                >
                  {!hasSeenLatestChangelog && (
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                  )}
                  <span>🚀</span>
                  <span>v{APP_VERSION}</span>
                </button>

                {isSuperAdmin && (
                  <button 
                    type="button"
                    onClick={() => { setSecurityStatusMsg(''); setShowSecurityModal(true); }} 
                    className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 active:scale-95 cursor-pointer" 
                    title="Admin Security Settings & Change Password"
                  >
                    <span>⚙️</span>
                    <span className="hidden sm:inline">Security</span>
                  </button>
                )}

                {isSuperAdmin && (
                  <button 
                    type="button"
                    onClick={() => { setShowBackupModal(true); fetchBackupStatus(); }} 
                    className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 active:scale-95 cursor-pointer" 
                    title="Automated Daily Cloud Backups (Google Cloud Storage Mumbai)"
                  >
                    <span>💾</span>
                    <span className="hidden sm:inline">Backups</span>
                  </button>
                )}

                <button 
                  type="button"
                  onClick={() => {
                    try {
                      localStorage.removeItem('dfy_admin_auth');
                      localStorage.removeItem('dfy_admin_user');
                    } catch (e) {}
                    setCurrentUser(null);
                    setIsAuthenticated(false);
                    window.location.href = '/';
                  }} 
                  className="bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 active:scale-95 cursor-pointer"
                  title="Logout from Admin Portal"
                >
                  <span>🚪</span>
                  <span>Logout</span>
                </button>
              </div>
            </div>

          </div>
        </header>

        {/* Day 1 Month-End Grace Period Alert Banner */}
        {getOperationalMonth().isMonthEndGracePeriod && (
          <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 rounded-2xl p-3 flex items-center justify-between text-xs text-amber-900">
            <div className="flex items-center gap-2 font-bold">
              <span className="text-base">⏳</span>
              <span><strong>Month-End Close Window Active:</strong> Reporting for {getOperationalMonth().graceClosingMonth} remains open until 12:00 PM Noon today. Showing {month} data.</span>
            </div>
            {month !== getOperationalMonth().activeCalendarMonth && (
              <button onClick={() => setMonth(getOperationalMonth().activeCalendarMonth)} className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition-colors shrink-0">
                Switch to {getOperationalMonth().activeCalendarMonth}
              </button>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* --- TIER 2: COMMAND DECK (ORGANIZED FUNCTIONAL CLUSTERS) --- */}
        {/* ========================================================================= */}
        <div className="bg-white/95 backdrop-blur-md p-3.5 sm:p-4 rounded-2xl shadow-xs border border-slate-200/80">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3">
            
            {/* CLUSTER 1: 🩺 CLINICAL & RECONCILIATION (5 cols on LG) */}
            <div className="lg:col-span-5 bg-gradient-to-br from-emerald-50/60 to-teal-50/40 border border-emerald-200/80 rounded-2xl p-3 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                  <span>🩺</span>
                  <span>Clinical &amp; Nikshay Verification</span>
                </span>
                <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100/70 px-1.5 py-0.2 rounded">5 Tools</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => setShowNotifTrayModal(true)} 
                  className="bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer col-span-2" 
                  title="Daily Notification Verification Tray - Rapid Nikshay 1-click copy"
                >
                  <span>📋</span>
                  <span className="truncate">Daily Notification Tray</span>
                  {notifTrayData.allIds.length > 0 && (
                    <span className="bg-amber-800 text-white px-1.5 py-0.2 rounded-full text-[9px] font-black">
                      {notifTrayData.allIds.length} IDs
                    </span>
                  )}
                </button>

                <button 
                  onClick={() => setShowNikshayModal(true)} 
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer" 
                  title="Upload official Nikshay Excel/CSV dump and auto-reconcile against field reports"
                >
                  <span>⚖️</span>
                  <span className="truncate">Nikshay Reconciler</span>
                </button>

                <button 
                  onClick={() => setShowJourneyModal(true)} 
                  className="bg-sky-600 hover:bg-sky-700 text-white px-2.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer" 
                  title="Track complete longitudinal clinical pathway of any patient ID"
                >
                  <span>🔍</span>
                  <span className="truncate">Patient Journey</span>
                </button>

                <button 
                  onClick={() => {
                    fetchDuplicateAudit();
                    fetchDuplicateScan();
                    setShowDuplicateModal(true);
                  }} 
                  className="bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer relative" 
                  title="Cross-Officer Duplicate Patient ID Radar"
                >
                  <span>🛡️</span>
                  <span className="truncate">Duplicate Radar</span>
                  {((duplicateAudit?.total_duplicate_ids || 0) + (duplicateScanData?.total_inflated_count || 0)) > 0 && (
                    <span className="bg-rose-600 text-white px-1.5 py-0.2 rounded-full text-[9px] font-black">
                      {(duplicateAudit?.total_duplicate_ids || 0) + (duplicateScanData?.total_inflated_count || 0)}
                    </span>
                  )}
                </button>

                <button 
                  onClick={() => {
                    fetchCascadeAlerts();
                    setShowCascadeModal(true);
                  }} 
                  className="bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 active:scale-95 animate-pulse cursor-pointer" 
                  title="Predictive Clinical Cascade & Patient Dropout Radar"
                >
                  <span>🚨</span>
                  <span className="truncate">Cascade Alerts</span>
                </button>
              </div>
            </div>

            {/* CLUSTER 2: 👥 STAFF OPERATIONS & TARGETS (4 cols on LG) */}
            <div className="lg:col-span-4 bg-gradient-to-br from-indigo-50/60 to-purple-50/40 border border-indigo-200/80 rounded-2xl p-3 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-800 flex items-center gap-1">
                  <span>👥</span>
                  <span>Staff Ops &amp; Targets</span>
                </span>
                <span className="text-[9px] font-bold text-indigo-600 bg-indigo-100/70 px-1.5 py-0.2 rounded">4 Tools</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => setActiveMainTab('staff_pacing')} 
                  className={`px-2.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 active:scale-95 relative cursor-pointer ${
                    activeMainTab === 'staff_pacing'
                      ? 'bg-amber-500 text-white shadow-amber-500/20 ring-2 ring-amber-300'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                  title="Open Staff Target Pacing, Forecasting & Comparison Studio"
                >
                  <span>🎯</span>
                  <span className="truncate">Staff Pacing</span>
                  {pacingStats.critical > 0 && (
                    <span className="bg-rose-500 text-white px-1.5 py-0.2 rounded-full text-[9px] font-black animate-pulse">
                      {pacingStats.critical}
                    </span>
                  )}
                </button>

                {canManageStaff && (
                  <button 
                    onClick={() => {
                      fetchStaffList();
                      setShowStaffSuite(true);
                    }} 
                    className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer" 
                    title="Manage Staff Members, Reset PINs & Export PIN Directory"
                  >
                    <span>👥</span>
                    <span className="truncate">Staff &amp; PINs</span>
                  </button>
                )}

                {canEditTargets && (
                  <button 
                    onClick={() => {
                      const initDist = selectedDistrict !== 'All' ? selectedDistrict : 'All';
                      setTargetModalDistrict(initDist);
                      if (initDist !== 'All') {
                        const cD = canonicalizeDistrict(initDist);
                        if (officialTargetsByDistrict && officialTargetsByDistrict[cD] !== undefined) {
                          setOfficialDistrictTarget(officialTargetsByDistrict[cD]);
                        }
                      }
                      loadTargets('All');
                      fetchDirectory();
                      setShowTargetModal(true);
                    }} 
                    className="bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer" 
                    title="Set Monthly Notification Targets for All Staff"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
                    <span className="truncate">Set Targets</span>
                  </button>
                )}

                <button 
                  onClick={() => {
                    fetchAllBroadcasts();
                    setShowBroadcastStudio(true);
                  }} 
                  className="bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 active:scale-95 relative cursor-pointer" 
                  title="Broadcast urgent alerts and notices to field staff and sub-admins"
                >
                  <span>📢</span>
                  <span className="truncate">Broadcasts</span>
                  {activeAdminBroadcasts.length > 0 && (
                    <span className="bg-rose-500 text-white px-1.5 py-0.2 rounded-full text-[9px] font-black animate-pulse">
                      {activeAdminBroadcasts.length}
                    </span>
                  )}
                </button>

                <button 
                  onClick={() => {
                    const fallbackDist = selectedDistrict !== 'All' ? selectedDistrict : (availableDistrictsForFeed[0] || '');
                    setFeedDistrict(fallbackDist);
                    setFeedFoName(selectedFO !== 'All' ? selectedFO : '');
                    setFeedDate(new Date().toISOString().slice(0, 10));
                    setFeedCategoryInputs({});
                    setFeedRemarks('');
                    setFeedError('');
                    setFeedSuccess('');
                    setShowAdminFeedModal(true);
                  }} 
                  className="col-span-2 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-700 hover:to-purple-700 text-white px-2.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer" 
                  title="Feed or backfill patient IDs for any Field Officer on any date (Backdated / Current)"
                >
                  <span>📝</span>
                  <span className="truncate">Feed Field Officer IDs (Any Date)</span>
                </button>
              </div>
            </div>

            {/* CLUSTER 3 & 4: 📊 REPORTS & 🔐 GOVERNANCE (3 cols on LG) */}
            <div className="lg:col-span-3 flex flex-col gap-2.5">
              {/* Reports Studio High-Priority Box */}
              <button 
                onClick={() => setShowReportsStudio(true)} 
                className="w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-700 hover:to-purple-800 text-white p-2.5 rounded-2xl text-xs font-black shadow-md shadow-indigo-600/20 active:scale-95 transition-all flex items-center justify-between cursor-pointer border border-indigo-400/30 group" 
                title="Open 5-in-1 Executive Reports & Export Studio"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base p-1 bg-white/20 rounded-lg group-hover:scale-110 transition-transform">📊</span>
                  <div className="text-left">
                    <span className="block font-black text-xs">Reports Studio</span>
                    <span className="block text-[10px] text-indigo-100 font-medium">5-in-1 DTO &amp; MIS Exports</span>
                  </div>
                </div>
                <span className="text-white/80 group-hover:translate-x-1 transition-transform">&rarr;</span>
              </button>

              {/* Governance Cluster (Super Admin Only) */}
              {isSuperAdmin && (
                <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <span>🔐</span>
                      <span>Governance</span>
                    </span>
                    <span className="text-[9px] font-bold text-slate-400">Admin</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button 
                      onClick={() => {
                        fetchAdminUsers();
                        setShowAdminUsersModal(true);
                      }} 
                      className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-2 py-1.5 rounded-xl text-[11px] font-bold transition-all shadow-2xs flex items-center justify-center gap-1 active:scale-95 cursor-pointer" 
                      title="Manage Admin & MIS Accounts, Permitted Districts and Permissions"
                    >
                      <span>👥</span>
                      <span className="truncate">Admins</span>
                    </button>
                    <button 
                      onClick={() => {
                        fetchAuditLogs();
                        setShowAuditModal(true);
                      }} 
                      className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-2 py-1.5 rounded-xl text-[11px] font-bold transition-all shadow-2xs flex items-center justify-center gap-1 active:scale-95 cursor-pointer" 
                      title="View Audit Logs of all Target changes, ID edits, and Admin actions"
                    >
                      <span>📜</span>
                      <span className="truncate">Audit Trail</span>
                    </button>
                    <button 
                      onClick={() => {
                        fetchBackupStatus();
                        setShowBackupModal(true);
                      }} 
                      className="bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-1.5 rounded-xl text-[11px] font-bold transition-all shadow-2xs flex items-center justify-center gap-1 active:scale-95 cursor-pointer" 
                      title="Automated Daily Cloud Backups & Disaster Recovery"
                    >
                      <span>💾</span>
                      <span className="truncate">Backups</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Active Broadcasts & Alert Bulletin */}
        {activeAdminBroadcasts && activeAdminBroadcasts.length > 0 && (
          <div className="space-y-3 animate-fade-in">
            {activeAdminBroadcasts.map((b) => {
              const isHigh = b.priority === 'HIGH';
              const isMedium = b.priority === 'MEDIUM';
              const borderClass = isHigh ? 'border-rose-300 bg-rose-50/80 text-rose-950' : isMedium ? 'border-amber-300 bg-amber-50/80 text-amber-950' : 'border-indigo-200 bg-indigo-50/80 text-indigo-950';
              const badgeClass = isHigh ? 'bg-rose-600 text-white' : isMedium ? 'bg-amber-500 text-white' : 'bg-indigo-600 text-white';
              const icon = isHigh ? '🚨' : isMedium ? '⚠️' : '📢';
              const distLabel = b.target_districts?.includes('All') ? 'Statewide (All Districts)' : (b.target_districts || []).join(', ');

              return (
                <div key={b.id} className={`p-4 sm:p-5 rounded-2xl border shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all ${borderClass}`}>
                  <div className="flex items-start gap-3.5 flex-1">
                    <div className="text-2xl mt-0.5 shrink-0 select-none">{icon}</div>
                    <div className="space-y-1 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${badgeClass}`}>
                          {b.priority || 'MEDIUM'} NOTICE
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 bg-white/80 border border-slate-200/60 px-2 py-0.5 rounded-md">
                          🎯 {b.target_audience === 'FIELD_STAFF' ? 'Field Staff' : b.target_audience === 'SUB_ADMINS' ? 'Sub-Admins' : 'All Team'}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 bg-white/80 border border-slate-200/60 px-2 py-0.5 rounded-md">
                          📍 {distLabel}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium ml-auto md:ml-0">
                          {b.created_at ? new Date(b.created_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                      <h4 className="text-sm font-black tracking-tight">{b.title}</h4>
                      <p className="text-xs font-medium leading-relaxed opacity-90 whitespace-pre-wrap">{b.message}</p>
                      <p className="text-[10px] font-bold opacity-60">Posted by: {b.created_by_user} ({b.created_by_role === 'SUPER_ADMIN' ? 'Super Admin' : 'Sub-Admin'})</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                    {(isSuperAdmin || b.created_by_user === currentUser?.username || b.created_by_user === currentUser?.name) && (
                      <button
                        onClick={() => handleDeleteBroadcast(b.id)}
                        className="bg-white/90 hover:bg-rose-600 hover:text-white text-rose-700 border border-rose-200 text-xs font-bold px-3 py-1.5 rounded-xl transition-all shadow-2xs active:scale-95 flex items-center gap-1"
                        title="Delete Broadcast (instantly removes for all staff)"
                      >
                        <span>🗑️</span>
                        <span>Delete</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        fetchAllBroadcasts();
                        setShowBroadcastStudio(true);
                      }}
                      className="bg-white/90 hover:bg-white text-slate-700 border border-slate-200/80 text-xs font-bold px-3 py-1.5 rounded-xl transition-all shadow-2xs active:scale-95 flex items-center gap-1"
                    >
                      <span>📢</span>
                      <span>Studio</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Primary Dashboard Navigation Tabs */}
        <div className="sticky top-[72px] sm:top-[76px] z-30 bg-white/95 backdrop-blur-md p-2 sm:p-2.5 rounded-2xl shadow-sm border border-slate-200/90 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 animate-fade-in transition-all">
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 md:pb-0 custom-scrollbar">
            <button
              type="button"
              onClick={() => setActiveMainTab('overview')}
              className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs transition-all flex items-center gap-2 active:scale-95 shrink-0 cursor-pointer ${
                activeMainTab === 'overview'
                  ? 'bg-teal-700 text-white shadow-sm shadow-teal-700/25 font-black'
                  : 'bg-slate-50 hover:bg-teal-50/70 text-slate-700 hover:text-teal-900 border border-slate-200/90 font-bold'
              }`}
            >
              <span>📊</span>
              <span>{isSuperAdmin ? 'Overview & State Analytics' : `Overview & District Analytics (${selectedDistrict !== 'All' ? selectedDistrict : (currentUser?.allowed_districts || []).join(', ')})`}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMainTab('staff_pacing')}
              className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs transition-all flex items-center gap-2 active:scale-95 shrink-0 relative cursor-pointer ${
                activeMainTab === 'staff_pacing'
                  ? 'bg-teal-700 text-white shadow-sm shadow-teal-700/25 font-black'
                  : 'bg-slate-50 hover:bg-teal-50/70 text-slate-700 hover:text-teal-900 border border-slate-200/90 font-bold'
              }`}
            >
              <span>🎯</span>
              <span>Staff Pacing &amp; Peer Comparison</span>
              {pacingStats.critical > 0 && (
                <span className="bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full animate-pulse tabular-num">
                  {pacingStats.critical} At Risk
                </span>
              )}
            </button>
            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => setActiveMainTab('district_benchmarks')}
                className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs transition-all flex items-center gap-2 active:scale-95 shrink-0 cursor-pointer ${
                  activeMainTab === 'district_benchmarks'
                    ? 'bg-teal-700 text-white shadow-sm shadow-teal-700/25 font-black'
                    : 'bg-slate-50 hover:bg-teal-50/70 text-slate-700 hover:text-teal-900 border border-slate-200/90 font-bold'
                }`}
              >
                <span>🏢</span>
                <span>District Benchmarks &amp; Pacing</span>
              </button>
            )}
            {(isSuperAdmin || currentUser?.role === 'MAIN_INCHARGE') && (
              <button
                type="button"
                onClick={() => setActiveMainTab('travel_allowance')}
                className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs transition-all flex items-center gap-2 active:scale-95 shrink-0 cursor-pointer ${
                  activeMainTab === 'travel_allowance'
                    ? 'bg-teal-700 text-white shadow-sm shadow-teal-700/25 font-black'
                    : 'bg-slate-50 hover:bg-teal-50/70 text-slate-700 hover:text-teal-900 border border-slate-200/90 font-bold'
                }`}
              >
                <span>🏍️</span>
                <span>Travel Allowance Statewide</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] font-bold text-teal-950 px-3 py-1.5 bg-teal-50/80 rounded-xl border border-teal-200/90 self-start md:self-auto tabular-num">
            <span>📅 {month}</span>
            <span className="text-teal-300">&bull;</span>
            <span>{workingDaysInfo.totalWorkingDays} Working Days ({workingDaysInfo.elapsedWorkingDays} Elapsed, {workingDaysInfo.remainingWorkingDays} Left)</span>
          </div>
        </div>


    </>
  );
}
