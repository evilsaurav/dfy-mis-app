with open("src/App.jsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    if "setIsSubmitting(true);" in line and "let eveningUrl = \"\";" in lines[i+2]:
        skip = True
    if skip and "const group1 = [" in line:
        skip = False
    
    if not skip:
        new_lines.append(line)

with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.writelines(new_lines)
