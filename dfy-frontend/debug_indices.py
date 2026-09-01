with open("src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')
start_completed = text.find("                ) : appState === 'completed' ? (")
start_main_dash = text.find('          ) : (\n')
if start_main_dash == -1:
    start_main_dash = text.find('          ) : (')

end_main_dash = text.rfind('        )}\n      </main>')
if end_main_dash == -1:
    end_main_dash = text.rfind('      </main>')
    end_main_dash = text.rfind(')}', 0, end_main_dash)

print("start_completed:", start_completed)
print("start_main_dash:", start_main_dash)
print("end_main_dash:", end_main_dash)
