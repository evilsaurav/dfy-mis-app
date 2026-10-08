import React, { useState, useEffect, useMemo } from 'react';

export default function TravelAllowanceTab({
  activeMainTab,
  month,
  _setMonth,
  statewideSummary,
  loadingStatewideSummary,
  statewideSummaryError,
  fetchStatewideSummary,
  onInspectDistrict,
  handleExportExcel,
  showToast,
  _isSuperAdmin,
  _isIncharge
}) {
  // ── 1. useState Declarations (TDZ Safe lexical order) ────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'PENDING' | 'APPROVED' | 'DISPUTES'
  const [viewMode, setViewMode] = useState('CARDS'); // 'CARDS' | 'TABLE'
  const [sortField, setSortField] = useState('district'); // 'district' | 'final_payable_amount' | 'total_km' | 'completion_pct'
  const [sortAsc, setSortAsc] = useState(true);
  const [isExportingStatewide, setIsExportingStatewide] = useState(false);

  // ── 2. useEffect ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeMainTab === 'travel_allowance') {
      fetchStatewideSummary?.(month);
    }
  }, [activeMainTab, month, fetchStatewideSummary]);

  // ── 3. useMemo Derivations ───────────────────────────────────────────────────
  const summary = statewideSummary?.summary || {
    total_districts: 0,
    total_officers: 0,
    total_km: 0,
    total_gross: 0,
    total_deductions: 0,
    total_payable: 0,
    approved_districts: 0,
    pending_districts: 0,
    disputed_districts: 0,
    overall_completion_pct: 0
  };

  const rawDistricts = useMemo(() => statewideSummary?.districts || [], [statewideSummary?.districts]);
  const ratePerKm = statewideSummary?.rate_per_km ?? 4.0;

  // Filtered & Sorted districts list
  const filteredDistricts = useMemo(() => {
    let list = rawDistricts;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(d => (d.district || '').toLowerCase().includes(q));
    }

    // Status filter chip
    if (statusFilter === 'APPROVED') {
      list = list.filter(d => d.status === 'APPROVED');
    } else if (statusFilter === 'PENDING') {
      list = list.filter(d => d.submitted_count > 0 || d.status === 'SUBMITTED');
    } else if (statusFilter === 'DISPUTES') {
      list = list.filter(d => d.dispute_count > 0 || d.status === 'DISPUTED');
    }

    // Sorting
    return [...list].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (typeof valA === 'string') {
        const cmp = valA.localeCompare(valB || '');
        return sortAsc ? cmp : -cmp;
      }
      valA = Number(valA || 0);
      valB = Number(valB || 0);
      return sortAsc ? valA - valB : valB - valA;
    });
  }, [rawDistricts, searchQuery, statusFilter, sortField, sortAsc]);

  // Handlers
  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === 'district');
    }
  };

  const handleDownloadConsolidated = async () => {
    if (isExportingStatewide) return;
    setIsExportingStatewide(true);
    try {
      if (handleExportExcel) {
        await handleExportExcel();
      } else {
        if (showToast) showToast('Statewide export initiated.', 'info');
      }
    } catch (err) {
      console.error('Statewide excel error:', err);
      if (showToast) showToast('Failed to export statewide report.', 'error');
    } finally {
      setIsExportingStatewide(false);
    }
  };

  // Guard: Tab must be active to render
  if (activeMainTab !== 'travel_allowance') return null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── 1. Top Executive Banner & Controls Bar ────────────────────────────── */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/90 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center font-black text-2xl shadow-inner shrink-0 border border-teal-100">
            🏍️
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                Statewide Travel Allowance Command Deck
              </h3>
              <span className="text-[10px] font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full tabular-num">
                📅 {month}
              </span>
              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full border shadow-2xs bg-emerald-50 text-emerald-800 border-emerald-200">
                ⚡ Rate: ₹{ratePerKm.toFixed(2)}/KM
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Unified cross-district TA reconciliation, financial audits &amp; approval pacing across {rawDistricts.length} active districts.
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap self-stretch md:self-auto justify-end">
          <button
            type="button"
            onClick={() => fetchStatewideSummary?.(month, true)}
            disabled={loadingStatewideSummary}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
            title="Force refresh statewide TA data"
          >
            <span className={loadingStatewideSummary ? 'animate-spin' : ''}>🔄</span>
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadConsolidated}
            disabled={isExportingStatewide}
            className="px-4 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-teal-700 to-emerald-700 hover:from-teal-800 hover:to-emerald-800 text-white shadow-sm shadow-teal-700/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
            title="Download multi-sheet consolidated Excel workbook for all districts"
          >
            <span>📥</span>
            <span>{isExportingStatewide ? 'Generating...' : 'Export State Excel'}</span>
          </button>
        </div>
      </div>

      {statewideSummaryError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-800 flex items-center justify-between shadow-2xs">
          <span>⚠️ {statewideSummaryError}</span>
          <button
            type="button"
            onClick={() => fetchStatewideSummary?.(month, true)}
            className="underline hover:text-rose-950 font-black cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── 2. Top 4 Executive KPI Hero Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Net Payable */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm relative overflow-hidden group hover:border-teal-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold mb-2">
            <span className="flex items-center gap-1.5">
              <span>💰</span>
              <span>Total State Payable</span>
            </span>
            <span className="text-[10px] bg-teal-50 text-teal-800 px-2 py-0.5 rounded-md font-black">
              Net Amount
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight tabular-num">
            ₹{summary.total_payable ? summary.total_payable.toLocaleString('en-IN') : '0'}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 font-semibold flex items-center justify-between pt-2 border-t border-slate-100">
            <span>Gross: ₹{summary.total_gross ? summary.total_gross.toLocaleString('en-IN') : '0'}</span>
            <span className="text-rose-600 font-bold">
              Ded: -₹{summary.total_deductions ? summary.total_deductions.toLocaleString('en-IN') : '0'}
            </span>
          </div>
        </div>

        {/* KPI 2: Total Distance Logged */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm relative overflow-hidden group hover:border-teal-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold mb-2">
            <span className="flex items-center gap-1.5">
              <span>🏍️</span>
              <span>Total Distance Logged</span>
            </span>
            <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-black">
              {summary.total_officers || 0} Staff
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight tabular-num">
            {summary.total_km ? summary.total_km.toLocaleString('en-IN') : '0'} <span className="text-base text-slate-500 font-bold">KM</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 font-semibold flex items-center justify-between pt-2 border-t border-slate-100">
            <span>Avg / Staff: {summary.total_officers > 0 ? (summary.total_km / summary.total_officers).toFixed(1) : 0} KM</span>
            <span className="text-teal-700 font-bold">Active Bihar Staff</span>
          </div>
        </div>

        {/* KPI 3: District Approval Progress */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm relative overflow-hidden group hover:border-teal-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold mb-2">
            <span className="flex items-center gap-1.5">
              <span>🎯</span>
              <span>Verification Completion</span>
            </span>
            <span className="text-[10px] bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-md font-black">
              {summary.overall_completion_pct || 0}%
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight tabular-num">
            {summary.approved_districts || 0} <span className="text-base text-slate-400 font-normal">/ {summary.total_districts || 0} Districts</span>
          </div>
          {/* Progress Bar */}
          <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-teal-500 to-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, summary.overall_completion_pct || 0))}%` }}
            />
          </div>
        </div>

        {/* KPI 4: Leadership Attention Radar */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm relative overflow-hidden group hover:border-amber-300 transition-all">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold mb-2">
            <span className="flex items-center gap-1.5">
              <span>⚠️</span>
              <span>Action Radar</span>
            </span>
            <span className="text-[10px] bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md font-black">
              Leadership
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xl sm:text-2xl font-black text-amber-600 tracking-tight tabular-num">
              {summary.pending_districts || 0} <span className="text-xs text-slate-500 font-bold">Pending</span>
            </div>
            <span className="text-slate-300">&bull;</span>
            <div className="text-xl sm:text-2xl font-black text-rose-600 tracking-tight tabular-num">
              {summary.disputed_districts || 0} <span className="text-xs text-slate-500 font-bold">Disputes</span>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 font-semibold flex items-center justify-between pt-2 border-t border-slate-100">
            <span>Requires Incharge Action</span>
            <span className="text-amber-700 font-bold">Click Review Below &darr;</span>
          </div>
        </div>
      </div>

      {/* ── 3. Filter Controls & View Switcher ─────────────────────────────────── */}
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/90 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search & Status Filters */}
        <div className="flex items-center gap-2 flex-wrap flex-1">
          {/* Search Box */}
          <div className="relative min-w-[220px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search district name..."
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-black cursor-pointer"
              >
                &times;
              </button>
            )}
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              All Districts ({rawDistricts.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('PENDING')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'PENDING'
                  ? 'bg-amber-500 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-amber-50 border border-slate-200'
              }`}
            >
              🟡 Pending Review ({summary.pending_districts || 0})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('APPROVED')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'APPROVED'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-emerald-50 border border-slate-200'
              }`}
            >
              🟢 Fully Approved ({summary.approved_districts || 0})
            </button>
            {summary.disputed_districts > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter('DISPUTES')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === 'DISPUTES'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'bg-white text-rose-700 hover:bg-rose-50 border border-rose-200'
                }`}
              >
                🔴 Active Disputes ({summary.disputed_districts})
              </button>
            )}
          </div>
        </div>

        {/* View Switcher: Cards vs Table */}
        <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 shrink-0 self-start md:self-auto shadow-2xs">
          <button
            type="button"
            onClick={() => setViewMode('CARDS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'CARDS'
                ? 'bg-teal-700 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🎴</span>
            <span>Bento Cards</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('TABLE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'TABLE'
                ? 'bg-teal-700 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>📋</span>
            <span>Detailed Table</span>
          </button>
        </div>
      </div>

      {/* ── 4. Main Content Area ─────────────────────────────────────────────── */}
      {loadingStatewideSummary ? (
        // Loading Skeleton
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 h-48 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="bg-slate-200 h-4 w-1/2 rounded-md" />
                <div className="bg-slate-100 h-3 w-3/4 rounded-md" />
              </div>
              <div className="bg-slate-200 h-6 w-1/3 rounded-md" />
              <div className="bg-slate-100 h-8 rounded-xl" />
            </div>
          ))}
        </div>
      ) : filteredDistricts.length === 0 ? (
        // Empty State
        <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-3">
          <div className="text-4xl select-none">🏍️</div>
          <h4 className="text-base font-black text-slate-800">No District Travel Records Found</h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {searchQuery
              ? `No district matching "${searchQuery}" was found for ${month}.`
              : `No travel allowance logs have been filed for ${month} yet. Sub-Admins will populate rosters as daily field reports are filed.`}
          </p>
        </div>
      ) : viewMode === 'CARDS' ? (
        // ── View Mode A: Dynamic Bento Cards Grid ──────────────────────────────
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredDistricts.map((d) => {
            const isApproved = d.status === 'APPROVED';
            const isDisputed = d.dispute_count > 0 || d.status === 'DISPUTED';
            const isSubmitted = d.submitted_count > 0 || d.status === 'SUBMITTED';
            const isReverted = d.reverted_count > 0;

            let badgeBg = 'bg-slate-100 text-slate-700 border-slate-200';
            let badgeText = '⚪ Draft / In Progress';

            if (isApproved) {
              badgeBg = 'bg-emerald-50 text-emerald-800 border-emerald-200';
              badgeText = '🟢 Fully Approved';
            } else if (isDisputed) {
              badgeBg = 'bg-rose-50 text-rose-800 border-rose-200';
              badgeText = `🔴 ${d.dispute_count} Dispute(s)`;
            } else if (isReverted) {
              badgeBg = 'bg-rose-50 text-rose-800 border-rose-200';
              badgeText = '🟠 Reverted';
            } else if (isSubmitted) {
              badgeBg = 'bg-amber-50 text-amber-800 border-amber-200';
              badgeText = '🟡 Pending Review';
            }

            return (
              <div
                key={d.district}
                className="bg-white rounded-2xl border border-slate-200/90 hover:border-teal-400/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group"
              >
                {/* Card Header */}
                <div className="p-4 sm:p-5 pb-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h4 className="text-base font-black text-slate-900 group-hover:text-teal-700 transition-colors">
                        📍 {d.district}
                      </h4>
                      <span className="text-[11px] font-bold text-slate-500">
                        {d.total_officers} Field Officer{d.total_officers !== 1 ? 's' : ''}
                      </span>
                    </div>

                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border shadow-2xs ${badgeBg}`}>
                      {badgeText}
                    </span>
                  </div>

                  {/* Visual Progress Bar */}
                  <div className="space-y-1 my-3">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                      <span>Approval Pacing</span>
                      <span className="tabular-num font-black text-slate-700">
                        {d.approved_count} / {d.total_officers} ({d.completion_pct}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isApproved
                            ? 'bg-emerald-500'
                            : isDisputed
                            ? 'bg-rose-500'
                            : isSubmitted
                            ? 'bg-amber-500'
                            : 'bg-teal-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, d.completion_pct || 0))}%` }}
                      />
                    </div>
                  </div>

                  {/* Financial Stats */}
                  <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase">Distance</span>
                      <span className="text-xs font-black text-slate-800 tabular-num">
                        {d.total_km ? d.total_km.toLocaleString('en-IN') : 0} KM
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase">Net Payable</span>
                      <span className="text-sm font-black text-slate-900 tabular-num">
                        ₹{d.final_payable_amount ? d.final_payable_amount.toLocaleString('en-IN') : 0}
                      </span>
                    </div>
                  </div>

                  {d.deduction_amount > 0 && (
                    <div className="mt-2 text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md inline-block">
                      -₹{d.deduction_amount.toLocaleString('en-IN')} Deductions
                    </div>
                  )}
                </div>

                {/* Card Action Footer */}
                <div className="p-3 bg-slate-50/70 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => onInspectDistrict?.(d.district)}
                    className="w-full bg-white hover:bg-teal-50 text-slate-700 hover:text-teal-800 border border-slate-200 hover:border-teal-200 py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 cursor-pointer"
                  >
                    <span>🔍</span>
                    <span>Inspect &amp; Review Roster</span>
                    <span className="text-slate-400">&rarr;</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // ── View Mode B: Detailed Executive Table ───────────────────────────────
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-black uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">#</th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-slate-800 select-none"
                    onClick={() => handleSort('district')}
                  >
                    District {sortField === 'district' ? (sortAsc ? '▲' : '▼') : ''}
                  </th>
                  <th className="py-3 px-4 text-center">Officers</th>
                  <th
                    className="py-3 px-4 text-right cursor-pointer hover:text-slate-800 select-none"
                    onClick={() => handleSort('total_km')}
                  >
                    Total KM {sortField === 'total_km' ? (sortAsc ? '▲' : '▼') : ''}
                  </th>
                  <th className="py-3 px-4 text-right">Gross (₹)</th>
                  <th className="py-3 px-4 text-right text-rose-600">Deduct (₹)</th>
                  <th
                    className="py-3 px-4 text-right cursor-pointer hover:text-slate-800 select-none"
                    onClick={() => handleSort('final_payable_amount')}
                  >
                    Net Payable (₹) {sortField === 'final_payable_amount' ? (sortAsc ? '▲' : '▼') : ''}
                  </th>
                  <th
                    className="py-3 px-4 text-center cursor-pointer hover:text-slate-800 select-none"
                    onClick={() => handleSort('completion_pct')}
                  >
                    Approval Pacing {sortField === 'completion_pct' ? (sortAsc ? '▲' : '▼') : ''}
                  </th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDistricts.map((d, idx) => {
                  const isApproved = d.status === 'APPROVED';
                  const isDisputed = d.dispute_count > 0 || d.status === 'DISPUTED';
                  const isSubmitted = d.submitted_count > 0 || d.status === 'SUBMITTED';

                  return (
                    <tr key={d.district} className="hover:bg-teal-50/30 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-400">{idx + 1}</td>
                      <td className="py-3 px-4 font-black text-slate-800">
                        📍 {d.district}
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-600">
                        {d.total_officers}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-800 tabular-num">
                        {d.total_km ? d.total_km.toLocaleString('en-IN') : 0}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-600 tabular-num">
                        ₹{d.gross_amount ? d.gross_amount.toLocaleString('en-IN') : 0}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-rose-600 tabular-num">
                        {d.deduction_amount > 0 ? `-₹${d.deduction_amount.toLocaleString('en-IN')}` : '₹0'}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-slate-900 tabular-num">
                        ₹{d.final_payable_amount ? d.final_payable_amount.toLocaleString('en-IN') : 0}
                      </td>
                      <td className="py-3 px-4 text-center font-bold tabular-num">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="text-[11px] font-black">{d.approved_count}/{d.total_officers}</span>
                          <span className="text-[10px] text-slate-400">({d.completion_pct}%)</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`text-[10px] font-black px-2 py-0.5 rounded-full border shadow-2xs ${
                            isApproved
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : isDisputed
                              ? 'bg-rose-50 text-rose-800 border-rose-200'
                              : isSubmitted
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {isApproved
                            ? '🟢 Approved'
                            : isDisputed
                            ? `🔴 Dispute (${d.dispute_count})`
                            : isSubmitted
                            ? '🟡 Submitted'
                            : '⚪ Draft'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => onInspectDistrict?.(d.district)}
                          className="px-2.5 py-1 bg-white hover:bg-teal-50 text-teal-800 border border-teal-200 rounded-lg text-[11px] font-bold transition-all shadow-2xs active:scale-95 cursor-pointer"
                        >
                          Inspect &rarr;
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Summary Footer */}
              <tfoot>
                <tr className="bg-slate-100/80 font-black text-slate-900 border-t-2 border-slate-300">
                  <td className="py-3 px-4" colSpan={2}>
                    Total Bihar Summary ({filteredDistricts.length} Districts)
                  </td>
                  <td className="py-3 px-4 text-center">{summary.total_officers}</td>
                  <td className="py-3 px-4 text-right tabular-num">{summary.total_km ? summary.total_km.toLocaleString('en-IN') : 0} KM</td>
                  <td className="py-3 px-4 text-right tabular-num">₹{summary.total_gross ? summary.total_gross.toLocaleString('en-IN') : 0}</td>
                  <td className="py-3 px-4 text-right text-rose-600 tabular-num">-₹{summary.total_deductions ? summary.total_deductions.toLocaleString('en-IN') : 0}</td>
                  <td className="py-3 px-4 text-right tabular-num text-teal-900">₹{summary.total_payable ? summary.total_payable.toLocaleString('en-IN') : 0}</td>
                  <td className="py-3 px-4 text-center">{summary.overall_completion_pct}%</td>
                  <td className="py-3 px-4 text-center" colSpan={2}>
                    {summary.approved_districts} Approved / {summary.pending_districts} Pending
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
