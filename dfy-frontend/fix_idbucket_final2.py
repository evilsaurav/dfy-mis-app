with open("src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

start_marker = "const IdBucket = "
end_marker = "// --- Admin Dashboard ---"

start_idx = text.find(start_marker)
end_idx = text.find(end_marker, start_idx)

if start_idx != -1 and end_idx != -1:
    bucket_block = text[start_idx:end_idx]
    bucket_block = bucket_block.replace("ids.length", "safeIds.length")
    bucket_block = bucket_block.replace("ids.map", "safeIds.map")
    
    text = text[:start_idx] + bucket_block + text[end_idx:]
    print("REPLACED")
else:
    print("FAILED")

with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.write(text)

