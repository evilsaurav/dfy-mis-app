import re

with open('dfy-frontend/src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("showToast(Welcome back, !, 'success');", "showToast(`Welcome back, ${formData.fo_name}!`, 'success');")
content = content.replace('const res = await fetch(`${API_BASE_URL}/check-today-status`,', 'const res = await fetch(`${API_BASE_URL}/check-today-status`,') # Ensure it's correct
with open('dfy-frontend/src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
