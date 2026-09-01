# -*- coding: utf-8 -*-
with open("dfy-frontend/src/AdminDashboard.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

# 1. Update Attendance Banner to remove Amber concept (Only Green and Red)
old_attendance_badge = """            <div className="flex items-center gap-3 w-full md:w-auto justify-end">
              <div className="flex items-center gap-2 text-xs font-bold">
                <span className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl border border-emerald-100 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span> {attendance.submitted_full_count} Full (2/2)
                </span>
                <span className="bg-amber-50 text-amber-700 px-3 py-1.5 rounded-xl border border-amber-100 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span> {attendance.submitted_partial_count} Partial (1/2)
                </span>
                <span className="bg-red-50 text-red-700 px-3 py-1.5 rounded-xl border border-red-100 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span> {attendance.missing_count} Missing
                </span>
              </div>"""

new_attendance_badge = """            <div className="flex items-center gap-3 w-full md:w-auto justify-end">
              <div className="flex items-center gap-2 text-xs font-bold">
                <span className="bg-emerald-50 text-emerald-700 px-3.5 py-1.5 rounded-xl border border-emerald-100 flex items-center gap-2 shadow-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> {attendance.submitted_full_count + attendance.submitted_partial_count} Submitted
                </span>
                <span className="bg-red-50 text-red-700 px-3.5 py-1.5 rounded-xl border border-red-100 flex items-center gap-2 shadow-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> {attendance.missing_count} Missing
                </span>
              </div>"""

if old_attendance_badge in text:
    text = text.replace(old_attendance_badge, new_attendance_badge)
    print("attendance banner simplified to green/red")
else:
    print("old_attendance_badge not found")

# 2. Add Target Progress Bars Card right before detailed master table
progress_section = """            {/* Live Target vs Achievement Progress Bars */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-slate-800 font-black text-base">Target vs Achievement Overview</h3>
                  <p className="text-slate-400 text-xs font-semibold">Live performance monitoring & milestone completion</p>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider">
                  <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg border border-emerald-100">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span> &gt;=100% Target Complete
                  </span>
                  <span className="flex items-center gap-1 bg-amber-50 text-amber-700 px-2.5 py-1 rounded-lg border border-amber-100">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span> 50-99% In Progress
                  </span>
                  <span className="flex items-center gap-1 bg-red-50 text-red-700 px-2.5 py-1 rounded-lg border border-red-100">
                    <span className="w-2 h-2 rounded-full bg-red-500"></span> &lt;50% Lagging
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tableData.map((row, idx) => {
                  const totalWork = (row.notifications || 0) + (row.tests || 0) + (row.presumptive || 0) + (row.doctor_visits || 0) + (row.hiv_dm || 0) + (row.dbt || 0) + (row.sample_collection || 0) + (row.outcome_assigned || 0) + (row.home_visits || 0) + (row.contact_tracing || 0) + (row.follow_ups || 0) + (row.face_to_face || 0) + (row.documents || 0) + (row.fdc_provided || 0) + (row.kit_consumption || 0) + (row.differentiated_tb || 0) + (row.tpt_treatment_start || 0) + (row.tpt_presumptive || 0) + (row.adhar_face_auth || 0) + (row.consent_with_id || 0);
                  
                  const targetObj = targetsData.find(t => t.fo_name === row.name || t.district === row.name);
                  const targetNum = targetObj ? Number(targetObj.target) : 100;
                  const pct = targetNum > 0 ? Math.min(100, Math.round((totalWork / targetNum) * 100)) : 100;

                  let statusColor = "text-red-600 bg-red-50 border-red-200";
                  let barColor = "bg-red-500";
                  let statusText = "Lagging";

                  if (pct >= 100) {
                    statusColor = "text-emerald-700 bg-emerald-50 border-emerald-200";
                    barColor = "bg-emerald-500";
                    statusText = "Completed";
                  } else if (pct >= 50) {
                    statusColor = "text-amber-700 bg-amber-50 border-amber-200";
                    barColor = "bg-amber-400";
                    statusText = "In Progress";
                  }

                  return (
                    <div key={idx} className="bg-slate-50/70 p-4 rounded-xl border border-slate-100 hover:border-slate-200 transition-all">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="text-sm font-black text-slate-800 truncate max-w-[180px]">{row.name}</h4>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{totalWork} Achieved / {targetNum} Target</p>
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusColor}`}>
                          {statusText} ({pct}%)
                        </span>
                      </div>

                      <div className="w-full bg-slate-200/80 rounded-full h-2.5 overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
"""

table_marker = "            {/* Master Data Table */}"
if table_marker in text:
    text = text.replace(table_marker, progress_section + "\n" + table_marker)
    print("Target vs Achievement Progress Bars section added")
else:
    print("table_marker not found")

# Load targets along with dashboard data
load_targets_marker = "    if (isAuthenticated) { fetchData(); fetchAttendance(); }"
if load_targets_marker in text:
    text = text.replace(load_targets_marker, "    if (isAuthenticated) { fetchData(); fetchAttendance(); loadTargets('All'); }")
    print("loadTargets('All') added to useEffect")

with open("dfy-frontend/src/AdminDashboard.jsx", "w", encoding="utf-8") as f:
    f.write(text)
