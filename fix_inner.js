const fs = require('fs');
let content = fs.readFileSync('dfy-frontend/src/AdminDashboard.jsx', 'utf8');

content = content.replace(
  'max-w-2xl mx-auto w-full">',
  'max-w-3xl mx-auto w-full mt-4">'
);

fs.writeFileSync('dfy-frontend/src/AdminDashboard.jsx', content);
