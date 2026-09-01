import re

with open("src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

categories_match = re.search(r'const categories = \[(.*?)\];', text, re.DOTALL)
if categories_match:
    cat_block = categories_match.group(1)
    keys = re.findall(r'key:\s*["\'](.*?)["\']', cat_block)
    print("CATEGORIES KEYS:", keys)

form_data_match = re.search(r'const \[formData, setFormData\] = useState\(\{(.*?)\}\);', text, re.DOTALL)
if form_data_match:
    fd_block = form_data_match.group(1)
    fd_keys = re.findall(r'([a-zA-Z0-9_]+):', fd_block)
    print("FORM DATA KEYS:", fd_keys)
    
    missing = set(keys) - set(fd_keys)
    print("MISSING KEYS:", missing)
