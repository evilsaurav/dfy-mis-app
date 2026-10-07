import React from 'react';

export default function AppGuideModal({
  show,
  onClose,
  appGuideSearch,
  setAppGuideSearch,
  appGuideActiveTopic,
  setAppGuideActiveTopic
}) {
  if (!show) return null;

  return (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-5xl w-full p-6 shadow-2xl space-y-5 animate-scale-up max-h-[92vh] flex flex-col">
            
            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-100 pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-white border border-teal-200/90 rounded-2xl p-1 shrink-0 shadow-sm flex items-center justify-center overflow-hidden">
                  <img src="/dfy-logo.png" alt="Doctors For You" className="w-full h-full object-contain" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800">DFY TB MIS — Admin SOP &amp; Feature Guide</h3>
                  <p className="text-xs text-slate-500 font-medium">Standard Operating Procedures for Super Admins &amp; District Sub-Admins</p>
                </div>
              </div>
              <button 
                onClick={() => onClose()} 
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center transition-all cursor-pointer"
                title="Close Guide"
              >
                &times;
              </button>
            </div>

            {/* Keyword Search Bar */}
            <div className="shrink-0 bg-slate-50 border border-slate-200 rounded-2xl p-3 flex items-center gap-2">
              <span className="text-slate-400 text-sm">🔍</span>
              <input
                type="text"
                value={appGuideSearch}
                onChange={(e) => setAppGuideSearch(e.target.value)}
                placeholder="Search topics (e.g. Nikshay, 24 columns, 72 hours, PIN reset, targets, duplicate)..."
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {appGuideSearch && (
                <button
                  type="button"
                  onClick={() => setAppGuideSearch('')}
                  className="text-xs text-slate-400 hover:text-slate-600 font-bold px-1"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Two-Column Body: Navigation Tabs + Content Viewer */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4 overflow-hidden min-h-[420px]">
              
              {/* Left Navigation Sidebar */}
              <div className="md:col-span-4 bg-slate-50 border border-slate-200/80 rounded-2xl p-2.5 space-y-1.5 overflow-y-auto max-h-[500px]">
                {[
                  { key: 'visual_sops', label: 'Visual Bento SOP Workflows', icon: '🧩', desc: 'Attendance, Reconciler & Excel Workflows' },
                  { key: 'notif_tray', label: 'Daily Notification Tray', icon: '📋', desc: 'Nikshay cross-check & 24-col copy' },
                  { key: 'reconciler', label: 'Nikshay Reconciler & Ledger', icon: '⚖️', desc: 'State dumps & 72h truth engine' },
                  { key: 'daily_reports', label: 'FO Daily Reports & Edits', icon: '🔍', desc: 'Attendance, 24h edit window' },
                  { key: 'targets', label: 'Targets & Daily Progression', icon: '🎯', desc: 'Target allocation & trajectory' },
                  { key: 'staff', label: 'Staff Directory & Duty PINs', icon: '👥', desc: 'Officer onboarding & PIN reset' },
                  { key: 'duplicate_radar', label: 'Duplicate Radar & 1-Click Fix', icon: '🛡️', desc: 'Cross-date duplicates & 1-click repair' },
                  { key: 'excel_reports', label: 'Excel Reports & State KPI', icon: '📊', desc: '33-sheet KPI, Nikshay & dumps' },
                  { key: 'audit_trail', label: 'Admin vs Sub-Admin (RBAC)', icon: '📜', desc: 'District boundary protection & logs' },
                  { key: 'faqs', label: 'Field FAQs & Troubleshooting', icon: '❓', desc: 'Top operational questions' },
                  { key: 'top_performers_studio', label: 'Top Performers & Analytics Studio', icon: '🏆', desc: '4-Role Leaderboard, Dynamic Designation Shift & Full-Width Trends' },
                  { key: 'travel_allowance', label: 'Travel Allowance & Bike Log', icon: '🏍️', desc: 'Pre-fill, Rate Config, Audit & 24h Dispute' }
                ]
                  .filter(topic => {
                    if (!appGuideSearch.trim()) return true;
                    const q = appGuideSearch.trim().toLowerCase();
                    return topic.label.toLowerCase().includes(q) || topic.desc.toLowerCase().includes(q) || topic.key.toLowerCase().includes(q);
                  })
                  .map(topic => (
                    <button
                      key={topic.key}
                      type="button"
                      onClick={() => setAppGuideActiveTopic(topic.key)}
                      className={`w-full text-left p-2.5 rounded-xl transition-all cursor-pointer flex items-start gap-2.5 ${
                        appGuideActiveTopic === topic.key
                          ? 'bg-indigo-600 text-white shadow-xs font-bold'
                          : 'hover:bg-slate-200/70 text-slate-700 font-medium'
                      }`}
                    >
                      <span className="text-base p-1 rounded-lg bg-white/10 shrink-0">{topic.icon}</span>
                      <div className="overflow-hidden">
                        <div className="text-xs font-bold truncate">{topic.label}</div>
                        <div className={`text-[10px] truncate ${appGuideActiveTopic === topic.key ? 'text-indigo-100' : 'text-slate-500'}`}>
                          {topic.desc}
                        </div>
                      </div>
                    </button>
                  ))}
              </div>

              {/* Right Content Panel */}
              <div className="md:col-span-8 bg-white border border-slate-200 rounded-2xl p-5 overflow-y-auto max-h-[500px] space-y-4 text-slate-700 text-xs leading-relaxed">
                
                {/* TOPIC 0: Visual Bento SOP Workflows */}
                {appGuideActiveTopic === 'visual_sops' && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                      <span className="text-xl">🧩</span>
                      <div>
                        <h4 className="text-sm font-black text-slate-900">DFY TB MIS &mdash; Visual Bento SOP Workflows</h4>
                        <p className="text-[11px] text-slate-500 font-medium">Standard Operating Procedures for Attendance, Reconciler &amp; Excel Reports</p>
                      </div>
                    </div>

                    {/* FLOWCHART 1: Attendance Monitoring & Retroactive Remarks */}
                    <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base p-1.5 bg-indigo-50 text-indigo-700 rounded-xl">⚡</span>
                          <div>
                            <h5 className="text-xs font-black text-slate-900">Attendance Monitoring Workflow</h5>
                            <p className="text-[10px] text-slate-500 font-medium">Morning &amp; Evening Attendance Monitoring, Bulletins &amp; Overrides</p>
                          </div>
                        </div>
                        <span className="text-[9px] font-bold uppercase bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                          Live Radar &amp; Remarks
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1">
                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">1</span>
                            <span className="text-sm">📡</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Open Attendance Radar</strong>
                          <p className="text-[10px] text-slate-600">Assigned canonical districts ka live attendance view.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">2</span>
                            <span className="text-sm">⏰</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Stealth 10 AM Cutoff &amp; Timestamps</strong>
                          <p className="text-[10px] text-slate-600">&lt;10 AM reports count for yesterday with Next Day Morning badge.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">3</span>
                            <span className="text-sm">⚠️</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Review Defaulters</strong>
                          <p className="text-[10px] text-slate-600">Missing staff aur 3+ din ke chronic absent streak filter.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">4</span>
                            <span className="text-sm">📢</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">1-Click WhatsApp Reminder</strong>
                          <p className="text-[10px] text-slate-600">District-wise formatted bulletin WhatsApp par copy &amp; send.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">5</span>
                            <span className="text-sm">✏️</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Add Remark / Mark Leave</strong>
                          <p className="text-[10px] text-slate-600">Past ya current date par remark aur status override with live FO sync.</p>
                        </div>
                      </div>
                    </div>

                    {/* FLOWCHART 2: Nikshay Reconciler & Direct Patient Contact */}
                    <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base p-1.5 bg-emerald-50 text-emerald-700 rounded-xl">⚖️</span>
                          <div>
                            <h5 className="text-xs font-black text-slate-900">Nikshay Reconciler Workflow</h5>
                            <p className="text-[10px] text-slate-500 font-medium">Nikshay Reconciler &amp; Direct Patient Contact Engine</p>
                          </div>
                        </div>
                        <span className="text-[9px] font-bold uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                          Monotonic Ledger
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1">
                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-emerald-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">1</span>
                            <span className="text-sm">📤</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Upload Nikshay Excel</strong>
                          <p className="text-[10px] text-slate-600">State dump (.xlsx / .csv) portal upload by Super Admin.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-emerald-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">2</span>
                            <span className="text-sm">🔍</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Automatic Header Match</strong>
                          <p className="text-[10px] text-slate-600">24+ NTEP headers auto-mapped without schema errors.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-emerald-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">3</span>
                            <span className="text-sm">🔒</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Monotonic Ledger Sync</strong>
                          <p className="text-[10px] text-slate-600">Verified DBT &amp; tests permanently locked in database.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-emerald-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">4</span>
                            <span className="text-sm">📋</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Actionable Pending Lists</strong>
                          <p className="text-[10px] text-slate-600">Unresolved patients pushed to FO Pending Hub.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-emerald-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">5</span>
                            <span className="text-sm">📞</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">1-Tap Call Patient from Drawer</strong>
                          <p className="text-[10px] text-slate-600">Direct dialer link &amp; clipboard phone copy inside drawer.</p>
                        </div>
                      </div>
                    </div>

                    {/* FLOWCHART 3: Dual-Sheet Staff Attendance Export Workflow */}
                    <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base p-1.5 bg-teal-50 text-teal-700 rounded-xl">📊</span>
                          <div>
                            <h5 className="text-xs font-black text-slate-900">Dual-Sheet Staff Attendance Export Workflow</h5>
                            <p className="text-[10px] text-slate-500 font-medium">Historical Attendance Corrections &amp; Monthly Export</p>
                          </div>
                        </div>
                        <span className="text-[9px] font-bold uppercase bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full">
                          1s Sequential Queue
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1">
                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-teal-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">1</span>
                            <span className="text-sm">📅</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Select Past Date in Radar</strong>
                          <p className="text-[10px] text-slate-600">Past dates inspect karein, staff ka submitted data review karein.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-teal-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">2</span>
                            <span className="text-sm">📝</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Attach Remark / Leave</strong>
                          <p className="text-[10px] text-slate-600">P, ML, CL, OD, A status override aur supervisor remarks save karein.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-teal-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">3</span>
                            <span className="text-sm">🔄</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">FO Calendar Live Sync</strong>
                          <p className="text-[10px] text-slate-600">Field officer ke profile calendar me turant status update ho jata hai.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-teal-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">4</span>
                            <span className="text-sm">🎯</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Report Studio: Multi-District Queue</strong>
                          <p className="text-[10px] text-slate-600">Target districts select karein, 1000ms cooldown queue ke saath.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-teal-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">5</span>
                            <span className="text-sm">📑</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Dual-Sheet Attendance Workbook (.xlsx)</strong>
                          <p className="text-[10px] text-slate-600">Sheet 1: Monthly Matrix; Sheet 2: Granular Activity Log.</p>
                        </div>
                      </div>
                    </div>

                    {/* FLOWCHART 4: Travel Allowance (Bike Log) Workflow & Audit Trail */}
                    <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base p-1.5 bg-indigo-50 text-indigo-700 rounded-xl">🏍️</span>
                          <div>
                            <h5 className="text-xs font-black text-slate-900">Travel Allowance (Bike Log) Workflow &amp; Audit Trail</h5>
                            <p className="text-[10px] text-slate-500 font-medium">Pre-fill, Dynamic Rates, Per-Staff Approval &amp; 24h Dispute</p>
                          </div>
                        </div>
                        <span className="text-[9px] font-bold uppercase bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                          PostgreSQL Relational Engine
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1">
                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">1</span>
                            <span className="text-sm">🔄</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Pre-fill or Manual Log</strong>
                          <p className="text-[10px] text-slate-600">Daily field reports ke odometer readings auto-sync ya manual day entry.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">2</span>
                            <span className="text-sm">⚙️</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Dynamic Rate Config</strong>
                          <p className="text-[10px] text-slate-600">Super Admin / Incharge rate set karte hain (Default: ₹4.00/KM).</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">3</span>
                            <span className="text-sm">📝</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Sub-Admin Review &amp; Edit</strong>
                          <p className="text-[10px] text-slate-600">KM readings audit karein, deductions apply karein aur roster submit karein.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">4</span>
                            <span className="text-sm">🔒</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Incharge Pass / Lock</strong>
                          <p className="text-[10px] text-slate-600">Per-staff pass ya revert. Approved record turant lock ho jata hai.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">5</span>
                            <span className="text-sm">⚖️</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">24h Dispute &amp; Excel Export</strong>
                          <p className="text-[10px] text-slate-600">FO mobile profile me 24h dispute window khulti hai; multi-sheet Excel export.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TOPIC 1: Daily Notification Tray */}
                {appGuideActiveTopic === 'notif_tray' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">📋</span>
                        <div>
                          <h4 className="text-sm font-black text-slate-900">Daily Notification Tray &amp; Nikshay Cross-Verification</h4>
                          <p className="text-[11px] text-slate-500 font-medium">Zero-RAM client-side verification engine with 1-click clipboard formats</p>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                        24-Col Excel &bull; 0ms Filter
                      </span>
                    </div>

                    {/* 4-Stage Bento Flowchart */}
                    <div className="bg-gradient-to-br from-amber-50/60 to-slate-50 border border-amber-200/80 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                          <span>⚡</span>
                          <span>4-Stage Notification Verification Sequence</span>
                        </h5>
                        <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                          SOP 1 ➔ 2 ➔ 3 ➔ 4
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                        {/* Stage 1 */}
                        <div className="bg-white border border-amber-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <span className="w-5 h-5 rounded-full bg-amber-600 text-white font-black text-[10px] flex items-center justify-center">1</span>
                            <span className="text-[9px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-md">Stage 01</span>
                          </div>
                          <div>
                            <strong className="text-xs font-black text-slate-900 block">Open Notification Tray</strong>
                            <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                              Dashboard top header se Notification Tray kholein. Live notification ID count aur date range preview check karein.
                            </p>
                          </div>
                          <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-amber-700">
                            <span>➔ District Filter</span>
                          </div>
                        </div>

                        {/* Stage 2 */}
                        <div className="bg-white border border-amber-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <span className="w-5 h-5 rounded-full bg-amber-600 text-white font-black text-[10px] flex items-center justify-center">2</span>
                            <span className="text-[9px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-md">Stage 02</span>
                          </div>
                          <div>
                            <strong className="text-xs font-black text-slate-900 block">Filter Canonical District</strong>
                            <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                              Single ya multi-district chip deck se filter karein. Sub-Admins strictly assigned districts tak isolated rehte hain.
                            </p>
                          </div>
                          <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-amber-700">
                            <span>➔ Quick Copy</span>
                          </div>
                        </div>

                        {/* Stage 3 */}
                        <div className="bg-white border border-amber-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <span className="w-5 h-5 rounded-full bg-amber-600 text-white font-black text-[10px] flex items-center justify-center">3</span>
                            <span className="text-[9px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-md">Stage 03</span>
                          </div>
                          <div>
                            <strong className="text-xs font-black text-slate-900 block">1-Click 24-Col Excel Copy</strong>
                            <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                              24-Column Excel Copy dabayein. Sl No, FO Name, Date (DD-MM-YYYY), District, aur ID pre-filled copy honge.
                            </p>
                          </div>
                          <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-amber-700">
                            <span>➔ Nikshay Portal</span>
                          </div>
                        </div>

                        {/* Stage 4 */}
                        <div className="bg-white border border-amber-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-black text-[10px] flex items-center justify-center">4</span>
                            <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded-md">Stage 04</span>
                          </div>
                          <div>
                            <strong className="text-xs font-black text-slate-900 block">Mark Done in Nikshay</strong>
                            <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                              Nikshay Portal par IDs cross-verify karein. Verification complete hote hi status confirmed ho jata hai.
                            </p>
                          </div>
                          <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-emerald-700">
                            <span>✔ Completed</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Dual Clipboard Format Comparison Bento */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <strong className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                            <span>📋</span>
                            <span>Copy Last Day IDs (1-per-line)</span>
                          </strong>
                          <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">Single Column</span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          Jab aapko kal ya aaj report hui nayi notification IDs ko Nikshay portal search bar me ek-ek karke check karna ho, ya Excel ke kisi column me row-by-row paste karna ho:
                        </p>
                        <div className="bg-white border border-slate-200 rounded-xl p-2 text-[10px] text-slate-700 space-y-0.5">
                          <div>&bull; <strong>Action:</strong> IDs newline (`\n`) separated clipboard me save hoti hain.</div>
                          <div>&bull; <strong>Excel Paste:</strong> Kisi ek cell par `Ctrl+V` karein, har ID alag row me baithegi.</div>
                        </div>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <strong className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                            <span>📑</span>
                            <span>24-Column Excel Format (Master Sheet)</span>
                          </strong>
                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Standardized Sheet</span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          Official Nikshay register format me Sl No, FO Name, Date (DD-MM-YYYY), District, aur Episode ID ke saath 19 blank clinical columns tab-delimited copy hote hain.
                        </p>
                        <div className="bg-slate-900 text-slate-200 p-2 rounded-xl font-mono text-[9px] truncate">
                          Sl No | FO Name | Date (DD-MM-YYYY) | District | TBU Name | ... | ID
                        </div>
                      </div>
                    </div>

                    {/* Bento Alert Card: 72h Grace Lag Rule */}
                    <div className="bg-rose-50 border border-rose-200 p-3.5 rounded-2xl space-y-1.5 text-rose-950">
                      <div className="font-black text-xs flex items-center gap-1.5">
                        <span>⚠️</span>
                        <span>Zaroori Nirdesh: 72-Hour Government Portal Sync Lag Rule</span>
                      </div>
                      <p className="text-[11px] text-rose-900 leading-relaxed">
                        Agar koi ID portal par search karne par nahi mil rahi hai, toh <strong>turant Field Officer ko fraud declare na karein</strong>. Government Nikshay portal me health center se server par data aane me <strong>24 se 72 ghante (3 din)</strong> ka lag hota hai.
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px] font-bold">
                        <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-0.5 rounded-lg">
                          &le; 72h Grace: Pending Sync me rakhein
                        </span>
                        <span className="bg-rose-100 text-rose-900 border border-rose-300 px-2.5 py-0.5 rounded-lg">
                          &gt; 72h Check: Portal search bar me manual confirm karein
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* TOPIC 2: Nikshay Reconciler & Cumulative Ledger */}
                {appGuideActiveTopic === 'reconciler' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">⚖️</span>
                        <div>
                          <h4 className="text-sm font-black text-slate-900">Nikshay Reconciler &amp; Permanent Cumulative Ledger</h4>
                          <p className="text-[11px] text-slate-500 font-medium">Cross-matching field reports with official government NTEP portal dumps</p>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                        Monotonic Truth Engine
                      </span>
                    </div>

                    {/* 4-Step Bento Data Pipeline */}
                    <div className="bg-gradient-to-br from-emerald-50/60 to-slate-50 border border-emerald-200/80 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                          <span>🔄</span>
                          <span>4-Step Reconciler Pipeline &amp; Verification Flow</span>
                        </h5>
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                          Pipeline 1 ➔ 2 ➔ 3 ➔ 4
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                        {/* Step 1 */}
                        <div className="bg-white border border-emerald-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-black text-[10px] flex items-center justify-center">1</span>
                            <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded-md">Step 01</span>
                          </div>
                          <div>
                            <strong className="text-xs font-black text-slate-900 block">State Monthly Dump Upload</strong>
                            <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                              Super Admin official Nikshay state dump (.xlsx / .csv) upload karte hain. 24+ NTEP headers auto-mapped.
                            </p>
                          </div>
                          <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-emerald-700">
                            <span>➔ Cross-Check</span>
                          </div>
                        </div>

                        {/* Step 2 */}
                        <div className="bg-white border border-emerald-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-black text-[10px] flex items-center justify-center">2</span>
                            <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded-md">Step 02</span>
                          </div>
                          <div>
                            <strong className="text-xs font-black text-slate-900 block">5-Indicator Reconciliation</strong>
                            <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                              Multi-Indicator Cross-Check: Notification, HIV Screening, Diabetes, DBT Bank Linkage, aur UDST test verify hote hain.
                            </p>
                          </div>
                          <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-emerald-700">
                            <span>➔ Lock Ledger</span>
                          </div>
                        </div>

                        {/* Step 3 */}
                        <div className="bg-white border border-emerald-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-black text-[10px] flex items-center justify-center">3</span>
                            <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded-md">Step 03</span>
                          </div>
                          <div>
                            <strong className="text-xs font-black text-slate-900 block">Monotonic Ledger Sync</strong>
                            <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                              Permanent Cumulative Ledger: Verified records permanently database me lock ho jate hain aur future dumps me degrade nahi hote.
                            </p>
                          </div>
                          <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-emerald-700">
                            <span>➔ Action Pending</span>
                          </div>
                        </div>

                        {/* Step 4 */}
                        <div className="bg-white border border-emerald-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <span className="w-5 h-5 rounded-full bg-teal-600 text-white font-black text-[10px] flex items-center justify-center">4</span>
                            <span className="text-[9px] font-bold text-teal-800 bg-teal-100 px-1.5 py-0.5 rounded-md">Step 04</span>
                          </div>
                          <div>
                            <strong className="text-xs font-black text-slate-900 block">Actionable Pending &amp; 1-Tap Call</strong>
                            <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                              Unresolved patients FO Pending Hub me sync hote hain; Direct Patient Contact drawer se 1-Tap Call aur copy uplabdh hai.
                            </p>
                          </div>
                          <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-teal-700">
                            <span>✔ Field Ready</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* RBAC Boundary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3.5 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">👑</span>
                          <strong className="text-xs font-black text-emerald-950">Super Admin Privileges</strong>
                        </div>
                        <p className="text-[11px] text-emerald-900 leading-relaxed">
                          Pure Bihar ke sabhi 22+ districts ka official Nikshay state dump upload karke statewide reconciliation run karne ka adhikar sirf Super Admin ke paas hai.
                        </p>
                      </div>

                      <div className="bg-sky-50/70 border border-sky-200 rounded-2xl p-3.5 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">🛡️</span>
                          <strong className="text-xs font-black text-sky-950">District Sub-Admin Privileges</strong>
                        </div>
                        <p className="text-[11px] text-sky-900 leading-relaxed">
                          Sub-Admins dumps upload nahi kar sakte; wo apne-apne district ka <strong>11-Column Discrepancy Review Sheet (.xlsx)</strong> download karke field follow-up karwa sakte hain.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* TOPIC 3: FO Daily Reports & Edit Window */}
                {appGuideActiveTopic === 'daily_reports' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🔍</span>
                        <div>
                          <h4 className="text-sm font-black text-slate-900">FO Daily Reports, Inspection &amp; Stealth 10 AM Cutoff</h4>
                          <p className="text-[11px] text-slate-500 font-medium">Operational mechanics of daily submission ingestion, morning grace &amp; historical editing</p>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold uppercase bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full border border-indigo-200">
                        Stealth 10 AM Engine
                      </span>
                    </div>

                    {/* 3-Card Bento Flowchart Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Card 1: Stealth 10 AM Cutoff Engine */}
                      <div className="bg-gradient-to-br from-amber-50/70 to-slate-50 border border-amber-200 rounded-2xl p-3.5 flex flex-col justify-between space-y-2.5 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="w-5 h-5 rounded-full bg-amber-600 text-white font-black text-[10px] flex items-center justify-center">1</span>
                          <span className="text-[9px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full">Attendance Grace</span>
                        </div>
                        <div>
                          <h5 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                            <span>⏰</span>
                            <span>Stealth 10:00 AM Reporting Cutoff Engine</span>
                          </h5>
                          <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                            Submissions completed before <strong>10:00 AM IST</strong> unconditionally map to <strong>Yesterday (D-1 / beete huye kal ki date)</strong> with prominent <code className="bg-amber-100 text-amber-900 px-1 rounded font-bold text-[10px]">⏰ Next day morning HH:MM AM</code> badge. Submissions &ge; 10:00 AM count for Today.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-amber-100 text-[10px] font-bold text-amber-800">
                          <span>✔ Eliminates Morning Attendance Skew</span>
                        </div>
                      </div>

                      {/* Card 2: 24-Hour Self-Correction Window */}
                      <div className="bg-gradient-to-br from-indigo-50/70 to-slate-50 border border-indigo-200 rounded-2xl p-3.5 flex flex-col justify-between space-y-2.5 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-black text-[10px] flex items-center justify-center">2</span>
                          <span className="text-[9px] font-bold text-indigo-900 bg-indigo-100 px-2 py-0.5 rounded-full">FO Self-Correction</span>
                        </div>
                        <div>
                          <h5 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                            <span>⏱️</span>
                            <span>24-Hour Edit Window &amp; Missing IDs</span>
                          </h5>
                          <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                            Field Officers ko report submit karne ke baad <strong>24 ghante</strong> tak profile calendar se corrections, remarks update, ya <strong>+ Add Missing Patient ID</strong> selector se IDs add karne ki anumati hoti hai. 24h baad form automatically lock ho jata hai.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-indigo-100 text-[10px] font-bold text-indigo-800">
                          <span>✔ Strict Anti-Tampering Lock</span>
                        </div>
                      </div>

                      {/* Card 3: Inspect All IDs & Full Day Report Editor */}
                      <div className="bg-gradient-to-br from-teal-50/70 to-slate-50 border border-teal-200 rounded-2xl p-3.5 flex flex-col justify-between space-y-2.5 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="w-5 h-5 rounded-full bg-teal-600 text-white font-black text-[10px] flex items-center justify-center">3</span>
                          <span className="text-[9px] font-bold text-teal-900 bg-teal-100 px-2 py-0.5 rounded-full">Admin Audit Dossier</span>
                        </div>
                        <div>
                          <h5 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                            <span>✏️</span>
                            <span>Inspect All IDs &amp; Full Day Report Editor</span>
                          </h5>
                          <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                            Master Table me kisi bhi officer par click karke chronological dossier kholein. Admin <strong>Edit Day</strong> se KM, doctor visits, remarks aur patient IDs modify kar sakte hain with atomic district rollup recalculation.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-teal-100 text-[10px] font-bold text-teal-800">
                          <span>✔ Atomic Recalculation Guard</span>
                        </div>
                      </div>
                    </div>

                    {/* Anti-Corruption Shield */}
                    <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl flex items-center justify-between gap-3 text-slate-700">
                      <div className="flex items-center gap-2.5">
                        <span className="text-base p-1.5 bg-slate-200 rounded-xl">🛡️</span>
                        <div>
                          <strong className="text-xs font-bold text-slate-900 block">Blank Report Prevention:</strong>
                          <span className="text-[11px] text-slate-600">Koi bhi officer 0 IDs ke saath blank form submit nahi kar sakta, jab tak ki valid meeting/camp Remark ya Doctor Visit darj na ho.</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold bg-slate-200 text-slate-800 px-2.5 py-1 rounded-xl shrink-0">Zero Ghost Entries</span>
                    </div>
                  </div>
                )}

                {/* TOPIC 4: Targets & Performance Analytics */}
                {appGuideActiveTopic === 'targets' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🎯</span>
                        <div>
                          <h4 className="text-sm font-black text-slate-900">Monthly Targets &amp; Progression Trends</h4>
                          <p className="text-[11px] text-slate-500 font-medium">Target allocation, run-rate velocity, Sunday buffers and month-end forecasting</p>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold uppercase bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full border border-purple-200">
                        Dynamic Pacing Studio
                      </span>
                    </div>

                    {/* 4-Card Bento Flowchart Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                      {/* Step 1 */}
                      <div className="bg-white border border-purple-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-black text-[10px] flex items-center justify-center">1</span>
                          <span className="text-[9px] font-bold text-purple-800 bg-purple-100 px-1.5 py-0.5 rounded-md">Stage 01</span>
                        </div>
                        <div>
                          <strong className="text-xs font-black text-slate-900 block">Monthly Target Allocation</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            Mahine ki shuruat me har district aur individual officer ko TB notification target assign kiya jata hai.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-purple-700">
                          <span>➔ Daily Velocity</span>
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className="bg-white border border-purple-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-black text-[10px] flex items-center justify-center">2</span>
                          <span className="text-[9px] font-bold text-purple-800 bg-purple-100 px-1.5 py-0.5 rounded-md">Stage 02</span>
                        </div>
                        <div>
                          <strong className="text-xs font-black text-slate-900 block">Daily Pace Calculation</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            Run-Rate Velocity: Remaining target ko remaining working days se divide karke daily required pace auto-calculate hota hai.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-purple-700">
                          <span>➔ Calendar Buffer</span>
                        </div>
                      </div>

                      {/* Step 3 */}
                      <div className="bg-white border border-purple-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-black text-[10px] flex items-center justify-center">3</span>
                          <span className="text-[9px] font-bold text-purple-800 bg-purple-100 px-1.5 py-0.5 rounded-md">Stage 03</span>
                        </div>
                        <div>
                          <strong className="text-xs font-black text-slate-900 block">Sunday &amp; Holiday Buffer</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            Calendar engine automatically sabhi Sundays aur declared government holidays ko filter karke realistic pace deta hai.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-purple-700">
                          <span>➔ Studio Forecast</span>
                        </div>
                      </div>

                      {/* Step 4 */}
                      <div className="bg-white border border-purple-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-black text-[10px] flex items-center justify-center">4</span>
                          <span className="text-[9px] font-bold text-indigo-800 bg-indigo-100 px-1.5 py-0.5 rounded-md">Stage 04</span>
                        </div>
                        <div>
                          <strong className="text-xs font-black text-slate-900 block">Forecast Model &amp; Studio</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            Performance Studio ka Horizontal Bar Chart 22 districts ko top performers se lagging districts tak rank karta hai.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-indigo-700">
                          <span>✔ Trajectory Ready</span>
                        </div>
                      </div>
                    </div>

                    {/* Operational Tips Bento */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
                      <strong className="text-xs font-black text-slate-900 block">Progression Trend Analytics (Day 1 se 30/31):</strong>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        Line chart pure mahine me daily progression dikhata hai ki kis din peak reporting aayi. Bar Chart view me direct number labels target bar par visible rehte hain, jabki Grid view me individual officers ka drill-down milta hai.
                      </p>
                    </div>
                  </div>
                )}

                {/* TOPIC 5: Staff Directory & Duty PINs */}
                {appGuideActiveTopic === 'staff' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">👥</span>
                        <div>
                          <h4 className="text-sm font-black text-slate-900">Staff Directory &amp; Duty PIN Management</h4>
                          <p className="text-[11px] text-slate-500 font-medium">Officer credentials, designation management, and consonant-collapsed inactive defense</p>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold uppercase bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full border border-blue-200">
                        Zero-Ghost Roster
                      </span>
                    </div>

                    {/* 4-Card Bento Sequence Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                      {/* Step 1 */}
                      <div className="bg-white border border-blue-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-black text-[10px] flex items-center justify-center">1</span>
                          <span className="text-[9px] font-bold text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded-md">Step 01</span>
                        </div>
                        <div>
                          <strong className="text-xs font-black text-slate-900 block">Onboard Officer &amp; Role</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            Staff Directory me naya officer add karein aur Designation assign karein (FO, DC, STS, TBHV, LT).
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-blue-700">
                          <span>➔ Assign Duty PIN</span>
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className="bg-white border border-blue-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-black text-[10px] flex items-center justify-center">2</span>
                          <span className="text-[9px] font-bold text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded-md">Step 02</span>
                        </div>
                        <div>
                          <strong className="text-xs font-black text-slate-900 block">4-Digit Duty PIN</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            Officer ke mobile login aur attendance authentication ke liye secure 4-Digit Duty PIN generate hota hai.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-blue-700">
                          <span>➔ Reset Support</span>
                        </div>
                      </div>

                      {/* Step 3 */}
                      <div className="bg-white border border-blue-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-black text-[10px] flex items-center justify-center">3</span>
                          <span className="text-[9px] font-bold text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded-md">Step 03</span>
                        </div>
                        <div>
                          <strong className="text-xs font-black text-slate-900 block">Reset PIN in 1-Click</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            PIN bhoolne par Staff Directory me &lsquo;Reset PIN&rsquo; par click karke naya 4-digit code set karein, bina delay.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-blue-700">
                          <span>➔ Lifecycle Guard</span>
                        </div>
                      </div>

                      {/* Step 4 */}
                      <div className="bg-white border border-blue-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="w-5 h-5 rounded-full bg-rose-600 text-white font-black text-[10px] flex items-center justify-center">4</span>
                          <span className="text-[9px] font-bold text-rose-800 bg-rose-100 px-1.5 py-0.5 rounded-md">Step 04</span>
                        </div>
                        <div>
                          <strong className="text-xs font-black text-slate-900 block">Deactivation &amp; Inactive Guard</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            Consonant-Collapsed normalization defense ensures inactive staff past history rehti hai lekin defaulters me 0 ghosting hoti hai.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-rose-700">
                          <span>✔ Protected</span>
                        </div>
                      </div>
                    </div>

                    {/* Security Callout Card */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1.5 text-slate-700 text-[11px]">
                      <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                        <span>🔒</span>
                        <span>Inactive Staff PIN Lockout &amp; Historical Safety</span>
                      </div>
                      <p className="leading-relaxed">
                        Deactivated officers ka account `/verify-pin` par strictly locked rehta hai aur wo naya report submit nahi kar sakte. Unke purane sabhi reports, monthly rollups aur audit history 100% surakshit rehte hain.
                      </p>
                    </div>
                  </div>
                )}

                {/* TOPIC 6: Duplicate Radar & 1-Click Auto-Repair */}
                {appGuideActiveTopic === 'duplicate_radar' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🛡️</span>
                        <div>
                          <h4 className="text-sm font-black text-slate-900">Duplicate Patient Radar &amp; 1-Click Auto-Repair Suite</h4>
                          <p className="text-[11px] text-slate-500 font-medium">Multi-tier collision detection, cross-district guards, and atomic rollup recalculation</p>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold uppercase bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full border border-rose-200">
                        Atomic Prune Engine
                      </span>
                    </div>

                    {/* 3-Tier Detection Bento Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex flex-col justify-between space-y-2">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                              <span>⚠️</span>
                              <span>Same-Day Check</span>
                            </span>
                            <span className="text-[9px] font-bold text-slate-600 bg-slate-200 px-1.5 py-0.5 rounded">Tier 1</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-800 block">Within District Collision</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            Agar ek hi district me do alag officers ne ek hi din same patient ID submit ki hai, toh yahan alert dikhta hai for immediate field audit.
                          </p>
                        </div>
                        <span className="text-[9px] font-bold text-slate-500 pt-1 border-t border-slate-200">Local District Scope</span>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex flex-col justify-between space-y-2">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                              <span>🌐</span>
                              <span>Cross-District</span>
                            </span>
                            <span className="text-[9px] font-bold text-slate-600 bg-slate-200 px-1.5 py-0.5 rounded">Tier 2</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-800 block">Between Districts Collision</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            Agar ek patient ID Bihar ke do alag districts (e.g. Patna aur Gaya) me submit hui hai, toh State Coordinator OPD slip se verify karke retain karte hain.
                          </p>
                        </div>
                        <span className="text-[9px] font-bold text-slate-500 pt-1 border-t border-slate-200">Statewide Scope</span>
                      </div>

                      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 flex flex-col justify-between space-y-2">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-black text-rose-950 flex items-center gap-1.5">
                              <span>🚨</span>
                              <span>Inflation Radar</span>
                            </span>
                            <span className="text-[9px] font-bold text-rose-900 bg-rose-200 px-1.5 py-0.5 rounded">Tier 3</span>
                          </div>
                          <strong className="text-[11px] font-bold text-rose-900 block">Cross-Date Inflation</strong>
                          <p className="text-[10px] text-rose-800 mt-1 leading-normal">
                            Field Officer dwara purani dates ke patients dobara notification box me repeat karne par count inflate ho jata hai. Iska 1-Click Fix uplabdh hai.
                          </p>
                        </div>
                        <span className="text-[9px] font-bold text-rose-700 pt-1 border-t border-rose-200">1-Click Auto-Repair</span>
                      </div>
                    </div>

                    {/* 5-Step 1-Click Auto-Repair Bento Flowchart */}
                    <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-black text-rose-950 flex items-center gap-1.5">
                          <span>⚡</span>
                          <span>1-Click Auto-Repair Execution Pipeline</span>
                        </h5>
                        <span className="text-[10px] font-bold text-rose-900 bg-rose-200/80 px-2 py-0.5 rounded-full">
                          Atomic Decrement
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                        <div className="bg-white border border-rose-200 rounded-xl p-2.5 space-y-1">
                          <span className="w-4 h-4 rounded-full bg-rose-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">1</span>
                          <strong className="text-[10px] font-bold text-slate-900 block">Earliest Valid Date</strong>
                          <p className="text-[9px] text-slate-600">First submission date record bilkul safe rehta hai.</p>
                        </div>

                        <div className="bg-white border border-rose-200 rounded-xl p-2.5 space-y-1">
                          <span className="w-4 h-4 rounded-full bg-rose-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">2</span>
                          <strong className="text-[10px] font-bold text-slate-900 block">Duplicate Stripped</strong>
                          <p className="text-[9px] text-slate-600">Baad wali date se repeat notification ID hat jati hai.</p>
                        </div>

                        <div className="bg-white border border-rose-200 rounded-xl p-2.5 space-y-1">
                          <span className="w-4 h-4 rounded-full bg-rose-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">3</span>
                          <strong className="text-[10px] font-bold text-slate-900 block">Atomic Rollup Recalculation</strong>
                          <p className="text-[9px] text-slate-600">Increment(-N) se district rollup count turant theek ho jata hai.</p>
                        </div>

                        <div className="bg-white border border-rose-200 rounded-xl p-2.5 space-y-1">
                          <span className="w-4 h-4 rounded-full bg-emerald-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">4</span>
                          <strong className="text-[10px] font-bold text-slate-900 block">Other Work Safe</strong>
                          <p className="text-[9px] text-slate-600">Visits, FDC dawai, DBT, aur KM bilkul safe rehte hain.</p>
                        </div>

                        <div className="bg-white border border-rose-200 rounded-xl p-2.5 space-y-1">
                          <span className="w-4 h-4 rounded-full bg-indigo-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">5</span>
                          <strong className="text-[10px] font-bold text-slate-900 block">RBAC Boundary</strong>
                          <p className="text-[9px] text-slate-600">Sub-Admin sirf apne district me run kar sakta hai (403 guard).</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TOPIC 7: Excel Reports & Statewide Exports */}
                {appGuideActiveTopic === 'excel_reports' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">📊</span>
                        <div>
                          <h4 className="text-sm font-black text-slate-900">State Excel Reports &amp; 33-Sheet KPI Export</h4>
                          <p className="text-[11px] text-slate-500 font-medium">Enterprise multi-sheet workbooks, Nikshay 24-col exports, and concurrency memory guards</p>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold uppercase bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full border border-teal-200">
                        Zero-RAM Spike
                      </span>
                    </div>

                    {/* 4-Card Bento Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="text-base p-1 bg-indigo-50 text-indigo-700 rounded-lg">📈</span>
                          <span className="text-[9px] font-bold text-indigo-800 bg-indigo-100 px-1.5 py-0.5 rounded-md">33 Sheets</span>
                        </div>
                        <div>
                          <strong className="text-xs font-black text-slate-900 block">State KPI Workbook</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            Sheet 1 statewide ranking aur 32 district sheets with custom styling, borders aur cohort breakdown.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-indigo-700">Executive Report</div>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="text-base p-1 bg-teal-50 text-teal-700 rounded-lg">📑</span>
                          <span className="text-[9px] font-bold text-teal-800 bg-teal-100 px-1.5 py-0.5 rounded-md">Dual-Sheet</span>
                        </div>
                        <div>
                          <strong className="text-xs font-black text-slate-900 block">Dual-Sheet Staff Attendance</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            Sheet 1 monthly attendance matrix with P/L/A colors; Sheet 2 granular activity log with next-day morning notes.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-teal-700">Attendance Studio</div>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="text-base p-1 bg-amber-50 text-amber-700 rounded-lg">📋</span>
                          <span className="text-[9px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-md">24 Columns</span>
                        </div>
                        <div>
                          <strong className="text-xs font-black text-slate-900 block">Nikshay 24-Column Sheet</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            Notification Tray se direct download, official Nikshay portal columns me structured for rapid verification.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-amber-700">Govt Format</div>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="text-base p-1 bg-slate-100 text-slate-700 rounded-lg">🗄️</span>
                          <span className="text-[9px] font-bold text-slate-800 bg-slate-200 px-1.5 py-0.5 rounded-md">Raw Dump</span>
                        </div>
                        <div>
                          <strong className="text-xs font-black text-slate-900 block">Raw Field Activity Dump</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            Har Field Officer ke per-day logs, GPS travel kilometers, clinic remarks, aur doctor visits ka granular data.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-slate-700">Complete Audit</div>
                      </div>
                    </div>

                    {/* Server RAM Guard Bento */}
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-emerald-950">
                      <div className="flex items-center gap-2.5">
                        <span className="text-base p-1.5 bg-emerald-100 rounded-xl">🛡️</span>
                        <div>
                          <strong className="text-xs font-bold block">Concurrency Semaphore &amp; Server RAM Guard:</strong>
                          <span className="text-[11px] text-emerald-900 leading-normal">
                            Heavy Excel exports backend me <code className="bg-white/80 px-1 rounded font-mono font-bold text-[10px]">asyncio.Semaphore(1)</code>, 1000ms Sequential Queue cooldown, aur explicit garbage collection se chalte hain, taaki 512MB Render server par 0% RAM spike ho.
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold bg-white text-emerald-800 border border-emerald-300 px-2.5 py-1 rounded-xl shrink-0">RAM Guard Active</span>
                    </div>
                  </div>
                )}

                {/* TOPIC 8: Roles & Audit Trail */}
                {appGuideActiveTopic === 'audit_trail' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">📜</span>
                        <div>
                          <h4 className="text-sm font-black text-slate-900">Multi-Admin Roles, District Boundaries &amp; Audit Logs</h4>
                          <p className="text-[11px] text-slate-500 font-medium">Role-based access control (RBAC), canonical district isolation, and tamper-evident logging</p>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold uppercase bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full border border-indigo-200">
                        RBAC Isolation
                      </span>
                    </div>

                    {/* Dual-Column Bento Comparison Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-purple-50/70 border border-purple-200 rounded-2xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <strong className="text-xs font-black text-purple-950 flex items-center gap-1.5">
                            <span>👑</span>
                            <span>Super Admin (Statewide Scope)</span>
                          </strong>
                          <span className="text-[9px] font-bold text-purple-900 bg-purple-200 px-2 py-0.5 rounded-full">Full Scope</span>
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-purple-950 text-[11px] pl-1 leading-relaxed">
                          <li>Pure Bihar ke sabhi 22+ districts ka complete access.</li>
                          <li>Official Nikshay State Excel Dumps upload karna.</li>
                          <li>Sub-Admin accounts create aur manage karna.</li>
                          <li>Statewide monthly targets aur declared holidays configure karna.</li>
                        </ul>
                      </div>

                      <div className="bg-sky-50/70 border border-sky-200 rounded-2xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <strong className="text-xs font-black text-sky-950 flex items-center gap-1.5">
                            <span>🛡️</span>
                            <span>District Sub-Admin (Isolated Scope)</span>
                          </strong>
                          <span className="text-[9px] font-bold text-sky-900 bg-sky-200 px-2 py-0.5 rounded-full">Guarded Scope</span>
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-sky-950 text-[11px] pl-1 leading-relaxed">
                          <li>Sirf unke assigned canonical districts ka data dikhta hai.</li>
                          <li>Apne district ke FOs ki reports review aur PIN reset.</li>
                          <li>Apne district ka Duplicate Radar 1-Click Auto-Repair.</li>
                          <li>Doosre districts ka data access ya modify karna strictly <strong>403 Forbidden</strong>.</li>
                        </ul>
                      </div>
                    </div>

                    {/* 3-Stage Security Architecture Bento Sequence */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2.5">
                      <strong className="text-xs font-black text-slate-900 block">Security Architecture &amp; Tamper-Evident Audit Trail:</strong>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px]">
                        <div className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-1">
                          <strong className="text-slate-900 font-bold block">1. Cross-District Isolation</strong>
                          <p className="text-slate-600">Backend har write endpoint par canonical district boundaries validate karta hai.</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-1">
                          <strong className="text-slate-900 font-bold block">2. Disk Snapshot Shield</strong>
                          <p className="text-slate-600">Sub-Admin single-district queries kabhi statewide disk backup caches ko overwrite nahi karti.</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-1">
                          <strong className="text-slate-900 font-bold block">3. Tamper-Evident Audit Ledger</strong>
                          <p className="text-slate-600">Har target change, report edit, PIN reset ya duplicate repair actor username, IP, aur IST timestamp ke saath permanently darj hota hai.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TOPIC 9: FAQs & Solutions */}
                {appGuideActiveTopic === 'faqs' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">❓</span>
                        <div>
                          <h4 className="text-sm font-black text-slate-900">Frequently Asked Questions (Admin FAQs)</h4>
                          <p className="text-[11px] text-slate-500 font-medium">Quick answers to frequent administrative, operational, and technical questions</p>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                        Quick Troubleshooting
                      </span>
                    </div>

                    {/* 6-Card Responsive Bento FAQ Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1.5">
                        <strong className="text-slate-900 font-black block text-xs">Q1: Duplicate 1-Click Fix chalane ke baad agar FO bole ki patient ki visit genuine thi?</strong>
                        <p className="text-slate-600 text-[11px] leading-relaxed">
                          Chinta ki baat nahi hai! 1-Click Fix sirf duplicate &ldquo;TB Notification count&rdquo; ko theek karta hai. Us din ki Home Visit, FDC dawai, aur Travel KM report me waise hi safe rehte hain.
                        </p>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1.5">
                        <strong className="text-slate-900 font-black block text-xs">Q2: Notification ID Nikshay portal par nahi mil rahi hai, kya karein?</strong>
                        <p className="text-slate-600 text-[11px] leading-relaxed">
                          Pehle check karein ki reporting kitne din pehle hui hai. Agar 3 din (&le;72h) se kam huye hain, toh Government server sync hone ka wait karein. Agar 3 din se purana hai, tabhi Nikshay search bar me manually cross-check karein.
                        </p>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1.5">
                        <strong className="text-slate-900 font-black block text-xs">Q3: FO ka Duty PIN reset kaise karein?</strong>
                        <p className="text-slate-600 text-[11px] leading-relaxed">
                          <strong>Staff Directory</strong> tab me jayein, us officer ke naam ke aage bane `Reset PIN` button par click karein aur naya 4-digit PIN enter karke save karein. FO naye PIN se turant login kar sakta hai.
                        </p>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1.5">
                        <strong className="text-slate-900 font-black block text-xs">Q4: Subah 8:30 AM par submit hui report kal ke attendance me kyu dikh rahi hai?</strong>
                        <p className="text-slate-600 text-[11px] leading-relaxed">
                          Stealth 10:00 AM Cutoff ke tehat, subah 10:00 AM se pehle submit huye reports kal (yesterday) ke duty me count hote hain aur unpar &lsquo;⏰ Next day morning&rsquo; badge lagta hai. Isse attendance accurate rehti hai.
                        </p>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1.5">
                        <strong className="text-slate-900 font-black block text-xs">Q5: Render server par extra load toh nahi padega?</strong>
                        <p className="text-slate-600 text-[11px] leading-relaxed">
                          Nahi, yeh Guide, Bento Flowcharts aur Notification Tray 100% Client-Side React me operate karte hain. Iska Render ke 512MB RAM aur CPU par 0.00% load padta hai.
                        </p>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1.5">
                        <strong className="text-slate-900 font-black block text-xs">Q6: Hatae gaye staff defaulters list me kyu nahi aate?</strong>
                        <p className="text-slate-600 text-[11px] leading-relaxed">
                          Consonant-collapsed normalization aur direct staffList status lookup se inactive staff deactivation date ke baad expected attendance roster se automatically exclude ho jate hain.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* TOPIC 11: Top Performers & Analytics Studio */}
                {appGuideActiveTopic === 'top_performers_studio' && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                      <span className="text-xl">🏆</span>
                      <div>
                        <h4 className="text-sm font-black text-slate-900">Top Performers &amp; Analytics Studio (v2.8.4)</h4>
                        <p className="text-[11px] text-slate-500 font-medium">4-Role Clinical Leaderboard, Dynamic Designation Shift &amp; Full-Width Progression Trends</p>
                      </div>
                    </div>

                    {/* Header Banner */}
                    <div className="bg-gradient-to-r from-indigo-50 to-teal-50 border border-indigo-200/80 rounded-2xl p-3.5 space-y-1.5 shadow-2xs">
                      <strong className="text-indigo-950 font-black flex items-center gap-1.5 text-xs">
                        <span>🌟</span>
                        <span>Statewide Recognition &amp; Analytics Restructure:</span>
                      </strong>
                      <p className="text-indigo-900 text-[11px] leading-relaxed">
                        Version 2.8.4 introduces a complete redesign of Bihar Statewide Top Performers into a full-width studio at the top of the analytics section, followed by a full-width Daily Progression Trend chart below. Frontline officers across 4 clinical disciplines are recognized for exceptional performance with automated 4-quadrant poster generation.
                      </p>
                    </div>

                    {/* 4-Card Sequential Bento Flowchart Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Step 1: 5 Clinical Cadre Segregation */}
                      <div className="bg-gradient-to-br from-indigo-50/70 to-slate-50 border border-indigo-200/90 rounded-2xl p-4 flex flex-col justify-between space-y-2.5 shadow-2xs">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-black text-[10px] flex items-center justify-center">1</span>
                            <span className="text-[9px] font-bold text-indigo-800 bg-indigo-100 px-2 py-0.5 rounded-full">Step 01 &bull; 5 Cadres</span>
                          </div>
                          <h5 className="text-xs font-black text-slate-900 leading-snug">
                            5 Clinical Cadres &amp; Selection Criteria
                          </h5>
                          <p className="text-[11px] text-slate-600 leading-relaxed mt-1">
                            Statewide leaderboard automatically segments reports into 5 specialized performance pools based on designation and objective clinical impact:
                          </p>
                          <ul className="text-[10.5px] text-slate-700 space-y-1.5 mt-2 pl-0.5">
                            <li className="flex items-start gap-1.5">
                              <span>🏛️</span>
                              <div><strong>Top Districts (DC):</strong> Ranks districts by target achievement % (<code className="font-mono text-[9.5px]">(notifs / target) * 100</code>). Tie-breaker: Total notifications.</div>
                            </li>
                            <li className="flex items-start gap-1.5">
                              <span>📋</span>
                              <div><strong>Top FO & Hub Agents:</strong> Total TB Notifications. Tie-breaker: Target % achieved. Hub Agents tagged with amber <code className="bg-amber-100 text-amber-900 px-1 py-0.2 rounded font-bold text-[9px]">HUB AGENT</code> badge.</div>
                            </li>
                            <li className="flex items-start gap-1.5">
                              <span>🏠</span>
                              <div><strong>Top Treatment Coordinators (TC):</strong> Total verified Home Visits (<code className="font-mono text-[9.5px]">home_visits</code>) conducted for patient care. Tie-breaker: Baaki clinical indicators (HIV/DM screening, DBT, Sputum Sample Collection aur Diagnostic Tests) ka composite score (tertiary: Notifications).</div>
                            </li>
                            <li className="flex items-start gap-1.5">
                              <span>🔬</span>
                              <div><strong>Top Lab Technicians (LT):</strong> Diagnostic tests performed (<code className="font-mono text-[9.5px]">tests</code>) across microscopy and molecular assays. Tie-breaker: Notifications.</div>
                            </li>
                            <li className="flex items-start gap-1.5">
                              <span>🧪</span>
                              <div><strong>Top SCT Agents:</strong> Sputum sample collections (<code className="font-mono text-[9.5px]">samples_collected</code>) safely transported. Tie-breaker: Notifications.</div>
                            </li>
                          </ul>
                        </div>
                        <div className="pt-2 border-t border-indigo-100 flex items-center justify-between text-[10px] text-indigo-800 font-semibold">
                          <span>Role-Based Metrics</span>
                          <span className="text-indigo-600 font-black">➔ Step 2</span>
                        </div>
                      </div>

                      {/* Step 2: Dynamic Designation Shift */}
                      <div className="bg-gradient-to-br from-teal-50/70 to-slate-50 border border-teal-200/90 rounded-2xl p-4 flex flex-col justify-between space-y-2.5 shadow-2xs">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="w-5 h-5 rounded-full bg-teal-600 text-white font-black text-[10px] flex items-center justify-center">2</span>
                            <span className="text-[9px] font-bold text-teal-800 bg-teal-100 px-2 py-0.5 rounded-full">Step 02 &bull; Dynamic Shift</span>
                          </div>
                          <h5 className="text-xs font-black text-slate-900 leading-snug">
                            Dynamic Designation Shift &amp; Instant Cache Eviction
                          </h5>
                          <p className="text-[11px] text-slate-600 leading-relaxed mt-1">
                            Staff designations are managed in real time with instant multi-tier cache invalidation:
                          </p>
                          <ul className="text-[10.5px] text-slate-700 space-y-1.5 mt-2 pl-0.5">
                            <li className="flex items-start gap-1.5">
                              <span>👥</span>
                              <div><strong>Staff Management Update:</strong> Updating an officer&apos;s designation (e.g. from FO to Hub Agent or Lab Technician) in Staff Directory immediately applies across all monthly historical records.</div>
                            </li>
                            <li className="flex items-start gap-1.5">
                              <span>⚡</span>
                              <div><strong>Automatic Pool Reclassification:</strong> The staff member&apos;s metrics dynamically move into their new designation pool without requiring database migrations.</div>
                            </li>
                            <li className="flex items-start gap-1.5">
                              <span>🧹</span>
                              <div><strong>Instant Cache Eviction:</strong> LocalStorage and dashboard memoized caches are purged instantly, reflecting the change without page refresh.</div>
                            </li>
                          </ul>
                        </div>
                        <div className="pt-2 border-t border-teal-100 flex items-center justify-between text-[10px] text-teal-800 font-semibold">
                          <span>Zero DB Lag</span>
                          <span className="text-teal-600 font-black">➔ Step 3</span>
                        </div>
                      </div>

                      {/* Step 3: HD WhatsApp Poster Studio (1200x1960) */}
                      <div className="bg-gradient-to-br from-amber-50/70 to-slate-50 border border-amber-200/90 rounded-2xl p-4 flex flex-col justify-between space-y-2.5 shadow-2xs">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="w-5 h-5 rounded-full bg-amber-600 text-white font-black text-[10px] flex items-center justify-center">3</span>
                            <span className="text-[9px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">Step 03 &bull; Poster Studio</span>
                          </div>
                          <h5 className="text-xs font-black text-slate-900 leading-snug">
                            HD WhatsApp Poster Studio (1200x1960) &amp; Random Commendations
                          </h5>
                          <p className="text-[11px] text-slate-600 leading-relaxed mt-1">
                            High-impact statewide recognition poster generated completely on the client side:
                          </p>
                          <ul className="text-[10.5px] text-slate-700 space-y-1.5 mt-2 pl-0.5">
                            <li className="flex items-start gap-1.5">
                              <span>🎨</span>
                              <div><strong>6-Panel Layout &amp; Random Commendation:</strong> Generates high-resolution canvas poster (1200x1960) featuring official Doctors For You (DFY logo), 6 performance panels, and a rotating randomized congratulatory leadership tribute.</div>
                            </li>
                            <li className="flex items-start gap-1.5">
                              <span>⬇️</span>
                              <div><strong>1-Click PNG Download:</strong> Downloads crisp high-resolution PNG (<code className="font-mono text-[10px]">DFY_Top_Performers_[MONTH].png</code>) ready for statewide circulars.</div>
                            </li>
                            <li className="flex items-start gap-1.5">
                              <span>📲</span>
                              <div><strong>1-Click WhatsApp Broadcast:</strong> Pre-formats structured text broadcast with medals, cadre rankings, and celebration message for official WhatsApp groups.</div>
                            </li>
                          </ul>
                        </div>
                        <div className="pt-2 border-t border-amber-100 flex items-center justify-between text-[10px] text-amber-800 font-semibold">
                          <span>1200x1960 Canvas</span>
                          <span className="text-amber-600 font-black">➔ Step 4</span>
                        </div>
                      </div>

                      {/* Step 4: Full-Width 30-Day Daily Progression Trend */}
                      <div className="bg-gradient-to-br from-purple-50/70 to-slate-50 border border-purple-200/90 rounded-2xl p-4 flex flex-col justify-between space-y-2.5 shadow-2xs">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-black text-[10px] flex items-center justify-center">4</span>
                            <span className="text-[9px] font-bold text-purple-800 bg-purple-100 px-2 py-0.5 rounded-full">Step 04 &bull; Full-Width Layout</span>
                          </div>
                          <h5 className="text-xs font-black text-slate-900 leading-snug">
                            Full-Width 30-Day Daily Progression Trend
                          </h5>
                          <p className="text-[11px] text-slate-600 leading-relaxed mt-1">
                            Clean visual hierarchy with dedicated full-width progression tracking:
                          </p>
                          <ul className="text-[10.5px] text-slate-700 space-y-1.5 mt-2 pl-0.5">
                            <li className="flex items-start gap-1.5">
                              <span>📊</span>
                              <div><strong>Uncramped Visual Canvas:</strong> Replaced side-by-side cramped layout with a spacious full-width container directly below Top Performers Studio.</div>
                            </li>
                            <li className="flex items-start gap-1.5">
                              <span>📈</span>
                              <div><strong>Daily Progression Trend:</strong> Day-by-day non-colliding area chart visualizing cumulative notifications vs daily pace target line.</div>
                            </li>
                            <li className="flex items-start gap-1.5">
                              <span>🔍</span>
                              <div><strong>Executive Readability:</strong> High-density data points with interactive tooltips, Sunday buffers, and month-end trajectory projection.</div>
                            </li>
                          </ul>
                        </div>
                        <div className="pt-2 border-t border-purple-100 flex items-center justify-between text-[10px] text-purple-800 font-semibold">
                          <span>Executive Analytics</span>
                          <span className="text-purple-700 font-black">✓ Restructure Complete</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TOPIC 10: Travel Allowance & Bike Log Engine */}
                {appGuideActiveTopic === 'travel_allowance' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🏍️</span>
                        <div>
                          <h4 className="text-sm font-black text-slate-900">Travel Allowance (Bike Log) &amp; Relational Audit Engine</h4>
                          <p className="text-[11px] text-slate-500 font-medium">PostgreSQL-backed monthly travel claims, dynamic rates, per-staff review &amp; multi-sheet Excel</p>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold uppercase bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full border border-indigo-200">
                        PostgreSQL ACID &bull; ₹4.00/KM &bull; 24h Window
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Step 1: Pre-fill & Permission Gate */}
                      <div className="bg-gradient-to-br from-indigo-50/70 to-slate-50 border border-indigo-200/90 rounded-2xl p-4 flex flex-col justify-between space-y-2.5 shadow-2xs">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-black text-[10px] flex items-center justify-center">1</span>
                            <span className="text-[9px] font-bold text-indigo-800 bg-indigo-100 px-2 py-0.5 rounded-full">Step 01 &bull; Ingestion</span>
                          </div>
                          <h5 className="text-xs font-black text-slate-900 leading-snug">
                            Auto Pre-fill &amp; Security Gate
                          </h5>
                          <p className="text-[11px] text-slate-600 leading-relaxed mt-1">
                            Daily field report ke odometer data ko monthly travel log me safely populate karne ka rule:
                          </p>
                          <ul className="text-[10.5px] text-slate-700 space-y-1.5 mt-2 pl-0.5">
                            <li className="flex items-start gap-1.5">
                              <span>🛡️</span>
                              <div><strong>Permission Gate:</strong> Super Admin se permission pane wale Sub-Admins hi contextual menu (&bull;&bull;&bull;) se Pre-fill trigger kar sakte hain.</div>
                            </li>
                            <li className="flex items-start gap-1.5">
                              <span>📸</span>
                              <div><strong>Odometer Readings:</strong> Morning KM, Evening KM aur Meter Photo URLs automatically link ho jate hain.</div>
                            </li>
                            <li className="flex items-start gap-1.5">
                              <span>✍️</span>
                              <div><strong>Manual Override:</strong> District Coordinator kisi bhi din ka KM, opening/closing reading aur remarks manually edit kar sakte hain.</div>
                            </li>
                          </ul>
                        </div>
                        <div className="pt-2 border-t border-indigo-100 flex items-center justify-between text-[10px] text-indigo-800 font-semibold">
                          <span>Data Ingestion</span>
                          <span className="text-indigo-600 font-black">➔ Step 2</span>
                        </div>
                      </div>

                      {/* Step 2: Dynamic Rate Management */}
                      <div className="bg-gradient-to-br from-emerald-50/70 to-slate-50 border border-emerald-200/90 rounded-2xl p-4 flex flex-col justify-between space-y-2.5 shadow-2xs">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-black text-[10px] flex items-center justify-center">2</span>
                            <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">Step 02 &bull; Configuration</span>
                          </div>
                          <h5 className="text-xs font-black text-slate-900 leading-snug">
                            Dynamic Rate Control (₹4.00/KM)
                          </h5>
                          <p className="text-[11px] text-slate-600 leading-relaxed mt-1">
                            Fixed code ke bajaye dynamic reimbursement rate configuration:
                          </p>
                          <ul className="text-[10.5px] text-slate-700 space-y-1.5 mt-2 pl-0.5">
                            <li className="flex items-start gap-1.5">
                              <span>👑</span>
                              <div><strong>Authorized Roles:</strong> Super Admin aur Main Incharge Travel Allowance Modal se reimbursement rate (₹/KM) live update kar sakte hain.</div>
                            </li>
                            <li className="flex items-start gap-1.5">
                              <span>🔄</span>
                              <div><strong>Immediate Effect:</strong> Rate update hone par system server cache turant flush karta hai aur agle roster calculations par naya rate apply hota hai.</div>
                            </li>
                            <li className="flex items-start gap-1.5">
                              <span>📜</span>
                              <div><strong>Rate History:</strong> Changes PostgreSQL database me timestamp aur updated_by metadata ke saath record hote hain.</div>
                            </li>
                          </ul>
                        </div>
                        <div className="pt-2 border-t border-emerald-100 flex items-center justify-between text-[10px] text-emerald-800 font-semibold">
                          <span>Rate Governance</span>
                          <span className="text-emerald-600 font-black">➔ Step 3</span>
                        </div>
                      </div>

                      {/* Step 3: Granular Approval & Security Lock */}
                      <div className="bg-gradient-to-br from-amber-50/70 to-slate-50 border border-amber-200/90 rounded-2xl p-4 flex flex-col justify-between space-y-2.5 shadow-2xs">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="w-5 h-5 rounded-full bg-amber-600 text-white font-black text-[10px] flex items-center justify-center">3</span>
                            <span className="text-[9px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">Step 03 &bull; Review &amp; Lock</span>
                          </div>
                          <h5 className="text-xs font-black text-slate-900 leading-snug">
                            Granular Per-Staff Lifecycle &amp; Security Lock
                          </h5>
                          <p className="text-[11px] text-slate-600 leading-relaxed mt-1">
                            Kisi ek officer ki wajah se pure district ka roster nahi rukta:
                          </p>
                          <ul className="text-[10.5px] text-slate-700 space-y-1.5 mt-2 pl-0.5">
                            <li className="flex items-start gap-1.5">
                              <span>✅</span>
                              <div><strong>Pass Individual Staff:</strong> Main Incharge verified staff ko "Pass" karte hain, jisse wo record turant locked state me chala jata hai.</div>
                            </li>
                            <li className="flex items-start gap-1.5">
                              <span>↩️</span>
                              <div><strong>Revert for Correction:</strong> Discrepancy hone par specific staff ko Sub-Admin ke pass reason ke saath Revert kiya jata hai.</div>
                            </li>
                            <li className="flex items-start gap-1.5">
                              <span>🔒</span>
                              <div><strong>Tamper-Proof Lock:</strong> Approved record par Sub-Admin koi edit nahi kar sakte jab tak Incharge ya Super Admin se Unlock na karwaya jaye.</div>
                            </li>
                          </ul>
                        </div>
                        <div className="pt-2 border-t border-amber-100 flex items-center justify-between text-[10px] text-amber-800 font-semibold">
                          <span>Review &amp; Lock</span>
                          <span className="text-amber-600 font-black">➔ Step 4</span>
                        </div>
                      </div>

                      {/* Step 4: 24h Dispute Window & Multi-Sheet Excel */}
                      <div className="bg-gradient-to-br from-purple-50/70 to-slate-50 border border-purple-200/90 rounded-2xl p-4 flex flex-col justify-between space-y-2.5 shadow-2xs">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-black text-[10px] flex items-center justify-center">4</span>
                            <span className="text-[9px] font-bold text-purple-800 bg-purple-100 px-2 py-0.5 rounded-full">Step 04 &bull; Dispute &amp; Export</span>
                          </div>
                          <h5 className="text-xs font-black text-slate-900 leading-snug">
                            24h Dispute Window &amp; Multi-Sheet Excel Export
                          </h5>
                          <p className="text-[11px] text-slate-600 leading-relaxed mt-1">
                            Frontline transparency aur executive reporting standards:
                          </p>
                          <ul className="text-[10.5px] text-slate-700 space-y-1.5 mt-2 pl-0.5">
                            <li className="flex items-start gap-1.5">
                              <span>⏱️</span>
                              <div><strong>24h Active Dispute:</strong> Staff approval ke baad FO profile par 24 ghante ka timer start hota hai; staff reason dekar instant dispute raise kar sakte hain.</div>
                            </li>
                            <li className="flex items-start gap-1.5">
                              <span>🙈</span>
                              <div><strong>Privacy Guard:</strong> Draft ya Reverted state me FO ko calculation amounts nahi dikhte (&ldquo;Verification in Progress&rdquo; privacy shield).</div>
                            </li>
                            <li className="flex items-start gap-1.5">
                              <span>📊</span>
                              <div><strong>Multi-Sheet Excel Studio:</strong> 1-click download me Sheet 1 Executive District Summary (=SUM() formulas) aur Sheets 2..N staff daily logs generate hoti hain.</div>
                            </li>
                          </ul>
                        </div>
                        <div className="pt-2 border-t border-purple-100 flex items-center justify-between text-[10px] text-purple-800 font-semibold">
                          <span>Transparency &amp; Export</span>
                          <span className="text-purple-700 font-black">✓ Production Active</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 shrink-0">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>DFY Bihar MIS Operations Standard &bull; Version 2.9.0</span>
              </span>
              <button
                type="button"
                onClick={() => onClose()}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-1.5 rounded-xl transition-all cursor-pointer"
              >
                Close Guide
              </button>
            </div>

          </div>
        </div>
  );
}
