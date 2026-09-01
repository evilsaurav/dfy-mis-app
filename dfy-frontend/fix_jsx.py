with open("src/App.jsx", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("              )}\n\n              {/* Spacer for Sticky Footer */}", "\n              {/* Spacer for Sticky Footer */}")

with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.write(content)
