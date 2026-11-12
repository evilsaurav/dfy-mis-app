import { useState, useMemo, useEffect } from 'react';
import { computeMonthCohortStats } from '../../offlineQueue';

const INDICATOR_DEFS = [
  { key: 'hiv', label: 'HIV / DM', icon: '🧪', fieldKey: 'hiv_dm_ids' },
  { key: 'udst', label: 'UDST Testing', icon: '🔬', fieldKey: 'sample_tested_ids' },
  { key: 'dbt', label: 'DBT Bank', icon: '💳', fieldKey: 'dbt_ids' },
  { key: 'ct', label: 'Contact Tracing', icon: '👥', fieldKey: 'contact_tracing_ids' }
];

const formatMonthShort = (ym) => {
  if (!ym || !ym.includes('-')) return ym || '';
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, 1);
  if (Number.isNaN(dt.getTime())) return ym;
  return dt.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
};

const formatSyncAgo = (isoOrMs) => {
  if (!isoOrMs) return 'Not synced yet';
  const ts = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs);
  if (Number.isNaN(ts)) return 'Saved on phone';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
};

export default function CohortCompliance3MCard({
  cohortCache,
  syncing = false,
  onSync,
  activeFilter = null,
  onSelectIndicator,
  storageSubtitle = null
}) {
  // Base states first (TDZ safe)
  const monthsList = useMemo(() => {
    if (Array.isArray(cohortCache?.months) && cohortCache.months.length > 0) {
      return cohortCache.months;
    }
    const now = new Date();
    const fallback = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      fallback.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return fallback;
  }, [cohortCache?.months]);

  const [selectedMonth, setSelectedMonth] = useState(() => monthsList[0]);

  useEffect(() => {
    if (monthsList.length > 0 && !monthsList.includes(selectedMonth)) {
      setSelectedMonth(monthsList[0]);
    }
  }, [monthsList, selectedMonth]);

  // Derived stats across all 3 months
  const monthStatsMap = useMemo(() => {
    const out = {};
    monthsList.forEach((m) => {
      out[m] = computeMonthCohortStats(cohortCache?.months_data?.[m]?.patients || {});
    });
    return out;
  }, [monthsList, cohortCache?.months_data]);

  const currentStats = useMemo(() => {
    return monthStatsMap[selectedMonth] || computeMonthCohortStats({});
  }, [monthStatsMap, selectedMonth]);

  const lastSyncText = useMemo(() => {
    return formatSyncAgo(cohortCache?.server_synced_at || cohortCache?.client_updated_at);
  }, [cohortCache?.server_synced_at, cohortCache?.client_updated_at]);

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 rounded-3xl p-4 sm:p-5 text-white shadow-lg border border-slate-700/80 mb-5 animate-fade-in">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
        <div>
          <h3 className="text-xs sm:text-sm font-black tracking-wide uppercase flex items-center gap-1.5 text-white">
            <span>📊</span>
            <span>75% Indicator Tracker (Last 3 Months)</span>
          </h3>
          <p className="text-[10px] text-slate-300 font-medium mt-0.5 flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>{storageSubtitle || `Phone Saved (${lastSyncText}) • DFY + Nikshay Combined`}</span>
          </p>
        </div>

        {onSync && (
          <button
            type="button"
            onClick={onSync}
            disabled={syncing}
            className="text-[10px] font-black uppercase tracking-wider bg-white/10 hover:bg-white/20 disabled:opacity-60 border border-white/20 text-white px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            title="Sync latest delta updates (+1)"
          >
            <span className={syncing ? 'animate-spin inline-block' : ''}>🔄</span>
            <span>{syncing ? 'Syncing...' : 'Delta Sync'}</span>
          </button>
        )}
      </div>

      {/* 3-Month Switcher Tabs */}
      <div className="grid grid-cols-3 gap-1.5 mb-4 bg-slate-950/50 p-1 rounded-2xl border border-slate-700/60">
        {monthsList.map((m, idx) => {
          const st = monthStatsMap[m] || { totalNotified: 0, achievedCount: 0 };
          const isSelected = selectedMonth === m;
          const allGood = st.totalNotified > 0 && st.achievedCount === 4;
          const hasGap = st.totalNotified > 0 && st.achievedCount < 4;

          return (
            <button
              key={m}
              type="button"
              onClick={() => setSelectedMonth(m)}
              className={`py-2 px-1.5 rounded-xl transition-all flex flex-col items-center justify-center relative cursor-pointer ${
                isSelected
                  ? 'bg-white text-slate-900 shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="text-[11px] font-black leading-tight flex items-center gap-1">
                <span>{formatMonthShort(m)}</span>
                {idx === 0 && (
                  <span className={`text-[8px] px-1 py-0.2 rounded uppercase font-black ${isSelected ? 'bg-teal-100 text-teal-800' : 'bg-teal-500/20 text-teal-300'}`}>
                    Cur
                  </span>
                )}
              </span>

              <span className={`text-[9px] font-extrabold mt-0.5 px-1.5 py-0.2 rounded-full ${
                st.totalNotified === 0
                  ? (isSelected ? 'bg-slate-100 text-slate-500' : 'text-slate-400')
                  : allGood
                    ? (isSelected ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-500/20 text-emerald-300')
                    : (isSelected ? 'bg-amber-100 text-amber-800' : 'bg-amber-500/20 text-amber-300')
              }`}>
                {st.totalNotified === 0 ? '0 Notif' : `${st.achievedCount}/4 @ 75%`}
              </span>

              {hasGap && !isSelected && (
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 absolute top-1.5 right-1.5 animate-pulse" />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Month Cohort Summary */}
      <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-2xl px-3.5 py-2.5 mb-3.5 text-xs">
        <div>
          <span className="text-[10px] text-slate-400 font-bold uppercase block">Notified Cohort</span>
          <span className="text-sm sm:text-base font-black text-white tabular-nums">
            {currentStats.totalNotified} {currentStats.totalNotified === 1 ? 'Patient' : 'Patients'}
          </span>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-slate-400 font-bold uppercase block">75% Mandatory Goal</span>
          <span className="text-sm sm:text-base font-black text-amber-300 tabular-nums">
            {currentStats.target75} {currentStats.target75 === 1 ? 'Patient' : 'Patients'}
          </span>
        </div>
      </div>

      {/* 4 Indicators 2x2 Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {INDICATOR_DEFS.map((ind) => {
          const metric = currentStats.indicators[ind.key] || {
            done: 0,
            total: 0,
            pct: 0,
            neededFor75: 0,
            achieved: false,
            pendingPatients: []
          };
          const isActiveFilter = activeFilter?.month === selectedMonth && activeFilter?.indicatorKey === ind.key;
          const pctWidth = Math.min(100, Math.max(0, metric.pct));
          const isMid = !metric.achieved && metric.pct >= 50;

          const cardTone = isActiveFilter
            ? 'bg-indigo-600/35 border-indigo-400 ring-2 ring-indigo-400/50'
            : metric.total === 0
              ? 'bg-white/5 border-white/10'
              : metric.achieved
                ? 'bg-emerald-950/45 border-emerald-500/40 hover:border-emerald-400/70'
                : isMid
                  ? 'bg-amber-950/35 border-amber-500/40 hover:border-amber-400/70'
                  : 'bg-rose-950/35 border-rose-500/40 hover:border-rose-400/70';

          const barTone = metric.achieved
            ? 'bg-gradient-to-r from-emerald-400 to-teal-400'
            : isMid
              ? 'bg-gradient-to-r from-amber-400 to-orange-400'
              : 'bg-gradient-to-r from-rose-500 to-pink-500';

          return (
            <button
              key={ind.key}
              type="button"
              onClick={() => {
                if (!onSelectIndicator || metric.total === 0) return;
                onSelectIndicator({
                  month: selectedMonth,
                  indicatorKey: ind.key,
                  label: ind.label,
                  fieldKey: ind.fieldKey,
                  pendingPatients: metric.pendingPatients
                });
              }}
              className={`text-left rounded-2xl p-3 border transition-all active:scale-[0.98] ${
                metric.total > 0 ? 'cursor-pointer' : 'cursor-default opacity-80'
              } ${cardTone}`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-black text-white flex items-center gap-1.5">
                  <span>{ind.icon}</span>
                  <span>{ind.label}</span>
                </span>
                <span className={`text-[11px] font-black px-2 py-0.5 rounded-lg tabular-nums ${
                  metric.total === 0
                    ? 'bg-slate-700 text-slate-300'
                    : metric.achieved
                      ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                      : isMid
                        ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                        : 'bg-rose-500/25 text-rose-300 border border-rose-500/40'
                }`}>
                  {metric.pct}%
                </span>
              </div>

              {/* Progress Bar with 75% Benchmark Marker */}
              <div className="relative h-2.5 w-full bg-slate-950/70 rounded-full overflow-visible border border-white/10 mb-2">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barTone}`}
                  style={{ width: `${pctWidth}%` }}
                />
                {/* 75% Vertical Benchmark Tick */}
                <div
                  className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-white/90 shadow-[0_0_6px_rgba(255,255,255,0.9)] z-10"
                  style={{ left: '75%' }}
                  title="75% Target Line"
                />
              </div>

              <div className="flex items-center justify-between gap-1 text-[10px]">
                <span className="font-bold text-slate-200 tabular-nums">
                  {metric.done} / {metric.total} Done
                </span>
                <span className={`font-black ${
                  metric.total === 0
                    ? 'text-slate-400'
                    : metric.achieved
                      ? 'text-emerald-300'
                      : 'text-amber-300'
                }`}>
                  {metric.total === 0
                    ? 'No patients'
                    : metric.achieved
                      ? '✅ 75% Done'
                      : metric.neededFor75 > 0
                        ? `⚠️ ${metric.neededFor75} aur chahiye`
                        : `${metric.pendingPatients.length} pending`}
                </span>
              </div>

              {metric.pendingPatients.length > 0 && (
                <div className="mt-1.5 pt-1.5 border-t border-white/10 flex items-center justify-between text-[9px] font-bold text-indigo-200">
                  <span>{metric.pendingPatients.length} pending patients</span>
                  <span>{isActiveFilter ? '✓ Filtered Below' : 'Tap to view ➔'}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
