import re

with open("src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

completed_match = re.search(r'\s*\)\s*:\s*appState\s*===\s*\'completed\'\s*\?\s*\(', text)
if completed_match:
    print("Found completed at:", completed_match.start())
else:
    print("Completed not found!")
