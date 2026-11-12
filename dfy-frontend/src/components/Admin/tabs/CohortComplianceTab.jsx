import { useState, useEffect, useMemo, useCallback, useRef } from 'react';

const INDICATORS = [
  { key: 'hiv', label: 'HIV / DM', short: 'HIV/DM', icon: '🧪', barClass: 'bg-purple-500' },
  { key: 'udst', label: 'UDST Testing', short: 'UDST', icon: '🔬', barClass: 'bg-emerald-500' },
  { key: 'dbt', label: 'DBT Bank', short: 'DBT', icon: '💳', barClass: 'bg-amber-500' },
  { key: 'ct', label: 'Contact Tracing', short: 'Contact', icon: '👥', barClass: 'bg-blue-500' }
];

const formatMonthLabel = (ym) => {
  if (!ym || !ym.includes('-')) return ym || '';
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, 1);
  if (Number.isNaN(dt.getTime())) return ym;
  return dt.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

export default function CohortComplianceTab({
  activeMainTab,
  selectedDistrict = 'All',
  isSuperAdmin = false,
  currentUser = null,
  authFetch,
  showToast = () => {},
  setInspectingFO = () => {}
}) {
  // ── 1. Base States & Refs (Strict TDZ-safe order) ───────────────────────────
  const [cohortReport, setCohortReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeMonth, setActiveMonth] = useState('');
  const [districtFilter, setDistrictFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyAtRisk, setOnlyAtRisk] = useState(false);
  const [drillModal, setDrillModal] = useState(null); // { officer, month, indicatorKey, label, patients, stats }
  const [copiedKey, setCopiedKey] = useState('');
  const isFetchingRef = useRef(false);

  // ── 2. Fetcher ──────────────────────────────────────────────────────────────
  const fetchAdminCohort = useCallback(async (forceRefresh = false) => {
    if (!authFetch || isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);
    setErrorMsg('');
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://dfy-mis-app.onrender.com';
      const params = new URLSearchParams({ months: '3' });
      if (selectedDistrict && selectedDistrict !== 'All') {
        params.set('district', selectedDistrict);
      }
      if (forceRefresh) {
        params.set('force_refresh', 'true');
      }
      const res = await authFetch(`${API_BASE_URL}/api/admin/cohort-compliance-3m?${params.toString()}`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.detail || `Server responded ${res.status}`);
      }
      const data = await res.json();
      setCohortReport(data);
      if (Array.isArray(data.months) && data.months.length > 0) {
        setActiveMonth((prev) => (prev && data.months.includes(prev) ? prev : data.months[0]));
      }
    } catch (err) {
      if (err?.message?.includes('Session expired')) return;
      setErrorMsg(err?.message || 'Failed to load 3-month cohort compliance.');
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [authFetch, selectedDistrict]);

  // Lazy load when user opens this tab or changes top-level district filter while on tab
  useEffect(() => {
    if (activeMainTab === 'cohort_compliance') {
      fetchAdminCohort(false);
    }
  }, [activeMainTab, selectedDistrict, fetchAdminCohort]);

  // ── 3. Derived Memo Collections ─────────────────────────────────────────────
  const monthsList = useMemo(() => {
    return Array.isArray(cohortReport?.months) ? cohortReport.months : [];
  }, [cohortReport]);

  const effectiveMonth = useMemo(() => {
    if (activeMonth && monthsList.includes(activeMonth)) return activeMonth;
    return monthsList[0] || '';
  }, [activeMonth, monthsList]);

  const currentSummary = useMemo(() => {
    return cohortReport?.summary_by_month?.[effectiveMonth] || {
      total_notified: 0,
      target_75: 0,
      achieved_count: 0,
      indicators: {}
    };
  }, [cohortReport, effectiveMonth]);

  const districtRows = useMemo(() => {
    return Array.isArray(cohortReport?.districts) ? cohortReport.districts : [];
  }, [cohortReport]);

  const effectiveDistrictFilter = useMemo(() => {
    if (districtFilter === 'All') return 'All';
    return districtRows.some((d) => d.district === districtFilter) ? districtFilter : 'All';
  }, [districtFilter, districtRows]);

  const filteredOfficers = useMemo(() => {
    const rawOfficers = Array.isArray(cohortReport?.officers) ? cohortReport.officers : [];
    const q = searchQuery.trim().toLowerCase();

    return rawOfficers
      .filter((o) => {
        if (effectiveDistrictFilter !== 'All' && o.district !== effectiveDistrictFilter) return false;
        if (q) {
          const matchName = String(o.fo_name || '').toLowerCase().includes(q);
          const matchDist = String(o.district || '').toLowerCase().includes(q);
          if (!matchName && !matchDist) return false;
        }
        const mStats = o.months?.[effectiveMonth];
        if (!mStats || !mStats.total_notified) return false;
        if (onlyAtRisk && mStats.achieved_count >= 4) return false;
        return true;
      })
      .sort((a, b) => {
        const stA = a.months?.[effectiveMonth] || {};
        const stB = b.months?.[effectiveMonth] || {};
        // Put lowest achieved_count first when Only At Risk is active, otherwise highest notified first
        if (onlyAtRisk && (stA.achieved_count ?? 4) !== (stB.achieved_count ?? 4)) {
          return (stA.achieved_count ?? 4) - (stB.achieved_count ?? 4);
        }
        return (stB.total_notified || 0) - (stA.total_notified || 0);
      });
  }, [cohortReport, effectiveDistrictFilter, searchQuery, effectiveMonth, onlyAtRisk]);

  // ── 4. Action Helpers ───────────────────────────────────────────────────────
  const copyWhatsAppCoaching = useCallback((officer, month, indDef, pendingPatients, indStats) => {
    const lines = [
      `*DFY MIS — 75% Cohort Pending Alert*`,
      `Officer: *${officer.fo_name}* (${officer.district})`,
      `Cohort Month: *${month}* | Indicator: *${indDef.label}*`,
      `Current Score: *${indStats.done}/${indStats.total} (${indStats.pct}%)* | 75% Target: *${indStats.target_75}* (${indStats.needed_for_75} more needed)`,
      ``,
      `*Pending Patient IDs (${pendingPatients.length}):*`
    ];
    pendingPatients.slice(0, 40).forEach((p, idx) => {
      const nameStr = p.name ? ` - ${p.name}` : '';
      const phoneStr = p.phone ? ` (${p.phone})` : '';
      const dateStr = p.date ? ` [${p.date}]` : '';
      lines.push(`${idx + 1}. \`${p.id}\`${nameStr}${phoneStr}${dateStr}`);
    });
    if (pendingPatients.length > 40) {
      lines.push(`... +${pendingPatients.length - 40} more patients`);
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(lines.join('\n'));
      setCopiedKey('WA');
      setTimeout(() => setCopiedKey(''), 2500);
      showToast(`✓ ${officer.fo_name} ki ${indDef.label} pending list WhatsApp ke liye copy ho gayi!`, 'success');
    }
  }, [showToast]);

  const copyIdsOnly = useCallback((pendingPatients) => {
    const idsText = pendingPatients.map((p) => p.id).join(', ');
    if (navigator.clipboard && idsText) {
      navigator.clipboard.writeText(idsText);
      setCopiedKey('IDS');
      setTimeout(() => setCopiedKey(''), 2500);
      showToast(`✓ ${pendingPatients.length} Patient IDs copied!`, 'success');
    }
  }, [showToast]);

  // Conditional render AFTER all hooks (strict React hook compliance)
  if (activeMainTab !== 'cohort_compliance') return null;

  const subAdminAllowed = !isSuperAdmin && Array.isArray(currentUser?.allowed_districts)
    ? currentUser.allowed_districts.filter((d) => String(d).toLowerCase() !== 'all')
    : [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 rounded-3xl p-5 sm:p-6 text-white shadow-xl border border-slate-700/80">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-black tracking-tight flex items-center gap-2">
                <span>🩺</span>
                <span>75% Indicator Cohort Tracker (Last 3 Months)</span>
              </h2>
              <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-0.5 rounded-full">
                DFY + Nikshay Combined
              </span>
              {!isSuperAdmin && (
                <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-500/25 text-indigo-200 border border-indigo-400/30 px-2.5 py-0.5 rounded-full">
                  🔒 Scoped: {subAdminAllowed.join(', ') || selectedDistrict}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-300 font-medium mt-1">
              Har mahine ke Notified Patients par HIV/DM, UDST, DBT aur Contact Tracing ka 75% target audit (Cross-month follow-ups &amp; Nikshay verification shamil hai).
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* 3-Month Pill Switcher */}
            {monthsList.length > 0 && (
              <div className="flex items-center bg-slate-950/60 p-1 rounded-2xl border border-slate-700/70">
                {monthsList.map((m, idx) => {
                  const isSel = effectiveMonth === m;
                  const sum = cohortReport?.summary_by_month?.[m];
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setActiveMonth(m)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                        isSel
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-300 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <span>{formatMonthLabel(m)}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black tabular-num ${
                        isSel ? 'bg-indigo-100 text-indigo-800' : 'bg-white/10 text-slate-300'
                      }`}>
                        {idx === 0 ? 'Cur' : `-${idx}m`} ({sum?.achieved_count ?? 0}/4)
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => fetchAdminCohort(true)}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white shadow-md shadow-indigo-900/40 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            >
              <span className={loading ? 'animate-spin inline-block' : ''}>🔄</span>
              <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* 4 Summary Indicator Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
          {INDICATORS.map((ind) => {
            const st = currentSummary?.indicators?.[ind.key] || {
              done: 0,
              total: 0,
              pct: 0,
              target_75: 0,
              needed_for_75: 0,
              achieved: false
            };
            const fillPct = Math.min(100, Math.max(0, st.pct || 0));
            return (
              <div
                key={ind.key}
                className={`rounded-2xl p-3.5 border ${
                  st.achieved
                    ? 'bg-emerald-950/40 border-emerald-400/40'
                    : 'bg-slate-900/60 border-slate-700/80'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-xs font-black text-slate-100 flex items-center gap-1.5">
                    <span>{ind.icon}</span>
                    <span>{ind.label}</span>
                  </span>
                  <span className={`text-sm font-black tabular-num ${
                    st.achieved ? 'text-emerald-300' : fillPct >= 50 ? 'text-amber-300' : 'text-rose-300'
                  }`}>
                    {st.pct}%
                  </span>
                </div>

                {/* Progress Bar with 75% threshold vertical marker */}
                <div className="relative w-full h-2.5 bg-slate-950/90 rounded-full overflow-hidden border border-slate-700/60 mb-2">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      st.achieved ? 'bg-emerald-400' : fillPct >= 50 ? 'bg-amber-400' : 'bg-rose-400'
                    }`}
                    style={{ width: `${fillPct}%` }}
                  />
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white/90 shadow-xs"
                    style={{ left: '75%' }}
                    title="75% Target Threshold"
                  />
                </div>

                <div className="flex items-center justify-between text-[10px] font-bold text-slate-300 tabular-num">
                  <span>{st.done} / {st.total} Done</span>
                  <span>
                    {st.achieved
                      ? '✓ 75%+ Achieved'
                      : `Target ${st.target_75} (${st.needed_for_75} short)`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-4 text-xs font-bold flex items-center justify-between">
          <span>⚠️ {errorMsg}</span>
          <button
            type="button"
            onClick={() => fetchAdminCohort(true)}
            className="bg-rose-600 text-white px-3 py-1 rounded-lg text-[11px] font-black cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* District-Wise Matrix */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm sm:text-base font-black text-slate-800 flex items-center gap-2">
              <span>🏢</span>
              <span>District-Wise 75% Compliance Matrix ({formatMonthLabel(effectiveMonth)})</span>
            </h3>
            <p className="text-[11px] text-slate-500 font-medium">
              Kisi bhi district row par click karke niche Field Officers list ko filter karein.
            </p>
          </div>
          {effectiveDistrictFilter !== 'All' && (
            <button
              type="button"
              onClick={() => setDistrictFilter('All')}
              className="text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-xl hover:bg-indigo-100 transition-all cursor-pointer self-start sm:self-auto"
            >
              ✕ Clear Filter ({effectiveDistrictFilter})
            </button>
          )}
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-wider bg-slate-50/70">
                <th className="py-2.5 px-3 rounded-tl-xl">District</th>
                <th className="py-2.5 px-3 text-center">FOs</th>
                <th className="py-2.5 px-3 text-center">Notified</th>
                {INDICATORS.map((ind) => (
                  <th key={ind.key} className="py-2.5 px-3 text-center">{ind.short} %</th>
                ))}
                <th className="py-2.5 px-3 text-center rounded-tr-xl">Score @ 75%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading && districtRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 font-bold">
                    Loading 3-month combined DFY + Nikshay cohort data...
                  </td>
                </tr>
              ) : districtRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 font-bold">
                    Is scope me abhi notification cohort records nahi mile.
                  </td>
                </tr>
              ) : (
                districtRows.map((dRow) => {
                  const mSt = dRow.months?.[effectiveMonth] || { total_notified: 0, achieved_count: 0, indicators: {} };
                  const isSel = effectiveDistrictFilter === dRow.district;
                  return (
                    <tr
                      key={dRow.district}
                      onClick={() => setDistrictFilter(isSel ? 'All' : dRow.district)}
                      className={`cursor-pointer transition-colors ${
                        isSel ? 'bg-indigo-50/90 hover:bg-indigo-100/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-3 px-3 font-black text-slate-800 flex items-center gap-1.5">
                        {isSel && <span className="text-indigo-600">▶</span>}
                        <span>{dRow.district}</span>
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-slate-600 tabular-num">{dRow.fo_count}</td>
                      <td className="py-3 px-3 text-center font-black text-slate-900 tabular-num">{mSt.total_notified}</td>
                      {INDICATORS.map((ind) => {
                        const ist = mSt.indicators?.[ind.key] || { done: 0, total: 0, pct: 0, achieved: false };
                        return (
                          <td key={ind.key} className="py-3 px-3 text-center tabular-num">
                            <span className={`inline-block px-2 py-0.5 rounded-lg text-[11px] font-black border ${
                              ist.total === 0
                                ? 'bg-slate-50 text-slate-400 border-slate-200'
                                : ist.achieved
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : ist.pct >= 50
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}>
                              {ist.pct}% <span className="text-[9px] opacity-75">({ist.done}/{ist.total})</span>
                            </span>
                          </td>
                        );
                      })}
                      <td className="py-3 px-3 text-center tabular-num">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-black border ${
                          mSt.total_notified === 0
                            ? 'bg-slate-100 text-slate-500 border-slate-200'
                            : mSt.achieved_count === 4
                              ? 'bg-emerald-600 text-white border-emerald-700'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          {mSt.achieved_count}/4
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Field Officer-Wise Table + Drill-Down */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm sm:text-base font-black text-slate-800 flex items-center gap-2">
              <span>👨‍⚕️</span>
              <span>Field Officer Compliance &amp; Pending Patient Drill-Down ({filteredOfficers.length})</span>
            </h3>
            <p className="text-[11px] text-slate-500 font-medium">
              FO ke naam par click karke Inspector kholein, ya kisi bhi indicator pill par click karke uske pending patients dekh kar WhatsApp bhejein.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search FO or District..."
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={() => setOnlyAtRisk((prev) => !prev)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                onlyAtRisk
                  ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              ⚠️ {onlyAtRisk ? 'Showing <75% At-Risk' : 'Filter <75% At-Risk'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-wider bg-slate-50/70">
                <th className="py-2.5 px-3 rounded-tl-xl">Field Officer</th>
                <th className="py-2.5 px-3">District</th>
                <th className="py-2.5 px-3 text-center">Notified</th>
                {INDICATORS.map((ind) => (
                  <th key={ind.key} className="py-2.5 px-3 text-center">{ind.short} (Tap for Pending)</th>
                ))}
                <th className="py-2.5 px-3 text-center rounded-tr-xl">75% Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredOfficers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 font-bold">
                    {loading ? 'Loading officers...' : 'Is filter me koi Field Officer matching nahi mila.'}
                  </td>
                </tr>
              ) : (
                filteredOfficers.map((off) => {
                  const mSt = off.months?.[effectiveMonth] || {
                    total_notified: 0,
                    achieved_count: 0,
                    indicators: {},
                    pending_by_indicator: {}
                  };
                  return (
                    <tr key={`${off.district}_${off.fo_name}`} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() => setInspectingFO({ fo_name: off.fo_name, district: off.district })}
                          className="font-black text-indigo-700 hover:text-indigo-900 hover:underline text-left cursor-pointer"
                          title="Open Officer Inspector"
                        >
                          {off.fo_name}
                        </button>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-600">{off.district}</td>
                      <td className="py-2.5 px-3 text-center font-black text-slate-900 tabular-num">{mSt.total_notified}</td>
                      {INDICATORS.map((ind) => {
                        const ist = mSt.indicators?.[ind.key] || { done: 0, total: 0, pct: 0, achieved: false };
                        const pendList = mSt.pending_by_indicator?.[ind.key] || [];
                        return (
                          <td key={ind.key} className="py-2.5 px-3 text-center tabular-num">
                            <button
                              type="button"
                              onClick={() => setDrillModal({
                                officer: off,
                                month: effectiveMonth,
                                indDef: ind,
                                stats: ist,
                                patients: pendList
                              })}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black border transition-all active:scale-95 cursor-pointer ${
                                ist.achieved
                                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                                  : ist.pct >= 50
                                    ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                                    : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                              }`}
                              title={`${pendList.length} pending patients for ${ind.label}`}
                            >
                              <span>{ist.pct}%</span>
                              <span className="text-[9px] opacity-80">({ist.done}/{ist.total})</span>
                            </button>
                          </td>
                        );
                      })}
                      <td className="py-2.5 px-3 text-center tabular-num">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-black ${
                          mSt.achieved_count === 4
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {mSt.achieved_count}/4
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Patients Drill-Down Modal */}
      {drillModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 sm:p-6 w-full max-w-2xl shadow-2xl border border-slate-100 max-h-[85vh] flex flex-col animate-fade-in">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <span>{drillModal.indDef.icon}</span>
                  <span>{drillModal.officer.fo_name} — {drillModal.indDef.label} Pending</span>
                </h4>
                <p className="text-xs text-slate-500 font-bold mt-0.5">
                  {drillModal.officer.district} &bull; Cohort Month: {drillModal.month} &bull; Score: {drillModal.stats.done}/{drillModal.stats.total} ({drillModal.stats.pct}%)
                  {!drillModal.stats.achieved && ` • Need ${drillModal.stats.needed_for_75} more for 75%`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrillModal(null)}
                className="text-slate-400 hover:text-slate-700 text-2xl font-bold leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="flex items-center gap-2 py-3 flex-wrap">
              <button
                type="button"
                onClick={() => copyWhatsAppCoaching(
                  drillModal.officer,
                  drillModal.month,
                  drillModal.indDef,
                  drillModal.patients,
                  drillModal.stats
                )}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black px-3.5 py-2 rounded-xl transition-all active:scale-95 cursor-pointer"
              >
                {copiedKey === 'WA' ? '✓ Copied for WhatsApp!' : '📲 Copy WhatsApp Coaching List'}
              </button>
              <button
                type="button"
                onClick={() => copyIdsOnly(drillModal.patients)}
                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-black px-3.5 py-2 rounded-xl transition-all active:scale-95 cursor-pointer"
              >
                {copiedKey === 'IDS' ? '✓ IDs Copied!' : `📋 Copy ${drillModal.patients.length} IDs Only`}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-1">
              {drillModal.patients.length === 0 ? (
                <div className="text-center py-8 bg-emerald-50 rounded-2xl border border-emerald-200 text-emerald-800 text-xs font-black">
                  🎉 Is month ke sabhi notified patients me {drillModal.indDef.label} complete hai!
                </div>
              ) : (
                drillModal.patients.map((pt) => (
                  <div
                    key={pt.id}
                    className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200/80 rounded-2xl px-3.5 py-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-black text-slate-800 truncate">
                        <span className="font-mono text-indigo-700">{pt.id}</span>
                        {pt.name ? ` — ${pt.name}` : ''}
                      </p>
                      <p className="text-[10px] text-slate-500 font-bold">
                        Notified: {pt.date || drillModal.month}
                        {pt.phone ? ` • 📞 ${pt.phone}` : ' • Phone missing'}
                      </p>
                    </div>
                    {pt.phone && (
                      <a
                        href={`tel:${pt.phone}`}
                        className="bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-xl text-[11px] font-black shrink-0"
                      >
                        📞 Call
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
