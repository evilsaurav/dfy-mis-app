import re

with open('dfy-frontend/src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = r'''  useEffect\(\(\) => \{\s*const API_BASE_URL = import\.meta\.env\.VITE_API_URL \|\| "https://dfy-mis-app\.onrender\.com";\s*fetch\(`\$\{API_BASE_URL\}/get-directory`\)\s*\.then\(res => res\.json\(\)\)\s*\.then\(data => \{\s*if\(Object\.keys\(data\)\.length > 0\)\{\s*setDirectory\(data\);\s*setDistricts\(Object\.keys\(data\)\);\s*\}\s*\}\)\.catch\(\(\) => \{\}\);\s*\}, \[\]\);'''

new_content = re.sub(pattern, "", content, flags=re.DOTALL)

if new_content == content:
    print("WARNING: Could not find block to remove in App.jsx")
else:
    with open('dfy-frontend/src/App.jsx', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Successfully removed old useEffect in App.jsx")
