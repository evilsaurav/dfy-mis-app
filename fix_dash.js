const fs = require('fs');
let content = fs.readFileSync('dfy-frontend/src/AdminDashboard.jsx', 'utf8');

// 1. Update aggregate
content = content.replace(
  'documents: 0, fdc_provided: 0, kit_consumption: 0, overrides: 0',
  'documents: 0, fdc_provided: 0, kit_consumption: 0, overrides: 0, differentiated_tb: 0, tpt_treatment_start: 0, tpt_presumptive: 0, adhar_face_auth: 0, consent_with_id: 0'
);

// 2. Add TH tags
content = content.replace(
  '<TH label="Kits" sortKey="kit_consumption" />',
  `<TH label="Kits" sortKey="kit_consumption" />
                      <TH label="Diff TB" sortKey="differentiated_tb" />
                      <TH label="TPT Start" sortKey="tpt_treatment_start" />
                      <TH label="TPT Presumptive" sortKey="tpt_presumptive" />
                      <TH label="Adhar Auth" sortKey="adhar_face_auth" />
                      <TH label="Consent" sortKey="consent_with_id" />`
);

// 3. Add td tags
content = content.replace(
  '<td className="p-3">{row.kit_consumption}</td>',
  `<td className="p-3">{row.kit_consumption}</td>
                          <td className="p-3 font-bold text-pink-600">{row.differentiated_tb}</td>
                          <td className="p-3 font-bold text-teal-600">{row.tpt_treatment_start}</td>
                          <td className="p-3 font-bold text-cyan-600">{row.tpt_presumptive}</td>
                          <td className="p-3 font-bold text-orange-600">{row.adhar_face_auth}</td>
                          <td className="p-3 font-bold text-indigo-400">{row.consent_with_id}</td>`
);

fs.writeFileSync('dfy-frontend/src/AdminDashboard.jsx', content);
