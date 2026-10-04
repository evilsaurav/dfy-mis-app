import React from 'react';

export default function BackupModal({
  show,
  onClose,
  backupStatus,
  backupLoading,
  backupActionMsg,
  setBackupActionMsg,
  backupTriggerLoading,
  restoreTargetFile,
  setRestoreTargetFile,
  restoreConfirmText,
  setRestoreConfirmText,
  restoreLoading,
  fetchBackupStatus,
  handleTriggerBackupNow,
  handleDownloadBackup,
  handleExecuteRestore
}) {
  if (!show) return null;

  const handleClose = () => {
    onClose();
    if (setBackupActionMsg) setBackupActionMsg('');
    if (setRestoreTargetFile) setRestoreTargetFile(null);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-slate-100 animate-fade-in">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-indigo-50/80 to-blue-50/80">
          <div className="flex items-center gap-3">
            <span className="text-2xl p-2.5 bg-white rounded-2xl shadow-xs border border-indigo-100">💾</span>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-slate-800 flex items-center gap-2">
                <span>Cloud Database Backups</span>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-emerald-200">Option A: Smart Daily</span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Automated snapshots saved to private Google Cloud Storage (Mumbai, India) with 30-day retention
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-9 h-9 rounded-full bg-white hover:bg-slate-100 text-slate-500 font-bold flex items-center justify-center shadow-xs border border-slate-200 cursor-pointer transition-all"
          >
            &times;
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {/* Today's Backup Status Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Today's Automated Backup</span>
              <div className="flex items-center gap-2 pt-1">
                {backupStatus?.today_backup_exists ? (
                  <>
                    <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-sm font-black text-emerald-700">✓ Up-to-Date &amp; Active</span>
                  </>
                ) : (
                  <>
                    <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                    <span className="text-sm font-black text-amber-700">Pending Daily Run</span>
                  </>
                )}
              </div>
              <p className="text-[11px] text-slate-500 font-mono pt-1">
                {backupStatus?.today_backup_filename || "Will auto-generate on first sync"}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Cloud Storage Bucket</span>
              <div className="text-sm font-black text-indigo-900 pt-1 flex items-center gap-1.5">
                <span>🇮🇳</span>
                <span>Mumbai, India</span>
              </div>
              <p className="text-[11px] text-slate-500 font-mono truncate pt-1" title={backupStatus?.bucket_name}>
                gs://{backupStatus?.bucket_name || "dfy-mis-backups-2026"}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Retention &amp; Cost</span>
              <div className="text-sm font-black text-slate-800 pt-1">
                30 Days Retention
              </div>
              <p className="text-[11px] text-emerald-600 font-bold pt-1">
                100% Free Tier (~32 KB/day)
              </p>
            </div>
          </div>

          {/* Action Banner / Message */}
          {backupActionMsg && (
            <div className="bg-indigo-50/80 border border-indigo-200 text-indigo-900 text-xs font-bold p-3 rounded-xl flex items-center justify-between">
              <span>{backupActionMsg}</span>
              <button onClick={() => setBackupActionMsg('')} className="text-indigo-500 hover:text-indigo-800">&times;</button>
            </div>
          )}

          {/* Action Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-indigo-50/40 border border-indigo-100 p-4 rounded-2xl">
            <div>
              <h4 className="text-xs font-black text-slate-800">On-Demand Database Snapshot</h4>
              <p className="text-[11px] text-slate-500">Take an immediate full backup of all reports, patients, and staff before major changes.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchBackupStatus}
                disabled={backupLoading}
                className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <span className={backupLoading ? "animate-spin" : ""}>🔄</span>
                <span>Refresh</span>
              </button>
              <button
                onClick={handleTriggerBackupNow}
                disabled={backupTriggerLoading}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20 flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <span>{backupTriggerLoading ? "⏳" : "⚡"}</span>
                <span>{backupTriggerLoading ? "Generating Snapshot..." : "Backup Now"}</span>
              </button>
            </div>
          </div>

          {/* Snapshots Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <span>📦</span>
                <span>Available Snapshots in Cloud Storage ({backupStatus?.backups?.length || 0})</span>
              </h3>
              <span className="text-[10px] text-slate-400 font-medium">Auto-pruned after 30 days</span>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="p-3">Snapshot File</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Size</th>
                      <th className="p-3">Documents</th>
                      <th className="p-3">Source</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {backupLoading && (!backupStatus || !backupStatus.backups) ? (
                      <tr>
                        <td colSpan="6" className="p-6 text-center text-slate-400">
                          <span className="animate-spin inline-block mr-2">⏳</span> Loading backups list from Google Cloud Storage...
                        </td>
                      </tr>
                    ) : (backupStatus?.backups || []).length === 0 ? (
                      <tr>
                        <td colSpan="6" className="p-6 text-center text-slate-400 italic">
                          No cloud backups found yet. Click "Backup Now" above to generate the first snapshot!
                        </td>
                      </tr>
                    ) : (
                      (backupStatus.backups || []).map((b, idx) => (
                        <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                          <td className="p-3 font-mono font-bold text-slate-800 flex items-center gap-2">
                            <span className="text-base">🗜️</span>
                            <span>{b.filename}</span>
                          </td>
                          <td className="p-3 text-slate-600 font-mono text-[11px]">{b.date || b.created_at?.slice(0, 10) || "—"}</td>
                          <td className="p-3 font-mono font-bold text-indigo-700">{b.size_kb} KB</td>
                          <td className="p-3 text-slate-600 font-bold">{b.total_documents ? b.total_documents.toLocaleString() : "—"}</td>
                          <td className="p-3">
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${b.source === 'automated_daily' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                              {b.source === 'automated_daily' ? 'Automated Daily' : 'Manual Admin'}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleDownloadBackup(b.filename)}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all shadow-2xs active:scale-95"
                                title="Download compressed backup file (.json.gz) to your PC"
                              >
                                <span>📥</span>
                                <span>Download</span>
                              </button>
                              <button
                                onClick={() => {
                                  setRestoreTargetFile(b.filename);
                                  setRestoreConfirmText('');
                                }}
                                className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                                title="Emergency Disaster Restore"
                              >
                                <span>♻️</span>
                                <span>Restore</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Emergency Restore Drawer / Modal Section */}
          {restoreTargetFile && (
            <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-rose-900 flex items-center gap-1.5">
                  <span>⚠️</span>
                  <span>Disaster Recovery Restore: {restoreTargetFile}</span>
                </h4>
                <button onClick={() => setRestoreTargetFile(null)} className="text-rose-400 hover:text-rose-700 font-bold">&times;</button>
              </div>
              <p className="text-[11px] text-rose-800 font-medium">
                Restoring from this snapshot will safely merge all backed up reports, targets, and staff records back into the live PostgreSQL database.
                To confirm authorization, type <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-rose-300 text-rose-900">RESTORE-CONFIRM</span> below:
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={restoreConfirmText}
                  onChange={(e) => setRestoreConfirmText(e.target.value)}
                  placeholder="Type RESTORE-CONFIRM here..."
                  className="flex-1 bg-white border border-rose-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-rose-900 outline-none focus:ring-2 focus:ring-rose-500"
                />
                <button
                  onClick={handleExecuteRestore}
                  disabled={restoreLoading || restoreConfirmText.trim() !== 'RESTORE-CONFIRM'}
                  className="bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-rose-600/20 cursor-pointer"
                >
                  {restoreLoading ? "Restoring..." : "Execute Restore"}
                </button>
              </div>
            </div>
          )}

          {/* Safety Guarantee Footer Note */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex items-start gap-2.5">
            <span className="text-lg">🛡️</span>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              <strong className="text-slate-700">Enterprise Disaster Protection:</strong> Daily backups are stored in a separate, isolated Google Cloud Storage container with strict access controls. No field report or patient record can be permanently lost.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
