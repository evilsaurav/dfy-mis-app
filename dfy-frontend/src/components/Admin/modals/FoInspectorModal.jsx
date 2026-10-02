import React, { useState } from 'react';
import { canonicalizeDistrict, canonicalizeFo, isOfficerNameMatch, parseTargetVal } from '../../../utils/districtHelpers';

export default function FoInspectorModal({
  inspectingFO,
  onClose,
  rawRecords = [],
  staffDirectory = {},
  targetsData = [],
  foSearchId,
  setFoSearchId,
  month,
  setEditingRecord,
  setDeleteDayModal,
  selectedDistrict = 'All',
  setFeedDistrict = () => {},
  setFeedFoName = () => {},
  setFeedDate = () => {},
  setFeedCategoryInputs = () => {},
  setFeedRemarks = () => {},
  setFeedError = () => {},
  setFeedSuccess = () => {},
  setShowAdminFeedModal = () => {},
  handleOpenEditDay = () => {},
  setAdminEditModal = () => {}
}) {
  const [copiedFoCategory, setCopiedFoCategory] = useState(null);
  if (!inspectingFO) return null;

        const foRecords = rawRecords.filter(r => {
          if (!r.fo_name || !inspectingFO || !inspectingFO.fo_name) return false;
          const cDist = canonicalizeDistrict(inspectingFO.district || r.working_place);
          const matchName = isOfficerNameMatch(r.fo_name, inspectingFO.fo_name, cDist) ||
            canonicalizeFo(r.fo_name, r.working_place, staffDirectory) === canonicalizeFo(inspectingFO.fo_name, inspectingFO.district, staffDirectory);
          if (!matchName) return false;
          if (!inspectingFO.district || inspectingFO.district === 'All') return true;
          return canonicalizeDistrict(r.working_place) === canonicalizeDistrict(inspectingFO.district);
        }).sort((a, b) => {
          const dateA = String(a.date || a.date_of_reporting || '');
          const dateB = String(b.date || b.date_of_reporting || '');
          return dateB.localeCompare(dateA); // Latest date first (e.g. 2026-09-09 before 2026-09-05)
        });
        const totalNotif = foRecords.reduce((sum, r) => sum + (r.notifications || 0), 0);
        const targetObj = (targetsData || []).find(t => 
          canonicalizeDistrict(t.district) === canonicalizeDistrict(inspectingFO.district) &&
          (isOfficerNameMatch(t.fo_name, inspectingFO.fo_name, inspectingFO.district) ||
           isOfficerNameMatch(canonicalizeFo(t.fo_name, inspectingFO.district, staffDirectory), inspectingFO.fo_name, inspectingFO.district))
        );
        const targetNum = parseTargetVal(targetObj, 0);
        const pct = targetNum > 0 ? Math.min(100, Math.round((totalNotif / targetNum) * 100)) : 0;

        const categoriesConfig = [
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
        ];

        // Filter records by search ID if typed
        const filteredDays = foRecords.filter(rec => {
          if (!foSearchId.trim()) return true;
          const query = foSearchId.trim().toLowerCase();
          return categoriesConfig.some(c => (rec[c.key] || []).some(id => String(id).toLowerCase().includes(query)));
        });

        const copyAllFoIds = () => {
          let msg = `*DFY MIS - Monthly Reported IDs Summary*\n`;
          msg += `Officer: ${inspectingFO.fo_name} (${inspectingFO.district})\n`;
          msg += `Month: ${month} | Total Reports: ${foRecords.length}\n\n`;

          foRecords.forEach(rec => {
            msg += `📅 *Date: ${rec.date}*\n`;
            categoriesConfig.forEach(cat => {
              const ids = rec[cat.key] || [];
              if (ids.length > 0) {
                msg += `  • *${cat.label} (${ids.length}):* ${ids.join(', ')}\n`;
              }
            });
            if (rec.visited_names && rec.visited_names.length > 0) {
              msg += `  • *Doctors/Stores:* ${rec.visited_names.join(', ')}\n`;
            }
            msg += `\n`;
          });

          if (navigator.clipboard) {
            navigator.clipboard.writeText(msg);
            setCopiedFoCategory('ALL');
            setTimeout(() => setCopiedFoCategory(null), 2500);
          }
        };

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-3xl shadow-2xl border border-slate-100 max-h-[88vh] flex flex-col animate-fade-in">
              
              {/* Modal Header */}
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-xl shrink-0">
                    {inspectingFO.fo_name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-800">{inspectingFO.fo_name}</h3>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{inspectingFO.district} District &bull; Month: {month}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`text-xs font-black uppercase px-3 py-1.5 rounded-xl border ${pct >= 100 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                    Target: {pct}% ({totalNotif}/{targetNum})
                  </span>
                  <button onClick={() => { onClose(); }} className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none">&times;</button>
                </div>
              </div>

              {/* Search Bar */}
              <div className="py-3 flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={foSearchId}
                    onChange={(e) => setFoSearchId(e.target.value)}
                    placeholder="Search 9-digit Patient ID in this officer's reports..."
                    className="w-full bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
                  />
                  {foSearchId && (
                    <button onClick={() => setFoSearchId("")} className="absolute right-3 top-2.5 text-xs font-bold text-slate-400 hover:text-slate-600">&times;</button>
                  )}
                </div>
                <button
                  onClick={copyAllFoIds}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs px-3.5 py-2.5 rounded-xl transition-all shrink-0 active:scale-95"
                >
                  {copiedFoCategory === 'ALL' ? '✓ Copied All!' : 'Copy All IDs'}
                </button>
                <button
                  onClick={() => {
                    const foDist = (inspectingFO.district && inspectingFO.district !== 'All') 
                      ? inspectingFO.district 
                      : (foRecords[0]?.working_place || (selectedDistrict !== 'All' ? selectedDistrict : ''));
                    setFeedDistrict(foDist);
                    setFeedFoName(inspectingFO.fo_name);
                    setFeedDate(new Date().toISOString().slice(0, 10));
                    setFeedCategoryInputs({});
                    setFeedRemarks(`Direct feed for ${inspectingFO.fo_name}`);
                    setFeedError('');
                    setFeedSuccess('');
                    setShowAdminFeedModal(true);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl transition-all shrink-0 active:scale-95 flex items-center gap-1 shadow-xs"
                  title="Feed / backfill date report for this Field Officer"
                >
                  <span>➕</span> Feed Date Data
                </button>
              </div>

              {/* Dates & Submitted IDs Accordion */}
              <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1 my-2">
                {filteredDays.length > 0 ? (
                  filteredDays.map((rec, rIdx) => {
                    const dayIdsCount = categoriesConfig.reduce((sum, c) => sum + (rec[c.key] || []).length, 0);
                    return (
                      <div key={rIdx} className="bg-slate-50/80 rounded-2xl border border-slate-100 p-4 space-y-3">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                          <span className="text-xs font-black text-slate-800 flex items-center gap-2">
                            <span>📅</span> {rec.date}
                            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">{dayIdsCount} IDs</span>
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400">{rec.total_km} KM Travelled</span>
                            <button
                              type="button"
                              onClick={() => handleOpenEditDay(rec)}
                              className="text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/70 px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 active:scale-95 cursor-pointer ml-1"
                              title={`Edit entire day report for ${rec.date}`}
                            >
                              <span>✏️</span> Edit Day
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteDayModal({
                                isOpen: true,
                                district: rec.working_place || inspectingFO.district,
                                fo_name: inspectingFO.fo_name,
                                date: rec.date,
                                dayIdsCount: dayIdsCount,
                                km: rec.total_km || 0,
                                loading: false,
                                error: ""
                              })}
                              className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200/60 px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 active:scale-95 cursor-pointer ml-1"
                              title={`Delete entire day report for ${rec.date}`}
                            >
                              <span>🗑️</span> Delete Day
                            </button>
                          </div>
                        </div>

                        {rec.visited_names && rec.visited_names.length > 0 && (
                          <div className="text-[11px] font-medium text-slate-600 bg-white p-2 rounded-xl border border-slate-100">
                            <span className="font-bold text-slate-400 uppercase text-[9px] block">Doctors / Stores:</span>
                            {rec.visited_names.join(', ')}
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {categoriesConfig.map(cat => {
                            const ids = rec[cat.key] || [];
                            if (ids.length === 0) return null;
                            return (
                              <div key={cat.key} className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm">
                                <div className="flex justify-between items-center mb-1.5">
                                  <span className="text-[10px] font-black uppercase text-slate-500">{cat.label} ({ids.length})</span>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => setAdminEditModal({ fo_name: inspectingFO.fo_name, district: rec.working_place || inspectingFO.district, date: rec.date, category: cat.key, action: 'add', oldId: '', newId: '', error: '' })}
                                      className="text-[9px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded"
                                      title="Add missing ID"
                                    >
                                      + Add ID
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (navigator.clipboard) {
                                          navigator.clipboard.writeText(ids.join('\n'));
                                          setCopiedFoCategory(`${rec.date}_${cat.key}`);
                                          setTimeout(() => setCopiedFoCategory(null), 2000);
                                        }
                                      }}
                                      className="text-[9px] font-bold text-indigo-600 hover:text-indigo-800"
                                    >
                                      {copiedFoCategory === `${rec.date}_${cat.key}` ? '✓ Copied' : 'Copy'}
                                    </button>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto custom-scrollbar">
                                  {ids.map((id, idIdx) => {
                                    const fdcItem = cat.key === 'fdc_provided_ids' && Array.isArray(rec.fdc_details) ? rec.fdc_details.find(d => d && d.id === id) : null;
                                    return (
                                      <div key={idIdx} className={`inline-flex items-center gap-1 font-mono text-[11px] font-bold px-1.5 py-0.5 rounded border ${foSearchId && String(id).includes(foSearchId) ? 'bg-amber-100 border-amber-300 text-amber-900 ring-2 ring-amber-400' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                                        <span>{id}</span>
                                        {fdcItem && (
                                          <span className="font-sans text-[8px] font-black text-emerald-700 bg-emerald-50 px-1 rounded border border-emerald-200">
                                            {fdcItem.fdc_type || 'FDC 4'} &bull; {fdcItem.strips || 1}S
                                          </span>
                                        )}
                                        <button
                                          onClick={() => setAdminEditModal({ fo_name: inspectingFO.fo_name, district: rec.working_place || inspectingFO.district, date: rec.date, category: cat.key, action: 'replace', oldId: id, newId: id, error: '' })}
                                          className="text-slate-400 hover:text-indigo-600 text-[9px]"
                                          title="Edit / Correct ID"
                                        >
                                          ✏️
                                        </button>
                                        <button
                                          onClick={() => setAdminEditModal({ fo_name: inspectingFO.fo_name, district: rec.working_place || inspectingFO.district, date: rec.date, category: cat.key, action: 'delete', oldId: id, newId: '', error: '' })}
                                          className="text-slate-400 hover:text-red-500 text-[9px]"
                                          title="Delete ID"
                                        >
                                          🗑️
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-12 text-slate-400 font-bold text-xs">
                    {foSearchId ? `Koi matching ID "${foSearchId}" nahi mili.` : "Is officer ka is mahine me koi report data nahi hai."}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="pt-3 border-t border-slate-100 flex justify-end">
                <button onClick={() => { onClose(); }} className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2.5 px-6 rounded-xl transition-all">Close</button>
              </div>

            </div>
          </div>
        );
}
