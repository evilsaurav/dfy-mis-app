with open("src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace(
    'className={`max-w-4xl mx-auto px-4 sm:px-6 w-full flex-1 flex flex-col ${!isLoggedIn ? "justify-center py-10" : "py-6"}`}',
    'className={`max-w-4xl mx-auto px-4 sm:px-6 w-full flex-1 flex flex-col ${!isLoggedIn ? "items-center justify-center py-10" : "py-6"}`}'
)

with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.write(text)

