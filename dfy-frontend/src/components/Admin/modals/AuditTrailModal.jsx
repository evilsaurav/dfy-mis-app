import React, { useMemo } from 'react';

export const formatAuditTimestamp = (ts, tsFormatted) => {
  if (tsFormatted && (tsFormatted.includes('AM') || tsFormatted.includes('PM'))) {
    return tsFormatted;
  }
  if (!ts) return '—';
  if (typeof ts === 'string' && (ts.includes('AM') || ts.includes('PM'))) {
    return ts;
  }
  try {
    const cleanTs = String(ts).trim();
    let d;
    if (cleanTs.includes('T') || cleanTs.endsWith('Z')) {
      d = new Date(cleanTs);
    } else {
      const isoStr = cleanTs.replace(' ', 'T') + 'Z';
      d = new Date(isoStr);
    }
    if (isNaN(d.getTime())) d = new Date(cleanTs);
    if (isNaN(d.getTime())) return cleanTs;
    
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata'
    });
  } catch (e) {
    return String(ts);
  }
};

export default function AuditTrailModal({
  show,
  onClose,
  isSuperAdmin,
  handleManualPruneAuditLogs,
  isPruningAudit,
  exportAuditLogsExcel,
  fetchAuditLogs,
  loadingAuditLogs,
  auditFilterAction,
  setAuditFilterAction,
  auditFilterDistrict,
  setAuditFilterDistrict,
  staffDirectory = {},
  auditFilterUser,
  setAuditFilterUser,
  adminUsersList = [],
  auditSearchQuery,
  setAuditSearchQuery,
  auditLogsList = []
}) {
  const downloadStats = useMemo(() => {
    const downloadLogs = (auditLogsList || []).filter(l => l.action_type === 'REPORT_DOWNLOADED');
    const userCounts = {};
    downloadLogs.forEach(l => {
      const key = l.user_name || l.user_id || 'Unknown';
      userCounts[key] = (userCounts[key] || 0) + 1;
    });
    return {
      totalDownloads: downloadLogs.length,
      byUser: userCounts
    };
  }, [auditLogsList]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-100 animate-fade-in">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">📜</span>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-slate-800">Activity Audit Trail</h2>
              <p className="text-xs text-slate-500 font-medium">Real-Time Master Log of all Target updates, Patient ID edits, PIN resets, and logins</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-black px-2.5 py-1.5 rounded-xl flex items-center gap-1 shadow-2xs">
              <span>🛡️</span>
              <span>Retention: 30 Days (Auto-Pruned)</span>
            </span>
            {isSuperAdmin && (
              <button
                type="button"
                onClick={handleManualPruneAuditLogs}
                disabled={isPruningAudit}
                className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                title="Manually purge logs older than 30 days immediately"
              >
                <span>🧹</span>
                <span>{isPruningAudit ? "Pruning..." : "Prune Old (>30d)"}</span>
              </button>
            )}
            <button
              type="button"
              onClick={exportAuditLogsExcel}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
              title="Download complete audit log report as Excel .xlsx"
            >
              <span>📥</span>
              <span>Export Excel (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={() => fetchAuditLogs()}
              className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
            >
              <span className={loadingAuditLogs ? "animate-spin" : ""}>🔄</span>
              <span>Refresh</span>
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-2xl p-1 leading-none ml-1">&times;</button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="px-5 py-3 bg-amber-50/50 border-b border-amber-100 flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-black text-amber-900 uppercase">Filters:</span>
          
          {/* Action Filter */}
          <select
            value={auditFilterAction}
            onChange={(e) => {
              setAuditFilterAction(e.target.value);
              fetchAuditLogs(e.target.value, undefined, undefined, undefined);
            }}
            className="bg-white border border-amber-200 text-slate-700 font-bold text-xs rounded-xl px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs cursor-pointer"
          >
            <option value="All">All Actions</option>
            <option value="LOGIN_FAILED">🚨 Failed Logins / Intruder Attempts</option>
            <option value="LOGIN_SUCCESS">🔓 Successful Logins</option>
            <option value="TARGET_UPDATED">🎯 Target Updates</option>
            <option value="ID_EDITED">✏️ ID Edits / Deletions</option>
            <option value="ADMIN_USER_CREATED">➕ User Created</option>
            <option value="PERMISSIONS_UPDATED">🛡️ Permissions Changed</option>
            <option value="ADMIN_USER_DELETED">🗑️ User Deleted</option>
            <option value="PIN_RESET">🔑 PIN Resets</option>
            <option value="REPORT_DOWNLOADED">📥 Report Downloads</option>
          </select>

          {/* District Filter */}
          <select
            value={auditFilterDistrict}
            onChange={(e) => {
              setAuditFilterDistrict(e.target.value);
              fetchAuditLogs(undefined, e.target.value, undefined, undefined);
            }}
            className="bg-white border border-amber-200 text-slate-700 font-bold text-xs rounded-xl px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs cursor-pointer"
          >
            <option value="All">All Districts</option>
            {Object.keys(staffDirectory).sort().map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          {/* Actor / User Filter */}
          <select
            value={auditFilterUser}
            onChange={(e) => {
              setAuditFilterUser(e.target.value);
              fetchAuditLogs(undefined, undefined, e.target.value, undefined);
            }}
            className="bg-white border border-amber-200 text-slate-700 font-bold text-xs rounded-xl px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs cursor-pointer"
          >
            <option value="All">All Actors</option>
            <option value="admin">Super Admin (admin)</option>
            {adminUsersList && adminUsersList.filter(u => u.user_id !== 'admin').map(u => (
              <option key={u.user_id} value={u.user_id}>{u.name || u.username} ({u.user_id})</option>
            ))}
            <option value="system">System Automated</option>
          </select>

          {/* Quick Security Radar Filter Button */}
          <button
            type="button"
            onClick={() => {
              const nextAction = auditFilterAction === 'LOGIN_FAILED' ? 'All' : 'LOGIN_FAILED';
              setAuditFilterAction(nextAction);
              fetchAuditLogs(nextAction, undefined, undefined, undefined);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-2xs active:scale-95 cursor-pointer ${
              auditFilterAction === 'LOGIN_FAILED'
                ? 'bg-rose-600 text-white ring-2 ring-rose-400'
                : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
            }`}
            title="1-Click Security Radar: Filter failed login attempts"
          >
            <span>🚨</span>
            <span>Security Radar</span>
          </button>

          {/* Search Bar */}
          <div className="flex items-center gap-1 ml-auto">
            <input
              type="text"
              placeholder="Search user, ID, IP, details..."
              value={auditSearchQuery}
              onChange={(e) => setAuditSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  fetchAuditLogs(undefined, undefined, undefined, auditSearchQuery);
                }
              }}
              className="bg-white border border-amber-200 text-slate-800 text-xs rounded-xl px-3 py-1.5 outline-none focus:ring-2 focus:ring-amber-500 w-44 sm:w-56"
            />
            <button
              type="button"
              onClick={() => fetchAuditLogs(undefined, undefined, undefined, auditSearchQuery)}
              className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Search
            </button>
          </div>
        </div>

        {/* Report Download Frequency Counter Banner */}
        {downloadStats.totalDownloads > 0 && (
          <div className="px-5 py-2.5 bg-emerald-50/80 border-b border-emerald-100 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-black text-emerald-900 flex items-center gap-1">
              <span>📥</span> Report Downloads Breakdown ({downloadStats.totalDownloads} Total):
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {Object.entries(downloadStats.byUser).map(([userName, count]) => (
                <span
                  key={userName}
                  className="bg-white border border-emerald-200 text-emerald-800 font-bold px-2 py-0.5 rounded-lg shadow-2xs flex items-center gap-1"
                >
                  <span className="text-slate-600">{userName}:</span>
                  <span className="font-black text-emerald-700">{count}x</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Audit Log Table */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 custom-scrollbar">
          {loadingAuditLogs ? (
            <div className="text-center py-12 text-slate-400 font-bold text-xs">Loading Audit Radar Logs...</div>
          ) : auditLogsList.length === 0 ? (
            <div className="text-center py-12 text-slate-400 font-bold text-xs">No audit records found matching criteria.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-black uppercase text-[10px] tracking-wider">
                    <th className="py-2.5 px-3">Timestamp (IST)</th>
                    <th className="py-2.5 px-3">Actor / Admin</th>
                    <th className="py-2.5 px-3">Action Type</th>
                    <th className="py-2.5 px-3">District &amp; Officer</th>
                    <th className="py-2.5 px-3">Details / Location / IP / Device</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogsList.map((log, idx) => {
                    const isFailedLogin = log.action_type === 'LOGIN_FAILED' || log.action_type === 'LOGIN_BLOCKED';
                    const clientDevice = (log.diff && log.diff.device) || '';
                    const clientIp = log.ip_address || (log.diff && log.diff.ip) || '';
                    const clientLocation = log.location || (log.diff && log.diff.location) || '';
                    const formattedTime = formatAuditTimestamp(log.timestamp, log.timestamp_formatted);

                    return (
                      <tr key={idx} className={`transition-colors ${isFailedLogin ? 'bg-rose-50/80 hover:bg-rose-100/70 border-l-4 border-l-rose-500' : 'hover:bg-slate-50/70'}`}>
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap font-bold">
                          {formattedTime}
                        </td>
                        <td className="py-3 px-3">
                          <span className={`font-bold block ${isFailedLogin ? 'text-rose-800' : 'text-slate-800'}`}>
                            {log.user_name || log.user_id || 'System'}
                          </span>
                          <span className={`text-[9px] font-black uppercase ${isFailedLogin ? 'text-rose-500' : 'text-indigo-600'}`}>
                            {log.role || 'SUPER_ADMIN'} {log.user_id && log.user_id !== log.user_name ? `(${log.user_id})` : ''}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                            isFailedLogin ? 'bg-rose-600 text-white shadow-xs' :
                            log.action_type === 'LOGIN_SUCCESS' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                            log.action_type === 'TARGET_UPDATED' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                            log.action_type === 'ID_EDITED' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                            log.action_type === 'PIN_RESET' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                            log.action_type?.includes('USER') ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                            'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            {log.action_type?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-semibold text-slate-700 block">{log.district || 'Statewide'}</span>
                          {log.target_officer && (
                            <span className="text-[10px] text-slate-400 font-medium">{log.target_officer}</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <p className={`font-medium max-w-md ${isFailedLogin ? 'text-rose-950 font-semibold' : 'text-slate-700'}`}>
                            {log.details}
                          </p>
                          {(clientIp || clientLocation || clientDevice) && (
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {clientIp && (
                                <span className="inline-flex items-center gap-1 font-mono text-[9px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                                  🌐 IP: {clientIp}
                                </span>
                              )}
                              {clientLocation && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-200">
                                  📍 {clientLocation}
                                </span>
                              )}
                              {clientDevice && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-100">
                                  {clientDevice}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500">Showing {auditLogsList.length} audit records</span>
          <button onClick={onClose} className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs py-2 px-5 rounded-xl transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}
