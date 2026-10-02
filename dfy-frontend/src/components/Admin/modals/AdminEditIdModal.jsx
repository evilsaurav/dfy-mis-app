import React from 'react';

export default function AdminEditIdModal({
  adminEditModal,
  setAdminEditModal,
  handleAdminExecuteIdEdit
}) {
  if (!adminEditModal) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl border border-slate-100 animate-fade-in">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  {adminEditModal.action === 'replace' ? '✏️ Correct Patient ID' : adminEditModal.action === 'delete' ? '🗑️ Remove Patient ID' : '➕ Add Missing Patient ID'}
                </h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                  {adminEditModal.fo_name} ({adminEditModal.district}) &bull; {adminEditModal.date}
                </p>
              </div>
              <button onClick={() => setAdminEditModal(null)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none">&times;</button>
            </div>

            <form onSubmit={handleAdminExecuteIdEdit} className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs font-bold text-slate-600">
                <span className="text-slate-400 text-[10px] uppercase block mb-0.5">Category:</span>
                {adminEditModal.category.replace('_ids', '').replace(/_/g, ' ').toUpperCase()}
              </div>

              {adminEditModal.action === 'delete' ? (
                <div className="p-4 bg-red-50 rounded-2xl border border-red-100 text-center space-y-1">
                  <p className="text-xs font-bold text-red-800">
                    Kya aap sach me ID <strong className="font-mono text-sm">{adminEditModal.oldId}</strong> ko report se hatana chahte hain?
                  </p>
                  <p className="text-[10px] text-red-500">Yeh action database aur KPI calculation ko turant update karega.</p>
                </div>
              ) : (
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1.5">
                    {adminEditModal.action === 'replace' ? `Replace ID #${adminEditModal.oldId} With:` : 'Enter 9-Digit Patient ID:'}
                  </label>
                  <input
                    type="text"
                    maxLength={9}
                    value={adminEditModal.newId}
                    onChange={(e) => setAdminEditModal(prev => ({ ...prev, newId: e.target.value.replace(/\D/g, '') }))}
                    placeholder="e.g. 332882518"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 font-mono text-sm font-black text-slate-800 tracking-wider outline-none focus:ring-2 focus:ring-indigo-500"
                    autoFocus
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Must be exactly 9 digits (numbers only).</p>
                </div>
              )}

              {adminEditModal.error && (
                <p className="text-red-500 text-xs font-bold bg-red-50 p-2.5 rounded-xl border border-red-100">{adminEditModal.error}</p>
              )}

              <div className="pt-2 flex items-center justify-end gap-3">
                <button type="button" onClick={() => setAdminEditModal(null)} className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
                <button
                  type="submit"
                  disabled={adminEditModal.loading}
                  className={`px-5 py-2.5 rounded-xl text-xs font-black text-white shadow-md active:scale-95 transition-all ${adminEditModal.action === 'delete' ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20'}`}
                >
                  {adminEditModal.loading ? 'Saving...' : adminEditModal.action === 'delete' ? 'Confirm Delete' : 'Save ID'}
                </button>
              </div>
            </form>
          </div>
        </div>
  );
}
