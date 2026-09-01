with open("src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

start_main_dash = text.find('          ) : (\n')
if start_main_dash == -1:
    start_main_dash = text.find('          ) : (')

end_main_dash = text.rfind('        )}\n      </main>')
if end_main_dash == -1:
    end_main_dash = text.rfind('      </main>')
    end_main_dash = text.rfind(')}', 0, end_main_dash)

print(start_main_dash, end_main_dash)
