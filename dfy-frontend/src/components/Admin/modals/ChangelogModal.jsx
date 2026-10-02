import React from 'react';
import { CHANGELOG_ENTRIES, APP_VERSION, LAST_UPDATED_DATE } from '../../../changelogData';

export default function ChangelogModal({ show, onClose }) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-3 sm:p-4 overflow-y-auto font-sans">
      <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-3xl shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col animate-fade-in my-auto">
        {/* Header */}
        <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-800 text-white flex items-center justify-center text-xl font-black shadow-md shadow-indigo-600/20 shrink-0">
              🚀
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                DFY MIS Release Changelog
                <span className="text-xs font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  v{APP_VERSION}
                </span>
              </h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                Last deployed: {LAST_UPDATED_DATE} &bull; Live Production Version
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        {/* Releases Timeline */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-6 custom-scrollbar">
          {CHANGELOG_ENTRIES.map((entry, idx) => (
            <div key={entry.version || idx} className="relative pl-6 pb-2 border-l-2 border-indigo-100 last:border-l-0">
              {/* Timeline Dot */}
              <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-indigo-600 border-4 border-white shadow-xs"></div>

              <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/70 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black font-mono bg-indigo-600 text-white px-2.5 py-0.5 rounded-lg">
                      {entry.version}
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      {entry.date}
                    </span>
                  </div>
                  {entry.badge && (
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      entry.badgeColor === 'emerald'
                        ? 'bg-emerald-100 text-emerald-800'
                        : entry.badgeColor === 'rose'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-indigo-100 text-indigo-800'
                    }`}>
                      {entry.badge}
                    </span>
                  )}
                </div>

                <h4 className="text-sm font-black text-slate-800 leading-snug">
                  {entry.title}
                </h4>

                {entry.highlights && entry.highlights.length > 0 && (
                  <ul className="space-y-1.5 text-xs font-medium text-slate-600 bg-white p-3 rounded-xl border border-slate-100">
                    {entry.highlights.map((h, hIdx) => (
                      <li key={hIdx} className="flex items-start gap-1.5">
                        <span className="text-indigo-600 font-bold shrink-0">&bull;</span>
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {entry.details && entry.details.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {entry.details.map((d, dIdx) => (
                      <span 
                        key={dIdx} 
                        className="text-[10px] font-bold text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200/60 shadow-2xs"
                      >
                        <strong className="text-indigo-600 uppercase mr-1">[{d.tag}]</strong>
                        {d.text}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-black text-white bg-slate-800 hover:bg-slate-900 shadow-sm transition-all cursor-pointer"
          >
            Close Changelog
          </button>
        </div>
      </div>
    </div>
  );
}
