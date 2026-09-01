with open("src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('            </div>\n\n      </main>', '            </div>\n        )}\n      </main>')

with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.write(text)

