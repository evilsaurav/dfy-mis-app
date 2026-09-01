with open("src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

import re
text = re.sub(r'(\s*onAddMultiple=\{.*?\}\s*)+', ' onAddMultiple={(ids) => addMultipleIds(cat.key, ids)} ', text)

with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.write(text)

