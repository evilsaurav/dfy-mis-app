# -*- coding: utf-8 -*-
with open("dfy-frontend/src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

# 1. Add showReviewModal state
state_marker = "  const [showIosInstallModal, setShowIosInstallModal] = useState(false);"
new_state = """  const [showIosInstallModal, setShowIosInstallModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);"""

if state_marker in text:
    text = text.replace(state_marker, new_state)
    print("showReviewModal state added")

# 2. Update submit triggers
old_submit_trigger = """      if(response.ok) {
        try { localStorage.removeItem(`dfy_draft_${formData.working_place}_${formData.fo_name}`); } catch (e) {}
        showToast("? Final Report Submitted Successfully!", "success");
        setTimeout(() => window.location.reload(), 2500);
      }"""

new_submit_trigger = """      if(response.ok) {
        setShowReviewModal(false);
        try { localStorage.removeItem(`dfy_draft_${formData.working_place}_${formData.fo_name}`); } catch (e) {}
        showToast("✓ Final Report Submitted Successfully!", "success");
        setTimeout(() => window.location.reload(), 2500);
      }"""

if old_submit_trigger in text:
    text = text.replace(old_submit_trigger, new_submit_trigger)
    print("submit trigger updated")

# 3. Add Pre-Submission Review Modal right before closing tags
modal_inject_marker = "{/* iOS / Manual Install Modal */}"
review_modal_code = """{/* Pre-Submission Review Modal */}
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
                {isSubmitting ? 'Submitting...' : '✓ Confirm & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      """

if modal_inject_marker in text:
    text = text.replace(modal_inject_marker, review_modal_code + modal_inject_marker)
    print("Pre-submission review modal injected")

# 4. Update the bottom submit button onClick to open review modal
old_btn_submit = 'onClick={submitReport}'
new_btn_submit = 'onClick={() => { if(!formData.working_place || !formData.fo_name || !formData.pin) { showToast("Pehle Zila, Naam aur PIN bharo!", "error"); return; } setShowReviewModal(true); }}'

# Replace bottom submit button
text = text.replace('onClick={submitReport}', new_btn_submit)
print("submitReport replaced with review modal opener")

with open("dfy-frontend/src/App.jsx", "w", encoding="utf-8") as f:
    f.write(text)
