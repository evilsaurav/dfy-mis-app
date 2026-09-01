import re

with open("src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

start_match = re.search(r'\s*\)\s*:\s*\(\s*/\*\s*Main Dashboard\s*\*/', text)
if start_match:
    print("Found start at:", start_match.start())
else:
    print("Start not found!")

end_match = re.search(r'\s*</main>', text)
if end_match:
    print("Found end at:", end_match.start())
else:
    print("End not found!")

