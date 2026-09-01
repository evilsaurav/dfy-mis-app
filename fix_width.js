const fs = require('fs');
let content = fs.readFileSync('dfy-frontend/src/AdminDashboard.jsx', 'utf8');

content = content.replace(
  'mb-8 animate-fade-in-down mx-auto max-w-4xl border border-indigo-400/30"',
  'mb-8 animate-fade-in-down mx-auto w-full max-w-4xl border border-indigo-400/30"'
);

fs.writeFileSync('dfy-frontend/src/AdminDashboard.jsx', content);
