import re

with open('dfy-frontend/src/AdminDashboard.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = r'''<button onClick=\{\(\) => \{\s*const API_BASE_URL = import\.meta\.env\.VITE_API_URL \|\| "https://dfy-mis-app\.onrender\.com";\s*window\.open\(API_BASE_URL \+ "/download-excel", "_blank"\);\s*\}\} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 transition-colors shadow-sm flex items-center gap-2">\s*<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2\.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>\s*Excel\s*</button>'''

replacement = r'''<button onClick={() => {
                  const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
                  window.open(API_BASE_URL + "/download-excel", "_blank");
                }} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 transition-colors shadow-sm flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  Raw Excel
                </button>
                <button onClick={() => {
                  if (selectedDistrict === 'All') {
                    alert('Please select a specific District from the dropdown to download its KPI Workbook.');
                    return;
                  }
                  const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
                  window.open(API_BASE_URL + "/download-kpi-workbook?district=" + selectedDistrict, "_blank");
                }} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                  KPI Master
                </button>'''

new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)
if new_content == content:
    print("WARNING: Replacement failed!")
else:
    print("Replacement successful!")
    with open('dfy-frontend/src/AdminDashboard.jsx', 'w', encoding='utf-8') as f:
        f.write(new_content)
