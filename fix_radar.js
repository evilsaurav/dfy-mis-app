const fs = require('fs');
let content = fs.readFileSync('dfy-frontend/src/AdminDashboard.jsx', 'utf8');

const oldRadar = `{ subject: 'Presumptive', A: totals.presumptive, fullMark: 150 }`;
const newRadar = `{ subject: 'Presumptive', A: totals.presumptive, fullMark: 150 },
        { subject: 'Special Tracking', A: totals.differentiated_tb + totals.tpt_treatment_start + totals.tpt_presumptive + totals.adhar_face_auth + totals.consent_with_id, fullMark: 150 }`;

content = content.replace(oldRadar, newRadar);
fs.writeFileSync('dfy-frontend/src/AdminDashboard.jsx', content);
