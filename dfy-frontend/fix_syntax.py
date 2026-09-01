import re

with open("src/App.jsx", "r", encoding="utf-8") as f:
    content = f.read()

pattern = r'const API_BASE_URL = import\.meta\.env\.VITE_API_URL.*?// Submit Final Report'
content = re.sub(pattern, '', content, flags=re.DOTALL)

with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.write(content)
