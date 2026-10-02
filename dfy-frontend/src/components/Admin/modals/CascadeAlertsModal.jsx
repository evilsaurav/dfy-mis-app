import React from 'react';

export default function CascadeAlertsModal({
  isOpen,
  onClose,
  cascadeData = { summary: {}, alerts: [] },
  month,
  cascadeFilterDist,
  setCascadeFilterDist,
  districts = [],
  cascadeRiskFilter,
  setCascadeRiskFilter,
  fetchCascadeAlerts,
  getAdminToken,
  currentUser,
  loadingCascade
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-5xl shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col animate-fade-in">
        
        {/* Modal Header */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center text-2xl font-black shrink-0">
              🚨
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800">Predictive Clinical Cascade &amp; Dropout Radar</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                {cascadeData.summary?.total_notified || 0} Total Notified Patients &bull; {month}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none self-end sm:self-center cursor-pointer">&times;</button>
        </div>

        {/* Quick KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 my-3">
          <div className="bg-rose-50 border border-rose-100 p-3 rounded-2xl text-center">
            <span className="text-[10px] font-black uppercase text-rose-500 block">High Risk (2+ Missing)</span>
            <p className="text-xl font-black text-rose-700">{cascadeData.summary?.high_risk_count || 0}</p>
          </div>
          <div className="bg-purple-50 border border-purple-100 p-3 rounded-2xl text-center">
            <span className="text-[10px] font-black uppercase text-purple-600 block">HIV / DM Missing</span>
            <p className="text-xl font-black text-purple-700">{cascadeData.summary?.hiv_pending || 0}</p>
          </div>
          <div className="bg-amber-50 border border-amber-100 p-3 rounded-2xl text-center">
            <span className="text-[10px] font-black uppercase text-amber-600 block">DBT Bank Pending</span>
            <p className="text-xl font-black text-amber-700">{cascadeData.summary?.dbt_pending || 0}</p>
          </div>
          <div className="bg-blue-50 border border-blue-100 p-3 rounded-2xl text-center">
            <span className="text-[10px] font-black uppercase text-blue-600 block">Contact Tracing</span>
            <p className="text-xl font-black text-blue-700">{cascadeData.summary?.contact_pending || 0}</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-2xl text-center">
            <span className="text-[10px] font-black uppercase text-emerald-600 block">UDST / Testing</span>
            <p className="text-xl font-black text-emerald-700">{cascadeData.summary?.udst_pending || 0}</p>
          </div>
          <div className="bg-pink-50 border border-pink-100 p-3 rounded-2xl text-center">
            <span className="text-[10px] font-black uppercase text-pink-600 block">Diff TB Care</span>
            <p className="text-xl font-black text-pink-700">{cascadeData.summary?.diff_tb_pending || 0}</p>
          </div>
        </div>

        {/* Action Bar: District Filter, Risk Filter & Export */}
        <div className="py-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <select
              value={cascadeFilterDist}
              onChange={(e) => {
                setCascadeFilterDist(e.target.value);
              }}
              className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-rose-500"
            >
              <option value="All">All Districts</option>
              {districts.filter(d => d !== 'All').map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <select
              value={cascadeRiskFilter}
              onChange={(e) => setCascadeRiskFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-rose-500"
            >
              <option value="All">All Alerts</option>
              <option value="HIGH">🔴 High Risk Only (2+ Missing)</option>
              <option value="MEDIUM">🟡 Medium Risk</option>
              <option value="HIV">🧪 HIV &amp; DM Missing</option>
              <option value="DBT">💳 DBT Missing Only</option>
              <option value="CONTACT">👥 Contact Tracing Missing</option>
              <option value="UDST">🔬 UDST Testing Missing</option>
              <option value="DIFF_TB">🩺 Diff TB Care Missing</option>
              <option value="PRESUMPTIVE">🔍 Presumptive Not Tested</option>
            </select>

            <button
              onClick={fetchCascadeAlerts}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
            >
              <span>🔄</span> Refresh
            </button>
          </div>

          <a
            href={`${import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com"}/admin/export-cascade-alerts?month=${month}&district=${cascadeFilterDist}&token=${getAdminToken()}${currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All') ? `&districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}` : ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-md shadow-rose-600/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span>📥</span> Export Dropout Action Sheet (.xlsx)
          </a>
        </div>

        {/* Patients Dropout Alerts Table */}
        <div className="flex-1 overflow-y-auto custom-scrollbar my-2 pr-1">
          {loadingCascade ? (
            <div className="text-center py-16 text-slate-400 font-bold text-xs flex flex-col items-center justify-center gap-2">
              <span className="animate-spin text-2xl">⏳</span>
              <span>Scanning patient clinical cascades...</span>
            </div>
          ) : (() => {
            const filteredAlerts = (cascadeData.alerts || []).filter(a => {
              if (cascadeFilterDist !== 'All' && a.district !== cascadeFilterDist) return false;
              if (cascadeRiskFilter === 'HIGH' && a.risk_level !== 'HIGH') return false;
              if (cascadeRiskFilter === 'MEDIUM' && a.risk_level !== 'MEDIUM') return false;
              if (cascadeRiskFilter === 'HIV' && a.has_hiv) return false;
              if (cascadeRiskFilter === 'DBT' && a.has_dbt) return false;
              if (cascadeRiskFilter === 'CONTACT' && a.has_contact) return false;
              if (cascadeRiskFilter === 'UDST' && a.has_udst) return false;
              if (cascadeRiskFilter === 'DIFF_TB' && a.has_diff_tb) return false;
              if (cascadeRiskFilter === 'PRESUMPTIVE' && a.cascade_type !== 'Presumptive') return false;
              return true;
            });

            if (filteredAlerts.length === 0) {
              return (
                <div className="text-center py-16 text-slate-400 font-bold text-xs">
                  🎉 Koi clinical dropout alert nahi hai! Sabhi patients ke interventions linked hain.
                </div>
              );
            }

            return (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 font-black uppercase text-[10px] tracking-wider sticky top-0 border-b border-slate-100">
                    <th className="p-3">Patient ID</th>
                    <th className="p-3">District &amp; FO</th>
                    <th className="p-3">Notification Date</th>
                    <th className="p-3">Days Elapsed</th>
                    <th className="p-3">Pending Interventions</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {filteredAlerts.map((a, idx) => (
                    <tr key={idx} className="hover:bg-rose-50/20 transition-colors">
                      <td className="p-3 font-mono font-black text-slate-800">
                        <span className="bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">{a.id}</span>
                      </td>
                      <td className="p-3">
                        <span className="font-bold text-indigo-700 block">{a.district}</span>
                        <span className="text-[11px] text-slate-400">{a.fo_name}</span>
                      </td>
                      <td className="p-3 text-slate-500 font-medium">{a.notified_date || 'N/A'}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${a.days_elapsed > 7 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                          {a.days_elapsed} Days Ago
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {a.missing_actions.map((act, actIdx) => (
                            <span key={actIdx} className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-md">
                              {act}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => {
                            const msg = `*URGENT CASCADE ACTION REQUIRED* 🚨\nPatient ID: *${a.id}*\nDistrict: ${a.district} (${a.fo_name})\nNotified: ${a.notified_date}\nPending: ${a.missing_actions.join(', ')}\nKripya is patient ka urgent follow-up karein!`;
                            if (navigator.clipboard) {
                              navigator.clipboard.writeText(msg);
                              alert("Alert message copied for WhatsApp!");
                            }
                          }}
                          className="text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors border border-emerald-200 cursor-pointer"
                          title="Copy WhatsApp Alert message for Field Officer"
                        >
                          📱 Alert FO
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </div>

        {/* Modal Footer */}
        <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400 font-semibold">
          <span>Tip: High Risk patients wo hain jinme 2 ya usse zyada clinical interventions missing hain.</span>
          <button onClick={onClose} className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2 px-5 rounded-xl transition-all cursor-pointer">Close Radar</button>
        </div>

      </div>
    </div>
  );
}
