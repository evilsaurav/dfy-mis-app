import React from 'react';

export default function SecurityModal({
  isOpen,
  onClose,
  handleUpdatePassword,
  changeCurrentPw,
  setChangeCurrentPw,
  changeNewPw,
  setChangeNewPw,
  securityStatusMsg,
  isSavingSecurity
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-lg shadow-2xl border border-slate-100 animate-fade-in">
        <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
          <div>
            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <span>⚙️</span> Admin Security & Password Settings
            </h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Credential Management & Password Security</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none cursor-pointer">&times;</button>
        </div>

        {/* Change Password Form */}
        <form onSubmit={handleUpdatePassword} className="space-y-3">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">Change Master Password</h4>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Current Password</label>
            <input
              type="password"
              value={changeCurrentPw}
              onChange={(e) => setChangeCurrentPw(e.target.value)}
              placeholder="Enter current password"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">New Password</label>
            <input
              type="password"
              value={changeNewPw}
              onChange={(e) => setChangeNewPw(e.target.value)}
              placeholder="Enter new password"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {securityStatusMsg && (
            <p className={`text-xs font-bold p-2.5 rounded-xl border ${securityStatusMsg.includes('✓') ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
              {securityStatusMsg}
            </p>
          )}

          <div className="pt-3 flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer">Close</button>
            <button
              type="submit"
              disabled={isSavingSecurity}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSavingSecurity ? 'Saving...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
