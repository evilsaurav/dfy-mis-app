import re

with open("main.py", "r", encoding="utf-8") as f:
    text = f.read()

# Update DailyActivityReport model
text = re.sub(r'    morning_km:\s*Optional\[str\]\s*=\s*None\n', '', text)
text = re.sub(r'    evening_km:\s*Optional\[str\]\s*=\s*None\n', '', text)
text = re.sub(r'    total_km:\s*Optional\[int\]\s*=\s*0\n', '', text)
text = re.sub(r'    morning_km_photo_url:\s*Optional\[str\]\s*=\s*None\n', '', text)
text = re.sub(r'    evening_km_photo_url:\s*Optional\[str\]\s*=\s*None\n', '', text)

# Delete /start-day endpoint completely
start_day = text.find('@app.post("/start-day")')
if start_day != -1:
    end_day = text.find('@app.post("/submit-daily-report")')
    text = text[:start_day] + text[end_day:]

# In /submit-daily-report, remove references to KM validation
# `if not data.morning_km:`
idx_val = text.find('if not data.morning_km:')
if idx_val != -1:
    idx_end = text.find('    status_update = ', idx_val)
    text = text[:idx_val] + text[idx_end:]


with open("main.py", "w", encoding="utf-8") as f:
    f.write(text)

