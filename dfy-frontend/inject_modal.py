# -*- coding: utf-8 -*-
with open("dfy-frontend/src/AdminDashboard.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

modal_marker = "      {showTargetModal && ("

attendance_modal_code = """      {/* Missing Attendance Modal */}
      {showAttendanceModal && attendance && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-2xl shadow-2xl border border-slate-100 max-h-[85vh] flex flex-col animate-fade-in">
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
                  Sabhi Field Officers ne aaj ki report submit kar di hai!
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
                {copiedAttendance ? 'WhatsApp Reminder Copied!' : 'Copy WhatsApp Reminder Message'}
              </button>
              <button onClick={() => setShowAttendanceModal(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 px-5 rounded-xl transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {showTargetModal && ("""

if modal_marker in text:
    text = text.replace(modal_marker, attendance_modal_code)
    print("attendance_modal_code injected before showTargetModal")
else:
    print("modal_marker not found")

with open("dfy-frontend/src/AdminDashboard.jsx", "w", encoding="utf-8") as f:
    f.write(text)
