import re

with open("src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

# Replace definition
text = re.sub(
    r'const IdBucket = \(\{ title, ids(?: = \[\])?, onAdd, onRemove, showToast \}\) => \{(\s*)const \[currentId, setCurrentId\] = useState\(""\);',
    r'const IdBucket = ({ title, ids, onAdd, onRemove, showToast }) => {\1const [currentId, setCurrentId] = useState("");\1const safeIds = Array.isArray(ids) ? ids : [];',
    text
)

# In the IdBucket component body (we can't just replace globally because of other `ids.length` in WhatsApp generator), 
# so let's extract the IdBucket block, modify it, and put it back.
start_idx = text.find("const IdBucket =")
end_idx = text.find("// --- Generate WhatsApp Text ---", start_idx)

if start_idx != -1 and end_idx != -1:
    bucket_block = text[start_idx:end_idx]
    bucket_block = bucket_block.replace("ids.length", "safeIds.length")
    bucket_block = bucket_block.replace("ids.map", "safeIds.map")
    text = text[:start_idx] + bucket_block + text[end_idx:]
    print("SUCCESS")
else:
    print("FAILED")

with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.write(text)

