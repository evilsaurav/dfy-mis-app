import React from 'react';

export default function UnreadBroadcastPopupModal({
  unreadBroadcastPopup,
  dismissBroadcastPopup
}) {
  if (!unreadBroadcastPopup) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[110] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-100 w-full max-w-lg animate-scale-up">
        <div className={`p-6 text-white ${
          unreadBroadcastPopup.priority === 'HIGH' ? 'bg-gradient-to-r from-rose-600 to-red-600' :
          unreadBroadcastPopup.priority === 'MEDIUM' ? 'bg-gradient-to-r from-amber-500 to-orange-600' :
          'bg-gradient-to-r from-indigo-600 to-purple-600'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-3xl">
              {unreadBroadcastPopup.priority === 'HIGH' ? '🚨' : unreadBroadcastPopup.priority === 'MEDIUM' ? '⚠️' : '📢'}
            </span>
            <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm border border-white/20 text-white">
              {unreadBroadcastPopup.priority || 'MEDIUM'} PRIORITY
            </span>
          </div>
          <h3 className="text-xl font-black mt-3 leading-tight tracking-tight">
            {unreadBroadcastPopup.title}
          </h3>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-white/90">
            <span>👤 {unreadBroadcastPopup.created_by_user}</span>
            <span>&bull;</span>
            <span>🎯 {unreadBroadcastPopup.target_audience === 'FIELD_STAFF' ? 'Field Staff' : unreadBroadcastPopup.target_audience === 'SUB_ADMINS' ? 'Sub-Admins' : 'All Teams'}</span>
            <span>&bull;</span>
            <span>📍 {unreadBroadcastPopup.target_districts?.includes('All') ? 'Statewide' : unreadBroadcastPopup.target_districts?.join(', ')}</span>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-sm text-slate-800 font-medium leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap">
            {unreadBroadcastPopup.message}
          </div>

          <div className="pt-2 flex items-center justify-end">
            <button
              onClick={() => dismissBroadcastPopup(unreadBroadcastPopup.id)}
              className={`w-full py-3.5 rounded-xl font-black text-sm text-white shadow-lg active:scale-95 transition-all uppercase tracking-wider cursor-pointer ${
                unreadBroadcastPopup.priority === 'HIGH' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/30' :
                unreadBroadcastPopup.priority === 'MEDIUM' ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/30' :
                'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/30'
              }`}
            >
              ✓ Acknowledge &amp; Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
