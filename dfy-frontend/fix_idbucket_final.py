with open("src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

# Replace within the IdBucket function block
start_idx = text.find("const IdBucket =")
end_idx = text.find("};", start_idx) + 2

if start_idx != -1:
    bucket_block = text[start_idx:end_idx]
    bucket_block = bucket_block.replace("ids.length", "safeIds.length")
    bucket_block = bucket_block.replace("ids.map", "safeIds.map")
    
    text = text[:start_idx] + bucket_block + text[end_idx:]
    print("REPLACED")
else:
    print("FAILED")

with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.write(text)

