import re

with open("src/App.jsx", "r", encoding="utf-8") as f:
    content = f.read()

# Force replace the giant conditional using a regex
content = re.sub(r'\s*\)\s*:\s*appState\s*===\s*\'completed\'\s*\?\s*\(\s*<div.*?Copy for WhatsApp\s*</button>\s*</div>\s*\)\s*:\s*\(\s*/\*\s*Main Dashboard\s*\*/\s*<div className="animate-fade-in w-full max-w-md mx-auto overflow-x-hidden">\s*\{appState === \'pending_previous\' && \(\s*<div className="bg-red-50.*?</div>\s*\)\}', r''' ) : (
          /* Main Dashboard */
          <div className="animate-fade-in w-full max-w-md mx-auto overflow-x-hidden">''', content, flags=re.DOTALL)


content = re.sub(r'\{\(appState === \'in_progress\' \|\| appState === \'pending_previous\'\) && \(\s*<>\n', '', content, flags=re.DOTALL)

content = content.replace('              </>\n            )}\n\n            {/* Travel & Doctors Section */}', '\n            {/* Travel & Doctors Section */}')

with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.write(content)
