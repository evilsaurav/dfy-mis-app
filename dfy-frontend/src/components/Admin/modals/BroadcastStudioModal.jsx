import React from 'react';

export default function BroadcastStudioModal({
  show,
  onClose,
  newBroadcastModal,
  setNewBroadcastModal,
  currentUser,
  isSuperAdmin,
  districts = [],
  handleCreateBroadcast,
  broadcastsList = [],
  fetchAllBroadcasts,
  loadingBroadcasts,
  handleDeleteBroadcast
}) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl border border-slate-100 flex flex-col max-h-[92vh] overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-indigo-50/50 via-white to-purple-50/50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-2xl shadow-md shadow-indigo-600/20">
              📢
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                Central Broadcast Studio
              </h3>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">
                Broadcast instant alerts, directives &amp; urgent instructions to field staff &amp; sub-admins.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!newBroadcastModal && (
              <button
                onClick={() => {
                  const allowed = (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All'))
                    ? currentUser.allowed_districts
                    : ['All'];
                  setNewBroadcastModal({
                    title: '',
                    message: '',
                    priority: 'MEDIUM',
                    target_audience: 'ALL',
                    target_districts: allowed,
                    loading: false,
                    error: ''
                  });
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black px-4 py-2.5 rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
              >
                <span>➕</span>
                <span>Compose Broadcast</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none ml-2 cursor-pointer"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 custom-scrollbar space-y-6">
          {/* Compose Form */}
          {newBroadcastModal && (
            <form onSubmit={handleCreateBroadcast} className="bg-indigo-50/60 rounded-2xl p-5 border border-indigo-100 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between border-b border-indigo-100/80 pb-3">
                <h4 className="text-sm font-black text-indigo-950 flex items-center gap-2">
                  <span>✍️</span> Compose New Broadcast Notice
                </h4>
                <button
                  type="button"
                  onClick={() => setNewBroadcastModal(null)}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              {newBroadcastModal.error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl">
                  {newBroadcastModal.error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Urgency / Priority Level
                  </label>
                  <select
                    value={newBroadcastModal.priority}
                    onChange={(e) => setNewBroadcastModal(prev => ({ ...prev, priority: e.target.value }))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="HIGH">🚨 HIGH (Urgent Modal Popup on Login)</option>
                    <option value="MEDIUM">⚠️ MEDIUM (Notice Banner &amp; Alert)</option>
                    <option value="INFO">📢 INFO (General Announcement)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Target Audience
                  </label>
                  <select
                    value={newBroadcastModal.target_audience}
                    onChange={(e) => setNewBroadcastModal(prev => ({ ...prev, target_audience: e.target.value }))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="ALL">👥 Everyone (Field Staff &amp; Sub-Admins)</option>
                    <option value="FIELD_STAFF">🩺 Field Officers (Field Staff App Only)</option>
                    <option value="SUB_ADMINS">🛡️ Sub-Admins (Admin Portal Only)</option>
                  </select>
                </div>
              </div>

              {/* Target Districts */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1.5">
                  Target Districts {currentUser?.role === 'SUB_ADMIN' && '(Restricted to your assigned districts)'}
                </label>
                <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-wrap gap-2 max-h-36 overflow-y-auto custom-scrollbar">
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        const isAll = newBroadcastModal.target_districts.includes('All');
                        setNewBroadcastModal(prev => ({
                          ...prev,
                          target_districts: isAll ? [] : ['All']
                        }));
                      }}
                      className={`text-xs font-black px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                        newBroadcastModal.target_districts.includes('All')
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      🌐 Statewide (All Districts)
                    </button>
                  )}
                  {districts.filter(d => d !== 'All').map(d => {
                    const isSelected = newBroadcastModal.target_districts.includes(d) || (isSuperAdmin && newBroadcastModal.target_districts.includes('All'));
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          let current = newBroadcastModal.target_districts.filter(x => x !== 'All');
                          if (current.includes(d)) {
                            current = current.filter(x => x !== d);
                          } else {
                            current.push(d);
                          }
                          setNewBroadcastModal(prev => ({
                            ...prev,
                            target_districts: current
                          }));
                        }}
                        className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                  Announcement Title
                </label>
                <input
                  type="text"
                  value={newBroadcastModal.title}
                  onChange={(e) => setNewBroadcastModal(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Urgent: Complete Missing DBT & Cult/DST IDs by 6 PM"
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                  Announcement Message Body
                </label>
                <textarea
                  rows={3}
                  value={newBroadcastModal.message}
                  onChange={(e) => setNewBroadcastModal(prev => ({ ...prev, message: e.target.value }))}
                  placeholder="Type the full announcement message here. Will be shown on staff login popup and notice board..."
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setNewBroadcastModal(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={newBroadcastModal.loading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-xs font-black shadow-md shadow-indigo-600/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {newBroadcastModal.loading ? 'Publishing...' : '🚀 Publish Broadcast'}
                </button>
              </div>
            </form>
          )}

          {/* Broadcasts History List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">
                Active &amp; Past Broadcasts ({broadcastsList.length})
              </h4>
              <button
                onClick={fetchAllBroadcasts}
                disabled={loadingBroadcasts}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <span className={loadingBroadcasts ? "animate-spin" : ""}>🔄</span> Refresh
              </button>
            </div>

            {loadingBroadcasts ? (
              <div className="text-center py-10 text-slate-400 font-bold text-xs">Loading broadcasts...</div>
            ) : broadcastsList.length === 0 ? (
              <div className="text-center py-10 text-slate-400 font-bold text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                No broadcasts created yet. Click "+ Compose Broadcast" to send an alert.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                {broadcastsList.map((b) => {
                  const isHigh = b.priority === 'HIGH';
                  const isMed = b.priority === 'MEDIUM';
                  const isAuthor = isSuperAdmin || b.created_by_user === currentUser?.username || b.created_by_user === currentUser?.name;

                  return (
                    <div key={b.id} className="p-4 bg-white hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                            isHigh ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                            isMed ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                            'bg-indigo-100 text-indigo-800 border border-indigo-200'
                          }`}>
                            {b.priority || 'MEDIUM'}
                          </span>
                          <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                            🎯 {b.target_audience === 'FIELD_STAFF' ? 'Field Staff' : b.target_audience === 'SUB_ADMINS' ? 'Sub-Admins' : 'Everyone'}
                          </span>
                          <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                            📍 {b.target_districts?.includes('All') ? 'Statewide' : b.target_districts?.join(', ')}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium ml-auto sm:ml-0">
                            {b.created_at ? new Date(b.created_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>
                        <h5 className="text-sm font-black text-slate-800">{b.title}</h5>
                        <p className="text-xs text-slate-600 font-medium whitespace-pre-wrap">{b.message}</p>
                        <p className="text-[10px] text-slate-400 font-semibold">
                          Created by: <strong className="text-slate-600">{b.created_by_user}</strong> ({b.created_by_role === 'SUPER_ADMIN' ? 'Super Admin' : 'Sub-Admin'})
                        </p>
                      </div>

                      <div className="shrink-0 flex items-center justify-end">
                        {isAuthor && (
                          <button
                            onClick={() => handleDeleteBroadcast(b.id)}
                            className="bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-600 border border-rose-200 text-xs font-bold px-3 py-1.5 rounded-xl transition-all shadow-2xs active:scale-95 flex items-center gap-1 cursor-pointer"
                            title="Permanently delete broadcast notice"
                          >
                            <span>🗑️</span>
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500">DFY Central Alert Radar</span>
          <button
            onClick={onClose}
            className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs py-2 px-5 rounded-xl transition-colors cursor-pointer"
          >
            Close Studio
          </button>
        </div>
      </div>
    </div>
  );
}
