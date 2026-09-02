import { useState, useEffect } from 'react'

// --- Simple Toast System ---
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  const bgColor = type === 'error' ? 'bg-red-500' : 'bg-emerald-500';

  return (
    <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-[100] ${bgColor} text-white px-5 py-3 rounded-2xl sm:rounded-full shadow-lg flex items-center justify-between gap-3 transition-all duration-300 ease-in-out w-[90%] max-w-md`}>
      <span className="font-semibold text-sm tracking-wide">{message}</span>
      <button onClick={onClose} className="opacity-80 hover:opacity-100 font-bold text-lg leading-none shrink-0">&times;</button>
    </div>
  );
};

// --- Accordion Container ---
const Accordion = ({ title, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="mb-4 bg-white rounded-2xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] border border-slate-100 overflow-hidden transition-all hover:shadow-[0_8px_30px_-4px_rgba(6,81,237,0.15)]">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white hover:bg-slate-50/50 px-5 py-4 border-b border-slate-50 flex justify-between items-center outline-none transition-colors"
      >
        <span className="text-sm font-bold text-slate-800 tracking-wide uppercase">{title}</span>
        <svg 
          width="20" 
          height="20"
          className={`w-5 h-5 flex-shrink-0 text-slate-400 transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="p-4 sm:p-5 bg-slate-50/30">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {children}
          </div>
        </div>
      )}
    </div>
  );
};


// --- My Profile Dashboard ---
const MyProfileDashboard = ({ formData, showToast }) => {
  const [stats, setStats] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [copiedKey, setCopiedKey] = useState(null);
  const [editingModal, setEditingModal] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const today = new Date();
        const monthStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, '0');
        const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
        const res = await fetch(`${API_BASE_URL}/my-profile-stats`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
             working_place: formData.working_place, 
             fo_name: formData.fo_name, 
             pin: formData.pin, 
             month: monthStr 
          })
        });
        const data = await res.json();
        if(data.success) {
          setStats(data);
        } else {
          showToast("Error loading profile", "error");
        }
      } catch(err) {
        showToast("Network error", "error");
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [formData]);

  if(loading) return (
    <div className="flex flex-col items-center justify-center p-10 mt-10">
      <svg className="animate-spin h-10 w-10 text-indigo-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
      <p className="text-slate-500 font-bold tracking-widest text-sm uppercase">Loading Profile...</p>
    </div>
  );

  if (!stats) return (
    <div className="w-full max-w-lg mx-auto text-center p-8 bg-white rounded-3xl border border-slate-100 shadow-sm mt-6">
      <p className="text-slate-500 font-bold text-sm">Profile data load nahi ho paya.</p>
      <button onClick={() => window.location.reload()} className="mt-3 bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-100">Retry</button>
    </div>
  );


  const handleExecuteIdEdit = async (e) => {
    e.preventDefault();
    if (!editingModal) return;
    const { date, category, action, oldId, newId } = editingModal;
    
    if (action !== 'delete' && (!newId || newId.trim().length !== 9 || !/^\d+$/.test(newId.trim()))) {
      setEditingModal(prev => ({ ...prev, error: "Patient ID must be exactly 9 digits (numbers only)." }));
      return;
    }

    setEditingModal(prev => ({ ...prev, loading: true, error: "" }));

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await fetch(`${API_BASE_URL}/api/reports/edit-id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          working_place: formData.working_place,
          fo_name: formData.fo_name,
          date: date,
          category: category,
          action: action,
          old_id: oldId,
          new_id: newId ? newId.trim() : "",
          pin: formData.pin,
          edited_by: "FO"
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "ID updated successfully!", "success");
        // Update local stats in memory
        setStats(prev => {
          if (!prev || !prev.daily_history || !prev.daily_history[date]) return prev;
          const updatedHistory = { ...prev.daily_history };
          const day = { ...updatedHistory[date] };
          const cats = { ...(day.categories || {}) };
          cats[category] = data.updated_ids;
          day.categories = cats;
          day.total_ids = Object.values(cats).reduce((sum, arr) => sum + (arr ? arr.length : 0), 0);
          updatedHistory[date] = day;

          const updatedBreakdown = { ...(prev.breakdown || {}) };
          if (updatedBreakdown[category] !== undefined) {
            const countDiff = action === 'add' ? 1 : action === 'delete' ? -1 : 0;
            updatedBreakdown[category] = Math.max(0, updatedBreakdown[category] + countDiff);
          }

          return {
            ...prev,
            daily_history: updatedHistory,
            breakdown: updatedBreakdown
          };
        });
        setEditingModal(null);
      } else {
        setEditingModal(prev => ({ ...prev, error: data.detail || "Failed to update ID.", loading: false }));
      }
    } catch (err) {
      setEditingModal(prev => ({ ...prev, error: "Network error. Please try again.", loading: false }));
    }
  };

  const targetVal = Number(stats.target) || 0;
  const breakdown = stats.breakdown || {};
  const notifAchieved = Number(breakdown.notification) || 0;
  const percent = targetVal > 0 ? Math.min(100, Math.round((notifAchieved / targetVal) * 100)) : 0;
  
  return (
    <div className="w-full max-w-lg mx-auto animate-fade-in pb-10">
      <div className="bg-white rounded-3xl p-6 shadow-xl shadow-indigo-100/50 border border-slate-100 mb-6 text-center">
        <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-3 font-black">
          {(formData.fo_name || 'U').charAt(0)}
        </div>
        <h2 className="text-2xl font-black text-slate-800">{formData.fo_name}</h2>
        <p className="text-slate-500 font-bold text-sm tracking-wider uppercase">{formData.working_place}</p>
        
        {/* Streak Counter & Milestone Badges */}
        <div className="mt-3 flex items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1 rounded-full text-xs font-black shadow-sm">
            <span>🔥</span>
            <span>{stats.streak_days || 0} Day Streak</span>
          </span>
          {stats.total_km > 0 && (
            <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-1 rounded-full text-xs font-black shadow-sm">
              <span>🛵</span>
              <span>{stats.total_km} KM Travelled</span>
            </span>
          )}
        </div>

        {stats.badges && stats.badges.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {stats.badges.map(b => (
              <div key={b.id} className="bg-slate-50 hover:bg-indigo-50/50 border border-slate-200/80 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm transition-all" title={b.desc}>
                <span className="text-sm">{b.icon}</span>
                <span className="text-[11px] font-black text-slate-700">{b.title}</span>
              </div>
            ))}
          </div>
        )}
        
        <div className="mt-8 flex justify-center items-center">
          <div className="relative w-40 h-40">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path className="text-slate-100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
              <path className="text-indigo-500 transition-all duration-1000 ease-out" strokeDasharray={`${percent}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-black text-slate-800">{percent}%</span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Target</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-8 pt-6 border-t border-slate-100">
           <div>
             <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Notification Target</p>
             <p className="text-xl font-black text-slate-700">{targetVal}</p>
           </div>
           <div>
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
        </div>
      </div>

      {/* 30-Day Activity Calendar */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 mb-6">
        <div className="flex items-center justify-between mb-4 px-1">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
            Monthly Activity Calendar
          </h3>
          <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Report Submitted</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-200"></span> No Report</span>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center">
          {['M','T','W','T','F','S','S'].map((d, i) => (
            <span key={i} className="text-[10px] font-black text-slate-400 py-1">{d}</span>
          ))}
          {Array.from({ length: 31 }, (_, i) => {
            const dayNum = i + 1;
            const dateKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            const dayData = stats.daily_history && stats.daily_history[dateKey];
            const count = dayData ? dayData.count : 0;
            const isToday = new Date().getDate() === dayNum;

            let bgColor = "bg-slate-50 text-slate-400 border-slate-100";
            if (count > 0) {
              bgColor = "bg-emerald-500 text-white font-black shadow-sm shadow-emerald-500/30 border-emerald-600";
            }

            return (
              <div 
                key={dayNum} 
                onClick={() => setSelectedDate(dateKey)}
                className={`h-9 rounded-xl flex flex-col items-center justify-center text-xs font-bold border transition-all cursor-pointer hover:scale-105 active:scale-95 ${bgColor} ${selectedDate === dateKey ? 'ring-2 ring-indigo-600 ring-offset-2' : isToday ? 'ring-2 ring-indigo-300 ring-offset-1' : ''}`}
                title={dayData && dayData.submitted ? `${dateKey}: ${count} report(s), ${dayData.total_ids} IDs (Click to view)` : `${dateKey}: No report`}
              >
                <span>{dayNum}</span>
              </div>
            );
          })}
        </div>
      </div>

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
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingModal({ date: selectedDate, category: catKey, action: 'add', oldId: '', newId: '', error: '' })}
                              className="text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-lg transition-colors flex items-center gap-0.5"
                              title="Add missing ID"
                            >
                              <span>+</span> Add ID
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (navigator.clipboard) {
                                  navigator.clipboard.writeText(idList.join('\n'));
                                  setCopiedKey(catKey);
                                  setTimeout(() => setCopiedKey(null), 2000);
                                }
                              }}
                              className="text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-lg transition-colors"
                            >
                              {copiedKey === catKey ? '✓ Copied' : 'Copy'}
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {idList.map((id, idx) => (
                            <div key={idx} className="inline-flex items-center gap-1 font-mono text-xs font-bold bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-lg shadow-sm group">
                              <span>{id}</span>
                              <button
                                type="button"
                                onClick={() => setEditingModal({ date: selectedDate, category: catKey, action: 'replace', oldId: id, newId: id, error: '' })}
                                className="text-slate-400 hover:text-indigo-600 text-[10px] p-0.5"
                                title="Edit / Correct this ID"
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingModal({ date: selectedDate, category: catKey, action: 'delete', oldId: id, newId: '', error: '' })}
                                className="text-slate-400 hover:text-red-500 text-[10px] p-0.5"
                                title="Delete this ID"
                              >
                                🗑️
                              </button>
                            </div>
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

      {/* FO Patient ID Edit / Correction Modal */}
      {editingModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-100 animate-fade-in">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-3">
              <div>
                <h4 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                  {editingModal.action === 'replace' ? '✏️ Correct Patient ID' : editingModal.action === 'delete' ? '🗑️ Remove Patient ID' : '➕ Add Missing Patient ID'}
                </h4>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  {editingModal.category.replace(/_/g, ' ').toUpperCase()} &bull; {editingModal.date}
                </p>
              </div>
              <button onClick={() => setEditingModal(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none">&times;</button>
            </div>

            <form onSubmit={handleExecuteIdEdit} className="space-y-3">
              {editingModal.action === 'delete' ? (
                <div className="p-3 bg-red-50 rounded-2xl border border-red-100 text-center">
                  <p className="text-xs font-bold text-red-800 mb-1">Kya aap sach me ID <strong className="font-mono text-sm">{editingModal.oldId}</strong> ko delete karna chahte hain?</p>
                  <p className="text-[10px] text-red-500">Yeh ID database aur aapke report count se hat jayegi.</p>
                </div>
              ) : (
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    {editingModal.action === 'replace' ? `Replace ID #${editingModal.oldId} With:` : 'Enter 9-Digit Patient ID:'}
                  </label>
                  <input
                    type="text"
                    maxLength={9}
                    value={editingModal.newId}
                    onChange={(e) => setEditingModal(prev => ({ ...prev, newId: e.target.value.replace(/\D/g, '') }))}
                    placeholder="e.g. 332882518"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 font-mono text-sm font-black text-slate-800 tracking-wider outline-none focus:ring-2 focus:ring-indigo-500"
                    autoFocus
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Must be exactly 9 digits.</p>
                </div>
              )}

              {editingModal.error && (
                <p className="text-red-500 text-xs font-bold bg-red-50 p-2 rounded-xl border border-red-100">{editingModal.error}</p>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setEditingModal(null)} className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
                <button
                  type="submit"
                  disabled={editingModal.loading}
                  className={`px-4 py-2 rounded-xl text-xs font-black text-white shadow-md active:scale-95 transition-all ${editingModal.action === 'delete' ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20'}`}
                >
                  {editingModal.loading ? 'Saving...' : editingModal.action === 'delete' ? 'Confirm Delete' : 'Save ID'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 px-2">Work Breakdown</h3>
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(breakdown).map(([k, v]) => {
           if (v === 0) return null;
           const label = k.replace(/_/g, " ");
           return (
             <div key={k} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
               <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate mr-2">{label}</span>
               <span className="text-lg font-black text-slate-800">{v}</span>
             </div>
           )
        })}
      </div>
    </div>
  );
};

// --- Id Bucket ---// --- Id Bucket ---
const IdBucket = ({ title, ids, onAdd, onAddMultiple, onRemove, showToast, suggestedIds = [], onAddBulk }) => {
  const [currentId, setCurrentId] = useState("");
  const safeIds = Array.isArray(ids) ? ids : [];

  const handleAdd = () => {
    const raw = currentId.trim();
    if (!raw) return;

    // Check if user pasted multiple IDs (separated by comma, space, newline)
    const matches = raw.match(/\b\d{9}\b/g);
    if (matches && matches.length > 1) {
      if (onAddMultiple) {
        onAddMultiple(matches);
        setCurrentId("");
        return;
      }
    }

    if (raw.length === 9 && !isNaN(raw)) {
      onAdd(raw);
      setCurrentId("");
    } else {
      showToast("ID exactly 9 digit ki honi chahiye bhai!", "error");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5 shadow-sm hover:border-slate-200 transition-colors group">
      <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-3 flex items-center justify-between group-hover:text-indigo-600 transition-colors">
        <span className="flex items-center gap-1.5">
          {title}
          {currentId.length === 9 && !isNaN(currentId) && (
            <span className="text-emerald-500 text-[10px] font-bold">✓ Ready</span>
          )}
        </span>
        <span className="bg-indigo-50 text-indigo-600 px-2.5 py-0.5 rounded-full text-[10px] ml-1 font-bold">{safeIds.length}</span>
      </label>

      {/* Smart Notification ID Suggestion Chips */}
      {suggestedIds && suggestedIds.length > 0 && (
        <div className="mb-3 bg-indigo-50/70 p-2.5 rounded-xl border border-indigo-100/90 animate-fade-in">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-800 flex items-center gap-1">
              <span>💡</span> Notification IDs ({suggestedIds.length}):
            </span>
            {suggestedIds.some(sid => !safeIds.includes(sid)) && onAddBulk && (
              <button
                type="button"
                onClick={() => {
                  const missing = suggestedIds.filter(sid => !safeIds.includes(sid));
                  onAddBulk(missing);
                  if (showToast) showToast(`Added ${missing.length} Notification IDs!`, "success");
                }}
                className="text-[9px] font-bold text-indigo-700 bg-white hover:bg-indigo-100 px-2 py-0.5 rounded-md border border-indigo-200 transition-colors active:scale-95 shadow-sm"
              >
                + Add All ({suggestedIds.filter(sid => !safeIds.includes(sid)).length})
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto custom-scrollbar">
            {suggestedIds.map((sid, sIdx) => {
              const isAdded = safeIds.includes(sid);
              return (
                <button
                  key={sIdx}
                  type="button"
                  disabled={isAdded}
                  onClick={() => {
                    onAdd(sid);
                    if (showToast) showToast(`ID #${sid} added!`, "success");
                  }}
                  className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-lg border transition-all active:scale-95 flex items-center gap-1 ${
                    isAdded 
                      ? 'bg-emerald-100 border-emerald-200 text-emerald-800 opacity-80 cursor-default' 
                      : 'bg-white hover:bg-indigo-600 hover:text-white border-indigo-200 text-indigo-700 shadow-sm'
                  }`}
                  title={isAdded ? "Already Added" : `Tap to add ID #${sid}`}
                >
                  <span>{sid}</span>
                  <span>{isAdded ? '✓' : '+'}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <input 
          type="text"
          inputMode="numeric"
          value={currentId}
          onChange={(e) => setCurrentId(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter or paste 9-digit ID"
          className="flex-1 w-full bg-slate-50/70 border border-slate-200 text-slate-800 text-sm font-semibold rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block px-3.5 py-2.5 outline-none transition-all placeholder:text-slate-400 placeholder:font-normal"
        />
        <button 
          onClick={handleAdd} 
          className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-bold shadow-md shadow-indigo-600/20 hover:bg-indigo-700 hover:shadow-indigo-600/40 active:scale-95 transition-all text-sm tracking-wide shrink-0"
        >
          ADD
        </button>
      </div>
      {safeIds.length > 0 && (
        <ul className="mt-4 space-y-2 max-h-44 overflow-y-auto pr-1 custom-scrollbar">
          {safeIds.map((id, index) => (
            <li key={index} className="flex justify-between items-center bg-slate-50/80 border border-slate-100 px-3.5 py-2 rounded-xl shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] hover:bg-indigo-50/40 transition-colors">
              <span className="font-mono font-bold text-slate-700 tracking-wider text-sm">{id}</span>
              <button 
                onClick={() => onRemove(index)} 
                className="text-red-400 hover:text-white hover:bg-red-500 bg-red-50 h-7 w-7 rounded-full flex items-center justify-center font-bold transition-all shadow-sm"
                title="Remove"
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};


const sanitizeIncomingFormData = (d, base) => {
  const arrayKeys = [
    'notification_ids', 'hiv_dm_ids', 'dbt_ids', 'sample_collection_ids', 'sample_tested_ids',
    'outcome_assigned_ids', 'home_visit_ids', 'contact_tracing_ids', 'follow_up_ids',
    'face_to_face_ids', 'presumptive_ids', 'documents_ids', 'fdc_provided_ids',
    'kit_consumption_ids', 'differentiated_tb_ids', 'tpt_treatment_start_ids',
    'tpt_presumptive_ids', 'adhar_face_authentication_ids', 'consent_with_id_ids'
  ];
  const clean = { ...base };
  if (d && typeof d === 'object') {
    Object.keys(d).forEach(k => {
      if (arrayKeys.includes(k)) {
        clean[k] = Array.isArray(d[k]) ? d[k] : [];
      } else if (k === 'visited_names') {
        clean[k] = Array.isArray(d[k]) ? d[k] : [];
      } else if (d[k] !== null && d[k] !== undefined) {
        clean[k] = d[k];
      }
    });
  }
  arrayKeys.forEach(k => {
    if (!Array.isArray(clean[k])) clean[k] = [];
  });
  if (!Array.isArray(clean.visited_names)) clean.visited_names = [];
  return clean;
};

function App() {
  const [directory, setDirectory] = useState({});
  const [districts, setDistricts] = useState([]);
  
  useEffect(() => {
    const fetchDirectory = async () => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
        const res = await fetch(`${API_BASE_URL}/staff-directory`);
        const data = await res.json();
        if (data.status === 'success') {
          setDirectory(data.data);
          setDistricts(Object.keys(data.data).sort());
        }
      } catch (err) {
        console.error("Failed to fetch staff directory", err);
      }
    };
    fetchDirectory();
  }, []);
  
  const [formData, setFormData] = useState({
    working_place: "", fo_name: "", pin: "",
    notification_ids: [], hiv_dm_ids: [], dbt_ids: [], 
    sample_collection_ids: [], sample_tested_ids: [], 
    outcome_assigned_ids: [], home_visit_ids: [], 
    contact_tracing_ids: [], follow_up_ids: [], 
    face_to_face_ids: [], presumptive_ids: [], 
    documents_ids: [],
    fdc_provided_ids: [],
    kit_consumption_ids: [],
    differentiated_tb_ids: [],
    tpt_treatment_start_ids: [],
    tpt_presumptive_ids: [],
    adhar_face_authentication_ids: [],
    consent_with_id_ids: [],
    remark: "", visited_names: []
  });

      
  
      
  const [docName, setDocName] = useState("");
  const [pinStatus, setPinStatus] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentView, setCurrentView] = useState('form');
  const [toast, setToast] = useState({ message: "", type: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBtn, setShowInstallBtn] = useState(true);
  const [showIosInstallModal, setShowIosInstallModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showPostSubmitSuccess, setShowPostSubmitSuccess] = useState(false);
  const [submittedReportSummary, setSubmittedReportSummary] = useState(null);
  const [copiedPostSubmit, setCopiedPostSubmit] = useState(false);
  const [todayMaxReached, setTodayMaxReached] = useState(false);

  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setShowInstallBtn(false);
    }

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice && choice.outcome === 'accepted') {
        setShowInstallBtn(false);
        showToast("DFY MIS App install ho gayi hai!", "success");
      }
      setDeferredPrompt(null);
    } else {
      setShowIosInstallModal(true);
    }
  };

  // Persistent Session Auto-Restore on Page Refresh (No Re-login required)
  useEffect(() => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const savedSession = localStorage.getItem('dfy_user_session');
      if (savedSession) {
        const session = JSON.parse(savedSession);
        if (session && session.date === today && session.working_place && session.fo_name && session.pin) {
          // Check for local draft backup
          const draftKey = `dfy_draft_${session.working_place}_${session.fo_name}`;
          let initialData = {
            working_place: session.working_place,
            fo_name: session.fo_name,
            pin: session.pin,
            date_of_reporting: today
          };
          const rawDraft = localStorage.getItem(draftKey);
          if (rawDraft) {
            try {
              const parsedDraft = JSON.parse(rawDraft);
              initialData = sanitizeIncomingFormData(parsedDraft, initialData);
            } catch (e) {}
          }
          setFormData(prev => sanitizeIncomingFormData(initialData, { ...prev, ...initialData }));
          setPinStatus("success");
          setIsLoggedIn(true);
        }
      }
    } catch (e) {
      console.warn("Session restore error", e);
    }
  }, []);

  const showToast = (message, type = 'success') => setToast({ message, type });

  // Auto-save draft whenever form data changes while logged in
  useEffect(() => {
    if (isLoggedIn && formData.fo_name && formData.working_place) {
      try {
        const draftKey = `dfy_draft_${formData.working_place}_${formData.fo_name}`;
        localStorage.setItem(draftKey, JSON.stringify(formData));
      } catch (e) {}
    }
  }, [formData, isLoggedIn]);

  const closeToast = () => setToast({ message: "", type: "" });



  useEffect(() => {
    if (formData.pin.length === 4 && formData.fo_name && formData.working_place) {
      setPinStatus("checking");
      const checkPin = async () => {
        try {
          const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
          const res = await fetch(`${API_BASE_URL}/verify-pin`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ working_place: formData.working_place, fo_name: formData.fo_name, pin: formData.pin })
          });
          const data = await res.json();
          setPinStatus(data.valid ? "success" : "error");
        } catch {
          setPinStatus("error");
        }
      };
      checkPin();
    } else {
      setPinStatus(null);
    }
  }, [formData.pin, formData.fo_name, formData.working_place]);

  const handleDistrictChange = (e) => {
    setFormData({ ...formData, working_place: e.target.value, fo_name: "", pin: "" });
    setPinStatus(null);
  }

  const handleNameChange = (e) => {
    setFormData({ ...formData, fo_name: e.target.value, pin: "" });
    setPinStatus(null);
  }

  const morningQuotes = [
    "Ek naya din, ek nayi shuruwat! Jeet ke aana!",
    "Great things never come from comfort zones. Field par macha do!",
    "Success is what happens after you have survived all your mistakes. All the best for today!",
    "Your hard work makes a difference. Have a successful field day!",
    "Aapki mehnat se hi farak padta hai. Best of luck!"
  ];

  const eveningQuotes = [
    "Well done! Aaj ka din bahut badhiya raha. Aaram karein!",
    "Great work today! Aapka dedication lajawab hai.",
    "Mission accomplished! Ab kal milte hain naye josh ke sath.",
    "Another day, another success. Proud of your hard work!",
    "Ek aur behtareen din khatam hua. Good job and good night!"
  ];

  const handleLogout = () => {
    try {
      localStorage.removeItem('dfy_user_session');
    } catch (e) {}
    setIsLoggedIn(false);
    setFormData({
      working_place: "", fo_name: "", pin: "",
      notification_ids: [], hiv_dm_ids: [], dbt_ids: [], 
      sample_collection_ids: [], sample_tested_ids: [], 
      outcome_assigned_ids: [], home_visit_ids: [], 
      contact_tracing_ids: [], follow_up_ids: [], 
      face_to_face_ids: [], presumptive_ids: [], 
      documents_ids: [], fdc_provided_ids: [],
      kit_consumption_ids: [], differentiated_tb_ids: [],
      tpt_treatment_start_ids: [], tpt_presumptive_ids: [],
      adhar_face_authentication_ids: [], consent_with_id_ids: [],
      remark: "", visited_names: []
    });
    setPinStatus(null);
    setCurrentView('form');
    showToast("Logged out successfully", "success");
  };

  const handleLogin = async () => {
    if (pinStatus === 'success') {
      setIsSubmitting(true);
      try {
        const today = new Date().toISOString().split('T')[0];
        const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
        const res = await fetch(`${API_BASE_URL}/check-today-status`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ working_place: formData.working_place, fo_name: formData.fo_name, date: today })
        });
        const data = await res.json();
        
        const isMaxLimit = data.status === 'max_limit_reached';
        setTodayMaxReached(isMaxLimit);

        if (isMaxLimit) {
           if (data.data && Object.keys(data.data).length > 0) {
             const d = data.data;
             setFormData(prev => sanitizeIncomingFormData(d, {
               ...prev,
               date_of_reporting: d.date_of_reporting || today
             }));
           }
        } else if (data.status === 'in_progress' || data.status === 'completed' || data.status === 'pending_previous') {
           if (data.data && Object.keys(data.data).length > 0) {
             const d = data.data;
             setFormData(prev => sanitizeIncomingFormData(d, {
               ...prev,
               date_of_reporting: d.date_of_reporting || today
             }));
           } else {
             // Second submission of the day (fresh start)
             setFormData(prev => sanitizeIncomingFormData({}, {
                ...prev,
                date_of_reporting: today,
                remark: "", visited_names: []
             }));
           }
        } else {
          setFormData(prev => ({ ...prev, date_of_reporting: today }));
        }

        // ALWAYS allow login and persist session
        try {
          localStorage.setItem('dfy_user_session', JSON.stringify({
            working_place: formData.working_place,
            fo_name: formData.fo_name,
            pin: formData.pin,
            date: today
          }));
        } catch (e) {}

        setIsLoggedIn(true);

        if (isMaxLimit) {
          setCurrentView('profile');
          showToast("Aaj ki 2 reports submitted hain. Profile me aap apna data dekh/edit kar sakte hain!", "success");
        } else {
          showToast(`Welcome back, ${formData.fo_name}!`, 'success');
        }
      } catch (err) {
        showToast("Error checking status", "error");
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const addId = (field, id) => {
    const current = formData[field] || [];
    if (current.includes(id)) {
      showToast(`ID ${id} pehle se added hai!`, "error");
      return;
    }
    if (field === 'tpt_treatment_start_ids') {
      const presumptive = formData.tpt_presumptive_ids || [];
      if (!presumptive.includes(id)) {
        showToast("Tip: Patient ko TPT Presumptive bucket me bhi record karein.", "success");
      }
    }
    setFormData(prev => ({ ...prev, [field]: [...(prev[field] || []), id] }));
  };

  const addMultipleIds = (field, newIds) => {
    setFormData(prev => {
      const current = prev[field] || [];
      const uniqueNew = newIds.filter(id => !current.includes(id));
      const duplicatesCount = newIds.length - uniqueNew.length;
      if (duplicatesCount > 0) {
        showToast(`${uniqueNew.length} IDs add hui (${duplicatesCount} duplicates ignore ki gayi)`, 'success');
      } else {
        showToast(`${uniqueNew.length} IDs add hui!`, 'success');
      }
      return {
        ...prev,
        [field]: [...current, ...uniqueNew]
      };
    });
  };
  
  const removeId = (field, idx) => {
    setFormData({ ...formData, [field]: formData[field].filter((_, i) => i !== idx) });
  };
  
  const addDoctor = () => {
    const trimmed = docName.trim();
    if(trimmed) {
      if (formData.visited_names.includes(trimmed)) {
        showToast(`${trimmed} pehle se added hai!`, "error");
        return;
      }
      setFormData({ ...formData, visited_names: [...formData.visited_names, trimmed] });
      setDocName("");
    }
  };



  const generateWhatsAppText = () => {
    let text = '*Daily Field Report - ' + (formData.date_of_reporting || new Date().toISOString().split('T')[0]) + '* ??\n';
    text += '*Name:* ' + formData.fo_name + ' (' + formData.working_place + ')\n\n';

    if (formData.visited_names && formData.visited_names.length > 0) {
      text += '*?? Doctors/Stores Visited:*\n';
      text += formData.visited_names.join('\n') + '\n\n';
    }

    text += '*?? Work Metrics:*\n';
    
    const categories = [
      { key: 'notification_ids', label: 'Notification' },
      { key: 'hiv_dm_ids', label: 'HIV & DM' },
      { key: 'dbt_ids', label: 'DBT' },
      { key: 'sample_collection_ids', label: 'Sample Collection' },
      { key: 'sample_tested_ids', label: 'Sample Tested' },
      { key: 'outcome_assigned_ids', label: 'Outcome Assigned' },
      { key: 'home_visit_ids', label: 'Home Visit' },
      { key: 'contact_tracing_ids', label: 'Contact Tracing' },
      { key: 'follow_up_ids', label: 'Follow Up' },
      { key: 'face_to_face_ids', label: 'Face to Face' },
      { key: 'presumptive_ids', label: 'Presumptive' },
      { key: 'documents_ids', label: 'Documents' },
      { key: 'fdc_provided_ids', label: 'FDC Provided' },
      { key: 'kit_consumption_ids', label: 'Kit Consumption' },
      { key: 'differentiated_tb_ids', label: 'Differentiated TB' },
      { key: 'tpt_treatment_start_ids', label: 'TPT Treatment Start' },
      { key: 'tpt_presumptive_ids', label: 'TPT Presumptive' },
      { key: 'adhar_face_authentication_ids', label: 'Adhar Face Auth' },
      { key: 'consent_with_id_ids', label: 'Consent with ID' }
    ];

    let hasMetrics = false;
    categories.forEach(cat => {
      const ids = formData[cat.key] || [];
      if (ids.length > 0) {
        hasMetrics = true;
        text += '\n*' + cat.label + ':* ' + ids.length + '\n';
        text += ids.join('\n') + '\n';
      }
    });

    if (!hasMetrics) {
      text += 'None\n';
    }

    if (formData.remark && formData.remark.trim() !== '') {
      text += '\n*?? Remarks:*\n' + formData.remark.trim() + '\n';
    }

    return text.trim();
  };

  const copyToWhatsApp = () => {
    const text = generateWhatsAppText();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => showToast('Copied! Paste in WhatsApp.', 'success')).catch(() => showToast('Failed to copy', 'error'));
    }
  };


  const submitReport = async () => {
    if(!formData.working_place || !formData.fo_name || !formData.pin) {
      showToast("Pehle Zila, Naam aur PIN bharo!", "error");
      return;
    }
    
    setIsSubmitting(true);
    try {
      showToast("Saving your report...", "success");
      const payload = { ...formData, date: formData.date_of_reporting };
      
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const response = await fetch(`${API_BASE_URL}/submit-daily-report`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      if(response.ok) {
        setShowReviewModal(false);
        try { localStorage.removeItem(`dfy_draft_${formData.working_place}_${formData.fo_name}`); } catch (e) {}
        showToast("✓ Final Report Submitted Successfully!", "success");

        const summaryText = generateWhatsAppText();
        const totalCount = [
          'notification_ids', 'hiv_dm_ids', 'dbt_ids', 'sample_collection_ids', 'sample_tested_ids',
          'outcome_assigned_ids', 'home_visit_ids', 'contact_tracing_ids', 'follow_up_ids',
          'face_to_face_ids', 'presumptive_ids', 'documents_ids', 'fdc_provided_ids',
          'kit_consumption_ids', 'differentiated_tb_ids', 'tpt_treatment_start_ids',
          'tpt_presumptive_ids', 'adhar_face_authentication_ids', 'consent_with_id_ids'
        ].reduce((sum, k) => sum + (Array.isArray(formData[k]) ? formData[k].length : 0), 0);

        setSubmittedReportSummary({
          text: summaryText,
          date: formData.date_of_reporting || new Date().toISOString().split('T')[0],
          totalIds: totalCount
        });
        setShowPostSubmitSuccess(true);
      } else {
        const result = await response.json();
        showToast(result.detail || "Error in saving data.", "error");
      }
    } catch(err) {
      showToast("Network error while submitting report.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const group1 = [
    { key: "notification_ids", label: "Notification" },
    { key: "hiv_dm_ids", label: "HIV & DM" },
    { key: "dbt_ids", label: "DBT" },
  ];
  const group2 = [
    { key: "sample_collection_ids", label: "Sample Collection" },
    { key: "sample_tested_ids", label: "Sample Tested" },
    { key: "outcome_assigned_ids", label: "Outcome Assigned" },
  ];
  const group3 = [
    { key: "home_visit_ids", label: "Home Visit" },
    { key: "contact_tracing_ids", label: "Contact Tracing" },
    { key: "follow_up_ids", label: "Follow Up" },
    { key: "face_to_face_ids", label: "Face to Face" },
    { key: "presumptive_ids", label: "Presumptive" },
  ];
  const group4 = [
    { key: "documents_ids", label: "Documents" },
    { key: "fdc_provided_ids", label: "FDC Provided" },
    { key: "kit_consumption_ids", label: "Kit Consumption" }
  ];
  const group5 = [
    { key: "differentiated_tb_ids", label: "Differentiated TB" },
    { key: "tpt_treatment_start_ids", label: "TPT Treatment Start" },
    { key: "tpt_presumptive_ids", label: "TPT Presumptive" },
    { key: "adhar_face_authentication_ids", label: "Adhar Face Auth" },
    { key: "consent_with_id_ids", label: "Consent with ID" }
  ];

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans pb-40 text-slate-800 flex flex-col">
      <Toast message={toast.message} type={toast.type} onClose={closeToast} />

      <header className="bg-white border-b border-slate-100 p-4 sticky top-0 z-40 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)]">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-indigo-600 to-blue-500 h-10 w-10 sm:h-11 sm:w-11 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30 text-white font-black text-xl shrink-0">
              <svg width="20" height="20" className="sm:w-[22px] sm:h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black tracking-wide leading-tight text-slate-800">DFY <span className="text-indigo-600">REPORTING</span></h1>
              <p className="text-slate-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest mt-0.5 ">Mobile MIS Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 ml-auto">
            <button onClick={() => window.location.href = '/admin'} className="flex items-center gap-1 sm:gap-1.5 text-slate-400 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 px-2 py-1 sm:px-2.5 sm:py-1 rounded-full transition-colors border border-transparent hover:border-indigo-100" title="Admin Portal">
              <svg width="12" height="12" className="sm:w-[14px] sm:h-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M16 21v-2a4 4 0 0 0-4-3.87"/></svg>
              <span className="text-[9px] sm:text-[10px] font-bold tracking-wider hidden sm:inline">ADMIN</span>
            </button>
            <button onClick={handleInstallApp} className="flex items-center gap-1 bg-indigo-600 text-white hover:bg-indigo-700 px-2.5 py-1 rounded-full text-[9px] sm:text-[10px] font-bold shadow-sm transition-all active:scale-95" title="Install App">
              <span>📲</span>
              <span className="hidden xs:inline">Install App</span>
            </button>
            <div className="bg-indigo-50 text-indigo-600 px-2 sm:px-3 py-1 rounded-full text-[9px] sm:text-[10px] font-bold border border-indigo-100 shadow-sm tracking-wider">v3.1</div>
            {isLoggedIn && (
              <>
                <button onClick={() => setCurrentView(currentView === 'form' ? 'profile' : 'form')} className="bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-indigo-200 transition-colors">
                  {currentView === 'form' ? 'Profile' : 'Form'}
                </button>
                <button onClick={handleLogout} className="text-slate-400 hover:text-slate-800 text-sm font-bold transition-colors ml-1">
                  <svg width="18" height="18" className="sm:w-[20px] sm:h-[20px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className={`max-w-4xl mx-auto px-4 sm:px-6 w-full flex-1 flex flex-col ${!isLoggedIn ? "items-center justify-center py-10" : "py-6"}`}>
        {!isLoggedIn ? (
          /* Login Screen */
          <div className="max-w-md mx-auto animate-fade-in-down w-full">
            <div className="text-center mb-8">
              <div className="mx-auto bg-indigo-50 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                </svg>
              </div>
              <h2 className="text-2xl font-black text-slate-800 mb-2">Secure Login</h2>
              <p className="text-slate-500 text-sm font-medium">Select your profile and enter PIN to access the dashboard.</p>
            </div>
            
                        {/* PWA Install Banner */}
            {showInstallBtn && (
              <div className="mb-5 bg-gradient-to-r from-indigo-600 to-blue-600 rounded-3xl p-4 sm:p-5 text-white flex items-center justify-between shadow-xl shadow-indigo-500/20 border border-indigo-400/30 animate-fade-in">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-xl shrink-0">
                    📲
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-black tracking-wide leading-tight">Install Mobile App</h4>
                    <p className="text-[10px] text-indigo-100 font-medium">Home screen par 1-click access</p>
                  </div>
                </div>
                <button 
                  onClick={handleInstallApp}
                  className="bg-white text-indigo-700 hover:bg-indigo-50 font-black text-[11px] sm:text-xs px-3.5 py-2 rounded-xl shadow-md active:scale-95 transition-all shrink-0 uppercase tracking-wider"
                >
                  Install
                </button>
              </div>
            )}

            <div className="bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 sm:p-8 border border-slate-100">
              <div className="space-y-5">
                <div>
                  <label className="block text-xs text-slate-500 font-bold uppercase tracking-wider mb-1.5 ml-1">District (Zila)</label>
                  <select value={formData.working_place} onChange={handleDistrictChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 font-semibold outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm">
                    <option value="">Select District</option>
                    {districts.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                
                {formData.working_place && (
                  <div className="animate-fade-in">
                    <label className="block text-xs text-slate-500 font-bold uppercase tracking-wider mb-1.5 ml-1">Select Name</label>
                    <select value={formData.fo_name} onChange={handleNameChange} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 font-semibold outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm">
                      <option value="">Select Name</option>
                      {directory[formData.working_place].map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </div>
                )}

                {formData.fo_name && (
                  <div className="animate-fade-in">
                    <label className="block text-xs text-slate-500 font-bold uppercase tracking-wider mb-1.5 ml-1">Enter Secret PIN</label>
                    <input 
                      type="password" 
                      placeholder="****" 
                      maxLength="4" 
                      value={formData.pin} 
                      onChange={(e) => setFormData({...formData, pin: e.target.value})} 
                      className={`w-full bg-slate-50 border ${pinStatus === 'success' ? 'border-emerald-500 ring-2 ring-emerald-200' : pinStatus === 'error' ? 'border-red-500 ring-2 ring-red-200' : 'border-slate-200'} rounded-xl px-4 py-3.5 text-xl tracking-widest text-slate-800 font-black outline-none text-center transition-all shadow-inner`} 
                    />
                  </div>
                )}

                <button 
                  onClick={handleLogin}
                  disabled={pinStatus !== 'success' || isSubmitting}
                  className={`w-full mt-6 py-3.5 rounded-xl font-bold text-sm tracking-widest uppercase shadow-lg transition-all ${pinStatus === 'success' && !isSubmitting ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-500/30 active:scale-95' : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'}`}
                >
                  {isSubmitting ? (
                    <div className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4 text-indigo-400" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Checking Status...</span>
                    </div>
                  ) : 'Continue'}
                </button>
              </div>
            </div>
          </div>
          ) : currentView === 'profile' ? (
            <MyProfileDashboard formData={formData} showToast={showToast} />
          ) : (
            /* Main Dashboard */
            <div className="animate-fade-in w-full max-w-md mx-auto overflow-x-hidden">
              <div className="grid grid-cols-1 gap-4">






              </div>

              
                <Accordion title="1. Patient Registration" defaultOpen={true}>
                  {group1.map((cat) => (
                    <IdBucket 
                      key={cat.key} 
                      title={cat.label} 
                      ids={formData[cat.key]} 
                      onAdd={(id) => addId(cat.key, id)} 
                      onAddMultiple={(ids) => addMultipleIds(cat.key, ids)} 
                      onRemove={(idx) => removeId(cat.key, idx)} 
                      showToast={showToast}
                      suggestedIds={cat.key !== 'notification_ids' ? (formData.notification_ids || []) : []}
                      onAddBulk={(newIds) => addMultipleIds(cat.key, newIds)}
                    />
                  ))}
                </Accordion>
                <Accordion title="2. Diagnostics & Testing">
                  {group2.map((cat) => (
                    <IdBucket 
                      key={cat.key} 
                      title={cat.label} 
                      ids={formData[cat.key]} 
                      onAdd={(id) => addId(cat.key, id)} 
                      onAddMultiple={(ids) => addMultipleIds(cat.key, ids)} 
                      onRemove={(idx) => removeId(cat.key, idx)} 
                      showToast={showToast}
                      suggestedIds={formData.notification_ids || []}
                      onAddBulk={(newIds) => addMultipleIds(cat.key, newIds)}
                    />
                  ))}
                </Accordion>
                <Accordion title="3. Field Work & Visits">
                  {group3.map((cat) => (
                    <IdBucket 
                      key={cat.key} 
                      title={cat.label} 
                      ids={formData[cat.key]} 
                      onAdd={(id) => addId(cat.key, id)} 
                      onAddMultiple={(ids) => addMultipleIds(cat.key, ids)} 
                      onRemove={(idx) => removeId(cat.key, idx)} 
                      showToast={showToast}
                      suggestedIds={formData.notification_ids || []}
                      onAddBulk={(newIds) => addMultipleIds(cat.key, newIds)}
                    />
                  ))}
                </Accordion>
                <Accordion title="4. Logistics & Outcomes">
                  {group4.map((cat) => (
                    <IdBucket 
                      key={cat.key} 
                      title={cat.label} 
                      ids={formData[cat.key]} 
                      onAdd={(id) => addId(cat.key, id)} 
                      onAddMultiple={(ids) => addMultipleIds(cat.key, ids)} 
                      onRemove={(idx) => removeId(cat.key, idx)} 
                      showToast={showToast}
                      suggestedIds={formData.notification_ids || []}
                      onAddBulk={(newIds) => addMultipleIds(cat.key, newIds)}
                    />
                  ))}
                </Accordion>
                <Accordion title="5. Special Tracking">
                  {group5.map((cat) => (
                    <IdBucket 
                      key={cat.key} 
                      title={cat.label} 
                      ids={formData[cat.key] || []} 
                      onAdd={(id) => addId(cat.key, id)} 
                      onAddMultiple={(ids) => addMultipleIds(cat.key, ids)} 
                      onRemove={(idx) => removeId(cat.key, idx)} 
                      showToast={showToast}
                      suggestedIds={formData.notification_ids || []}
                      onAddBulk={(newIds) => addMultipleIds(cat.key, newIds)}
                    />
                  ))}
                </Accordion>
                <Accordion title="6. Additional Remarks">
                  <div className="p-4 sm:p-5">
                    <textarea 
                      value={formData.remark || ''} 
                      onChange={e => setFormData({...formData, remark: e.target.value})} 
                      placeholder="Koi extra information ya remark yahan likhein..." 
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400 min-h-[120px]"
                    ></textarea>
                  </div>
                </Accordion>

              {/* Travel & Doctors Section */}
              <div className="grid grid-cols-1 gap-4 mt-8">
                <div className="bg-white rounded-2xl shadow-[0_2px_10px_-3px_rgba(16,185,129,0.1)] border border-emerald-100 overflow-hidden">
                  <div className="bg-emerald-50/50 px-5 py-4 border-b border-emerald-50 flex items-center gap-2">
                    <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    <label className="block text-sm font-bold text-emerald-800 tracking-wide uppercase">Doctor / Store Visits</label>
                  </div>
                  <div className="p-4 sm:p-5">
                    <div className="flex gap-2">
                      <input type="text" value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="Doctor/Store Name" className="flex-1 w-full bg-slate-50/50 border border-slate-200 text-slate-800 text-sm rounded-lg px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-slate-300" />
                      <button onClick={addDoctor} className="bg-emerald-500 text-white px-4 py-2.5 rounded-lg font-bold shadow-md shadow-emerald-500/20 hover:bg-emerald-600 active:scale-95 transition-all text-sm tracking-wide">ADD</button>
                    </div>
                    {formData.visited_names.length > 0 && (
                      <ul className="mt-4 space-y-2">
                        {formData.visited_names.map((name, i) => (
                          <li key={i} className="flex justify-between items-center bg-white border border-slate-100 px-3.5 py-2.5 rounded-lg text-sm text-slate-600 font-semibold shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]">
                            <span className="flex items-center gap-3">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                              {name}
                            </span>
                            <button onClick={() => {
                              setFormData({ ...formData, visited_names: formData.visited_names.filter((_, idx) => idx !== i) });
                            }} className="text-slate-300 hover:text-red-500 font-bold text-lg transition-colors">&times;</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

              {/* Spacer for Sticky Footer */}
              <div className="h-40 w-full pointer-events-none"></div>

              {/* Sticky Bottom Action Bar */}
              <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-100 p-3 sm:p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-50">
                <div className="max-w-4xl mx-auto flex items-center gap-2 sm:gap-3">
                  <button 
                    onClick={copyToWhatsApp}
                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-xs sm:text-sm py-3.5 sm:py-4 px-3.5 sm:px-5 rounded-xl transition-all flex items-center justify-center gap-1.5 shrink-0 active:scale-95 shadow-sm"
                    title="Copy WhatsApp Summary"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    <span>WhatsApp</span>
                  </button>
                  {todayMaxReached ? (
                    <button 
                      onClick={() => setCurrentView('profile')}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm py-3.5 sm:py-4 px-4 sm:px-6 rounded-xl shadow-lg shadow-emerald-600/20 active:scale-95 transition-all tracking-wider uppercase flex justify-center items-center gap-2"
                    >
                      <span>✓ 2 Reports Submitted (View Profile)</span>
                    </button>
                  ) : (
                    <button 
                      onClick={() => { if(!formData.working_place || !formData.fo_name || !formData.pin) { showToast("Pehle Zila, Naam aur PIN bharo!", "error"); return; } setShowReviewModal(true); }} 
                      disabled={isSubmitting}
                      className={`flex-1 bg-indigo-600 text-white font-bold text-xs sm:text-sm py-3.5 sm:py-4 px-4 sm:px-6 rounded-xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 hover:shadow-indigo-600/40 active:scale-95 transition-all tracking-wider uppercase flex justify-center items-center gap-2 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                      {isSubmitting ? (
                        <>
                          <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                          <span>Submitting...</span>
                        </>
                      ) : 'Submit Final Report'}
                    </button>
                  )}
                </div>
              </div>
            </div>
        )}
      </main>

        {/* Post-Submission Success & WhatsApp Summary Modal */}
      {showPostSubmitSuccess && submittedReportSummary && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans">
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-lg shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col animate-fade-in">
            
            {/* Success Header */}
            <div className="text-center pb-4 border-b border-slate-100 mb-3">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center text-3xl mx-auto mb-2 shadow-inner">
                🎉
              </div>
              <h3 className="text-xl font-black text-slate-800">Report Submitted Successfully!</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
                {formData.fo_name} &bull; {formData.working_place} &bull; {submittedReportSummary.date}
              </p>
            </div>

            {/* WhatsApp Summary Box */}
            <div className="flex-1 overflow-y-auto space-y-2.5 custom-scrollbar pr-1 my-1">
              <div className="flex justify-between items-center px-1">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                  <span>📱</span> WhatsApp Summary:
                </span>
                <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full">
                  {submittedReportSummary.totalIds} IDs Recorded
                </span>
              </div>

              <div className="bg-slate-900 text-emerald-400 font-mono text-xs p-4 rounded-2xl border border-slate-800 whitespace-pre-wrap max-h-56 overflow-y-auto custom-scrollbar select-all">
                {submittedReportSummary.text}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-slate-100 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  if (navigator.clipboard) {
                    navigator.clipboard.writeText(submittedReportSummary.text);
                    setCopiedPostSubmit(true);
                    showToast("WhatsApp summary copied to clipboard!", "success");
                    setTimeout(() => setCopiedPostSubmit(false), 2500);
                  }
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-emerald-600/20 active:scale-95 transition-all text-xs sm:text-sm tracking-wider uppercase flex items-center justify-center gap-2"
              >
                <span>📋</span>
                <span>{copiedPostSubmit ? '✓ Copied to Clipboard!' : 'Copy for WhatsApp'}</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPostSubmitSuccess(false);
                    setCurrentView('profile');
                  }}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold py-3 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <span>✏️</span>
                  <span>Edit / Correct IDs</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowPostSubmitSuccess(false);
                    window.location.reload();
                  }}
                  className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl text-xs transition-colors"
                >
                  Done / Close
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Pre-Submission Review Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-lg shadow-2xl border border-slate-100 max-h-[85vh] flex flex-col animate-fade-in">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-lg font-black text-slate-800">Review Daily Submission</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{formData.fo_name} &bull; {formData.working_place}</p>
              </div>
              <button onClick={() => setShowReviewModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-4 custom-scrollbar">
              <div className="bg-indigo-50/70 p-4 rounded-2xl border border-indigo-100 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400">Total IDs in this Report</span>
                  <p className="text-2xl font-black text-indigo-700">
                    {[
                      'notification_ids', 'hiv_dm_ids', 'dbt_ids', 'sample_collection_ids', 'sample_tested_ids',
                      'outcome_assigned_ids', 'home_visit_ids', 'contact_tracing_ids', 'follow_up_ids',
                      'face_to_face_ids', 'presumptive_ids', 'documents_ids', 'fdc_provided_ids',
                      'kit_consumption_ids', 'differentiated_tb_ids', 'tpt_treatment_start_ids',
                      'tpt_presumptive_ids', 'adhar_face_authentication_ids', 'consent_with_id_ids'
                    ].reduce((sum, k) => sum + (Array.isArray(formData[k]) ? formData[k].length : 0), 0)}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Reporting Date</span>
                  <p className="text-xs font-bold text-slate-700">{formData.date_of_reporting || new Date().toISOString().split('T')[0]}</p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2">Category Summary</h4>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'notification_ids', label: 'Notification' },
                    { key: 'hiv_dm_ids', label: 'HIV & DM' },
                    { key: 'dbt_ids', label: 'DBT' },
                    { key: 'sample_collection_ids', label: 'Sample Col' },
                    { key: 'sample_tested_ids', label: 'Sample Tested' },
                    { key: 'outcome_assigned_ids', label: 'Outcome' },
                    { key: 'home_visit_ids', label: 'Home Visit' },
                    { key: 'contact_tracing_ids', label: 'Contact Trace' },
                    { key: 'follow_up_ids', label: 'Follow Up' },
                    { key: 'face_to_face_ids', label: 'Face to Face' },
                    { key: 'presumptive_ids', label: 'Presumptive' },
                    { key: 'documents_ids', label: 'Documents' },
                    { key: 'fdc_provided_ids', label: 'FDC Provided' },
                    { key: 'kit_consumption_ids', label: 'Kit Cons' },
                    { key: 'differentiated_tb_ids', label: 'Diff TB' },
                    { key: 'tpt_treatment_start_ids', label: 'TPT Start' },
                    { key: 'tpt_presumptive_ids', label: 'TPT Presumptive' },
                    { key: 'adhar_face_authentication_ids', label: 'Adhar Face' },
                    { key: 'consent_with_id_ids', label: 'Consent ID' }
                  ].map(cat => {
                    const count = Array.isArray(formData[cat.key]) ? formData[cat.key].length : 0;
                    if (count === 0) return null;
                    return (
                      <div key={cat.key} className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs">
                        <span className="font-bold text-slate-600 truncate mr-2">{cat.label}</span>
                        <span className="font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {formData.visited_names && formData.visited_names.length > 0 && (
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs">
                  <span className="font-bold text-slate-400 uppercase text-[10px] block mb-1">Visited Doctors / Stores</span>
                  <p className="font-semibold text-slate-700">{formData.visited_names.join(', ')}</p>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3 mt-auto">
              <button 
                onClick={() => setShowReviewModal(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 px-5 rounded-xl transition-colors"
              >
                Edit Form
              </button>
              <button 
                onClick={submitReport}
                disabled={isSubmitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 px-6 rounded-xl shadow-md shadow-emerald-600/20 active:scale-95 transition-all flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <span>Submitting...</span>
                  </>
                ) : '✓ Confirm & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS / Manual Install Modal */}
      {showIosInstallModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-sm shadow-2xl border border-slate-100 text-center animate-fade-in">
            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4 font-black">
              📲
            </div>
            <h3 className="text-lg font-black text-slate-800 mb-2">App Install Guide</h3>
            <p className="text-xs text-slate-500 mb-5 font-medium leading-relaxed">
              Apne mobile home screen par is app ko add karne ke liye:
            </p>

            <div className="text-left space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs font-semibold text-slate-700 mb-6">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0">1</span>
                <span>Chrome ya Safari me <strong>Share (📤)</strong> ya <strong>3-dots (⋮)</strong> par click karein.</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0">2</span>
                <span><strong>"Install app"</strong> ya <strong>"Add to Home screen"</strong> par tap karein.</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0">3</span>
                <span>App aapke mobile phone me install ho jayegi! 🎉</span>
              </div>
            </div>

            <button 
              onClick={() => setShowIosInstallModal(false)}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-indigo-600/20 active:scale-95"
            >
              Samajh Gaya (Close)
            </button>
          </div>
        </div>
      )}

      {/* Branding Footer */}
        <footer className="w-full text-center py-6 mt-auto opacity-70">
          <p className="text-xs font-bold text-slate-500 tracking-widest uppercase">
            Designed by <span className="text-indigo-600 font-black">Insomniac</span>
          </p>
        </footer>
      
    </div>
  )
}

export default App












