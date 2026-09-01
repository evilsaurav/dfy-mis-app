const fs = require('fs');
let content = fs.readFileSync('dfy-frontend/src/App.jsx', 'utf8');

// 1. Add to initialState
const initialStateRegex = /documents_ids: \[\],\s*fdc_provided_ids: \[\],\s*kit_consumption_ids: \[\],/;
const newInitialState = `documents_ids: [],
    fdc_provided_ids: [],
    kit_consumption_ids: [],
    differentiated_tb_ids: [],
    tpt_treatment_start_ids: [],
    tpt_presumptive_ids: [],
    adhar_face_authentication_ids: [],
    consent_with_id_ids: [],
    remark: "",`;
content = content.replace(initialStateRegex, newInitialState);

// 2. Add group5
const group4Regex = /const group4 = \[\s*\{ key: "documents_ids".*?\s*\{ key: "fdc_provided_ids".*?\s*\{ key: "kit_consumption_ids".*?\s*\];/s;
const group5 = `const group5 = [
    { key: "differentiated_tb_ids", label: "Differentiated TB" },
    { key: "tpt_treatment_start_ids", label: "TPT Treatment Start" },
    { key: "tpt_presumptive_ids", label: "TPT Presumptive" },
    { key: "adhar_face_authentication_ids", label: "Adhar Face Auth" },
    { key: "consent_with_id_ids", label: "Consent with ID" }
  ];`;
content = content.replace(group4Regex, match => match + '\n  ' + group5);

// 3. Add Accordions
const accordionRegex = /<Accordion title="4\. Logistics & Outcomes">\s*\{group4\.map\(\(cat\) => \(\s*<IdBucket key=\{cat\.key\} title=\{cat\.label\} ids=\{formData\[cat\.key\]\} onAdd=\{\(id\) => addId\(cat\.key, id\)\} onRemove=\{\(idx\) => removeId\(cat\.key, idx\)\} showToast=\{showToast\} \/>\s*\)\)\}\s*<\/Accordion>/s;
const newAccordions = `<Accordion title="4. Logistics & Outcomes">
                  {group4.map((cat) => (
                    <IdBucket key={cat.key} title={cat.label} ids={formData[cat.key]} onAdd={(id) => addId(cat.key, id)} onRemove={(idx) => removeId(cat.key, idx)} showToast={showToast} />
                  ))}
                </Accordion>

                <Accordion title="5. Special Tracking">
                  {group5.map((cat) => (
                    <IdBucket key={cat.key} title={cat.label} ids={formData[cat.key] || []} onAdd={(id) => addId(cat.key, id)} onRemove={(idx) => removeId(cat.key, idx)} showToast={showToast} />
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
                </Accordion>`;
content = content.replace(accordionRegex, newAccordions);

// 4. Update generateWhatsAppText
const categoriesRegex = /\{ key: 'kit_consumption_ids', label: 'Kit Consumption' \}\s*\];/s;
const newCategories = `{ key: 'kit_consumption_ids', label: 'Kit Consumption' },
      { key: 'differentiated_tb_ids', label: 'Differentiated TB' },
      { key: 'tpt_treatment_start_ids', label: 'TPT Treatment Start' },
      { key: 'tpt_presumptive_ids', label: 'TPT Presumptive' },
      { key: 'adhar_face_authentication_ids', label: 'Adhar Face Auth' },
      { key: 'consent_with_id_ids', label: 'Consent with ID' }
    ];`;
content = content.replace(categoriesRegex, newCategories);

const textNoneRegex = /if \(!hasMetrics\) \{\s*text \+= 'None\\n';\s*\}/s;
const textNoneReplace = `if (!hasMetrics) {
      text += 'None\\n';
    }

    if (formData.remark && formData.remark.trim() !== '') {
      text += '\\n*?? Remarks:*\\n' + formData.remark.trim() + '\\n';
    }`;
content = content.replace(textNoneRegex, textNoneReplace);

fs.writeFileSync('dfy-frontend/src/App.jsx', content);
