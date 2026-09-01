import os
import re

with open("src/App.jsx", "r", encoding="utf-8") as f:
    code = f.read()

pattern = r'\s*\{/\* Travel Meter \*/\}.*?\{/\* Spacer for Sticky Footer \*/\}'
code = re.sub(pattern, '\n\n              {/* Spacer for Sticky Footer */}', code, flags=re.DOTALL)

with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.write(code)

