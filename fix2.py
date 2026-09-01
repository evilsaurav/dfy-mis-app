import re

with open('dfy-frontend/src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('fetch(${API_BASE_URL}/check-today-status', 'fetch(`${API_BASE_URL}/check-today-status`')
content = content.replace('fetch(${API_BASE_URL}/start-day', 'fetch(`${API_BASE_URL}/start-day`')
content = content.replace('fetch(${API_BASE_URL}/submit-daily-report', 'fetch(`${API_BASE_URL}/submit-daily-report`')
content = content.replace('fetch(${API_BASE_URL}/get-directory)', 'fetch(`${API_BASE_URL}/get-directory`)')

with open('dfy-frontend/src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
