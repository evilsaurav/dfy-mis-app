import React from 'react';

export default function DeleteDayReportModal({
  deleteDayModal,
  setDeleteDayModal,
  handleExecuteDeleteDay
}) {
  if (!deleteDayModal || !deleteDayModal.isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-7 w-full max-w-md shadow-2xl border border-slate-100 animate-fade-in">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center text-xl font-black shrink-0">
                🗑️
              </div>
              <div>
                <h3 className="text-base font-black text-slate-800">Delete Day Report?</h3>
                <p className="text-[11px] text-slate-400 font-bold uppercase">{deleteDayModal.fo_name} &bull; {deleteDayModal.district}</p>
              </div>
            </div>
            
            <div className="bg-red-50/70 border border-red-200 rounded-2xl p-4 text-xs text-red-900 mb-4 space-y-2">
              <p className="font-bold">
                Kya aap sach me <span className="underline font-mono">{deleteDayModal.date}</span> ka poora report data delete karna chahte hain?
              </p>
              <p className="text-[11px] text-red-700 leading-relaxed">
                Is din ke sabhi <strong>{deleteDayModal.dayIdsCount} Patient IDs</strong> aur travel record ({deleteDayModal.km || 0} KM) permanently delete ho jayenge aur attendance absent mark ho jayegi. Yeh action undo nahi ho sakta.
              </p>
            </div>

            {deleteDayModal.error && (
              <p className="text-red-500 text-xs font-bold bg-red-50 p-2.5 rounded-xl border border-red-100 mb-3">{deleteDayModal.error}</p>
            )}

            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteDayModal(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteDayModal.loading}
                onClick={handleExecuteDeleteDay}
                className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-red-600 hover:bg-red-700 shadow-md shadow-red-600/20 active:scale-95 transition-all cursor-pointer"
              >
                {deleteDayModal.loading ? "Deleting..." : "Yes, Delete Entire Day"}
              </button>
            </div>
          </div>
        </div>
  );
}
