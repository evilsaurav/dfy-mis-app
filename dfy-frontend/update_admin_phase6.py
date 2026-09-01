with open("src/AdminDashboard.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

# 1. Add attendance state and handlers
state_marker = "  const [targetsData, setTargetsData] = useState([]);"
new_state = """  const [targetsData, setTargetsData] = useState([]);
  const [attendance, setAttendance] = useState(null);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [isAttendanceLoading, setIsAttendanceLoading] = useState(false);
  const [copiedAttendance, setCopiedAttendance] = useState(false);

  const fetchAttendance = async () => {
    setIsAttendanceLoading(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await fetch(`${API_BASE_URL}/admin/today-attendance`);
      if (res.ok) {
        const data = await res.json();
        setAttendance(data);
      }
    } catch (e) {
      console.error("Attendance fetch error", e);
    } finally {
      setIsAttendanceLoading(false);
    }
  };

  const copyMissingReminder = () => {
    if (!attendance || !attendance.missing_fos) return;
    const byDistrict = {};
    attendance.missing_fos.forEach(fo => {
      if (!byDistrict[fo.district]) byDistrict[fo.district] = [];
      byDistrict[fo.district].push(fo.fo_name);
    });

    let msg = `?? *DFY MIS Reminder - Today's Pending Daily Reports*\\n`;
    msg += `?? Date: ${attendance.date}\\n`;
    msg += `?? Missing: ${attendance.missing_count} of ${attendance.total_staff} FOs\\n\\n`;

    for (let dist in byDistrict) {
      msg += `?? *${dist}:*\\n`;
      byDistrict[dist].forEach(name => {
        msg += `  • ${name}\\n`;
      });
      msg += `\\n`;
    }
    msg += `Kripya sabhi sadasya turant apni field report submit karein! ??`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg);
      setCopiedAttendance(true);
      setTimeout(() => setCopiedAttendance(false), 3000);
    }
  };

  const copyStateSummary = () => {
    const today = new Date().toISOString().split('T')[0];
    let msg = `?? *DFY MIS - State Daily Performance Bulletin*\\n`;
    msg += `?? Date: ${today} | Month: ${month}\\n\\n`;
    msg += `?? *State Key Metrics:*\\n`;
    msg += `• Presumptive TB: ${totals.presumptive}\\n`;
    msg += `• Notifications: ${totals.notifications}\\n`;
    msg += `• Samples Tested: ${totals.tests}\\n`;
    msg += `• DBT Processed: ${totals.dbt}\\n`;
    msg += `• TPT (Start/Presumptive): ${totals.tpt_treatment_start} / ${totals.tpt_presumptive}\\n`;
    msg += `• Doctor/Store Visits: ${totals.doctor_visits}\\n`;
    msg += `• Total Reports: ${rawRecords.length}\\n\\n`;
    msg += `DFY Tuberculosis Health Mission ????`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg);
      alert("State Summary copied to clipboard! Ready to paste in WhatsApp.");
    }
  };

  const downloadAllWorkbooks = () => {
    const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
    window.open(`${API_BASE_URL}/download-all-kpi-workbooks`, "_blank");
  };"""

if state_marker in text:
    text = text.replace(state_marker, new_state)
    print("attendance state and helpers added")
else:
    print("state_marker not found")

# 2. Trigger fetchAttendance on mount/login
auth_effect_marker = "    if (isAuthenticated) fetchData();"
if auth_effect_marker in text:
    text = text.replace(auth_effect_marker, "    if (isAuthenticated) { fetchData(); fetchAttendance(); }")
    print("fetchAttendance triggered in useEffect")

# 3. Add Master ZIP button, State WhatsApp broadcast button in controls
old_buttons = """                <button onClick={() => {
                  if (selectedDistrict === 'All') {
                    alert('Please select a specific District from the dropdown to download its KPI Workbook.');
                    return;
                  }
                  const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
                  window.open(API_BASE_URL + "/download-kpi-workbook?district=" + selectedDistrict, "_blank");
                }} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                  KPI Master
                </button>"""

new_buttons = """                <button onClick={() => {
                  if (selectedDistrict === 'All') {
                    alert('Please select a specific District from the dropdown to download its KPI Workbook.');
                    return;
                  }
                  const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
                  window.open(API_BASE_URL + "/download-kpi-workbook?district=" + selectedDistrict, "_blank");
                }} className="bg-blue-600 text-white px-3.5 py-2 rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-1.5" title="Download single district workbook">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                  District KPI
                </button>
                <button onClick={downloadAllWorkbooks} className="bg-indigo-600 text-white px-3.5 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-1.5" title="Download ZIP with all 10 district workbooks">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  All 10 Districts (ZIP)
                </button>
                <button onClick={copyStateSummary} className="bg-emerald-600 text-white px-3.5 py-2 rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm flex items-center gap-1.5" title="Copy state summary for WhatsApp">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  State WhatsApp
                </button>"""

if old_buttons in text:
    text = text.replace(old_buttons, new_buttons)
    print("Action buttons updated")
else:
    print("old_buttons not found")

# 4. Add Today Attendance Card right after Controls
header_end_marker = "        {isLoading ? ("
attendance_card = """        {/* Live Attendance Banner */}
        {attendance && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-xl shrink-0">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2">
                  Today's Field Officer Attendance 
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{attendance.date}</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Total Active FOs: <strong className="text-slate-700">{attendance.total_staff}</strong> | Submitted: <strong className="text-emerald-600">{attendance.submitted_full_count + attendance.submitted_partial_count}</strong> | Pending: <strong className="text-red-500">{attendance.missing_count}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto justify-end">
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
              </div>
              <button 
                onClick={() => setShowAttendanceModal(true)}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shrink-0 active:scale-95 shadow-sm"
              >
                View Details
              </button>
            </div>
          </div>
        )}

        {isLoading ? ("""

if header_end_marker in text:
    text = text.replace(header_end_marker, attendance_card)
    print("attendance_card added")
else:
    print("header_end_marker not found")

# 5. Add Attendance Details Modal before the end of component
end_tag = "      </div>\n    </div>\n  );\n}"
attendance_modal_code = """      {/* Missing Attendance Modal */}
      {showAttendanceModal && attendance && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-2xl shadow-2xl border border-slate-100 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-lg font-black text-slate-800">Pending Field Officers ({attendance.missing_count})</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Date: {attendance.date}</p>
              </div>
              <button onClick={() => setShowAttendanceModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar my-2">
              {attendance.missing_fos && attendance.missing_fos.length > 0 ? (
                attendance.missing_fos.map((fo, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-red-200 transition-colors">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{fo.fo_name}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">{fo.district} &bull; {fo.designation}</p>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-red-600 bg-red-50 border border-red-100 px-2.5 py-1 rounded-full">
                      Not Submitted
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-emerald-600 font-bold">
                  ?? Sabhi Field Officers ne aaj ki report submit kar di hai!
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3 mt-auto">
              <button 
                onClick={copyMissingReminder}
                disabled={attendance.missing_count === 0}
                className={`flex items-center gap-2 font-bold text-xs py-3 px-5 rounded-xl transition-all ${attendance.missing_count > 0 ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 active:scale-95' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                {copiedAttendance ? '? WhatsApp Reminder Copied!' : 'Copy WhatsApp Reminder Message'}
              </button>
              <button onClick={() => setShowAttendanceModal(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 px-5 rounded-xl transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}"""

if "      </div>\n    </div>\n  );\n}" in text:
    text = text.replace("      </div>\n    </div>\n  );\n}", "      </div>\n" + attendance_modal_code)
    print("attendance_modal_code added")
else:
    print("end_tag not found")

with open("src/AdminDashboard.jsx", "w", encoding="utf-8") as f:
    f.write(text)

