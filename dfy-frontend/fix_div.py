with open("src/App.jsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    if i == 569 and line.strip() == "}":
        pass
    if i == 569:
        new_lines.append("          </div>\n        )}\n")
    else:
        new_lines.append(line)

with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.writelines(new_lines)
