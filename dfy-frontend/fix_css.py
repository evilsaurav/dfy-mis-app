with open("src/index.css", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace(
    'from { opacity: 0; transform: translate(-50%, -20px); }',
    'from { opacity: 0; transform: translateY(-20px); }'
)
text = text.replace(
    'to { opacity: 1; transform: translate(-50%, 0); }',
    'to { opacity: 1; transform: translateY(0); }'
)

with open("src/index.css", "w", encoding="utf-8") as f:
    f.write(text)

