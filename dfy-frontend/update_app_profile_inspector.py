# -*- coding: utf-8 -*-
with open("dfy-frontend/src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

# 1. Add selectedDate and copy state in MyProfileDashboard
old_profile_head = "  const [stats, setStats] = useState(null);"
new_profile_head = """  const [stats, setStats] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [copiedKey, setCopiedKey] = useState(null);"""

if old_profile_head in text:
    text = text.replace(old_profile_head, new_profile_head)
    print("selectedDate state added in MyProfileDashboard")

# 2. Add Notification Pending vs Achieved banner in MyProfileDashboard
old_boxes_end = """           <div>
             <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Notification Achieved</p>
             <p className="text-xl font-black text-indigo-600">{notifAchieved}</p>
           </div>
        </div>"""

new_boxes_end = """           <div>
             <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Notification Achieved</p>
             <p className="text-xl font-black text-indigo-600">{notifAchieved}</p>
           </div>
        </div>

        {/* Target Status Indicator */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          {notifAchieved >= targetVal && targetVal > 0 ? (
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 flex items-center justify-center gap-2 text-emerald-700 text-xs font-bold">
              <span>🎉</span>
              <span>Target Completed! Mubarak ho bhai!</span>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 flex items-center justify-between text-xs font-bold text-amber-800">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                Pending Target:
              </span>
              <span className="bg-white px-2.5 py-1 rounded-xl text-amber-700 shadow-sm border border-amber-200">
                {Math.max(0, targetVal - notifAchieved)} Notifications baaki hain
              </span>
            </div>
          )}
        </div>"""

if old_boxes_end in text:
    text = text.replace(old_boxes_end, new_boxes_end)
    print("Target status indicator added")

# 3. Add onClick to Calendar tiles and add Date-wise ID Inspector card
old_calendar_tile = """              <div 
                key={dayNum} 
                className={`h-9 rounded-xl flex flex-col items-center justify-center text-xs font-bold border transition-all ${bgColor} ${isToday ? 'ring-2 ring-indigo-500 ring-offset-1' : ''}`}
                title={dayData && dayData.submitted ? `${dateKey}: ${count} report(s), ${dayData.total_ids} IDs` : `${dateKey}: No report`}
              >
                <span>{dayNum}</span>
              </div>"""

new_calendar_tile = """              <div 
                key={dayNum} 
                onClick={() => setSelectedDate(dateKey)}
                className={`h-9 rounded-xl flex flex-col items-center justify-center text-xs font-bold border transition-all cursor-pointer hover:scale-105 active:scale-95 ${bgColor} ${selectedDate === dateKey ? 'ring-2 ring-indigo-600 ring-offset-2' : isToday ? 'ring-2 ring-indigo-300 ring-offset-1' : ''}`}
                title={dayData && dayData.submitted ? `${dateKey}: ${count} report(s), ${dayData.total_ids} IDs (Click to view)` : `${dateKey}: No report`}
              >
                <span>{dayNum}</span>
              </div>"""

if old_calendar_tile in text:
    text = text.replace(old_calendar_tile, new_calendar_tile)
    print("Calendar tile onClick added")

# 4. Insert Date-wise ID Inspector card after calendar
calendar_end = "      </div>\n\n      <h3 className=\"text-sm font-black text-slate-800 uppercase tracking-widest mb-4 px-2\">Work Breakdown</h3>"
selected_day_inspector = """      </div>

      {/* Date-wise Reported IDs Inspector */}
      {selectedDate && (() => {
        const selectedDayData = stats.daily_history && stats.daily_history[selectedDate];
        return (
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 mb-6 animate-fade-in">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-3">
              <div>
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span>📋</span> Reported IDs on {selectedDate}
                </h4>
                <p className="text-[10px] text-slate-400 font-semibold">
                  {selectedDayData && selectedDayData.submitted ? `${selectedDayData.total_ids} Total IDs Recorded` : 'No report submitted on this date'}
                </p>
              </div>
              {selectedDayData && selectedDayData.submitted && (
                <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-100">
                  Submitted
                </span>
              )}
            </div>

            {selectedDayData && selectedDayData.submitted ? (
              <div className="space-y-3">
                {selectedDayData.visited_names && selectedDayData.visited_names.length > 0 && (
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Visited Doctors / Stores</span>
                    <p className="font-bold text-slate-700">{selectedDayData.visited_names.join(', ')}</p>
                  </div>
                )}

                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                  {Object.entries(selectedDayData.categories || {}).map(([catKey, idList]) => {
                    if (!idList || idList.length === 0) return null;
                    const label = catKey.replace(/_/g, ' ').toUpperCase();
                    return (
                      <div key={catKey} className="bg-slate-50/90 p-3 rounded-2xl border border-slate-100">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[11px] font-black text-slate-700">{label} ({idList.length})</span>
                          <button
                            onClick={() => {
                              if (navigator.clipboard) {
                                navigator.clipboard.writeText(idList.join('\\n'));
                                setCopiedKey(catKey);
                                setTimeout(() => setCopiedKey(null), 2000);
                              }
                            }}
                            className="text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-lg transition-colors"
                          >
                            {copiedKey === catKey ? '✓ Copied' : 'Copy IDs'}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {idList.map((id, idx) => (
                            <span key={idx} className="font-mono text-xs font-bold bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-lg shadow-sm">
                              {id}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-center py-6 text-xs text-slate-400 font-medium">Is date ko koi report submit nahi ki gayi thi.</p>
            )}
          </div>
        );
      })()}

      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 px-2">Work Breakdown</h3>"""

if calendar_end in text:
    text = text.replace(calendar_end, selected_day_inspector)
    print("selected_day_inspector injected")

with open("dfy-frontend/src/App.jsx", "w", encoding="utf-8") as f:
    f.write(text)
