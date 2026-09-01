# -*- coding: utf-8 -*-
with open("dfy-frontend/src/AdminDashboard.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

# 1. Add state for Duplicate Radar & Comparison Matrix
state_marker = "  const [copiedFoCategory, setCopiedFoCategory] = useState(null);"
new_state = """  const [copiedFoCategory, setCopiedFoCategory] = useState(null);
  const [duplicateAudit, setDuplicateAudit] = useState(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [compareDistA, setCompareDistA] = useState("Jamui");
  const [compareDistB, setCompareDistB] = useState("Bhojpur");"""

if state_marker in text:
    text = text.replace(state_marker, new_state)
    print("duplicate and comparison state added")

# 2. Add fetchDuplicateAudit function
fetch_dup_code = """
  const fetchDuplicateAudit = async () => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await fetch(`${API_BASE_URL}/admin/duplicate-audit?month=${month}`);
      if (res.ok) {
        const data = await res.json();
        setDuplicateAudit(data);
      }
    } catch (e) {
      console.error("Duplicate audit fetch failed", e);
    }
  };
"""

if "const fetchDuplicateAudit =" not in text:
    fetch_dir_marker = "  const fetchDirectory = async () => {"
    if fetch_dir_marker in text:
        text = text.replace(fetch_dir_marker, fetch_dup_code + "\n" + fetch_dir_marker)
        print("fetchDuplicateAudit function added")

# Trigger fetchDuplicateAudit in auth effect
auth_effect_marker = "if (isAuthenticated) { fetchData(); fetchAttendance(); fetchDirectory(); loadTargets('All'); }"
new_auth_effect = "if (isAuthenticated) { fetchData(); fetchAttendance(); fetchDirectory(); loadTargets('All'); fetchDuplicateAudit(); }"
if auth_effect_marker in text:
    text = text.replace(auth_effect_marker, new_auth_effect)
    print("fetchDuplicateAudit triggered in auth effect")

# 3. Add Duplicate Radar button on header
buttons_marker = """                <button onClick={() => {
                  setTargetModalDistrict(selectedDistrict !== 'All' ? selectedDistrict : 'All');
                  loadTargets('All');
                  fetchDirectory();
                  setShowTargetModal(true);
                }} className="bg-purple-600 text-white px-3.5 py-2 rounded-lg text-xs font-bold hover:bg-purple-700 transition-colors shadow-sm flex items-center gap-1.5" title="Set Monthly Notification Targets for All Staff">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
                  Set Targets
                </button>"""

new_buttons = """                <button onClick={() => {
                  fetchDuplicateAudit();
                  setShowDuplicateModal(true);
                }} className="bg-rose-600 text-white px-3.5 py-2 rounded-lg text-xs font-bold hover:bg-rose-700 transition-colors shadow-sm flex items-center gap-1.5" title="Cross-Officer Duplicate Patient ID Radar">
                  <span>🛡️</span>
                  <span>Duplicate Radar</span>
                  {duplicateAudit && duplicateAudit.total_duplicate_ids > 0 && (
                    <span className="bg-white text-rose-700 px-1.5 py-0.2 rounded-full text-[9px] font-black">{duplicateAudit.total_duplicate_ids}</span>
                  )}
                </button>
""" + buttons_marker

if buttons_marker in text:
    text = text.replace(buttons_marker, new_buttons)
    print("Duplicate Radar button added to header")

# 4. Add Live Submission Activity Ticker right after Header
header_container_end = '        {/* Live Attendance Banner */}'
live_ticker_ui = """        {/* Real-Time Live Activity Ticker */}
        {rawRecords.length > 0 && (
          <div className="bg-slate-900 text-white rounded-2xl px-5 py-3 shadow-md flex items-center justify-between gap-4 overflow-hidden border border-slate-800 animate-fade-in">
            <div className="flex items-center gap-2 shrink-0">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Live Activity Feed</span>
            </div>
            <div className="flex-1 overflow-x-auto whitespace-nowrap custom-scrollbar text-xs font-semibold text-slate-300 flex items-center gap-6">
              {rawRecords.slice(-4).reverse().map((r, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <strong className="text-white">{r.fo_name}</strong> ({r.working_place}) &bull; <span className="text-emerald-400">{r.notifications} Notif</span> &bull; {r.total_km} KM &bull; <span className="text-slate-400 text-[10px]">{r.date}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Live Attendance Banner */}"""

if header_container_end in text:
    text = text.replace(header_container_end, live_ticker_ui)
    print("Live activity ticker added")

# 5. Add Target Pacing & Projections Forecaster card + District Comparison Matrix
table_section_marker = '            {/* Detailed Master Table */}'
if "            {/* Detailed Master Table */}" not in text:
    table_section_marker = '{/* Master Data Table */}'

pacing_and_comparison_ui = """            {/* Target Pacing Forecaster & District Benchmarking */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Target Pacing Calculator */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col">
                <div className="mb-4">
                  <h3 className="text-slate-800 font-black text-base flex items-center gap-2">
                    <span>⚡</span> Target Pacing & Forecaster
                  </h3>
                  <p className="text-slate-400 text-xs font-semibold">Run-rate needed for 100% monthly achievement</p>
                </div>

                <div className="space-y-3">
                  {(() => {
                    const daysInMonth = 30;
                    const todayDate = new Date().getDate();
                    const daysRemaining = Math.max(1, daysInMonth - todayDate);
                    const totalStateNotif = totals.notifications || 0;
                    const totalStateTarget = targetsData.reduce((sum, t) => sum + (Number(t.target) || 0), 0);
                    const pendingStateNotif = Math.max(0, totalStateTarget - totalStateNotif);
                    const requiredDailyRate = (pendingStateNotif / daysRemaining).toFixed(1);
                    const currentDailyRate = todayDate > 0 ? (totalStateNotif / todayDate).toFixed(1) : 0;
                    const projectedTotal = Math.round(Number(currentDailyRate) * daysInMonth);
                    const projectedPct = totalStateTarget > 0 ? Math.round((projectedTotal / totalStateTarget) * 100) : 100;

                    return (
                      <>
                        <div className="bg-indigo-50/70 p-4 rounded-2xl border border-indigo-100 flex justify-between items-center">
                          <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400">Current Daily Pace</span>
                            <p className="text-xl font-black text-indigo-700">{currentDailyRate} <span className="text-xs font-bold text-indigo-500">Notif/Day</span></p>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Required Pace</span>
                            <p className="text-xl font-black text-slate-800">{requiredDailyRate} <span className="text-xs font-bold text-slate-500">Notif/Day</span></p>
                          </div>
                        </div>

                        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-xs">
                          <div className="flex justify-between font-bold">
                            <span className="text-slate-500">Month-End Projection:</span>
                            <span className="font-black text-indigo-600">{projectedTotal} Notifications ({projectedPct}%)</span>
                          </div>
                          <div className="flex justify-between font-bold">
                            <span className="text-slate-500">Days Remaining:</span>
                            <span className="text-slate-700">{daysRemaining} Days</span>
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

              {/* District Benchmarking Comparator */}
              <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-4">
                  <div>
                    <h3 className="text-slate-800 font-black text-base flex items-center gap-2">
                      <span>⚖️</span> District Benchmarking Comparator
                    </h3>
                    <p className="text-slate-400 text-xs font-semibold">Side-by-side performance comparison</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={compareDistA} onChange={(e) => setCompareDistA(e.target.value)} className="bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl px-2.5 py-1.5 outline-none">
                      {districts.filter(d => d !== 'All').map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <span className="text-xs font-black text-slate-400">vs</span>
                    <select value={compareDistB} onChange={(e) => setCompareDistB(e.target.value)} className="bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl px-2.5 py-1.5 outline-none">
                      {districts.filter(d => d !== 'All').map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>

                {(() => {
                  const recA = rawRecords.filter(r => r.working_place === compareDistA);
                  const recB = rawRecords.filter(r => r.working_place === compareDistB);
                  const notifA = recA.reduce((sum, r) => sum + (r.notifications || 0), 0);
                  const notifB = recB.reduce((sum, r) => sum + (r.notifications || 0), 0);
                  const testsA = recA.reduce((sum, r) => sum + (r.tests || 0), 0);
                  const testsB = recB.reduce((sum, r) => sum + (r.tests || 0), 0);
                  const dbtA = recA.reduce((sum, r) => sum + (r.dbt || 0), 0);
                  const dbtB = recB.reduce((sum, r) => sum + (r.dbt || 0), 0);
                  const kmA = recA.reduce((sum, r) => sum + (r.total_km || 0), 0);
                  const kmB = recB.reduce((sum, r) => sum + (r.total_km || 0), 0);

                  const metrics = [
                    { label: "Notifications", a: notifA, b: notifB },
                    { label: "Samples Tested", a: testsA, b: testsB },
                    { label: "DBT Processed", a: dbtA, b: dbtB },
                    { label: "Travelled KM", a: kmA, b: kmB }
                  ];

                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-auto">
                      {metrics.map((m, idx) => (
                        <div key={idx} className="bg-slate-50/80 p-3 rounded-2xl border border-slate-100 text-center">
                          <span className="text-[10px] font-black uppercase text-slate-400 block mb-2">{m.label}</span>
                          <div className="flex justify-between items-center text-xs font-black">
                            <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg">{m.a}</span>
                            <span className="text-[10px] text-slate-300">vs</span>
                            <span className="text-purple-600 bg-purple-50 px-2 py-0.5 rounded-lg">{m.b}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

            </div>
"""

if table_section_marker in text:
    text = text.replace(table_section_marker, pacing_and_comparison_ui + "\n" + table_section_marker)
    print("Pacing & Comparison UI added")

# 6. Add Duplicate Audit Modal before end of component
dup_modal_code = """      {/* Duplicate Audit Radar Modal */}
      {showDuplicateModal && duplicateAudit && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-2xl shadow-2xl border border-slate-100 max-h-[85vh] flex flex-col animate-fade-in">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <span>🛡️</span> Duplicate Patient ID Radar ({duplicateAudit.total_duplicate_ids})
                </h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Cross-Officer Collision Detector &bull; Month: {duplicateAudit.month}</p>
              </div>
              <button onClick={() => setShowDuplicateModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1 my-2">
              {duplicateAudit.duplicates && duplicateAudit.duplicates.length > 0 ? (
                duplicateAudit.duplicates.map((dup, idx) => (
                  <div key={idx} className="p-4 bg-rose-50/60 rounded-2xl border border-rose-100 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-sm font-black text-rose-700 bg-white px-2.5 py-1 rounded-lg border border-rose-200">
                        ID #{dup.patient_id}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full">
                        {dup.occurrence_count} Conflicting Entries
                      </span>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      {dup.occurrences.map((occ, oIdx) => (
                        <div key={oIdx} className="flex justify-between items-center text-xs bg-white/80 px-3 py-1.5 rounded-xl border border-rose-100/60 font-semibold text-slate-700">
                          <span>👤 <strong>{occ.fo_name}</strong> ({occ.district})</span>
                          <span className="text-[10px] text-slate-400">📅 {occ.date} &bull; {occ.category}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-emerald-600 font-bold">
                  🎉 Shabash! Is mahine me koi duplicate patient ID nahi mili. Full data clean hai!
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button onClick={() => setShowDuplicateModal(false)} className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2.5 px-6 rounded-xl transition-all">Close</button>
            </div>
          </div>
        </div>
      )}

      """

modal_insert_marker = "{/* FO Detailed IDs Inspector Modal */}"
if modal_insert_marker in text:
    text = text.replace(modal_insert_marker, dup_modal_code + modal_insert_marker)
    print("duplicate modal injected")

with open("dfy-frontend/src/AdminDashboard.jsx", "w", encoding="utf-8") as f:
    f.write(text)
