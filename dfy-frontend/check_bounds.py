with open("src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

start_main_dash = text.find('          ) : (\n                      /* Main Dashboard */')
end_main_dash = text.rfind('        )}\n      </main>')
print(start_main_dash, end_main_dash)
